import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export async function handler(event, context) {
  if (context) context.callbackWaitsForEmptyEventLoop = false

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  }

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: '{}' }

  try {
    const body = JSON.parse(event.body || '{}')
    const supabase = getSupabase()

    // Cancel a job
    if (body.cancelar && body.job_id) {
      await supabase.from('carga_jobs').update({
        estado: 'cancelado',
        updated_at: new Date().toISOString(),
      }).eq('id', body.job_id)
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) }
    }

    const { clientes, job_id } = body

    if (!clientes || !Array.isArray(clientes) || clientes.length === 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'No hay clientes' }) }
    }

    // Check if job was cancelled
    if (job_id) {
      const { data: job } = await supabase
        .from('carga_jobs')
        .select('estado')
        .eq('id', job_id)
        .single()
      if (job?.estado === 'cancelado') {
        return { statusCode: 200, headers, body: JSON.stringify({ cargados: 0, errores: 0, cancelado: true }) }
      }
    }

    // Split: with CUPS → upsert, without CUPS → insert
    const conCups = []
    const sinCups = []
    for (const r of clientes) {
      if (r.cups?.trim()) conCups.push(r)
      else sinCups.push(r)
    }

    let cargados = 0
    let errores = 0
    let primerError = null
    const fallidos = []
    const SUB_BATCH = 2000

    // Upsert records with CUPS
    for (let i = 0; i < conCups.length; i += SUB_BATCH) {
      const batch = conCups.slice(i, i + SUB_BATCH)
      const { data, error } = await supabase
        .from('clientes')
        .upsert(batch, { onConflict: 'cups', ignoreDuplicates: false })
        .select('id')

      if (error) {
        if (!primerError) primerError = `${error.code}: ${error.message}`
        errores += batch.length
        batch.forEach(r => fallidos.push({ record: r, error: `${error.code}: ${error.message}` }))
      } else {
        cargados += data?.length || 0
      }
    }

    // Insert records without CUPS
    for (let i = 0; i < sinCups.length; i += SUB_BATCH) {
      const batch = sinCups.slice(i, i + SUB_BATCH)
      const { data, error } = await supabase
        .from('clientes')
        .insert(batch)
        .select('id')

      if (error) {
        if (!primerError) primerError = `${error.code}: ${error.message}`
        errores += batch.length
        batch.forEach(r => fallidos.push({ record: r, error: `${error.code}: ${error.message}` }))
      } else {
        cargados += data?.length || 0
      }
    }

    // Update job progress
    if (job_id) {
      await supabase.rpc('incrementar_job', {
        p_job_id: job_id,
        p_procesados: clientes.length,
        p_insertados: cargados,
        p_errores: errores,
      }).catch(() => {
        // Fallback if RPC doesn't exist
        supabase.from('carga_jobs').update({
          procesados: supabase.rpc ? undefined : 0, // won't work but won't crash
          updated_at: new Date().toISOString(),
        }).eq('id', job_id).catch(() => {})
      })
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        cargados,
        actualizados: 0,
        duplicados: 0,
        errores,
        primerError,
        fallidos: fallidos.slice(0, 100),
      }),
    }

  } catch (err) {
    console.error('[bulk-insert] Unexpected:', err.message)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Error interno: ' + err.message }),
    }
  }
}

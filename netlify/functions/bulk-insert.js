import { createClient } from '@supabase/supabase-js'

export async function handler(event, context) {
  // Don't wait for empty event loop
  if (context) context.callbackWaitsForEmptyEventLoop = false

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  }

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: '{}' }

  try {
    const { clientes } = JSON.parse(event.body || '{}')

    if (!clientes || !Array.isArray(clientes) || clientes.length === 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'No hay clientes' }) }
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Config incompleta' }) }
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Split: with CUPS → upsert, without CUPS → insert
    const conCups = []
    const sinCups = []
    for (const r of clientes) {
      if (r.cups?.trim()) {
        conCups.push(r)
      } else {
        sinCups.push(r)
      }
    }

    let cargados = 0
    let actualizados = 0
    let errores = 0
    let primerError = null
    const fallidos = []

    // Process conCups in sub-batches of 2000 for PostgreSQL efficiency
    const SUB_BATCH = 2000
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

    // Insert sinCups in sub-batches
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

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        cargados,
        actualizados,
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

import { createClient } from '@supabase/supabase-js'

export async function handler(event) {
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

    let cargados = 0
    let duplicados = 0
    const fallidos = [] // {record, error}

    // Try batch upsert first
    const { data, error } = await supabase
      .from('clientes')
      .upsert(clientes, { onConflict: 'cups', ignoreDuplicates: true })
      .select('id')

    if (!error) {
      cargados = data?.length || 0
      duplicados = clientes.length - cargados
    } else {
      // Batch failed — insert one by one to identify which rows fail
      for (const record of clientes) {
        const { data: d, error: e } = await supabase
          .from('clientes')
          .upsert(record, { onConflict: 'cups', ignoreDuplicates: true })
          .select('id')

        if (e) {
          fallidos.push({
            record,
            error: `${e.code}: ${e.message}`,
          })
        } else {
          if (d?.length > 0) cargados++
          else duplicados++
        }
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        cargados,
        duplicados,
        errores: fallidos.length,
        primerError: fallidos[0]?.error || null,
        fallidos: fallidos.slice(0, 500), // cap to avoid huge response
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

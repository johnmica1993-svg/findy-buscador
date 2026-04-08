import { createClient } from '@supabase/supabase-js'

// Count non-null, non-empty fields in a record (excluding meta fields)
const META_KEYS = new Set(['id', 'created_at', 'updated_at', 'oficina_id', 'created_by'])
function countFields(record) {
  if (!record) return 0
  let count = 0
  for (const [k, v] of Object.entries(record)) {
    if (META_KEYS.has(k)) continue
    if (k === 'datos_extra' && v) {
      count += Object.keys(v).length
    } else if (v !== null && v !== undefined && v !== '') {
      count++
    }
  }
  return count
}

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
    let actualizados = 0
    let duplicados = 0
    const fallidos = []

    // Process one by one for smart dedup logic
    for (const record of clientes) {
      const cups = record.cups?.trim()

      // No CUPS → always insert
      if (!cups) {
        const { error: e } = await supabase.from('clientes').insert(record)
        if (e) {
          fallidos.push({ record, error: `${e.code}: ${e.message}` })
        } else {
          cargados++
        }
        continue
      }

      // Check if CUPS already exists
      const { data: existing } = await supabase
        .from('clientes')
        .select('*')
        .eq('cups', cups)
        .limit(1)
        .single()

      if (!existing) {
        // CUPS doesn't exist → insert
        const { error: e } = await supabase.from('clientes').insert(record)
        if (e) {
          fallidos.push({ record, error: `${e.code}: ${e.message}` })
        } else {
          cargados++
        }
      } else {
        // CUPS exists → compare field count
        const newCount = countFields(record)
        const existingCount = countFields(existing)

        if (newCount > existingCount) {
          // New record has more data → update
          const { error: e } = await supabase
            .from('clientes')
            .update(record)
            .eq('cups', cups)
          if (e) {
            fallidos.push({ record, error: `update: ${e.code}: ${e.message}` })
          } else {
            actualizados++
          }
        } else {
          // Existing has equal or more data → skip
          duplicados++
        }
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        cargados,
        actualizados,
        duplicados,
        errores: fallidos.length,
        primerError: fallidos[0]?.error || null,
        fallidos: fallidos.slice(0, 500),
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

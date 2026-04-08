import { createClient } from '@supabase/supabase-js'

export async function handler(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers }
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método no permitido' }) }
  }

  try {
    const { query, rol } = JSON.parse(event.body || '{}')

    if (!query || query.trim().length < 2) {
      return { statusCode: 200, headers, body: JSON.stringify({ data: [] }) }
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Config incompleta' }) }
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const trimmed = query.trim()
    const termino = `%${trimmed}%`

    // Normalize phone: strip +34 or 34 prefix
    const telNorm = trimmed.replace(/^\+34/, '').replace(/^34(\d{9})$/, '$1')
    const telTerm = `%${telNorm}%`

    // Build OR conditions
    const conditions = [
      `cups.ilike.${termino}`,
      `dni.ilike.${termino}`,
      `nombre.ilike.${termino}`,
    ]

    // If it looks like a phone number (mostly digits), add phone search
    const isPhone = /^\+?\d[\d\s-]{5,}$/.test(trimmed)
    if (isPhone) {
      // Search in datos_extra JSONB for common phone field names
      // We'll do this via raw SQL since Supabase JS client can't do JSONB text search in .or()
    }

    // First query: standard fields
    let q = supabase
      .from('clientes')
      .select('*')
      .or(conditions.join(','))

    if (rol === 'ADMIN') {
      q = q.limit(50)
    } else {
      q = q.limit(20)
    }

    const { data: results1, error: err1 } = await q

    if (err1) {
      console.error('[search-clients] Query error:', err1.message)
      return { statusCode: 500, headers, body: JSON.stringify({ error: err1.message }) }
    }

    let allResults = results1 || []

    // If phone-like query, also search in datos_extra JSONB
    if (isPhone && telNorm.length >= 6) {
      const { data: results2, error: err2 } = await supabase.rpc('search_by_phone', {
        phone_term: telNorm,
      }).limit(20)

      if (!err2 && results2) {
        // Merge without duplicates
        const existingIds = new Set(allResults.map(r => r.id))
        for (const r of results2) {
          if (!existingIds.has(r.id)) {
            allResults.push(r)
            existingIds.add(r.id)
          }
        }
      } else if (err2) {
        // RPC doesn't exist yet, fallback: search datos_extra as text
        console.log('[search-clients] RPC not available, trying text search')
        const { data: results3 } = await supabase
          .from('clientes')
          .select('*')
          .or(`datos_extra::text.ilike.%${telNorm}%`)
          .limit(20)

        if (results3) {
          const existingIds = new Set(allResults.map(r => r.id))
          for (const r of results3) {
            if (!existingIds.has(r.id)) {
              allResults.push(r)
            }
          }
        }
      }
    }

    return { statusCode: 200, headers, body: JSON.stringify({ data: allResults }) }

  } catch (err) {
    console.error('[search-clients] Unexpected:', err.message)
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) }
  }
}

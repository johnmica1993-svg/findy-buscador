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
    const { termino } = JSON.parse(event.body || '{}')

    if (!termino || termino.trim().length < 2) {
      return { statusCode: 200, headers, body: JSON.stringify([]) }
    }

    const supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    const sinPrefijo = termino.trim()
      .replace(/^\+34/, '')
      .replace(/^0034/, '')
      .replace(/[\s\-().]/g, '')

    // Remove leading 34 only if remaining looks like a 9-digit Spanish phone
    const cleaned = sinPrefijo.replace(/^34(\d{9})$/, '$1')
    const t = `%${cleaned}%`

    // Search main fields
    const { data, error } = await supabase
      .from('clientes')
      .select('*')
      .or(`dni.ilike.${t},cups.ilike.${t},nombre.ilike.${t}`)
      .limit(20)

    if (error) {
      console.error('[search-clients] Query error:', error.message)
      return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) }
    }

    let results = data || []

    // If looks like a phone number and no results from main fields, search datos_extra
    const isPhone = /^\d{6,}$/.test(cleaned)
    if (isPhone || results.length === 0) {
      // Search datos_extra as cast text — service role bypasses RLS
      const { data: extraResults } = await supabase
        .from('clientes')
        .select('*')
        .filter('datos_extra::text', 'ilike', t)
        .limit(20)

      if (extraResults) {
        const existingIds = new Set(results.map(r => r.id))
        for (const r of extraResults) {
          if (!existingIds.has(r.id)) results.push(r)
        }
      }
    }

    return { statusCode: 200, headers, body: JSON.stringify(results) }

  } catch (err) {
    console.error('[search-clients] Unexpected:', err.message)
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) }
  }
}

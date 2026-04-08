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

    // Normalize: strip +34 or leading 34 prefix, remove spaces/dashes
    const sinPrefijo = trimmed
      .replace(/^\+34/, '')
      .replace(/^0034/, '')
      .replace(/^34(\d{9})$/, '$1')
      .replace(/[\s\-().]/g, '')

    // Use the term that gives better results — the cleaned version
    const searchTerm = sinPrefijo || trimmed

    const { data, error } = await supabase.rpc('buscar_clientes', {
      termino: searchTerm,
    })

    if (error) {
      console.error('[search-clients] RPC error:', error.message)
      // Fallback: basic field search
      const t = `%${trimmed}%`
      const { data: fb } = await supabase
        .from('clientes')
        .select('*')
        .or(`cups.ilike.${t},dni.ilike.${t},nombre.ilike.${t}`)
        .limit(20)
      return { statusCode: 200, headers, body: JSON.stringify({ data: fb || [] }) }
    }

    return { statusCode: 200, headers, body: JSON.stringify({ data: data || [] }) }

  } catch (err) {
    console.error('[search-clients] Unexpected:', err.message)
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) }
  }
}

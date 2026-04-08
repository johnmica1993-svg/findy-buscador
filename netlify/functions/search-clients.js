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

    // Normalize phone: strip +34 or leading 34
    const sinPrefijo = trimmed.replace(/^\+34/, '').replace(/^34(\d{9})$/, '$1').replace(/[\s\-]/g, '')

    const lim = rol === 'ADMIN' ? 50 : 20

    // Use RPC for a single SQL query that searches everything
    const { data, error } = await supabase.rpc('buscar_clientes', {
      termino: trimmed,
      termino_tel: sinPrefijo,
      lim: lim,
    })

    if (error) {
      console.error('[search-clients] RPC error:', error.message)
      // Fallback: basic search without phone
      const t = `%${trimmed}%`
      const { data: fb, error: fbErr } = await supabase
        .from('clientes')
        .select('*')
        .or(`cups.ilike.${t},dni.ilike.${t},nombre.ilike.${t}`)
        .limit(lim)

      if (fbErr) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: fbErr.message }) }
      }
      return { statusCode: 200, headers, body: JSON.stringify({ data: fb || [] }) }
    }

    return { statusCode: 200, headers, body: JSON.stringify({ data: data || [] }) }

  } catch (err) {
    console.error('[search-clients] Unexpected:', err.message)
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) }
  }
}

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

    let q = supabase
      .from('clientes')
      .select('*')
      .or(`cups.ilike.${termino},dni.ilike.${termino},nombre.ilike.${termino}`)

    if (rol === 'ADMIN') {
      q = q.limit(20)
    }
    // No limit for sub-users so we can detect duplicates

    const { data, error } = await q

    if (error) {
      console.error('[search-clients] Error:', error.message)
      return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) }
    }

    return { statusCode: 200, headers, body: JSON.stringify({ data: data || [] }) }

  } catch (err) {
    console.error('[search-clients] Unexpected:', err.message)
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) }
  }
}

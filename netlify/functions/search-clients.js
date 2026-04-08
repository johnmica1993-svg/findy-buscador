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
      .replace(/^34(\d{9})$/, '$1')
      .replace(/[\s\-().]/g, '')

    const { data, error } = await supabase.rpc('buscar_clientes_admin', {
      termino: sinPrefijo,
    })

    if (error) {
      console.error('[search-clients] RPC error:', error.message)
      return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) }
    }

    return { statusCode: 200, headers, body: JSON.stringify(data || []) }

  } catch (err) {
    console.error('[search-clients] Unexpected:', err.message)
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) }
  }
}

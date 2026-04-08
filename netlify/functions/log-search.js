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
    const { usuario_id, usuario_nombre, termino_busqueda, resultado_encontrado } = JSON.parse(event.body || '{}')

    const supabase = createClient(
      process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    await supabase.from('busquedas_log').insert({
      usuario_id,
      usuario_nombre,
      termino_busqueda,
      resultado_encontrado,
    })

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) }
  } catch (err) {
    return { statusCode: 200, headers, body: JSON.stringify({ ok: false }) }
  }
}

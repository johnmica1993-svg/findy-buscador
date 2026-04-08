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
    const { usuario_id, usuario_nombre, usuario_email, oficina, termino_busqueda, resultado_encontrado } = JSON.parse(event.body || '{}')

    const supabase = createClient(
      process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    // First try with all fields
    const { error } = await supabase.from('busquedas_log').insert({
      usuario_id: usuario_id || null,
      usuario_nombre: usuario_nombre || null,
      usuario_email: usuario_email || null,
      oficina: oficina || null,
      termino_busqueda: termino_busqueda || null,
      resultado_encontrado: resultado_encontrado ?? null,
    })

    if (error) {
      console.error('[log-search] Insert error:', error.code, error.message)

      // Fallback: try without the columns that might not exist
      const { error: err2 } = await supabase.from('busquedas_log').insert({
        usuario_id: usuario_id || null,
        usuario_nombre: usuario_nombre || null,
        termino_busqueda: termino_busqueda || null,
        resultado_encontrado: resultado_encontrado ?? null,
      })

      if (err2) {
        console.error('[log-search] Fallback error:', err2.code, err2.message)
        return { statusCode: 200, headers, body: JSON.stringify({ ok: false, error: err2.message }) }
      }
    }

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) }
  } catch (err) {
    console.error('[log-search] Unexpected:', err.message)
    return { statusCode: 200, headers, body: JSON.stringify({ ok: false, error: err.message }) }
  }
}

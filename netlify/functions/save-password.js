exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  }
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' }

  try {
    const { user_id, password } = JSON.parse(event.body || '{}')
    if (!user_id) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'user_id requerido' }) }
    }

    const url = process.env.VITE_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY

    // Save to usuarios table
    const res = await fetch(`${url}/rest/v1/usuarios?id=eq.${user_id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({
        ultima_password_temporal: password || null,
        password_generada_at: password ? new Date().toISOString() : null,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      return { statusCode: 500, headers, body: JSON.stringify({ error: err }) }
    }

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) }
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) }
  }
}

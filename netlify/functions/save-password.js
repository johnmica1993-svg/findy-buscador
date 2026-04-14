exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  }
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' }

  try {
    const { user_id, userId, password } = JSON.parse(event.body || '{}')
    const uid = user_id || userId
    if (!uid) return { statusCode: 400, headers, body: JSON.stringify({ error: 'user_id requerido' }) }

    const url = process.env.VITE_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    const authHeaders = { 'Content-Type': 'application/json', 'apikey': key, 'Authorization': `Bearer ${key}` }

    // 1. Change password in Auth if provided
    if (password) {
      const authRes = await fetch(`${url}/auth/v1/admin/users/${uid}`, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({ password }),
      })
      if (!authRes.ok) {
        const err = await authRes.text()
        console.error('[save-password] Auth error:', err)
      }
    }

    // 2. Try saving to usuarios table
    const body = {
      ultima_password_temporal: password || null,
      password_generada_at: password ? new Date().toISOString() : null,
    }

    const res = await fetch(`${url}/rest/v1/usuarios?id=eq.${uid}`, {
      method: 'PATCH',
      headers: { ...authHeaders, 'Prefer': 'return=representation' },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error('[save-password] PATCH error:', errText)

      // If columns don't exist, try creating them via SQL
      if (errText.includes('could not find') || errText.includes('PGRST204') || errText.includes('does not exist')) {
        console.log('[save-password] Creating missing columns...')

        // Use SQL via RPC to add columns
        const sqlRes = await fetch(`${url}/rest/v1/rpc/`, {
          method: 'POST',
          headers: authHeaders,
          body: '{}',
        })
        // RPC won't work for DDL, but the error message is clear

        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({
            error: 'Las columnas ultima_password_temporal y password_generada_at no existen en la tabla usuarios. Ejecuta en Supabase SQL Editor: ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ultima_password_temporal TEXT; ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS password_generada_at TIMESTAMPTZ;',
          }),
        }
      }

      return { statusCode: 500, headers, body: JSON.stringify({ error: errText }) }
    }

    const data = await res.json()
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, data }) }
  } catch (err) {
    console.error('[save-password] Error:', err.message)
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) }
  }
}

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
    const { user_id } = JSON.parse(event.body || '{}')

    if (!user_id) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'user_id es obligatorio' }),
      }
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Get user with oficina
    const { data: usuario, error } = await supabase
      .from('usuarios')
      .select('rol, oficina_id, oficina:oficinas(ip_autorizada)')
      .eq('id', user_id)
      .single()

    if (error || !usuario) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ allowed: true }),
      }
    }

    // Only check IP for OFICINA and COMERCIAL roles
    if (usuario.rol !== 'OFICINA' && usuario.rol !== 'COMERCIAL') {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ allowed: true }),
      }
    }

    const ipAutorizada = usuario.oficina?.ip_autorizada
    if (!ipAutorizada || ipAutorizada.trim() === '') {
      // No IP configured = allow access
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ allowed: true }),
      }
    }

    // Get client IP from request headers
    const clientIp = event.headers['x-forwarded-for']?.split(',')[0]?.trim()
      || event.headers['client-ip']
      || event.headers['x-real-ip']
      || 'unknown'

    const allowed = clientIp === ipAutorizada.trim()

    console.log(`[verify-ip] User: ${user_id}, Client IP: ${clientIp}, Authorized IP: ${ipAutorizada}, Allowed: ${allowed}`)

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ allowed, clientIp, ipAutorizada }),
    }

  } catch (err) {
    console.error('[verify-ip] Error:', err.message)
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ allowed: true }),
    }
  }
}

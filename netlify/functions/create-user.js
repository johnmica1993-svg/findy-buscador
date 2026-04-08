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
    const { nombre, email, password, rol, oficina_id } = JSON.parse(event.body || '{}')

    if (!nombre || !email || !password || !rol) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Nombre, email, contraseña y rol son obligatorios' }),
      }
    }

    if ((rol === 'OFICINA' || rol === 'COMERCIAL') && !oficina_id) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'La oficina es obligatoria para usuarios con rol Oficina o Comercial' }),
      }
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Configuración del servidor incompleta' }),
      }
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Step 1: Create auth user with admin API
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (authError) {
      console.error('[create-user] Auth error:', authError.message)
      const msg = authError.message.includes('already been registered')
        ? 'Ya existe un usuario con ese email'
        : authError.message
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: msg }),
      }
    }

    // Step 2: Insert into usuarios table with the same UUID
    const { error: insertError } = await supabase.from('usuarios').insert({
      id: authData.user.id,
      nombre,
      email,
      rol,
      oficina_id: oficina_id || null,
    })

    if (insertError) {
      console.error('[create-user] Insert error:', insertError.message)
      // Rollback: delete the auth user
      await supabase.auth.admin.deleteUser(authData.user.id)
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Error al crear el perfil del usuario: ' + insertError.message }),
      }
    }

    console.log(`[create-user] User created: ${email} (${rol})`)

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'Usuario creado correctamente', userId: authData.user.id }),
    }

  } catch (err) {
    console.error('[create-user] Unexpected error:', err.message)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Error interno del servidor' }),
    }
  }
}

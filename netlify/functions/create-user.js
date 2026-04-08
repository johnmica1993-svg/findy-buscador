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

    // Step 1: Try to create auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    let userId

    if (authError) {
      // If user already exists in auth, check if also exists in usuarios table
      if (authError.message.includes('already been registered')) {
        // Find the existing auth user
        const { data: { users } } = await supabase.auth.admin.listUsers()
        const existingUser = users.find(u => u.email?.toLowerCase() === email.toLowerCase())

        if (!existingUser) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Error inesperado al buscar el usuario existente' }),
          }
        }

        // Check if exists in usuarios table
        const { data: existingProfile } = await supabase
          .from('usuarios')
          .select('id')
          .eq('id', existingUser.id)
          .single()

        if (existingProfile) {
          // Exists in both auth AND usuarios → real duplicate
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Ya existe un usuario con ese email en el sistema' }),
          }
        }

        // Exists in auth but NOT in usuarios → insert profile only
        console.log(`[create-user] User ${email} exists in auth but not in usuarios, inserting profile`)
        userId = existingUser.id

        // Update password since we can't create a new auth user
        await supabase.auth.admin.updateUserById(userId, { password })
      } else {
        console.error('[create-user] Auth error:', authError.message)
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: authError.message }),
        }
      }
    } else {
      userId = authData.user.id
    }

    // Step 2: Insert into usuarios table
    const { error: insertError } = await supabase.from('usuarios').insert({
      id: userId,
      nombre,
      email,
      rol,
      oficina_id: oficina_id || null,
    })

    if (insertError) {
      console.error('[create-user] Insert error:', insertError.message)
      // Only rollback auth user if we just created it (not if it already existed)
      if (authData?.user) {
        await supabase.auth.admin.deleteUser(userId)
      }
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
      body: JSON.stringify({ message: 'Usuario creado correctamente', userId }),
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

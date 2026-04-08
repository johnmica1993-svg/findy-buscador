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

    // Delete from usuarios table first (FK constraint)
    const { error: deleteProfileError } = await supabase
      .from('usuarios')
      .delete()
      .eq('id', user_id)

    if (deleteProfileError) {
      console.error('[delete-user] Profile delete error:', deleteProfileError.message)
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Error al eliminar el perfil: ' + deleteProfileError.message }),
      }
    }

    // Delete from auth.users
    const { error: deleteAuthError } = await supabase.auth.admin.deleteUser(user_id)

    if (deleteAuthError) {
      console.error('[delete-user] Auth delete error:', deleteAuthError.message)
      // Profile already deleted, log but don't fail
    }

    console.log(`[delete-user] User deleted: ${user_id}`)

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'Usuario eliminado correctamente' }),
    }

  } catch (err) {
    console.error('[delete-user] Unexpected error:', err.message)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Error interno del servidor' }),
    }
  }
}

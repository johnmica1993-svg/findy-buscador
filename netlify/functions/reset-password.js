import { createClient } from '@supabase/supabase-js'

function generarPassword(length = 10) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let pass = ''
  for (let i = 0; i < length; i++) {
    pass += chars[Math.floor(Math.random() * chars.length)]
  }
  return pass
}

async function enviarEmailConResend({ apiKey, from, to, tempPassword }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: 'Tu nueva contraseña temporal — FINDY BUSCADOR',
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1E40AF;">FINDY BUSCADOR</h2>
          <p>Hola,</p>
          <p>Se ha restablecido tu contraseña. Tu nueva contraseña temporal es:</p>
          <div style="background: #F3F4F6; border-radius: 8px; padding: 16px; text-align: center; margin: 20px 0;">
            <code style="font-size: 24px; font-weight: bold; color: #1E40AF; letter-spacing: 2px;">${tempPassword}</code>
          </div>
          <p style="color: #DC2626; font-weight: 600;">Cámbiala después de iniciar sesión.</p>
          <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 20px 0;" />
          <p style="color: #9CA3AF; font-size: 12px;">Este correo fue enviado automáticamente por FINDY BUSCADOR.</p>
        </div>
      `,
    }),
  })
  const data = await res.json()
  return { ok: res.ok, data }
}

async function enviarEmailConSupabase({ supabaseUrl, serviceRoleKey, to, tempPassword }) {
  // Use Supabase's built-in email via the Auth REST API
  // This sends through Supabase's configured SMTP (or default Inbucket in dev)
  const res = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${serviceRoleKey}`,
      'apikey': serviceRoleKey,
    },
  })

  // Supabase doesn't have a direct "send arbitrary email" admin endpoint,
  // so we use the magic link / invite approach as a workaround:
  // Generate a magic link that we won't use, but piggyback on Supabase's SMTP
  // Actually, the cleanest approach is using the password recovery email
  const resetRes = await fetch(`${supabaseUrl}/auth/v1/recover`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': serviceRoleKey,
    },
    body: JSON.stringify({ email: to }),
  })

  return { ok: resetRes.ok, data: await resetRes.json().catch(() => ({})) }
}

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
    const { email } = JSON.parse(event.body || '{}')

    if (!email) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'El email es obligatorio' }),
      }
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('[reset-password] SUPABASE_URL or SERVICE_ROLE_KEY missing')
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Configuración del servidor incompleta' }),
      }
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Find user by email
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers()

    if (listError) {
      console.error('[reset-password] Error listing users:', listError.message)
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Error al buscar el usuario' }),
      }
    }

    const user = users.find(u => u.email?.toLowerCase() === email.toLowerCase())

    if (!user) {
      console.log('[reset-password] User not found:', email)
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ message: 'Si el email existe, recibirás una contraseña temporal.' }),
      }
    }

    // Generate temporary password
    const tempPassword = generarPassword(10)

    // Update user password via admin
    const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
      password: tempPassword,
    })

    if (updateError) {
      console.error('[reset-password] Error updating password:', updateError.message)
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Error al restablecer la contraseña' }),
      }
    }

    console.log(`[reset-password] Password updated for ${email}`)

    // Save temp password in usuarios table for admin visibility
    await supabase.from('usuarios').update({
      ultima_password_temporal: tempPassword,
      password_generada_at: new Date().toISOString(),
    }).eq('email', email.toLowerCase())

    // --- Send email ---
    let emailSent = false
    let emailMethod = 'none'

    // Option 1: Resend (if configured)
    const resendApiKey = process.env.RESEND_API_KEY
    if (resendApiKey) {
      const fromEmail = process.env.RESEND_FROM_EMAIL || 'FINDY BUSCADOR <onboarding@resend.dev>'
      console.log(`[reset-password] Sending email via Resend to ${email}`)
      const result = await enviarEmailConResend({
        apiKey: resendApiKey,
        from: fromEmail,
        to: email,
        tempPassword,
      })
      emailSent = result.ok
      emailMethod = 'resend'
      if (!result.ok) {
        console.error('[reset-password] Resend error:', JSON.stringify(result.data))
      } else {
        console.log('[reset-password] Email sent via Resend:', result.data.id)
      }
    }

    // Option 2: Supabase recovery email (sends default "Reset Password" email)
    if (!emailSent) {
      console.log(`[reset-password] Sending recovery email via Supabase to ${email}`)
      const result = await enviarEmailConSupabase({
        supabaseUrl,
        serviceRoleKey,
        to: email,
        tempPassword,
      })
      emailSent = result.ok
      emailMethod = 'supabase-recovery'
      if (!result.ok) {
        console.error('[reset-password] Supabase recovery error:', JSON.stringify(result.data))
      } else {
        console.log('[reset-password] Recovery email sent via Supabase')
      }
    }

    // Build response — never expose tempPassword to the client
    const response = {
      message: 'Te enviamos una contraseña temporal a tu correo. Revisa tu bandeja de entrada (y spam).',
      emailSent,
    }

    console.log(`[reset-password] Done. Method: ${emailMethod}, Sent: ${emailSent}`)

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response),
    }

  } catch (err) {
    console.error('[reset-password] Unexpected error:', err.message)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Error interno del servidor' }),
    }
  }
}

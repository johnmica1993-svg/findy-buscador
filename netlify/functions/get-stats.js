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
    const { filtro_fecha, filtro_usuario } = JSON.parse(event.body || '{}')

    const supabase = createClient(
      process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    // Total clientes — use pg_class estimate (instant, no full scan)
    let totalClientes = 0
    try {
      const countRes = await fetch(
        `${process.env.VITE_SUPABASE_URL}/rest/v1/rpc/contar_clientes`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY, 'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
          body: '{}'
        }
      )
      if (countRes.ok) {
        totalClientes = await countRes.json()
      }
    } catch {}

    // All logs
    let logsQuery = supabase
      .from('busquedas_log')
      .select('*')
      .order('created_at', { ascending: false })

    if (filtro_usuario) logsQuery = logsQuery.eq('usuario_id', filtro_usuario)
    if (filtro_fecha) logsQuery = logsQuery.gte('created_at', filtro_fecha)

    const { data: logs } = await logsQuery.limit(500)

    // Last 50 for display
    const ultimas = (logs || []).slice(0, 50)

    // Per-user stats
    const now = new Date()
    const hoyStr = now.toISOString().split('T')[0]
    const inicioSemana = new Date(now)
    inicioSemana.setDate(now.getDate() - now.getDay() + 1)
    const semanaStr = inicioSemana.toISOString().split('T')[0]

    const porUsuario = {}
    for (const log of (logs || [])) {
      const uid = log.usuario_id || 'unknown'
      if (!porUsuario[uid]) {
        porUsuario[uid] = { nombre: log.usuario_nombre || 'Desconocido', hoy: 0, semana: 0, total: 0 }
      }
      porUsuario[uid].total++
      const fecha = log.created_at?.split('T')[0]
      if (fecha === hoyStr) porUsuario[uid].hoy++
      if (fecha >= semanaStr) porUsuario[uid].semana++
    }

    // Get oficina for each user
    const userIds = Object.keys(porUsuario).filter(k => k !== 'unknown')
    let usuariosConOficina = []
    if (userIds.length > 0) {
      const { data } = await supabase
        .from('usuarios')
        .select('id, oficina:oficinas(nombre)')
        .in('id', userIds)
      usuariosConOficina = data || []
    }

    const statsUsuarios = Object.entries(porUsuario).map(([uid, stats]) => {
      const u = usuariosConOficina.find(x => x.id === uid)
      return {
        usuario_id: uid,
        nombre: stats.nombre,
        oficina: u?.oficina?.nombre || '—',
        hoy: stats.hoy,
        semana: stats.semana,
        total: stats.total,
      }
    }).sort((a, b) => b.hoy - a.hoy)

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        totalClientes: totalClientes || 0,
        statsUsuarios,
        ultimas,
      }),
    }
  } catch (err) {
    console.error('[get-stats]', err.message)
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) }
  }
}

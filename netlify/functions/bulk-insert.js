exports.handler = async (event, context) => {
  if (context) context.callbackWaitsForEmptyEventLoop = false

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  }

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: '{}' }

  try {
    const body = JSON.parse(event.body || '{}')

    // Cancel a job
    if (body.cancelar && body.job_id) {
      await fetch(
        `${process.env.VITE_SUPABASE_URL}/rest/v1/carga_jobs?id=eq.${body.job_id}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({ estado: 'cancelado', updated_at: new Date().toISOString() }),
        }
      )
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) }
    }

    const { clientes, job_id } = body

    if (!clientes || !Array.isArray(clientes) || clientes.length === 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'No hay clientes' }) }
    }

    const SUPABASE_URL = process.env.VITE_SUPABASE_URL
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!SUPABASE_URL || !SERVICE_KEY) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Config incompleta' }) }
    }

    // Check if job was cancelled
    if (job_id) {
      const jobRes = await fetch(
        `${SUPABASE_URL}/rest/v1/carga_jobs?id=eq.${job_id}&select=estado`,
        {
          headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` },
        }
      )
      const jobData = await jobRes.json()
      if (jobData?.[0]?.estado === 'cancelado') {
        return { statusCode: 200, headers, body: JSON.stringify({ cargados: 0, errores: 0, cancelado: true }) }
      }
    }

    // Call the stored procedure — PostgreSQL processes everything in one transaction
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/bulk_upsert_clientes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({ registros: clientes }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          cargados: 0,
          errores: clientes.length,
          primerError: `Supabase ${response.status}: ${errorText.slice(0, 300)}`,
          fallidos: [],
        }),
      }
    }

    const result = await response.json()

    // Update job progress
    if (job_id) {
      await fetch(
        `${SUPABASE_URL}/rest/v1/carga_jobs?id=eq.${job_id}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SERVICE_KEY,
            'Authorization': `Bearer ${SERVICE_KEY}`,
          },
          body: JSON.stringify({
            procesados: clientes.length,
            insertados: result.insertados || 0,
            actualizados: result.actualizados || 0,
            errores: result.errores || 0,
            updated_at: new Date().toISOString(),
          }),
        }
      ).catch(() => {})
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        cargados: (result.insertados || 0) + (result.actualizados || 0),
        actualizados: result.actualizados || 0,
        duplicados: 0,
        errores: result.errores || 0,
        primerError: null,
        fallidos: [],
      }),
    }

  } catch (err) {
    console.error('[bulk-insert] Unexpected:', err.message)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Error interno: ' + err.message }),
    }
  }
}

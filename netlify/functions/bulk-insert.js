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
    const { clientes } = JSON.parse(event.body || '{}')

    if (!clientes || !Array.isArray(clientes) || clientes.length === 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'No hay clientes' }) }
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Config incompleta' }) }
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Split: records with CUPS go to upsert, without CUPS go to plain insert
    const conCups = []
    const sinCups = []
    for (const r of clientes) {
      const cups = r.cups?.trim()
      if (cups) {
        conCups.push(r)
      } else {
        sinCups.push(r)
      }
    }

    let cargados = 0
    let actualizados = 0
    let errores = 0
    let primerError = null
    const fallidos = []

    // 1. Upsert records WITH CUPS — PostgreSQL handles ON CONFLICT
    if (conCups.length > 0) {
      const { data, error } = await supabase
        .from('clientes')
        .upsert(conCups, { onConflict: 'cups', ignoreDuplicates: false })
        .select('id')

      if (error) {
        if (!primerError) primerError = `upsert: ${error.code}: ${error.message}`
        errores += conCups.length
        conCups.forEach(r => fallidos.push({ record: r, error: `${error.code}: ${error.message}` }))
      } else {
        // upsert with ignoreDuplicates:false updates existing rows
        // data.length = total rows affected (inserts + updates)
        cargados = data?.length || 0
        actualizados = Math.max(0, conCups.length - cargados)
      }
    }

    // 2. Insert records WITHOUT CUPS — plain insert, no conflict possible
    if (sinCups.length > 0) {
      const { data, error } = await supabase
        .from('clientes')
        .insert(sinCups)
        .select('id')

      if (error) {
        if (!primerError) primerError = `insert: ${error.code}: ${error.message}`
        errores += sinCups.length
        sinCups.forEach(r => fallidos.push({ record: r, error: `${error.code}: ${error.message}` }))
      } else {
        cargados += data?.length || 0
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        cargados,
        actualizados,
        duplicados: 0,
        errores,
        primerError,
        fallidos: fallidos.slice(0, 200),
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

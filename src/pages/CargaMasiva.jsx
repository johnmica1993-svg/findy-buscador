import { useState, useEffect, useRef } from 'react'
import { Upload, FileSpreadsheet, CheckCircle, XCircle, Loader2, Download } from 'lucide-react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Card from '../components/UI/Card'
import Button from '../components/UI/Button'
import {
  guardarJobLocal, obtenerJobLocal, actualizarChunkLocal,
  eliminarJobLocal, obtenerJobActivoLocal,
} from '../utils/cargaDB'

// ─── Column mapping config ───

const COLUMN_MAP = {
  cups: ['cups', 'CUPS', 'Cups', 'cup', 'CUP', 'Id CUPS', 'id_cups', 'ID CUPS', 'ID_CUPS', 'idcups', 'Id cups'],
  dni: ['dni', 'DNI', 'nif', 'NIF', 'Dni', 'Nif', 'CIF', 'cif', 'Cif', 'DNI/NIF', 'NIF/DNI', 'Documento'],
  nombre: ['nombre', 'Nombre', 'NOMBRE', 'nombre_completo', 'NOMBRE COMPLETO', 'Nombre Completo', 'nombre completo', 'razon social', 'Razón Social', 'RAZON SOCIAL', 'Razon Social', 'titular', 'Titular', 'TITULAR'],
  direccion: ['direccion', 'Dirección', 'DIRECCION', 'Direccion', 'dirección', 'Domicilio', 'domicilio', 'DOMICILIO', 'direccion_suministro', 'Dirección Suministro'],
  campana: ['campana', 'campaña', 'Campaña', 'CAMPAÑA', 'Campana', 'CAMPANA', 'comercializadora', 'Comercializadora', 'COMERCIALIZADORA'],
  fecha_alta: ['fecha_alta', 'Fecha Alta', 'FECHA ALTA', 'fecha alta', 'FechaAlta', 'Alta', 'alta', 'ALTA', 'Fecha de alta'],
  fecha_activacion: ['fecha_activacion', 'Fecha Activación', 'FECHA ACTIVACION', 'fecha activacion', 'Fecha Activacion', 'FechaActivacion', 'Activación', 'activacion', 'Fecha de activación'],
  fecha_ultimo_cambio: ['fecha_ultimo_cambio', 'Fecha Último Cambio', 'FECHA ULTIMO CAMBIO', 'fecha ultimo cambio', 'Último Cambio', 'ultimo cambio'],
  fecha_baja: ['fecha_baja', 'Fecha Baja', 'FECHA BAJA', 'fecha baja', 'Baja', 'baja', 'BAJA', 'Fecha de baja'],
  estado: ['estado', 'Estado', 'ESTADO', 'status', 'Status', 'STATUS', 'situacion', 'Situación', 'SITUACION'],
}

const EXTRA_MAP = {
  'telefono1': ['telefono1', 'Telefono1', 'TELEFONO1', 'Telefono 1', 'TELEFON 1', 'Tel1', 'tel1', 'TEL1', 'Teléfono', 'telefono', 'TELEFONO', 'Teléfono 1', 'Movil', 'movil', 'MOVIL', 'Móvil'],
  'telefono2': ['telefono2', 'Telefono2', 'TELEFONO2', 'Telefono 2', 'TELEFON 2', 'Tel2', 'tel2', 'TEL2', 'Teléfono 2'],
  'email': ['email', 'Email', 'EMAIL', 'correo', 'Correo', 'CORREO', 'correo electronico', 'CORREO ELECTRONICO', 'Correo Electronico', 'Correo Electrónico', 'e-mail', 'E-mail'],
  'IBAN': ['iban', 'IBAN', 'Iban', 'cuenta', 'Cuenta', 'cuenta_bancaria', 'Cuenta Bancaria', 'CUENTA BANCARIA'],
  'codigo_postal': ['codigo postal', 'Codigo Postal', 'CODIGO POSTAL', 'CodigoPostal', 'cp', 'CP', 'Cp', 'C.P.', 'codigo_postal'],
  'provincia': ['provincia', 'Provincia', 'PROVINCIA'],
  'municipio': ['municipio', 'Municipio', 'MUNICIPIO', 'poblacion', 'Poblacion', 'POBLACION', 'Población', 'ciudad', 'Ciudad', 'CIUDAD', 'localidad', 'Localidad', 'LOCALIDAD'],
}

const SPECIAL_MAP = {
  '_apellido1': ['apellido1', 'Apellido1', 'APELLIDO1', 'Apellido 1', 'apellido_1', 'Primer Apellido', 'primer apellido'],
  '_apellido2': ['apellido2', 'Apellido2', 'APELLIDO2', 'Apellido 2', 'apellido_2', 'Segundo Apellido', 'segundo apellido'],
  '_via': ['via', 'Via', 'VIA', 'Tipo Via', 'tipo_via', 'TIPO VIA', 'Tipo Vía'],
  '_numero': ['numero', 'Numero', 'NUMERO', 'Número', 'Num', 'num', 'Nº'],
  '_portal': ['portal', 'Portal', 'PORTAL'],
  '_escalera': ['escalera', 'Escalera', 'ESCALERA', 'Esc', 'esc'],
  '_piso': ['piso', 'Piso', 'PISO', 'Planta', 'planta'],
  '_puerta': ['puerta', 'Puerta', 'PUERTA', 'Pta', 'pta'],
}

function parseFecha(val) {
  if (!val) return null
  if (val instanceof Date) return val.toISOString().split('T')[0]
  if (typeof val === 'number') {
    const d = XLSX.SSF.parse_date_code(val)
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  const str = String(val).trim()
  const match = str.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/)
  if (match) return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.substring(0, 10)
  return null
}

function limpiarDni(raw) {
  if (!raw) return null
  const str = String(raw).trim()
  if (!str) return null
  const match = str.match(/([A-Za-z]?\d{7,8}[A-Za-z]?)/)
  if (match) return match[1].toUpperCase()
  const cleaned = str.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  if (cleaned.length >= 8 && cleaned.length <= 10) return cleaned
  return str.trim()
}

function str(v) {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s || null
}

// Map a raw Excel row (object with original column names) to a clientes record
function mapearRegistro(row, usuario) {
  const keys = Object.keys(row)
  const find = (variants) => {
    for (const v of variants) {
      const k = keys.find(k => k.toLowerCase() === v.toLowerCase())
      if (k && row[k] !== '' && row[k] !== null && row[k] !== undefined) return row[k]
    }
    return null
  }

  // Main fields
  const cups = str(find(COLUMN_MAP.cups))
  const nombre = str(find(COLUMN_MAP.nombre))
  const direccion = str(find(COLUMN_MAP.direccion))

  // Apellidos → concat with nombre
  const ap1 = str(find(SPECIAL_MAP._apellido1))
  const ap2 = str(find(SPECIAL_MAP._apellido2))
  const nombreCompleto = [nombre, ap1, ap2].filter(Boolean).join(' ') || null

  // Address parts → concat with direccion
  const via = str(find(SPECIAL_MAP._via))
  const numero = str(find(SPECIAL_MAP._numero))
  const portal = str(find(SPECIAL_MAP._portal))
  const escalera = str(find(SPECIAL_MAP._escalera))
  const piso = str(find(SPECIAL_MAP._piso))
  const puerta = str(find(SPECIAL_MAP._puerta))
  const dirParts = [via, numero, portal, escalera, piso, puerta].filter(Boolean)
  let dirFinal = direccion
  if (!dirFinal && dirParts.length > 0) dirFinal = dirParts.join(' ')
  else if (dirFinal && dirParts.length > 0) dirFinal = dirFinal + ', ' + dirParts.join(' ')

  // datos_extra from EXTRA_MAP
  const datos_extra = {}
  for (const [extraKey, variants] of Object.entries(EXTRA_MAP)) {
    const val = str(find(variants))
    if (val) datos_extra[extraKey] = val
  }

  // Remaining unmapped columns → datos_extra
  const mappedLower = new Set()
  for (const variants of Object.values(COLUMN_MAP)) variants.forEach(v => mappedLower.add(v.toLowerCase()))
  for (const variants of Object.values(EXTRA_MAP)) variants.forEach(v => mappedLower.add(v.toLowerCase()))
  for (const variants of Object.values(SPECIAL_MAP)) variants.forEach(v => mappedLower.add(v.toLowerCase()))

  for (const k of keys) {
    if (!mappedLower.has(k.toLowerCase()) && row[k] !== '' && row[k] !== null && row[k] !== undefined) {
      datos_extra[k] = typeof row[k] === 'object' && row[k] instanceof Date
        ? row[k].toISOString().split('T')[0]
        : String(row[k])
    }
  }

  const campanaRaw = str(find(COLUMN_MAP.campana))

  return {
    cups,
    dni: limpiarDni(find(COLUMN_MAP.dni)),
    nombre: nombreCompleto,
    direccion: dirFinal,
    campana: campanaRaw ? campanaRaw.toUpperCase().replace('Ñ', 'N') : null,
    fecha_alta: parseFecha(find(COLUMN_MAP.fecha_alta)),
    fecha_activacion: parseFecha(find(COLUMN_MAP.fecha_activacion)),
    fecha_ultimo_cambio: parseFecha(find(COLUMN_MAP.fecha_ultimo_cambio)),
    fecha_baja: parseFecha(find(COLUMN_MAP.fecha_baja)),
    estado: str(find(COLUMN_MAP.estado)),
    oficina_id: usuario?.oficina_id || null,
    datos_extra: Object.keys(datos_extra).length > 0 ? datos_extra : null,
  }
}

// ─── Constants ───

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY
const CHUNK_SIZE = 20000
const PARALLEL = 5

// ─── Component ───

export default function CargaMasiva() {
  const { usuario } = useAuth()
  const [estado, setEstado] = useState('idle') // idle, leyendo, procesando, completado, error
  const [progreso, setProgreso] = useState(0)
  const [stats, setStats] = useState({ total: 0, procesados: 0, insertados: 0, actualizados: 0, errores: 0 })
  const [nombreArchivo, setNombreArchivo] = useState('')
  const [jobId, setJobId] = useState(null)
  const [errorMsg, setErrorMsg] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const canceladoRef = useRef(false)

  // On mount: check for pending job in IndexedDB
  useEffect(() => {
    verificarJobPendiente()
  }, [])

  async function verificarJobPendiente() {
    try {
      const jobLocal = await obtenerJobActivoLocal()
      if (!jobLocal) return

      const { data: jobRemoto } = await supabase
        .from('carga_jobs')
        .select('*')
        .eq('id', jobLocal.id)
        .single()

      if (jobRemoto && jobRemoto.estado === 'procesando') {
        setJobId(jobLocal.id)
        setNombreArchivo(jobLocal.nombreArchivo)
        setStats({
          total: jobLocal.total,
          procesados: jobRemoto.procesados || 0,
          insertados: jobRemoto.insertados || 0,
          actualizados: jobRemoto.actualizados || 0,
          errores: 0,
        })
        setProgreso(jobLocal.total > 0 ? Math.round(((jobRemoto.procesados || 0) / jobLocal.total) * 100) : 0)
        setEstado('procesando')

        const datosLocal = await obtenerJobLocal(jobLocal.id)
        if (datosLocal?.registros?.length > 0) {
          canceladoRef.current = false
          await procesarDesdeChunk(jobLocal.id, datosLocal.registros, jobLocal.chunkActual || 0)
        }
      } else {
        await eliminarJobLocal(jobLocal.id)
      }
    } catch (e) {
      console.warn('[CargaMasiva] Error checking pending job:', e)
    }
  }

  async function procesarArchivos(files) {
    const validExts = ['.xlsx', '.xls', '.csv']
    const validFiles = Array.from(files).filter(f =>
      validExts.some(ext => f.name.toLowerCase().endsWith(ext))
    )
    if (validFiles.length === 0) return

    setEstado('leyendo')
    setErrorMsg(null)
    canceladoRef.current = false

    try {
      const t0 = performance.now()

      // Read all files and build records
      let allRegistros = []
      let fileName = validFiles.map(f => f.name).join(', ')

      for (const file of validFiles) {
        const buffer = await file.arrayBuffer()
        const wb = XLSX.read(buffer, { cellDates: true })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rawData = XLSX.utils.sheet_to_json(ws, { defval: '' })

        const registros = rawData.map(row => mapearRegistro(row, usuario))
        allRegistros.push(...registros)
      }

      console.log(`EXCEL PARSE: ${((performance.now() - t0) / 1000).toFixed(1)}s — ${allRegistros.length} registros`)

      if (allRegistros.length === 0) {
        setEstado('error')
        setErrorMsg('Los archivos no contienen datos')
        return
      }

      setNombreArchivo(fileName)
      console.log(`[CargaMasiva] ${allRegistros.length} registros de ${validFiles.length} archivos`)

      // Generate job ID and save to IndexedDB
      const id = crypto.randomUUID()
      await guardarJobLocal(id, allRegistros, fileName)

      // Create job in Supabase
      await supabase.from('carga_jobs').insert({
        id,
        usuario_id: usuario?.id,
        estado: 'procesando',
        total: allRegistros.length,
        nombre_archivo: fileName,
      })

      setJobId(id)
      setStats({ total: allRegistros.length, procesados: 0, insertados: 0, actualizados: 0, errores: 0 })
      setEstado('procesando')
      setProgreso(0)

      await procesarDesdeChunk(id, allRegistros, 0)

    } catch (err) {
      console.error('[CargaMasiva] Error:', err)
      setEstado('error')
      setErrorMsg(err.message)
    }
  }

  async function procesarDesdeChunk(jid, registros, desdeChunk) {
    const chunks = []
    for (let i = 0; i < registros.length; i += CHUNK_SIZE) {
      chunks.push(registros.slice(i, i + CHUNK_SIZE))
    }

    let insertadosTotal = 0
    let actualizadosTotal = 0
    let erroresTotal = 0

    for (let i = desdeChunk; i < chunks.length; i += PARALLEL) {
      if (canceladoRef.current) break

      const grupo = chunks.slice(i, Math.min(i + PARALLEL, chunks.length))

      if (i === desdeChunk) {
        console.log(`TAMAÑO JSON primer chunk: ${(JSON.stringify(grupo[0]).length / 1024 / 1024).toFixed(1)} MB (${grupo[0].length} registros)`)
        console.log(`CHUNKS TOTALES: ${chunks.length}, PARALLEL: ${PARALLEL}, ROUNDS: ${Math.ceil(chunks.length / PARALLEL)}`)
      }

      const tChunk = performance.now()

      const resultados = await Promise.all(
        grupo.map(chunk =>
          fetch(`${SUPABASE_URL}/rest/v1/rpc/bulk_upsert_clientes`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': SUPABASE_ANON,
              'Authorization': `Bearer ${SUPABASE_ANON}`,
              'Prefer': 'return=representation',
            },
            body: JSON.stringify({ registros: chunk }),
          })
            .then(async r => {
              if (!r.ok) { const t = await r.text(); throw new Error(`Supabase ${r.status}: ${t.slice(0, 200)}`) }
              return r.json()
            })
            .then(r => ({ cargados: (r.insertados || 0) + (r.actualizados || 0), actualizados: r.actualizados || 0, errores: r.errores || 0 }))
            .catch(err => ({ cargados: 0, errores: chunk.length, primerError: err.message }))
        )
      )

      console.log(`ROUND ${Math.floor(i / PARALLEL) + 1}: ${((performance.now() - tChunk) / 1000).toFixed(1)}s — ${grupo.length}x${grupo[0]?.length} registros`, resultados.map(r => `ok:${r.cargados||0} err:${r.errores||0} ${r.primerError||''}`))

      for (const r of resultados) {
        if (r.cancelado) { canceladoRef.current = true; break }
        insertadosTotal += r.cargados || 0
        actualizadosTotal += r.actualizados || 0
        erroresTotal += r.errores || 0
      }

      const procesados = Math.min((i + PARALLEL) * CHUNK_SIZE, registros.length)
      const pct = Math.round((procesados / registros.length) * 100)

      setProgreso(pct)
      setStats(prev => ({
        ...prev,
        procesados,
        insertados: insertadosTotal,
        actualizados: actualizadosTotal,
        errores: erroresTotal,
      }))

      // Save progress locally
      await actualizarChunkLocal(jid, i + PARALLEL, procesados)

      // Update Supabase every few rounds
      if (i % (PARALLEL * 2) === 0 || i + PARALLEL >= chunks.length) {
        await supabase.from('carga_jobs').update({
          procesados,
          insertados: insertadosTotal,
          actualizados: actualizadosTotal,
          chunk_actual: i + PARALLEL,
          updated_at: new Date().toISOString(),
        }).eq('id', jid).catch(() => {})
      }
    }

    // Mark complete
    const finalEstado = canceladoRef.current ? 'cancelado' : 'completado'
    await supabase.from('carga_jobs').update({
      estado: finalEstado,
      procesados: registros.length,
      insertados: insertadosTotal,
      actualizados: actualizadosTotal,
    }).eq('id', jid).catch(() => {})

    await eliminarJobLocal(jid)

    if (!canceladoRef.current) {
      setEstado('completado')
      setProgreso(100)
    } else {
      setEstado('idle')
      setProgreso(0)
    }
  }

  async function handleCancelar() {
    canceladoRef.current = true
    if (jobId) {
      await supabase.from('carga_jobs').update({ estado: 'cancelado' }).eq('id', jobId).catch(() => {})
      await eliminarJobLocal(jobId).catch(() => {})
      // Cancel flag is set in carga_jobs above — in-flight requests will finish but results are ignored
    }
    setEstado('idle')
    setProgreso(0)
    setJobId(null)
  }

  function resetTodo() {
    setEstado('idle')
    setProgreso(0)
    setStats({ total: 0, procesados: 0, insertados: 0, actualizados: 0, errores: 0 })
    setNombreArchivo('')
    setJobId(null)
    setErrorMsg(null)
  }

  function handleFiles(e) {
    if (e.target.files?.length > 0) procesarArchivos(e.target.files)
    e.target.value = ''
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragOver(false)
    const files = []
    if (e.dataTransfer.items) {
      for (const item of e.dataTransfer.items) {
        if (item.kind === 'file') { const f = item.getAsFile(); if (f) files.push(f) }
      }
    } else {
      for (const f of e.dataTransfer.files) files.push(f)
    }
    if (files.length > 0) procesarArchivos(files)
  }

  // ─── UI ───

  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Carga Masiva</h2>

      {/* ═══ IDLE: Upload ═══ */}
      {estado === 'idle' && (
        <Card className="p-8">
          <div
            className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}`}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            <Upload className="mx-auto mb-4 text-gray-400" size={48} />
            <h3 className="text-lg font-semibold text-gray-700 mb-2">Arrastra tus archivos aquí</h3>
            <p className="text-sm text-gray-500 mb-4">Soporta múltiples archivos .xlsx, .xls, .csv</p>
            <label className="inline-block">
              <input type="file" multiple accept=".xlsx,.xls,.csv" onChange={handleFiles} className="hidden" />
              <span className="inline-flex items-center gap-2 px-4 py-2 bg-blue-800 text-white rounded-lg text-sm font-medium cursor-pointer hover:bg-blue-900">
                <FileSpreadsheet size={16} /> Seleccionar archivos
              </span>
            </label>
          </div>
        </Card>
      )}

      {/* ═══ READING ═══ */}
      {estado === 'leyendo' && (
        <Card className="p-8 text-center">
          <Loader2 className="mx-auto mb-4 text-blue-600 animate-spin" size={48} />
          <h3 className="text-lg font-semibold text-gray-700">Leyendo archivos...</h3>
          <p className="text-sm text-gray-500 mt-2">Procesando columnas y preparando datos</p>
        </Card>
      )}

      {/* ═══ PROCESSING ═══ */}
      {estado === 'procesando' && (
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <Loader2 size={24} className="text-blue-600 animate-spin" />
            <div>
              <h3 className="font-semibold text-gray-900">Procesando: {nombreArchivo}</h3>
              <p className="text-sm text-gray-500">
                Fila {stats.procesados.toLocaleString()} de {stats.total.toLocaleString()}
              </p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mb-4">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>{stats.insertados.toLocaleString()} insertados</span>
              <span>{progreso}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className="bg-blue-600 h-3 rounded-full transition-all duration-500"
                style={{ width: `${progreso}%` }}
              />
            </div>
          </div>

          <div className="flex justify-between text-xs text-gray-400 mb-4">
            <span>{stats.actualizados > 0 ? `${stats.actualizados} actualizados` : ''}</span>
            <span>{stats.errores > 0 ? `${stats.errores} errores` : ''}</span>
          </div>

          <p className="text-xs text-gray-400 mb-4">
            Puedes cerrar esta pestaña — al volver la carga continuará desde donde se quedó.
          </p>

          <div className="flex justify-end">
            <Button variant="danger" onClick={handleCancelar}>Cancelar</Button>
          </div>
        </Card>
      )}

      {/* ═══ COMPLETED ═══ */}
      {estado === 'completado' && (
        <Card className="p-8 text-center">
          <CheckCircle className="mx-auto mb-4 text-green-500" size={48} />
          <h3 className="text-xl font-bold text-gray-900 mb-2">Carga completada</h3>
          <p className="text-sm text-gray-500 mb-6">{nombreArchivo}</p>

          <div className="flex justify-center gap-8 mb-6">
            <div>
              <p className="text-3xl font-bold text-green-600">{stats.insertados.toLocaleString()}</p>
              <p className="text-sm text-gray-500">Insertados</p>
            </div>
            {stats.actualizados > 0 && (
              <div>
                <p className="text-3xl font-bold text-blue-600">{stats.actualizados.toLocaleString()}</p>
                <p className="text-sm text-gray-500">Actualizados</p>
              </div>
            )}
            {stats.errores > 0 && (
              <div>
                <p className="text-3xl font-bold text-red-600">{stats.errores.toLocaleString()}</p>
                <p className="text-sm text-gray-500">Errores</p>
              </div>
            )}
          </div>

          <Button onClick={resetTodo}>Cargar más archivos</Button>
        </Card>
      )}

      {/* ═══ ERROR ═══ */}
      {estado === 'error' && (
        <Card className="p-8 text-center">
          <XCircle className="mx-auto mb-4 text-red-500" size={48} />
          <h3 className="text-xl font-bold text-gray-900 mb-2">Error en la carga</h3>
          {errorMsg && <p className="text-sm text-red-600 mb-4 font-mono">{errorMsg}</p>}
          <Button onClick={resetTodo}>Intentar de nuevo</Button>
        </Card>
      )}
    </div>
  )
}

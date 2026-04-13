import { useState, useRef } from 'react'
import { Upload, FileSpreadsheet, CheckCircle, XCircle, Loader2, ArrowRight, ArrowLeft, X, File, ChevronDown, ChevronRight } from 'lucide-react'
import * as XLSX from 'xlsx'
import { useAuth } from '../context/AuthContext'
import Card from '../components/UI/Card'
import Button from '../components/UI/Button'

// ─── Config ───

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const CHUNK_SIZE = 1000

const CAMPOS_SISTEMA = [
  'cups', 'dni', 'nombre', 'direccion', 'campana', 'estado',
  'fecha_alta', 'fecha_baja', 'fecha_activacion', 'fecha_ultimo_cambio',
  'Telefono1', 'Telefono2', 'EMAIL', 'IBAN', 'TITULAR',
  'MUNICIPIO', 'PROVINCIA', 'Codigo Postal', 'Compañia',
  'Via', 'Numero', 'Portal', 'Escalera', 'Piso', 'Puerta',
  'Apellido1', 'Apellido2',
  '[ignorar]',
]

const CAMPOS_BD = new Set([
  'cups', 'dni', 'nombre', 'direccion', 'campana', 'estado',
  'fecha_alta', 'fecha_baja', 'fecha_activacion', 'fecha_ultimo_cambio', 'oficina_id',
])

const AUTO_MAP = {
  cups: 'cups', 'id cups': 'cups', id_cups: 'cups',
  dni: 'dni', nif: 'dni', cif: 'dni', 'dni/nif': 'dni', documento: 'dni',
  nombre: 'nombre', 'nombre completo': 'nombre', nombre_completo: 'nombre',
  'razon social': 'nombre', titular: 'nombre',
  direccion: 'direccion', dirección: 'direccion', domicilio: 'direccion',
  campana: 'campana', campaña: 'campana', comercializadora: 'campana', compañia: 'Compañia',
  estado: 'estado', status: 'estado', situacion: 'estado',
  fecha_alta: 'fecha_alta', 'fecha alta': 'fecha_alta', alta: 'fecha_alta',
  fecha_baja: 'fecha_baja', 'fecha baja': 'fecha_baja', baja: 'fecha_baja',
  fecha_activacion: 'fecha_activacion', 'fecha activacion': 'fecha_activacion',
  'fecha activación': 'fecha_activacion', activacion: 'fecha_activacion',
  fecha_ultimo_cambio: 'fecha_ultimo_cambio', 'fecha ultimo cambio': 'fecha_ultimo_cambio',
  telefono1: 'Telefono1', 'telefono 1': 'Telefono1', 'telefon 1': 'Telefono1',
  telefono: 'Telefono1', tel1: 'Telefono1', movil: 'Telefono1', móvil: 'Telefono1',
  telefono2: 'Telefono2', 'telefono 2': 'Telefono2', 'telefon 2': 'Telefono2', tel2: 'Telefono2',
  email: 'EMAIL', correo: 'EMAIL', 'correo electronico': 'EMAIL', 'e-mail': 'EMAIL',
  iban: 'IBAN', cuenta: 'IBAN', 'cuenta bancaria': 'IBAN',
  municipio: 'MUNICIPIO', poblacion: 'MUNICIPIO', ciudad: 'MUNICIPIO', localidad: 'MUNICIPIO',
  provincia: 'PROVINCIA',
  'codigo postal': 'Codigo Postal', cp: 'Codigo Postal', codigopostal: 'Codigo Postal',
  via: 'Via', 'tipo via': 'Via', numero: 'Numero', num: 'Numero', 'nº': 'Numero',
  portal: 'Portal', escalera: 'Escalera', esc: 'Escalera',
  piso: 'Piso', planta: 'Piso', puerta: 'Puerta', pta: 'Puerta',
  apellido1: 'Apellido1', 'apellido 1': 'Apellido1', 'primer apellido': 'Apellido1',
  apellido2: 'Apellido2', 'apellido 2': 'Apellido2', 'segundo apellido': 'Apellido2',
}

function autoDetect(header) {
  return AUTO_MAP[header.toLowerCase().trim()] || null
}

function autoDetectMapeo(hdrs) {
  const detected = {}
  const used = new Set()
  for (const h of hdrs) {
    const campo = autoDetect(h)
    if (campo && !used.has(campo)) {
      detected[h] = campo
      used.add(campo)
    } else {
      detected[h] = '[ignorar]'
    }
  }
  return detected
}

function limpiarDni(raw) {
  if (!raw) return null
  const s = String(raw).trim()
  if (!s) return null
  const m = s.match(/([A-Za-z]?\d{7,8}[A-Za-z]?)/)
  if (m) return m[1].toUpperCase()
  const c = s.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  if (c.length >= 8 && c.length <= 10) return c
  return s
}

function parseFecha(val) {
  if (!val) return null
  if (typeof val === 'number') {
    const d = XLSX.SSF.parse_date_code(val)
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  const s = String(val).trim()
  const m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10)
  return null
}

function str(v) {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s || null
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1048576).toFixed(1) + ' MB'
}

// ─── Component ───

export default function CargaMasiva() {
  const { usuario } = useAuth()
  const cancelRef = useRef(false)

  // paso: 1=upload, 2=mapeo(single), 3=cola(multi), 4=procesando, 5=resultado
  const [paso, setPaso] = useState(1)
  const [dragOver, setDragOver] = useState(false)

  // Single file mode
  const [archivo, setArchivo] = useState(null)
  const [headers, setHeaders] = useState([])
  const [muestras, setMuestras] = useState({})
  const [mapeo, setMapeo] = useState({})

  // Multi file mode
  const [colaArchivos, setColaArchivos] = useState([]) // [{file, name, size, status, result}]

  // Progress & results
  const [archivoActualIdx, setArchivoActualIdx] = useState(0)
  const [progreso, setProgreso] = useState(0)
  const [stats, setStats] = useState({ total: 0, procesados: 0, insertados: 0, actualizados: 0, errores: 0 })
  const [resultadosPorArchivo, setResultadosPorArchivo] = useState([])
  const [errorMsg, setErrorMsg] = useState(null)
  const [expandDetalle, setExpandDetalle] = useState(false)

  // ── Mapear registro ──

  function crearMapearRegistro(mapeoLocal) {
    return function mapearRegistro(row) {
      const reg = { datos_extra: {} }
      for (const [header, campo] of Object.entries(mapeoLocal)) {
        if (campo === '[ignorar]') continue
        const raw = row[header]
        const val = str(raw)
        if (CAMPOS_BD.has(campo)) {
          if (campo === 'dni') reg.dni = limpiarDni(raw)
          else if (campo.startsWith('fecha')) reg[campo] = parseFecha(raw)
          else if (campo === 'campana') reg.campana = val ? val.toUpperCase().replace('Ñ', 'N') : null
          else reg[campo] = val
        } else {
          if (val) reg.datos_extra[campo] = val
        }
      }
      const ap1 = reg.datos_extra.Apellido1
      const ap2 = reg.datos_extra.Apellido2
      if (ap1 || ap2) {
        reg.nombre = [reg.nombre, ap1, ap2].filter(Boolean).join(' ') || null
        delete reg.datos_extra.Apellido1
        delete reg.datos_extra.Apellido2
      }
      const dirParts = ['Via', 'Numero', 'Portal', 'Escalera', 'Piso', 'Puerta']
      const parts = dirParts.map(k => reg.datos_extra[k]).filter(Boolean)
      if (parts.length > 0) {
        reg.direccion = reg.direccion ? reg.direccion + ', ' + parts.join(' ') : parts.join(' ')
        dirParts.forEach(k => delete reg.datos_extra[k])
      }
      reg.oficina_id = usuario?.oficina_id || null
      if (Object.keys(reg.datos_extra).length === 0) reg.datos_extra = null
      return reg
    }
  }

  // ── Core: process one file ──

  async function procesarUnArchivo(file, mapeoLocal, onProgress) {
    const buffer = await file.arrayBuffer()
    const wb = XLSX.read(buffer, { type: 'array', dense: false, cellDates: false, cellNF: false, cellHTML: false })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
    const totalFilas = range.e.r

    const colHeaders = []
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r: 0, c })]
      colHeaders.push(cell ? String(cell.v) : `col_${c}`)
    }

    const mapearRegistro = crearMapearRegistro(mapeoLocal)
    let insertados = 0, actualizados = 0, errores = 0
    const cupsVistos = new Set()

    for (let rowStart = 1; rowStart <= totalFilas; rowStart += CHUNK_SIZE) {
      if (cancelRef.current) break

      const rowEnd = Math.min(rowStart + CHUNK_SIZE - 1, totalFilas)
      const batch = []

      for (let r = rowStart; r <= rowEnd; r++) {
        const obj = {}
        let hasData = false
        for (let c = range.s.c; c <= range.e.c; c++) {
          const cell = ws[XLSX.utils.encode_cell({ r, c })]
          const val = cell ? String(cell.v ?? '') : ''
          obj[colHeaders[c - range.s.c]] = val
          if (val) hasData = true
        }
        if (!hasData) continue

        const reg = mapearRegistro(obj)
        const cups = reg.cups?.trim()
        if (cups) {
          if (!cupsVistos.has(cups)) { cupsVistos.add(cups); batch.push(reg) }
        } else {
          batch.push(reg)
        }
      }

      if (batch.length > 0) {
        try {
          const t0 = performance.now()
          const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/bulk_upsert_clientes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Prefer': 'return=representation' },
            body: JSON.stringify({ registros: batch }),
          })
          const elapsed = ((performance.now() - t0) / 1000).toFixed(1)
          if (!res.ok) {
            const t = await res.text()
            console.error(`Supabase error (${elapsed}s, ${batch.length} registros):`, res.status, t.slice(0, 300))
            errores += batch.length
          } else {
            const r = await res.json()
            console.log(`Chunk OK (${elapsed}s): ${batch.length} enviados → ${r.insertados} nuevos, ${r.actualizados} actualizados`)
            insertados += r.insertados || 0
            actualizados += r.actualizados || 0
          }
        } catch (err) {
          console.error('Fetch error:', err.message)
          errores += batch.length
        }
      }

      onProgress(totalFilas > 0 ? Math.round(((rowEnd) / totalFilas) * 100) : 100, {
        total: totalFilas, procesados: rowEnd, insertados, actualizados, errores,
      })

      await new Promise(resolve => setTimeout(resolve, 0))
    }

    cupsVistos.clear()
    return { insertados, actualizados, errores, total: totalFilas }
  }

  // ── Handlers ──

  function handleFiles(e) {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    recibirArchivos(files)
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
    recibirArchivos(files)
  }

  function recibirArchivos(files) {
    const valid = files.filter(f => /\.(xlsx|xls|csv)$/i.test(f.name))
    if (valid.length === 0) return

    if (valid.length === 1) {
      // Single file → show mapping screen
      seleccionarArchivo(valid[0])
    } else {
      // Multiple files → show queue
      setColaArchivos(valid.map(f => ({ file: f, name: f.name, size: f.size, status: 'pendiente', result: null })))
      setPaso(3)
    }
  }

  function seleccionarArchivo(file) {
    setArchivo(file)
    setErrorMsg(null)
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array', sheetRows: 3 })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
        if (data.length < 1) { setErrorMsg('Archivo vacío'); return }
        const hdrs = data[0].map(h => String(h || '').trim()).filter(Boolean)
        setHeaders(hdrs)
        const samples = {}
        if (data[1]) hdrs.forEach((h, i) => { samples[h] = data[1][i] != null ? String(data[1][i]).slice(0, 50) : '' })
        setMuestras(samples)
        setMapeo(autoDetectMapeo(hdrs))
        setPaso(2)
      } catch (err) {
        setErrorMsg('Error al leer: ' + err.message)
      }
    }
    reader.readAsArrayBuffer(file)
  }

  function quitarDeCola(idx) {
    setColaArchivos(prev => prev.filter((_, i) => i !== idx))
  }

  // ── Iniciar carga (single file with mapping) ──

  async function iniciarCargaSingle() {
    if (!archivo) return
    cancelRef.current = false
    setPaso(4)
    setProgreso(0)
    setStats({ total: 0, procesados: 0, insertados: 0, actualizados: 0, errores: 0 })
    setResultadosPorArchivo([])
    setArchivoActualIdx(0)

    try {
      const result = await procesarUnArchivo(archivo, mapeo, (pct, s) => {
        setProgreso(pct)
        setStats(s)
      })
      setResultadosPorArchivo([{ name: archivo.name, ...result }])
      setStats(result)
      setProgreso(100)
      setPaso(5)
    } catch (err) {
      setErrorMsg(err.message)
      setPaso(5)
    }
  }

  // ── Iniciar carga (multi files with auto-mapping) ──

  async function iniciarCargaCola() {
    cancelRef.current = false
    setPaso(4)
    setProgreso(0)
    setResultadosPorArchivo([])

    const resultados = []
    let totalInsertados = 0, totalActualizados = 0, totalErrores = 0, totalFilas = 0
    const updated = [...colaArchivos]

    for (let i = 0; i < updated.length; i++) {
      if (cancelRef.current) break
      setArchivoActualIdx(i)

      updated[i] = { ...updated[i], status: 'procesando' }
      setColaArchivos([...updated])

      try {
        // Auto-detect mapping for this file
        const buffer = await updated[i].file.arrayBuffer()
        const wb = XLSX.read(buffer, { type: 'array', sheetRows: 2 })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
        const hdrs = (data[0] || []).map(h => String(h || '').trim()).filter(Boolean)
        const fileMapeo = autoDetectMapeo(hdrs)

        const result = await procesarUnArchivo(updated[i].file, fileMapeo, (pct, s) => {
          setProgreso(pct)
          setStats({
            total: totalFilas + s.total,
            procesados: totalFilas + s.procesados,
            insertados: totalInsertados + s.insertados,
            actualizados: totalActualizados + s.actualizados,
            errores: totalErrores + s.errores,
          })
        })

        totalInsertados += result.insertados
        totalActualizados += result.actualizados
        totalErrores += result.errores
        totalFilas += result.total

        updated[i] = { ...updated[i], status: 'completado', result }
        resultados.push({ name: updated[i].name, ...result })
      } catch (err) {
        updated[i] = { ...updated[i], status: 'error', result: { error: err.message } }
        resultados.push({ name: updated[i].name, insertados: 0, actualizados: 0, errores: 0, error: err.message })
      }

      setColaArchivos([...updated])
    }

    setResultadosPorArchivo(resultados)
    setStats({ total: totalFilas, procesados: totalFilas, insertados: totalInsertados, actualizados: totalActualizados, errores: totalErrores })
    setProgreso(100)
    setPaso(5)
  }

  function resetTodo() {
    setPaso(1)
    setArchivo(null)
    setHeaders([])
    setMuestras({})
    setMapeo({})
    setColaArchivos([])
    setProgreso(0)
    setStats({ total: 0, procesados: 0, insertados: 0, actualizados: 0, errores: 0 })
    setResultadosPorArchivo([])
    setErrorMsg(null)
    setExpandDetalle(false)
    cancelRef.current = false
  }

  const mapeados = Object.values(mapeo).filter(v => v !== '[ignorar]').length

  // ─── UI ───

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Carga Masiva</h2>

      {/* ═══ PASO 1: Upload ═══ */}
      {paso === 1 && (
        <Card className="p-8">
          <div
            className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}`}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            <Upload className="mx-auto mb-4 text-gray-400" size={48} />
            <h3 className="text-lg font-semibold text-gray-700 mb-2">Arrastra tus archivos aquí</h3>
            <p className="text-sm text-gray-500 mb-4">Uno o varios archivos .xlsx, .xls, .csv</p>
            <label className="inline-block">
              <input type="file" multiple accept=".xlsx,.xls,.csv" onChange={handleFiles} className="hidden" />
              <span className="inline-flex items-center gap-2 px-4 py-2 bg-blue-800 text-white rounded-lg text-sm font-medium cursor-pointer hover:bg-blue-900">
                <FileSpreadsheet size={16} /> Seleccionar archivos
              </span>
            </label>
          </div>
          {errorMsg && <p className="mt-4 text-sm text-red-600 text-center">{errorMsg}</p>}
        </Card>
      )}

      {/* ═══ PASO 2: Mapeo columnas (single file) ═══ */}
      {paso === 2 && (
        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-gray-900">{archivo?.name}</h3>
                <p className="text-sm text-gray-500">{headers.length} columnas · {mapeados} mapeadas</p>
              </div>
              <Button variant="secondary" onClick={resetTodo}><ArrowLeft size={14} /> Cambiar</Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Excel</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Campo</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Ejemplo</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {headers.map(h => (
                    <tr key={h} className={mapeo[h] === '[ignorar]' ? 'opacity-40' : ''}>
                      <td className="px-3 py-2 font-mono text-xs">{h}</td>
                      <td className="px-3 py-2">
                        <select value={mapeo[h] || '[ignorar]'} onChange={e => setMapeo(prev => ({ ...prev, [h]: e.target.value }))}
                          className={`w-full text-xs border rounded px-2 py-1.5 ${mapeo[h] === '[ignorar]' ? 'border-gray-200 text-gray-400' : 'border-blue-300'}`}>
                          {CAMPOS_SISTEMA.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-500 max-w-[200px] truncate">{muestras[h] || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={resetTodo}>Cancelar</Button>
            <Button onClick={iniciarCargaSingle} disabled={mapeados === 0}><ArrowRight size={14} /> Iniciar carga</Button>
          </div>
        </div>
      )}

      {/* ═══ PASO 3: Cola de archivos (multi) ═══ */}
      {paso === 3 && (
        <div className="space-y-4">
          <Card className="p-4">
            <h3 className="font-semibold text-gray-900 mb-3">{colaArchivos.length} archivos seleccionados</h3>
            <p className="text-xs text-gray-500 mb-3">Se usará mapeo automático de columnas para cada archivo.</p>
            <div className="space-y-1 max-h-80 overflow-y-auto">
              {colaArchivos.map((a, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg text-xs">
                  <File size={14} className="text-gray-400 shrink-0" />
                  <span className="font-medium text-gray-700 flex-1 truncate">{a.name}</span>
                  <span className="text-gray-400">{formatSize(a.size)}</span>
                  <button onClick={() => quitarDeCola(i)} className="p-0.5 hover:bg-gray-200 rounded text-gray-400 hover:text-red-500">
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          </Card>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={resetTodo}>Cancelar</Button>
            <Button onClick={iniciarCargaCola} disabled={colaArchivos.length === 0}>
              <ArrowRight size={14} /> Iniciar carga de {colaArchivos.length} archivos
            </Button>
          </div>
        </div>
      )}

      {/* ═══ PASO 4: Procesando ═══ */}
      {paso === 4 && (
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <Loader2 size={24} className="text-blue-600 animate-spin" />
            <div>
              <h3 className="font-semibold text-gray-900">
                {colaArchivos.length > 0
                  ? `Archivo ${archivoActualIdx + 1} de ${colaArchivos.length}: ${colaArchivos[archivoActualIdx]?.name}`
                  : archivo?.name}
              </h3>
              <p className="text-sm text-gray-500">
                Fila {stats.procesados?.toLocaleString()} de {stats.total?.toLocaleString()}
              </p>
            </div>
          </div>
          <div className="mb-4">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>{stats.insertados?.toLocaleString()} insertados{stats.actualizados > 0 ? `, ${stats.actualizados} actualizados` : ''}</span>
              <span>{progreso}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div className="bg-blue-600 h-3 rounded-full transition-all duration-500" style={{ width: `${progreso}%` }} />
            </div>
          </div>
          {colaArchivos.length > 1 && (
            <div className="mb-4">
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>Progreso global</span>
                <span>{archivoActualIdx + 1} / {colaArchivos.length}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-1.5">
                <div className="bg-green-500 h-1.5 rounded-full transition-all" style={{ width: `${((archivoActualIdx + 1) / colaArchivos.length) * 100}%` }} />
              </div>
            </div>
          )}
          <div className="flex justify-end">
            <Button variant="danger" onClick={() => { cancelRef.current = true }}>Cancelar</Button>
          </div>
        </Card>
      )}

      {/* ═══ PASO 5: Resultado ═══ */}
      {paso === 5 && (
        <div className="space-y-4">
          <Card className="p-6">
            <div className="text-center mb-6">
              {stats.errores > 0 && stats.insertados === 0 ? (
                <XCircle className="mx-auto mb-3 text-red-500" size={48} />
              ) : (
                <CheckCircle className="mx-auto mb-3 text-green-500" size={48} />
              )}
              <h3 className="text-xl font-bold text-gray-900">Carga completada</h3>
              {resultadosPorArchivo.length === 1 && <p className="text-sm text-gray-500">{resultadosPorArchivo[0].name}</p>}
              {resultadosPorArchivo.length > 1 && <p className="text-sm text-gray-500">{resultadosPorArchivo.length} archivos procesados</p>}
            </div>

            {errorMsg && <p className="text-sm text-red-600 mb-4 font-mono break-all text-center">{errorMsg}</p>}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                <p className="text-3xl font-bold text-green-600">{stats.insertados?.toLocaleString()}</p>
                <p className="text-xs text-green-700 mt-1">Nuevos</p>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
                <p className="text-3xl font-bold text-blue-600">{stats.actualizados?.toLocaleString()}</p>
                <p className="text-xs text-blue-700 mt-1">Actualizados</p>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center">
                <p className="text-3xl font-bold text-gray-600">{stats.total?.toLocaleString()}</p>
                <p className="text-xs text-gray-500 mt-1">Total filas</p>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
                <p className="text-3xl font-bold text-red-600">{stats.errores?.toLocaleString()}</p>
                <p className="text-xs text-red-700 mt-1">Errores</p>
              </div>
            </div>

            {/* Per-file detail (collapsible) */}
            {resultadosPorArchivo.length > 1 && (
              <div className="mb-4">
                <button onClick={() => setExpandDetalle(!expandDetalle)}
                  className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900 w-full text-left px-2 py-1">
                  {expandDetalle ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  Detalle por archivo ({resultadosPorArchivo.length})
                </button>
                {expandDetalle && (
                  <div className="mt-2 space-y-1">
                    {resultadosPorArchivo.map((r, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded text-xs">
                        {r.error ? <XCircle size={14} className="text-red-500 shrink-0" /> : <CheckCircle size={14} className="text-green-500 shrink-0" />}
                        <span className="font-medium text-gray-700 flex-1 truncate">{r.name}</span>
                        {r.error ? (
                          <span className="text-red-500">{r.error}</span>
                        ) : (
                          <span className="text-gray-500">
                            <span className="text-green-600">{r.insertados}</span> nuevos,{' '}
                            <span className="text-blue-600">{r.actualizados}</span> act,{' '}
                            <span className="text-red-600">{r.errores}</span> err
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Card>

          <div className="flex justify-center">
            <Button onClick={resetTodo}>Cargar más archivos</Button>
          </div>
        </div>
      )}
    </div>
  )
}

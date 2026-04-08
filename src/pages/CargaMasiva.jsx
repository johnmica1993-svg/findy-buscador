import { useState, useRef } from 'react'
import { Upload, FileSpreadsheet, AlertTriangle, CheckCircle, Pencil, X, ArrowRight, Loader2, File, XCircle } from 'lucide-react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Card from '../components/UI/Card'
import Button from '../components/UI/Button'

const CAMPOS_BD = [
  'cups', 'dni', 'nombre', 'direccion', 'campana',
  'fecha_alta', 'fecha_activacion', 'fecha_ultimo_cambio', 'fecha_baja', 'estado',
]

const COLUMN_MAP = {
  cups: ['cups', 'CUPS', 'Cups'],
  dni: ['dni', 'DNI', 'nif', 'NIF', 'Dni', 'Nif'],
  nombre: ['nombre', 'Nombre', 'NOMBRE', 'razon social', 'Razón Social', 'RAZON SOCIAL'],
  direccion: ['direccion', 'Dirección', 'DIRECCION', 'Direccion', 'dirección'],
  campana: ['campana', 'campaña', 'Campaña', 'CAMPAÑA', 'Campana', 'CAMPANA'],
  fecha_alta: ['fecha_alta', 'Fecha Alta', 'FECHA ALTA', 'fecha alta', 'FechaAlta'],
  fecha_activacion: ['fecha_activacion', 'Fecha Activación', 'FECHA ACTIVACION', 'fecha activacion', 'Fecha Activacion', 'FechaActivacion'],
  fecha_ultimo_cambio: ['fecha_ultimo_cambio', 'Fecha Último Cambio', 'FECHA ULTIMO CAMBIO', 'fecha ultimo cambio'],
  fecha_baja: ['fecha_baja', 'Fecha Baja', 'FECHA BAJA', 'fecha baja'],
  estado: ['estado', 'Estado', 'ESTADO'],
}

function detectarMapeo(hdrs) {
  const mapeo = {}
  const usados = new Set()
  for (const h of hdrs) {
    const hTrim = h?.trim()
    if (!hTrim) continue
    for (const [campo, variantes] of Object.entries(COLUMN_MAP)) {
      if (!usados.has(campo) && variantes.includes(hTrim)) {
        mapeo[hTrim] = campo
        usados.add(campo)
        break
      }
    }
    if (!mapeo[hTrim]) mapeo[hTrim] = `extra:${hTrim}`
  }
  return mapeo
}

function headersIguales(a, b) {
  if (a.length !== b.length) return false
  return a.every((h, i) => h === b[i])
}

function reutilizarMapeo(mapeoBase, headersNuevos) {
  const mapeo = {}
  for (const h of headersNuevos) {
    mapeo[h] = mapeoBase[h] || `extra:${h}`
  }
  return mapeo
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

function leerArchivo(file) {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 })
        if (data.length < 2) {
          resolve({ headers: [], rows: [], error: 'Sin datos' })
          return
        }
        const headers = data[0].map(h => String(h || '').trim()).filter(Boolean)
        const rows = data.slice(1).filter(r => r.some(c => c !== null && c !== undefined && c !== ''))
        resolve({ headers, rows })
      } catch {
        resolve({ headers: [], rows: [], error: 'Error al leer archivo' })
      }
    }
    reader.readAsArrayBuffer(file)
  })
}

function esNoMapeado(d) { return !d || d === '' }

// Status icons
const STATUS_ICON = {
  pendiente: <File size={14} className="text-gray-400" />,
  mapeoPendiente: <AlertTriangle size={14} className="text-yellow-500" />,
  procesando: <Loader2 size={14} className="text-blue-600 animate-spin" />,
  completado: <CheckCircle size={14} className="text-green-500" />,
  error: <XCircle size={14} className="text-red-500" />,
}

export default function CargaMasiva() {
  const { usuario } = useAuth()
  const cancelRef = useRef(false)

  // Step: 1=upload, 2=mapeo, 3=procesando, 4=resultado
  const [step, setStep] = useState(1)
  const [archivos, setArchivos] = useState([]) // [{name, file, headers, rows, mapeo, status, result}]
  const [mapeoBase, setMapeoBase] = useState({})
  const [archivoMapeoIdx, setArchivoMapeoIdx] = useState(null) // index needing custom mapping
  const [editandoCampo, setEditandoCampo] = useState(null)
  const [customName, setCustomName] = useState('')
  const [dragOver, setDragOver] = useState(false)

  // Progress
  const [progreso, setProgreso] = useState({ archivoIdx: 0, filaActual: 0, filasTotal: 0, archivoNombre: '' })
  const [resultadoGlobal, setResultadoGlobal] = useState({ cargados: 0, duplicados: 0, errores: 0 })

  // Collect files from input or drop
  async function agregarArchivos(fileList) {
    const validExts = ['.xlsx', '.xls', '.csv']
    const files = Array.from(fileList).filter(f =>
      validExts.some(ext => f.name.toLowerCase().endsWith(ext))
    )
    if (files.length === 0) return

    const nuevos = []
    for (const file of files) {
      const { headers, rows, error } = await leerArchivo(file)
      nuevos.push({
        name: file.name,
        file,
        headers,
        rows,
        mapeo: {},
        status: error ? 'error' : 'pendiente',
        result: error ? { error } : null,
        totalRows: rows.length,
      })
    }

    setArchivos(prev => [...prev, ...nuevos])

    // If this is the first batch, auto-detect mapping from first valid file
    const firstValid = nuevos.find(a => a.status !== 'error')
    if (firstValid && Object.keys(mapeoBase).length === 0) {
      const detected = detectarMapeo(firstValid.headers)
      setMapeoBase(detected)
    }

    setStep(2)
  }

  function handleFiles(e) {
    if (e.target.files) agregarArchivos(e.target.files)
    e.target.value = ''
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragOver(false)
    const items = e.dataTransfer.items
    const files = []

    if (items) {
      for (const item of items) {
        if (item.kind === 'file') {
          const file = item.getAsFile()
          if (file) files.push(file)
        }
      }
    } else {
      for (const file of e.dataTransfer.files) files.push(file)
    }

    if (files.length > 0) agregarArchivos(files)
  }

  function eliminarArchivo(idx) {
    setArchivos(prev => prev.filter((_, i) => i !== idx))
  }

  function updateMapeoBase(header, destino) {
    setMapeoBase(prev => ({ ...prev, [header]: destino }))
  }

  function guardarCustomNameBase(header) {
    const name = customName.trim()
    if (name) {
      const dest = CAMPOS_BD.includes(name) ? name : `extra:${name}`
      updateMapeoBase(header, dest)
    }
    setEditandoCampo(null)
    setCustomName('')
  }

  // Check which files need custom mapping (different headers)
  function getMapeoHeaders() {
    const firstValid = archivos.find(a => a.status !== 'error')
    return firstValid?.headers || []
  }

  function archivoNecesitaMapeo(archivo) {
    const baseHeaders = getMapeoHeaders()
    if (baseHeaders.length === 0 || archivo.status === 'error') return false
    return !headersIguales(archivo.headers, baseHeaders)
  }

  // Build clientes from rows using a mapeo
  function buildClientes(rows, headers, mapeo) {
    const campoToIdx = {}
    const extraFields = []
    for (const [excelHeader, destino] of Object.entries(mapeo)) {
      const colIdx = headers.indexOf(excelHeader)
      if (colIdx < 0 || !destino || destino === '') continue
      if (destino.startsWith('extra:')) {
        extraFields.push({ name: destino.slice(6), colIdx })
      } else {
        campoToIdx[destino] = colIdx
      }
    }

    const clientes = []
    const errs = []
    const cupsVistos = new Set()

    rows.forEach((row, idx) => {
      const getVal = (campo) => {
        const colIdx = campoToIdx[campo]
        return colIdx !== undefined ? row[colIdx] : null
      }

      const cups = String(getVal('cups') || '').trim()
      if (!cups) { errs.push({ fila: idx + 2, error: 'CUPS vacío' }); return }
      if (cupsVistos.has(cups)) { errs.push({ fila: idx + 2, error: `CUPS duplicado: ${cups}` }); return }
      cupsVistos.add(cups)

      let datos_extra = null
      if (extraFields.length > 0) {
        datos_extra = {}
        for (const { name, colIdx } of extraFields) {
          const v = row[colIdx]
          if (v !== null && v !== undefined && v !== '') {
            datos_extra[name] = typeof v === 'object' && v instanceof Date ? v.toISOString().split('T')[0] : String(v)
          }
        }
        if (Object.keys(datos_extra).length === 0) datos_extra = null
      }

      const estadoRaw = getVal('estado')

      clientes.push({
        cups,
        dni: String(getVal('dni') || '').trim() || null,
        nombre: String(getVal('nombre') || '').trim() || null,
        direccion: String(getVal('direccion') || '').trim() || null,
        campana: String(getVal('campana') || '').trim().toUpperCase().replace('Ñ', 'N') || null,
        fecha_alta: parseFecha(getVal('fecha_alta')),
        fecha_activacion: parseFecha(getVal('fecha_activacion')),
        fecha_ultimo_cambio: parseFecha(getVal('fecha_ultimo_cambio')),
        fecha_baja: parseFecha(getVal('fecha_baja')),
        estado: estadoRaw ? String(estadoRaw).trim() : null,
        datos_extra,
        oficina_id: usuario?.oficina_id || null,
        created_by: usuario?.id,
      })
    })

    return { clientes, errores: errs }
  }

  async function iniciarCarga() {
    // Check if any file needs custom mapping
    const needsMapping = archivos.findIndex((a, i) => a.status !== 'error' && archivoNecesitaMapeo(a) && !a.mapeo._custom)
    if (needsMapping >= 0) {
      setArchivoMapeoIdx(needsMapping)
      return
    }

    cancelRef.current = false
    setStep(3)
    let totalCargados = 0, totalDuplicados = 0, totalErrores = 0

    const updated = [...archivos]

    for (let i = 0; i < updated.length; i++) {
      if (cancelRef.current) break
      const archivo = updated[i]
      if (archivo.status === 'error') continue

      updated[i] = { ...updated[i], status: 'procesando' }
      setArchivos([...updated])

      // Determine mapeo for this file
      const fileMapeo = archivo.mapeo._custom
        ? archivo.mapeo
        : headersIguales(archivo.headers, getMapeoHeaders())
          ? mapeoBase
          : reutilizarMapeo(mapeoBase, archivo.headers)

      const { clientes, errores } = buildClientes(archivo.rows, archivo.headers, fileMapeo)

      let cargados = 0, duplicados = 0, erroresCarga = errores.length
      const BATCH_SIZE = 100

      for (let j = 0; j < clientes.length; j += BATCH_SIZE) {
        if (cancelRef.current) break

        setProgreso({
          archivoIdx: i + 1,
          archivoNombre: archivo.name,
          filaActual: Math.min(j + BATCH_SIZE, clientes.length),
          filasTotal: clientes.length,
        })

        const batch = clientes.slice(j, j + BATCH_SIZE)
        const { data, error } = await supabase
          .from('clientes')
          .upsert(batch, { onConflict: 'cups', ignoreDuplicates: true })
          .select()

        if (error) {
          erroresCarga += batch.length
        } else {
          cargados += data?.length || 0
          duplicados += batch.length - (data?.length || 0)
        }
      }

      updated[i] = {
        ...updated[i],
        status: erroresCarga > 0 && cargados === 0 ? 'error' : 'completado',
        result: { cargados, duplicados, errores: erroresCarga },
      }
      setArchivos([...updated])

      totalCargados += cargados
      totalDuplicados += duplicados
      totalErrores += erroresCarga
    }

    setResultadoGlobal({ cargados: totalCargados, duplicados: totalDuplicados, errores: totalErrores })
    setStep(4)
  }

  function confirmarMapeoArchivo(idx, mapeo) {
    const updated = [...archivos]
    updated[idx] = { ...updated[idx], mapeo: { ...mapeo, _custom: true } }
    setArchivos(updated)
    setArchivoMapeoIdx(null)
  }

  function resetTodo() {
    setStep(1)
    setArchivos([])
    setMapeoBase({})
    setArchivoMapeoIdx(null)
    setResultadoGlobal({ cargados: 0, duplicados: 0, errores: 0 })
    setProgreso({ archivoIdx: 0, filaActual: 0, filasTotal: 0, archivoNombre: '' })
    cancelRef.current = false
  }

  const totalFilas = archivos.reduce((s, a) => s + (a.status !== 'error' ? a.totalRows : 0), 0)
  const totalArchivosValidos = archivos.filter(a => a.status !== 'error').length
  const mapeoHeaders = getMapeoHeaders()

  return (
    <div className="max-w-5xl mx-auto">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Carga Masiva</h2>

      {/* ═══ STEP 1: Upload ═══ */}
      {step === 1 && (
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

      {/* ═══ STEP 2: Mapping + file list ═══ */}
      {step === 2 && (
        <div className="space-y-4">
          {/* File list */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900">
                {archivos.length} archivo{archivos.length !== 1 ? 's' : ''} · {totalFilas.toLocaleString()} filas
              </h3>
              <div className="flex gap-2">
                <label className="inline-block">
                  <input type="file" multiple accept=".xlsx,.xls,.csv" onChange={handleFiles} className="hidden" />
                  <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium cursor-pointer hover:bg-gray-200">
                    + Agregar más
                  </span>
                </label>
                <Button variant="secondary" className="text-xs" onClick={resetTodo}>Limpiar todo</Button>
              </div>
            </div>

            <div className="space-y-1 max-h-60 overflow-y-auto">
              {archivos.map((a, i) => (
                <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${
                  a.status === 'error' ? 'bg-red-50' : archivoNecesitaMapeo(a) ? 'bg-yellow-50' : 'bg-gray-50'
                }`}>
                  {STATUS_ICON[a.status === 'error' ? 'error' : archivoNecesitaMapeo(a) ? 'mapeoPendiente' : 'pendiente']}
                  <span className="font-medium text-gray-700 flex-1 truncate">{a.name}</span>
                  <span className="text-gray-500">{a.totalRows} filas</span>
                  {archivoNecesitaMapeo(a) && !a.mapeo._custom && (
                    <span className="text-yellow-600 text-[10px] font-medium">headers diferentes</span>
                  )}
                  {a.mapeo._custom && <span className="text-green-600 text-[10px] font-medium">mapeo custom</span>}
                  {a.status === 'error' && <span className="text-red-600">{a.result?.error}</span>}
                  <button onClick={() => eliminarArchivo(i)} className="p-0.5 hover:bg-gray-200 rounded text-gray-400 hover:text-red-500">
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          </Card>

          {/* Custom mapping modal for file with different headers */}
          {archivoMapeoIdx !== null && archivos[archivoMapeoIdx] && (
            <MappingCard
              titulo={`Mapeo para: ${archivos[archivoMapeoIdx].name}`}
              subtitulo="Este archivo tiene encabezados diferentes. Configura el mapeo."
              headers={archivos[archivoMapeoIdx].headers}
              mapeo={archivos[archivoMapeoIdx].mapeo._custom ? archivos[archivoMapeoIdx].mapeo : detectarMapeo(archivos[archivoMapeoIdx].headers)}
              preview={archivos[archivoMapeoIdx].rows.slice(0, 3)}
              onMapeoChange={(h, d) => {
                const updated = [...archivos]
                const m = updated[archivoMapeoIdx].mapeo._custom ? { ...updated[archivoMapeoIdx].mapeo } : detectarMapeo(updated[archivoMapeoIdx].headers)
                m[h] = d
                updated[archivoMapeoIdx] = { ...updated[archivoMapeoIdx], mapeo: m }
                setArchivos(updated)
              }}
              onConfirm={() => {
                const m = archivos[archivoMapeoIdx].mapeo._custom ? archivos[archivoMapeoIdx].mapeo : detectarMapeo(archivos[archivoMapeoIdx].headers)
                confirmarMapeoArchivo(archivoMapeoIdx, m)
              }}
              onCancel={() => setArchivoMapeoIdx(null)}
              editandoCampo={editandoCampo}
              setEditandoCampo={setEditandoCampo}
              customName={customName}
              setCustomName={setCustomName}
            />
          )}

          {/* Main mapping (from first file) */}
          {archivoMapeoIdx === null && mapeoHeaders.length > 0 && (
            <MappingCard
              titulo="Mapeo de columnas"
              subtitulo={`Basado en el primer archivo. Se reutiliza para todos los archivos con los mismos encabezados.`}
              headers={mapeoHeaders}
              mapeo={mapeoBase}
              preview={archivos.find(a => a.status !== 'error')?.rows.slice(0, 3) || []}
              onMapeoChange={updateMapeoBase}
              editandoCampo={editandoCampo}
              setEditandoCampo={setEditandoCampo}
              customName={customName}
              setCustomName={setCustomName}
              onCustomSave={guardarCustomNameBase}
            />
          )}

          <div className="flex justify-end gap-3">
            <Button
              onClick={iniciarCarga}
              disabled={totalArchivosValidos === 0 || !Object.values(mapeoBase).includes('cups')}
            >
              Cargar {totalArchivosValidos} archivo{totalArchivosValidos !== 1 ? 's' : ''} ({totalFilas.toLocaleString()} filas)
            </Button>
          </div>
        </div>
      )}

      {/* ═══ STEP 3: Processing ═══ */}
      {step === 3 && (
        <div className="space-y-4">
          <Card className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <Loader2 size={24} className="text-blue-600 animate-spin" />
              <div>
                <h3 className="font-semibold text-gray-900">Procesando archivos...</h3>
                <p className="text-sm text-gray-500">
                  Archivo {progreso.archivoIdx} de {totalArchivosValidos} — {progreso.archivoNombre}
                </p>
              </div>
            </div>

            {/* Global progress bar */}
            <div className="mb-3">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Fila {progreso.filaActual.toLocaleString()} de {progreso.filasTotal.toLocaleString()}</span>
                <span>{progreso.filasTotal > 0 ? Math.round(progreso.filaActual / progreso.filasTotal * 100) : 0}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div
                  className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                  style={{ width: `${progreso.filasTotal > 0 ? (progreso.filaActual / progreso.filasTotal * 100) : 0}%` }}
                />
              </div>
            </div>

            {/* File progress bar */}
            <div className="mb-4">
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>Progreso global</span>
                <span>Archivo {progreso.archivoIdx} / {totalArchivosValidos}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-1.5">
                <div
                  className="bg-green-500 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${totalArchivosValidos > 0 ? (progreso.archivoIdx / totalArchivosValidos * 100) : 0}%` }}
                />
              </div>
            </div>

            {/* File statuses */}
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {archivos.map((a, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded text-xs">
                  {STATUS_ICON[a.status]}
                  <span className={`flex-1 truncate ${a.status === 'procesando' ? 'font-medium text-blue-700' : 'text-gray-600'}`}>{a.name}</span>
                  {a.result && a.status !== 'error' && (
                    <span className="text-gray-400">
                      {a.result.cargados} ok · {a.result.duplicados} dup · {a.result.errores} err
                    </span>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-4 flex justify-end">
              <Button variant="danger" onClick={() => { cancelRef.current = true }}>
                Cancelar
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* ═══ STEP 4: Results ═══ */}
      {step === 4 && (
        <div className="space-y-4">
          <Card className="p-8 text-center">
            <CheckCircle className="mx-auto mb-4 text-green-500" size={48} />
            <h3 className="text-xl font-bold text-gray-900 mb-2">Carga completada</h3>
            <p className="text-sm text-gray-500 mb-6">{totalArchivosValidos} archivos procesados</p>

            <div className="flex justify-center gap-8 mb-6">
              <div>
                <p className="text-3xl font-bold text-green-600">{resultadoGlobal.cargados.toLocaleString()}</p>
                <p className="text-sm text-gray-500">Cargados</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-yellow-600">{resultadoGlobal.duplicados.toLocaleString()}</p>
                <p className="text-sm text-gray-500">Duplicados</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-red-600">{resultadoGlobal.errores.toLocaleString()}</p>
                <p className="text-sm text-gray-500">Errores</p>
              </div>
            </div>

            {/* Per-file breakdown */}
            <div className="text-left max-w-lg mx-auto">
              <h4 className="text-xs font-medium text-gray-500 mb-2 uppercase">Detalle por archivo</h4>
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {archivos.map((a, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 text-xs">
                    {STATUS_ICON[a.status]}
                    <span className="font-medium text-gray-700 flex-1 truncate">{a.name}</span>
                    {a.result && a.status !== 'error' ? (
                      <span className="text-gray-500">
                        <span className="text-green-600">{a.result.cargados}</span> /
                        <span className="text-yellow-600 ml-1">{a.result.duplicados}</span> /
                        <span className="text-red-600 ml-1">{a.result.errores}</span>
                      </span>
                    ) : a.result?.error ? (
                      <span className="text-red-500">{a.result.error}</span>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6">
              <Button onClick={resetTodo}>Cargar más archivos</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

// ─── Reusable Mapping Card ───
function MappingCard({ titulo, subtitulo, headers, mapeo, preview, onMapeoChange, onConfirm, onCancel, editandoCampo, setEditandoCampo, customName, setCustomName, onCustomSave }) {
  function guardarCustom(h) {
    const name = customName.trim()
    if (name) {
      const dest = CAMPOS_BD.includes(name) ? name : `extra:${name}`
      onMapeoChange(h, dest)
    }
    setEditandoCampo(null)
    setCustomName('')
  }

  const saveHandler = onCustomSave || guardarCustom

  return (
    <Card className="p-4">
      <div className="mb-3">
        <h4 className="text-sm font-semibold text-gray-900">{titulo}</h4>
        {subtitulo && <p className="text-xs text-gray-500">{subtitulo}</p>}
      </div>

      <div className="space-y-1.5 mb-4">
        {headers.map(h => {
          const destino = mapeo[h] || ''
          const noMapeado = esNoMapeado(destino)
          const esExtra = destino.startsWith('extra:')
          const editando = editandoCampo === h

          return (
            <div key={h} className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
              noMapeado ? 'border-red-200 bg-red-50' : esExtra ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-white'
            }`}>
              <span className={`text-xs font-mono font-medium w-40 shrink-0 truncate ${noMapeado ? 'text-red-600' : 'text-gray-700'}`} title={h}>{h}</span>
              <ArrowRight size={14} className="text-gray-400 shrink-0" />

              {editando ? (
                <div className="flex items-center gap-1 flex-1">
                  <input
                    type="text"
                    value={customName}
                    onChange={e => setCustomName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveHandler(h); if (e.key === 'Escape') setEditandoCampo(null) }}
                    placeholder="Nombre del campo..."
                    className="flex-1 text-xs border border-blue-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    autoFocus
                  />
                  <button onClick={() => saveHandler(h)} className="text-green-600 hover:text-green-800 p-1"><CheckCircle size={14} /></button>
                  <button onClick={() => setEditandoCampo(null)} className="text-gray-400 hover:text-gray-600 p-1"><X size={14} /></button>
                </div>
              ) : (
                <>
                  <select
                    value={destino}
                    onChange={e => onMapeoChange(h, e.target.value)}
                    className={`flex-1 text-xs border rounded px-2 py-1 ${noMapeado ? 'border-red-300 text-red-600' : 'border-gray-300'}`}
                  >
                    <option value="">— No mapear —</option>
                    <optgroup label="Campos de la BD">
                      {CAMPOS_BD.map(c => <option key={c} value={c}>{c}</option>)}
                    </optgroup>
                    <optgroup label="Guardar como extra">
                      <option value={`extra:${h}`}>Guardar como "{h}" (datos extra)</option>
                    </optgroup>
                  </select>
                  <button
                    onClick={() => { setEditandoCampo(h); setCustomName(destino.startsWith('extra:') ? destino.slice(6) : destino) }}
                    className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 shrink-0"
                    title="Editar nombre"
                  ><Pencil size={13} /></button>
                  {!noMapeado && (
                    <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${esExtra ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                      {esExtra ? 'extra' : 'BD'}
                    </span>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>

      {/* Mini preview */}
      {preview.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-200 mb-3">
          <table className="w-full text-[10px]">
            <thead>
              <tr className="bg-gray-50">
                {headers.map((h, i) => {
                  const d = mapeo[h] || ''
                  const no = esNoMapeado(d)
                  return <th key={i} className={`px-2 py-1 text-left ${no ? 'text-red-400' : 'text-gray-600'}`}>{h}</th>
                })}
              </tr>
            </thead>
            <tbody>
              {preview.map((row, i) => (
                <tr key={i} className="border-t border-gray-100">
                  {headers.map((h, j) => {
                    const no = esNoMapeado(mapeo[h])
                    return <td key={j} className={`px-2 py-1 ${no ? 'text-red-300 line-through' : 'text-gray-600'}`}>{row[j] != null ? String(row[j]).slice(0, 30) : ''}</td>
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {onConfirm && (
        <div className="flex justify-end gap-2">
          {onCancel && <Button variant="secondary" onClick={onCancel}>Saltar</Button>}
          <Button onClick={onConfirm}>Confirmar mapeo</Button>
        </div>
      )}
    </Card>
  )
}

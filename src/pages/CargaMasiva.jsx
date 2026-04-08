import { useState } from 'react'
import { Upload, FileSpreadsheet, AlertTriangle, CheckCircle, Pencil, X, ArrowRight } from 'lucide-react'
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
  // mapeo: excelHeader → campoDestino
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
    // If no match, mark as datos_extra with original name
    if (!mapeo[hTrim]) {
      mapeo[hTrim] = `extra:${hTrim}`
    }
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

export default function CargaMasiva() {
  const { usuario } = useAuth()
  const [step, setStep] = useState(1)
  const [fileName, setFileName] = useState('')
  const [headers, setHeaders] = useState([])
  const [rows, setRows] = useState([])
  const [mapeo, setMapeo] = useState({}) // excelHeader → campo destino
  const [editandoCampo, setEditandoCampo] = useState(null) // header being custom-edited
  const [customName, setCustomName] = useState('')
  const [preview, setPreview] = useState([])
  const [errores, setErrores] = useState([])
  const [resultado, setResultado] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  function procesarArchivo(file) {
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (e) => {
      const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const data = XLSX.utils.sheet_to_json(ws, { header: 1 })

      if (data.length < 2) {
        alert('El archivo no contiene datos')
        return
      }

      const hdrs = data[0].map(h => String(h || '').trim()).filter(Boolean)
      const dataRows = data.slice(1).filter(r => r.some(c => c !== null && c !== undefined && c !== ''))

      setHeaders(hdrs)
      setRows(dataRows)
      setMapeo(detectarMapeo(hdrs))
      setPreview(dataRows.slice(0, 5))
      setStep(2)
    }
    reader.readAsArrayBuffer(file)
  }

  function handleFile(e) {
    const file = e.target.files?.[0]
    if (file) procesarArchivo(file)
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) procesarArchivo(file)
  }

  function updateMapeo(excelHeader, destino) {
    setMapeo(prev => ({ ...prev, [excelHeader]: destino }))
  }

  function guardarCustomName(excelHeader) {
    const name = customName.trim()
    if (name) {
      const dest = CAMPOS_BD.includes(name) ? name : `extra:${name}`
      updateMapeo(excelHeader, dest)
    }
    setEditandoCampo(null)
    setCustomName('')
  }

  function getDestinoLabel(destino) {
    if (!destino) return 'No mapear'
    if (destino.startsWith('extra:')) return `📦 ${destino.slice(6)} (extra)`
    return destino
  }

  function esNoMapeado(destino) {
    return !destino || destino === ''
  }

  function validarYCargar() {
    const errs = []
    const cupsVistos = new Set()
    const clientesValidos = []

    // Build reverse map: campo → excelHeaderIndex
    const campoToIdx = {}
    const extraFields = []
    for (const [excelHeader, destino] of Object.entries(mapeo)) {
      const colIdx = headers.indexOf(excelHeader)
      if (colIdx < 0) continue
      if (!destino || destino === '') continue
      if (destino.startsWith('extra:')) {
        extraFields.push({ name: destino.slice(6), colIdx })
      } else {
        campoToIdx[destino] = colIdx
      }
    }

    rows.forEach((row, idx) => {
      const getVal = (campo) => {
        const colIdx = campoToIdx[campo]
        return colIdx !== undefined ? row[colIdx] : null
      }

      const cups = String(getVal('cups') || '').trim()
      if (!cups) {
        errs.push({ fila: idx + 2, error: 'CUPS vacío' })
        return
      }
      if (cupsVistos.has(cups)) {
        errs.push({ fila: idx + 2, error: `CUPS duplicado: ${cups}` })
        return
      }
      cupsVistos.add(cups)

      // Build datos_extra from unmapped extra columns
      let datos_extra = null
      if (extraFields.length > 0) {
        datos_extra = {}
        for (const { name, colIdx } of extraFields) {
          const v = row[colIdx]
          if (v !== null && v !== undefined && v !== '') {
            datos_extra[name] = typeof v === 'object' && v instanceof Date
              ? v.toISOString().split('T')[0]
              : String(v)
          }
        }
        if (Object.keys(datos_extra).length === 0) datos_extra = null
      }

      const estadoRaw = getVal('estado')
      const estado = estadoRaw ? String(estadoRaw).trim() : null

      clientesValidos.push({
        cups,
        dni: String(getVal('dni') || '').trim() || null,
        nombre: String(getVal('nombre') || '').trim() || null,
        direccion: String(getVal('direccion') || '').trim() || null,
        campana: String(getVal('campana') || '').trim().toUpperCase().replace('Ñ', 'N') || null,
        fecha_alta: parseFecha(getVal('fecha_alta')),
        fecha_activacion: parseFecha(getVal('fecha_activacion')),
        fecha_ultimo_cambio: parseFecha(getVal('fecha_ultimo_cambio')),
        fecha_baja: parseFecha(getVal('fecha_baja')),
        estado,
        datos_extra,
        oficina_id: usuario?.oficina_id || null,
        created_by: usuario?.id,
      })
    })

    setErrores(errs)
    return clientesValidos
  }

  async function ejecutarCarga() {
    const clientesValidos = validarYCargar()
    if (clientesValidos.length === 0) return

    setCargando(true)
    let cargados = 0
    let duplicados = 0
    let erroresCarga = 0

    const BATCH_SIZE = 100
    for (let i = 0; i < clientesValidos.length; i += BATCH_SIZE) {
      const batch = clientesValidos.slice(i, i + BATCH_SIZE)
      const { data, error } = await supabase
        .from('clientes')
        .upsert(batch, { onConflict: 'cups', ignoreDuplicates: true })
        .select()

      if (error) {
        erroresCarga += batch.length
        console.error('Batch error:', error.message)
      } else {
        cargados += data?.length || 0
        duplicados += batch.length - (data?.length || 0)
      }
    }

    setResultado({ cargados, duplicados, errores: erroresCarga + errores.length })
    setStep(3)
    setCargando(false)
  }

  // Count stats for mapping
  const mapeados = Object.values(mapeo).filter(v => v && v !== '').length
  const extras = Object.values(mapeo).filter(v => v?.startsWith('extra:')).length
  const sinMapear = headers.length - mapeados

  return (
    <div className="max-w-5xl mx-auto">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Carga Masiva</h2>

      {/* Step 1: Upload */}
      {step === 1 && (
        <Card className="p-8">
          <div
            className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}`}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            <Upload className="mx-auto mb-4 text-gray-400" size={48} />
            <h3 className="text-lg font-semibold text-gray-700 mb-2">Arrastra tu archivo aquí</h3>
            <p className="text-sm text-gray-500 mb-4">Formatos: .xlsx, .xls, .csv</p>
            <label className="inline-block">
              <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="hidden" />
              <span className="inline-flex items-center gap-2 px-4 py-2 bg-blue-800 text-white rounded-lg text-sm font-medium cursor-pointer hover:bg-blue-900">
                <FileSpreadsheet size={16} /> Seleccionar archivo
              </span>
            </label>
          </div>
        </Card>
      )}

      {/* Step 2: Preview + Mapping */}
      {step === 2 && (
        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-gray-900">{fileName}</h3>
                <p className="text-sm text-gray-500">
                  {rows.length} filas · {headers.length} columnas
                  <span className="mx-2">·</span>
                  <span className="text-green-600">{mapeados - extras} campos BD</span>
                  {extras > 0 && <><span className="mx-1">·</span><span className="text-blue-600">{extras} extras</span></>}
                  {sinMapear > 0 && <><span className="mx-1">·</span><span className="text-red-500">{sinMapear} sin mapear</span></>}
                </p>
              </div>
              <Button variant="secondary" onClick={() => { setStep(1); setRows([]); setHeaders([]) }}>
                Cambiar archivo
              </Button>
            </div>

            <h4 className="text-sm font-medium text-gray-700 mb-3">Mapeo de columnas</h4>
            <div className="space-y-1.5">
              {headers.map(h => {
                const destino = mapeo[h] || ''
                const noMapeado = esNoMapeado(destino)
                const esExtra = destino.startsWith('extra:')
                const editando = editandoCampo === h

                return (
                  <div
                    key={h}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
                      noMapeado
                        ? 'border-red-200 bg-red-50'
                        : esExtra
                        ? 'border-blue-200 bg-blue-50'
                        : 'border-gray-200 bg-white'
                    }`}
                  >
                    {/* Excel column name */}
                    <span className={`text-xs font-mono font-medium w-40 shrink-0 truncate ${noMapeado ? 'text-red-600' : 'text-gray-700'}`} title={h}>
                      {h}
                    </span>

                    <ArrowRight size={14} className="text-gray-400 shrink-0" />

                    {editando ? (
                      <div className="flex items-center gap-1 flex-1">
                        <input
                          type="text"
                          value={customName}
                          onChange={e => setCustomName(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') guardarCustomName(h); if (e.key === 'Escape') setEditandoCampo(null) }}
                          placeholder="Nombre del campo..."
                          className="flex-1 text-xs border border-blue-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          autoFocus
                        />
                        <button onClick={() => guardarCustomName(h)} className="text-green-600 hover:text-green-800 p-1">
                          <CheckCircle size={14} />
                        </button>
                        <button onClick={() => setEditandoCampo(null)} className="text-gray-400 hover:text-gray-600 p-1">
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <select
                          value={destino}
                          onChange={e => updateMapeo(h, e.target.value)}
                          className={`flex-1 text-xs border rounded px-2 py-1 ${
                            noMapeado ? 'border-red-300 text-red-600' : 'border-gray-300'
                          }`}
                        >
                          <option value="">— No mapear —</option>
                          <optgroup label="Campos de la BD">
                            {CAMPOS_BD.map(c => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </optgroup>
                          <optgroup label="Guardar como extra">
                            <option value={`extra:${h}`}>📦 Guardar como "{h}" (datos extra)</option>
                          </optgroup>
                        </select>

                        <button
                          onClick={() => { setEditandoCampo(h); setCustomName(destino.startsWith('extra:') ? destino.slice(6) : destino) }}
                          className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 shrink-0"
                          title="Editar nombre de campo"
                        >
                          <Pencil size={13} />
                        </button>

                        {!noMapeado && (
                          <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${
                            esExtra ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                          }`}>
                            {esExtra ? 'extra' : 'BD'}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </Card>

          {/* Preview table with mapping indicators */}
          <Card className="overflow-hidden">
            <div className="p-3 bg-gray-50 border-b border-gray-200">
              <span className="text-sm font-medium text-gray-700">Vista previa (primeras 5 filas)</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50">
                    {headers.map((h, i) => {
                      const dest = mapeo[h] || ''
                      const noMapeado = esNoMapeado(dest)
                      const esExtra = dest.startsWith('extra:')
                      return (
                        <th key={i} className={`px-3 py-1 text-left font-medium border-b-2 ${
                          noMapeado
                            ? 'text-red-500 border-red-300 bg-red-50'
                            : esExtra
                            ? 'text-blue-600 border-blue-300 bg-blue-50'
                            : 'text-green-700 border-green-300 bg-green-50'
                        }`}>
                          <div className="truncate max-w-[120px]" title={h}>{h}</div>
                          <div className={`text-[10px] font-normal mt-0.5 ${noMapeado ? 'text-red-400' : esExtra ? 'text-blue-400' : 'text-green-500'}`}>
                            {noMapeado ? '✗ sin mapear' : `→ ${getDestinoLabel(dest)}`}
                          </div>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => (
                    <tr key={i} className="border-t border-gray-100">
                      {headers.map((h, j) => {
                        const noMapeado = esNoMapeado(mapeo[h])
                        return (
                          <td key={j} className={`px-3 py-2 ${noMapeado ? 'text-red-400 line-through' : 'text-gray-700'}`}>
                            {row[j] != null ? String(row[j]) : ''}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {errores.length > 0 && (
            <Card className="p-4 border-red-200 bg-red-50">
              <h4 className="text-sm font-semibold text-red-800 mb-2 flex items-center gap-2">
                <AlertTriangle size={16} /> Errores de validación
              </h4>
              <ul className="text-xs text-red-700 space-y-1 max-h-40 overflow-y-auto">
                {errores.map((e, i) => (
                  <li key={i}>Fila {e.fila}: {e.error}</li>
                ))}
              </ul>
            </Card>
          )}

          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => { validarYCargar() }}>
              Validar
            </Button>
            <Button onClick={ejecutarCarga} disabled={cargando || !Object.values(mapeo).includes('cups')}>
              {cargando ? 'Cargando...' : `Cargar ${rows.length} clientes`}
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Result */}
      {step === 3 && resultado && (
        <Card className="p-8 text-center">
          <CheckCircle className="mx-auto mb-4 text-green-500" size={48} />
          <h3 className="text-xl font-bold text-gray-900 mb-4">Carga completada</h3>
          <div className="flex justify-center gap-6 mb-6">
            <div>
              <p className="text-3xl font-bold text-green-600">{resultado.cargados}</p>
              <p className="text-sm text-gray-500">Cargados</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-yellow-600">{resultado.duplicados}</p>
              <p className="text-sm text-gray-500">Duplicados</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-red-600">{resultado.errores}</p>
              <p className="text-sm text-gray-500">Errores</p>
            </div>
          </div>
          <Button onClick={() => { setStep(1); setRows([]); setHeaders([]); setResultado(null); setErrores([]) }}>
            Cargar otro archivo
          </Button>
        </Card>
      )}
    </div>
  )
}

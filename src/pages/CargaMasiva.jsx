import { useState, useCallback } from 'react'
import { Upload, FileSpreadsheet, AlertTriangle, CheckCircle, XCircle } from 'lucide-react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Card from '../components/UI/Card'
import Button from '../components/UI/Button'
import Badge from '../components/UI/Badge'

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

function detectarMapeo(headers) {
  const mapeo = {}
  for (const [campo, variantes] of Object.entries(COLUMN_MAP)) {
    const found = headers.find(h => variantes.includes(h?.trim()))
    if (found) mapeo[campo] = found
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
  // dd/mm/yyyy
  const match = str.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/)
  if (match) return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`
  // yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.substring(0, 10)
  return null
}

export default function CargaMasiva() {
  const { usuario } = useAuth()
  const [step, setStep] = useState(1)
  const [fileName, setFileName] = useState('')
  const [headers, setHeaders] = useState([])
  const [rows, setRows] = useState([])
  const [mapeo, setMapeo] = useState({})
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

      const hdrs = data[0].map(h => String(h || '').trim())
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

  function updateMapeo(campo, header) {
    setMapeo(prev => ({ ...prev, [campo]: header || undefined }))
  }

  function validarYCargar() {
    const errs = []
    const cupsVistos = new Set()
    const clientesValidos = []

    rows.forEach((row, idx) => {
      const getVal = (campo) => {
        const hdr = mapeo[campo]
        if (!hdr) return null
        const colIdx = headers.indexOf(hdr)
        return colIdx >= 0 ? row[colIdx] : null
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
        estado: String(getVal('estado') || 'PENDIENTE').trim().toUpperCase(),
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
      } else {
        cargados += data?.length || 0
        duplicados += batch.length - (data?.length || 0)
      }
    }

    setResultado({ cargados, duplicados, errores: erroresCarga + errores.length })
    setStep(3)
    setCargando(false)
  }

  return (
    <div className="max-w-4xl mx-auto">
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
                <p className="text-sm text-gray-500">{rows.length} filas detectadas</p>
              </div>
              <Button variant="secondary" onClick={() => { setStep(1); setRows([]); setHeaders([]) }}>
                Cambiar archivo
              </Button>
            </div>

            <h4 className="text-sm font-medium text-gray-700 mb-2">Mapeo de columnas</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {Object.keys(COLUMN_MAP).map(campo => (
                <div key={campo} className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-600 w-32">{campo}</span>
                  <select
                    value={mapeo[campo] || ''}
                    onChange={e => updateMapeo(campo, e.target.value)}
                    className="flex-1 text-xs border border-gray-300 rounded px-2 py-1"
                  >
                    <option value="">— No mapear —</option>
                    {headers.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                  {mapeo[campo] && <CheckCircle size={14} className="text-green-500 shrink-0" />}
                </div>
              ))}
            </div>
          </Card>

          {/* Preview table */}
          <Card className="overflow-hidden">
            <div className="p-3 bg-gray-50 border-b border-gray-200">
              <span className="text-sm font-medium text-gray-700">Vista previa (primeras 5 filas)</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50">
                    {headers.map((h, i) => (
                      <th key={i} className="px-3 py-2 text-left font-medium text-gray-600">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => (
                    <tr key={i} className="border-t border-gray-100">
                      {headers.map((_, j) => (
                        <td key={j} className="px-3 py-2 text-gray-700">{row[j] != null ? String(row[j]) : ''}</td>
                      ))}
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
            <Button onClick={ejecutarCarga} disabled={cargando || !mapeo.cups}>
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

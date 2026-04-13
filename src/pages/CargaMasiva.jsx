import { useState, useRef } from 'react'
import { Upload, FileSpreadsheet, CheckCircle, XCircle, Loader2, ArrowRight, ArrowLeft } from 'lucide-react'
import * as XLSX from 'xlsx'
import { useAuth } from '../context/AuthContext'
import Card from '../components/UI/Card'
import Button from '../components/UI/Button'

// ─── Config ───

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const CHUNK_SIZE = 5000

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

// Auto-detect: Excel header → system field (case-insensitive)
const AUTO_MAP = {
  cups: 'cups', 'id cups': 'cups', id_cups: 'cups',
  dni: 'dni', nif: 'dni', cif: 'dni', 'dni/nif': 'dni', documento: 'dni',
  nombre: 'nombre', 'nombre completo': 'nombre', 'nombre_completo': 'nombre',
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
  const h = header.toLowerCase().trim()
  return AUTO_MAP[h] || null
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

// ─── Component ───

export default function CargaMasiva() {
  const { usuario } = useAuth()
  const cancelRef = useRef(false)

  const [paso, setPaso] = useState(1) // 1=upload, 2=mapeo, 3=procesando, 4=resultado
  const [archivo, setArchivo] = useState(null)
  const [headers, setHeaders] = useState([])
  const [muestras, setMuestras] = useState({}) // header → sample value
  const [mapeo, setMapeo] = useState({}) // header → campo sistema
  const [progreso, setProgreso] = useState(0)
  const [stats, setStats] = useState({ total: 0, procesados: 0, insertados: 0, actualizados: 0, errores: 0 })
  const [informe, setInforme] = useState({
    insertados: 0, actualizados: 0, duplicados_en_crm: 0, duplicados_internos: 0,
    cups_actualizados: [], cups_duplicados_internos: [],
  })
  const [errorMsg, setErrorMsg] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [expandActualizados, setExpandActualizados] = useState(false)
  const [expandDuplicados, setExpandDuplicados] = useState(false)

  // ── PASO 1: Seleccionar archivo ──

  function seleccionarArchivo(file) {
    if (!file) return
    setArchivo(file)
    setErrorMsg(null)

    // Read only first 2 rows for headers + sample
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array', sheetRows: 3 })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

        if (data.length < 1) { setErrorMsg('Archivo vacío'); return }

        const hdrs = data[0].map(h => String(h || '').trim()).filter(Boolean)
        setHeaders(hdrs)

        // Sample values from row 2
        const samples = {}
        if (data[1]) {
          hdrs.forEach((h, i) => { samples[h] = data[1][i] != null ? String(data[1][i]).slice(0, 50) : '' })
        }
        setMuestras(samples)

        // Auto-detect mapping
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
        setMapeo(detected)
        setPaso(2)
      } catch (err) {
        setErrorMsg('Error al leer el archivo: ' + err.message)
      }
    }
    reader.readAsArrayBuffer(file)
  }

  function handleFile(e) {
    seleccionarArchivo(e.target.files?.[0])
    e.target.value = ''
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) seleccionarArchivo(file)
  }

  // ── PASO 2: Confirmar mapeo ──

  function updateMapeo(header, campo) {
    setMapeo(prev => ({ ...prev, [header]: campo }))
  }

  // ── PASO 3: Procesar ──

  function mapearRegistro(row) {
    const reg = { datos_extra: {} }

    for (const [header, campo] of Object.entries(mapeo)) {
      if (campo === '[ignorar]') continue
      const raw = row[header]
      const val = str(raw)

      if (CAMPOS_BD.has(campo)) {
        if (campo === 'dni') {
          reg.dni = limpiarDni(raw)
        } else if (campo.startsWith('fecha')) {
          reg[campo] = parseFecha(raw)
        } else if (campo === 'campana') {
          reg.campana = val ? val.toUpperCase().replace('Ñ', 'N') : null
        } else {
          reg[campo] = val
        }
      } else {
        if (val) reg.datos_extra[campo] = val
      }
    }

    // Concat Apellido1/2 into nombre
    const ap1 = reg.datos_extra.Apellido1
    const ap2 = reg.datos_extra.Apellido2
    if (ap1 || ap2) {
      reg.nombre = [reg.nombre, ap1, ap2].filter(Boolean).join(' ') || null
      delete reg.datos_extra.Apellido1
      delete reg.datos_extra.Apellido2
    }

    // Concat address parts into direccion
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

  async function iniciarCarga() {
    if (!archivo) return
    cancelRef.current = false
    setPaso(3)
    setProgreso(0)
    setStats({ total: 0, procesados: 0, insertados: 0, actualizados: 0, errores: 0 })
    setInforme({ insertados: 0, actualizados: 0, duplicados_en_crm: 0, duplicados_internos: 0, cups_actualizados: [], cups_duplicados_internos: [] })
    setExpandActualizados(false)
    setExpandDuplicados(false)
    setErrorMsg(null)

    try {
      const buffer = await archivo.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array', dense: false, cellDates: false, cellNF: false, cellHTML: false })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
      const totalFilas = range.e.r

      // Map column index to header name
      const colHeaders = []
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r: 0, c })]
        colHeaders.push(cell ? String(cell.v) : `col_${c}`)
      }

      setStats(prev => ({ ...prev, total: totalFilas }))
      console.log(`[CargaMasiva] ${totalFilas} filas, ${colHeaders.length} columnas`)

      let procesados = 0
      let insertadosTotal = 0
      let actualizadosTotal = 0
      let erroresTotal = 0
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
            if (!cupsVistos.has(cups)) {
              cupsVistos.add(cups)
              batch.push(reg)
            }
          } else {
            batch.push(reg)
          }
        }

        if (batch.length > 0) {
          try {
            const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/bulk_upsert_clientes`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Prefer': 'return=representation',
              },
              body: JSON.stringify({ registros: batch }),
            })

            if (!res.ok) {
              const text = await res.text()
              console.error('Supabase error:', text)
              erroresTotal += batch.length
            } else {
              const r = await res.json()
              insertadosTotal += r.insertados || 0
              actualizadosTotal += r.actualizados || 0

              // Accumulate informe
              setInforme(prev => ({
                insertados: prev.insertados + (r.insertados || 0),
                actualizados: prev.actualizados + (r.actualizados || 0),
                duplicados_en_crm: prev.duplicados_en_crm + (r.duplicados_en_crm || 0),
                duplicados_internos: prev.duplicados_internos + (r.duplicados_internos || 0),
                cups_actualizados: [...prev.cups_actualizados, ...(r.cups_actualizados || [])].slice(0, 200),
                cups_duplicados_internos: [...prev.cups_duplicados_internos, ...(r.cups_duplicados_internos || [])].slice(0, 200),
              }))
            }
          } catch (err) {
            console.error('Fetch error:', err)
            erroresTotal += batch.length
          }
        }

        procesados += (rowEnd - rowStart + 1)
        const pct = totalFilas > 0 ? Math.round((procesados / totalFilas) * 100) : 0
        setProgreso(pct)
        setStats({ total: totalFilas, procesados, insertados: insertadosTotal, actualizados: actualizadosTotal, errores: erroresTotal })

        // Yield to UI
        await new Promise(resolve => setTimeout(resolve, 0))
      }

      cupsVistos.clear()
      setProgreso(100)
      setPaso(4)

    } catch (err) {
      console.error('[CargaMasiva] Error:', err)
      setErrorMsg(err.message)
      setPaso(4)
    }
  }

  function resetTodo() {
    setPaso(1)
    setArchivo(null)
    setHeaders([])
    setMuestras({})
    setMapeo({})
    setProgreso(0)
    setStats({ total: 0, procesados: 0, insertados: 0, actualizados: 0, errores: 0 })
    setInforme({ insertados: 0, actualizados: 0, duplicados_en_crm: 0, duplicados_internos: 0, cups_actualizados: [], cups_duplicados_internos: [] })
    setErrorMsg(null)
    cancelRef.current = false
  }

  function descargarInformeCSV() {
    const rows = []
    for (const cups of (informe.cups_actualizados || [])) {
      if (cups) rows.push({ Tipo: 'ACTUALIZADO', CUPS: cups, Veces: '' })
    }
    for (const d of (informe.cups_duplicados_internos || [])) {
      if (d?.cups) rows.push({ Tipo: 'DUPLICADO_INTERNO', CUPS: d.cups, Veces: d.veces })
    }
    if (rows.length === 0) rows.push({ Tipo: 'SIN_DATOS', CUPS: '', Veces: '' })
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Informe')
    XLSX.writeFile(wb, `informe_carga_${new Date().toISOString().slice(0, 10)}.xlsx`)
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
            <h3 className="text-lg font-semibold text-gray-700 mb-2">Arrastra tu archivo aquí</h3>
            <p className="text-sm text-gray-500 mb-4">Formatos: .xlsx, .xls, .csv</p>
            <label className="inline-block">
              <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="hidden" />
              <span className="inline-flex items-center gap-2 px-4 py-2 bg-blue-800 text-white rounded-lg text-sm font-medium cursor-pointer hover:bg-blue-900">
                <FileSpreadsheet size={16} /> Seleccionar archivo
              </span>
            </label>
          </div>
          {errorMsg && <p className="mt-4 text-sm text-red-600 text-center">{errorMsg}</p>}
        </Card>
      )}

      {/* ═══ PASO 2: Mapeo de columnas ═══ */}
      {paso === 2 && (
        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-gray-900">{archivo?.name}</h3>
                <p className="text-sm text-gray-500">{headers.length} columnas detectadas · {mapeados} mapeadas</p>
              </div>
              <Button variant="secondary" onClick={resetTodo}>
                <ArrowLeft size={14} /> Cambiar archivo
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Columna Excel</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Campo sistema</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Ejemplo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {headers.map(h => (
                    <tr key={h} className={mapeo[h] === '[ignorar]' ? 'bg-gray-50 opacity-50' : ''}>
                      <td className="px-3 py-2 font-mono text-xs font-medium text-gray-800">{h}</td>
                      <td className="px-3 py-2">
                        <select
                          value={mapeo[h] || '[ignorar]'}
                          onChange={e => updateMapeo(h, e.target.value)}
                          className={`w-full text-xs border rounded px-2 py-1.5 ${mapeo[h] === '[ignorar]' ? 'border-gray-200 text-gray-400' : 'border-blue-300 text-gray-800'}`}
                        >
                          {CAMPOS_SISTEMA.map(c => (
                            <option key={c} value={c}>{c}</option>
                          ))}
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
            <Button onClick={iniciarCarga} disabled={mapeados === 0}>
              <ArrowRight size={14} /> Iniciar carga
            </Button>
          </div>
        </div>
      )}

      {/* ═══ PASO 3: Procesando ═══ */}
      {paso === 3 && (
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <Loader2 size={24} className="text-blue-600 animate-spin" />
            <div>
              <h3 className="font-semibold text-gray-900">{archivo?.name}</h3>
              <p className="text-sm text-gray-500">
                Fila {stats.procesados.toLocaleString()} de {stats.total.toLocaleString()}
              </p>
            </div>
          </div>

          <div className="mb-4">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>{stats.insertados.toLocaleString()} insertados{stats.actualizados > 0 ? `, ${stats.actualizados} actualizados` : ''}</span>
              <span>{progreso}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div className="bg-blue-600 h-3 rounded-full transition-all duration-500" style={{ width: `${progreso}%` }} />
            </div>
          </div>

          {stats.errores > 0 && (
            <p className="text-xs text-red-500 mb-3">{stats.errores} errores</p>
          )}

          <div className="flex justify-end">
            <Button variant="danger" onClick={() => { cancelRef.current = true }}>Cancelar</Button>
          </div>
        </Card>
      )}

      {/* ═══ PASO 4: Resultado ═══ */}
      {paso === 4 && (
        <div className="space-y-4">
          <Card className="p-6">
            <div className="text-center mb-6">
              {stats.errores > 0 && informe.insertados === 0 ? (
                <XCircle className="mx-auto mb-3 text-red-500" size={48} />
              ) : (
                <CheckCircle className="mx-auto mb-3 text-green-500" size={48} />
              )}
              <h3 className="text-xl font-bold text-gray-900">
                {stats.errores > 0 && informe.insertados === 0 ? 'Error en la carga' : 'Carga completada'}
              </h3>
              <p className="text-sm text-gray-500">{archivo?.name}</p>
            </div>

            {errorMsg && <p className="text-sm text-red-600 mb-4 font-mono break-all text-center">{errorMsg}</p>}

            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                <p className="text-3xl font-bold text-green-600">{informe.insertados.toLocaleString()}</p>
                <p className="text-xs text-green-700 mt-1">Nuevos</p>
                <p className="text-[10px] text-green-500">Registros nuevos insertados</p>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
                <p className="text-3xl font-bold text-blue-600">{informe.actualizados.toLocaleString()}</p>
                <p className="text-xs text-blue-700 mt-1">Actualizados</p>
                <p className="text-[10px] text-blue-500">CUPS existentes actualizados</p>
              </div>
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-center">
                <p className="text-3xl font-bold text-orange-600">{informe.duplicados_en_crm.toLocaleString()}</p>
                <p className="text-xs text-orange-700 mt-1">Duplicados CRM</p>
                <p className="text-[10px] text-orange-500">Ya estaban en el sistema</p>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
                <p className="text-3xl font-bold text-red-600">{informe.duplicados_internos.toLocaleString()}</p>
                <p className="text-xs text-red-700 mt-1">Duplicados archivo</p>
                <p className="text-[10px] text-red-500">CUPS repetidos en el Excel</p>
              </div>
            </div>

            {stats.errores > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-center">
                <p className="text-sm text-red-700 font-medium">{stats.errores.toLocaleString()} registros con error</p>
              </div>
            )}
          </Card>

          {/* Collapsible: CUPS actualizados */}
          {informe.cups_actualizados.length > 0 && (
            <Card className="overflow-hidden">
              <button
                onClick={() => setExpandActualizados(!expandActualizados)}
                className="w-full flex items-center justify-between px-4 py-3 bg-blue-50 hover:bg-blue-100 transition-colors text-left"
              >
                <span className="text-sm font-medium text-blue-800">
                  {expandActualizados ? '▼' : '▶'} Ver CUPS actualizados ({informe.duplicados_en_crm.toLocaleString()})
                </span>
              </button>
              {expandActualizados && (
                <div className="p-3 max-h-60 overflow-y-auto">
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1">
                    {informe.cups_actualizados.map((cups, i) => (
                      <span key={i} className="text-xs font-mono bg-gray-50 px-2 py-1 rounded truncate">{cups}</span>
                    ))}
                  </div>
                  {informe.duplicados_en_crm > 200 && (
                    <p className="text-xs text-gray-400 mt-2 text-center">Mostrando 200 de {informe.duplicados_en_crm.toLocaleString()}</p>
                  )}
                </div>
              )}
            </Card>
          )}

          {/* Collapsible: Duplicados internos */}
          {informe.cups_duplicados_internos.length > 0 && (
            <Card className="overflow-hidden">
              <button
                onClick={() => setExpandDuplicados(!expandDuplicados)}
                className="w-full flex items-center justify-between px-4 py-3 bg-red-50 hover:bg-red-100 transition-colors text-left"
              >
                <span className="text-sm font-medium text-red-800">
                  {expandDuplicados ? '▼' : '▶'} Ver duplicados en el archivo ({informe.duplicados_internos.toLocaleString()})
                </span>
              </button>
              {expandDuplicados && (
                <div className="p-3 max-h-60 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left px-2 py-1 font-medium text-gray-600">CUPS</th>
                        <th className="text-center px-2 py-1 font-medium text-gray-600">Veces</th>
                      </tr>
                    </thead>
                    <tbody>
                      {informe.cups_duplicados_internos.map((d, i) => (
                        <tr key={i} className="border-b border-gray-100">
                          <td className="px-2 py-1 font-mono">{d.cups}</td>
                          <td className="px-2 py-1 text-center text-red-600 font-semibold">{d.veces}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {informe.duplicados_internos > 200 && (
                    <p className="text-xs text-gray-400 mt-2 text-center">Mostrando 200 de {informe.duplicados_internos.toLocaleString()}</p>
                  )}
                </div>
              )}
            </Card>
          )}

          {/* Actions */}
          <div className="flex justify-center gap-3">
            {(informe.cups_actualizados.length > 0 || informe.cups_duplicados_internos.length > 0) && (
              <Button variant="secondary" onClick={descargarInformeCSV}>
                Descargar informe
              </Button>
            )}
            <Button onClick={resetTodo}>Cargar otro archivo</Button>
          </div>
        </div>
      )}
    </div>
  )
}

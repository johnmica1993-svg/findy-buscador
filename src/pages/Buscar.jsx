import { useState, useRef } from 'react'
import { Search, XCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Button from '../components/UI/Button'
import FichaTramitabilidad from '../components/Clientes/FichaTramitabilidad'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

const ESTADOS_BLOQUEADOS = [
  'activado',
  'tramitando',
  'pendiente de verificacion',
  'pendiente de verificación',
]

function esEstadoBloqueado(estado) {
  if (!estado) return false
  return ESTADOS_BLOQUEADOS.includes(estado.trim().toLowerCase())
}

// Search uses RPC buscar_clientes_admin directly

export default function Buscar() {
  const { esAdmin, usuario } = useAuth()
  const [query, setQuery] = useState('')
  const [resultados, setResultados] = useState([])
  const [seleccionado, setSeleccionado] = useState(null)
  const [buscando, setBuscando] = useState(false)
  const [buscado, setBuscado] = useState(false)
  const [alerta, setAlerta] = useState(null)
  const [expandedDirs, setExpandedDirs] = useState({})
  const inputRef = useRef(null)

  async function buscar() {
    const raw = (inputRef.current?.value || query).trim()
    if (!raw || raw.length < 2) return

    setBuscando(true)
    setBuscado(true)
    setAlerta(null)
    setSeleccionado(null)
    setResultados([])

    try {
      // Normalize input
      let termino = raw
      termino = termino.replace(/^[Dd][Nn][Ii]\s*:?\s*/, '')
      if (termino.startsWith('+34')) termino = termino.slice(3)
      else if (/^0034/.test(termino)) termino = termino.slice(4)
      else if (/^34[6789]/.test(termino) && termino.length >= 11) termino = termino.slice(2)
      termino = termino.replace(/[\s\-().]/g, '').trim()

      if (!termino || termino.length < 2) { setBuscando(false); return }

      // Direct PostgREST query on indexed fields (fast with 7M+ records)
      const t = encodeURIComponent(termino)
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token || SUPABASE_KEY
      const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${token}` }

      let lista = []

      // Try exact match first (fastest)
      let res = await fetch(`${SUPABASE_URL}/rest/v1/clientes?or=(dni.eq.${t},cups.eq.${t})&limit=20`, { headers })
      if (res.ok) lista = await res.json()

      // If no exact match, try ILIKE on indexed fields
      if (!lista.length) {
        res = await fetch(`${SUPABASE_URL}/rest/v1/clientes?or=(dni.ilike.*${t}*,cups.ilike.*${t}*,nombre.ilike.*${t}*)&limit=20`, { headers })
        if (res.ok) lista = await res.json()
      }

      if (!Array.isArray(lista)) lista = []

      setResultados(lista)

      if (lista.length === 0) {
        setSeleccionado(null)
      } else if (!esAdmin && lista.some(c => c.estado_contratable === false)) {
        setSeleccionado(null)
        const bloqueado = lista.find(c => c.estado_contratable === false)
        setAlerta({
          tipo: 'no_disponible',
          mensaje: `CLIENTE NO DISPONIBLE — ${bloqueado?.motivo_bloqueo || 'Este cliente está bloqueado temporalmente.'}`,
        })
      } else if (!esAdmin && lista.some(c => esEstadoBloqueado(c.estado))) {
        setSeleccionado(null)
        setAlerta({
          tipo: 'proceso_activo',
          mensaje: 'CLIENTE NO TRAMITABLE — Este cliente ya tiene un proceso activo.',
        })
      } else if (lista.length === 1) {
        setSeleccionado(lista[0])
      }

      // Log search (non-blocking)
      fetch(`${SUPABASE_URL}/rest/v1/busquedas_log`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${token}`,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          usuario_id: usuario?.id,
          usuario_nombre: usuario?.nombre,
          usuario_email: usuario?.email,
          oficina: usuario?.oficina?.nombre || null,
          termino_busqueda: raw,
          resultado_encontrado: lista.length > 0,
        }),
      }).catch(() => {})

    } catch (err) {
      console.error('Error buscando:', err)
    } finally {
      setBuscando(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') buscar()
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Buscador de Clientes</h2>

      <div className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={22} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Buscar por CUPS, DNI, Nombre o Teléfono..."
            className="w-full pl-12 pr-4 py-4 text-lg border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm"
            autoFocus
          />
        </div>
        <Button onClick={buscar} disabled={buscando || query.trim().length < 2} className="px-8 py-4 text-lg rounded-xl">
          {buscando ? 'Buscando...' : 'Buscar'}
        </Button>
      </div>

      {alerta && (
        <div className="mb-6 rounded-xl border-2 border-red-400 bg-red-50 p-6">
          <div className="flex items-center gap-3 mb-2">
            <XCircle className="text-red-600 shrink-0" size={28} />
            <h3 className="text-lg font-bold text-red-800">NO TRAMITABLE</h3>
          </div>
          <p className="text-sm text-red-700">{alerta.mensaje}</p>
        </div>
      )}

      {buscado && !buscando && resultados.length === 0 && !alerta && (
        <div className="text-center py-12 text-gray-500">
          <Search size={48} className="mx-auto mb-3 text-gray-300" />
          <p>No se encontraron clientes para "{query}"</p>
        </div>
      )}

      {resultados.length > 1 && !seleccionado && !alerta && (() => {
        const getTel = (c) => {
          if (!c.datos_extra) return null
          for (const [k, v] of Object.entries(c.datos_extra)) {
            if (k.toLowerCase().replace(/\s/g, '').match(/tel|tlfn|mov|phone/) && v) return String(v).replace(/\.0$/, '')
          }
          return null
        }
        const getDir = (c) => c.direccion || c.datos_extra?.['DIR SUMINISTRO'] || null

        // Group by DNI
        const porDni = {}
        resultados.forEach(c => {
          const key = c.dni || `sin_dni_${c.id}`
          if (!porDni[key]) porDni[key] = []
          porDni[key].push(c)
        })

        return (
          <div className="space-y-4 mb-6">
            {Object.entries(porDni).map(([dni, regs]) => {
              // Sub-group by address
              const porDir = {}
              regs.forEach(c => {
                const dir = getDir(c)?.trim() || (c.cups ? '_con_cups' : '_sin_datos')
                if (!porDir[dir]) porDir[dir] = []
                porDir[dir].push(c)
              })

              // Stats
              const cupsUnicos = new Set(regs.map(c => c.cups).filter(Boolean))
              const telsUnicos = new Set(regs.map(c => getTel(c)).filter(Boolean))
              const dirsReales = Object.keys(porDir).filter(d => !d.startsWith('_'))

              return (
                <div key={dni} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  {/* Client header */}
                  <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-bold text-gray-800">{regs[0].nombre || regs[0].datos_extra?.TITULAR || 'Sin nombre'}</span>
                      {regs[0].dni && <span className="text-xs font-mono bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">DNI: {regs[0].dni}</span>}
                    </div>
                    <div className="flex flex-wrap gap-2 text-[10px] text-gray-500">
                      {dirsReales.length > 0 && <span>📍 {dirsReales.length} dirección{dirsReales.length > 1 ? 'es' : ''}</span>}
                      {cupsUnicos.size > 0 && <span>⚡ {cupsUnicos.size} CUPS</span>}
                      {telsUnicos.size > 0 && <span>📞 {[...telsUnicos].join(', ')}</span>}
                      <span className="text-gray-400">{regs.length} registros</span>
                    </div>
                  </div>

                  {/* Address groups — accordion */}
                  <div className="divide-y divide-gray-100">
                    {Object.entries(porDir).map(([dir, dirRegs]) => {
                      const cupsEnDir = [...new Set(dirRegs.map(c => c.cups).filter(Boolean))]
                      const isReal = !dir.startsWith('_')
                      const label = isReal ? dir : (dir === '_con_cups' ? 'Sin dirección' : 'Sin datos de suministro')
                      const dirKey = `${dni}_${dir}`
                      const isOpen = expandedDirs[dirKey]

                      return (
                        <div key={dir}>
                          {/* Accordion header — click to expand */}
                          <button onClick={() => setExpandedDirs(p => ({ ...p, [dirKey]: !p[dirKey] }))}
                            className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-gray-50 transition-colors text-left">
                            <div className="flex items-center gap-2">
                              <span className="text-gray-400 text-xs">{isOpen ? '▼' : '▶'}</span>
                              <p className={`text-xs font-medium ${isReal ? 'text-gray-700' : 'text-gray-400 italic'}`}>
                                {isReal ? '📍 ' : ''}{label}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              {cupsEnDir.length > 0 && <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">⚡ {cupsEnDir.length} CUPS</span>}
                              <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{dirRegs.length} reg</span>
                            </div>
                          </button>

                          {/* Expanded records */}
                          {isOpen && (
                            <div className="bg-gray-50 border-t border-gray-100 px-4 py-2 space-y-2">
                              {dirRegs.map(c => {
                                const tel = getTel(c)
                                const iban = c.datos_extra?.IBAN || c.datos_extra?.iban
                                const email = c.datos_extra?.EMAIL || c.datos_extra?.email || c.datos_extra?.CORREO
                                const origen = c.datos_extra?.Compañía || c.datos_extra?.['Compañia'] || c.campana
                                return (
                                  <div key={c.id} className="bg-white rounded-lg border border-gray-200 p-3">
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="flex-1 min-w-0 space-y-1">
                                        {c.cups ? (
                                          <p className="text-xs font-mono text-gray-800">⚡ {c.cups}</p>
                                        ) : (
                                          <p className="text-xs text-gray-400 italic">Sin CUPS</p>
                                        )}
                                        <div className="flex flex-wrap gap-1.5">
                                          {tel && <span className="text-[10px] bg-green-50 text-green-700 px-1.5 py-0.5 rounded">📞 {tel}</span>}
                                          {iban && <span className="text-[10px] bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded">🏦 ...{iban.slice(-6)}</span>}
                                          {email && <span className="text-[10px] bg-orange-50 text-orange-700 px-1.5 py-0.5 rounded">📧 {email}</span>}
                                          {origen && <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{origen}</span>}
                                          {c.estado && <span className="text-[10px] bg-yellow-50 text-yellow-700 px-1.5 py-0.5 rounded">{c.estado}</span>}
                                        </div>
                                      </div>
                                      <button onClick={() => setSeleccionado(c)}
                                        className="text-[10px] text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap shrink-0 py-1 px-2 rounded hover:bg-blue-50">
                                        Ver detalle →
                                      </button>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )
      })()}

      {seleccionado && (
        <div>
          {resultados.length > 1 && (
            <button
              onClick={() => setSeleccionado(null)}
              className="text-sm text-blue-700 hover:underline mb-3 inline-block"
            >
              ← Volver a resultados
            </button>
          )}
          <FichaTramitabilidad cliente={seleccionado} />
        </div>
      )}
    </div>
  )
}

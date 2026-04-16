import { useState, useRef } from 'react'
import { Search, XCircle } from 'lucide-react'
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
      const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }

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
          'Authorization': `Bearer ${SUPABASE_KEY}`,
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

      {resultados.length > 1 && !seleccionado && !alerta && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-6">
          <div className="p-3 bg-gray-50 border-b border-gray-200">
            <span className="text-sm text-gray-600">{resultados.length} resultados encontrados</span>
          </div>
          <div className="divide-y divide-gray-100">
            {resultados.map(c => (
              <button
                key={c.id}
                onClick={() => setSeleccionado(c)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-blue-50 transition-colors text-left"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {c.nombre || c.datos_extra?.TITULAR || c.datos_extra?.Titular || 'Sin nombre'}
                  </p>
                  <p className="text-xs text-gray-500">
                    DNI: {c.dni || '—'} · CUPS: {c.cups || '—'}
                  </p>
                </div>
                <span className="text-xs text-gray-400">{c.estado || c.campana || ''}</span>
              </button>
            ))}
          </div>
        </div>
      )}

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

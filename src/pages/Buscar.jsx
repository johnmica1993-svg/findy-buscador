import { useState, useCallback } from 'react'
import { Search, XCircle } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import FichaTramitabilidad from '../components/Clientes/FichaTramitabilidad'

const ESTADOS_BLOQUEADOS = [
  'activado',
  'tramitando',
  'pendiente de verificacion',
  'pendiente de verificación',
  'pendiente',
  'activo',
]

function esEstadoBloqueado(estado) {
  if (!estado) return false
  return ESTADOS_BLOQUEADOS.includes(estado.trim().toLowerCase())
}

export default function Buscar() {
  const { esAdmin, usuario } = useAuth()
  const [query, setQuery] = useState('')
  const [resultados, setResultados] = useState([])
  const [seleccionado, setSeleccionado] = useState(null)
  const [buscando, setBuscando] = useState(false)
  const [buscado, setBuscado] = useState(false)
  const [alerta, setAlerta] = useState(null)

  const buscar = useCallback(async (q) => {
    if (!q || q.length < 2) {
      setResultados([])
      setBuscado(false)
      setSeleccionado(null)
      setAlerta(null)
      return
    }
    setBuscando(true)
    setBuscado(true)
    setAlerta(null)
    setSeleccionado(null)

    try {
      const res = await fetch('/.netlify/functions/search-clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q.trim(), rol: usuario?.rol }),
      })
      const result = await res.json()

      if (!res.ok) throw new Error(result.error || 'Error en la búsqueda')

      const data = result.data || []

      setResultados(data)

      if (data.length === 0) {
        setSeleccionado(null)
      } else if (!esAdmin && data.some(c => esEstadoBloqueado(c.estado))) {
        // Sub-users: block if ANY result has an active process
        setSeleccionado(null)
        setAlerta({
          tipo: 'proceso_activo',
          mensaje: 'CLIENTE NO TRAMITABLE — Este cliente ya tiene un proceso activo.',
        })
      } else if (data.length === 1) {
        setSeleccionado(data[0])
      }
    } catch (err) {
      console.error('Error buscando:', err)
    } finally {
      setBuscando(false)
    }
  }, [esAdmin, usuario])

  let debounceTimer
  function handleChange(e) {
    const val = e.target.value
    setQuery(val)
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => buscar(val), 300)
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Buscador de Clientes</h2>

      <div className="relative mb-6">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={22} />
        <input
          type="text"
          value={query}
          onChange={handleChange}
          placeholder="Buscar por CUPS, DNI o Nombre..."
          className="w-full pl-12 pr-4 py-4 text-lg border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm"
          autoFocus
        />
        {buscando && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-400">Buscando...</div>
        )}
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
                  <p className="text-sm font-medium text-gray-900">{c.nombre || 'Sin nombre'}</p>
                  <p className="text-xs text-gray-500">CUPS: {c.cups} · DNI: {c.dni || '—'}</p>
                </div>
                <span className="text-xs text-gray-400">{c.campana}</span>
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

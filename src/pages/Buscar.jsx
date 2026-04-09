import { useState } from 'react'
import { Search, XCircle } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import Button from '../components/UI/Button'
import FichaTramitabilidad from '../components/Clientes/FichaTramitabilidad'

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

export default function Buscar() {
  const { esAdmin, usuario } = useAuth()
  const [query, setQuery] = useState('')
  const [resultados, setResultados] = useState([])
  const [seleccionado, setSeleccionado] = useState(null)
  const [buscando, setBuscando] = useState(false)
  const [buscado, setBuscado] = useState(false)
  const [alerta, setAlerta] = useState(null)

  async function buscar() {
    const termino = query.trim()
    if (!termino) return

    setBuscando(true)
    setBuscado(true)
    setAlerta(null)
    setSeleccionado(null)
    setResultados([])

    try {
      const res = await fetch('/.netlify/functions/search-clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ termino }),
      })

      const data = await res.json()

      if (!res.ok) {
        console.error('Error búsqueda:', data.error)
        return
      }

      const lista = Array.isArray(data) ? data : data.clientes || data.data || []
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

      // Log search
      fetch('/.netlify/functions/log-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usuario_id: usuario?.id,
          usuario_nombre: usuario?.nombre,
          usuario_email: usuario?.email,
          oficina: usuario?.oficina?.nombre || null,
          termino_busqueda: termino,
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

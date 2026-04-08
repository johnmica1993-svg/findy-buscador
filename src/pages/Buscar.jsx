import { useState, useCallback } from 'react'
import { Search } from 'lucide-react'
import { supabase } from '../lib/supabase'
import FichaTramitabilidad from '../components/Clientes/FichaTramitabilidad'

export default function Buscar() {
  const [query, setQuery] = useState('')
  const [resultados, setResultados] = useState([])
  const [seleccionado, setSeleccionado] = useState(null)
  const [buscando, setBuscando] = useState(false)
  const [buscado, setBuscado] = useState(false)

  const buscar = useCallback(async (q) => {
    if (!q || q.length < 2) {
      setResultados([])
      setBuscado(false)
      return
    }
    setBuscando(true)
    setBuscado(true)
    try {
      const termino = `%${q}%`
      const { data, error } = await supabase
        .from('clientes')
        .select('*')
        .or(`cups.ilike.${termino},dni.ilike.${termino},nombre.ilike.${termino}`)
        .limit(20)

      if (error) throw error
      setResultados(data || [])
      if (data?.length === 1) setSeleccionado(data[0])
      else setSeleccionado(null)
    } catch (err) {
      console.error('Error buscando:', err)
    } finally {
      setBuscando(false)
    }
  }, [])

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

      {/* Barra de búsqueda */}
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

      {/* Resultados */}
      {buscado && !buscando && resultados.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <Search size={48} className="mx-auto mb-3 text-gray-300" />
          <p>No se encontraron clientes para "{query}"</p>
        </div>
      )}

      {resultados.length > 1 && !seleccionado && (
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

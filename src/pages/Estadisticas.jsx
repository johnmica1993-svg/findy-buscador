import { useState, useEffect } from 'react'
import { BarChart3, Users, Search, CheckCircle, XCircle, Filter } from 'lucide-react'
import Card from '../components/UI/Card'
import Button from '../components/UI/Button'
import Input from '../components/UI/Input'

export default function Estadisticas() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [filtroFecha, setFiltroFecha] = useState('')
  const [filtroUsuario, setFiltroUsuario] = useState('')

  useEffect(() => { cargar() }, [])

  async function cargar(fecha, usuarioId) {
    setLoading(true)
    try {
      const res = await fetch('/.netlify/functions/get-stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filtro_fecha: fecha || undefined,
          filtro_usuario: usuarioId || undefined,
        }),
      })
      const data = await res.json()
      if (res.ok) setStats(data)
    } catch (err) {
      console.error('Error cargando stats:', err)
    } finally {
      setLoading(false)
    }
  }

  function aplicarFiltros() {
    cargar(filtroFecha || undefined, filtroUsuario || undefined)
  }

  function limpiarFiltros() {
    setFiltroFecha('')
    setFiltroUsuario('')
    cargar()
  }

  function formatHora(ts) {
    if (!ts) return '—'
    const d = new Date(ts)
    return d.toLocaleDateString('es-ES') + ' ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  }

  if (loading && !stats) {
    return <div className="flex items-center justify-center h-64 text-gray-500">Cargando estadísticas...</div>
  }

  if (!stats) return null

  const totalBusquedasHoy = stats.statsUsuarios.reduce((s, u) => s + u.hoy, 0)

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Estadísticas</h2>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card className="p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-500">Total clientes en CRM</span>
            <Users size={18} className="text-blue-600" />
          </div>
          <p className="text-4xl font-bold text-blue-800">{stats.totalClientes.toLocaleString()}</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-500">Búsquedas hoy</span>
            <Search size={18} className="text-green-600" />
          </div>
          <p className="text-4xl font-bold text-green-700">{totalBusquedasHoy}</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-500">Usuarios activos</span>
            <BarChart3 size={18} className="text-purple-600" />
          </div>
          <p className="text-4xl font-bold text-purple-700">{stats.statsUsuarios.filter(u => u.hoy > 0).length}</p>
        </Card>
      </div>

      {/* Búsquedas por usuario */}
      <Card className="overflow-hidden mb-6">
        <div className="p-4 bg-gray-50 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Users size={16} /> Búsquedas por usuario
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Usuario</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Oficina</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Hoy</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Esta semana</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {stats.statsUsuarios.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Sin búsquedas registradas</td></tr>
              ) : stats.statsUsuarios.map(u => (
                <tr key={u.usuario_id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{u.nombre}</td>
                  <td className="px-4 py-3 text-gray-500">{u.oficina}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block min-w-[2rem] px-2 py-0.5 rounded-full text-xs font-semibold ${u.hoy > 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                      {u.hoy}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-block min-w-[2rem] px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">{u.semana}</span>
                  </td>
                  <td className="px-4 py-3 text-center font-medium text-gray-700">{u.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Filtros */}
      <Card className="p-4 mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <Input
            label="Desde fecha"
            type="date"
            value={filtroFecha}
            onChange={e => setFiltroFecha(e.target.value)}
            className="w-44"
          />
          <div className="w-52">
            <label className="block text-sm font-medium text-gray-700 mb-1">Usuario</label>
            <select
              value={filtroUsuario}
              onChange={e => setFiltroUsuario(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todos</option>
              {stats.statsUsuarios.map(u => (
                <option key={u.usuario_id} value={u.usuario_id}>{u.nombre}</option>
              ))}
            </select>
          </div>
          <Button onClick={aplicarFiltros} className="mb-0.5">
            <Filter size={14} /> Filtrar
          </Button>
          {(filtroFecha || filtroUsuario) && (
            <Button variant="secondary" onClick={limpiarFiltros} className="mb-0.5">Limpiar</Button>
          )}
        </div>
      </Card>

      {/* Últimas búsquedas */}
      <Card className="overflow-hidden">
        <div className="p-4 bg-gray-50 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Search size={16} /> Últimas 50 búsquedas
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Hora</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Usuario</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Término buscado</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Encontrado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {stats.ultimas.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">Sin búsquedas registradas</td></tr>
              ) : stats.ultimas.map(log => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">{formatHora(log.created_at)}</td>
                  <td className="px-4 py-2.5 font-medium text-gray-700">{log.usuario_nombre || '—'}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-800">{log.termino_busqueda}</td>
                  <td className="px-4 py-2.5 text-center">
                    {log.resultado_encontrado
                      ? <CheckCircle size={16} className="text-green-500 inline" />
                      : <XCircle size={16} className="text-red-400 inline" />
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

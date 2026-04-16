import { useState, useEffect } from 'react'
import { Users, CheckCircle, XCircle, Clock, Zap, CalendarDays, TrendingUp, Search, BarChart3 } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { supabase } from '../lib/supabase'
import { calcularTramitabilidad, esTramitableProximamente } from '../lib/tramitabilidad'
import { startOfWeek, subWeeks, format, isAfter } from 'date-fns'
import { es } from 'date-fns/locale'
import Card from '../components/UI/Card'

const PERIODOS = [
  { key: 'hoy', label: 'Hoy' },
  { key: 'semana', label: 'Esta semana' },
  { key: 'mes', label: 'Este mes' },
]

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [chartData, setChartData] = useState([])
  const [loading, setLoading] = useState(true)
  const [busquedasStats, setBusquedasStats] = useState(null)
  const [periodo, setPeriodo] = useState('hoy')
  const [loadingBusquedas, setLoadingBusquedas] = useState(true)

  useEffect(() => {
    cargarEstadisticas()
    cargarBusquedas()
  }, [])

  useEffect(() => {
    cargarBusquedas()
  }, [periodo])

  async function cargarEstadisticas() {
    try {
      const SUPA_URL = import.meta.env.VITE_SUPABASE_URL
      const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
      const h = { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}`, 'Prefer': 'count=exact' }

      // Count total (HEAD request with count)
      const totalRes = await fetch(`${SUPA_URL}/rest/v1/clientes?select=id&limit=0`, { headers: h })
      const totalMatch = totalRes.headers.get('content-range')?.match(/\/(\d+)/)
      const total = totalMatch ? parseInt(totalMatch[1]) : 0

      // Count by estado
      const hoy = new Date()
      const inicioSemana = startOfWeek(hoy, { weekStartsOn: 1 }).toISOString()

      // Count this week
      const semanaRes = await fetch(`${SUPA_URL}/rest/v1/clientes?select=id&limit=0&created_at=gte.${inicioSemana}`, { headers: h })
      const semanaMatch = semanaRes.headers.get('content-range')?.match(/\/(\d+)/)
      const cargadosEstaSemana = semanaMatch ? parseInt(semanaMatch[1]) : 0

      setStats({
        total,
        tramitables: 0,
        noTramitables: 0,
        sinDatos: total,
        proximos: 0,
        porCampana: { ENDESA: 0, FACTOR_ENERGIA: 0, NATURGY_RADEN: 0, OTRO: 0 },
        cargadosEstaSemana,
      })

      setChartData([])
    } catch (err) {
      console.error('Error cargando stats:', err)
    } finally {
      setLoading(false)
    }
  }

  async function cargarBusquedas() {
    setLoadingBusquedas(true)
    try {
      const now = new Date()
      let desde
      if (periodo === 'hoy') {
        desde = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
      } else if (periodo === 'semana') {
        const d = new Date(now)
        d.setDate(now.getDate() - now.getDay() + 1)
        d.setHours(0, 0, 0, 0)
        desde = d.toISOString()
      } else {
        const d = new Date(now.getFullYear(), now.getMonth(), 1)
        desde = d.toISOString()
      }

      const res = await fetch('/.netlify/functions/get-stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filtro_fecha: desde }),
      })
      const data = await res.json()
      if (res.ok) setBusquedasStats(data)
    } catch (err) {
      console.error('Error cargando búsquedas:', err)
    } finally {
      setLoadingBusquedas(false)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-500">Cargando tablero...</div>
  }

  if (!stats) return null

  const tarjetas = [
    { label: 'Total Clientes', value: stats.total, icon: Users, color: 'bg-blue-800', textColor: 'text-blue-800' },
    { label: 'Tramitables', value: stats.tramitables, icon: CheckCircle, color: 'bg-green-600', textColor: 'text-green-600' },
    { label: 'No Tramitables', value: stats.noTramitables, icon: XCircle, color: 'bg-red-600', textColor: 'text-red-600' },
    { label: 'Próximos (7 días)', value: stats.proximos, icon: Clock, color: 'bg-orange-500', textColor: 'text-orange-600' },
    { label: 'Cargados esta semana', value: stats.cargadosEstaSemana, icon: CalendarDays, color: 'bg-purple-600', textColor: 'text-purple-600' },
  ]

  const campanas = [
    { label: 'Endesa', value: stats.porCampana.ENDESA, color: 'bg-blue-500' },
    { label: 'Factor Energía', value: stats.porCampana.FACTOR_ENERGIA, color: 'bg-green-500' },
    { label: 'Naturgy Raden', value: stats.porCampana.NATURGY_RADEN, color: 'bg-orange-500' },
    { label: 'Otro', value: stats.porCampana.OTRO, color: 'bg-gray-500' },
  ]

  const top10 = (busquedasStats?.statsUsuarios || []).slice(0, 10)
  const top10Chart = top10.map((u, i) => ({
    nombre: u.nombre?.split(' ')[0] || `#${i + 1}`,
    busquedas: periodo === 'hoy' ? u.hoy : periodo === 'semana' ? u.semana : u.total,
  }))
  const ultimas20 = (busquedasStats?.ultimas || []).slice(0, 20)

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Tablero</h2>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        {tarjetas.map(t => (
          <Card key={t.label} className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-500">{t.label}</span>
              <div className={`p-2 rounded-lg ${t.color} bg-opacity-10`}>
                <t.icon size={18} className={t.textColor} />
              </div>
            </div>
            <p className={`text-3xl font-bold ${t.textColor}`}>{t.value}</p>
          </Card>
        ))}
      </div>

      {/* Campaña + Clientes chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <Card className="p-4 lg:col-span-1">
          <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <Zap size={16} className="text-orange-500" /> Por Campaña
          </h3>
          <div className="space-y-3">
            {campanas.map(c => (
              <div key={c.label} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${c.color}`} />
                  <span className="text-sm text-gray-600">{c.label}</span>
                </div>
                <span className="text-sm font-semibold text-gray-900">{c.value}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4 lg:col-span-2">
          <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <TrendingUp size={16} className="text-blue-600" /> Clientes cargados por semana
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="semana" fontSize={12} tickLine={false} />
              <YAxis fontSize={12} tickLine={false} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="clientes" fill="#1E40AF" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* ═══ ACTIVIDAD DE BÚSQUEDAS ═══ */}
      <div className="border-t border-gray-200 pt-6 mt-2">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Search size={20} className="text-blue-600" /> Actividad de Búsquedas
          </h3>
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            {PERIODOS.map(p => (
              <button
                key={p.key}
                onClick={() => setPeriodo(p.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  periodo === p.key ? 'bg-white text-blue-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {loadingBusquedas && !busquedasStats ? (
          <div className="text-center py-8 text-gray-400">Cargando búsquedas...</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            {/* Top 10 ranking table */}
            <Card className="overflow-hidden">
              <div className="p-3 bg-gray-50 border-b border-gray-200">
                <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <BarChart3 size={14} /> Top 10 usuarios — {PERIODOS.find(p => p.key === periodo)?.label}
                </h4>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-center px-3 py-2 font-medium text-gray-500 w-10">#</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Usuario</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Oficina</th>
                      <th className="text-center px-3 py-2 font-medium text-gray-600">Período</th>
                      <th className="text-center px-3 py-2 font-medium text-gray-600">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {top10.length === 0 ? (
                      <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-400 text-xs">Sin búsquedas en este período</td></tr>
                    ) : top10.map((u, i) => {
                      const val = periodo === 'hoy' ? u.hoy : periodo === 'semana' ? u.semana : u.total
                      return (
                        <tr key={u.usuario_id} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-center">
                            <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                              i === 0 ? 'bg-yellow-100 text-yellow-700' : i === 1 ? 'bg-gray-200 text-gray-600' : i === 2 ? 'bg-orange-100 text-orange-700' : 'text-gray-400'
                            }`}>
                              {i + 1}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-medium text-gray-800 text-xs">{u.nombre}</td>
                          <td className="px-3 py-2 text-gray-500 text-xs">{u.oficina}</td>
                          <td className="px-3 py-2 text-center">
                            <span className="inline-block min-w-[2rem] px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">{val}</span>
                          </td>
                          <td className="px-3 py-2 text-center text-xs text-gray-500">{u.total}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Top 10 chart */}
            <Card className="p-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <BarChart3 size={14} /> Búsquedas por usuario
              </h4>
              {top10Chart.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={top10Chart} layout="vertical" margin={{ left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                    <XAxis type="number" fontSize={11} tickLine={false} allowDecimals={false} />
                    <YAxis type="category" dataKey="nombre" fontSize={11} tickLine={false} width={70} />
                    <Tooltip />
                    <Bar dataKey="busquedas" fill="#3B82F6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[250px] text-gray-400 text-sm">Sin datos</div>
              )}
            </Card>
          </div>
        )}

        {/* Últimas 20 búsquedas */}
        <Card className="overflow-hidden">
          <div className="p-3 bg-gray-50 border-b border-gray-200">
            <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Search size={14} /> Últimas 20 búsquedas
            </h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Hora</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Usuario</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Término</th>
                  <th className="text-center px-4 py-2 font-medium text-gray-600">Resultado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {ultimas20.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400 text-xs">Sin búsquedas registradas</td></tr>
                ) : ultimas20.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-xs text-gray-500 whitespace-nowrap">
                      {log.created_at ? new Date(log.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                    <td className="px-4 py-2 text-xs font-medium text-gray-700">{log.usuario_nombre || '—'}</td>
                    <td className="px-4 py-2 font-mono text-xs text-gray-800">{log.termino_busqueda}</td>
                    <td className="px-4 py-2 text-center">
                      {log.resultado_encontrado
                        ? <CheckCircle size={15} className="text-green-500 inline" />
                        : <XCircle size={15} className="text-red-400 inline" />
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  )
}

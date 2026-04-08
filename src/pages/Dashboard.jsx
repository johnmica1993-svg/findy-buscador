import { useState, useEffect } from 'react'
import { Users, CheckCircle, XCircle, Clock, Zap, CalendarDays, TrendingUp } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { supabase } from '../lib/supabase'
import { calcularTramitabilidad, esTramitableProximamente } from '../lib/tramitabilidad'
import { startOfWeek, subWeeks, format, isAfter } from 'date-fns'
import { es } from 'date-fns/locale'
import Card from '../components/UI/Card'

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [chartData, setChartData] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    cargarEstadisticas()
  }, [])

  async function cargarEstadisticas() {
    try {
      const { data: clientes, error } = await supabase
        .from('clientes')
        .select('*')

      if (error) throw error

      const total = clientes.length
      let tramitables = 0
      let noTramitables = 0
      let sinDatos = 0
      let proximos = 0
      const porCampana = { ENDESA: 0, FACTOR_ENERGIA: 0, NATURGY_RADEN: 0, OTRO: 0 }

      const hoy = new Date()
      const inicioSemana = startOfWeek(hoy, { weekStartsOn: 1 })
      let cargadosEstaSemana = 0

      clientes.forEach(c => {
        const t = calcularTramitabilidad(c)
        if (t.tramitable === true) tramitables++
        else if (t.tramitable === false) noTramitables++
        else sinDatos++

        if (esTramitableProximamente(c, 7)) proximos++

        if (c.campana && porCampana[c.campana] !== undefined) {
          porCampana[c.campana]++
        }

        if (c.created_at && isAfter(new Date(c.created_at), inicioSemana)) {
          cargadosEstaSemana++
        }
      })

      setStats({ total, tramitables, noTramitables, sinDatos, proximos, porCampana, cargadosEstaSemana })

      // Chart: clientes por semana (últimas 8 semanas)
      const semanas = []
      for (let i = 7; i >= 0; i--) {
        const inicio = startOfWeek(subWeeks(hoy, i), { weekStartsOn: 1 })
        const fin = startOfWeek(subWeeks(hoy, i - 1), { weekStartsOn: 1 })
        const count = clientes.filter(c => {
          const d = new Date(c.created_at)
          return d >= inicio && d < fin
        }).length
        semanas.push({
          semana: format(inicio, 'dd MMM', { locale: es }),
          clientes: count,
        })
      }
      setChartData(semanas)
    } catch (err) {
      console.error('Error cargando stats:', err)
    } finally {
      setLoading(false)
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

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Tablero</h2>

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
    </div>
  )
}

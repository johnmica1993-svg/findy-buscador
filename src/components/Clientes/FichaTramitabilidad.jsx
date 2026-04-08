import { calcularTramitabilidad } from '../../lib/tramitabilidad'
import Badge from '../UI/Badge'
import Card from '../UI/Card'
import { Calendar, MapPin, FileText, Zap, Hash, User } from 'lucide-react'

function formatFecha(f) {
  if (!f) return '—'
  return new Date(f).toLocaleDateString('es-ES')
}

const CAMPANA_LABELS = {
  ENDESA: 'Endesa',
  FACTOR_ENERGIA: 'Factor Energía',
  NATURGY_RADEN: 'Naturgy Raden',
  OTRO: 'Otro',
}

const ESTADO_COLORS = {
  ACTIVO: 'green',
  BAJA: 'red',
  PENDIENTE: 'yellow',
  CANCELADO: 'gray',
}

export default function FichaTramitabilidad({ cliente }) {
  const tram = calcularTramitabilidad(cliente)

  const bannerColors = {
    green: 'bg-green-50 border-green-400 text-green-800',
    red: 'bg-red-50 border-red-400 text-red-800',
    yellow: 'bg-yellow-50 border-yellow-400 text-yellow-800',
  }

  return (
    <div className="space-y-4">
      {/* Banner de tramitabilidad */}
      <div className={`rounded-xl border-2 p-6 ${bannerColors[tram.color]}`}>
        <div className="flex items-center gap-3 mb-2">
          <span className="text-3xl">{tram.icono}</span>
          <h3 className="text-xl font-bold">{tram.estado.replace('_', ' ')}</h3>
        </div>
        <p className="text-sm">{tram.mensaje}</p>
        {tram.diasActivo !== null && (
          <div className="flex gap-4 mt-3">
            <span className="text-xs font-medium">Días activo: <strong>{tram.diasActivo}</strong></span>
            {tram.fechaTramitable && (
              <span className="text-xs font-medium">Tramitable desde: <strong>{formatFecha(tram.fechaTramitable)}</strong></span>
            )}
          </div>
        )}
      </div>

      {/* Datos del cliente */}
      <Card className="p-5">
        <h4 className="text-sm font-semibold text-gray-700 mb-4">Datos del Cliente</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Dato icon={Hash} label="CUPS" value={cliente.cups} />
          <Dato icon={FileText} label="DNI" value={cliente.dni} />
          <Dato icon={User} label="Nombre" value={cliente.nombre} />
          <Dato icon={MapPin} label="Dirección" value={cliente.direccion} />
          <Dato icon={Zap} label="Campaña" value={CAMPANA_LABELS[cliente.campana] || cliente.campana} />
          <div>
            <span className="text-xs text-gray-500">Estado</span>
            <div className="mt-1">
              <Badge color={ESTADO_COLORS[cliente.estado]}>{cliente.estado}</Badge>
            </div>
          </div>
        </div>
      </Card>

      {/* Fechas */}
      <Card className="p-5">
        <h4 className="text-sm font-semibold text-gray-700 mb-4">Fechas</h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Dato icon={Calendar} label="Fecha Alta" value={formatFecha(cliente.fecha_alta)} />
          <Dato icon={Calendar} label="Activación" value={formatFecha(cliente.fecha_activacion)} />
          <Dato icon={Calendar} label="Último Cambio" value={formatFecha(cliente.fecha_ultimo_cambio)} />
          <Dato icon={Calendar} label="Fecha Baja" value={formatFecha(cliente.fecha_baja)} />
        </div>
      </Card>
    </div>
  )
}

function Dato({ icon: Icon, label, value }) {
  return (
    <div>
      <span className="flex items-center gap-1 text-xs text-gray-500">
        {Icon && <Icon size={12} />} {label}
      </span>
      <p className="text-sm font-medium text-gray-900 mt-0.5">{value || '—'}</p>
    </div>
  )
}

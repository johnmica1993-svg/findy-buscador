import { calcularTramitabilidad } from '../../lib/tramitabilidad'
import Badge from '../UI/Badge'
import Card from '../UI/Card'
import { Calendar, MapPin, FileText, Zap, Hash, User, Phone, Mail, Building, CreditCard, Globe, Package } from 'lucide-react'

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

// Keys already displayed in named sections — excluded from "Datos adicionales"
const KEYS_MOSTRADAS = new Set([
  'nombre_completo', 'NOMBRE COMPLETO', 'Nombre Completo', 'nombre completo',
  'ciudad', 'Ciudad', 'CIUDAD',
  'codigo_postal', 'cp', 'CP', 'Código Postal', 'CODIGO POSTAL', 'codigo postal',
  'telefono', 'telefono_1', 'telefono1', 'tlf', 'movil',
  'Telefono', 'Teléfono', 'TELEFONO', 'Telefono 1', 'Teléfono 1', 'TELEFONO 1', 'Movil', 'Móvil', 'MOVIL',
  'telefono_2', 'telefono2', 'tlf2',
  'Telefono 2', 'Teléfono 2', 'TELEFONO 2',
  'email', 'correo', 'correo_electronico',
  'Email', 'EMAIL', 'Correo', 'CORREO', 'Correo Electronico', 'CORREO ELECTRONICO',
  'iban', 'cuenta_bancaria',
  'IBAN', 'Iban', 'Cuenta Bancaria', 'CUENTA BANCARIA',
])

export default function FichaTramitabilidad({ cliente }) {
  const tram = calcularTramitabilidad(cliente)
  const extras = cliente.datos_extra || {}

  const bannerColors = {
    green: 'bg-green-50 border-green-400 text-green-800',
    red: 'bg-red-50 border-red-400 text-red-800',
    yellow: 'bg-yellow-50 border-yellow-400 text-yellow-800',
  }

  // Search across main fields and all datos_extra key variants
  function get(...keys) {
    for (const k of keys) {
      if (cliente[k]) return cliente[k]
      if (extras[k]) return extras[k]
    }
    return null
  }

  const nombreCompleto = get(
    'nombre', 'nombre_completo',
    'NOMBRE COMPLETO', 'Nombre Completo', 'nombre completo',
    'NOMBRE', 'Nombre',
  )

  const telefono1 = get(
    'telefono', 'telefono_1', 'telefono1', 'tlf', 'movil',
    'Telefono', 'Teléfono', 'TELEFONO', 'Telefono 1', 'Teléfono 1', 'TELEFONO 1',
    'Movil', 'Móvil', 'MOVIL',
  )

  const telefono2 = get(
    'telefono_2', 'telefono2', 'tlf2',
    'Telefono 2', 'Teléfono 2', 'TELEFONO 2',
  )

  const correo = get(
    'email', 'correo', 'correo_electronico',
    'Email', 'EMAIL', 'Correo', 'CORREO', 'Correo Electronico', 'CORREO ELECTRONICO',
  )

  const iban = get('iban', 'cuenta_bancaria', 'IBAN', 'Iban', 'Cuenta Bancaria', 'CUENTA BANCARIA')

  const ciudad = get('ciudad', 'Ciudad', 'CIUDAD')

  const codigoPostal = get('codigo_postal', 'cp', 'CP', 'Código Postal', 'CODIGO POSTAL', 'codigo postal')

  // Extra fields not already shown
  const extrasRestantes = Object.entries(extras).filter(([key]) => !KEYS_MOSTRADAS.has(key))

  return (
    <div className="space-y-4">
      {/* 1. Banner de tramitabilidad / alerta */}
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

      {/* 2. Datos principales */}
      <Card className="p-5">
        <h4 className="text-sm font-semibold text-gray-700 mb-4">Datos principales</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Dato icon={Hash} label="CUPS" value={cliente.cups} />
          <Dato icon={FileText} label="DNI / NIF" value={cliente.dni} />
          <Dato icon={User} label="Nombre completo" value={nombreCompleto} />
        </div>
      </Card>

      {/* 3. Contacto */}
      <Card className="p-5">
        <h4 className="text-sm font-semibold text-gray-700 mb-4">Contacto</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Dato icon={Phone} label="Teléfono 1" value={telefono1} />
          <Dato icon={Phone} label="Teléfono 2" value={telefono2} />
          <Dato icon={Mail} label="Correo electrónico" value={correo} />
          <Dato icon={CreditCard} label="IBAN" value={iban} />
        </div>
      </Card>

      {/* 4. Dirección */}
      <Card className="p-5">
        <h4 className="text-sm font-semibold text-gray-700 mb-4">Dirección</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Dato icon={MapPin} label="Dirección" value={cliente.direccion} className="sm:col-span-2 lg:col-span-2" />
          <Dato icon={Building} label="Ciudad" value={ciudad} />
          <Dato icon={MapPin} label="Código postal" value={codigoPostal} />
        </div>
      </Card>

      {/* 5. Campaña y Estado */}
      <Card className="p-5">
        <h4 className="text-sm font-semibold text-gray-700 mb-4">Campaña y Estado</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Dato icon={Zap} label="Campaña" value={CAMPANA_LABELS[cliente.campana] || cliente.campana} />
          <div>
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <Globe size={12} /> Estado
            </span>
            <div className="mt-1">
              <Badge color={ESTADO_COLORS[cliente.estado?.toUpperCase()] || 'gray'}>{cliente.estado || '—'}</Badge>
            </div>
          </div>
        </div>
      </Card>

      {/* 6. Fechas */}
      <Card className="p-5">
        <h4 className="text-sm font-semibold text-gray-700 mb-4">Fechas</h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Dato icon={Calendar} label="Fecha Alta" value={formatFecha(cliente.fecha_alta)} />
          <Dato icon={Calendar} label="Activación" value={formatFecha(cliente.fecha_activacion)} />
          <Dato icon={Calendar} label="Último Cambio" value={formatFecha(cliente.fecha_ultimo_cambio)} />
          <Dato icon={Calendar} label="Fecha Baja" value={formatFecha(cliente.fecha_baja)} />
        </div>
      </Card>

      {/* 7. Datos extra del Excel */}
      {extrasRestantes.length > 0 && (
        <Card className="p-5">
          <h4 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <Package size={14} /> Datos adicionales
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {extrasRestantes.map(([key, value]) => (
              <Dato key={key} label={key} value={value} />
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

function Dato({ icon: Icon, label, value, className = '' }) {
  return (
    <div className={className}>
      <span className="flex items-center gap-1 text-xs text-gray-500">
        {Icon && <Icon size={12} />} {label}
      </span>
      <p className="text-sm font-medium text-gray-900 mt-0.5 break-all">{value || '—'}</p>
    </div>
  )
}

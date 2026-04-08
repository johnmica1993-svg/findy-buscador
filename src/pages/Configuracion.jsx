import { Settings } from 'lucide-react'
import Card from '../components/UI/Card'

export default function Configuracion() {
  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Configuración</h2>
      <Card className="p-8 text-center">
        <Settings className="mx-auto mb-4 text-gray-300" size={48} />
        <h3 className="text-lg font-semibold text-gray-700 mb-2">Panel de Configuración</h3>
        <p className="text-sm text-gray-500">
          Aquí podrás configurar las reglas de tramitabilidad, notificaciones y preferencias del sistema.
        </p>
      </Card>
    </div>
  )
}

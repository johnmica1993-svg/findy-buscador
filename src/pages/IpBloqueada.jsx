import { ShieldX } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import Button from '../components/UI/Button'

export default function IpBloqueada() {
  const { logout } = useAuth()

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <div className="flex justify-center mb-4">
          <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center">
            <ShieldX className="text-red-600" size={40} />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Acceso bloqueado</h1>
        <p className="text-gray-600 mb-6">
          No se permite el acceso desde esta ubicación. Tu IP ha sido bloqueada por el administrador de tu oficina.
        </p>
        <Button variant="secondary" onClick={logout}>Cerrar sesión</Button>
      </div>
    </div>
  )
}

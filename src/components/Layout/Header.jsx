import { Search, LogOut, Menu } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'

export default function Header({ onToggleSidebar }) {
  const { usuario, logout } = useAuth()

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 lg:px-6 sticky top-0 z-40">
      <div className="flex items-center gap-3">
        <button onClick={onToggleSidebar} className="lg:hidden p-2 rounded-lg hover:bg-gray-100">
          <Menu size={20} />
        </button>
        <div className="flex items-center gap-2">
          <Search className="text-blue-800" size={24} />
          <h1 className="text-xl font-bold text-gray-900">
            FINDY <span className="text-blue-800">BUSCADOR</span>
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="hidden sm:block text-right">
          <p className="text-sm font-medium text-gray-900">{usuario?.nombre}</p>
          <p className="text-xs text-gray-500">{usuario?.rol} {usuario?.oficina?.nombre ? `· ${usuario.oficina.nombre}` : ''}</p>
        </div>
        <button
          onClick={logout}
          className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
          title="Cerrar sesión"
        >
          <LogOut size={20} />
        </button>
      </div>
    </header>
  )
}

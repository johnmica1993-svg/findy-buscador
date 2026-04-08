import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Users, Upload, Building2, UserCog, Settings, Search, X, BarChart3
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'

const menuItems = [
  { to: '/', icon: LayoutDashboard, label: 'Tablero', roles: ['ADMIN'] },
  { to: '/buscar', icon: Search, label: 'Buscador', roles: ['ADMIN', 'OFICINA', 'COMERCIAL'] },
  { to: '/clientes', icon: Users, label: 'Clientes', roles: ['ADMIN'] },
  { to: '/carga', icon: Upload, label: 'Carga Masiva', roles: ['ADMIN'] },
  { to: '/oficinas', icon: Building2, label: 'Oficinas', roles: ['ADMIN'] },
  { to: '/usuarios', icon: UserCog, label: 'Usuarios', roles: ['ADMIN'] },
  { to: '/estadisticas', icon: BarChart3, label: 'Estadísticas', roles: ['ADMIN'] },
  { to: '/configuracion', icon: Settings, label: 'Configuración', roles: ['ADMIN'] },
]

export default function Sidebar({ open, onClose }) {
  const { usuario } = useAuth()
  const rol = usuario?.rol || ''

  const filteredItems = menuItems.filter(item => item.roles.includes(rol))

  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-black/30 z-40 lg:hidden" onClick={onClose} />
      )}
      <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 transform transition-transform duration-200 ease-in-out ${open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'} flex flex-col`}>
        <div className="flex items-center justify-between p-4 lg:hidden border-b border-gray-200">
          <span className="font-bold text-gray-900">Menú</span>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100">
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {filteredItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-800'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`
              }
            >
              <item.icon size={20} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-200">
          <p className="text-xs text-gray-400 text-center">FINDY BUSCADOR v1.0</p>
        </div>
      </aside>
    </>
  )
}

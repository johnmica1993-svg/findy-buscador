import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import AppLayout from './components/Layout/AppLayout'
import Login from './pages/Login'
import IpBloqueada from './pages/IpBloqueada'
import Dashboard from './pages/Dashboard'
import Buscar from './pages/Buscar'
import Clientes from './pages/Clientes'
import CargaMasiva from './pages/CargaMasiva'
import Oficinas from './pages/Oficinas'
import Usuarios from './pages/Usuarios'
import Configuracion from './pages/Configuracion'
import ResetPassword from './pages/ResetPassword'

function ProtectedRoute({ children, roles }) {
  const { usuario, loading, ipBloqueada } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-800 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Cargando...</p>
        </div>
      </div>
    )
  }

  if (!usuario) return <Navigate to="/login" replace />
  if (ipBloqueada) return <IpBloqueada />
  if (roles && !roles.includes(usuario.rol)) return <Navigate to="/buscar" replace />

  return children
}

function DefaultRedirect() {
  const { usuario } = useAuth()
  // Sub-users go to search, admin goes to dashboard
  if (usuario?.rol === 'OFICINA' || usuario?.rol === 'COMERCIAL') {
    return <Navigate to="/buscar" replace />
  }
  return <Dashboard />
}

function AppRoutes() {
  const { usuario, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-4 border-blue-800 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/login" element={usuario ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
        <Route index element={<DefaultRedirect />} />
        <Route path="buscar" element={<Buscar />} />
        <Route path="clientes" element={
          <ProtectedRoute roles={['ADMIN']}><Clientes /></ProtectedRoute>
        } />
        <Route path="carga" element={
          <ProtectedRoute roles={['ADMIN']}><CargaMasiva /></ProtectedRoute>
        } />
        <Route path="oficinas" element={
          <ProtectedRoute roles={['ADMIN']}><Oficinas /></ProtectedRoute>
        } />
        <Route path="usuarios" element={
          <ProtectedRoute roles={['ADMIN']}><Usuarios /></ProtectedRoute>
        } />
        <Route path="configuracion" element={
          <ProtectedRoute roles={['ADMIN']}><Configuracion /></ProtectedRoute>
        } />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}

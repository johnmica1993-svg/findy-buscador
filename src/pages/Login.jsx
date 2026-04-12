import { useState } from 'react'
import { Search, ArrowLeft } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import Button from '../components/UI/Button'
import Input from '../components/UI/Input'

export default function Login() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [modo, setModo] = useState('login') // 'login' | 'recuperar'
  const [resetEmail, setResetEmail] = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const [resetMsg, setResetMsg] = useState('')
  const [resetError, setResetError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
    } catch (err) {
      setError(err.message === 'Invalid login credentials'
        ? 'Credenciales incorrectas. Verifica tu email y contraseña.'
        : err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleResetPassword(e) {
    e.preventDefault()
    setResetError('')
    setResetMsg('')
    setResetLoading(true)
    try {
      const res = await fetch('/.netlify/functions/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al restablecer la contraseña')
      setResetMsg('Te enviamos una contraseña temporal a tu correo. Revisa tu bandeja de entrada (y spam).')
    } catch (err) {
      setResetError(err.message || 'Error al conectar con el servidor.')
    } finally {
      setResetLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Search className="text-blue-800" size={32} />
            <h1 className="text-3xl font-bold text-gray-900">
              FINDY <span className="text-blue-800">BUSCADOR</span>
            </h1>
          </div>
          <p className="text-gray-500">Verificador de clientes de energía</p>
        </div>

        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
          {modo === 'login' ? (
            <>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Iniciar sesión</h2>

              {error && (
                <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  label="Email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                  required
                />
                <Input
                  label="Contraseña"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Tu contraseña"
                  required
                />
                <Button type="submit" disabled={loading} className="w-full">
                  {loading ? 'Entrando...' : 'Entrar'}
                </Button>
              </form>

              <div className="mt-4 text-center">
                <button
                  onClick={() => { setModo('recuperar'); setResetEmail(email); setResetMsg(''); setResetError('') }}
                  className="text-sm text-blue-700 hover:text-blue-900 hover:underline"
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-4">
                <button
                  onClick={() => setModo('login')}
                  className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                >
                  <ArrowLeft size={20} />
                </button>
                <h2 className="text-lg font-semibold text-gray-900">Recuperar contraseña</h2>
              </div>

              <p className="text-sm text-gray-500 mb-4">
                Ingresa tu email y te enviaremos una contraseña temporal.
              </p>

              {resetMsg && (
                <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700">
                  {resetMsg}
                </div>
              )}

              {resetError && (
                <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                  {resetError}
                </div>
              )}

              <form onSubmit={handleResetPassword} className="space-y-4">
                <Input
                  label="Email"
                  type="email"
                  value={resetEmail}
                  onChange={e => setResetEmail(e.target.value)}
                  placeholder="tu@email.com"
                  required
                />
                <Button type="submit" disabled={resetLoading} className="w-full">
                  {resetLoading ? 'Enviando...' : 'Enviar contraseña temporal'}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

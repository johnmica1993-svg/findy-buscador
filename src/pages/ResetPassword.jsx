import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { KeyRound, Search } from 'lucide-react'
import { supabase } from '../lib/supabase'
import Button from '../components/UI/Button'
import Input from '../components/UI/Input'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [exito, setExito] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.')
      return
    }

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.')
      return
    }

    setLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      setExito(true)
    } catch (err) {
      setError(err.message === 'New password should be different from the old password.'
        ? 'La nueva contraseña debe ser diferente a la anterior.'
        : err.message || 'Error al actualizar la contraseña.')
    } finally {
      setLoading(false)
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
        </div>

        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
          {exito ? (
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <KeyRound className="text-green-600" size={32} />
              </div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Contraseña actualizada</h2>
              <p className="text-sm text-gray-500 mb-6">
                Tu contraseña se ha restablecido correctamente. Ya puedes iniciar sesión.
              </p>
              <Button onClick={() => navigate('/login')} className="w-full">
                Ir a iniciar sesión
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-4">
                <KeyRound className="text-blue-800" size={22} />
                <h2 className="text-lg font-semibold text-gray-900">Nueva contraseña</h2>
              </div>

              <p className="text-sm text-gray-500 mb-4">
                Ingresa tu nueva contraseña para restablecer el acceso a tu cuenta.
              </p>

              {error && (
                <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  label="Nueva contraseña"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  required
                  minLength={6}
                />
                <Input
                  label="Confirmar contraseña"
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Repite tu contraseña"
                  required
                />
                <Button type="submit" disabled={loading} className="w-full">
                  {loading ? 'Actualizando...' : 'Restablecer contraseña'}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

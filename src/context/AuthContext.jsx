import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [usuario, setUsuario] = useState(null)
  const [loading, setLoading] = useState(true)
  const [ipBloqueada, setIpBloqueada] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) cargarUsuario(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) cargarUsuario(session.user.id)
      else {
        setUsuario(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function cargarUsuario(userId) {
    try {
      const { data, error } = await supabase
        .from('usuarios')
        .select('*, oficina:oficinas(*)')
        .eq('id', userId)
        .single()

      if (error) throw error

      if (!data.activo) {
        await supabase.auth.signOut()
        setLoading(false)
        return
      }

      if (data.rol === 'OFICINA' && data.oficina) {
        const ipOk = await verificarIP(data.oficina.ip_permitidas || [])
        if (!ipOk) {
          setIpBloqueada(true)
          setUsuario(data)
          setLoading(false)
          return
        }
      }

      setUsuario(data)
    } catch (err) {
      console.error('Error cargando usuario:', err)
    } finally {
      setLoading(false)
    }
  }

  async function verificarIP(ipsBloqueadas) {
    if (!ipsBloqueadas || ipsBloqueadas.length === 0) return true
    try {
      const res = await fetch('https://api.ipify.org?format=json')
      const { ip } = await res.json()
      return !ipsBloqueadas.includes(ip)
    } catch {
      return true
    }
  }

  async function login(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  }

  async function logout() {
    await supabase.auth.signOut()
    setUsuario(null)
    setSession(null)
    setIpBloqueada(false)
  }

  const esAdmin = usuario?.rol === 'ADMIN'
  const esOficina = usuario?.rol === 'OFICINA'
  const esComercial = usuario?.rol === 'COMERCIAL'

  return (
    <AuthContext.Provider value={{
      session, usuario, loading, ipBloqueada,
      login, logout,
      esAdmin, esOficina, esComercial,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}

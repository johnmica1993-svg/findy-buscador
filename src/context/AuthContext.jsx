import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [usuario, setUsuario] = useState(null)
  const [loading, setLoading] = useState(true)
  const [ipBloqueada, setIpBloqueada] = useState(false)
  const [ipBloqueadaInfo, setIpBloqueadaInfo] = useState(null)

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

      if ((data.rol === 'OFICINA' || data.rol === 'COMERCIAL') && data.oficina) {
        const result = await verificarIP(data.oficina)
        if (!result.allowed) {
          await registrarIntentoBloqueado(data, result.ip)
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

  async function verificarIP(oficina) {
    try {
      const ipsPermitidas = new Set([
        ...(oficina.ips_autorizadas || []),
        ...(oficina.ip_autorizada ? [oficina.ip_autorizada] : []),
      ])

      if (ipsPermitidas.size === 0) return { allowed: true, ip: null }

      const res = await fetch('https://api.ipify.org?format=json')
      const { ip } = await res.json()

      return { allowed: ipsPermitidas.has(ip), ip }
    } catch {
      return { allowed: true, ip: null }
    }
  }

  async function registrarIntentoBloqueado(userData, ip) {
    let ciudad = 'Desconocida'
    let pais = 'Desconocido'

    try {
      const geo = await fetch(`https://ipapi.co/${ip}/json/`)
      const geoData = await geo.json()
      ciudad = geoData.city || 'Desconocida'
      pais = geoData.country_name || 'Desconocido'
    } catch {}

    setIpBloqueadaInfo({ ip, ciudad, pais })

    // Save to alertas_admin for real-time notifications
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/alertas_admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          tipo: 'ip_bloqueada',
          usuario_id: userData.id,
          usuario_nombre: userData.nombre,
          usuario_email: userData.email,
          oficina: userData.oficina?.nombre || null,
          ip, ciudad, pais,
        }),
      })
    } catch {}

    try {
      await fetch(`${SUPABASE_URL}/rest/v1/intentos_acceso_bloqueado`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          usuario_id: userData.id,
          usuario_email: userData.email,
          usuario_nombre: userData.nombre,
          oficina: userData.oficina?.nombre || null,
          ip_intentada: ip,
          ciudad,
          pais,
        }),
      })
    } catch {}
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
    setIpBloqueadaInfo(null)
  }

  const esAdmin = usuario?.rol === 'ADMIN'
  const esOficina = usuario?.rol === 'OFICINA'
  const esComercial = usuario?.rol === 'COMERCIAL'

  return (
    <AuthContext.Provider value={{
      session, usuario, loading, ipBloqueada, ipBloqueadaInfo,
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

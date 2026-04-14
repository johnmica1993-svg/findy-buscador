import { useState, useEffect } from 'react'
import { Search, LogOut, Menu } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export default function Header({ onToggleSidebar }) {
  const { usuario, logout, esAdmin } = useAuth()
  const [alertas, setAlertas] = useState([])
  const [mostrar, setMostrar] = useState(false)
  const [nuevas, setNuevas] = useState(0)

  useEffect(() => {
    if (!esAdmin) return

    cargarAlertas()

    const channel = supabase
      .channel('alertas_realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'alertas_admin' }, (payload) => {
        setAlertas(prev => [payload.new, ...prev])
        setNuevas(prev => prev + 1)
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [esAdmin])

  async function cargarAlertas() {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token || SUPABASE_KEY
      const res = await fetch(`${SUPABASE_URL}/rest/v1/alertas_admin?order=created_at.desc&limit=50`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${token}` },
      })
      const data = await res.json()
      if (Array.isArray(data)) {
        setAlertas(data)
        setNuevas(data.filter(a => !a.leida).length)
      }
    } catch {}
  }

  async function marcarLeida(id) {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token || SUPABASE_KEY
    await fetch(`${SUPABASE_URL}/rest/v1/alertas_admin?id=eq.${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${token}`, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ leida: true }),
    }).catch(() => {})
    setAlertas(prev => prev.map(a => a.id === id ? { ...a, leida: true } : a))
    setNuevas(prev => Math.max(0, prev - 1))
  }

  async function borrarAlerta(id) {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token || SUPABASE_KEY
    await fetch(`${SUPABASE_URL}/rest/v1/alertas_admin?id=eq.${id}`, {
      method: 'DELETE',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${token}` },
    }).catch(() => {})
    setAlertas(prev => prev.filter(a => a.id !== id))
  }

  async function borrarTodas() {
    if (!confirm('¿Borrar todas las alertas?')) return
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token || SUPABASE_KEY
    await fetch(`${SUPABASE_URL}/rest/v1/alertas_admin?id=not.is.null`, {
      method: 'DELETE',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${token}` },
    }).catch(() => {})
    setAlertas([])
    setNuevas(0)
  }

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

      <div className="flex items-center gap-3">
        {/* Alert bell - admin only */}
        {esAdmin && (
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => { setMostrar(!mostrar); if (!mostrar) setNuevas(0) }}
              style={{
                background: nuevas > 0 ? '#fee2e2' : '#f3f4f6',
                border: nuevas > 0 ? '1px solid #fca5a5' : '1px solid #e5e7eb',
                borderRadius: 8, padding: '6px 10px', cursor: 'pointer', position: 'relative', fontSize: 18,
              }}
            >
              🚨
              {nuevas > 0 && (
                <span style={{
                  position: 'absolute', top: -6, right: -6,
                  background: '#dc2626', color: 'white', borderRadius: '50%',
                  width: 20, height: 20, fontSize: 11, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {nuevas > 9 ? '9+' : nuevas}
                </span>
              )}
            </button>

            {mostrar && (
              <div style={{
                position: 'absolute', right: 0, top: '110%', width: 380, maxHeight: 480,
                background: '#111827', border: '1px solid #374151', borderRadius: 12,
                zIndex: 1000, boxShadow: '0 20px 60px rgba(0,0,0,0.5)', overflow: 'hidden',
              }}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '12px 16px', borderBottom: '1px solid #374151', background: '#1f2937',
                }}>
                  <h3 style={{ color: '#f87171', margin: 0, fontSize: 14, fontWeight: 700 }}>
                    🚨 Conexiones no autorizadas ({alertas.length})
                  </h3>
                  {alertas.length > 0 && (
                    <button onClick={borrarTodas} style={{ color: '#6b7280', fontSize: 11, background: 'none', border: 'none', cursor: 'pointer' }}>
                      Borrar todas
                    </button>
                  )}
                </div>

                <div style={{ overflowY: 'auto', maxHeight: 400 }}>
                  {alertas.length === 0 ? (
                    <p style={{ color: '#6b7280', textAlign: 'center', padding: 24, fontSize: 13 }}>No hay alertas</p>
                  ) : alertas.map(a => (
                    <div key={a.id} onClick={() => marcarLeida(a.id)} style={{
                      padding: '12px 16px', borderBottom: '1px solid #1f2937',
                      background: a.leida ? 'transparent' : 'rgba(220,38,38,0.05)', cursor: 'pointer',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ flex: 1 }}>
                          {!a.leida && (
                            <span style={{ background: '#dc2626', color: 'white', fontSize: 9, padding: '1px 6px', borderRadius: 4, fontWeight: 700, marginBottom: 4, display: 'inline-block' }}>NUEVA</span>
                          )}
                          <p style={{ color: '#f3f4f6', fontSize: 13, fontWeight: 600, margin: '0 0 4px' }}>{a.usuario_nombre || a.usuario_email}</p>
                          <p style={{ color: '#9ca3af', fontSize: 11, margin: '0 0 2px' }}>📧 {a.usuario_email}</p>
                          <p style={{ color: '#9ca3af', fontSize: 11, margin: '0 0 2px' }}>🏢 {a.oficina || 'Sin oficina'}</p>
                          <p style={{ color: '#f87171', fontSize: 12, fontFamily: 'monospace', margin: '4px 0 2px', fontWeight: 700 }}>🌐 {a.ip}</p>
                          {a.ciudad && <p style={{ color: '#6b7280', fontSize: 11, margin: 0 }}>📍 {a.ciudad}, {a.pais}</p>}
                          <p style={{ color: '#4b5563', fontSize: 10, margin: '4px 0 0' }}>{a.created_at ? new Date(a.created_at).toLocaleString('es-ES') : ''}</p>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); borrarAlerta(a.id) }}
                          style={{ background: 'none', border: 'none', color: '#4b5563', cursor: 'pointer', fontSize: 16, padding: '0 0 0 8px' }} title="Borrar">×</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="hidden sm:block text-right">
          <p className="text-sm font-medium text-gray-900">{usuario?.nombre}</p>
          <p className="text-xs text-gray-500">{usuario?.rol} {usuario?.oficina?.nombre ? `· ${usuario.oficina.nombre}` : ''}</p>
        </div>
        <button onClick={logout} className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors" title="Cerrar sesión">
          <LogOut size={20} />
        </button>
      </div>
    </header>
  )
}

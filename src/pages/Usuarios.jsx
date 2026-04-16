import { useState, useEffect } from 'react'
import { Plus, UserCheck, UserX, Trash2, AlertTriangle, Eye, EyeOff, RotateCcw, Copy, X as XIcon, Download } from 'lucide-react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import Card from '../components/UI/Card'
import Badge from '../components/UI/Badge'
import Button from '../components/UI/Button'
import Input from '../components/UI/Input'
import Select from '../components/UI/Select'
import Modal from '../components/UI/Modal'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export default function Usuarios() {
  const [usuarios, setUsuarios] = useState([])
  const [oficinas, setOficinas] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalCrear, setModalCrear] = useState(false)
  const [form, setForm] = useState({ nombre: '', email: '', password: '', rol: 'COMERCIAL', oficina_id: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [pwVisible, setPwVisible] = useState({})
  const [resetting, setResetting] = useState({})
  const [copiado, setCopiado] = useState({})
  const [editandoPw, setEditandoPw] = useState({})
  const [pwManual, setPwManual] = useState({})
  const [pwPendiente, setPwPendiente] = useState({})

  useEffect(() => { cargar() }, [])

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token || SUPABASE_KEY
  }

  async function cargar() {
    setLoading(true)
    try {
      const token = await getToken()
      // Fetch with admin token to get all fields including password columns
      const res = await fetch(`${SUPABASE_URL}/rest/v1/usuarios?select=*,oficina:oficinas(nombre)&order=created_at.desc`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${token}` },
      })
      const users = await res.json()

      const { data: ofis } = await supabase.from('oficinas').select('id, nombre').eq('activa', true)
      setUsuarios(Array.isArray(users) ? users : [])
      setOficinas(ofis || [])
    } catch (err) {
      console.error('Error cargando usuarios:', err)
    } finally {
      setLoading(false)
    }
  }

  const requiereOficina = form.rol === 'OFICINA' || form.rol === 'COMERCIAL'

  async function crearUsuario(e) {
    e.preventDefault()
    setError('')
    if (requiereOficina && !form.oficina_id) {
      setError('Debes seleccionar una oficina para el rol ' + form.rol)
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/.netlify/functions/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: form.nombre, email: form.email, password: form.password, rol: form.rol, oficina_id: form.oficina_id || null }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al crear')

      // Save initial password via Netlify Function (has service role key)
      if (data.userId) {
        await fetch('/.netlify/functions/save-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: data.userId, password: form.password }),
        })
      }

      setModalCrear(false)
      setForm({ nombre: '', email: '', password: '', rol: 'COMERCIAL', oficina_id: '' })
      cargar()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function toggleActivo(user) {
    const token = await getToken()
    await fetch(`${SUPABASE_URL}/rest/v1/usuarios?id=eq.${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${token}`, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ activo: !user.activo }),
    })
    cargar()
  }

  async function eliminarUsuario(user) {
    if (!confirm(`¿Eliminar "${user.nombre}" (${user.email})?\nNo se puede deshacer.`)) return
    try {
      const res = await fetch('/.netlify/functions/delete-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      cargar()
    } catch (err) {
      alert('Error: ' + err.message)
    }
  }

  function resetearPassword(user) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
    const pw = Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
    setPwPendiente(p => ({ ...p, [user.id]: pw }))
  }

  async function confirmarGuardar(user) {
    const pw = pwPendiente[user.id]
    if (!pw) return
    setResetting(p => ({ ...p, [user.id]: true }))
    try {
      // Save password in Auth + usuarios table via Netlify Function
      const res = await fetch('/.netlify/functions/save-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, password: pw }),
      })
      const result = await res.json()
      console.log('[save-password] Result:', result)

      if (!res.ok) {
        alert('Error guardando contraseña:\n' + (result.error || 'Error desconocido'))
        return
      }

      setUsuarios(prev => prev.map(u =>
        u.id === user.id ? { ...u, ultima_password_temporal: pw, password_generada_at: new Date().toISOString() } : u
      ))
      setPwPendiente(p => { const n = { ...p }; delete n[user.id]; return n })
    } catch (err) {
      alert('Error: ' + err.message)
    } finally {
      setResetting(p => ({ ...p, [user.id]: false }))
    }
  }

  async function borrarPassword(user) {
    if (!confirm('¿Borrar la contraseña guardada?')) return
    await fetch('/.netlify/functions/save-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: user.id, password: '' }),
    })
    setUsuarios(prev => prev.map(u =>
      u.id === user.id ? { ...u, ultima_password_temporal: null, password_generada_at: null } : u
    ))
  }

  async function cambiarOficina(userId, oficinaId) {
    const token = await getToken()
    await fetch(`${SUPABASE_URL}/rest/v1/usuarios?id=eq.${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${token}`, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ oficina_id: oficinaId || null }),
    })
    cargar()
  }

  function copiarPassword(userId, pw) {
    navigator.clipboard.writeText(pw)
    setCopiado(p => ({ ...p, [userId]: true }))
    setTimeout(() => setCopiado(p => ({ ...p, [userId]: false })), 2000)
  }

  async function guardarPwManual(user) {
    const pw = pwManual[user.id]?.trim()
    if (!pw) return
    try {
      const res = await fetch('/.netlify/functions/save-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, password: pw }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setUsuarios(prev => prev.map(u => u.id === user.id ? { ...u, ultima_password_temporal: pw, password_generada_at: new Date().toISOString() } : u))
      setEditandoPw(p => ({ ...p, [user.id]: false }))
      setPwManual(p => ({ ...p, [user.id]: '' }))
    } catch (err) {
      alert('Error: ' + err.message)
    }
  }

  const ROL_COLORS = { ADMIN: 'blue', OFICINA: 'orange', COMERCIAL: 'gray' }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Usuarios</h2>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => {
            const rows = usuarios.map(u => ({
              Nombre: u.nombre,
              Email: u.email,
              Rol: u.rol,
              Oficina: u.oficina?.nombre || '—',
              Estado: u.activo ? 'Activo' : 'Inactivo',
              Contraseña: u.ultima_password_temporal || '',
            })).sort((a, b) => a.Oficina.localeCompare(b.Oficina))
            const ws = XLSX.utils.json_to_sheet(rows)
            ws['!cols'] = [{ wch: 20 }, { wch: 35 }, { wch: 12 }, { wch: 18 }, { wch: 10 }, { wch: 15 }]
            const wb = XLSX.utils.book_new()
            XLSX.utils.book_append_sheet(wb, ws, 'Usuarios')
            XLSX.writeFile(wb, `usuarios_findy_${new Date().toISOString().slice(0, 10)}.xlsx`)
          }}>
            <Download size={16} /> Exportar Excel
          </Button>
          <Button onClick={() => { setError(''); setModalCrear(true) }}>
            <Plus size={16} /> Nuevo Usuario
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-3 py-3 font-medium text-gray-600">Nombre</th>
                <th className="text-left px-3 py-3 font-medium text-gray-600">Email</th>
                <th className="text-left px-3 py-3 font-medium text-gray-600">Rol</th>
                <th className="text-left px-3 py-3 font-medium text-gray-600">Oficina</th>
                <th className="text-left px-3 py-3 font-medium text-gray-600">Contraseña</th>
                <th className="text-left px-3 py-3 font-medium text-gray-600">Estado</th>
                <th className="text-left px-3 py-3 font-medium text-gray-600">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">Cargando...</td></tr>
              ) : usuarios.map(u => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-3 py-3 font-medium">{u.nombre}</td>
                  <td className="px-3 py-3 text-gray-600 text-xs">{u.email}</td>
                  <td className="px-3 py-3"><Badge color={ROL_COLORS[u.rol]}>{u.rol}</Badge></td>
                  <td className="px-3 py-3">
                    <select value={u.oficina_id || ''} onChange={e => cambiarOficina(u.id, e.target.value)}
                      className="text-xs border border-gray-300 rounded px-2 py-1">
                      <option value="">Sin oficina</option>
                      {oficinas.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-3 min-w-[210px]">
                    {pwPendiente[u.id] ? (
                      <div className="space-y-1">
                        <div className="flex items-center gap-1 bg-yellow-50 border border-yellow-300 rounded px-2 py-1">
                          <span className="font-mono text-xs flex-1 font-bold text-yellow-800">{pwPendiente[u.id]}</span>
                          <button onClick={() => copiarPassword(u.id, pwPendiente[u.id])}
                            className={`p-0.5 rounded transition-colors ${copiado[u.id] ? 'text-green-500' : 'text-gray-400 hover:text-green-600'}`}>
                            <Copy size={12} />
                          </button>
                        </div>
                        {copiado[u.id] && <p className="text-[10px] text-green-500 font-medium">Copiada</p>}
                        <p className="text-[10px] text-yellow-600">No guardada aún</p>
                        <div className="flex gap-1">
                          <button onClick={() => confirmarGuardar(u)} disabled={resetting[u.id]}
                            className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 font-medium disabled:opacity-50">
                            {resetting[u.id] ? '...' : 'Guardar'}
                          </button>
                          <button onClick={() => setPwPendiente(p => { const n = { ...p }; delete n[u.id]; return n })}
                            className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded hover:bg-gray-300">Descartar</button>
                        </div>
                      </div>
                    ) : u.ultima_password_temporal ? (
                      <div className="space-y-1">
                        <div className="flex items-center gap-1 bg-gray-50 border rounded px-2 py-1">
                          <span className="font-mono text-xs flex-1 select-all">
                            {pwVisible[u.id] ? u.ultima_password_temporal : '••••••••••'}
                          </span>
                          <button onClick={() => setPwVisible(p => ({ ...p, [u.id]: !p[u.id] }))}
                            className="p-0.5 rounded hover:bg-gray-200 text-gray-400" title={pwVisible[u.id] ? 'Ocultar' : 'Mostrar'}>
                            {pwVisible[u.id] ? <EyeOff size={12} /> : <Eye size={12} />}
                          </button>
                          <button onClick={() => copiarPassword(u.id, u.ultima_password_temporal)}
                            className={`p-0.5 rounded transition-colors ${copiado[u.id] ? 'text-green-500' : 'text-gray-400 hover:text-green-600'}`} title="Copiar">
                            <Copy size={12} />
                          </button>
                          <button onClick={() => borrarPassword(u)}
                            className="p-0.5 rounded hover:bg-red-100 text-gray-400 hover:text-red-500" title="Borrar">
                            <XIcon size={12} />
                          </button>
                        </div>
                        {copiado[u.id] && <p className="text-[10px] text-green-500 font-medium">Copiada</p>}
                        {!copiado[u.id] && u.password_generada_at && (
                          <p className="text-[10px] text-gray-400">
                            {new Date(u.password_generada_at).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        )}
                      </div>
                    ) : editandoPw[u.id] ? (
                      <div className="flex items-center gap-1">
                        <input type="text" value={pwManual[u.id] || ''} onChange={e => setPwManual(p => ({ ...p, [u.id]: e.target.value }))}
                          placeholder="Contraseña..." className="border rounded px-2 py-1 text-xs font-mono w-28" autoFocus
                          onKeyDown={e => e.key === 'Enter' && guardarPwManual(u)} />
                        <button onClick={() => guardarPwManual(u)} className="text-xs bg-blue-500 text-white px-2 py-1 rounded hover:bg-blue-600">Guardar</button>
                        <button onClick={() => setEditandoPw(p => ({ ...p, [u.id]: false }))} className="text-gray-400 hover:text-gray-600">
                          <XIcon size={12} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-gray-300 italic">Sin contraseña</span>
                        <button onClick={() => setEditandoPw(p => ({ ...p, [u.id]: true }))}
                          className="text-xs text-blue-500 hover:text-blue-700 underline ml-1">+ Guardar</button>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <Badge color={u.activo ? 'green' : 'red'}>{u.activo ? 'Activo' : 'Inactivo'}</Badge>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => resetearPassword(u)} disabled={resetting[u.id]}
                        className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 disabled:opacity-50" title="Resetear contraseña">
                        <RotateCcw size={14} className={resetting[u.id] ? 'animate-spin' : ''} />
                      </button>
                      <Button variant="ghost" className="text-xs" onClick={() => toggleActivo(u)}>
                        {u.activo ? <><UserX size={14} /></> : <><UserCheck size={14} /></>}
                      </Button>
                      <button onClick={() => eliminarUsuario(u)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600" title="Eliminar">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={modalCrear} onClose={() => setModalCrear(false)} title="Nuevo Usuario">
        <form onSubmit={crearUsuario} className="space-y-4">
          {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}
          <Input label="Nombre" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} required />
          <Input label="Email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
          <Input label="Contraseña temporal" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required minLength={6} />
          <Select label="Rol" value={form.rol} onChange={e => setForm(f => ({ ...f, rol: e.target.value, oficina_id: '' }))}
            options={[{ value: 'COMERCIAL', label: 'Comercial' }, { value: 'OFICINA', label: 'Oficina' }, { value: 'ADMIN', label: 'Admin' }]} />
          {requiereOficina && (oficinas.length === 0 ? (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-50 border border-yellow-200">
              <AlertTriangle size={16} className="text-yellow-600 shrink-0 mt-0.5" />
              <p className="text-sm text-yellow-700">No hay oficinas creadas.</p>
            </div>
          ) : (
            <Select label="Oficina *" value={form.oficina_id} onChange={e => setForm(f => ({ ...f, oficina_id: e.target.value }))}
              options={[{ value: '', label: '— Seleccionar —' }, ...oficinas.map(o => ({ value: o.id, label: o.nombre }))]} />
          ))}
          {form.rol === 'ADMIN' && (
            <Select label="Oficina (opcional)" value={form.oficina_id} onChange={e => setForm(f => ({ ...f, oficina_id: e.target.value }))}
              options={[{ value: '', label: 'Sin oficina' }, ...oficinas.map(o => ({ value: o.id, label: o.nombre }))]} />
          )}
          <div className="flex justify-end gap-3">
            <Button variant="secondary" type="button" onClick={() => setModalCrear(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving || (requiereOficina && oficinas.length === 0)}>
              {saving ? 'Creando...' : 'Crear Usuario'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

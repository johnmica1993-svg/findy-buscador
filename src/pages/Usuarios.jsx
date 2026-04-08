import { useState, useEffect } from 'react'
import { Plus, UserCheck, UserX, AlertTriangle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import Card from '../components/UI/Card'
import Badge from '../components/UI/Badge'
import Button from '../components/UI/Button'
import Input from '../components/UI/Input'
import Select from '../components/UI/Select'
import Modal from '../components/UI/Modal'

export default function Usuarios() {
  const [usuarios, setUsuarios] = useState([])
  const [oficinas, setOficinas] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalCrear, setModalCrear] = useState(false)
  const [form, setForm] = useState({ nombre: '', email: '', password: '', rol: 'COMERCIAL', oficina_id: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setLoading(true)
    const [{ data: users }, { data: ofis }] = await Promise.all([
      supabase.from('usuarios').select('*, oficina:oficinas(nombre)').order('created_at', { ascending: false }),
      supabase.from('oficinas').select('id, nombre').eq('activa', true),
    ])
    setUsuarios(users || [])
    setOficinas(ofis || [])
    setLoading(false)
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
        body: JSON.stringify({
          nombre: form.nombre,
          email: form.email,
          password: form.password,
          rol: form.rol,
          oficina_id: form.oficina_id || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al crear el usuario')

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
    await supabase.from('usuarios').update({ activo: !user.activo }).eq('id', user.id)
    cargar()
  }

  async function cambiarOficina(userId, oficinaId) {
    await supabase.from('usuarios').update({ oficina_id: oficinaId || null }).eq('id', userId)
    cargar()
  }

  const ROL_COLORS = { ADMIN: 'blue', OFICINA: 'orange', COMERCIAL: 'gray' }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Usuarios</h2>
        <Button onClick={() => { setError(''); setModalCrear(true) }}>
          <Plus size={16} /> Nuevo Usuario
        </Button>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Nombre</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Rol</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Oficina</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Estado</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">Cargando...</td></tr>
              ) : usuarios.map(u => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{u.nombre}</td>
                  <td className="px-4 py-3 text-gray-600">{u.email}</td>
                  <td className="px-4 py-3"><Badge color={ROL_COLORS[u.rol]}>{u.rol}</Badge></td>
                  <td className="px-4 py-3">
                    <select
                      value={u.oficina_id || ''}
                      onChange={e => cambiarOficina(u.id, e.target.value)}
                      className="text-xs border border-gray-300 rounded px-2 py-1"
                    >
                      <option value="">Sin oficina</option>
                      {oficinas.map(o => (
                        <option key={o.id} value={o.id}>{o.nombre}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <Badge color={u.activo ? 'green' : 'red'}>{u.activo ? 'Activo' : 'Inactivo'}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Button variant="ghost" className="text-xs" onClick={() => toggleActivo(u)}>
                      {u.activo ? <><UserX size={14} /> Desactivar</> : <><UserCheck size={14} /> Activar</>}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal Crear */}
      <Modal open={modalCrear} onClose={() => setModalCrear(false)} title="Nuevo Usuario">
        <form onSubmit={crearUsuario} className="space-y-4">
          {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}

          <Input label="Nombre" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} required />
          <Input label="Email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
          <Input label="Contraseña temporal" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required minLength={6} />
          <Select
            label="Rol"
            value={form.rol}
            onChange={e => setForm(f => ({ ...f, rol: e.target.value, oficina_id: '' }))}
            options={[
              { value: 'COMERCIAL', label: 'Comercial' },
              { value: 'OFICINA', label: 'Oficina' },
              { value: 'ADMIN', label: 'Admin' },
            ]}
          />

          {requiereOficina && (
            <>
              {oficinas.length === 0 ? (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-50 border border-yellow-200">
                  <AlertTriangle size={16} className="text-yellow-600 shrink-0 mt-0.5" />
                  <p className="text-sm text-yellow-700">
                    No hay oficinas creadas. Debes crear una oficina antes de asignar usuarios con rol {form.rol}.
                  </p>
                </div>
              ) : (
                <Select
                  label="Oficina *"
                  value={form.oficina_id}
                  onChange={e => setForm(f => ({ ...f, oficina_id: e.target.value }))}
                  options={[
                    { value: '', label: '— Seleccionar oficina —' },
                    ...oficinas.map(o => ({ value: o.id, label: o.nombre })),
                  ]}
                  error={requiereOficina && !form.oficina_id ? '' : undefined}
                />
              )}
            </>
          )}

          {form.rol === 'ADMIN' && (
            <Select
              label="Oficina (opcional)"
              value={form.oficina_id}
              onChange={e => setForm(f => ({ ...f, oficina_id: e.target.value }))}
              options={[
                { value: '', label: 'Sin oficina' },
                ...oficinas.map(o => ({ value: o.id, label: o.nombre })),
              ]}
            />
          )}

          <div className="flex justify-end gap-3">
            <Button variant="secondary" type="button" onClick={() => setModalCrear(false)}>Cancelar</Button>
            <Button
              type="submit"
              disabled={saving || (requiereOficina && oficinas.length === 0)}
            >
              {saving ? 'Creando...' : 'Crear Usuario'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

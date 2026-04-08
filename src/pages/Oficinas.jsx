import { useState, useEffect } from 'react'
import { Plus, Building2, Wifi, WifiOff, Trash2, Shield } from 'lucide-react'
import { supabase } from '../lib/supabase'
import Card from '../components/UI/Card'
import Badge from '../components/UI/Badge'
import Button from '../components/UI/Button'
import Input from '../components/UI/Input'
import Modal from '../components/UI/Modal'

function generarCodigo() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let code = ''
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

export default function Oficinas() {
  const [oficinas, setOficinas] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalCrear, setModalCrear] = useState(false)
  const [modalIPs, setModalIPs] = useState(null)
  const [form, setForm] = useState({ nombre: '', codigo: '' })
  const [nuevaIp, setNuevaIp] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setLoading(true)
    const { data } = await supabase.from('oficinas').select('*').order('created_at', { ascending: false })
    setOficinas(data || [])
    setLoading(false)
  }

  async function crearOficina(e) {
    e.preventDefault()
    setSaving(true)
    const { error } = await supabase.from('oficinas').insert({
      nombre: form.nombre,
      codigo: form.codigo || generarCodigo(),
    })
    if (error) alert(error.message)
    else {
      setModalCrear(false)
      setForm({ nombre: '', codigo: '' })
      cargar()
    }
    setSaving(false)
  }

  async function toggleActiva(oficina) {
    await supabase.from('oficinas').update({ activa: !oficina.activa }).eq('id', oficina.id)
    cargar()
  }

  async function agregarIP() {
    if (!nuevaIp.trim() || !modalIPs) return
    const ips = [...(modalIPs.ip_permitidas || []), nuevaIp.trim()]
    await supabase.from('oficinas').update({ ip_permitidas: ips }).eq('id', modalIPs.id)
    setModalIPs({ ...modalIPs, ip_permitidas: ips })
    setNuevaIp('')
    cargar()
  }

  async function eliminarIP(ip) {
    if (!modalIPs) return
    const ips = (modalIPs.ip_permitidas || []).filter(i => i !== ip)
    await supabase.from('oficinas').update({ ip_permitidas: ips }).eq('id', modalIPs.id)
    setModalIPs({ ...modalIPs, ip_permitidas: ips })
    cargar()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Oficinas</h2>
        <Button onClick={() => { setForm({ nombre: '', codigo: generarCodigo() }); setModalCrear(true) }}>
          <Plus size={16} /> Nueva Oficina
        </Button>
      </div>

      {loading ? (
        <p className="text-gray-500 text-center py-8">Cargando...</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {oficinas.map(o => (
            <Card key={o.id} className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Building2 size={20} className="text-blue-800" />
                  <h3 className="font-semibold text-gray-900">{o.nombre}</h3>
                </div>
                <Badge color={o.activa ? 'green' : 'red'}>{o.activa ? 'Activa' : 'Inactiva'}</Badge>
              </div>

              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <span className="font-mono bg-gray-100 px-2 py-0.5 rounded text-xs">{o.codigo}</span>
                  <span className="text-xs text-gray-400">Subcódigo</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Shield size={14} />
                  <span>{(o.ip_permitidas || []).length} IPs bloqueadas</span>
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="secondary" className="flex-1 text-xs" onClick={() => toggleActiva(o)}>
                  {o.activa ? <><WifiOff size={14} /> Desactivar</> : <><Wifi size={14} /> Activar</>}
                </Button>
                <Button variant="secondary" className="flex-1 text-xs" onClick={() => { setModalIPs(o); setNuevaIp('') }}>
                  <Shield size={14} /> IPs
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Modal Crear */}
      <Modal open={modalCrear} onClose={() => setModalCrear(false)} title="Nueva Oficina">
        <form onSubmit={crearOficina} className="space-y-4">
          <Input label="Nombre" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} required />
          <Input label="Subcódigo (auto-generado)" value={form.codigo} onChange={e => setForm(f => ({ ...f, codigo: e.target.value }))} />
          <div className="flex justify-end gap-3">
            <Button variant="secondary" type="button" onClick={() => setModalCrear(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Creando...' : 'Crear Oficina'}</Button>
          </div>
        </form>
      </Modal>

      {/* Modal IPs */}
      <Modal open={!!modalIPs} onClose={() => setModalIPs(null)} title={`IPs Bloqueadas — ${modalIPs?.nombre || ''}`}>
        <div className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Ej: 192.168.1.100"
              value={nuevaIp}
              onChange={e => setNuevaIp(e.target.value)}
              className="flex-1"
            />
            <Button onClick={agregarIP} disabled={!nuevaIp.trim()}>Agregar</Button>
          </div>

          {(modalIPs?.ip_permitidas || []).length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">No hay IPs bloqueadas</p>
          ) : (
            <ul className="space-y-2">
              {(modalIPs?.ip_permitidas || []).map(ip => (
                <li key={ip} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                  <span className="font-mono text-sm">{ip}</span>
                  <button onClick={() => eliminarIP(ip)} className="text-red-500 hover:text-red-700">
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>
    </div>
  )
}

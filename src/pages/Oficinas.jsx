import { useState, useEffect } from 'react'
import { Plus, Building2, Wifi, WifiOff, Globe, Pencil } from 'lucide-react'
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
  const [modalIP, setModalIP] = useState(null)
  const [form, setForm] = useState({ nombre: '', codigo: '' })
  const [ipForm, setIpForm] = useState('')
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

  async function guardarIP() {
    if (!modalIP) return
    await supabase.from('oficinas').update({ ip_autorizada: ipForm.trim() || null }).eq('id', modalIP.id)
    setModalIP(null)
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
                  <Globe size={14} />
                  <span>
                    IP autorizada: {o.ip_autorizada
                      ? <span className="font-mono text-xs bg-green-50 text-green-700 px-1.5 py-0.5 rounded">{o.ip_autorizada}</span>
                      : <span className="text-xs text-gray-400">Sin restricción</span>
                    }
                  </span>
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="secondary" className="flex-1 text-xs" onClick={() => toggleActiva(o)}>
                  {o.activa ? <><WifiOff size={14} /> Desactivar</> : <><Wifi size={14} /> Activar</>}
                </Button>
                <Button variant="secondary" className="flex-1 text-xs" onClick={() => { setModalIP(o); setIpForm(o.ip_autorizada || '') }}>
                  <Pencil size={14} /> IP
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

      {/* Modal IP Autorizada */}
      <Modal open={!!modalIP} onClose={() => setModalIP(null)} title={`IP Autorizada — ${modalIP?.nombre || ''}`}>
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Ingresa la IP fija desde la cual los usuarios de esta oficina pueden acceder.
            Si se deja vacío, no se aplica restricción de IP.
          </p>
          <Input
            label="IP autorizada"
            placeholder="Ej: 85.123.45.67"
            value={ipForm}
            onChange={e => setIpForm(e.target.value)}
          />
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setModalIP(null)}>Cancelar</Button>
            <Button onClick={guardarIP}>Guardar</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

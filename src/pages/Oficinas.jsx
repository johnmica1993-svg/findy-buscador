import { useState, useEffect } from 'react'
import { Plus, Building2, Wifi, WifiOff, Globe, Pencil, Lock, Unlock } from 'lucide-react'
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
  const [ipsInput, setIpsInput] = useState('')
  const [ipActual, setIpActual] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    cargar()
    fetch('https://api.ipify.org?format=json').then(r => r.json()).then(d => setIpActual(d.ip)).catch(() => {})
  }, [])

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

  function abrirModalIP(oficina) {
    // Combine old ip_autorizada + new ips_autorizadas
    const ips = [
      ...(oficina.ips_autorizadas || []),
      ...(oficina.ip_autorizada && !oficina.ips_autorizadas?.includes(oficina.ip_autorizada) ? [oficina.ip_autorizada] : []),
    ].filter(Boolean)
    setIpsInput(ips.join('\n'))
    setModalIP(oficina)
  }

  async function guardarIPs() {
    if (!modalIP) return
    setSaving(true)

    const ips = ipsInput
      .split(/[\n,]/)
      .map(ip => ip.trim())
      .filter(ip => ip.length > 0)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/oficinas?id=eq.${modalIP.id}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${token || import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({
            ips_autorizadas: ips.length > 0 ? ips : null,
            ip_autorizada: ips[0] || null,
          }),
        }
      )

      if (!res.ok) {
        const err = await res.text()
        console.error('Error guardando IPs:', err)
        alert('Error al guardar: ' + err)
      } else {
        setOficinas(prev => prev.map(o =>
          o.id === modalIP.id ? { ...o, ips_autorizadas: ips.length > 0 ? ips : null, ip_autorizada: ips[0] || null } : o
        ))
        setModalIP(null)
      }
    } catch (err) {
      alert('Error: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  function contarIPs(o) {
    const set = new Set([...(o.ips_autorizadas || []), ...(o.ip_autorizada ? [o.ip_autorizada] : [])])
    return set.size
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
          {oficinas.map(o => {
            const numIPs = contarIPs(o)
            return (
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
                  <div className="flex items-center gap-2 text-xs">
                    {numIPs > 0 ? (
                      <>
                        <Lock size={12} className="text-green-600" />
                        <span className="text-green-600 font-medium">{numIPs} IP(s) autorizada(s)</span>
                      </>
                    ) : (
                      <>
                        <Unlock size={12} className="text-gray-400" />
                        <span className="text-gray-400">Sin restricción de IP</span>
                      </>
                    )}
                  </div>
                  {numIPs > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {[...new Set([...(o.ips_autorizadas || []), ...(o.ip_autorizada ? [o.ip_autorizada] : [])])].map(ip => (
                        <span key={ip} className="font-mono text-[10px] bg-green-50 text-green-700 px-1.5 py-0.5 rounded">{ip}</span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button variant="secondary" className="flex-1 text-xs" onClick={() => toggleActiva(o)}>
                    {o.activa ? <><WifiOff size={14} /> Desactivar</> : <><Wifi size={14} /> Activar</>}
                  </Button>
                  <Button variant="secondary" className="flex-1 text-xs" onClick={() => abrirModalIP(o)}>
                    <Pencil size={14} /> IPs
                  </Button>
                </div>
              </Card>
            )
          })}
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

      {/* Modal IPs Autorizadas */}
      <Modal open={!!modalIP} onClose={() => setModalIP(null)} title={`IPs Autorizadas — ${modalIP?.nombre || ''}`}>
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Ingresa las IPs autorizadas (una por línea o separadas por coma).
            Si se deja vacío, no se aplica restricción.
          </p>
          <textarea
            value={ipsInput}
            onChange={e => setIpsInput(e.target.value)}
            placeholder={"192.168.1.1\n203.0.113.5"}
            rows={4}
            className="w-full border border-gray-300 rounded-lg p-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {ipActual && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Tu IP actual: <span className="font-mono text-gray-600">{ipActual}</span></span>
              <button
                onClick={() => setIpsInput(prev => prev ? prev + '\n' + ipActual : ipActual)}
                className="text-xs text-blue-600 hover:text-blue-800 underline"
              >
                + Agregar mi IP
              </button>
            </div>
          )}
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setModalIP(null)}>Cancelar</Button>
            <Button onClick={guardarIPs} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

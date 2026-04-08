import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import Button from '../UI/Button'
import Input from '../UI/Input'
import Select from '../UI/Select'

const CAMPANAS = [
  { value: '', label: 'Seleccionar campaña' },
  { value: 'ENDESA', label: 'Endesa' },
  { value: 'FACTOR_ENERGIA', label: 'Factor Energía' },
  { value: 'NATURGY_RADEN', label: 'Naturgy Raden' },
  { value: 'OTRO', label: 'Otro' },
]

const ESTADOS = [
  { value: 'PENDIENTE', label: 'Pendiente' },
  { value: 'ACTIVO', label: 'Activo' },
  { value: 'BAJA', label: 'Baja' },
  { value: 'CANCELADO', label: 'Cancelado' },
]

export default function ClienteForm({ cliente, onSave, onCancel }) {
  const { usuario } = useAuth()
  const [form, setForm] = useState({
    cups: '',
    dni: '',
    nombre: '',
    direccion: '',
    campana: '',
    fecha_alta: '',
    fecha_activacion: '',
    fecha_ultimo_cambio: '',
    fecha_baja: '',
    estado: 'PENDIENTE',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (cliente) {
      setForm({
        cups: cliente.cups || '',
        dni: cliente.dni || '',
        nombre: cliente.nombre || '',
        direccion: cliente.direccion || '',
        campana: cliente.campana || '',
        fecha_alta: cliente.fecha_alta || '',
        fecha_activacion: cliente.fecha_activacion || '',
        fecha_ultimo_cambio: cliente.fecha_ultimo_cambio || '',
        fecha_baja: cliente.fecha_baja || '',
        estado: cliente.estado || 'PENDIENTE',
      })
    }
  }, [cliente])

  function handleChange(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!form.cups) {
      setError('El CUPS es obligatorio')
      return
    }

    setSaving(true)
    try {
      const payload = {
        ...form,
        fecha_baja: form.fecha_baja || null,
        fecha_activacion: form.fecha_activacion || null,
        fecha_ultimo_cambio: form.fecha_ultimo_cambio || null,
        oficina_id: usuario?.oficina_id || null,
      }

      if (cliente) {
        const { error: err } = await supabase
          .from('clientes')
          .update(payload)
          .eq('id', cliente.id)
        if (err) throw err
      } else {
        payload.created_by = usuario?.id
        const { error: err } = await supabase
          .from('clientes')
          .insert(payload)
        if (err) throw err
      }

      onSave?.()
    } catch (err) {
      setError(err.message?.includes('duplicate') ? 'Ya existe un cliente con ese CUPS' : err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input label="CUPS *" value={form.cups} onChange={e => handleChange('cups', e.target.value)} required />
        <Input label="DNI / NIF" value={form.dni} onChange={e => handleChange('dni', e.target.value)} />
        <Input label="Nombre" value={form.nombre} onChange={e => handleChange('nombre', e.target.value)} className="sm:col-span-2" />
        <Input label="Dirección" value={form.direccion} onChange={e => handleChange('direccion', e.target.value)} className="sm:col-span-2" />
        <Select label="Campaña" options={CAMPANAS} value={form.campana} onChange={e => handleChange('campana', e.target.value)} />
        <Select label="Estado" options={ESTADOS} value={form.estado} onChange={e => handleChange('estado', e.target.value)} />
        <Input label="Fecha Alta" type="date" value={form.fecha_alta} onChange={e => handleChange('fecha_alta', e.target.value)} />
        <Input label="Fecha Activación" type="date" value={form.fecha_activacion} onChange={e => handleChange('fecha_activacion', e.target.value)} />
        <Input label="Fecha Último Cambio" type="date" value={form.fecha_ultimo_cambio} onChange={e => handleChange('fecha_ultimo_cambio', e.target.value)} />
        <Input label="Fecha Baja" type="date" value={form.fecha_baja} onChange={e => handleChange('fecha_baja', e.target.value)} />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        {onCancel && <Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button>}
        <Button type="submit" disabled={saving}>
          {saving ? 'Guardando...' : cliente ? 'Actualizar' : 'Crear Cliente'}
        </Button>
      </div>
    </form>
  )
}

import { useState, useEffect } from 'react'
import { Plus, Eye, Pencil, Trash2, ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { calcularTramitabilidad } from '../lib/tramitabilidad'
import { useAuth } from '../context/AuthContext'
import Card from '../components/UI/Card'
import Badge from '../components/UI/Badge'
import Button from '../components/UI/Button'
import Select from '../components/UI/Select'
import Modal from '../components/UI/Modal'
import ClienteForm from '../components/Clientes/ClienteForm'
import FichaTramitabilidad from '../components/Clientes/FichaTramitabilidad'

const POR_PAGINA = 20

const CAMPANA_LABELS = {
  ENDESA: 'Endesa',
  FACTOR_ENERGIA: 'Factor Energía',
  NATURGY_RADEN: 'Naturgy Raden',
  OTRO: 'Otro',
}

export default function Clientes() {
  const { esComercial } = useAuth()
  const [clientes, setClientes] = useState([])
  const [total, setTotal] = useState(0)
  const [pagina, setPagina] = useState(0)
  const [loading, setLoading] = useState(true)
  const [filtros, setFiltros] = useState({ campana: '', estado: '', tramitabilidad: '' })
  const [modalCrear, setModalCrear] = useState(false)
  const [modalEditar, setModalEditar] = useState(null)
  const [modalVer, setModalVer] = useState(null)

  useEffect(() => {
    cargarClientes()
  }, [pagina, filtros])

  async function cargarClientes() {
    setLoading(true)
    try {
      let query = supabase
        .from('clientes')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA - 1)

      if (filtros.campana) query = query.eq('campana', filtros.campana)
      if (filtros.estado) query = query.eq('estado', filtros.estado)

      const { data, count, error } = await query
      if (error) throw error

      let filtered = data || []
      if (filtros.tramitabilidad) {
        filtered = filtered.filter(c => {
          const t = calcularTramitabilidad(c)
          if (filtros.tramitabilidad === 'TRAMITABLE') return t.tramitable === true
          if (filtros.tramitabilidad === 'NO_TRAMITABLE') return t.tramitable === false
          return t.tramitable === null
        })
      }

      setClientes(filtered)
      setTotal(count || 0)
    } catch (err) {
      console.error('Error cargando clientes:', err)
    } finally {
      setLoading(false)
    }
  }

  async function eliminarCliente(id) {
    if (!confirm('¿Eliminar este cliente?')) return
    const { error } = await supabase.from('clientes').delete().eq('id', id)
    if (!error) cargarClientes()
  }

  const totalPaginas = Math.ceil(total / POR_PAGINA)

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Clientes</h2>
        {!esComercial && (
          <Button onClick={() => setModalCrear(true)}>
            <Plus size={16} /> Nuevo Cliente
          </Button>
        )}
      </div>

      {/* Filtros */}
      <Card className="p-4 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Select
            label="Campaña"
            value={filtros.campana}
            onChange={e => { setFiltros(f => ({ ...f, campana: e.target.value })); setPagina(0) }}
            options={[
              { value: '', label: 'Todas' },
              { value: 'ENDESA', label: 'Endesa' },
              { value: 'FACTOR_ENERGIA', label: 'Factor Energía' },
              { value: 'NATURGY_RADEN', label: 'Naturgy Raden' },
              { value: 'OTRO', label: 'Otro' },
            ]}
          />
          <Select
            label="Estado"
            value={filtros.estado}
            onChange={e => { setFiltros(f => ({ ...f, estado: e.target.value })); setPagina(0) }}
            options={[
              { value: '', label: 'Todos' },
              { value: 'ACTIVO', label: 'Activo' },
              { value: 'BAJA', label: 'Baja' },
              { value: 'PENDIENTE', label: 'Pendiente' },
              { value: 'CANCELADO', label: 'Cancelado' },
            ]}
          />
          <Select
            label="Tramitabilidad"
            value={filtros.tramitabilidad}
            onChange={e => { setFiltros(f => ({ ...f, tramitabilidad: e.target.value })); setPagina(0) }}
            options={[
              { value: '', label: 'Todas' },
              { value: 'TRAMITABLE', label: 'Tramitable' },
              { value: 'NO_TRAMITABLE', label: 'No Tramitable' },
              { value: 'SIN_DATOS', label: 'Sin datos' },
            ]}
          />
        </div>
      </Card>

      {/* Tabla */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-medium text-gray-600">CUPS</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">DNI</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Nombre</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Campaña</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">F. Activación</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Días</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Tramitabilidad</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">Cargando...</td></tr>
              ) : clientes.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">No hay clientes</td></tr>
              ) : clientes.map(c => {
                const tram = calcularTramitabilidad(c)
                return (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs">{c.cups}</td>
                    <td className="px-4 py-3">{c.dni || '—'}</td>
                    <td className="px-4 py-3 font-medium">{c.nombre || '—'}</td>
                    <td className="px-4 py-3">{CAMPANA_LABELS[c.campana] || c.campana}</td>
                    <td className="px-4 py-3">{c.fecha_activacion ? new Date(c.fecha_activacion).toLocaleDateString('es-ES') : '—'}</td>
                    <td className="px-4 py-3">{tram.diasActivo ?? '—'}</td>
                    <td className="px-4 py-3">
                      <Badge color={tram.color}>{tram.icono} {tram.estado.replace('_', ' ')}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => setModalVer(c)} className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600"><Eye size={16} /></button>
                        {!esComercial && (
                          <>
                            <button onClick={() => setModalEditar(c)} className="p-1.5 rounded-lg hover:bg-yellow-50 text-gray-400 hover:text-yellow-600"><Pencil size={16} /></button>
                            <button onClick={() => eliminarCliente(c.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600"><Trash2 size={16} /></button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        {totalPaginas > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
            <span className="text-sm text-gray-600">
              Mostrando {pagina * POR_PAGINA + 1}–{Math.min((pagina + 1) * POR_PAGINA, total)} de {total}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPagina(p => Math.max(0, p - 1))}
                disabled={pagina === 0}
                className="p-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-30"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="text-sm text-gray-600">Página {pagina + 1} de {totalPaginas}</span>
              <button
                onClick={() => setPagina(p => Math.min(totalPaginas - 1, p + 1))}
                disabled={pagina >= totalPaginas - 1}
                className="p-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-30"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* Modales */}
      <Modal open={modalCrear} onClose={() => setModalCrear(false)} title="Nuevo Cliente" size="lg">
        <ClienteForm onSave={() => { setModalCrear(false); cargarClientes() }} onCancel={() => setModalCrear(false)} />
      </Modal>

      <Modal open={!!modalEditar} onClose={() => setModalEditar(null)} title="Editar Cliente" size="lg">
        {modalEditar && <ClienteForm cliente={modalEditar} onSave={() => { setModalEditar(null); cargarClientes() }} onCancel={() => setModalEditar(null)} />}
      </Modal>

      <Modal open={!!modalVer} onClose={() => setModalVer(null)} title="Detalle del Cliente" size="lg">
        {modalVer && <FichaTramitabilidad cliente={modalVer} />}
      </Modal>
    </div>
  )
}

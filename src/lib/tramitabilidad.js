import { differenceInDays, addDays, format } from 'date-fns'
import { es } from 'date-fns/locale'

const REGLAS_CAMPANA = {
  ENDESA: { diasMinimos: 60, nombre: 'Endesa' },
  FACTOR_ENERGIA: { diasMinimos: 30, nombre: 'Factor Energía' },
  NATURGY_RADEN: { diasMinimos: 30, nombre: 'Naturgy Raden' },
  OTRO: { diasMinimos: 0, nombre: 'Otro' },
}

export function calcularTramitabilidad(cliente) {
  const { campana, fecha_activacion } = cliente

  if (!fecha_activacion) {
    return {
      tramitable: null,
      estado: 'SIN_DATOS',
      color: 'yellow',
      icono: '⚠️',
      mensaje: 'SIN DATOS DE ACTIVACIÓN — Verificar manualmente',
      diasActivo: null,
      fechaTramitable: null,
    }
  }

  const regla = REGLAS_CAMPANA[campana] || REGLAS_CAMPANA.OTRO
  const hoy = new Date()
  const fechaAct = new Date(fecha_activacion)
  const diasActivo = differenceInDays(hoy, fechaAct)
  const fechaTramitable = addDays(fechaAct, regla.diasMinimos)

  if (regla.diasMinimos > 0 && diasActivo < regla.diasMinimos) {
    const diasRestantes = regla.diasMinimos - diasActivo
    return {
      tramitable: false,
      estado: 'NO_TRAMITABLE',
      color: 'red',
      icono: '❌',
      mensaje: `CLIENTE NO TRAMITABLE — Lleva solo ${diasActivo} días activo en ${regla.nombre}. Se requieren mínimo ${regla.diasMinimos} días. Podrá tramitarse a partir del ${format(fechaTramitable, "dd/MM/yyyy")}.`,
      diasActivo,
      diasRestantes,
      fechaTramitable: format(fechaTramitable, 'yyyy-MM-dd'),
    }
  }

  return {
    tramitable: true,
    estado: 'TRAMITABLE',
    color: 'green',
    icono: '✅',
    mensaje: `TRAMITABLE — ${diasActivo} días activo en ${regla.nombre}`,
    diasActivo,
    diasRestantes: 0,
    fechaTramitable: format(fechaTramitable, 'yyyy-MM-dd'),
  }
}

export function esTramitableProximamente(cliente, diasVentana = 7) {
  const result = calcularTramitabilidad(cliente)
  return result.tramitable === false && result.diasRestantes <= diasVentana
}

export { REGLAS_CAMPANA }

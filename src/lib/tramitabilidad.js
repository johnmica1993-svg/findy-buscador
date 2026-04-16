/**
 * Tramitabilidad DESACTIVADA temporalmente.
 * Todos los clientes son TRAMITABLE hasta que se conecte UFO CRM.
 * La lógica real usará el campo estado_contratable de la tabla clientes.
 */

export function calcularTramitabilidad(cliente) {
  // Si estado_contratable es false → bloqueado por UFO CRM
  if (cliente.estado_contratable === false) {
    return {
      tramitable: false,
      estado: 'NO_DISPONIBLE',
      color: 'red',
      icono: '🚫',
      mensaje: cliente.motivo_bloqueo || 'Cliente no disponible temporalmente.',
      diasActivo: null,
      fechaTramitable: null,
    }
  }

  // Todos los demás → TRAMITABLE
  return {
    tramitable: true,
    estado: 'TRAMITABLE',
    color: 'green',
    icono: '✅',
    mensaje: 'TRAMITABLE',
    diasActivo: null,
    diasRestantes: 0,
    fechaTramitable: null,
  }
}

export function esTramitableProximamente() {
  return false
}

export const REGLAS_CAMPANA = {}

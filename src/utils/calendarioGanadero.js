export const TIPOS_ACTIVIDAD = Object.freeze([
  { id: 'vacunacion', nombre: 'Vacunación' },
  { id: 'desparasitacion', nombre: 'Desparasitación' },
  { id: 'control_sanitario', nombre: 'Control sanitario' },
  { id: 'movimiento', nombre: 'Movimiento previsto' },
  { id: 'reproduccion', nombre: 'Reproducción' },
  { id: 'inventario', nombre: 'Inventario' },
  { id: 'inspeccion', nombre: 'Inspección' },
  { id: 'otra', nombre: 'Otra actividad' },
])

export const ESTADOS_ACTIVIDAD = Object.freeze([
  { id: 'programada', nombre: 'Programada' },
  { id: 'realizada', nombre: 'Realizada' },
  { id: 'cancelada', nombre: 'Cancelada' },
])

export const PRIO_ACTIVIDAD = Object.freeze([
  { id: 'normal', nombre: 'Normal' },
  { id: 'alta', nombre: 'Alta' },
])

export function fechaBolivia() {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date())
  const m = Object.fromEntries(partes.map(({ type, value }) => [type, value]))
  return `${m.year}-${m.month}-${m.day}`
}

export function sumarMeses(mes, delta) {
  const [ano, numero] = mes.split('-').map(Number)
  return new Date(Date.UTC(ano, numero - 1 + delta, 1)).toISOString().slice(0, 7)
}

export function diasCalendario(mes) {
  const [ano, numero] = mes.split('-').map(Number)
  const primerDia = new Date(Date.UTC(ano, numero - 1, 1))
  const desplazamiento = (primerDia.getUTCDay() + 6) % 7 // lunes primero
  const ultimo = new Date(Date.UTC(ano, numero, 0)).getUTCDate()
  return [
    ...Array(desplazamiento).fill(null),
    ...Array.from({ length: ultimo }, (_, i) => `${mes}-${String(i + 1).padStart(2, '0')}`)
  ]
}

export function fechaCorta(valor) {
  if (!valor || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return '—'
  const [ano, mes, dia] = valor.split('-').map(Number)
  return new Intl.DateTimeFormat('es-BO', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'
  }).format(new Date(Date.UTC(ano, mes - 1, dia)))
}

export function etiqueta(opciones, id) {
  return opciones.find((op) => op.id === id)?.nombre ?? id
}

export function venceAntes(actividad, fecha = fechaBolivia()) {
  return actividad.estado === 'programada' && actividad.fecha < fecha
}

export function resumirActividades(registros, fecha = fechaBolivia()) {
  const limite = new Date(`${fecha}T00:00:00Z`)
  limite.setUTCDate(limite.getUTCDate() + 7)
  const proximaSemana = limite.toISOString().slice(0, 10)
  return {
    programadas: registros.filter((r) => r.estado === 'programada').length,
    proximas: registros.filter((r) => r.estado === 'programada' && r.fecha >= fecha && r.fecha < proximaSemana).length,
    realizadas: registros.filter((r) => r.estado === 'realizada').length,
    vencidas: registros.filter((r) => venceAntes(r, fecha)).length,
  }
}

export function validarActividad(a) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.fecha || '')) return 'Seleccione una fecha válida.'
  if (String(a.titulo || '').trim().length < 5 || String(a.titulo || '').length > 120) return 'El título debe tener de 5 a 120 caracteres.'
  if (!TIPOS_ACTIVIDAD.some((t) => t.id === a.tipo)) return 'Seleccione un tipo de actividad.'
  if (!Number.isInteger(Number(a.unidad_id)) || Number(a.unidad_id) < 1) return 'Seleccione la unidad ganadera.'
  if (!ESTADOS_ACTIVIDAD.some((e) => e.id === a.estado)) return 'Estado de actividad inválido.'
  if (!PRIO_ACTIVIDAD.some((p) => p.id === a.prioridad)) return 'Prioridad inválida.'
  if ((a.descripcion || '').length > 2000) return 'La descripción no debe superar 2000 caracteres.'
  if (a.hora && !/^([01]\d|2[0-3]):[0-5]\d$/.test(a.hora)) return 'La hora debe tener formato HH:MM.'
  if ((a.codigo_semoviente || '').length > 80) return 'El código de referencia es demasiado largo.'
  return ''
}

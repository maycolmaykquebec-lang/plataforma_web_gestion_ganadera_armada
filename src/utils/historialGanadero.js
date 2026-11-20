export const ESPECIES_HISTORIAL = Object.freeze({
  bovino: 'Ganado vacuno', equino: 'Ganado equino', caprino: 'Ganado caprino',
  mular: 'Ganado mular', avicola: 'Ganado avícola', porcino: 'Ganado porcino',
})

export function edadSemoviente(fechaNacimiento, fechaReferencia) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaNacimiento || '') || !/^\d{4}-\d{2}-\d{2}$/.test(fechaReferencia || '')) return null
  const [a, m, d] = fechaNacimiento.split('-').map(Number)
  const [ra, rm, rd] = fechaReferencia.split('-').map(Number)
  const nacimiento = new Date(Date.UTC(a, m - 1, d))
  if (nacimiento.getUTCFullYear() !== a || nacimiento.getUTCMonth() !== m - 1 || nacimiento.getUTCDate() !== d) return null
  if (fechaNacimiento > fechaReferencia) return null
  let anios = ra - a
  let meses = rm - m
  if (rd < d) meses--
  if (meses < 0) { anios--; meses += 12 }
  return { anios, meses }
}

export function fechaActualBolivia() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day}`
}

export function edadLegible(fechaNacimiento, hoy = fechaActualBolivia()) {
  const edad = edadSemoviente(fechaNacimiento, hoy)
  if (!edad) return 'Edad no determinada'
  return `${edad.anios} ${edad.anios === 1 ? 'año' : 'años'} y ${edad.meses} ${edad.meses === 1 ? 'mes' : 'meses'}`
}

export function fechaHistorial(valor, hora = false) {
  if (!valor) return 'No registrado'
  if (!hora && /^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    const [a, m, d] = valor.split('-')
    return `${d}/${m}/${a}`
  }
  const fecha = new Date(valor)
  if (Number.isNaN(fecha.getTime())) return 'No registrado'
  return new Intl.DateTimeFormat('es-BO', {
    timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit',
    ...(hora ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(fecha)
}

export const TIPOS_HISTORIAL = Object.freeze({
  registro: ['Registro', 'hix-registro', '▣'],
  sanitario: ['Control sanitario', 'hix-sanitario', '✚'],
  reproductivo: ['Control reproductivo', 'hix-reproductivo', '♥'],
  movimiento: ['Movimiento', 'hix-movimiento', '⇄'],
  alta: ['Alta', 'hix-alta', '+'],
  baja: ['Baja', 'hix-baja', '−'],
  descarte: ['Evaluación por descarte', 'hix-descarte', '◇'],
  observacion: ['Observación', 'hix-observacion', '✎'],
})

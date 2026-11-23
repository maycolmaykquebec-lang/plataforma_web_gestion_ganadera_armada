/**
 * V4.4 · Umbrales internos para consulta por edad, NO un dictamen veterinario.
 * Bovinos: criterio institucional indicado por el proyecto.
 * Otras especies: valores preliminares para alerta; validar con responsable técnico.
 */
export const CRITERIOS_DESCARTE = Object.freeze([
  { especie: 'bovino', nombre: 'Ganado vacuno', sexo: 'Macho', edad: 4, origen: 'Criterio del proyecto' },
  { especie: 'bovino', nombre: 'Ganado vacuno', sexo: 'Hembra', edad: 6, origen: 'Criterio del proyecto' },
  { especie: 'equino', nombre: 'Ganado equino', sexo: 'Macho', edad: 10, origen: 'Umbral preventivo propuesto' },
  { especie: 'equino', nombre: 'Ganado equino', sexo: 'Hembra', edad: 10, origen: 'Umbral preventivo propuesto' },
  { especie: 'caprino', nombre: 'Ganado caprino', sexo: 'Macho', edad: 5, origen: 'Referencia productiva preliminar' },
  { especie: 'caprino', nombre: 'Ganado caprino', sexo: 'Hembra', edad: 5, origen: 'Referencia productiva preliminar' },
  { especie: 'porcino', nombre: 'Ganado porcino', sexo: 'Macho', edad: 5, origen: 'Referencia reproductiva preliminar' },
  { especie: 'porcino', nombre: 'Ganado porcino', sexo: 'Hembra', edad: 4, origen: 'Referencia reproductiva preliminar' },
  { especie: 'mular', nombre: 'Ganado mular', sexo: 'Macho', edad: 10, origen: 'Umbral preventivo propuesto' },
  { especie: 'mular', nombre: 'Ganado mular', sexo: 'Hembra', edad: 10, origen: 'Umbral preventivo propuesto' },
])

export const ESPECIES_DESCARTE = Object.freeze([
  { id: 'bovino', nombre: 'Ganado vacuno' },
  { id: 'equino', nombre: 'Ganado equino' },
  { id: 'caprino', nombre: 'Ganado caprino' },
  { id: 'porcino', nombre: 'Ganado porcino' },
  { id: 'mular', nombre: 'Ganado mular' },
])
export const ESPECIES_ELEGIBLES = Object.freeze(ESPECIES_DESCARTE.map(e => e.id))

export function hoyEnBolivia(fecha = new Date()) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(fecha)
  const dato = tipo => partes.find(p => p.type === tipo)?.value
  return `${dato('year')}-${dato('month')}-${dato('day')}`
}

export function fechaISOValida(valor) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(valor ?? ''))) return false
  const [a, m, d] = valor.split('-').map(Number)
  const fecha = new Date(Date.UTC(a, m - 1, d))
  return fecha.getUTCFullYear() === a && fecha.getUTCMonth() === m - 1 && fecha.getUTCDate() === d
}

export function fechaCorteEdad(fechaHoyISO, anosCumplidos) {
  if (!fechaISOValida(fechaHoyISO) || !Number.isInteger(anosCumplidos) || anosCumplidos < 0) {
    throw new Error('Fecha de consulta o edad mínima inválida.')
  }
  const [a, m, d] = fechaHoyISO.split('-').map(Number)
  // Mantener mes/día, para no contar el año actual antes de su cumpleaños.
  return `${String(a - anosCumplidos).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function edadExacta(fechaNacimiento, fechaHoyISO) {
  if (!fechaISOValida(fechaNacimiento) || !fechaISOValida(fechaHoyISO) || fechaNacimiento > fechaHoyISO) return null
  const [a, m, d] = fechaNacimiento.split('-').map(Number)
  const [ah, mh, dh] = fechaHoyISO.split('-').map(Number)
  let anos = ah - a
  if (mh < m || (mh === m && dh < d)) anos--
  let meses = (ah - a) * 12 + (mh - m)
  if (dh < d) meses--
  return { anos, meses: Math.max(0, meses - anos * 12) }
}

export function criterioPara(especie, sexo) {
  return CRITERIOS_DESCARTE.find(c => c.especie === especie && c.sexo === sexo) || null
}

export function clasificarPorEdad(animal, fechaHoyISO) {
  if (animal?.estado !== 'Activo') return { estado: 'excluido' }
  const criterio = criterioPara(animal?.especie, animal?.sexo)
  if (!criterio) return { estado: 'excluido' }
  const edad = edadExacta(animal?.fecha_nacimiento, fechaHoyISO)
  if (!edad) return { estado: 'sin_fecha', criterio }
  return { estado: edad.anos >= criterio.edad ? 'elegible' : 'no_elegible', criterio, edad }
}

// Solo se admiten letras, números y guiones para generar filtros PostgREST sin inyección.
export function limpiarCodigoBusqueda(valor) {
  return String(valor ?? '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 64)
}

/** Genera una sola expresión OR para PostgREST: reglas por especie/sexo/corte de fecha. */
export function filtroServidorPorEdad({ hoy, especie = 'todas', sexo = 'todos', codigo = '' }) {
  const termino = limpiarCodigoBusqueda(codigo)
  const reglas = CRITERIOS_DESCARTE.filter(c =>
    (especie === 'todas' || especie === c.especie) &&
    (sexo === 'todos' || sexo === c.sexo)
  )
  if (!reglas.length) throw new Error('No existe criterio para estos filtros.')
  return reglas.map(c => {
    const reglasInternas = [
      `especie.eq.${c.especie}`,
      `sexo.eq.${c.sexo}`,
      `fecha_nacimiento.lte.${fechaCorteEdad(hoy, c.edad)}`,
    ]
    if (termino) reglasInternas.push(`or(codigo.ilike.*${termino}*,codigo_activo.ilike.*${termino}*)`)
    return `and(${reglasInternas.join(',')})`
  }).join(',')
}

export function formatoFechaCorta(valor) {
  if (!fechaISOValida(valor)) return '—'
  const [a, m, d] = valor.split('-')
  return `${d}/${m}/${a}`
}

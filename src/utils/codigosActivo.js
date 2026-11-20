// Prefijos institucionales suministrados para las tres unidades operativas.
export const PREFIJOS_ACTIVO = Object.freeze({
  'RIO-BLANCO': 'UOSPGRB-86-WI-',
  TAMARINERO: 'UOSPGT-86-WI-',
  MAMORE: 'UOSPGM-86-WI-',
})

export function proponerCodigoActivo(codigoUnidad, codigoIndividual) {
  const prefijo = PREFIJOS_ACTIVO[codigoUnidad]
  const individual = String(codigoIndividual ?? '').trim().toUpperCase()
  if (!prefijo || !/^[A-Z0-9-]{3,50}$/.test(individual)) return ''
  return `${prefijo}${individual}`
}

export function validarCodigoActivo(codigoUnidad, codigoActivo) {
  const prefijo = PREFIJOS_ACTIVO[codigoUnidad]
  const valor = String(codigoActivo ?? '').trim().toUpperCase()
  if (!prefijo || !valor.startsWith(prefijo)) return false
  return /^[A-Z0-9-]{3,50}$/.test(valor.slice(prefijo.length))
}

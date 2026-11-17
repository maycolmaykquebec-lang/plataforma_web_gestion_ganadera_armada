export const ROLES = Object.freeze({
  SUP_DEPTO_VII: 'Supervisor Departamento VII',
  JEFE_DIV_B: 'Jefe División B',
  RESP_UNIDAD: 'Responsable de unidad',
})
export const UNIDADES = Object.freeze(['RIO-BLANCO', 'TAMARINERO', 'MAMORE'])
export function perfilValido(perfil) {
  return Boolean(perfil?.activo === true && Object.hasOwn(ROLES, perfil?.rol?.codigo ?? '') &&
    (perfil.rol.codigo !== 'RESP_UNIDAD' || (perfil.unidad?.id && UNIDADES.includes(perfil.unidad.codigo))))
}
export function puedeRegistrar(perfil) {
  return perfilValido(perfil) && perfil.rol.codigo === 'RESP_UNIDAD'
}
export function consultaGeneral(perfil) {
  return perfilValido(perfil) && perfil.rol.codigo !== 'RESP_UNIDAD'
}
const comunes = ['inicio', 'semovientes', 'historial', 'sanidad', 'reproduccion', 'movimientos', 'altas', 'inventario', 'descarte', 'reportes', 'respaldos']
export function menuPermitido(perfil) {
  if (!perfilValido(perfil)) return []
  const rol = perfil.rol.codigo
  return [...comunes, ...(rol === 'SUP_DEPTO_VII' ? ['usuarios', 'auditoria'] : rol === 'JEFE_DIV_B' ? ['auditoria'] : [])]
}

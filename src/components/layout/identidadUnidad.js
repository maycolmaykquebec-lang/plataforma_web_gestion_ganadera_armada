import armada from '../../assets/logos/armada-boliviana.png'
import departamento from '../../assets/logos/departamento-vii.jpeg'
import rioBlanco from '../../assets/logos/rio-blanco.png'
import mamore from '../../assets/logos/mamore.png'
import tamarinero from '../../assets/logos/tamarinero.png'

const unidades = {
  'RIO-BLANCO': { nombre: 'RÍO BLANCO', sigla: 'UOSPG.', logo: rioBlanco },
  MAMORE: { nombre: 'MAMORÉ', sigla: 'UOSPGP.', logo: mamore },
  TAMARINERO: { nombre: 'TAMARINERO', sigla: 'UOSPG.', logo: tamarinero },
}
export function identidadUnidad(perfil) {
  const unidad = unidades[perfil?.unidad?.codigo]
  if (unidad && perfil?.rol?.codigo === 'RESP_UNIDAD') return unidad
  if (perfil?.rol?.codigo === 'SUP_DEPTO_VII') return { nombre: 'DEPARTAMENTO VII', logo: departamento }
  if (perfil?.rol?.codigo === 'JEFE_DIV_B') return { nombre: 'DIVISIÓN B', logo: departamento }
  return { nombre: 'ARMADA BOLIVIANA', logo: armada }
}

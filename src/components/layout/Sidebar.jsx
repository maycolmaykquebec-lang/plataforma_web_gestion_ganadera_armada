import { menuPermitido } from '../../auth/permisos'
import { NavLink } from 'react-router-dom'
import { usePerfil } from '../../contexts/PerfilContext'
import { identidadUnidad } from './identidadUnidad'

const modulos = [
  { id: 'inicio', nombre: 'Inicio', ruta: '/dashboard', icono: '⌂' },
  { id: 'semovientes', nombre: 'Registro de Semovientes', ruta: '/semovientes', icono: '▣' },
  { id: 'historial', nombre: 'Historial Individual', ruta: '/historial', icono: '☷' },
  { id: 'sanidad', nombre: 'Control Sanitario', ruta: '/sanidad', icono: '✚' },
  { id: 'reproduccion', nombre: 'Control Reproductivo', ruta: '/reproduccion', icono: '♀' },
  { id: 'movimientos', nombre: 'Movimientos', ruta: '/movimientos', icono: '⇄' },
  { id: 'altas', nombre: 'Altas y Bajas', ruta: '/altas-bajas', icono: '⊞' },
  { id: 'inventario', nombre: 'Inventario Ganadero', ruta: '/inventario', icono: '▦' },
  { id: 'descarte', nombre: 'Evaluación para Descarte', ruta: '/descarte', icono: '◇' },
  { id: 'reportes', nombre: 'Reportes', ruta: '/reportes', icono: '▥' },
  { id: 'usuarios', nombre: 'Administración de Usuarios', ruta: '/usuarios', icono: '♙' },
  { id: 'auditoria', nombre: 'Auditoría', ruta: '/auditoria', icono: '◷' },
  { id: 'calendario', nombre: 'Calendario de actividades', ruta: '/calendario', icono: '▤' }
]


function Sidebar() {
  const perfil = usePerfil()
  const rol = perfil?.rol?.codigo || ''
  const supervisor = rol === 'SUP_DEPTO_VII'
  const identidad = identidadUnidad(perfil)

  const permitidos = menuPermitido(perfil)

  const menuVisible = modulos.filter((modulo) =>
    permitidos.includes(modulo.id)
  )

  let dependencia = 'DIVISIÓN "B" PRODUCCIÓN'

  if (supervisor) {
    dependencia = 'DEPARTAMENTO VII'
  } else if (perfil?.unidad) {
    dependencia = perfil.unidad.nombre
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <img src={identidad.logo} alt={`Emblema ${identidad.nombre}`} className="sidebar-unit-logo" />
        <div>
          <strong>ARMADA BOLIVIANA</strong>
          <small>{dependencia}</small>
        </div>
      </div>

      <div className="rio_blanco-sidebar-identity">
        <strong>{perfil?.nombre_completo}</strong>
        <span>{perfil?.rol?.nombre}</span>
        {supervisor && <small>SUPERVISIÓN Y AUTORIZACIÓN</small>}
      </div>

      <nav className="sidebar-nav" aria-label="Menú principal">
        {menuVisible.map((modulo) => {
          const nombre =
            supervisor && modulo.id === 'semovientes'
              ? 'Consulta de Semovientes'
              : modulo.nombre

          const contenido = (
            <>
              <span className="sidebar-icon" aria-hidden="true">
                {modulo.icono}
              </span>
              <span>{nombre}</span>
            </>
          )

          return (
            <NavLink
              key={modulo.id}
              to={modulo.ruta}
              className={({ isActive }) =>
                `sidebar-link ${isActive ? 'active' : ''}`
              }
            >
              {contenido}
            </NavLink>
          )
        })}
      </nav>

      <div className="sidebar-footer">
        {identidad.nombre} · Registro y control de semovientes
      </div>
    </aside>
  )
}

export default Sidebar


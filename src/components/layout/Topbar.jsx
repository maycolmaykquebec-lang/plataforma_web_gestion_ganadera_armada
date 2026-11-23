import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../services/supabaseClient'
import { usePerfil } from '../../contexts/PerfilContext'
import { identidadUnidad } from './identidadUnidad'

function Topbar() {
  const navigate = useNavigate()
  const perfil = usePerfil()

  const [saliendo, setSaliendo] = useState(false)
  const [errorSalida, setErrorSalida] = useState('')

  const rol = perfil?.rol?.codigo || ''
  const nombre = perfil?.nombre_completo || 'Usuario'
  const nombreRol = perfil?.rol?.nombre || 'Sin rol'
  const identidad = identidadUnidad(perfil)

  useEffect(() => {
    document.title = `Registro y control de semovientes | ${identidad.nombre}`
    return () => { document.title = 'Registro y control de semovientes | Armada Boliviana' }
  }, [identidad.nombre])

  let dependencia = 'DIVISIÓN "B" PRODUCCIÓN'

  if (rol === 'SUP_DEPTO_VII') {
    dependencia = 'DEPARTAMENTO VII'
  } else if (perfil?.unidad) {
    dependencia = `${perfil.unidad.sigla || identidad.sigla || 'UNIDAD'} "${identidad.nombre}"`
  }

  const cerrarSesion = async () => {
    setSaliendo(true)
    setErrorSalida('')

    const { error } = await supabase.auth.signOut()

    if (error) {
      setErrorSalida('No se pudo cerrar la sesión.')
      setSaliendo(false)
      return
    }

    navigate('/', { replace: true })
  }

  return (
    <header className="topbar rio_blanco-topbar">
      <div className="topbar-title">
        <strong>ARMADA BOLIVIANA</strong>
        <span> / {identidad.nombre}</span>
      </div>

      <div className="rio_blanco-user-area">
        <div className="rio_blanco-user-info">
          <strong>{nombre}</strong>
          <span>{dependencia}</span>
          <small>{nombreRol}</small>
        </div>

        <span className="rio_blanco-role-badge">
          {nombreRol.toUpperCase()}
        </span>

        <button
          type="button"
          className="rio_blanco-logout"
          onClick={cerrarSesion}
          disabled={saliendo}
        >
          {saliendo ? 'Saliendo...' : 'Cerrar sesión'}
        </button>

        {errorSalida && (
          <span role="alert" className="rio_blanco-logout-error">
            {errorSalida}
          </span>
        )}
      </div>
    </header>
  )
}

export default Topbar

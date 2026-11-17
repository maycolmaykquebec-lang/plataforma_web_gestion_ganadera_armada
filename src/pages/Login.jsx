import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, supabaseConfigurado } from '../services/supabaseClient'

import armadaLogo from '../assets/logos/armada-boliviana.png'
import departamentoLogo from '../assets/logos/departamento-vii.jpeg'

import './Login.css'

const funcionalidades = [
  'Registro e identificación individual de semovientes',
  'Control sanitario y reproductivo',
  'Historial, movimientos, altas y bajas',
  'Inventarios y reportes institucionales'
]

function Login() {
  const navigate = useNavigate()

  const [usuario, setUsuario] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [cargando, setCargando] = useState(false)
  const [mensaje, setMensaje] = useState('')

  const iniciarSesion = async (e) => {
    e.preventDefault()
    if (cargando || !supabaseConfigurado) return

    setCargando(true)
    setMensaje('')

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: usuario.trim(),
        password: contrasena
      })

      if (error || !data.user) {
        setMensaje('No se pudo iniciar sesión. Verifica tus credenciales.')
        return
      }

      const { data: perfil, error: errorPerfil } = await supabase
        .from('perfiles')
        .select('id, activo, rol_id, unidad_id')
        .eq('id', data.user.id)
        .single()

      if (errorPerfil || !perfil?.activo) {
        await supabase.auth.signOut()
        setMensaje('No se pudo verificar un perfil institucional activo.')
        return
      }

      navigate('/dashboard', { replace: true })
    } catch {
      setMensaje('Ocurrió un problema de conexión. Inténtalo nuevamente.')
    } finally {
      setCargando(false)
    }
  }

  return (
    <main className="rio_blanco-login">
      <div className="rio_blanco-login-container">

        <section className="rio_blanco-presentation">
          <div className="rio_blanco-presentation-inner">

            <div className="rio_blanco-institution-header">
              <div className="rio_blanco-main-logos">
                <img
                  src={armadaLogo}
                  alt="Emblema Armada Boliviana"
                />
                <img
                  src={departamentoLogo}
                  alt="Emblema Departamento VII"
                />
              </div>

              <div className="rio_blanco-institution-name">
                <strong>ARMADA BOLIVIANA</strong>
                <span>DEPARTAMENTO VII</span>
                <span>PARTICIPACIÓN EN EL DESARROLLO</span>
                <span>DIVISIÓN "B" PRODUCCIÓN</span>
              </div>
            </div>

            <div className="rio_blanco-project">
              <span className="rio_blanco-project-label">
                PLATAFORMA INSTITUCIONAL DE GESTIÓN
              </span>

              <h1>RÍO BLANCO</h1>

              <h2>
                Plataforma para el registro y control de semovientes
              </h2>

              <p className="rio_blanco-project-description">
                Unidad Operativa de Servicios y Producción Ganadera "RÍO BLANCO", dependiente de la DIV. "B" "PRODUCCIÓN" del DPTO. VII "PARTICIPACIÓN EN EL DESARROLLO" de la Armada Boliviana.
              </p>

              <div className="rio_blanco-project-features">
                {funcionalidades.map((funcion) => (
                  <div key={funcion} className="rio_blanco-feature">
                    <span aria-hidden="true">✓</span>
                    <p>{funcion}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rio_blanco-production-units">
              <h3>UNIDAD OPERATIVA DE SERVICIOS Y PRODUCCIÓN GANADERA</h3>

              <div className="rio_blanco-production-names">
                <span>RÍO BLANCO</span>
              </div>
            </div>

          </div>
        </section>

        <section className="rio_blanco-access">
          <div className="rio_blanco-access-inner">

            <div className="rio_blanco-access-header">
              <div className="rio_blanco-access-icon" aria-hidden="true">
                ⚓
              </div>

              <span>BIENVENIDO A RÍO BLANCO</span>
              <h2>Acceso institucional</h2>
              <p>
                Ingrese sus credenciales para acceder
                a los módulos autorizados del sistema.
              </p>
            </div>

            {!supabaseConfigurado && (
              <p className="rio_blanco-access-error" role="status">
                La conexión institucional todavía no está configurada. Contacte al administrador de la plataforma.
              </p>
            )}

            <form
              className="rio_blanco-access-form"
              onSubmit={iniciarSesion}
            >
              <label htmlFor="usuario">Correo electrónico</label>
              <input
                id="usuario"
                type="email"
                placeholder="Ingrese su correo electrónico"
                autoComplete="username"
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
                required
              />

              <label htmlFor="contrasena">Contraseña</label>
              <input
                id="contrasena"
                type="password"
                placeholder="Ingrese su contraseña"
                autoComplete="current-password"
                value={contrasena}
                onChange={(e) => setContrasena(e.target.value)}
                required
              />

              <button type="submit" disabled={cargando || !supabaseConfigurado}>
                {cargando ? 'Verificando acceso...' : 'Ingresar a la plataforma'}
              </button>

              {mensaje && (
                <p className="rio_blanco-access-error" role="alert">
                  {mensaje}
                </p>
              )}
            </form>

            <div className="rio_blanco-access-notice">
              <strong>ACCESO RESTRINGIDO</strong>
              <p>
                Sistema destinado exclusivamente a personal
                autorizado. Las funciones disponibles dependen
                del rol y la unidad operativa asignados.
              </p>
            </div>

          </div>

          <footer className="rio_blanco-access-footer">
            RÍO BLANCO · Armada Boliviana · División "B" Producción
          </footer>
        </section>

      </div>
    </main>
  )
}

export default Login



import { perfilValido } from '../auth/permisos'
import { useEffect, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { supabase, supabaseConfigurado } from '../services/supabaseClient'
import { PerfilContext } from '../contexts/PerfilContext'

function ProtectedRoute() {
  const [estado, setEstado] = useState(supabaseConfigurado ? 'cargando' : 'denegado')
  const [perfil, setPerfil] = useState(null)

  useEffect(() => {
    if (!supabaseConfigurado) return
    let activo = true

    async function verificarAcceso() {
      try {
        const { data: { user }, error } =
          await supabase.auth.getUser()

        if (!activo) return

        if (error || !user) {
          setEstado('denegado')
          return
        }

        const { data, error: errorPerfil } = await supabase
          .from('perfiles')
          .select(`
            nombre_completo,
            cargo,
            activo,
            rol:roles_sistema(codigo, nombre),
            unidad:unidades_operativas(id, codigo, nombre, sigla),
            departamento:departamentos(nombre)
          `)
          .eq('id', user.id)
          .single()

        if (!activo) return

        if (errorPerfil || !perfilValido(data)) {
          console.error(
            'No se pudo verificar el perfil:',
            errorPerfil?.code || 'PERFIL_NO_VALIDO'
          )
          setEstado('denegado')
          return
        }

        setPerfil(data)
        setEstado('autorizado')
      } catch (error) {
        console.error('Error de verificación:', error.message)
        if (activo) setEstado('denegado')
      }
    }

    verificarAcceso()

    const { data: { subscription } } =
      supabase.auth.onAuthStateChange((evento) => {
        if (evento === 'SIGNED_OUT' && activo) {
          setPerfil(null)
          setEstado('denegado')
        }
      })

    return () => {
      activo = false
      subscription.unsubscribe()
    }
  }, [])

  if (estado === 'cargando') {
    return (
      <div className="rio_blanco-verificando" role="status">
        Verificando acceso institucional...
      </div>
    )
  }

  if (estado === 'denegado') {
    return <Navigate to="/" replace />
  }

  return (
    <PerfilContext.Provider value={perfil}>
      <Outlet />
    </PerfilContext.Provider>
  )
}

export default ProtectedRoute

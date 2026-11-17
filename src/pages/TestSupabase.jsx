import { useEffect, useState } from 'react'
import { supabase } from '../services/supabaseClient'

function TestSupabase() {
  const [estado, setEstado] = useState('Comprobando conexión...')

  useEffect(() => {
    async function comprobarConexion() {
      try {
        const { data, error } = await supabase
          .from('unidades_operativas')
          .select('codigo, nombre')
          .limit(1)

        if (error) {
          setEstado('Error de Supabase: ' + error.message)
          return
        }

        setEstado(
          'Conexión correcta. Registros visibles: ' + data.length +
          '. Las políticas RLS pueden limitar la lectura.'
        )
      } catch (error) {
        setEstado('Error de conexión: ' + error.message)
      }
    }

    comprobarConexion()
  }, [])

  return (
    <main style={{
      minHeight: '100vh',
      padding: '40px',
      background: '#edf3f9',
      fontFamily: 'Arial, sans-serif'
    }}>
      <h1 style={{ color: '#123f70' }}>
        RIO_BLANCO — Prueba de Supabase
      </h1>

      <p>{estado}</p>
    </main>
  )
}

export default TestSupabase

import { useEffect, useState } from 'react'
import { supabase } from '../../services/supabaseClient'
import './FichaSemovienteModal.css'

const NOMBRES = {
  bovino: 'Ganado vacuno',
  equino: 'Ganado equino',
  caprino: 'Ganado caprino',
  mular: 'Ganado mular',
  avicola: 'Ganado avícola',
  porcino: 'Ganado porcino'
}

function fecha(valor, conHora = false) {
  if (!valor) return 'No registrado'

  if (!conHora && /^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    const [anio, mes, dia] = valor.split('-')
    return `${dia}/${mes}/${anio}`
  }

  const dato = new Date(valor)
  if (Number.isNaN(dato.getTime())) return 'No registrado'

  return new Intl.DateTimeFormat('es-BO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...(conHora ? { hour: '2-digit', minute: '2-digit' } : {})
  }).format(dato)
}

function Campo({ nombre, valor }) {
  return (
    <div className="fs-campo">
      <span>{nombre}</span>
      <strong>{valor ?? 'No registrado'}</strong>
    </div>
  )
}

function FichaSemovienteModal({ animalId, onCerrar }) {
  const [animal, setAnimal] = useState(null)
  const [unidad, setUnidad] = useState('')
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!animalId) return

    let activo = true

    async function cargarFicha() {
      setCargando(true)
      setAnimal(null)
      setUnidad('')
      setError('')

      const { data, error: errorAnimal } = await supabase
        .from('semovientes')
        .select(`
          id, codigo, especie, categoria, raza, sexo,
          fecha_nacimiento, fecha_ingreso, procedencia,
          marca_ancla, vacuna_brucelosis, estado,
          observaciones, unidad_id, created_at, updated_at
        `)
        .eq('id', animalId)
        .maybeSingle()

      if (!activo) return

      if (errorAnimal || !data) {
        setError('No se pudo consultar la ficha autorizada.')
        setCargando(false)
        return
      }

      setAnimal(data)

      const { data: unidadData, error: errorUnidad } = await supabase
        .from('unidades_operativas')
        .select('nombre')
        .eq('id', data.unidad_id)
        .maybeSingle()

      if (!activo) return

      if (!errorUnidad && unidadData) {
        setUnidad(unidadData.nombre)
      }

      setCargando(false)
    }

    cargarFicha()

    return () => { activo = false }
  }, [animalId])

  useEffect(() => {
    if (!animalId) return

    const cerrarConEscape = (evento) => {
      if (evento.key === 'Escape') onCerrar()
    }

    document.addEventListener('keydown', cerrarConEscape)
    return () => document.removeEventListener('keydown', cerrarConEscape)
  }, [animalId, onCerrar])

  if (!animalId) return null

  return (
    <div className="fs-overlay">
      <section
        className="fs-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fs-titulo"
      >
        <header className="fs-header">
          <div>
            <span>RIO_BLANCO · FICHA INDIVIDUAL</span>
            <h2 id="fs-titulo">
              {animal?.codigo || 'Consulta de semoviente'}
            </h2>
            <p>
              {animal
                ? `${NOMBRES[animal.especie] || animal.especie} · ${animal.categoria}`
                : 'Consulta institucional'}
            </p>
          </div>

          <button
            className="fs-cerrar"
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar ficha"
          >
            ×
          </button>
        </header>

        <div className="fs-contenido">
          {cargando && (
            <p role="status">Consultando ficha en Supabase...</p>
          )}

          {error && <p className="fs-error" role="alert">{error}</p>}

          {!cargando && animal && (
            <>
              <div className="fs-resumen">
                <div>
                  <small>UNIDAD OPERATIVA</small>
                  <strong>{unidad || 'Unidad no disponible'}</strong>
                </div>
                <span className={
                  animal.estado === 'Activo'
                    ? 'fs-estado activo'
                    : 'fs-estado baja'
                }>
                  {animal.estado}
                </span>
              </div>

              <h3>1. Identificación del animal</h3>
              <div className="fs-grid">
                <Campo nombre="Código individual" valor={animal.codigo} />
                <Campo nombre="Especie" valor={NOMBRES[animal.especie]} />
                <Campo nombre="Clase" valor={animal.categoria} />
                <Campo nombre="Raza" valor={animal.raza} />
                <Campo nombre="Sexo" valor={animal.sexo} />
                <Campo nombre="Estado" valor={animal.estado} />
              </div>

              <h3>2. Procedencia e ingreso</h3>
              <div className="fs-grid">
                <Campo nombre="Fecha de nacimiento"
                  valor={fecha(animal.fecha_nacimiento)} />
                <Campo nombre="Fecha de ingreso"
                  valor={fecha(animal.fecha_ingreso)} />
                <Campo nombre="Procedencia"
                  valor={animal.procedencia} />
              </div>

              <h3>3. Identificación complementaria</h3>
              <div className="fs-grid">
                <Campo nombre="Marca Ancla"
                  valor={animal.marca_ancla ? 'Sí' : 'No'} />
                <Campo nombre="Vacunación contra brucelosis"
                  valor={animal.vacuna_brucelosis ? 'Sí' : 'No'} />
              </div>

              <div className="fs-observaciones">
                <small>OBSERVACIONES</small>
                <p>{animal.observaciones || 'Sin observaciones'}</p>
              </div>

              <h3>4. Control institucional</h3>
              <div className="fs-grid">
                <Campo nombre="Fecha de registro"
                  valor={fecha(animal.created_at, true)} />
                <Campo nombre="Última actualización"
                  valor={fecha(animal.updated_at, true)} />
              </div>

              <div className="fs-aviso">
                Ficha de consulta. No permite editar ni eliminar registros.
              </div>
            </>
          )}
        </div>

        <footer className="fs-footer">
          <button type="button" onClick={onCerrar}>
            Cerrar ficha
          </button>
        </footer>
      </section>
    </div>
  )
}

export default FichaSemovienteModal

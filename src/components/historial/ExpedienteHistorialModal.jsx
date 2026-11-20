import { useEffect, useState } from 'react'
import { supabase } from '../../services/supabaseClient'
import './ExpedienteHistorialModal.css'
import ResumenReproductivo from '../reproduccion/ResumenReproductivo'
import './ExpedienteEventos.css'

const NOMBRES = {
  bovino: 'Ganado vacuno',
  equino: 'Ganado equino',
  caprino: 'Ganado caprino',
  mular: 'Ganado mular',
  avicola: 'Ganado avícola',
  porcino: 'Ganado porcino'
}

const TIPOS_EVENTO = {
  registro: 'Registro',
  sanitario: 'Control sanitario',
  reproductivo: 'Control reproductivo',
  movimiento: 'Movimiento',
  alta: 'Alta',
  baja: 'Baja',
  descarte: 'Evaluación para descarte',
  observacion: 'Observación'
}

const EVENTOS_POR_PAGINA = 25

function fecha(valor, conHora = false) {
  if (!valor) return 'No registrado'
  if (!conHora && /^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    const [anio, mes, dia] = valor.split('-')
    return `${dia}/${mes}/${anio}`
  }
  const dato = new Date(valor)
  if (Number.isNaN(dato.getTime())) return 'No registrado'
  return new Intl.DateTimeFormat('es-BO', {
    timeZone: 'America/La_Paz',
    year: 'numeric', month: '2-digit', day: '2-digit',
    ...(conHora ? { hour: '2-digit', minute: '2-digit' } : {})
  }).format(dato)
}

function Campo({ titulo, valor }) {
  return (
    <div className="eh-campo">
      <span>{titulo}</span>
      <strong>{valor ?? 'No registrado'}</strong>
    </div>
  )
}

function ExpedienteHistorialModal({ animalId, onCerrar }) {
  const [animal, setAnimal] = useState(null)
  const [unidad, setUnidad] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')

  const [eventos, setEventos] = useState([])
  const [totalEventos, setTotalEventos] = useState(0)
  const [limiteEventos, setLimiteEventos] = useState(EVENTOS_POR_PAGINA)
  const [cargandoEventos, setCargandoEventos] = useState(false)
  const [errorEventos, setErrorEventos] = useState('')
  const [montasMacho, setMontasMacho] = useState([])
  const [errorMontas, setErrorMontas] = useState('')

  useEffect(() => {
    if (animalId == null) {
      setAnimal(null)
      return
    }

    let activo = true

    async function cargar() {
      setCargando(true)
      setAnimal(null)
      setUnidad('')
      setError('')
      setEventos([])
      setTotalEventos(0)
      setLimiteEventos(EVENTOS_POR_PAGINA)
      setErrorEventos('')
      setMontasMacho([])
      setErrorMontas('')

      const { data, error: errorAnimal } = await supabase
        .from('semovientes')
        .select(`
          id, codigo, codigo_activo, especie, categoria, raza, sexo,
          fecha_nacimiento, fecha_ingreso, procedencia,
          marca_ancla, vacuna_brucelosis, estado,
          observaciones, unidad_id, created_at, updated_at
        `)
        .eq('id', animalId)
        .maybeSingle()

      if (!activo) return
      if (errorAnimal || !data) {
        setError('El semoviente no está disponible para esta sesión o ya no existe.')
        setCargando(false)
        return
      }

      setAnimal(data)
      const { data: datosUnidad } = await supabase
        .from('unidades_operativas')
        .select('nombre')
        .eq('id', data.unidad_id)
        .maybeSingle()

      if (!activo) return
      setUnidad(datosUnidad?.nombre || 'Unidad no disponible')
      setCargando(false)
    }

    cargar()
    return () => { activo = false }
  }, [animalId])

  // Se consulta la nueva tabla únicamente después de validar la lectura
  // del semoviente. PostgreSQL vuelve a aplicar su política RLS.
  useEffect(() => {
    if (animal?.id == null) return
    let activo = true

    async function cargarEventos() {
      setCargandoEventos(true)
      setErrorEventos('')

      const { data, count, error: errorConsulta } = await supabase
        .from('semoviente_eventos')
        .select(
          'id, tipo_evento, fecha_evento, titulo, detalle, origen_modulo, registrado_en',
          { count: 'exact' }
        )
        .eq('semoviente_id', animal.id)
        .order('fecha_evento', { ascending: false })
        .order('id', { ascending: false })
        .range(0, limiteEventos - 1)

      if (!activo) return

      if (errorConsulta) {
        console.error('RIO_BLANCO - error al consultar acontecimientos:', errorConsulta.message)
        setErrorEventos('No fue posible consultar los acontecimientos de este semoviente.')
        setEventos([])
        setTotalEventos(0)
      } else {
        setEventos(data || [])
        setTotalEventos(count ?? 0)
      }

      setCargandoEventos(false)
    }

    cargarEventos()
    return () => { activo = false }
  }, [animal?.id, limiteEventos])

  useEffect(() => {
    if (animal?.id == null || animal.sexo !== 'Macho') return
    let activo = true
    async function cargarMontas() {
      const { data, error: fallo } = await supabase.from('controles_reproductivos')
        .select('id,fecha_evento,semoviente_id,resultado,metodo')
        .eq('reproductor_id', animal.id).eq('tipo_evento', 'monta')
        .order('fecha_evento', { ascending: false }).limit(30)
      if (!activo) return
      if (fallo) setErrorMontas('No fue posible cargar las montas visibles del macho.')
      else setMontasMacho(data || [])
    }
    cargarMontas()
    return () => { activo = false }
  }, [animal?.id, animal?.sexo])

  useEffect(() => {
    if (animalId == null) return
    function teclado(evento) {
      if (evento.key === 'Escape') onCerrar()
    }
    document.addEventListener('keydown', teclado)
    return () => document.removeEventListener('keydown', teclado)
  }, [animalId, onCerrar])

  if (animalId == null) return null

  // Referencias ya almacenadas en la ficha básica. NO se confunden con
  // acontecimientos de gestión documentados en semoviente_eventos.
  const referenciasFicha = animal ? [
    ...(animal.fecha_ingreso ? [{
      clave: 'ingreso', titulo: 'Fecha de ingreso declarada',
      fecha: fecha(animal.fecha_ingreso),
      descripcion: `Procedencia: ${animal.procedencia || 'no informada'}.`
    }] : []),
    ...(animal.created_at ? [{
      clave: 'registro', titulo: 'Creación de la ficha digital en RIO_BLANCO',
      fecha: fecha(animal.created_at, true),
      descripcion: 'Fecha de creación en el sistema; no constituye por sí sola un evento de alta ganadera.'
    }] : [])
  ] : []

  return (
    <div className="eh-overlay">
      <section className="eh-modal" role="dialog" aria-modal="true" aria-labelledby="eh-titulo">
        <header className="eh-header">
          <div>
            <span>RIO_BLANCO · EXPEDIENTE INDIVIDUAL</span>
            <h2 id="eh-titulo">{animal ? `Semoviente ${animal.codigo}` : 'Consulta del historial'}</h2>
            <p>{animal ? `${NOMBRES[animal.especie] || animal.especie} · ${animal.categoria} · ${unidad}` : 'Consulta institucional autorizada'}</p>
          </div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar expediente">×</button>
        </header>

        <div className="eh-contenido">
          {cargando && <p role="status">Cargando expediente desde Supabase...</p>}
          {error && <p className="eh-error" role="alert">{error}</p>}

          {!cargando && animal && (
            <>
              <div className="eh-estado-linea">
                <span><strong>UNIDAD OPERATIVA</strong> {unidad}</span>
                <span className={`eh-etiqueta ${animal.estado === 'Activo' ? 'activo' : 'baja'}`}>{animal.estado}</span>
              </div>

              <h3>Datos de identificación</h3>
              <div className="eh-grid">
                <Campo titulo="Código" valor={animal.codigo} />
                <Campo titulo="Código del Activo" valor={animal.codigo_activo || 'No asignado'} />
                <Campo titulo="Especie" valor={NOMBRES[animal.especie] || animal.especie} />
                <Campo titulo="Clase" valor={animal.categoria} />
                <Campo titulo="Sexo" valor={animal.sexo} />
                <Campo titulo="Raza" valor={animal.raza} />
                <Campo titulo="Nacimiento" valor={fecha(animal.fecha_nacimiento)} />
                <Campo titulo="Procedencia" valor={animal.procedencia} />
                <Campo titulo="Marca Ancla" valor={animal.marca_ancla ? 'Sí' : 'No'} />
                <Campo titulo="Vacunación brucelosis (indicador inicial)" valor={animal.vacuna_brucelosis ? 'Sí' : 'No'} />
                <Campo titulo="Última actualización" valor={fecha(animal.updated_at, true)} />
              </div>

              <div className="eh-observaciones">
                <strong>Observaciones</strong>
                <p>{animal.observaciones || 'Sin observaciones registradas.'}</p>
              </div>

              <h3>Resumen reproductivo</h3>
              <ResumenReproductivo semovienteId={animal.id} sexo={animal.sexo} />
              {animal.sexo === 'Macho' && (
                <div>
                  <h3>Últimas montas vinculadas visibles</h3>
                  <p className="eh-eventos-subtitulo">Los detalles se muestran solo cuando las políticas RLS permiten consultar el registro de la hembra. El total puede incluir montas de hembras trasladadas.</p>
                  {errorMontas && <p className="eh-error" role="alert">{errorMontas}</p>}
                  {!errorMontas && montasMacho.length === 0 && <p className="eh-eventos-vacio">Sin montas vinculadas consultables en el historial.</p>}
                  {montasMacho.length > 0 && <ol className="eh-linea-tiempo">
                    {montasMacho.map(m => <li key={m.id}><span>{fecha(m.fecha_evento)}</span><strong>Monta registrada · Hembra ID {m.semoviente_id}</strong><p>{m.resultado || 'Sin resultado'}{m.metodo ? ` · ${m.metodo}` : ''}</p></li>)}
                  </ol>}
                </div>
              )}
              <h3>Acontecimientos de gestión documentados</h3>
              <p className="eh-eventos-subtitulo">
                Información procedente de la tabla semoviente_eventos y filtrada por los permisos de la sesión.
              </p>

              {cargandoEventos && <p className="eh-eventos-estado" role="status">Consultando acontecimientos...</p>}
              {errorEventos && <p className="eh-error" role="alert">{errorEventos}</p>}
              {!cargandoEventos && !errorEventos && eventos.length === 0 && (
                <p className="eh-eventos-vacio">
                  No hay acontecimientos adicionales documentados para este semoviente.
                  Los futuros controles sanitarios, reproductivos y movimientos se mostrarán aquí cuando sean registrados por sus módulos.
                </p>
              )}

              {eventos.length > 0 && !errorEventos && (
                <>
                  <ol className="eh-linea-tiempo eh-linea-tiempo-eventos">
                    {eventos.map(evento => (
                      <li key={evento.id}>
                        <span>{fecha(evento.fecha_evento, true)}</span>
                        <span className="eh-tipo-evento">{TIPOS_EVENTO[evento.tipo_evento] || evento.tipo_evento}</span>
                        <strong>{evento.titulo}</strong>
                        {evento.detalle && <p>{evento.detalle}</p>}
                        <small className="eh-origen-evento">Origen: {evento.origen_modulo}</small>
                      </li>
                    ))}
                  </ol>
                  {totalEventos > eventos.length && (
                    <button
                      type="button"
                      className="eh-ver-mas-eventos"
                      onClick={() => setLimiteEventos(actual => actual + EVENTOS_POR_PAGINA)}
                      disabled={cargandoEventos}
                    >
                      Mostrar más ({eventos.length} de {totalEventos})
                    </button>
                  )}
                </>
              )}

              <h3>Referencias administrativas de la ficha</h3>
              <ol className="eh-linea-tiempo">
                {referenciasFicha.map(referencia => (
                  <li key={referencia.clave}>
                    <span>{referencia.fecha}</span>
                    <strong>{referencia.titulo}</strong>
                    <p>{referencia.descripcion}</p>
                  </li>
                ))}
              </ol>

              <div className="eh-nota">
                Las referencias de ingreso y creación de ficha se obtienen de la tabla semovientes.
                No se presentan como vacunaciones, traslados ni altas acreditadas.
                Los acontecimientos de gestión se consultan por separado en semoviente_eventos;
                esta pantalla es exclusivamente de lectura.
              </div>
            </>
          )}
        </div>
        <footer className="eh-footer">
          <span>Consulta de solo lectura · Controlada por RLS</span>
          <button type="button" onClick={onCerrar}>Cerrar expediente</button>
        </footer>
      </section>
    </div>
  )
}

export default ExpedienteHistorialModal

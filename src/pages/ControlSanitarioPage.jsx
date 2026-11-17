import { puedeRegistrar as registroPermitido, consultaGeneral as consultaPermitida } from '../auth/permisos'
// RIO_BLANCO PASO 17.7 - Ajustes finales
// RIO_BLANCO - PASO 17.5 | Integracion registro sanitario RLS
// RIO_BLANCO - PASO 17.2 | Integracion del formulario sanitario
// RIO_BLANCO - PASO 17.1 | Control Sanitario (consulta, responsive)
// Lectura segura a través de Supabase y las políticas RLS existentes.
// No crea ni modifica registros; el formulario sanitario se hará en pasos posteriores.
import { useEffect, useState } from 'react'
import { supabase } from '../services/supabaseClient'
import { usePerfil } from '../contexts/PerfilContext'
import ExpedienteHistorialModal from '../components/historial/ExpedienteHistorialModal'
import './ControlSanitarioPage.css'
import NuevoControlSanitarioModal from '../components/sanidad/NuevoControlSanitarioModal'

const POR_PAGINA = 15
const ESPECIES = [
  { id: 'bovino', nombre: 'Ganado vacuno' },
  { id: 'equino', nombre: 'Ganado equino' },
  { id: 'caprino', nombre: 'Ganado caprino' },
  { id: 'mular', nombre: 'Ganado mular' },
  { id: 'avicola', nombre: 'Ganado avícola' },
  { id: 'porcino', nombre: 'Ganado porcino' }
]

function etiquetaEspecie(valor) {
  return ESPECIES.find(item => item.id === valor)?.nombre || valor || '—'
}

function fechaBolivia(valor) {
  if (!valor) return '—'
  const fecha = new Date(valor)
  if (Number.isNaN(fecha.getTime())) return '—'
  return new Intl.DateTimeFormat('es-BO', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    timeZone: 'America/La_Paz'
  }).format(fecha)
}

function datoTexto(valor, alternativa = '—') {
  return typeof valor === 'string' && valor.trim() ? valor.trim() : alternativa
}

function ControlSanitarioPage() {
  const perfil = usePerfil()
  const consultaGeneral = consultaPermitida(perfil)
  // Modo de preparacion, sin escritura. El permiso real se definira en PostgreSQL.
  const puedePrepararControl = registroPermitido(perfil)

  const [especie, setEspecie] = useState('')
  const [unidadId, setUnidadId] = useState('todas')
  const [unidades, setUnidades] = useState([])
  const [errorUnidades, setErrorUnidades] = useState('')
  const [codigo, setCodigo] = useState('')
  const [codigoAplicado, setCodigoAplicado] = useState('')
  const [avisoBusqueda, setAvisoBusqueda] = useState('')

  const [eventos, setEventos] = useState([])
  const [total, setTotal] = useState(0)
  const [pagina, setPagina] = useState(1)
  const [cargando, setCargando] = useState(true)
  const [errorEventos, setErrorEventos] = useState('')

  const [animales, setAnimales] = useState([])
  const [buscandoAnimales, setBuscandoAnimales] = useState(false)
  const [errorAnimales, setErrorAnimales] = useState('')
  const [animalAbierto, setAnimalAbierto] = useState(null)
  const [animalNuevoControl, setAnimalNuevoControl] = useState(null)
  const [recarga, setRecarga] = useState(0)
  const [avisoGuardado, setAvisoGuardado] = useState('')

  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA))

  // El supervisor puede filtrar la vista; ningún filtro aumenta sus permisos RLS.
  useEffect(() => {
    if (!consultaGeneral) {
      setUnidades([])
      setUnidadId('todas')
      setErrorUnidades('')
      return
    }
    let activo = true
    async function cargarUnidades() {
      const { data, error } = await supabase
        .from('unidades_operativas')
        .select('id, nombre, codigo')
        .order('nombre')
      if (!activo) return
      setUnidades(error ? [] : (data || []))
      setErrorUnidades(error ? 'No se pudieron cargar las unidades.' : '')
    }
    cargarUnidades()
    return () => { activo = false }
  }, [consultaGeneral])

  useEffect(() => {
    let activo = true
    async function cargarEventos() {
      setCargando(true)
      setErrorEventos('')

      // La relación INNER permite aplicar filtros de especie y unidad
      // sin traer todos los acontecimientos al navegador.
      let consulta = supabase
        .from('semoviente_eventos')
        .select(`
          id, semoviente_id, tipo_evento, fecha_evento, titulo, detalle,
          datos_adicionales, origen_modulo,
          semovientes!inner(id, codigo, especie, unidad_id)
        `, { count: 'exact' })
        .eq('tipo_evento', 'sanitario')

      if (especie) consulta = consulta.eq('semovientes.especie', especie)
      if (codigoAplicado) consulta = consulta.eq('semovientes.codigo', codigoAplicado)
      if (consultaGeneral && unidadId !== 'todas') {
        consulta = consulta.eq('semovientes.unidad_id', Number(unidadId))
      }
      const desde = (pagina - 1) * POR_PAGINA
      const { data, count, error } = await consulta
        .order('fecha_evento', { ascending: false })
        .order('id', { ascending: false })
        .range(desde, desde + POR_PAGINA - 1)

      if (!activo) return
      if (error) {
        console.error('RIO_BLANCO - Error al consultar control sanitario:', error.code, error.message)
        setErrorEventos('No fue posible consultar los controles sanitarios. Revise la conexión y los permisos.')
        setEventos([])
        setTotal(0)
      } else {
        setEventos(data || [])
        setTotal(count ?? 0)
      }
      setCargando(false)
    }
    cargarEventos()
    return () => { activo = false }
  }, [especie, codigoAplicado, unidadId, consultaGeneral, pagina, recarga])

  // Buscar animales por código aunque todavía no tengan controles sanitarios.
  useEffect(() => {
    if (!codigoAplicado) {
      setAnimales([])
      setErrorAnimales('')
      setBuscandoAnimales(false)
      return
    }
    let activo = true
    async function consultarAnimal() {
      setBuscandoAnimales(true)
      setErrorAnimales('')
      let consulta = supabase
        .from('semovientes')
        .select('id, codigo, especie, categoria, sexo, estado, unidad_id')
        .eq('codigo', codigoAplicado)
      if (especie) consulta = consulta.eq('especie', especie)
      if (consultaGeneral && unidadId !== 'todas') {
        consulta = consulta.eq('unidad_id', Number(unidadId))
      }
      const { data, error } = await consulta.order('id', { ascending: false }).limit(20)
      if (!activo) return
      setAnimales(error ? [] : (data || []))
      setErrorAnimales(error ? 'No se pudo consultar el semoviente.' : '')
      setBuscandoAnimales(false)
    }
    consultarAnimal()
    return () => { activo = false }
  }, [codigoAplicado, especie, unidadId, consultaGeneral, recarga])

  function enviarBusqueda(evento) {
    evento.preventDefault()
    const limpio = codigo.trim().toUpperCase()
    if (limpio.length > 50) {
      setAvisoBusqueda('El código no debe superar 50 caracteres.')
      return
    }
    setAvisoBusqueda('')
    setCodigoAplicado(limpio)
    setPagina(1)
    // Permite repetir la búsqueda incluso con el mismo código.
    setRecarga(actual => actual + 1)
  }

  function limpiar() {
    setEspecie('')
    setUnidadId('todas')
    setCodigo('')
    setCodigoAplicado('')
    setAvisoBusqueda('')
    setPagina(1)
  }

  function nombreUnidad(id) {
    if (!consultaGeneral) return perfil?.unidad?.nombre || 'Unidad asignada'
    return unidades.find(u => String(u.id) === String(id))?.nombre || `Unidad #${id}`
  }

  return (
    <main className="cs-pagina">
      <div className="cs-aviso">
        <strong>DEMOSTRACIÓN PÚBLICA</strong>
        <span>Utilice únicamente datos ficticios. Los registros almacenados en Supabase permanecen después de reiniciar Vite.</span>
      </div>

      {avisoGuardado && (
        <p className="cs-aviso-guardado" role="status" style={{background: '#e5f6ea', color: '#145d32', border: '1px solid #91cda7', padding: 12, borderRadius: 8}}>{avisoGuardado}</p>
      )}
      <section
        className="cs-portada"
        aria-label="Presentación del módulo Control Sanitario"
        style={{ backgroundImage: 'linear-gradient(95deg, rgba(7,26,49,.96), rgba(12,50,81,.82) 63%, rgba(9,42,70,.46)), url("/images/portada-ganadera.jpg")' }}
      >
        <span className="cs-sobretitulo">RIO_BLANCO · MÓDULO DE ACONTECIMIENTOS</span>
        <h1>Control sanitario</h1>
        <p>Consulta de vacunaciones, tratamientos, diagnósticos y controles documentados por semoviente.</p>
        <small>{consultaGeneral ? 'DEPARTAMENTO VII · CONSULTA INSTITUCIONAL' : `UNIDAD OPERATIVA ${perfil?.unidad?.nombre || 'ASIGNADA'}`}</small>
      </section>

      <section className="cs-panel" aria-labelledby="cs-titulo-busqueda">
        <div className="cs-panel-intro">
          <div>
            <h2 id="cs-titulo-busqueda">Buscar controles sanitarios</h2>
            <p>Seleccione una especie, introduzca un código si lo conoce y consulte los acontecimientos autorizados.</p>
          </div>
          <span className="cs-solo-lectura">Consulta protegida por RLS</span>
        </div>

        <form className="cs-filtros" onSubmit={enviarBusqueda}>
          <div className="cs-campo">
            <label htmlFor="cs-especie">Especie ganadera</label>
            <select
              id="cs-especie"
              value={especie}
              onChange={evento => { setEspecie(evento.target.value); setPagina(1) }}
            >
              <option value="">Todas las especies</option>
              {ESPECIES.map(item => (
                <option value={item.id} key={item.id}>{item.nombre}</option>
              ))}
            </select>
          </div>

          {consultaGeneral && (
            <div className="cs-campo">
              <label htmlFor="cs-unidad">Unidad operativa</label>
              <select
                id="cs-unidad"
                value={unidadId}
                onChange={evento => { setUnidadId(evento.target.value); setPagina(1) }}
              >
                <option value="todas">Todas las unidades</option>
                {unidades.map(item => (
                  <option value={item.id} key={item.id}>{item.nombre}</option>
                ))}
              </select>
              {errorUnidades && <small className="cs-error" role="alert">{errorUnidades}</small>}
            </div>
          )}

          <div className="cs-campo cs-campo-codigo">
            <label htmlFor="cs-codigo">Código individual del animal</label>
            <input
              id="cs-codigo"
              type="search"
              value={codigo}
              maxLength={50}
              onChange={evento => setCodigo(evento.target.value)}
              placeholder="Ej.: 007 o RB-001"
              autoComplete="off"
            />
          </div>

          <div className="cs-botones">
            <button className="cs-primario" type="submit">Buscar</button>
            <button className="cs-secundario" type="button" onClick={limpiar}>Limpiar</button>
          </div>
        </form>
        {avisoBusqueda && <p role="alert" className="cs-error">{avisoBusqueda}</p>}
      </section>

      {codigoAplicado && (
        <section className="cs-panel cs-resultado-busqueda" aria-labelledby="cs-titulo-animal">
          <div className="cs-panel-intro">
            <h2 id="cs-titulo-animal">Semovientes encontrados con el código «{codigoAplicado}»</h2>
          </div>
          {buscandoAnimales ? <p role="status">Buscando semovientes...</p> : null}
          {errorAnimales && <p className="cs-error" role="alert">{errorAnimales}</p>}
          {!buscandoAnimales && !errorAnimales && animales.length === 0 && (
            <p className="cs-vacio">No se encontraron animales con ese código en las unidades autorizadas.</p>
          )}
          {!buscandoAnimales && animales.length > 0 && (
            <div className="cs-animales">
              {animales.map(animal => (
                <div key={animal.id} className="cs-animal">
                  <div>
                    <strong>{animal.codigo} · {etiquetaEspecie(animal.especie)}</strong>
                    <small>{animal.categoria || 'Sin clase'} · {nombreUnidad(animal.unidad_id)} · {animal.estado}</small>
                  </div>
                  <div className="cs-animal-acciones">
                    <button type="button" className="cs-secundario" onClick={() => setAnimalAbierto(animal.id)}>
                      Ver historial
                    </button>
                    {puedePrepararControl && (
                      <button
                        type="button"
                        className="cs-preparar-control"
                        onClick={() => setAnimalNuevoControl(animal)}
                      >
                        + Nuevo control sanitario
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="cs-panel cs-historial" aria-labelledby="cs-titulo-historial">
        <div className="cs-panel-intro">
          <div>
            <h2 id="cs-titulo-historial">Historial de control sanitario <span className="cs-contador">{total}</span></h2>
            <p>Solo se muestran acontecimientos sanitarios que ya existen en Supabase.</p>
          </div>
          <button type="button" className="cs-actualizar" onClick={() => setRecarga(actual => actual + 1)} disabled={cargando}>
            Actualizar listado
          </button>
        </div>

        {cargando && <p className="cs-estado-carga" role="status">Consultando controles sanitarios...</p>}
        {errorEventos && <p className="cs-error" role="alert">{errorEventos}</p>}

        <div className="cs-tabla-scroll" tabIndex="0" role="region" aria-label="Tabla de controles sanitarios, desplazable horizontalmente">
          <table className="cs-tabla">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Código</th>
                <th>Especie</th>
                {consultaGeneral && <th>Unidad</th>}
                <th>Tipo</th>
                <th>Diagnóstico / Detalle</th>
                <th>Tratamiento</th>
                <th>Responsable</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {!cargando && !errorEventos && eventos.length === 0 && (
                <tr>
                  <td className="cs-tabla-vacia" colSpan={consultaGeneral ? 9 : 8}>
                    No existen acontecimientos sanitarios documentados que coincidan con los filtros.
                  </td>
                </tr>
              )}
              {!cargando && !errorEventos && eventos.map(evento => {
                const animal = evento.semovientes
                const datos = evento.datos_adicionales || {}
                return (
                  <tr key={evento.id}>
                    <td>{fechaBolivia(evento.fecha_evento)}</td>
                    <td><strong>{animal?.codigo || '—'}</strong></td>
                    <td>{etiquetaEspecie(animal?.especie)}</td>
                    {consultaGeneral && <td>{nombreUnidad(animal?.unidad_id)}</td>}
                    <td>{datoTexto(datos.tipo_control, 'Control sanitario')}</td>
                    <td title={datoTexto(evento.detalle, evento.titulo)}>{datoTexto(datos.diagnostico, datoTexto(evento.detalle, evento.titulo))}</td>
                    <td>{datoTexto(datos.tratamiento)}</td>
                    <td>{datoTexto(datos.responsable)}</td>
                    <td>
                      <button className="cs-enlace-ficha" type="button" onClick={() => setAnimalAbierto(evento.semoviente_id)}>
                        Ver historial
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="cs-paginacion">
          <span>{total === 0 ? 'Sin controles registrados' : `Mostrando ${(pagina - 1) * POR_PAGINA + 1}–${Math.min(pagina * POR_PAGINA, total)} de ${total}`}</span>
          <div className="cs-paginacion-botones">
            <button type="button" disabled={pagina === 1 || cargando} onClick={() => setPagina(actual => Math.max(1, actual - 1))}>Anterior</button>
            <strong>Página {pagina} de {paginas}</strong>
            <button type="button" disabled={pagina >= paginas || cargando} onClick={() => setPagina(actual => actual + 1)}>Siguiente</button>
          </div>
        </div>

        <p className="cs-nota">
          Los controles registrados se consultan desde <code>semoviente_eventos</code> y están protegidos por RLS. Solo el personal con perfil <strong>RESP_UNIDAD</strong> autorizado puede guardar nuevas intervenciones en su unidad. El resto de los perfiles permanece en consulta; cada control autorizado se vincula al Historial Individual.
        </p>
      </section>

      <ExpedienteHistorialModal animalId={animalAbierto} onCerrar={() => setAnimalAbierto(null)} />
      <NuevoControlSanitarioModal
        animal={animalNuevoControl}
        unidad={animalNuevoControl ? nombreUnidad(animalNuevoControl.unidad_id) : ''}
        onCerrar={() => setAnimalNuevoControl(null)}
        onGuardado={(animalGuardado) => {
          setAnimalNuevoControl(null)
          setAvisoGuardado(`Control sanitario de prueba guardado para el animal ${animalGuardado.codigo}.`)
          setPagina(1)
          setRecarga(n => n + 1)
        }}
      />
    </main>
  )
}

export default ControlSanitarioPage

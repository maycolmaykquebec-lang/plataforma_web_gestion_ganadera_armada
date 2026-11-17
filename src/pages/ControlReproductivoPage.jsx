import { puedeRegistrar as registroPermitido, consultaGeneral as consultaPermitida } from '../auth/permisos'
// RIO_BLANCO - PASO 18.5 | Registro reproductivo RLS desde React.
// PostgreSQL valida rol/unidad y crea el evento historico mediante trigger.
import { useEffect, useState } from 'react'
import { supabase } from '../services/supabaseClient'
import { usePerfil } from '../contexts/PerfilContext'
import ExpedienteHistorialModal from '../components/historial/ExpedienteHistorialModal'
import NuevoControlReproductivoModal from '../components/reproduccion/NuevoControlReproductivoModal'
import './ControlReproductivoPage.css'

const POR_PAGINA = 15
const ESPECIES = [
  { id: 'bovino', nombre: 'Ganado vacuno' },
  { id: 'equino', nombre: 'Ganado equino' },
  { id: 'caprino', nombre: 'Ganado caprino' },
  { id: 'mular', nombre: 'Ganado mular' },
  { id: 'avicola', nombre: 'Ganado avícola' },
  { id: 'porcino', nombre: 'Ganado porcino' }
]

function especieTexto(valor) {
  return ESPECIES.find(item => item.id === valor)?.nombre || valor || '—'
}

function fechaBolivia(valor) {
  if (!valor) return '—'
  if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    const [anio, mes, dia] = valor.split('-')
    return `${dia}/${mes}/${anio}`
  }
  const fecha = new Date(valor)
  if (Number.isNaN(fecha.getTime())) return '—'
  return new Intl.DateTimeFormat('es-BO', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    timeZone: 'America/La_Paz'
  }).format(fecha)
}

function texto(valor, porDefecto = '—') {
  if (typeof valor === 'string') return valor.trim() || porDefecto
  if (typeof valor === 'number') return String(valor)
  return porDefecto
}

function ControlReproductivoPage() {
  const perfil = usePerfil()
  const consultaGeneral = consultaPermitida(perfil)
  const puedeRegistrar = registroPermitido(perfil)

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
  const [buscando, setBuscando] = useState(false)
  const [errorAnimales, setErrorAnimales] = useState('')
  const [animalAbierto, setAnimalAbierto] = useState(null)
  const [animalParaBorrador, setAnimalParaBorrador] = useState(null)
  const [recarga, setRecarga] = useState(0)
  const [avisoGuardado, setAvisoGuardado] = useState('')

  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA))

  useEffect(() => {
    if (!consultaGeneral) {
      setUnidades([])
      setUnidadId('todas')
      setErrorUnidades('')
      return
    }
    let activo = true
    async function cargarUnidades() {
      const { data, error } = await supabase.from('unidades_operativas')
        .select('id, nombre, codigo').order('nombre')
      if (!activo) return
      setUnidades(error ? [] : data || [])
      setErrorUnidades(error ? 'No fue posible consultar las unidades.' : '')
    }
    cargarUnidades()
    return () => { activo = false }
  }, [consultaGeneral])

  useEffect(() => {
    let activo = true
    async function consultarEventos() {
      setCargando(true)
      setErrorEventos('')

      // Filtrado y paginacion en el servidor. PostgreSQL mantiene el control RLS.
      let consulta = supabase.from('semoviente_eventos')
        .select(`
          id, semoviente_id, fecha_evento, titulo, detalle, tipo_evento,
          origen_modulo, datos_adicionales,
          semovientes!inner(id, codigo, especie, unidad_id)
        `, { count: 'exact' })
        .eq('tipo_evento', 'reproductivo')

      if (especie) consulta = consulta.eq('semovientes.especie', especie)
      if (codigoAplicado) consulta = consulta.eq('semovientes.codigo', codigoAplicado)
      if (consultaGeneral && unidadId !== 'todas') {
        consulta = consulta.eq('semovientes.unidad_id', Number(unidadId))
      }

      const inicio = (pagina - 1) * POR_PAGINA
      const { data, count, error } = await consulta
        .order('fecha_evento', { ascending: false })
        .order('id', { ascending: false })
        .range(inicio, inicio + POR_PAGINA - 1)

      if (!activo) return
      if (error) {
        console.error('RIO_BLANCO: error de consulta reproductiva:', error.code, error.message)
        setErrorEventos('No fue posible cargar los acontecimientos reproductivos. Revise la conexión o los permisos.')
        setEventos([])
        setTotal(0)
      } else {
        setEventos(data || [])
        setTotal(count ?? 0)
      }
      setCargando(false)
    }
    consultarEventos()
    return () => { activo = false }
  }, [especie, codigoAplicado, consultaGeneral, unidadId, pagina, recarga])

  useEffect(() => {
    if (!codigoAplicado) {
      setAnimales([])
      setBuscando(false)
      setErrorAnimales('')
      return
    }
    let activo = true
    async function consultarAnimal() {
      setBuscando(true)
      setErrorAnimales('')
      let consulta = supabase.from('semovientes')
        .select('id, codigo, especie, categoria, sexo, estado, unidad_id')
        .eq('codigo', codigoAplicado)
      if (especie) consulta = consulta.eq('especie', especie)
      if (consultaGeneral && unidadId !== 'todas') {
        consulta = consulta.eq('unidad_id', Number(unidadId))
      }
      const { data, error } = await consulta.order('id', { ascending: false }).limit(20)
      if (!activo) return
      setAnimales(error ? [] : data || [])
      setErrorAnimales(error ? 'No fue posible consultar los semovientes.' : '')
      setBuscando(false)
    }
    consultarAnimal()
    return () => { activo = false }
  }, [codigoAplicado, especie, consultaGeneral, unidadId, recarga])

  function buscar(e) {
    e.preventDefault()
    const limpio = codigo.trim().toUpperCase()
    if (limpio.length > 50) {
      setAvisoBusqueda('El código no debe superar los 50 caracteres.')
      return
    }
    setAvisoBusqueda('')
    setCodigoAplicado(limpio)
    setPagina(1)
    setRecarga(n => n + 1)
  }

  function limpiar() {
    setEspecie('')
    setUnidadId('todas')
    setCodigo('')
    setCodigoAplicado('')
    setPagina(1)
    setAvisoBusqueda('')
  }

  function nombreUnidad(id) {
    if (!consultaGeneral) return perfil?.unidad?.nombre || 'Unidad asignada'
    return unidades.find(u => String(u.id) === String(id))?.nombre || 'Unidad no disponible'
  }

  return (
    <main className="cr-pagina">
      <div className="cr-aviso">
        <strong>DEMOSTRACIÓN PÚBLICA</strong>
        <span>Utilice únicamente datos ficticios. Los registros almacenados en Supabase no se borran al reiniciar Vite.</span>
      </div>

      {avisoGuardado && (
        <p className="cr-info" role="status" style={{ background: '#e7f8ed', color: '#1c6843', border: '1px solid #abd8bd', padding: '12px 14px', borderRadius: 8 }}>
          {avisoGuardado}
        </p>
      )}
      <section className="cr-portada" aria-label="Presentación del módulo Control Reproductivo">
        <span className="cr-eyebrow">RIO_BLANCO · MÓDULO DE ACONTECIMIENTOS</span>
        <h1>Control reproductivo</h1>
        <p>Seguimiento de servicios, gestaciones, partos y nacimientos según la especie. Cada acontecimiento se vinculará con el código individual del animal.</p>
        <small>{consultaGeneral
          ? 'DEPARTAMENTO VII · CONSULTA INSTITUCIONAL'
          : `UNIDAD OPERATIVA ${perfil?.unidad?.nombre || 'ASIGNADA'}`}</small>
      </section>

      <section className="cr-panel" aria-labelledby="cr-buscar-titulo">
        <div className="cr-panel-cabecera">
          <div>
            <h2 id="cr-buscar-titulo">Buscar controles reproductivos</h2>
            <p>Seleccione una especie y, si conoce el código, busque el semoviente autorizado.</p>
          </div>
          <span className="cr-etiqueta-seguridad">Consulta protegida por RLS</span>
        </div>

        <form className="cr-filtros" onSubmit={buscar}>
          <div className="cr-campo">
            <label htmlFor="cr-especie">Especie ganadera</label>
            <select id="cr-especie" value={especie} onChange={e => { setEspecie(e.target.value); setPagina(1) }}>
              <option value="">Todas las especies</option>
              {ESPECIES.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
          </div>

          {consultaGeneral && (
            <div className="cr-campo">
              <label htmlFor="cr-unidad">Unidad operativa</label>
              <select id="cr-unidad" value={unidadId} onChange={e => { setUnidadId(e.target.value); setPagina(1) }}>
                <option value="todas">Todas las unidades</option>
                {unidades.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
              </select>
              {errorUnidades && <small className="cr-error" role="alert">{errorUnidades}</small>}
            </div>
          )}

          <div className="cr-campo cr-campo-codigo">
            <label htmlFor="cr-codigo">Código individual del animal</label>
            <input id="cr-codigo" type="search" placeholder="Ej.: 007 o RB-001"
              value={codigo} maxLength={50} onChange={e => setCodigo(e.target.value)} autoComplete="off" />
          </div>

          <div className="cr-acciones-filtros">
            <button type="submit" className="cr-boton-primario">Buscar</button>
            <button type="button" className="cr-boton-secundario" onClick={limpiar}>Limpiar</button>
          </div>
        </form>
        {avisoBusqueda && <p className="cr-error" role="alert">{avisoBusqueda}</p>}
      </section>

      {codigoAplicado && (
        <section className="cr-panel" aria-labelledby="cr-resultados-titulo">
          <div className="cr-panel-cabecera">
            <h2 id="cr-resultados-titulo">Semovientes encontrados con el código «{codigoAplicado}»</h2>
          </div>
          {buscando && <p className="cr-info" role="status">Buscando animales...</p>}
          {errorAnimales && <p className="cr-error" role="alert">{errorAnimales}</p>}
          {!buscando && !errorAnimales && animales.length === 0 && (
            <p className="cr-info">No se encontraron animales con ese código en las unidades autorizadas.</p>
          )}
          {!buscando && animales.length > 0 && (
            <div className="cr-animales">
              {animales.map(animal => (
                <div className="cr-animal" key={animal.id}>
                  <div>
                    <strong>{animal.codigo} · {especieTexto(animal.especie)}</strong>
                    <small>{texto(animal.categoria, 'Sin clase')} · {nombreUnidad(animal.unidad_id)} · {animal.estado}</small>
                  </div>
                  <div className="cr-animal-acciones">
                    <button type="button" className="cr-boton-secundario" onClick={() => setAnimalAbierto(animal.id)}>
                      Ver expediente
                    </button>
                    {puedeRegistrar && animal.estado === 'Activo' && (
                      <button type="button" className="cr-boton-primario cr-preparar-borrador" onClick={() => setAnimalParaBorrador(animal)}>
                        + Nuevo acontecimiento reproductivo
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="cr-panel" aria-labelledby="cr-historial-titulo">
        <div className="cr-panel-cabecera">
          <div>
            <h2 id="cr-historial-titulo">Historial de control reproductivo <span className="cr-contador">{total}</span></h2>
            <p>Registros reproductivos documentados en Supabase y visibles según el perfil institucional.</p>
          </div>
          <button className="cr-boton-secundario cr-refrescar" type="button" onClick={() => setRecarga(n => n + 1)} disabled={cargando}>
            Actualizar listado
          </button>
        </div>

        {cargando && <p className="cr-info" role="status">Consultando el historial reproductivo...</p>}
        {errorEventos && <p className="cr-error" role="alert">{errorEventos}</p>}

        <div className="cr-tabla-scroll" role="region" tabIndex={0} aria-label="Tabla de acontecimientos reproductivos, desplazable horizontalmente">
          <table className="cr-tabla">
            <thead><tr>
              <th>Fecha</th><th>Código</th><th>Especie</th>
              {consultaGeneral && <th>Unidad</th>}
              <th>Evento</th><th>Resultado</th><th>Reproductor</th><th>Cría</th><th>Ficha</th>
            </tr></thead>
            <tbody>
              {!cargando && !errorEventos && eventos.length === 0 && (
                <tr><td className="cr-sin-registros" colSpan={consultaGeneral ? 9 : 8}>
                  Todavía no existen acontecimientos reproductivos documentados que coincidan con los filtros.
                </td></tr>
              )}
              {!cargando && !errorEventos && eventos.map(evento => {
                const animal = evento.semovientes
                const datos = evento.datos_adicionales && typeof evento.datos_adicionales === 'object'
                  ? evento.datos_adicionales : {}
                return (
                  <tr key={evento.id}>
                    <td>{fechaBolivia(evento.fecha_evento)}</td>
                    <td><strong>{texto(animal?.codigo)}</strong></td>
                    <td>{especieTexto(animal?.especie)}</td>
                    {consultaGeneral && <td>{nombreUnidad(animal?.unidad_id)}</td>}
                    <td>{texto(datos.tipo_evento, texto(evento.titulo))}</td>
                    <td>{texto(datos.resultado, texto(evento.detalle))}</td>
                    <td>{texto(datos.reproductor_codigo_referencia)}</td>
                    <td>{texto(datos.crias_codigos_referencia, datos.cantidad_crias ? `${datos.cantidad_crias} cría(s) (referencia)` : '—')}</td>
                    <td><button type="button" className="cr-boton-secundario" onClick={() => setAnimalAbierto(evento.semoviente_id)}>Ver historial</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="cr-paginacion">
          <span>{total === 0 ? 'Sin acontecimientos registrados' : `Mostrando ${(pagina - 1) * POR_PAGINA + 1}–${Math.min(pagina * POR_PAGINA, total)} de ${total}`}</span>
          <div className="cr-pag-botones">
            <button type="button" disabled={pagina === 1 || cargando} onClick={() => setPagina(p => Math.max(1, p - 1))}>Anterior</button>
            <strong>Página {pagina} de {paginas}</strong>
            <button type="button" disabled={pagina >= paginas || cargando} onClick={() => setPagina(p => p + 1)}>Siguiente</button>
          </div>
        </div>
        <p className="cr-nota">Consulta protegida por RLS. Solo el personal con rol RESP_UNIDAD activo puede guardar acontecimientos de animales de su unidad. Los códigos de crías son referencias informativas y no crean animales ni vínculos de parentesco.</p>
      </section>

      <NuevoControlReproductivoModal
        animal={animalParaBorrador}
        unidad={animalParaBorrador ? nombreUnidad(animalParaBorrador.unidad_id) : ''}
        onCerrar={() => setAnimalParaBorrador(null)}
        onGuardado={(animalGuardado) => {
          setAnimalParaBorrador(null)
          setAvisoGuardado(`Acontecimiento reproductivo de prueba guardado para el animal ${animalGuardado.codigo}.`)
          setPagina(1)
          setRecarga(n => n + 1)
        }}
      />
      <ExpedienteHistorialModal animalId={animalAbierto} onCerrar={() => setAnimalAbierto(null)} />
    </main>
  )
}

export default ControlReproductivoPage

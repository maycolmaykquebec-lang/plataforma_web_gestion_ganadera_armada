import { consultaGeneral as consultaPermitida } from '../auth/permisos'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../services/supabaseClient'
import { usePerfil } from '../contexts/PerfilContext'
import ExpedienteHistorialModal from '../components/historial/ExpedienteHistorialModal'
import './HistorialIndividualPage.css'

const TAMANO_PAGINA = 12

// Opcional: al colocar fotografías propias en public/images/historial/,
// cambia imagen: null por imagen: '/images/historial/vacuno.jpg', etc.
const ESPECIES = [
  { id: 'bovino', nombre: 'Ganado vacuno', icono: '🐄', imagen: null },
  { id: 'equino', nombre: 'Ganado equino', icono: '🐎', imagen: null },
  { id: 'caprino', nombre: 'Ganado caprino', icono: '🐐', imagen: null },
  { id: 'mular', nombre: 'Ganado mular', icono: '🫏', imagen: null },
  { id: 'avicola', nombre: 'Ganado avícola', icono: '🐓', imagen: null },
  { id: 'porcino', nombre: 'Ganado porcino', icono: '🐖', imagen: null }
]


function HistorialIndividualPage() {
  const perfil = usePerfil()
  const consultaGeneral = consultaPermitida(perfil)

  const [especieId, setEspecieId] = useState('')
  const [codigo, setCodigo] = useState('')
  const [codigoAplicado, setCodigoAplicado] = useState('')
  const [unidadId, setUnidadId] = useState('todas')
  const [unidades, setUnidades] = useState([])
  const [errorUnidades, setErrorUnidades] = useState('')
  const [conteos, setConteos] = useState({})
  const [registros, setRegistros] = useState([])
  const [total, setTotal] = useState(0)
  const [pagina, setPagina] = useState(1)
  const [cargando, setCargando] = useState(true)
  const [errorConsulta, setErrorConsulta] = useState('')
  const [mensajeBusqueda, setMensajeBusqueda] = useState('')
  const [animalSeleccionado, setAnimalSeleccionado] = useState(null)

  const paginas = Math.max(1, Math.ceil(total / TAMANO_PAGINA))
  const especieElegida = useMemo(
    () => ESPECIES.find(item => item.id === especieId),
    [especieId]
  )

  // RLS protege estos datos: la unidad seleccionada es solo un filtro adicional.
  useEffect(() => {
    let activo = true

    async function cargarUnidades() {
      if (!consultaGeneral) {
        setUnidades([])
        setUnidadId('todas')
        return
      }

      const { data, error } = await supabase
        .from('unidades_operativas')
        .select('id, codigo, nombre')
        .order('nombre')

      if (!activo) return
      if (error) {
        setErrorUnidades('No se pudieron consultar las unidades operativas.')
        setUnidades([])
      } else {
        setUnidades(data || [])
        setErrorUnidades('')
      }
    }

    cargarUnidades()
    return () => { activo = false }
  }, [consultaGeneral])

  useEffect(() => {
    let activo = true

    async function cargarConteos() {
      const resultados = await Promise.all(
        ESPECIES.map(async (especie) => {
          let consulta = supabase
            .from('semovientes')
            .select('id', { head: true, count: 'exact' })
            .eq('especie', especie.id)

          if (consultaGeneral && unidadId !== 'todas') {
            consulta = consulta.eq('unidad_id', Number(unidadId))
          }
          const { count, error } = await consulta
          return { especie: especie.id, count: error ? null : count }
        })
      )

      if (!activo) return
      const nuevosConteos = {}
      for (const resultado of resultados) {
        nuevosConteos[resultado.especie] = resultado.count
      }
      setConteos(nuevosConteos)
    }

    cargarConteos()
    return () => { activo = false }
  }, [consultaGeneral, unidadId])

  useEffect(() => {
    let activo = true

    async function cargarAnimales() {
      setCargando(true)
      setErrorConsulta('')

      let consulta = supabase
        .from('semovientes')
        .select('id, codigo, especie, categoria, sexo, raza, estado, unidad_id, created_at', {
          count: 'exact'
        })

      if (especieId) consulta = consulta.eq('especie', especieId)
      if (codigoAplicado) consulta = consulta.eq('codigo', codigoAplicado)
      if (consultaGeneral && unidadId !== 'todas') {
        consulta = consulta.eq('unidad_id', Number(unidadId))
      }

      const desde = (pagina - 1) * TAMANO_PAGINA
      const { data, count, error } = await consulta
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(desde, desde + TAMANO_PAGINA - 1)

      if (!activo) return
      if (error) {
        console.error('RIO_BLANCO: error al consultar historial:', error.code, error.message)
        setErrorConsulta('No se pudo consultar el listado autorizado de semovientes.')
        setRegistros([])
        setTotal(0)
      } else {
        setRegistros(data || [])
        setTotal(count ?? 0)
      }
      setCargando(false)
    }

    cargarAnimales()
    return () => { activo = false }
  }, [especieId, codigoAplicado, unidadId, consultaGeneral, pagina])

  function cambiarEspecie(id) {
    setEspecieId(id)
    setCodigo('')
    setCodigoAplicado('')
    setMensajeBusqueda('')
    setPagina(1)
  }

  function buscarHistorial(evento) {
    evento.preventDefault()
    const limpio = codigo.trim().toUpperCase()

    if (!especieId || !limpio) {
      setMensajeBusqueda('Seleccione una especie y escriba el código exacto del animal.')
      return
    }

    if (limpio.length > 50) {
      setMensajeBusqueda('El código no puede superar los 50 caracteres.')
      return
    }

    setMensajeBusqueda('')
    setCodigoAplicado(limpio)
    setPagina(1)
  }

  function limpiarBusqueda() {
    setEspecieId('')
    setCodigo('')
    setCodigoAplicado('')
    setUnidadId('todas')
    setMensajeBusqueda('')
    setPagina(1)
  }

  function nombreUnidad(id) {
    if (!consultaGeneral) return perfil?.unidad?.nombre || 'Unidad asignada'
    return unidades.find(u => String(u.id) === String(id))?.nombre || `Unidad #${id}`
  }

  const habilitarUnidad = consultaGeneral && !errorUnidades

  return (
    <main className="hi-pagina">
      <div className="hi-aviso">
        <strong>DEMOSTRACIÓN PÚBLICA</strong>
        <span>Utilizar únicamente datos ficticios durante el desarrollo de RIO_BLANCO. Los registros guardados en Supabase no se borran al reiniciar Vite.</span>
      </div>

      <section className="hi-portada" aria-label="Presentación del historial individual">
        <span className="hi-sobretitulo">CONSULTA Y TRAZABILIDAD INDIVIDUAL</span>
        <h1>Historial individual del semoviente</h1>
        <p>1. Elija la especie. 2. Busque por código. 3. Consulte la ficha y los acontecimientos registrados.</p>
        <small>{consultaGeneral ? 'DEPARTAMENTO VII · CONSULTA INSTITUCIONAL' : `UNIDAD OPERATIVA ${perfil?.unidad?.nombre || 'ASIGNADA'}`}</small>
      </section>

      <section className="hi-seleccion" aria-labelledby="hi-seleccionar">
        <div className="hi-seccion-titulo">
          <h2 id="hi-seleccionar">1. Seleccione una especie</h2>
          {especieId && <button type="button" className="hi-enlace" onClick={() => cambiarEspecie('')}>Mostrar todas</button>}
        </div>
        <div className="hi-grid-especies">
          {ESPECIES.map(especie => (
            <button
              key={especie.id}
              type="button"
              aria-pressed={especieId === especie.id}
              className={`hi-tarjeta ${especieId === especie.id ? 'seleccionada' : ''}`}
              onClick={() => cambiarEspecie(especie.id)}
              style={especie.imagen ? { backgroundImage: `linear-gradient(90deg, rgba(6,24,48,.83), rgba(6,24,48,.2)), url("${especie.imagen}")` } : undefined}
            >
              <span className="hi-especie-nombre"><span aria-hidden="true">{especie.icono}</span> {especie.nombre}</span>
              <span className="hi-cantidad">{conteos[especie.id] == null ? '— registros' : `${conteos[especie.id]} ${conteos[especie.id] === 1 ? 'registrado' : 'registrados'}`}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="hi-panel" aria-labelledby="hi-buscar">
        <h2 id="hi-buscar">2. Consultar por número o código de identificación</h2>
        <p>Seleccione la especie, escriba el código exacto y pulse «Buscar historial».</p>
        <form className="hi-formulario" onSubmit={buscarHistorial}>
          <div className="hi-campo">
            <label htmlFor="hi-especie">Especie *</label>
            <select id="hi-especie" value={especieId} onChange={e => cambiarEspecie(e.target.value)}>
              <option value="">Seleccione especie</option>
              {ESPECIES.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
          </div>

          {consultaGeneral && (
            <div className="hi-campo">
              <label htmlFor="hi-unidad">Unidad operativa</label>
              <select
                id="hi-unidad"
                value={unidadId}
                disabled={!habilitarUnidad}
                onChange={e => { setUnidadId(e.target.value); setPagina(1) }}
              >
                <option value="todas">Todas las unidades</option>
                {unidades.map(unidad => <option key={unidad.id} value={unidad.id}>{unidad.nombre}</option>)}
              </select>
            </div>
          )}

          <div className="hi-campo">
            <label htmlFor="hi-codigo">Código o N.º de registro *</label>
            <input
              id="hi-codigo"
              type="text"
              placeholder="Ej.: 007 o RB-001"
              maxLength={50}
              value={codigo}
              onChange={e => setCodigo(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="hi-botones-busqueda">
            <button type="submit" className="hi-boton-primario">Buscar historial</button>
            <button type="button" className="hi-boton-secundario" onClick={limpiarBusqueda}>Limpiar</button>
          </div>
        </form>
        {mensajeBusqueda && <p className="hi-mensaje" role="alert">{mensajeBusqueda}</p>}
        {errorUnidades && <p className="hi-mensaje" role="alert">{errorUnidades}</p>}
      </section>

      <section className="hi-panel" aria-labelledby="hi-listado">
        <div className="hi-cabecera-lista">
          <h2 id="hi-listado">Todos los semovientes registrados <span className="hi-contador">{total}</span></h2>
          <span>{especieElegida?.nombre || 'Todas las especies'}{codigoAplicado ? ` · Código ${codigoAplicado}` : ''}</span>
        </div>
        {cargando && <p role="status" className="hi-estado-consulta">Consultando registros...</p>}
        {errorConsulta && <p role="alert" className="hi-mensaje">{errorConsulta}</p>}
        <div className="hi-tabla-wrap">
          <table className="hi-tabla">
            <thead>
              <tr>
                <th>N.º</th>
                <th>Código</th>
                <th>Especie</th>
                {consultaGeneral && <th>Unidad</th>}
                <th>Clase</th>
                <th>Sexo</th>
                <th>Raza</th>
                <th>Estado</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {!cargando && !errorConsulta && registros.length === 0 && (
                <tr><td colSpan={consultaGeneral ? 9 : 8} className="hi-vacio">No existen semovientes que coincidan con esta consulta.</td></tr>
              )}
              {!cargando && !errorConsulta && registros.map((animal, indice) => (
                <tr key={animal.id}>
                  <td>{(pagina - 1) * TAMANO_PAGINA + indice + 1}</td>
                  <td><strong>{animal.codigo}</strong></td>
                  <td>{ESPECIES.find(e => e.id === animal.especie)?.nombre || animal.especie}</td>
                  {consultaGeneral && <td>{nombreUnidad(animal.unidad_id)}</td>}
                  <td>{animal.categoria || '—'}</td>
                  <td>{animal.sexo}</td>
                  <td>{animal.raza || '—'}</td>
                  <td><span className={`hi-estado ${animal.estado === 'Activo' ? 'activo' : 'baja'}`}>{animal.estado}</span></td>
                  <td><button type="button" className="hi-ver" onClick={() => setAnimalSeleccionado(animal.id)}>Ver historial</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="hi-paginacion">
          <span>{total ? `Mostrando ${(pagina - 1) * TAMANO_PAGINA + 1}–${Math.min(pagina * TAMANO_PAGINA, total)} de ${total}` : 'Sin registros'}</span>
          <div>
            <button type="button" disabled={pagina <= 1 || cargando} onClick={() => setPagina(p => Math.max(1, p - 1))}>Anterior</button>
            <span>Página {pagina} de {paginas}</span>
            <button type="button" disabled={pagina >= paginas || cargando} onClick={() => setPagina(p => p + 1)}>Siguiente</button>
          </div>
        </div>
      </section>

      <ExpedienteHistorialModal animalId={animalSeleccionado} onCerrar={() => setAnimalSeleccionado(null)} />
    </main>
  )
}

export default HistorialIndividualPage

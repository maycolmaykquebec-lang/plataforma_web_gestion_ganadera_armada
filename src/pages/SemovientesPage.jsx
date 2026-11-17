import { puedeRegistrar as registroPermitido, consultaGeneral as consultaPermitida } from '../auth/permisos'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabaseClient'
import { usePerfil } from '../contexts/PerfilContext'
import NuevoSemovienteModal from '../components/semovientes/NuevoSemovienteModal'
import FichaSemovienteModal from '../components/semovientes/FichaSemovienteModal'
import './SemovientesPage.css'

const TAMANO_PAGINA = 25

const especies = [
  {
    id: 'bovino', nombre: 'Ganado vacuno', icono: '🐄',
    clases: ['Ternero','Ternera','Torillo','Vaquilla','Toro','Vaca','Novillo']
  },
  {
    id: 'equino', nombre: 'Ganado equino', icono: '🐎',
    clases: ['Potro','Potranca','Caballo','Yegua']
  },
  {
    id: 'caprino', nombre: 'Ganado caprino', icono: '🐐',
    clases: ['Cabrito','Cabrita','Macho','Cabra']
  },
  {
    id: 'mular', nombre: 'Ganado mular', icono: '🫏',
    clases: ['Cría','Macho','Hembra']
  },
  {
    id: 'avicola', nombre: 'Ganado avícola', icono: '🐓',
    clases: ['Pollito','Pollita','Gallo','Gallina']
  },
  {
    id: 'porcino', nombre: 'Ganado porcino', icono: '🐖',
    clases: ['Lechón','Lechona','Verraco','Cerda']
  }
]


function fecha(valor) {
  if (!valor) return '—'
  const partes = valor.split('-')
  if (partes.length !== 3) return valor
  return `${partes[2]}/${partes[1]}/${partes[0]}`
}

function SemovientesPage() {
  const navigate = useNavigate()
  const perfil = usePerfil()

  const rol = perfil?.rol?.codigo || ''
  const supervisor = rol === 'SUP_DEPTO_VII'
  const consultaGeneral = consultaPermitida(perfil)
  const puedeRegistrar = registroPermitido(perfil)

  const [especieId, setEspecieId] = useState('bovino')
  const [clase, setClase] = useState('Todos')
  const [estado, setEstado] = useState('Todos')

  const [busqueda, setBusqueda] = useState('')
  const [busquedaAplicada, setBusquedaAplicada] = useState('')

  const [unidades, setUnidades] = useState([])
  const [unidadId, setUnidadId] = useState('todas')
  const [errorUnidades, setErrorUnidades] = useState('')

  const [registros, setRegistros] = useState([])
  const [total, setTotal] = useState(0)
  const [pagina, setPagina] = useState(1)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [recarga, setRecarga] = useState(0)

  const [modalAbierto, setModalAbierto] = useState(false)
  const [animalSeleccionado, setAnimalSeleccionado] = useState(null)

  const especie = especies.find(e => e.id === especieId)
  const paginasTotales = Math.max(
    1,
    Math.ceil(total / TAMANO_PAGINA)
  )

  useEffect(() => {
    let activo = true

    async function cargarUnidades() {
      if (!consultaGeneral) return

      const { data, error: errorConsulta } = await supabase
        .from('unidades_operativas')
        .select('id, nombre, codigo')
        .order('nombre')

      if (!activo) return

      if (errorConsulta) {
        setErrorUnidades('No se pudieron cargar las unidades.')
        return
      }

      setUnidades(data || [])
      setErrorUnidades('')
    }

    cargarUnidades()

    return () => { activo = false }
  }, [consultaGeneral])

  useEffect(() => {
    let activo = true

    async function cargarRegistros() {
      setCargando(true)
      setError('')

      let consulta = supabase
        .from('semovientes')
        .select(`
          id, codigo, especie, categoria, raza,
          sexo, fecha_nacimiento, procedencia,
          estado, unidad_id, created_at
        `, { count: 'exact' })
        .eq('especie', especieId)

      if (clase !== 'Todos') {
        consulta = consulta.eq('categoria', clase)
      }

      if (estado !== 'Todos') {
        consulta = consulta.eq('estado', estado)
      }

      if (consultaGeneral && unidadId !== 'todas') {
        consulta = consulta.eq('unidad_id', Number(unidadId))
      }

      // Limitar caracteres especiales del lenguaje de filtros
      // de PostgREST para una búsqueda textual controlada.
      const termino = busquedaAplicada
        .replace(/[^\p{L}\p{N}\s-]/gu, '')
        .trim()
        .slice(0, 80)

      if (termino) {
        consulta = consulta.or(
          `codigo.ilike.%${termino}%,` +
          `raza.ilike.%${termino}%,` +
          `procedencia.ilike.%${termino}%`
        )
      }

      const desde = (pagina - 1) * TAMANO_PAGINA
      const hasta = desde + TAMANO_PAGINA - 1

      const { data, count, error: errorConsulta } = await consulta
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(desde, hasta)

      if (!activo) return

      if (errorConsulta) {
        console.error('Error consulta RIO_BLANCO:', errorConsulta.message)
        setError('No se pudieron cargar los registros.')
        setRegistros([])
        setTotal(0)
      } else {
        setRegistros(data || [])
        setTotal(count ?? 0)
      }

      setCargando(false)
    }

    cargarRegistros()

    return () => { activo = false }
  }, [
    especieId, clase, estado, busquedaAplicada,
    unidadId, consultaGeneral, pagina, recarga
  ])

  function seleccionarEspecie(id) {
    setEspecieId(id)
    setClase('Todos')
    setEstado('Todos')
    setBusqueda('')
    setBusquedaAplicada('')
    setPagina(1)
  }

  function limpiarFiltros() {
    setClase('Todos')
    setEstado('Todos')
    setBusqueda('')
    setBusquedaAplicada('')
    setUnidadId('todas')
    setPagina(1)
  }

  function buscar(evento) {
    evento.preventDefault()
    setPagina(1)
    setBusquedaAplicada(busqueda.trim())
  }

  function nombreUnidad(id) {
    if (!consultaGeneral) {
      return perfil?.unidad?.nombre || 'No disponible'
    }

    return unidades.find(u => String(u.id) === String(id))
      ?.nombre || 'No disponible'
  }

  const dependencia = supervisor
    ? 'Departamento VII · Supervisión general'
    : perfil?.unidad?.nombre
      ? `Unidad Operativa ${perfil.unidad.nombre}`
      : 'División "B" Producción'

  return (
    <div className="rio_blanco-registro-page">
      <div className="rio_blanco-registro-aviso">
        <strong>DEMOSTRACIÓN PÚBLICA</strong>
        <span>
          Utilizar únicamente datos ficticios durante el desarrollo de RIO_BLANCO.
        </span>
      </div>

      <section className="rio_blanco-registro-banner">
        <div className="rio_blanco-registro-banner-content">
          <button
            type="button"
            className="rio_blanco-volver"
            onClick={() => navigate('/dashboard')}
          >
            ← Todas las especies
          </button>

          <span className="rio_blanco-registro-etiqueta">
            ARMADA BOLIVIANA · CLASIFICACIÓN GANADERA
          </span>

          <div className="rio_blanco-registro-titulo">
            <span aria-hidden="true">{especie.icono}</span>
            <h1>{especie.nombre}</h1>
          </div>

          <p className="rio_blanco-registro-dependencia">
            {dependencia}
          </p>

          <p className="rio_blanco-registro-descripcion">
            Seleccione una clase, consulte los registros
            o realice una búsqueda avanzada.
          </p>

          <div className="rio_blanco-clases">
            {['Todos', ...especie.clases].map(item => (
              <button
                key={item}
                type="button"
                className={clase === item ? 'activo' : ''}
                onClick={() => {
                  setClase(item)
                  setPagina(1)
                }}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        {puedeRegistrar && (
          <button
            type="button"
            className="rio_blanco-registro-nuevo"
            onClick={() => setModalAbierto(true)}
          >
            + Nuevo registro
          </button>
        )}
      </section>

      <form className="rio_blanco-registro-filtros" onSubmit={buscar}>
        <div className="rio_blanco-registro-campo">
          <label htmlFor="filtro-especie">Especie ganadera</label>
          <select
            id="filtro-especie"
            value={especieId}
            onChange={e => seleccionarEspecie(e.target.value)}
          >
            {especies.map(item => (
              <option key={item.id} value={item.id}>
                {item.nombre}
              </option>
            ))}
          </select>
        </div>

        {consultaGeneral && (
          <div className="rio_blanco-registro-campo">
            <label htmlFor="filtro-unidad">Unidad operativa</label>
            <select
              id="filtro-unidad"
              value={unidadId}
              onChange={e => {
                setUnidadId(e.target.value)
                setPagina(1)
              }}
            >
              <option value="todas">Todas las unidades</option>
              {unidades.map(u => (
                <option key={u.id} value={u.id}>
                  {u.nombre}
                </option>
              ))}
            </select>
            {errorUnidades && (
              <small role="alert">{errorUnidades}</small>
            )}
          </div>
        )}

        <div className="rio_blanco-registro-campo">
          <label htmlFor="buscar-animal">Buscar animal</label>
          <input
            id="buscar-animal"
            type="search"
            placeholder="Código, raza o procedencia"
            value={busqueda}
            maxLength={80}
            onChange={e => setBusqueda(e.target.value)}
          />
        </div>

        <div className="rio_blanco-registro-campo">
          <label htmlFor="filtro-estado">Estado</label>
          <select
            id="filtro-estado"
            value={estado}
            onChange={e => {
              setEstado(e.target.value)
              setPagina(1)
            }}
          >
            <option value="Todos">Todos</option>
            <option value="Activo">Activo</option>
            <option value="Baja">Baja</option>
          </select>
        </div>

        <div className="rio_blanco-registro-campo">
          <label htmlFor="filtro-clase">Clase</label>
          <select
            id="filtro-clase"
            value={clase}
            onChange={e => {
              setClase(e.target.value)
              setPagina(1)
            }}
          >
            <option value="Todos">Todas</option>
            {especie.clases.map(item => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>

        <div className="rio_blanco-filtros-acciones">
          <button type="submit" className="rio_blanco-filtrar">
            Buscar
          </button>
          <button type="button" onClick={limpiarFiltros}>
            Limpiar
          </button>
        </div>
      </form>

      <section className="rio_blanco-registro-listado">
        <div className="rio_blanco-registro-listado-header">
          <h2>Listado de {especie.nombre.toLowerCase()}</h2>
          <span>Total encontrado: {total}</span>
        </div>

        {cargando && (
          <p role="status">Cargando semovientes...</p>
        )}

        {error && <p role="alert" className="rio_blanco-error">{error}</p>}

        <div className="rio_blanco-registro-tabla-contenedor">
          <table className="rio_blanco-registro-tabla">
            <thead>
              <tr>
                <th>Código</th>
                {consultaGeneral && <th>Unidad</th>}
                <th>Clase</th>
                <th>Raza</th>
                <th>Sexo</th>
                <th>Nacimiento</th>
                <th>Procedencia</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>

            <tbody>
              {!cargando && !error && registros.length === 0 && (
                <tr>
                  <td
                    colSpan={consultaGeneral ? 9 : 8}
                    className="rio_blanco-sin-registros"
                  >
                    No existen animales que coincidan con los filtros.
                  </td>
                </tr>
              )}

              {!cargando && !error && registros.map(animal => (
                <tr key={animal.id}>
                  <td><strong>{animal.codigo}</strong></td>

                  {consultaGeneral && (
                    <td>{nombreUnidad(animal.unidad_id)}</td>
                  )}

                  <td>{animal.categoria}</td>
                  <td>{animal.raza || '—'}</td>
                  <td>{animal.sexo}</td>
                  <td>{fecha(animal.fecha_nacimiento)}</td>
                  <td>{animal.procedencia || '—'}</td>

                  <td>
                    <span className={
                      animal.estado === 'Activo'
                        ? 'rio_blanco-estado activo'
                        : 'rio_blanco-estado baja'
                    }>
                      {animal.estado}
                    </span>
                  </td>

                  <td>
                    <button
                      type="button"
                      className="rio_blanco-ver-ficha"
                      onClick={() => setAnimalSeleccionado(animal.id)}
                    >
                      Ver ficha
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rio_blanco-paginacion">
          <span>
            {total === 0
              ? 'Sin registros'
              : `Mostrando ${(pagina - 1) * TAMANO_PAGINA + 1}–${Math.min(pagina * TAMANO_PAGINA, total)} de ${total}`}
          </span>

          <div className="rio_blanco-paginacion-botones">
            <button
              type="button"
              disabled={pagina === 1 || cargando}
              onClick={() => setPagina(1)}
            >
              Primera
            </button>

            <button
              type="button"
              disabled={pagina === 1 || cargando}
              onClick={() => setPagina(p => Math.max(1, p - 1))}
            >
              Anterior
            </button>

            <strong>Página {pagina} de {paginasTotales}</strong>

            <button
              type="button"
              disabled={pagina >= paginasTotales || cargando}
              onClick={() => setPagina(p => p + 1)}
            >
              Siguiente
            </button>

            <button
              type="button"
              disabled={pagina >= paginasTotales || cargando}
              onClick={() => setPagina(paginasTotales)}
            >
              Última
            </button>
          </div>
        </div>
      </section>

      {puedeRegistrar && (
        <NuevoSemovienteModal
          abierto={modalAbierto}
          especie={especieId}
          unidad={perfil?.unidad?.nombre || 'No asignada'}
          onCerrar={() => setModalAbierto(false)}
          onGuardado={() => {
            setModalAbierto(false)
            setPagina(1)
            setRecarga(n => n + 1)
          }}
        />
      )}

      <FichaSemovienteModal
        animalId={animalSeleccionado}
        onCerrar={() => setAnimalSeleccionado(null)}
      />
    </div>
  )
}

export default SemovientesPage

import { useEffect, useMemo, useState } from 'react'
import { consultaGeneral } from '../auth/permisos'
import { usePerfil } from '../contexts/PerfilContext'
import { supabase } from '../services/supabaseClient'
import PerfilHistorialSemoviente from '../components/historial/PerfilHistorialSemoviente'
import './HistorialIndividualPage.css'

const POR_PAGINA = 15
const ESPECIES = [
  ['bovino', 'Ganado vacuno'], ['equino', 'Ganado equino'],
  ['caprino', 'Ganado caprino'], ['mular', 'Ganado mular'],
  ['avicola', 'Ganado avícola'], ['porcino', 'Ganado porcino'],
]
const IMAGENES = Object.fromEntries(ESPECIES.map(([id]) => [id, `/images/semovientes/${id}.jpg`]))

/** Normaliza términos sin permitir operadores especiales en la sintaxis PostgREST. */
export function limpiarCodigoHistorial(valor) {
  return String(valor ?? '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 60)
}

export default function HistorialIndividualPage() {
  const perfil = usePerfil()
  const general = consultaGeneral(perfil)
  const [especie, setEspecie] = useState('todas')
  const [unidad, setUnidad] = useState('todas')
  const [unidades, setUnidades] = useState([])
  const [codigo, setCodigo] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [pagina, setPagina] = useState(1)
  const [total, setTotal] = useState(0)
  const [animales, setAnimales] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [seleccionado, setSeleccionado] = useState(null)
  const [recarga, setRecarga] = useState(0)
  const [conteos, setConteos] = useState({})

  useEffect(() => {
    if (!general) return
    let vivo = true
    supabase.from('unidades_operativas').select('id,nombre,codigo').order('nombre')
      .then(({ data, error: fallo }) => {
        if (!vivo) return
        setUnidades(fallo ? [] : data || [])
      })
    return () => { vivo = false }
  }, [general])

  useEffect(() => {
    let vivo = true
    async function consultar() {
      setCargando(true)
      setError('')
      let q = supabase.from('semovientes')
        .select('id,codigo,codigo_activo,especie,sexo,categoria,raza,estado,unidad_id,fecha_nacimiento,created_at', { count: 'exact' })
      if (especie !== 'todas') q = q.eq('especie', especie)
      if (general && unidad !== 'todas') q = q.eq('unidad_id', Number(unidad))
      if (busqueda) q = q.or(`codigo.eq.${busqueda},codigo_activo.eq.${busqueda}`)
      const desde = (pagina - 1) * POR_PAGINA
      const { data, count, error: fallo } = await q.order('created_at', { ascending: false })
        .order('id', { ascending: false }).range(desde, desde + POR_PAGINA - 1)
      if (!vivo) return
      if (fallo) {
        setError('No fue posible consultar los semovientes. Verifique su conexión y permisos.')
        setAnimales([])
        setTotal(0)
      } else {
        setAnimales(data || [])
        setTotal(count ?? 0)
      }
      setCargando(false)
    }
    consultar()
    return () => { vivo = false }
  }, [especie, unidad, general, busqueda, pagina, recarga])

  useEffect(() => {
    let vivo = true
    Promise.all(ESPECIES.map(async ([id]) => {
      let q = supabase.from('semovientes').select('id', { count: 'exact', head: true }).eq('especie', id)
      if (general && unidad !== 'todas') q = q.eq('unidad_id', Number(unidad))
      const { count, error } = await q
      return [id, error ? null : count]
    })).then(resultados => { if (vivo) setConteos(Object.fromEntries(resultados)) })
    return () => { vivo = false }
  }, [general, unidad, recarga])

  const nombresUnidades = useMemo(() => Object.fromEntries(unidades.map(u => [u.id, u.nombre])), [unidades])
  const nombreUnidad = id => nombresUnidades[id] || (String(id) === String(perfil?.unidad?.id) ? perfil?.unidad?.nombre : `Unidad ${id}`)
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA))
  const nombreEspecie = id => ESPECIES.find(([clave]) => clave === id)?.[1] || id

  function buscar(evento) {
    evento.preventDefault()
    const limpio = limpiarCodigoHistorial(codigo)
    if (codigo.trim() && !limpio) { setError('Utilice letras, números o guiones para buscar.'); return }
    setError('')
    setBusqueda(limpio)
    setPagina(1)
  }

  function limpiar() {
    setCodigo(''); setBusqueda(''); setEspecie('todas'); setUnidad('todas'); setPagina(1); setError('')
  }

  if (seleccionado != null) {
    return <PerfilHistorialSemoviente animalId={seleccionado} onVolver={() => setSeleccionado(null)} />
  }

  return <main className="hi-pagina">
    <header className="hi-portada">
      <div>
        <small>ARMADA BOLIVIANA · GESTIÓN DE SEMOVIENTES</small>
        <h1>Historial Individual del Semoviente</h1>
        <p>Consulte la ficha, fotografías, antecedentes y acontecimientos de cada animal.</p>
      </div>
      <span className="hi-solo-lectura">Consulta institucional</span>
    </header>

    <section className="hi-panel" aria-label="Filtros de búsqueda">
      <div className="hi-encabezado"><h2>Buscar un semoviente</h2><button type="button" onClick={limpiar} className="hi-boton-secundario">Limpiar filtros</button></div>
      <form onSubmit={buscar} className="hi-formulario">
        {general && <label>Unidad operativa
          <select value={unidad} onChange={e => { setUnidad(e.target.value); setPagina(1) }}>
            <option value="todas">Todas las unidades</option>
            {unidades.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
        </label>}
        {!general && <label>Unidad operativa<input readOnly value={perfil?.unidad?.nombre || 'Unidad asignada'} /></label>}
        <label>Especie
          <select value={especie} onChange={e => { setEspecie(e.target.value); setPagina(1) }}>
            <option value="todas">Todas las especies</option>
            {ESPECIES.map(([id, nombre]) => <option value={id} key={id}>{nombre}</option>)}
          </select>
        </label>
        <label>Código individual o Código del Activo
          <input value={codigo} maxLength={60} placeholder="Ej.: 001 o UOSPGM-86-WI-001" onChange={e => setCodigo(e.target.value)} />
        </label>
        <button className="hi-boton-primario" type="submit">Buscar historial</button>
      </form>
      <p className="hi-ayuda">También puede seleccionar un animal directamente del listado. Se muestran únicamente registros permitidos por Supabase.</p>
      {error && <p role="alert" className="hi-error">{error}</p>}
    </section>

    <section className="hi-panel">
      <div className="hi-encabezado"><h2>Especies registradas</h2><span className="hi-resumen">Seleccione una especie para filtrar</span></div>
      <div className="hi-especies">
        {ESPECIES.map(([id, nombre]) => <button key={id} type="button" className={`hi-especie ${especie === id ? 'hi-especie-activa' : ''}`} onClick={() => { setEspecie(especie === id ? 'todas' : id); setPagina(1) }}>
          <img src={IMAGENES[id]} alt="" loading="lazy" />
          <span><strong>{nombre}</strong><small>{conteos[id] ?? '—'} registrados</small></span>
        </button>)}
      </div>
    </section>

    <section className="hi-panel">
      <div className="hi-encabezado"><h2>Listado de semovientes <span className="hi-numero">{total}</span></h2><button className="hi-boton-secundario" type="button" disabled={cargando} onClick={() => setRecarga(v => v + 1)}>Actualizar</button></div>
      {cargando && <p role="status" className="hi-ayuda">Consultando historial…</p>}
      <div className="hi-tabla-wrap"><table className="hi-tabla"><thead><tr><th>Código</th><th>Código del Activo</th><th>Especie</th><th>Unidad</th><th>Sexo</th><th>Clase</th><th>Estado</th><th>Expediente</th></tr></thead>
        <tbody>{!cargando && animales.length === 0 && <tr><td colSpan="8" className="hi-sin-datos">No se encontraron semovientes para estos filtros.</td></tr>}
          {animales.map(a => <tr key={a.id}><td><strong>{a.codigo}</strong></td><td>{a.codigo_activo || '—'}</td><td>{nombreEspecie(a.especie)}</td><td>{nombreUnidad(a.unidad_id)}</td><td>{a.sexo}</td><td>{a.categoria || '—'}</td><td><span className={`hi-estado ${a.estado === 'Activo' ? 'activo' : 'baja'}`}>{a.estado}</span></td><td><button type="button" className="hi-ver" onClick={() => setSeleccionado(a.id)}>Ver expediente</button></td></tr>)}
        </tbody></table></div>
      <div className="hi-paginacion"><span>{total} registros · Página {pagina} de {paginas}</span><div><button type="button" disabled={pagina === 1 || cargando} onClick={() => setPagina(p => p - 1)}>Anterior</button><button type="button" disabled={pagina >= paginas || cargando} onClick={() => setPagina(p => p + 1)}>Siguiente</button></div></div>
    </section>
  </main>
}

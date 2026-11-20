import { useEffect, useMemo, useState } from 'react'
import { consultaGeneral, perfilValido } from '../auth/permisos'
import { usePerfil } from '../contexts/PerfilContext'
import ExpedienteHistorialModal from '../components/historial/ExpedienteHistorialModal'
import { supabase } from '../services/supabaseClient'
import { exportarConsultaDescarte } from '../services/exportarConsultaDescarte'
import {
  CRITERIOS_DESCARTE, ESPECIES_DESCARTE, ESPECIES_ELEGIBLES,
  clasificarPorEdad, criterioPara, filtroServidorPorEdad, formatoFechaCorta,
  hoyEnBolivia, limpiarCodigoBusqueda,
} from '../utils/criteriosDescarte'
import './EvaluacionDescartePage.css'

const POR_PAGINA = 25
const LOTE_EXPORTACION = 500
const MAX_EXPORTACION = 20000
const CAMPOS = 'id,codigo,codigo_activo,unidad_id,especie,sexo,categoria,raza,fecha_nacimiento,estado'

export default function EvaluacionDescartePage() {
  const perfil = usePerfil()
  const general = consultaGeneral(perfil)
  const autorizado = perfilValido(perfil)
  const unidadAsignada = perfil?.unidad?.id

  const [unidades, setUnidades] = useState([])
  const [errorUnidades, setErrorUnidades] = useState('')
  const [unidadSeleccionada, setUnidadSeleccionada] = useState('todas')
  const [especie, setEspecie] = useState('todas')
  const [sexo, setSexo] = useState('todos')
  const [codigo, setCodigo] = useState('')
  const [codigoAplicado, setCodigoAplicado] = useState('')
  const [pestana, setPestana] = useState('elegibles')
  const [pagina, setPagina] = useState(1)
  const [fechaConsulta, setFechaConsulta] = useState(() => hoyEnBolivia())
  const [recarga, setRecarga] = useState(0)
  const [registros, setRegistros] = useState([])
  const [total, setTotal] = useState(0)
  const [totales, setTotales] = useState({ machos: 0, hembras: 0, sinFecha: 0 })
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [errorExportacion, setErrorExportacion] = useState('')
  const [exportando, setExportando] = useState(false)
  const [animalAbierto, setAnimalAbierto] = useState(null)

  const unidadesPorId = useMemo(() => {
    const mapa = {}
    for (const u of unidades) mapa[String(u.id)] = u.nombre
    if (unidadAsignada && perfil?.unidad?.nombre) {
      mapa[String(unidadAsignada)] = perfil.unidad.nombre
    }
    return mapa
  }, [unidades, unidadAsignada, perfil?.unidad?.nombre])

  useEffect(() => {
    let vigente = true
    if (!autorizado || !general) {
      setUnidades([])
      return () => { vigente = false }
    }
    async function cargarUnidades() {
      const { data, error: fallo } = await supabase.from('unidades_operativas')
        .select('id,codigo,nombre').in('codigo', ['RIO-BLANCO', 'MAMORE', 'TAMARINERO']).order('nombre')
      if (!vigente) return
      if (fallo) { setUnidades([]); setErrorUnidades('No se cargaron los nombres de las unidades.') }
      else { setUnidades(data || []); setErrorUnidades('') }
    }
    cargarUnidades()
    return () => { vigente = false }
  }, [autorizado, general])

  // Toda consulta se realiza con la sesión del usuario. RLS permanece vigente;
  // además se filtra la unidad asignada a RESP_UNIDAD para defensa en profundidad.
  function consulta({ modo = pestana, sexoAplicado = sexo, contar = false } = {}) {
    let q = supabase.from('semovientes')
      .select(contar ? 'id' : CAMPOS, { count: 'exact', head: contar })
      .eq('estado', 'Activo')

    if (!general) q = q.eq('unidad_id', Number(unidadAsignada))
    else if (unidadSeleccionada !== 'todas') q = q.eq('unidad_id', Number(unidadSeleccionada))

    if (modo === 'elegibles') {
      q = q.or(filtroServidorPorEdad({
        hoy: fechaConsulta, especie, sexo: sexoAplicado, codigo: codigoAplicado,
      }))
    } else {
      q = q.in('especie', especie === 'todas' ? ESPECIES_ELEGIBLES : [especie])
        .in('sexo', sexoAplicado === 'todos' ? ['Macho', 'Hembra'] : [sexoAplicado])
        .is('fecha_nacimiento', null)
      if (codigoAplicado) {
        const termino = limpiarCodigoBusqueda(codigoAplicado)
        if (termino) q = q.or(`codigo.ilike.*${termino}*,codigo_activo.ilike.*${termino}*`)
      }
    }
    return q
  }

  useEffect(() => {
    let vigente = true
    if (!autorizado || (!general && !unidadAsignada)) {
      setRegistros([]); setTotal(0); setCargando(false)
      setError('Su perfil no dispone de acceso a una unidad operativa autorizada.')
      return () => { vigente = false }
    }
    async function cargar() {
      setCargando(true); setError(''); setRegistros([])
      const desde = (pagina - 1) * POR_PAGINA
      try {
        const [listado, machos, hembras, sinFecha] = await Promise.all([
          consulta().order(pestana === 'elegibles' ? 'fecha_nacimiento' : 'codigo', { ascending: true })
            .order('id', { ascending: true }).range(desde, desde + POR_PAGINA - 1),
          consulta({ modo: 'elegibles', sexoAplicado: 'Macho', contar: true }),
          consulta({ modo: 'elegibles', sexoAplicado: 'Hembra', contar: true }),
          consulta({ modo: 'sin_fecha', sexoAplicado: 'todos', contar: true }),
        ])
        for (const r of [listado, machos, hembras, sinFecha]) if (r.error) throw r.error
        if (!vigente) return
        setRegistros(listado.data || [])
        setTotal(listado.count ?? 0)
        setTotales({ machos: machos.count ?? 0, hembras: hembras.count ?? 0, sinFecha: sinFecha.count ?? 0 })
      } catch (fallo) {
        if (!vigente) return
        console.error('Evaluación por edad: error de consulta', fallo?.code, fallo?.message)
        setRegistros([]); setTotal(0); setTotales({ machos: 0, hembras: 0, sinFecha: 0 })
        setError('No se pudo consultar el ganado con los permisos actuales. Compruebe su conexión e inténtelo nuevamente.')
      } finally { if (vigente) setCargando(false) }
    }
    cargar()
    return () => { vigente = false }
    // Las consultas se recalculan únicamente si cambian filtros, fecha de Bolivia o recarga.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autorizado, general, unidadAsignada, unidadSeleccionada, especie, sexo, codigoAplicado, pestana, pagina, fechaConsulta, recarga])

  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA))
  const nombreUnidad = id => unidadesPorId[String(id)] || `Unidad N.º ${id}`
  const nombreEspecie = id => ESPECIES_DESCARTE.find(e => e.id === id)?.nombre || id

  function cambiarFiltro(accion, valor) {
    accion(valor); setPagina(1); setErrorExportacion('')
  }
  function buscar(evento) {
    evento.preventDefault()
    const limpio = limpiarCodigoBusqueda(codigo)
    if (codigo.trim() && !limpio) { setError('Escriba letras, números o guiones para buscar por código.'); return }
    setError(''); setCodigoAplicado(limpio); setPagina(1)
  }
  function limpiarFiltros() {
    setUnidadSeleccionada('todas'); setEspecie('todas'); setSexo('todos')
    setCodigo(''); setCodigoAplicado(''); setPestana('elegibles')
    setPagina(1); setErrorExportacion('')
  }
  function actualizar() { setFechaConsulta(hoyEnBolivia()); setRecarga(n => n + 1); setPagina(1) }

  async function exportar() {
    if (cargando || exportando || !total || !autorizado) return
    setExportando(true); setErrorExportacion('')
    try {
      if (total > MAX_EXPORTACION) throw new Error(`La consulta supera ${MAX_EXPORTACION.toLocaleString('es-BO')} registros. Aplique filtros más específicos.`)
      const todos = []
      for (let desde = 0; desde < total; desde += LOTE_EXPORTACION) {
        const { data, error: fallo } = await consulta().order(pestana === 'elegibles' ? 'fecha_nacimiento' : 'codigo', { ascending: true })
          .order('id', { ascending: true }).range(desde, desde + LOTE_EXPORTACION - 1)
        if (fallo) throw fallo
        todos.push(...(data || []))
      }
      if (todos.length !== total) throw new Error('Los registros cambiaron durante la consulta. Presione Actualizar e intente nuevamente.')
      await exportarConsultaDescarte({
        registros: todos, fechaConsulta, pestana,
        nombreUnidad, nombreEspecie,
        nombreArchivo: `revision_por_edad_${pestana}_${fechaConsulta}.xlsx`,
      })
    } catch (fallo) { setErrorExportacion(fallo?.message || 'No se pudo exportar el listado.') }
    finally { setExportando(false) }
  }

  return <main className="evaluacion-descarte-page">
    <header className="ed-hero">
      <small>ARMADA BOLIVIANA · GESTIÓN DE SEMOVIENTES</small>
      <div className="ed-hero-linea"><div><h1>Evaluación por Descarte</h1><p>Identificación automática de ganado que alcanza la edad de revisión.</p></div><span className="ed-lectura">Solo consulta</span></div>
      <p className="ed-hero-aclaracion">Estos resultados no constituyen un dictamen veterinario, una autorización de descarte ni una baja.</p>
    </header>

    <section className="ed-panel" aria-label="Resumen por criterio de edad">
      <div className="ed-indicadores">
        <div className="ed-indicador"><span>Machos que alcanzan el umbral</span><strong>{cargando ? '…' : totales.machos}</strong><small>Según especie y fecha de nacimiento</small></div>
        <div className="ed-indicador"><span>Hembras que alcanzan el umbral</span><strong>{cargando ? '…' : totales.hembras}</strong><small>Según especie y fecha de nacimiento</small></div>
        <div className="ed-indicador ed-indicador-total"><span>Total identificado por edad</span><strong>{cargando ? '…' : totales.machos + totales.hembras}</strong><small>Exclusivamente animales activos</small></div>
        <div className="ed-indicador"><span>Edad no determinada</span><strong>{cargando ? '…' : totales.sinFecha}</strong><small>Sin fecha de nacimiento registrada</small></div>
      </div>
      <p className="ed-microleyenda">Conteos según unidad, especie y código; el filtro de sexo solo afecta a la tabla. Fecha de referencia (Bolivia): <strong>{formatoFechaCorta(fechaConsulta)}</strong>.</p>
    </section>

    <section className="ed-panel" aria-label="Filtros de consulta">
      <div className="ed-encabezado"><h2>Filtros</h2><div className="ed-botones"><button type="button" className="ed-secundario" onClick={limpiarFiltros}>Limpiar</button><button type="button" className="ed-secundario" disabled={cargando} onClick={actualizar}>Actualizar</button></div></div>
      {errorUnidades && <p className="ed-aviso" role="status">{errorUnidades}</p>}
      <div className="ed-filtros">
        <label>Unidad operativa
          {general ? <select value={unidadSeleccionada} onChange={e => cambiarFiltro(setUnidadSeleccionada, e.target.value)}><option value="todas">Todas las unidades</option>{unidades.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select> : <input value={perfil?.unidad?.nombre || 'Unidad asignada'} readOnly aria-label="Unidad operativa asignada" />}
        </label>
        <label>Especie<select value={especie} onChange={e => cambiarFiltro(setEspecie, e.target.value)}><option value="todas">Todas (excepto avícola)</option>{ESPECIES_DESCARTE.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}</select></label>
        <label>Sexo<select value={sexo} onChange={e => cambiarFiltro(setSexo, e.target.value)}><option value="todos">Machos y hembras</option><option value="Macho">Machos</option><option value="Hembra">Hembras</option></select></label>
        <form onSubmit={buscar} className="ed-busqueda"><label htmlFor="ed-codigo">Código individual o del activo<input id="ed-codigo" value={codigo} maxLength={64} onChange={e => setCodigo(e.target.value)} placeholder="Ej. 009 o UOSPGM-86-WI-001" /></label><button type="submit">Buscar</button></form>
      </div>
      <div className="ed-reglas">
        <h3>Criterios por especie y sexo</h3>
        <div className="ed-reglas-grid">{ESPECIES_DESCARTE.map(e => <div key={e.id} className="ed-regla"><strong>{e.nombre}</strong><span>Macho: {criterioPara(e.id, 'Macho')?.edad} años</span><span>Hembra: {criterioPara(e.id, 'Hembra')?.edad} años</span></div>)}</div>
        <p>Avícola excluido. En equinos y mulares el umbral de 10 años es preventivo; los criterios deben ser validados por personal veterinario. No implica descarte automático.</p>
      </div>
    </section>

    <section className="ed-panel" aria-label="Listado de revisión por edad">
      <div className="ed-encabezado ed-encabezado-listado"><div><h2>Listado de semovientes</h2><p>Solo animales activos que cumplen el criterio de consulta.</p></div><button type="button" disabled={cargando || exportando || total === 0 || !!error} onClick={exportar}>{exportando ? 'Preparando Excel…' : 'Exportar a Excel (.xlsx)'}</button></div>
      <div className="ed-tabs" role="group" aria-label="Tipo de listado"><button type="button" className={pestana === 'elegibles' ? 'ed-tab-activa' : 'ed-tab'} aria-pressed={pestana === 'elegibles'} onClick={() => cambiarFiltro(setPestana, 'elegibles')}>Cumplen criterio de edad</button><button type="button" className={pestana === 'sin_fecha' ? 'ed-tab-activa' : 'ed-tab'} aria-pressed={pestana === 'sin_fecha'} onClick={() => cambiarFiltro(setPestana, 'sin_fecha')}>Edad no determinada ({totales.sinFecha})</button></div>
      {error && <p className="ed-error" role="alert">{error}</p>}
      {errorExportacion && <p className="ed-error" role="alert">{errorExportacion}</p>}
      {cargando && <p className="ed-aviso" role="status">Consultando Supabase…</p>}
      <div className="ed-scroll" role="region" aria-label="Listado de semovientes con desplazamiento horizontal" tabIndex={0}>
        <table><thead><tr><th>N.º</th><th>Código individual</th><th>Código del Activo</th><th>Unidad</th><th>Especie</th><th>Sexo</th><th>Clase</th><th>Nacimiento</th><th>Edad</th><th>Criterio</th><th>Expediente</th></tr></thead>
          <tbody>{!cargando && !error && registros.map((a, i) => {
            const clasificacion = clasificarPorEdad(a, fechaConsulta)
            const edad = clasificacion.edad
            const criterio = criterioPara(a.especie, a.sexo)
            return <tr key={a.id}><td>{(pagina - 1) * POR_PAGINA + i + 1}</td><td><strong>{a.codigo}</strong></td><td>{a.codigo_activo || '—'}</td><td>{nombreUnidad(a.unidad_id)}</td><td>{nombreEspecie(a.especie)}</td><td>{a.sexo}</td><td>{a.categoria || '—'}</td><td>{formatoFechaCorta(a.fecha_nacimiento)}</td><td>{edad ? `${edad.anos} años${edad.meses ? `, ${edad.meses} meses` : ''}` : 'No determinada'}</td><td>{criterio ? `Desde ${criterio.edad} años` : '—'}</td><td><button className="ed-secundario ed-boton-ver" type="button" onClick={() => setAnimalAbierto(a.id)}>Ver expediente</button></td></tr>
          })}
          {!cargando && !error && registros.length === 0 && <tr><td colSpan={11} className="ed-vacio">{pestana === 'elegibles' ? 'No hay semovientes activos que cumplan estos criterios.' : 'No hay semovientes sin fecha de nacimiento para estos filtros.'}</td></tr>}</tbody></table>
      </div>
      <div className="ed-paginacion"><span>{cargando ? 'Consultando…' : `${total} registros · Página ${pagina} de ${paginas}`}</span><div><button className="ed-secundario" type="button" disabled={cargando || pagina <= 1} onClick={() => setPagina(n => n - 1)}>Anterior</button><button className="ed-secundario" type="button" disabled={cargando || pagina >= paginas} onClick={() => setPagina(n => n + 1)}>Siguiente</button></div></div>
      <p className="ed-pie">La edad se calcula en años completos al {formatoFechaCorta(fechaConsulta)}. Sin fecha de nacimiento no se presume elegibilidad. Ninguna acción en esta pantalla modifica Supabase.</p>
    </section>
    <ExpedienteHistorialModal animalId={animalAbierto} onCerrar={() => setAnimalAbierto(null)} />
  </main>
}

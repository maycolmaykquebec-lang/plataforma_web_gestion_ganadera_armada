import { useEffect, useState } from 'react'
import { supabase } from '../services/supabaseClient'
import { usePerfil } from '../contexts/PerfilContext'
import { puedeRegistrar } from '../auth/permisos'
import './EvaluacionDescartePage.css'

const TAMANO = 25
const DICTAMENES = { candidato: 'Candidato a descarte', no_recomendado: 'Descarte no recomendado', seguimiento: 'Requiere seguimiento' }
function hoyBolivia() {
  const partes = new Intl.DateTimeFormat('es-BO', { timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const valor = tipo => partes.find(p => p.type === tipo)?.value
  return `${valor('year')}-${valor('month')}-${valor('day')}`
}
function fecha(valor) {
  if (!valor) return '—'
  const [anio, mes, dia] = valor.slice(0, 10).split('-')
  return `${dia}/${mes}/${anio}`
}
function mensajeError(e, accion) {
  if (['PGRST205', '42P01', 'PGRST202'].includes(e?.code)) return 'El módulo de evaluación todavía no está disponible. Contacte al administrador.'
  return `No se pudo ${accion}. Verifique la conexión y sus permisos e inténtelo nuevamente.`
}

export default function EvaluacionDescartePage() {
  const perfil = usePerfil()
  const responsable = puedeRegistrar(perfil)
  const [filas, setFilas] = useState([])
  const [total, setTotal] = useState(0)
  const [pagina, setPagina] = useState(1)
  const [recarga, setRecarga] = useState(0)
  const [cargando, setCargando] = useState(true)
  const [errorListado, setErrorListado] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [abierto, setAbierto] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState('')
  const [animales, setAnimales] = useState([])
  const [buscando, setBuscando] = useState(false)
  const [errorAnimales, setErrorAnimales] = useState('')
  const [animalId, setAnimalId] = useState('')
  const [fechaEvaluacion, setFechaEvaluacion] = useState(hoyBolivia)
  const [dictamen, setDictamen] = useState('seguimiento')
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [errorFormulario, setErrorFormulario] = useState('')

  useEffect(() => {
    let vigente = true
    async function cargar() {
      setCargando(true); setFilas([]); setErrorListado('')
      try {
        const r = await supabase.from('rb_evaluaciones_descarte').select(`
          id,semoviente_id,unidad_id,fecha,motivo,dictamen,registrado_en,
          semoviente:semovientes(id,codigo,especie,categoria,estado),
          unidad:unidades_operativas(nombre)
        `, { count: 'exact' }).order('registrado_en', { ascending: false }).order('id', { ascending: false }).range((pagina - 1) * TAMANO, pagina * TAMANO - 1)
        if (r.error) throw r.error
        if (vigente) { setFilas(r.data || []); setTotal(r.count || 0) }
      } catch (e) { if (vigente) { setFilas([]); setTotal(0); setErrorListado(mensajeError(e, 'cargar las evaluaciones')) } }
      finally { if (vigente) setCargando(false) }
    }
    cargar()
    return () => { vigente = false }
  }, [pagina, recarga])
  useEffect(() => {
    if (!responsable || !abierto) return
    let vigente = true
    async function cargar() {
      setBuscando(true); setAnimales([]); setAnimalId(''); setErrorAnimales('')
      try {
        let q = supabase.from('semovientes').select('id,codigo,especie,categoria')
          .eq('unidad_id', perfil.unidad.id).eq('estado', 'Activo').order('codigo').limit(200)
        if (filtro) q = q.ilike('codigo', `${filtro.replace(/[%_\\]/g, '\\$&')}%`)
        const r = await q
        if (r.error) throw r.error
        if (vigente) setAnimales(r.data || [])
      } catch (e) { if (vigente) setErrorAnimales(mensajeError(e, 'buscar los semovientes activos')) }
      finally { if (vigente) setBuscando(false) }
    }
    cargar()
    return () => { vigente = false }
  }, [abierto, responsable, perfil.unidad?.id, filtro])

  async function guardar(e) {
    e.preventDefault()
    if (guardando || buscando) return
    if (!animalId || motivo.trim().length < 10 || motivo.trim().length > 2000) {
      setErrorFormulario('Seleccione un semoviente y escriba un motivo de entre 10 y 2000 caracteres.')
      return
    }
    setGuardando(true); setErrorFormulario(''); setMensaje('')
    try {
      const r = await supabase.rpc('rb_evaluar_descarte', {
        p_semoviente: Number(animalId), p_fecha: fechaEvaluacion,
        p_motivo: motivo.trim(), p_dictamen: dictamen,
      })
      if (r.error) throw r.error
      if (r.data == null) throw Error('No se confirmó el registro')
      setAbierto(false); setAnimalId(''); setMotivo(''); setDictamen('seguimiento'); setFechaEvaluacion(hoyBolivia())
      setMensaje('La evaluación fue registrada. El dictamen no modifica el estado del semoviente.')
      setPagina(1); setRecarga(n => n + 1)
    } catch (e) { setErrorFormulario(mensajeError(e, 'registrar la evaluación')) }
    finally { setGuardando(false) }
  }
  return <div className="evaluacion-descarte-page">
    <header className="ed-hero"><small>ARMADA BOLIVIANA · REGISTRO Y CONTROL DE SEMOVIENTES</small><h1>Evaluación para descarte</h1><p>Registro del dictamen y sus fundamentos para el seguimiento de cada animal.</p></header>
    <p className="ed-nota">Una recomendación de descarte no da de baja al semoviente. La baja se registra por separado cuando corresponda.</p>
    {mensaje && <p className="ed-exito" role="status">{mensaje}</p>}
    <div className="ed-barra"><p>{responsable ? `Unidad asignada: ${perfil.unidad.nombre}` : 'Consulta de las unidades bajo su supervisión.'}</p><div className="ed-acciones">{responsable && <button type="button" disabled={guardando} aria-expanded={abierto} aria-controls="ed-formulario" onClick={() => { setAbierto(v => !v); setErrorFormulario(''); setMensaje('') }}>{abierto ? 'Cerrar formulario' : 'Nueva evaluación'}</button>}<button className="ed-secundario" type="button" disabled={cargando || guardando} onClick={() => setRecarga(n => n + 1)}>Actualizar</button></div></div>
    {responsable && abierto && <section id="ed-formulario"><h2>Nueva evaluación</h2><form onSubmit={guardar}>
      <div className="ed-busqueda"><label htmlFor="ed-busqueda">Buscar un código de su unidad<input id="ed-busqueda" maxLength={80} disabled={guardando} value={busqueda} onChange={e => setBusqueda(e.target.value)} /></label><button type="button" className="ed-secundario" disabled={guardando || buscando} onClick={() => setFiltro(busqueda.trim())}>Buscar</button></div>
      {errorAnimales && <p className="ed-error" role="alert">{errorAnimales}</p>}
      <label htmlFor="ed-animal">Semoviente activo<select id="ed-animal" required disabled={guardando || buscando} value={animalId} onChange={e => setAnimalId(e.target.value)}><option value="">{buscando ? 'Buscando semovientes…' : 'Seleccione un semoviente'}</option>{animales.map(a => <option key={a.id} value={a.id}>{a.codigo} · {a.especie} · {a.categoria}</option>)}</select></label>
      <p className="ed-ayuda">Se muestran hasta 200 animales activos. Busque por el inicio del código para acotar la selección.{!buscando && !animales.length && !errorAnimales ? ' No hay coincidencias.' : ''}</p>
      <div className="ed-form-grid"><label htmlFor="ed-fecha">Fecha de evaluación<input id="ed-fecha" type="date" required max={hoyBolivia()} disabled={guardando} value={fechaEvaluacion} onChange={e => setFechaEvaluacion(e.target.value)} /></label><label htmlFor="ed-dictamen">Dictamen<select id="ed-dictamen" value={dictamen} disabled={guardando} onChange={e => setDictamen(e.target.value)}>{Object.entries(DICTAMENES).map(([valor, texto]) => <option key={valor} value={valor}>{texto}</option>)}</select></label></div>
      <label htmlFor="ed-motivo">Motivo y fundamentos<textarea id="ed-motivo" required minLength={10} maxLength={2000} rows={4} value={motivo} disabled={guardando} onChange={e => setMotivo(e.target.value)} /></label>
      {errorFormulario && <p className="ed-error" role="alert">{errorFormulario}</p>}
      <div className="ed-acciones"><button className="ed-secundario" type="button" disabled={guardando} onClick={() => setAbierto(false)}>Cancelar</button><button type="submit" disabled={guardando || buscando || !animales.length}>{guardando ? 'Registrando…' : 'Registrar evaluación'}</button></div>
    </form></section>}
    <section><h2>Evaluaciones registradas</h2>{errorListado && <p className="ed-error" role="alert">{errorListado}</p>}
      <div className="ed-scroll" tabIndex={0} role="region" aria-label="Listado de evaluaciones con desplazamiento horizontal"><table><thead><tr><th scope="col">Código</th><th scope="col">Unidad</th><th scope="col">Fecha</th><th scope="col">Dictamen</th><th scope="col">Motivo</th><th scope="col">Estado actual</th></tr></thead><tbody>{filas.map(r => <tr key={r.id}><td><strong>{r.semoviente?.codigo || `ID ${r.semoviente_id}`}</strong></td><td>{r.unidad?.nombre || '—'}</td><td>{fecha(r.fecha)}</td><td><span className={`ed-dictamen ed-${r.dictamen}`}>{DICTAMENES[r.dictamen] || r.dictamen}</span></td><td className="ed-motivo-celda">{r.motivo}</td><td>{r.semoviente?.estado || '—'}</td></tr>)}{!filas.length && <tr><td colSpan={6}>{cargando ? 'Cargando evaluaciones…' : errorListado ? 'Listado no disponible.' : 'No hay evaluaciones registradas en su alcance.'}</td></tr>}</tbody></table></div>
      <div className="ed-paginacion"><span>{total} registros · Página {pagina} de {Math.max(1, Math.ceil(total / TAMANO))}</span><div><button type="button" className="ed-secundario" disabled={cargando || pagina <= 1} onClick={() => setPagina(n => n - 1)}>Anterior</button><button type="button" className="ed-secundario" disabled={cargando || pagina * TAMANO >= total} onClick={() => setPagina(n => n + 1)}>Siguiente</button></div></div>
    </section>
  </div>
}

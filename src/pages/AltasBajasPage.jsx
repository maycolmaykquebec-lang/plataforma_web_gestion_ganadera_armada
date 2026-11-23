import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../services/supabaseClient'
import { usePerfil } from '../contexts/PerfilContext'
import { puedeRegistrar } from '../auth/permisos'
import ActaDefuncionPanel from '../components/documentos/ActaDefuncionPanel'
import { fotoComoJpeg } from '../services/actaDefuncionWord'
import './AltasBajasPage.css'

const TAMANO = 25
const TIPOS = { defuncion: 'Defunción', venta: 'Venta', sacrificio: 'Sacrificio', otro: 'Otro motivo' }
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
function errorConsulta(error, accion) {
  if (accion === 'registrar la baja' && /El semoviente tiene un traslado abierto/i.test(error?.message || '')) {
    return 'El semoviente tiene un traslado pendiente o aprobado. Solicite al Supervisor Departamento VII que lo resuelva en Movimientos antes de registrar la baja. No se ha registrado la baja.'
  }
  if (['PGRST205', '42P01', 'PGRST202'].includes(error?.code)) return 'El módulo de bajas todavía no está disponible. Contacte al administrador.'
  return `No se pudo ${accion}. Verifique la conexión y sus permisos e inténtelo nuevamente.`
}

function RegistrarBajaModal({ perfil, onCerrar, onGuardado }) {
  const dialogo = useRef(null)
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState('')
  const [animales, setAnimales] = useState([])
  const [animalId, setAnimalId] = useState('')
  const [tipo, setTipo] = useState('defuncion')
  const [fechaBaja, setFechaBaja] = useState(hoyBolivia)
  const [motivo, setMotivo] = useState('')
  const [detalles, setDetalles] = useState({ hora: '', lugar: '', referencia_informe: '', marcado: '', descripcion: '' })
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [fotografia, setFotografia] = useState(null)
  const [vistaFoto, setVistaFoto] = useState('')
  const [bajaCreada, setBajaCreada] = useState(null)
  const [errorBusqueda, setErrorBusqueda] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const dialogoActual = dialogo.current
    dialogoActual?.showModal()
    return () => { if (dialogoActual?.open) dialogoActual.close() }
  }, [])
  useEffect(() => {
    if (!fotografia) { setVistaFoto(''); return undefined }
    const url = URL.createObjectURL(fotografia)
    setVistaFoto(url)
    return () => URL.revokeObjectURL(url)
  }, [fotografia])
  useEffect(() => {
    let vigente = true
    async function cargar() {
      setCargando(true); setAnimales([]); setAnimalId(''); setErrorBusqueda('')
      try {
        let consulta = supabase.from('semovientes').select('id,codigo,especie,categoria,fecha_ingreso')
          .eq('unidad_id', perfil.unidad.id).eq('estado', 'Activo').order('codigo').limit(200)
        if (filtro) consulta = consulta.ilike('codigo', `${filtro.replace(/[%_\\]/g, '\\$&')}%`)
        const resultado = await consulta
        if (resultado.error) throw resultado.error
        if (vigente) setAnimales(resultado.data || [])
      } catch (e) { if (vigente) setErrorBusqueda(errorConsulta(e, 'buscar los semovientes activos')) }
      finally { if (vigente) setCargando(false) }
    }
    cargar()
    return () => { vigente = false }
  }, [filtro, perfil.unidad.id])

  async function guardar(e) {
    e.preventDefault()
    if (guardando || cargando) return
    if (!animalId || motivo.trim().length < 10 || motivo.trim().length > 2000) {
      setError('Seleccione un semoviente y escriba un motivo de entre 10 y 2000 caracteres.')
      return
    }
    const animal = animales.find(a => String(a.id) === String(animalId))
    if (!fechaBaja || fechaBaja > hoyBolivia() || (animal?.fecha_ingreso && fechaBaja < animal.fecha_ingreso)) {
      setError('La fecha de baja debe estar entre el ingreso del semoviente y la fecha actual.')
      return
    }
    setGuardando(true); setError('')
    let idBaja = bajaCreada
    try {
      if (!idBaja) {
        const resultado = await supabase.rpc('rb_registrar_baja', {
          p_semoviente: Number(animalId), p_tipo: tipo, p_fecha: fechaBaja, p_motivo: motivo.trim(),
          p_detalles: tipo === 'defuncion'
            ? Object.fromEntries(Object.entries(detalles).map(([clave, valor]) => [clave, valor.trim()]).filter(([, valor]) => valor))
            : {},
        })
        if (resultado.error) throw resultado.error
        if (resultado.data == null) throw Error('No se confirmó el registro')
        idBaja = Number(resultado.data)
        setBajaCreada(idBaja)
      }
      if (fotografia) {
        const jpeg = await fotoComoJpeg(fotografia)
        const ruta = `${perfil.unidad.id}/${idBaja}/evidencia.jpg`
        const resultado = await supabase.storage.from('bajas-fotos').upload(ruta, jpeg, {
          contentType: 'image/jpeg', cacheControl: '3600', upsert: false,
        })
        if (resultado.error) throw { fotografia: true, error: resultado.error }
      }
      onGuardado(Boolean(fotografia))
    } catch (e) {
      if (idBaja || e?.fotografia) {
        setError(`La baja ya fue registrada en Supabase (ID ${idBaja || 'confirmado'}), pero la fotografía no se completó. No vuelva a registrar la baja: puede reintentar la fotografía con este mismo botón. ${e?.error?.message || e?.message || ''}`)
      } else setError(errorConsulta(e, 'registrar la baja'))
    }
    finally { setGuardando(false) }
  }
  const animalSeleccionado = animales.find(a => String(a.id) === String(animalId))
  const cambiarDetalle = (clave, valor) => setDetalles(actual => ({ ...actual, [clave]: valor }))
  return <dialog ref={dialogo} className="ab-modal" aria-labelledby="ab-modal-titulo" onCancel={e => { if (guardando) e.preventDefault(); else onCerrar() }}>
    <div className="ab-modal-cabecera"><div><small>UOSPG. «{perfil.unidad.nombre}»</small><h2 id="ab-modal-titulo">Registrar baja de semoviente</h2></div><button type="button" className="ab-secundario" disabled={guardando} onClick={onCerrar} aria-label="Cerrar formulario">×</button></div>
    <p>El semoviente dejará de figurar como activo y conservará su historial.</p>
    <form onSubmit={guardar}>
      <div className="ab-busqueda"><label htmlFor="ab-busqueda">Buscar un código de su unidad<input id="ab-busqueda" autoFocus maxLength={80} disabled={guardando || Boolean(bajaCreada)} value={busqueda} onChange={e => setBusqueda(e.target.value)} /></label><button type="button" className="ab-secundario" disabled={guardando || cargando || Boolean(bajaCreada)} onClick={() => setFiltro(busqueda.trim())}>Buscar</button></div>
      {errorBusqueda && <p className="ab-error" role="alert">{errorBusqueda}</p>}
      <label htmlFor="ab-animal">Semoviente activo<select id="ab-animal" required disabled={guardando || cargando || Boolean(bajaCreada)} value={animalId} onChange={e => setAnimalId(e.target.value)}><option value="">{cargando ? 'Buscando semovientes…' : 'Seleccione un semoviente'}</option>{animales.map(a => <option key={a.id} value={a.id}>{a.codigo} · {a.especie} · {a.categoria}</option>)}</select></label>
      <p className="ab-ayuda">Se muestran hasta 200 animales activos. Busque por el inicio del código para acotar la selección.{!cargando && !animales.length && !errorBusqueda ? ' No hay coincidencias.' : ''}</p>
      <div className="ab-form-grid"><label htmlFor="ab-tipo">Tipo de baja<select id="ab-tipo" value={tipo} disabled={guardando || Boolean(bajaCreada)} onChange={e => setTipo(e.target.value)}>{Object.entries(TIPOS).map(([valor, nombre]) => <option key={valor} value={valor}>{nombre}</option>)}</select></label><label htmlFor="ab-fecha">Fecha de la baja<input id="ab-fecha" type="date" required min={animalSeleccionado?.fecha_ingreso || undefined} max={hoyBolivia()} value={fechaBaja} disabled={guardando || Boolean(bajaCreada)} onChange={e => setFechaBaja(e.target.value)} /></label></div>
      <label htmlFor="ab-motivo">Motivo<textarea id="ab-motivo" required minLength={10} maxLength={2000} rows={4} disabled={guardando || Boolean(bajaCreada)} value={motivo} onChange={e => setMotivo(e.target.value)} /></label>
      {tipo === 'defuncion' && <fieldset className="ab-detalles"><legend>Datos complementarios para el acta de defunción</legend>
        <p className="ab-ayuda">Registre los datos conocidos del acontecimiento. Los campos vacíos permanecerán sin completar en el documento.</p>
        <div className="ab-form-grid"><label htmlFor="ab-hora">Hora de la defunción<input id="ab-hora" type="time" disabled={guardando || Boolean(bajaCreada)} value={detalles.hora} onChange={e => cambiarDetalle('hora', e.target.value)} /></label><label htmlFor="ab-lugar">Lugar<input id="ab-lugar" maxLength={200} disabled={guardando || Boolean(bajaCreada)} value={detalles.lugar} onChange={e => cambiarDetalle('lugar', e.target.value)} /></label><label htmlFor="ab-referencia">Referencia del informe<input id="ab-referencia" maxLength={200} disabled={guardando || Boolean(bajaCreada)} value={detalles.referencia_informe} onChange={e => cambiarDetalle('referencia_informe', e.target.value)} /></label><label htmlFor="ab-marcado">Marcado o identificación visible<input id="ab-marcado" maxLength={200} disabled={guardando || Boolean(bajaCreada)} value={detalles.marcado} onChange={e => cambiarDetalle('marcado', e.target.value)} /></label></div>
        <label htmlFor="ab-descripcion">Descripción y señas particulares<textarea id="ab-descripcion" rows={3} maxLength={1000} disabled={guardando || Boolean(bajaCreada)} value={detalles.descripcion} onChange={e => cambiarDetalle('descripcion', e.target.value)} /></label>
      </fieldset>}
      <fieldset className="ab-detalles ab-fotografia"><legend>Fotografía de evidencia de la baja (opcional)</legend>
        <p className="ab-ayuda">Esta imagen quedará vinculada permanentemente a la baja y se insertará de forma automática en el acta Word de defunción. JPG, PNG o WebP; máximo 5 MB. No debe confundirse con las fotografías de identificación del semoviente.</p>
        <label htmlFor="ab-fotografia">Adjuntar fotografía de la baja
          <input id="ab-fotografia" type="file" accept="image/jpeg,image/png,image/webp" disabled={guardando} onChange={e => {
            const archivo = e.target.files?.[0] || null
            if (archivo && (!['image/jpeg','image/png','image/webp'].includes(archivo.type) || archivo.size > 5*1024*1024 || archivo.size <= 0)) {
              setError('La fotografía debe ser JPG, PNG o WebP y pesar hasta 5 MB.'); e.target.value=''; setFotografia(null); return
            }
            setError(''); setFotografia(archivo)
          }} />
        </label>
        {vistaFoto && <div className="ab-foto-vista"><img src={vistaFoto} alt="Vista previa de la fotografía de evidencia" /><span>{fotografia.name}</span></div>}
        {fotografia && <button type="button" className="ab-secundario" onClick={() => setFotografia(null)}>Quitar fotografía</button>}
        {bajaCreada && <p role="status" className="ab-ayuda">Baja creada (ID {bajaCreada}). Si la carga falló, solo se reintentará la fotografía sin duplicar la baja.</p>}
      </fieldset>
      {error && <p className="ab-error" role="alert">{error}</p>}
      <div className="ab-acciones"><button type="button" className="ab-secundario" disabled={guardando} onClick={onCerrar}>Cancelar</button><button type="submit" disabled={guardando || cargando || !animales.length}>{guardando ? 'Guardando…' : bajaCreada ? 'Reintentar fotografía' : 'Registrar baja'}</button></div>
    </form>
  </dialog>
}

export default function AltasBajasPage() {
  const perfil = usePerfil()
  const responsable = puedeRegistrar(perfil)
  const [altas, setAltas] = useState([])
  const [bajas, setBajas] = useState([])
  const [totalAltas, setTotalAltas] = useState(0)
  const [totalBajas, setTotalBajas] = useState(0)
  const [paginaAltas, setPaginaAltas] = useState(1)
  const [paginaBajas, setPaginaBajas] = useState(1)
  const [cargandoAltas, setCargandoAltas] = useState(true)
  const [cargandoBajas, setCargandoBajas] = useState(true)
  const [errorAltas, setErrorAltas] = useState('')
  const [errorBajas, setErrorBajas] = useState('')
  const [modal, setModal] = useState(false)
  const [actaBaja, setActaBaja] = useState(null)
  const [mensaje, setMensaje] = useState('')
  const [recarga, setRecarga] = useState(0)

  useEffect(() => {
    let vigente = true
    async function cargar() {
      setCargandoAltas(true); setErrorAltas(''); setAltas([])
      try {
        const r = await supabase.from('semovientes').select('id,codigo,especie,categoria,fecha_ingreso,estado,unidad:unidades_operativas(nombre)', { count: 'exact' })
          .order('fecha_ingreso', { ascending: false }).order('id', { ascending: false }).range((paginaAltas - 1) * TAMANO, paginaAltas * TAMANO - 1)
        if (r.error) throw r.error
        if (vigente) { setAltas(r.data || []); setTotalAltas(r.count || 0) }
      } catch (e) { if (vigente) { setAltas([]); setTotalAltas(0); setErrorAltas(errorConsulta(e, 'cargar los registros de ingreso')) } }
      finally { if (vigente) setCargandoAltas(false) }
    }
    cargar()
    return () => { vigente = false }
  }, [paginaAltas, recarga])
  useEffect(() => {
    let vigente = true
    async function cargar() {
      setCargandoBajas(true); setErrorBajas(''); setBajas([]); setActaBaja(null)
      try {
        const r = await supabase.from('rb_bajas').select(`
          id,semoviente_id,unidad_id,tipo,fecha,motivo,detalles,registrado_por,registrado_en,
          semoviente:semovientes(id,codigo,codigo_activo,especie,categoria,sexo,raza,fecha_nacimiento,fecha_ingreso),
          unidad:unidades_operativas(nombre,sigla,codigo)
        `, { count: 'exact' }).order('registrado_en', { ascending: false }).order('id', { ascending: false }).range((paginaBajas - 1) * TAMANO, paginaBajas * TAMANO - 1)
        if (r.error) throw r.error
        if (vigente) { setBajas(r.data || []); setTotalBajas(r.count || 0) }
      } catch (e) { if (vigente) { setBajas([]); setTotalBajas(0); setErrorBajas(errorConsulta(e, 'cargar las bajas')) } }
      finally { if (vigente) setCargandoBajas(false) }
    }
    cargar()
    return () => { vigente = false }
  }, [paginaBajas, recarga])

  return <div className="altas-bajas-page">
    <header className="ab-hero"><small>ARMADA BOLIVIANA · REGISTRO Y CONTROL DE SEMOVIENTES</small><h1>Altas y bajas</h1><p>Ingresos y salidas definitivas del registro ganadero bajo su alcance institucional.</p></header>
    {mensaje && <p className="ab-exito" role="status">{mensaje}</p>}
    <div className="ab-barra"><p>{responsable ? `Unidad asignada: ${perfil.unidad.nombre}` : 'Consulta de las unidades bajo su supervisión.'}</p><div className="ab-acciones">{responsable && <><Link className="ab-enlace-boton ab-secundario" to="/semovientes">Registrar alta</Link><button type="button" onClick={() => { setMensaje(''); setModal(true) }}>Registrar baja</button></>}<button className="ab-secundario" type="button" disabled={cargandoAltas || cargandoBajas} onClick={() => setRecarga(n => n + 1)}>Actualizar</button></div></div>
    <section><h2>Ingresos registrados</h2><p>Fecha de ingreso consignada en la ficha de cada semoviente, incluido el ganado que posteriormente fue dado de baja.</p>
      {errorAltas && <p className="ab-error" role="alert">{errorAltas}</p>}
      <div className="ab-scroll" tabIndex={0} role="region" aria-label="Listado de ingresos con desplazamiento horizontal"><table><thead><tr><th scope="col">Código</th><th scope="col">Unidad</th><th scope="col">Especie</th><th scope="col">Clase</th><th scope="col">Fecha de ingreso</th><th scope="col">Estado actual</th></tr></thead><tbody>{altas.map(a => <tr key={a.id}><td><strong>{a.codigo}</strong></td><td>{a.unidad?.nombre || '—'}</td><td>{a.especie}</td><td>{a.categoria}</td><td>{fecha(a.fecha_ingreso)}</td><td>{a.estado}</td></tr>)}{!altas.length && <tr><td colSpan={6}>{cargandoAltas ? 'Cargando ingresos…' : errorAltas ? 'Listado no disponible.' : 'No hay ingresos en su alcance.'}</td></tr>}</tbody></table></div>
      <div className="ab-paginacion"><span>{totalAltas} registros · Página {paginaAltas} de {Math.max(1, Math.ceil(totalAltas / TAMANO))}</span><div><button type="button" className="ab-secundario" disabled={cargandoAltas || paginaAltas <= 1} onClick={() => setPaginaAltas(n => n - 1)}>Anterior</button><button type="button" className="ab-secundario" disabled={cargandoAltas || paginaAltas * TAMANO >= totalAltas} onClick={() => setPaginaAltas(n => n + 1)}>Siguiente</button></div></div>
    </section>
    <section><h2>Bajas registradas</h2><p>Las defunciones registradas permiten preparar su acta con los datos del semoviente.</p>
      {errorBajas && <p className="ab-error" role="alert">{errorBajas}</p>}
      <div className="ab-scroll" tabIndex={0} role="region" aria-label="Listado de bajas con desplazamiento horizontal"><table><thead><tr><th scope="col">Código</th><th scope="col">Unidad</th><th scope="col">Tipo</th><th scope="col">Fecha</th><th scope="col">Motivo</th><th scope="col">Documento</th></tr></thead><tbody>{bajas.map(b => <tr key={b.id}><td><strong>{b.semoviente?.codigo || `ID ${b.semoviente_id}`}</strong></td><td>{b.unidad?.nombre || '—'}</td><td>{TIPOS[b.tipo] || b.tipo}</td><td>{fecha(b.fecha)}</td><td className="ab-motivo-celda">{b.motivo}</td><td>{b.tipo === 'defuncion' && b.semoviente ? <button type="button" className="ab-secundario" onClick={() => setActaBaja(b)}>Preparar documento</button> : '—'}</td></tr>)}{!bajas.length && <tr><td colSpan={6}>{cargandoBajas ? 'Cargando bajas…' : errorBajas ? 'Listado no disponible.' : 'No hay bajas registradas en su alcance.'}</td></tr>}</tbody></table></div>
      <div className="ab-paginacion"><span>{totalBajas} registros · Página {paginaBajas} de {Math.max(1, Math.ceil(totalBajas / TAMANO))}</span><div><button type="button" className="ab-secundario" disabled={cargandoBajas || paginaBajas <= 1} onClick={() => setPaginaBajas(n => n - 1)}>Anterior</button><button type="button" className="ab-secundario" disabled={cargandoBajas || paginaBajas * TAMANO >= totalBajas} onClick={() => setPaginaBajas(n => n + 1)}>Siguiente</button></div></div>
    </section>
    {actaBaja?.tipo === 'defuncion' && <section className="ab-acta"><div className="ab-barra"><h2>Acta de defunción</h2><button type="button" className="ab-secundario" onClick={() => setActaBaja(null)}>Cerrar acta</button></div><ActaDefuncionPanel key={actaBaja.id} baja={actaBaja} animal={actaBaja.semoviente} /></section>}
    {modal && <RegistrarBajaModal perfil={perfil} onCerrar={() => setModal(false)} onGuardado={conFoto => { setModal(false); setMensaje(conFoto ? 'Baja y fotografía guardadas correctamente en Supabase.' : 'La baja fue registrada. El semoviente ya no figura como activo.'); setPaginaBajas(1); setRecarga(n => n + 1) }} />}
  </div>
}

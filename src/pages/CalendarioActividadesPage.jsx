import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../services/supabaseClient'
import { usePerfil } from '../contexts/PerfilContext'
import {
  TIPOS_ACTIVIDAD, ESTADOS_ACTIVIDAD, PRIO_ACTIVIDAD,
  fechaBolivia, sumarMeses, diasCalendario, fechaCorta,
  etiqueta, resumirActividades, venceAntes, validarActividad,
} from '../utils/calendarioGanadero'
import './CalendarioActividadesPage.css'

const BLOQUE = 500
const MAX_MES = 10000
const DOW = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

function mesFormateado(mes) {
  return new Intl.DateTimeFormat('es-BO', { year: 'numeric', month: 'long', timeZone: 'UTC' })
    .format(new Date(`${mes}-01T00:00:00Z`))
}

function nuevoFormulario(fecha, unidad) {
  return {
    titulo: '', tipo: 'vacunacion', fecha, hora: '08:00',
    unidad_id: unidad, prioridad: 'normal', estado: 'programada',
    descripcion: '', codigo_semoviente: '',
  }
}

async function cargarMes(mes, unidad) {
  const acumulado = []
  const desdeFecha = `${mes}-01`
  const hastaFecha = `${sumarMeses(mes, 1)}-01`
  for (let inicio = 0; inicio < MAX_MES; inicio += BLOQUE) {
    let consulta = supabase.from('calendario_actividades')
      .select('id,unidad_id,codigo_semoviente,titulo,tipo,descripcion,fecha,hora,prioridad,estado,creado_por,creado_en,actualizado_en', { count: 'exact' })
      .gte('fecha', desdeFecha).lt('fecha', hastaFecha)
    if (unidad !== 'todas') consulta = consulta.eq('unidad_id', Number(unidad))
    const { data, count, error } = await consulta
      .order('fecha', { ascending: true }).order('hora', { ascending: true })
      .order('id', { ascending: true }).range(inicio, inicio + BLOQUE - 1)
    if (error) throw error
    if ((count ?? 0) > MAX_MES) throw new Error('Este mes contiene demasiadas actividades. Filtre por unidad.')
    acumulado.push(...(data ?? []))
    if (acumulado.length === count) return acumulado
    if (!data?.length) throw new Error('La consulta de actividades quedó incompleta.')
  }
  throw new Error('Se alcanzó el límite de actividades para un solo mes.')
}

export default function CalendarioActividadesPage() {
  const perfil = usePerfil()
  const rol = perfil?.rol?.codigo
  const responsable = rol === 'RESP_UNIDAD'
  const supervisor = rol === 'SUP_DEPTO_VII'
  const puedeCrear = responsable || supervisor
  const [mes, setMes] = useState(fechaBolivia().slice(0, 7))
  const [seleccion, setSeleccion] = useState(fechaBolivia())
  const [unidad, setUnidad] = useState(responsable ? String(perfil?.unidad?.id || '') : 'todas')
  const [unidades, setUnidades] = useState(responsable && perfil?.unidad ? [perfil.unidad] : [])
  const [tipoFiltro, setTipoFiltro] = useState('todas')
  const [estadoFiltro, setEstadoFiltro] = useState('todas')
  const [busqueda, setBusqueda] = useState('')
  const [actividades, setActividades] = useState([])
  const [cargando, setCargando] = useState(true)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [modal, setModal] = useState(false)
  const [edicion, setEdicion] = useState(null)
  const [formulario, setFormulario] = useState(nuevoFormulario(fechaBolivia(), responsable ? String(perfil?.unidad?.id || '') : ''))
  const [recarga, setRecarga] = useState(0)
  const [uid, setUid] = useState(null)

  useEffect(() => {
    let activo = true
    supabase.auth.getUser().then(({ data }) => {
      if (activo) setUid(data?.user?.id || null)
    })
    return () => { activo = false }
  }, [])

  useEffect(() => {
    if (responsable) return
    let activo = true
    async function cargarUnidades() {
      const { data, error: fallo } = await supabase.from('unidades_operativas')
        .select('id, codigo, nombre').eq('activo', true).order('nombre')
      if (!activo) return
      if (fallo) setError('No se pudieron consultar las unidades operativas.')
      else setUnidades(data || [])
    }
    cargarUnidades()
    return () => { activo = false }
  }, [responsable])

  useEffect(() => {
    let activo = true
    setCargando(true)
    setError('')
    cargarMes(mes, unidad || 'todas')
      .then((rows) => { if (activo) setActividades(rows) })
      .catch((e) => {
        if (!activo) return
        console.error('Error al consultar calendario:', e.code, e.message)
        setError(e.code === '42P01' || e.code === 'PGRST205'
          ? 'Primero debe instalar el SQL 09 del calendario en Supabase.'
          : 'No se pudo cargar el calendario. Revise los permisos, la conexión y la instalación del SQL 09.')
        setActividades([])
      })
      .finally(() => { if (activo) setCargando(false) })
    return () => { activo = false }
  }, [mes, unidad, recarga])

  const filtradas = useMemo(() => {
    const filtro = busqueda.trim().toLocaleLowerCase('es')
    return actividades.filter((a) =>
      (tipoFiltro === 'todas' || a.tipo === tipoFiltro) &&
      (estadoFiltro === 'todas' || a.estado === estadoFiltro) &&
      (!filtro || [a.titulo, a.descripcion, a.codigo_semoviente].some((v) =>
        String(v || '').toLocaleLowerCase('es').includes(filtro)))
    )
  }, [actividades, tipoFiltro, estadoFiltro, busqueda])

  const agrupadas = useMemo(() => {
    const mapa = new Map()
    filtradas.forEach((a) => mapa.set(a.fecha, [...(mapa.get(a.fecha) || []), a]))
    return mapa
  }, [filtradas])
  const resumen = useMemo(() => resumirActividades(filtradas), [filtradas])
  const actividadesDia = agrupadas.get(seleccion) || []
  const unidadNombre = (id) => unidades.find((u) => String(u.id) === String(id))?.nombre || perfil?.unidad?.nombre || `Unidad ${id}`
  const puedeEditar = (a) => supervisor || (responsable && String(a.unidad_id) === String(perfil.unidad.id) && a.creado_por === uid)

  function moverMes(d) {
    const nuevo = sumarMeses(mes, d)
    setMes(nuevo)
    setSeleccion(`${nuevo}-01`)
  }

  function abrirNuevo(fecha = seleccion) {
    setEdicion(null)
    setFormulario(nuevoFormulario(fecha, responsable ? String(perfil.unidad.id) : (unidad === 'todas' ? '' : String(unidad))))
    setError('')
    setModal(true)
  }

  function abrirEdicion(a) {
    if (!puedeEditar(a)) return
    setEdicion(a)
    setFormulario({
      titulo: a.titulo, tipo: a.tipo, fecha: a.fecha,
      hora: a.hora?.slice(0, 5) || '', unidad_id: String(a.unidad_id),
      prioridad: a.prioridad, estado: a.estado,
      descripcion: a.descripcion || '', codigo_semoviente: a.codigo_semoviente || '',
    })
    setError('')
    setModal(true)
  }

  async function guardar(e) {
    e.preventDefault()
    if (!puedeCrear || ocupado) return
    const fallos = validarActividad(formulario)
    if (fallos) { setError(fallos); return }
    if (responsable && String(formulario.unidad_id) !== String(perfil.unidad.id)) {
      setError('Solo puede programar actividades en su unidad asignada.')
      return
    }
    setOcupado(true)
    setError('')
    try {
      const payload = {
        unidad_id: Number(formulario.unidad_id),
        titulo: formulario.titulo.trim(),
        tipo: formulario.tipo, fecha: formulario.fecha,
        hora: formulario.hora || null,
        descripcion: formulario.descripcion.trim(),
        codigo_semoviente: formulario.codigo_semoviente.trim().toUpperCase() || null,
        prioridad: formulario.prioridad, estado: formulario.estado,
      }
      const resultado = edicion
        ? await supabase.from('calendario_actividades').update({
          ...payload, actualizado_en: new Date().toISOString(), actualizado_por: uid,
        }).eq('id', edicion.id).select('id').single()
        : await supabase.from('calendario_actividades').insert(payload).select('id').single()
      if (resultado.error) throw resultado.error
      setAviso(edicion ? 'Actividad actualizada en el calendario.' : 'Actividad programada correctamente.')
      setModal(false)
      setMes(formulario.fecha.slice(0, 7))
      setSeleccion(formulario.fecha)
      setRecarga((v) => v + 1)
    } catch (fallo) {
      console.error('Error al guardar actividad:', fallo.code, fallo.message)
      setError(fallo.code === '42501' ? 'No tiene permiso para programar o modificar esta actividad.'
        : 'No se pudo guardar la actividad. Verifique los datos y permisos de Supabase.')
    } finally { setOcupado(false) }
  }

  async function cambiarEstado(a, siguiente) {
    if (ocupado || !puedeEditar(a)) return
    const mensaje = siguiente === 'realizada'
      ? '¿Marcar esta actividad como realizada en el calendario? No registrará automáticamente una vacuna, traslado ni control en otros módulos.'
      : '¿Cancelar esta actividad en la agenda? No cancela movimientos autorizados ni otros registros operativos.'
    if (!window.confirm(mensaje)) return
    setOcupado(true)
    setError('')
    try {
      const { error: fallo } = await supabase.from('calendario_actividades')
        .update({ estado: siguiente, actualizado_en: new Date().toISOString(), actualizado_por: uid })
        .eq('id', a.id).select('id').single()
      if (fallo) throw fallo
      setAviso('Estado de la actividad actualizado.')
      setRecarga((v) => v + 1)
    } catch (fallo) {
      console.error('Error al cambiar el estado del calendario:', fallo.code, fallo.message)
      setError('No se pudo cambiar el estado de la actividad. Revise permisos y conexión.')
    } finally { setOcupado(false) }
  }

  return <div className="cal-page">
    <header className="cal-hero">
      <div>
        <small>ARMADA BOLIVIANA · GESTIÓN DE SEMOVIENTES</small>
        <h1>Calendario de actividades</h1>
        <p>Organización de campañas sanitarias, movimientos previstos y tareas de cada unidad.</p>
      </div>
      {puedeCrear && <button className="cal-primary" onClick={() => abrirNuevo(fechaBolivia())}>+ Nueva actividad</button>}
    </header>
    <p className="cal-advertencia"><strong>Agenda de planificación.</strong> Marcar una actividad como realizada no registra vacunaciones, partos, traslados ni bajas en sus módulos oficiales.</p>
    {aviso && <p role="status" className="cal-notice">{aviso}</p>}
    {error && !modal && <p role="alert" className="cal-error">{error}</p>}
    <div className="cal-indicadores">
      <div><span>Programadas este mes</span><strong>{resumen.programadas}</strong></div>
      <div><span>Próximos 7 días en este mes</span><strong>{resumen.proximas}</strong></div>
      <div><span>Realizadas este mes</span><strong>{resumen.realizadas}</strong></div>
      <div><span>Vencidas sin marcar</span><strong>{resumen.vencidas}</strong></div>
    </div>
    <section className="cal-panel">
      <div className="cal-title"><h2>Filtros</h2><button className="cal-secondary" onClick={() => { setTipoFiltro('todas'); setEstadoFiltro('todas'); setBusqueda('') }}>Limpiar</button></div>
      <div className="cal-filtros">
        <label>Unidad operativa
          {responsable ? <input readOnly value={perfil?.unidad?.nombre || ''} />
            : <select value={unidad} onChange={(e) => setUnidad(e.target.value)}>
              <option value="todas">Todas las unidades autorizadas</option>
              {unidades.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>}
        </label>
        <label>Tipo de actividad
          <select value={tipoFiltro} onChange={(e) => setTipoFiltro(e.target.value)}>
            <option value="todas">Todos los tipos</option>
            {TIPOS_ACTIVIDAD.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
        </label>
        <label>Estado
          <select value={estadoFiltro} onChange={(e) => setEstadoFiltro(e.target.value)}>
            <option value="todas">Todos los estados</option>
            {ESTADOS_ACTIVIDAD.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
        </label>
        <label>Buscar
          <input placeholder="Título o código de referencia" value={busqueda} maxLength={120} onChange={(e) => setBusqueda(e.target.value)} />
        </label>
      </div>
    </section>
    <div className="cal-grilla-principal">
      <section className="cal-panel">
        <div className="cal-title cal-navegacion">
          <h2>{mesFormateado(mes)}</h2>
          <div>
            <button className="cal-secondary" onClick={() => moverMes(-1)} aria-label="Mes anterior">‹</button>
            <button className="cal-secondary" onClick={() => { setMes(fechaBolivia().slice(0,7)); setSeleccion(fechaBolivia()) }}>Hoy</button>
            <button className="cal-secondary" onClick={() => moverMes(1)} aria-label="Mes siguiente">›</button>
          </div>
        </div>
        <div className="cal-mes">
          {DOW.map((x) => <div className="cal-dia-titulo" key={x}>{x}</div>)}
          {diasCalendario(mes).map((dia, i) => dia ? <button key={dia}
              className={`cal-dia ${dia === seleccion ? 'seleccionado' : ''} ${dia === fechaBolivia() ? 'hoy' : ''}`}
              onClick={() => setSeleccion(dia)} aria-label={`Ver actividades del ${fechaCorta(dia)}`}>
              <span>{Number(dia.slice(-2))}</span>
              <div className="cal-puntos">{(agrupadas.get(dia) || []).slice(0, 4).map((a) => <i key={a.id} className={`cal-punto ${a.estado} ${a.prioridad}`} />)}</div>
              {(agrupadas.get(dia) || []).length > 4 && <small>+{agrupadas.get(dia).length - 4}</small>}
            </button> : <div key={`vacio-${i}`} className="cal-dia vacio" />)}
        </div>
        <div className="cal-leyenda"><span>● Programada</span><span>● Realizada</span><span>● Cancelada</span></div>
        {cargando && <p role="status">Cargando actividades…</p>}
      </section>
      <section className="cal-panel cal-agenda">
        <div className="cal-title">
          <div><h2>Agenda del día</h2><p>{fechaCorta(seleccion)}</p></div>
          {puedeCrear && <button className="cal-secondary" onClick={() => abrirNuevo(seleccion)}>+ Añadir</button>}
        </div>
        {!cargando && !actividadesDia.length && <p className="cal-vacio">No hay actividades programadas para este día con los filtros seleccionados.</p>}
        {actividadesDia.map((a) => <article className="cal-evento" key={a.id}>
          <div className="cal-evento-encabezado">
            <span className={`cal-tipo ${a.tipo}`}>{etiqueta(TIPOS_ACTIVIDAD, a.tipo)}</span>
            <span className={`cal-estado ${a.estado}`}>{etiqueta(ESTADOS_ACTIVIDAD, a.estado)}</span>
          </div>
          <h3>{a.titulo}</h3>
          <p>{a.hora?.slice(0,5) || 'Sin hora'} · {unidadNombre(a.unidad_id)}{a.prioridad === 'alta' ? ' · Prioridad alta' : ''}</p>
          {a.codigo_semoviente && <p>Código de referencia: <strong>{a.codigo_semoviente}</strong></p>}
          {a.descripcion && <p>{a.descripcion}</p>}
          {puedeEditar(a) && <div className="cal-acciones">
            <button className="cal-secondary" onClick={() => abrirEdicion(a)} disabled={ocupado}>Editar</button>
            {a.estado === 'programada' && <>
              <button className="cal-secondary" onClick={() => cambiarEstado(a, 'realizada')} disabled={ocupado}>Marcar realizada</button>
              <button className="cal-secondary" onClick={() => cambiarEstado(a, 'cancelada')} disabled={ocupado}>Cancelar agenda</button>
            </>}
          </div>}
        </article>)}
      </section>
    </div>
    <p className="cal-pie">Visible según los permisos de Supabase · {filtradas.length} actividades este mes · No se borran actividades: pueden marcarse como canceladas.</p>

    {modal && <div className="cal-modal-fondo" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !ocupado) setModal(false) }}>
      <div className="cal-modal" role="dialog" aria-modal="true" aria-labelledby="cal-titulo-modal">
        <div className="cal-title">
          <h2 id="cal-titulo-modal">{edicion ? 'Editar actividad' : 'Nueva actividad'}</h2>
          <button type="button" className="cal-secondary" onClick={() => setModal(false)} disabled={ocupado}>Cerrar</button>
        </div>
        <form onSubmit={guardar}>
          {error && <p role="alert" className="cal-error">{error}</p>}
          <div className="cal-form">
            <label className="ancho">Título *
              <input required minLength={5} maxLength={120} value={formulario.titulo} onChange={(e) => setFormulario((v) => ({ ...v, titulo: e.target.value }))} placeholder="Ej. Vacunación de ganado bovino" />
            </label>
            <label>Tipo de actividad *
              <select required value={formulario.tipo} onChange={(e) => setFormulario((v) => ({ ...v, tipo: e.target.value }))}>
                {TIPOS_ACTIVIDAD.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
            </label>
            <label>Unidad *
              {responsable ? <input readOnly value={perfil.unidad.nombre} />
                : <select required value={formulario.unidad_id} onChange={(e) => setFormulario((v) => ({ ...v, unidad_id: e.target.value }))}>
                  <option value="">Seleccione una unidad</option>
                  {unidades.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                </select>}
            </label>
            <label>Fecha *
              <input required type="date" value={formulario.fecha} onChange={(e) => setFormulario((v) => ({ ...v, fecha: e.target.value }))} />
            </label>
            <label>Hora (opcional)
              <input type="time" value={formulario.hora} onChange={(e) => setFormulario((v) => ({ ...v, hora: e.target.value }))} />
            </label>
            <label>Prioridad
              <select value={formulario.prioridad} onChange={(e) => setFormulario((v) => ({ ...v, prioridad: e.target.value }))}>
                {PRIO_ACTIVIDAD.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
            </label>
            <label>Estado de agenda
              <select value={formulario.estado} onChange={(e) => setFormulario((v) => ({ ...v, estado: e.target.value }))}>
                {ESTADOS_ACTIVIDAD.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
            </label>
            <label className="ancho">Código del semoviente (referencia opcional)
              <input maxLength={80} value={formulario.codigo_semoviente} onChange={(e) => setFormulario((v) => ({ ...v, codigo_semoviente: e.target.value }))} placeholder="Ej. 009 · No altera la ficha del animal" />
            </label>
            <label className="ancho">Descripción / instrucciones
              <textarea maxLength={2000} rows={3} value={formulario.descripcion} onChange={(e) => setFormulario((v) => ({ ...v, descripcion: e.target.value }))} placeholder="Detalles, responsables o materiales requeridos" />
            </label>
          </div>
          <p className="cal-advertencia">Los cambios de estado corresponden solo a la agenda y no ejecutan procedimientos de otros módulos.</p>
          <div className="cal-acciones cal-modal-acciones">
            <button type="button" className="cal-secondary" disabled={ocupado} onClick={() => setModal(false)}>Volver</button>
            <button type="submit" className="cal-primary" disabled={ocupado}>{ocupado ? 'Guardando…' : (edicion ? 'Guardar cambios' : 'Programar actividad')}</button>
          </div>
        </form>
      </div>
    </div>}
  </div>
}

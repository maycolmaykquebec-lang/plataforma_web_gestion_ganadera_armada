import { useEffect, useRef, useState } from 'react'
import { supabase } from '../services/supabaseClient'
import { usePerfil } from '../contexts/PerfilContext'
import { puedeRegistrar } from '../auth/permisos'
import { ESPECIES_HABILITADAS } from '../utils/especies'
import './MovimientosPage.css'

const ESTADOS = {
  pendiente: 'Pendiente de autorización',
  aprobado: 'Autorizado · pendiente de recepción',
  ejecutado: 'Recibido',
  rechazado: 'Rechazado',
  cancelado: 'Cancelado',
}

function hoyBolivia() {
  const partes = new Intl.DateTimeFormat('es-BO', {
    timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const valor = tipo => partes.find(p => p.type === tipo)?.value
  return `${valor('year')}-${valor('month')}-${valor('day')}`
}

function fechaVisible(fecha) {
  if (!fecha) return '—'
  const [anio, mes, dia] = fecha.slice(0, 10).split('-')
  return `${dia}/${mes}/${anio}`
}

function fechaHoraVisible(fecha) {
  if (!fecha) return '—'
  return new Intl.DateTimeFormat('es-BO', {
    timeZone: 'America/La_Paz', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(fecha))
}

function errorCancelacion(e) {
  // Solo se muestran errores de negocio conocidos, no detalles internos de la base.
  const detalle = e?.message || ''
  if (e?.code === '42501') return 'No tiene permiso para cancelar esta solicitud. Solo el Supervisor Departamento VII puede hacerlo.'
  if (/Solo se puede cancelar un traslado aprobado/i.test(detalle)) return 'La solicitud ya no está aprobada o el traslado ya fue ejecutado. Actualice el listado.'
  if (/Solo se puede cancelar una solicitud pendiente/i.test(detalle)) return 'La solicitud ya no está pendiente o ya fue autorizada. Actualice el listado.'
  if (/semoviente ya no est[aá] activo/i.test(detalle)) return 'No es posible cancelar: el semoviente ya no está activo en la unidad de origen.'
  if (/fundamento de cancelaci[oó]n/i.test(detalle)) return 'La justificación debe contener entre 15 y 1000 caracteres.'
  if (/referencia documental/i.test(detalle)) return 'La referencia documental no debe superar 200 caracteres.'
  if (e?.code === 'PGRST202' || e?.code === '42883') return 'La función de cancelación no está instalada en Supabase. Contacte al administrador.'
  return 'No se pudo cancelar el traslado. Revise su estado, los permisos y la conexión.'
}

function CancelarTrasladoModal({ solicitud, nombreUnidad, onCerrar, onCancelado }) {
  const dialogo = useRef(null)
  const [motivo, setMotivo] = useState('')
  const [referencia, setReferencia] = useState('')
  const [confirmado, setConfirmado] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const pendiente = solicitud.estado === 'pendiente'

  useEffect(() => {
    const elemento = dialogo.current
    elemento?.showModal()
    return () => { if (elemento?.open) elemento.close() }
  }, [])

  async function confirmar(e) {
    e.preventDefault()
    if (guardando) return
    if (!confirmado) { setError('Confirme que el traslado no fue ejecutado.'); return }
    if (motivo.trim().length < 15 || motivo.trim().length > 1000) {
      setError('Escriba un fundamento de cancelación de 15 a 1000 caracteres.'); return
    }
    setGuardando(true)
    setError('')
    try {
      const resultado = await supabase.rpc(pendiente ? 'rb_cancelar_traslado_pendiente' : 'rb_cancelar_traslado_aprobado', {
        p_solicitud_id: solicitud.id,
        p_motivo: motivo.trim(),
        p_referencia_documental: referencia.trim() || null,
      })
      if (resultado.error) throw resultado.error
      onCancelado(solicitud.id)
    } catch (e) {
      setError(errorCancelacion(e))
    } finally {
      setGuardando(false)
    }
  }

  return <dialog ref={dialogo} className="mov-cancel-dialog" aria-labelledby="mov-cancel-titulo"
    onCancel={e => { if (guardando) e.preventDefault(); else onCerrar() }}>
    <div className="mov-cancel-header">
      <div><small>SUPERVISOR DEPARTAMENTO VII</small><h2 id="mov-cancel-titulo">{pendiente ? 'Cancelar solicitud pendiente' : 'Cancelar traslado aprobado'}</h2></div>
      <button type="button" className="mov-secundario" disabled={guardando} onClick={onCerrar} aria-label="Cerrar">×</button>
    </div>
    <p>Esta operación <strong>no da de baja al semoviente</strong>. {pendiente ? 'Cancela la solicitud antes de autorizarla.' : 'Cancela la autorización de un traslado que no llegó a ejecutarse.'}</p>
    <dl className="mov-cancel-resumen">
      <div><dt>Solicitud</dt><dd>N.º {solicitud.id}</dd></div>
      <div><dt>Semoviente</dt><dd>{solicitud.semoviente?.codigo || `ID ${solicitud.semoviente_id}`}</dd></div>
      <div><dt>Origen</dt><dd>{nombreUnidad(solicitud.unidad_origen_id)}</dd></div>
      <div><dt>Destino</dt><dd>{nombreUnidad(solicitud.unidad_destino_id)}</dd></div>
      <div><dt>Estado</dt><dd>{pendiente ? 'Pendiente de autorización' : 'Aprobado, no ejecutado'}</dd></div>
      {!pendiente && <div><dt>Autorización original</dt><dd>{fechaHoraVisible(solicitud.fecha_autorizacion)}</dd></div>}
    </dl>
    <form onSubmit={confirmar} className="mov-cancel-form">
      <label htmlFor="mov-fundamento">Justificación de la cancelación <span aria-hidden="true">*</span>
        <textarea id="mov-fundamento" required minLength={15} maxLength={1000} rows={4}
          placeholder="Describa el motivo real de la cancelación y las circunstancias documentadas."
          disabled={guardando} value={motivo} onChange={e => setMotivo(e.target.value)} />
        <small>{motivo.trim().length}/1000 caracteres (mínimo 15)</small>
      </label>
      <label htmlFor="mov-referencia">Referencia documental (opcional)
        <input id="mov-referencia" maxLength={200} disabled={guardando} value={referencia}
          onChange={e => setReferencia(e.target.value)} placeholder="N.º de informe, nota o acta" />
      </label>
      <label className="mov-cancel-check">
        <input type="checkbox" checked={confirmado} disabled={guardando}
          onChange={e => setConfirmado(e.target.checked)} />
        <span>Confirmo que el traslado no fue ejecutado y que la justificación corresponde a hechos documentados.</span>
      </label>
      <p className="mov-cancel-nota">La solicitud quedará con estado <strong>Cancelado</strong>. {pendiente ? 'No se registrará ninguna autorización.' : 'Se conservarán el autorizador y la fecha de aprobación originales.'} La cancelación quedará registrada en auditoría.</p>
      {error && <p className="mov-error" role="alert">{error}</p>}
      <div className="mov-cancel-actions">
        <button type="button" className="mov-secundario" disabled={guardando} onClick={onCerrar}>Volver</button>
        <button type="submit" className="mov-peligro" disabled={guardando || !confirmado || motivo.trim().length < 15}>
          {guardando ? 'Registrando cancelación…' : 'Confirmar cancelación'}
        </button>
      </div>
    </form>
  </dialog>
}

export default function MovimientosPage() {
  const perfil = usePerfil()
  const responsable = puedeRegistrar(perfil)
  const supervisor = perfil?.rol?.codigo === 'SUP_DEPTO_VII'
  const [unidades, setUnidades] = useState([])
  const [filas, setFilas] = useState([])
  const [codigo, setCodigo] = useState('')
  const [destino, setDestino] = useState('')
  const [fechaPrevista, setFechaPrevista] = useState(hoyBolivia)
  const [motivo, setMotivo] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [recarga, setRecarga] = useState(0)
  const [solicitudCancelar, setSolicitudCancelar] = useState(null)

  useEffect(() => {
    let vigente = true
    async function cargar() {
      setCargando(true)
      try {
        const [u, m] = await Promise.all([
          supabase.from('unidades_operativas').select('id,codigo,nombre').order('nombre'),
          supabase.from('solicitudes_movimientos').select(`
            id, semoviente_id, unidad_origen_id, unidad_destino_id,
            fecha_prevista, motivo, estado, creado_en,
            fecha_autorizacion, fecha_ejecucion,
            cancelado_por, cancelado_en, motivo_cancelacion, referencia_cancelacion,
            semoviente:semovientes!inner(codigo,especie)
          `).in('semoviente.especie', ESPECIES_HABILITADAS).order('creado_en', { ascending: false }).limit(100),
        ])
        if (u.error || m.error) throw u.error || m.error
        if (vigente) { setUnidades(u.data || []); setFilas(m.data || []) }
      } catch (e) {
        if (vigente) {
          setFilas([])
          setUnidades([])
          setError(e?.code === '42703' || e?.code === 'PGRST204'
            ? 'Falta instalar la actualización SQL V4.2 en Supabase. Instale primero 07_cancelar_traslado_aprobado.sql.'
            : 'No se pudieron cargar las solicitudes. Verifique la conexión y la adaptación de la base existente.')
        }
      } finally { if (vigente) setCargando(false) }
    }
    cargar()
    return () => { vigente = false }
  }, [recarga])

  async function ejecutar(accion) {
    if (ocupado) return
    setOcupado(true); setError(''); setMensaje('')
    try {
      await accion()
      setMensaje('Operación registrada correctamente.')
      setRecarga(n => n + 1)
    } catch {
      setError('No se pudo completar la operación. Verifique los datos, el estado de la solicitud y sus permisos.')
    } finally { setOcupado(false) }
  }

  async function solicitar(e) {
    e.preventDefault()
    if (!codigo.trim() || motivo.trim().length < 10) {
      setMensaje('')
      setError('Indique el código del semoviente y un motivo de al menos 10 caracteres.')
      return
    }
    await ejecutar(async () => {
      const { data, error: fallo } = await supabase.from('semovientes')
        .select('id').eq('codigo', codigo.trim().toUpperCase())
        .eq('unidad_id', perfil.unidad.id).eq('estado', 'Activo').in('especie', ESPECIES_HABILITADAS).single()
      if (fallo || !data) throw fallo || Error('Animal no disponible')
      const resultado = await supabase.rpc('solicitar_movimiento', {
        p_semoviente: data.id,
        p_destino: Number(destino),
        p_motivo: motivo.trim(),
        p_fecha_prevista: fechaPrevista,
      })
      if (resultado.error) throw resultado.error
      setCodigo(''); setDestino(''); setMotivo(''); setFechaPrevista(hoyBolivia())
    })
  }

  function transicion(nombre, id) {
    return ejecutar(async () => {
      const resultado = await supabase.rpc(nombre, { p_movimiento: id })
      if (resultado.error) throw resultado.error
    })
  }

  const nombreUnidad = id => unidades.find(u => String(u.id) === String(id))?.nombre || '—'
  return <div className="movimientos-page">
    <header>
      <small>ARMADA BOLIVIANA · CONTROL DE SEMOVIENTES</small>
      <h1>Movimientos entre unidades</h1>
      <p>Solicitud en origen → autorización del Supervisor → recepción en destino.</p>
    </header>
    {error && <p role="alert" className="mov-error">{error}</p>}
    {mensaje && <p role="status" className="mov-exito">{mensaje}</p>}
    {responsable && <section>
      <h2>Solicitar traslado</h2>
      <p>Unidad de origen: <strong>{perfil.unidad.nombre}</strong>. El animal permanecerá en origen hasta confirmar su recepción.</p>
      <form onSubmit={solicitar}>
        <label>Código del semoviente
          <input required maxLength={80} disabled={ocupado} value={codigo} onChange={e => setCodigo(e.target.value)} />
        </label>
        <label>Unidad de destino
          <select required disabled={ocupado} value={destino} onChange={e => setDestino(e.target.value)}>
            <option value="">Seleccione una unidad</option>
            {unidades.filter(u => String(u.id) !== String(perfil.unidad.id)).map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
        </label>
        <label>Fecha prevista del traslado
          <input required type="date" disabled={ocupado} value={fechaPrevista} onChange={e => setFechaPrevista(e.target.value)} />
        </label>
        <label className="mov-motivo">Motivo
          <textarea required minLength={10} maxLength={1000} disabled={ocupado} value={motivo} onChange={e => setMotivo(e.target.value)} />
        </label>
        <button disabled={ocupado || cargando}>Enviar solicitud</button>
      </form>
    </section>}
    <section>
      <div className="mov-heading">
        <h2>Seguimiento de movimientos</h2>
        <button disabled={ocupado || cargando} onClick={() => { setError(''); setRecarga(n => n + 1) }}>Actualizar</button>
      </div>
      <p>Últimas 100 solicitudes visibles según su rol y unidad. La autorización no cambia la ubicación del animal.</p>
      <div className="mov-scroll"><table>
        <thead><tr><th scope="col">N.º</th><th scope="col">Semoviente</th><th scope="col">Origen</th><th scope="col">Destino</th><th scope="col">Fecha prevista</th><th scope="col">Motivo</th><th scope="col">Estado</th><th scope="col">Acción</th></tr></thead>
        <tbody>
          {filas.map(m => <tr key={m.id}>
            <td>{m.id}</td>
            <td>{m.semoviente?.codigo || `ID ${m.semoviente_id}`}</td>
            <td>{nombreUnidad(m.unidad_origen_id)}</td>
            <td>{nombreUnidad(m.unidad_destino_id)}</td>
            <td>{fechaVisible(m.fecha_prevista)}</td>
            <td>{m.motivo}</td>
            <td>
              <span className={`mov-estado ${m.estado === 'cancelado' ? 'mov-estado--cancelado' : ''}`}>{ESTADOS[m.estado] || m.estado}</span>
              {m.estado === 'cancelado' && m.motivo_cancelacion && <div className="mov-cancel-detalle">
                <strong>Cancelación:</strong> {m.motivo_cancelacion}
                {m.referencia_cancelacion && <div><strong>Referencia:</strong> {m.referencia_cancelacion}</div>}
                {m.cancelado_en && <div><strong>Fecha:</strong> {fechaHoraVisible(m.cancelado_en)}</div>}
              </div>}
            </td>
            <td><div className="mov-botones">
              {supervisor && m.estado === 'pendiente' &&
                <button disabled={ocupado} onClick={() => transicion('autorizar_movimiento', m.id)}>Autorizar</button>}
              {supervisor && (m.estado === 'pendiente' || m.estado === 'aprobado') && !m.fecha_ejecucion &&
                <button type="button" className="mov-peligro" disabled={ocupado}
                  onClick={() => { setMensaje(''); setError(''); setSolicitudCancelar(m) }}>
                  Cancelar traslado
                </button>}
              {responsable && String(m.unidad_destino_id) === String(perfil.unidad.id) && m.estado === 'aprobado' &&
                <button disabled={ocupado} onClick={() => transicion('confirmar_recepcion', m.id)}>Confirmar recepción</button>}
              {!((supervisor && (m.estado === 'pendiente' || (m.estado === 'aprobado' && !m.fecha_ejecucion))) ||
                (responsable && String(m.unidad_destino_id) === String(perfil.unidad.id) && m.estado === 'aprobado')) && '—'}
            </div></td>
          </tr>)}
          {!filas.length && <tr><td colSpan={8}>{cargando ? 'Cargando solicitudes…' : 'No hay solicitudes disponibles.'}</td></tr>}
        </tbody>
      </table></div>
    </section>
    {solicitudCancelar && <CancelarTrasladoModal
      solicitud={solicitudCancelar}
      nombreUnidad={nombreUnidad}
      onCerrar={() => setSolicitudCancelar(null)}
      onCancelado={id => {
        setSolicitudCancelar(null)
        setError('')
        setMensaje(`Traslado N.º ${id} cancelado correctamente. La justificación quedó registrada. El semoviente permanece en su unidad de origen.`)
        setRecarga(n => n + 1)
      }} />}
  </div>
}

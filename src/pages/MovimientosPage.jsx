import { useEffect, useState } from 'react'
import { supabase } from '../services/supabaseClient'
import { usePerfil } from '../contexts/PerfilContext'
import { puedeRegistrar } from '../auth/permisos'
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
  const [anio, mes, dia] = fecha.split('-')
  return `${dia}/${mes}/${anio}`
}

export default function MovimientosPage() {
  const perfil = usePerfil()
  const responsable = puedeRegistrar(perfil)
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
            semoviente:semovientes(codigo)
          `).order('creado_en', { ascending: false }).limit(100),
        ])
        if (u.error || m.error) throw u.error || m.error
        if (vigente) { setUnidades(u.data || []); setFilas(m.data || []) }
      } catch {
        if (vigente) {
          setFilas([])
          setUnidades([])
          setError('No se pudieron cargar las solicitudes. Verifique la conexión y la adaptación de la base existente.')
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
        .eq('unidad_id', perfil.unidad.id).eq('estado', 'Activo').single()
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
            <td><span className="mov-estado">{ESTADOS[m.estado] || m.estado}</span></td>
            <td>{perfil.rol.codigo === 'SUP_DEPTO_VII' && m.estado === 'pendiente'
              ? <button disabled={ocupado} onClick={() => transicion('autorizar_movimiento', m.id)}>Autorizar</button>
              : responsable && String(m.unidad_destino_id) === String(perfil.unidad.id) && m.estado === 'aprobado'
                ? <button disabled={ocupado} onClick={() => transicion('confirmar_recepcion', m.id)}>Confirmar recepción</button>
                : '—'}
            </td>
          </tr>)}
          {!filas.length && <tr><td colSpan={8}>{cargando ? 'Cargando solicitudes…' : 'No hay solicitudes disponibles.'}</td></tr>}
        </tbody>
      </table></div>
    </section>
  </div>
}

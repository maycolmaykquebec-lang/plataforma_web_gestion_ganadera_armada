// RIO_BLANCO - PASO 18.5. Escritura reproductiva autorizada por RLS y triggers PostgreSQL.
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../services/supabaseClient'
import './NuevoControlReproductivoModal.css'

const ESPECIES = {
  bovino: 'Ganado vacuno', equino: 'Ganado equino',
  caprino: 'Ganado caprino', mular: 'Ganado mular',
  avicola: 'Ganado avícola', porcino: 'Ganado porcino'
}

const TIPOS_MAMIFEROS = [
  { id: 'monta', nombre: 'Servicio o monta' },
  { id: 'inseminacion', nombre: 'Inseminación artificial' },
  { id: 'gestacion', nombre: 'Diagnóstico de gestación', requiereHembra: true },
  { id: 'parto', nombre: 'Parto', requiereHembra: true },
  { id: 'nacimiento', nombre: 'Registro de nacimiento', requiereHembra: true },
  { id: 'evaluacion', nombre: 'Evaluación reproductiva' },
  { id: 'seguimiento', nombre: 'Seguimiento reproductivo' }
]
const TIPOS_AVICOLAS = [
  { id: 'postura', nombre: 'Registro de postura', requiereHembra: true },
  { id: 'incubacion', nombre: 'Incubación de huevos' },
  { id: 'fertilidad', nombre: 'Evaluación de fertilidad' },
  { id: 'eclosion', nombre: 'Eclosión' },
  { id: 'seguimiento', nombre: 'Seguimiento reproductivo' }
]
const TIPOS_MULARES = [
  { id: 'evaluacion', nombre: 'Evaluación reproductiva excepcional' },
  { id: 'seguimiento', nombre: 'Seguimiento reproductivo excepcional' }
]

// PASO 18.7: validacion prudente por CLASIFICACION, no un umbral fijo de edad.
// Se aplica a bovinos que aun figuran en la ficha como Ternero / Ternera.
const EVENTOS_SERVICIO_BOVINO_JOVEN = new Set([
  'monta', 'inseminacion', 'gestacion', 'parto', 'nacimiento'
])
function esBovinoClasificadoTernero(animal) {
  return animal?.especie === 'bovino' &&
    ['ternero', 'ternera'].includes(String(animal?.categoria || '').trim().toLocaleLowerCase('es'))
}

const VACIO = {
  tipo: '', fecha: '', responsable: '', resultado: '',
  reproductor: '', metodo: '', fechaProbable: '', cantidadCrias: '',
  crias: '', huevos: '', huevosFertiles: '', nacidos: '',
  detalle: '', observaciones: '', proximoControl: ''
}

function hoyLocal() {
  const d = new Date()
  const dos = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`
}

function tiposPara(animal) {
  let lista = animal?.especie === 'avicola' ? TIPOS_AVICOLAS
    : animal?.especie === 'mular' ? TIPOS_MULARES
      : TIPOS_MAMIFEROS
  if (animal?.sexo === 'Macho') {
    lista = lista.filter(x => !x.requiereHembra)
  }
  if (esBovinoClasificadoTernero(animal)) {
    lista = lista.filter(x => !EVENTOS_SERVICIO_BOVINO_JOVEN.has(x.id))
  }
  return lista
}

function NuevoControlReproductivoModal({ animal, unidad, onCerrar, onGuardado }) {
  const abierto = Boolean(animal?.id)
  const [datos, setDatos] = useState({ ...VACIO })
  const [errores, setErrores] = useState({})
  const [guardando, setGuardando] = useState(false)
  const [errorGuardado, setErrorGuardado] = useState('')
  const guardandoRef = useRef(false)
  const modalRef = useRef(null)
  const primerCampo = useRef(null)
  const cerrarRef = useRef(onCerrar)
  cerrarRef.current = () => { if (!guardandoRef.current) onCerrar?.() }

  useEffect(() => {
    if (!abierto) return
    setDatos({ ...VACIO })
    setErrores({})
    setErrorGuardado('')
    setGuardando(false)
    guardandoRef.current = false
    const anterior = document.activeElement
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const frame = requestAnimationFrame(() => {
      modalRef.current?.querySelector('.rcm-cuerpo')?.scrollTo({ top: 0 })
      primerCampo.current?.focus({ preventScroll: true })
    })
    function teclado(evento) {
      if (evento.key === 'Escape') {
        evento.preventDefault()
        cerrarRef.current?.()
      }
      if (evento.key !== 'Tab' || !modalRef.current) return
      const elementos = Array.from(modalRef.current.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])'
      ))
      if (elementos.length === 0) return
      if (evento.shiftKey && document.activeElement === elementos[0]) {
        evento.preventDefault()
        elementos[elementos.length - 1].focus()
      } else if (!evento.shiftKey && document.activeElement === elementos[elementos.length - 1]) {
        evento.preventDefault()
        elementos[0].focus()
      }
    }
    window.addEventListener('keydown', teclado)
    return () => {
      cancelAnimationFrame(frame)
      document.body.style.overflow = overflow
      window.removeEventListener('keydown', teclado)
      anterior?.focus?.()
    }
  }, [abierto, animal?.id])

  if (!abierto) return null

  const tipos = tiposPara(animal)
  const aves = animal.especie === 'avicola'
  const servicio = ['monta', 'inseminacion'].includes(datos.tipo)
  const gestacion = datos.tipo === 'gestacion'
  const nacimiento = ['parto', 'nacimiento'].includes(datos.tipo)
  const huevos = ['postura', 'incubacion', 'fertilidad', 'eclosion'].includes(datos.tipo)

  function cambiar(campo, valor) {
    setDatos(actual => ({
      ...actual,
      ...(campo === 'tipo' ? { ...VACIO, fecha: actual.fecha, responsable: actual.responsable } : {}),
      [campo]: valor
    }))
    setErrorGuardado('')
    setErrores(actual => ({ ...actual, [campo]: undefined }))
  }

  async function validar(e) {
    e.preventDefault()
    if (guardandoRef.current) return
    const erroresNuevos = {}
    if (!tipos.some(t => t.id === datos.tipo)) erroresNuevos.tipo = 'Seleccione un acontecimiento aplicable a este animal.'
    if (esBovinoClasificadoTernero(animal) && EVENTOS_SERVICIO_BOVINO_JOVEN.has(datos.tipo)) {
      erroresNuevos.tipo = 'El animal figura como Ternero/Ternera. Solo puede registrar evaluación o seguimiento; solicite corrección de clasificación si procede.'
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datos.fecha) || datos.fecha > hoyLocal()) {
      erroresNuevos.fecha = 'Indique una fecha válida, no futura.'
    }
    if (datos.responsable.trim().length < 3) erroresNuevos.responsable = 'Indique quién documentó el control (mínimo 3 caracteres).'
    if (datos.resultado.trim().length < 3) erroresNuevos.resultado = 'Describa el resultado o estado documentado.'
    if (datos.detalle.trim().length < 5) erroresNuevos.detalle = 'Describa el acontecimiento con al menos 5 caracteres.'
    if (datos.fechaProbable && datos.fecha && datos.fechaProbable < datos.fecha) {
      erroresNuevos.fechaProbable = 'La fecha estimada debe ser posterior o igual al control.'
    }
    if (datos.proximoControl && datos.fecha && datos.proximoControl < datos.fecha) {
      erroresNuevos.proximoControl = 'El próximo control debe ser igual o posterior al acontecimiento.'
    }
    const enteroPositivo = texto => /^\d+$/.test(texto) && Number(texto) > 0 && Number(texto) <= 1000000
    const enteroNoNegativo = texto => /^\d+$/.test(texto) && Number(texto) >= 0 && Number(texto) <= 1000
    if (nacimiento && !enteroPositivo(datos.cantidadCrias)) {
      erroresNuevos.cantidadCrias = 'Registre una cantidad de crías mayor a cero.'
    }
    if (huevos && !enteroPositivo(datos.huevos)) {
      erroresNuevos.huevos = 'Registre una cantidad positiva de huevos.'
    }
    if (datos.huevosFertiles && !enteroNoNegativo(datos.huevosFertiles)) {
      erroresNuevos.huevosFertiles = 'Indique un número entero no negativo.'
    }
    if (datos.nacidos && !enteroNoNegativo(datos.nacidos)) {
      erroresNuevos.nacidos = 'Indique un número entero no negativo.'
    }
    if (datos.huevos && datos.huevosFertiles && Number(datos.huevosFertiles) > Number(datos.huevos)) {
      erroresNuevos.huevosFertiles = 'No puede superar la cantidad de huevos.'
    }
    if (datos.huevos && datos.nacidos && Number(datos.nacidos) > Number(datos.huevos)) {
      erroresNuevos.nacidos = 'No puede superar la cantidad de huevos.'
    }
    if (datos.huevosFertiles && datos.nacidos && Number(datos.nacidos) > Number(datos.huevosFertiles)) {
      erroresNuevos.nacidos = 'Los nacimientos no pueden superar los huevos fértiles.'
    }
    if (datos.metodo.length > 150) erroresNuevos.metodo = 'Máximo 150 caracteres.'
    if (datos.reproductor.length > 80) erroresNuevos.reproductor = 'Máximo 80 caracteres.'
    if (datos.crias.length > 1500) erroresNuevos.crias = 'Máximo 1500 caracteres.'
    if (datos.observaciones.length > 1500) erroresNuevos.observaciones = 'Máximo 1500 caracteres.'
    setErrores(erroresNuevos)
    if (Object.keys(erroresNuevos).length > 0) return

    const opcional = (valor) => valor.trim() || null
    // NO enviar id, registrado_por, registrado_en ni unidad_id.
    // El perfil y la pertenencia a la unidad se comprueban con RLS en PostgreSQL.
    const registro = {
      semoviente_id: animal.id,
      tipo_evento: datos.tipo,
      fecha_evento: datos.fecha,
      responsable_reproductivo: datos.responsable.trim(),
      resultado: datos.resultado.trim(),
      detalle: datos.detalle.trim(),
      reproductor_codigo: (servicio || gestacion || nacimiento) ? opcional(datos.reproductor) : null,
      metodo: (servicio || gestacion) ? opcional(datos.metodo) : null,
      fecha_parto_probable: gestacion ? (datos.fechaProbable || null) : null,
      cantidad_crias: nacimiento ? Number(datos.cantidadCrias) : null,
      crias_codigos_referencia: nacimiento ? opcional(datos.crias) : null,
      cantidad_huevos: huevos ? Number(datos.huevos) : null,
      huevos_fertiles: huevos && datos.huevosFertiles !== '' ? Number(datos.huevosFertiles) : null,
      nacidos_eclosion: huevos && datos.nacidos !== '' ? Number(datos.nacidos) : null,
      proximo_control: datos.proximoControl || null,
      observaciones: opcional(datos.observaciones)
    }

    guardandoRef.current = true
    setGuardando(true)
    setErrorGuardado('')
    try {
      // Sin .select(): el rol authenticated tiene INSERT limitado por columnas.
      // El trigger crea el acontecimiento historico en la misma transaccion.
      const { error } = await supabase.from('controles_reproductivos').insert(registro)
      if (error) {
        console.error('RIO_BLANCO 18.5 - Error reproductivo:', error.code, error.message)
        if (error.code === '42501') {
          setErrorGuardado('Acceso denegado. Compruebe el rol RESP_UNIDAD y la unidad asignada.')
        } else if (['23514', '23502', '22003', '22001', '23503'].includes(error.code)) {
          setErrorGuardado('Los datos no cumplen las reglas de la base de datos o el animal ya no está disponible.')
        } else {
          setErrorGuardado('No se pudo guardar el acontecimiento. Verifique la conexión e intente nuevamente.')
        }
        return
      }
      onGuardado?.(animal)
    } catch (error) {
      console.error('RIO_BLANCO 18.5 - Error de red:', error)
      setErrorGuardado('No fue posible conectar con Supabase. El registro no pudo confirmarse.')
    } finally {
      guardandoRef.current = false
      setGuardando(false)
    }
  }

  function campo(id, etiqueta, config = {}) {
    return (
      <div className={`rcm-campo ${config.completo ? 'rcm-completo' : ''}`}>
        <label htmlFor={`rcm-${id}`}>{etiqueta}{config.requerido ? ' *' : ''}</label>
        {config.largo ? (
          <textarea id={`rcm-${id}`} rows={config.filas || 3} maxLength={config.maxLength || 1500}
            placeholder={config.placeholder || ''} value={datos[id]} disabled={guardando}
            onChange={e => cambiar(id, e.target.value)} aria-invalid={Boolean(errores[id])} />
        ) : (
          <input id={`rcm-${id}`} type={config.tipo || 'text'} min={config.min}
            max={config.max} maxLength={config.maxLength || 150}
            placeholder={config.placeholder || ''} value={datos[id]} disabled={guardando}
            onChange={e => cambiar(id, e.target.value)} aria-invalid={Boolean(errores[id])}/>
        )}
        {errores[id] && <small className="rcm-error" role="alert">{errores[id]}</small>}
      </div>
    )
  }

  return (
    <div className="rcm-capa">
      <section className="rcm-modal" ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="rcm-titulo" aria-busy={guardando}>
        <header className="rcm-cabecera">
          <div>
            <span className="rcm-sobretitulo">RIO_BLANCO · CONTROL REPRODUCTIVO · PASO 18.5</span>
            <h2 id="rcm-titulo">Nuevo acontecimiento reproductivo</h2>
            <p>Animal <strong>{animal.codigo}</strong> · {ESPECIES[animal.especie] || animal.especie} · {unidad || 'Unidad autorizada'}</p>
          </div>
          <button type="button" className="rcm-cerrar" aria-label="Cerrar formulario" disabled={guardando} onClick={onCerrar}>×</button>
        </header>

        <form className="rcm-formulario" onSubmit={validar} noValidate>
          <div className="rcm-cuerpo">
            <div className="rcm-aviso" role="note"><strong>ENTORNO DE DESARROLLO.</strong> Este formulario guarda datos ficticios en Supabase. No utilice información institucional real. Los datos guardados no se borran al reiniciar Vite.</div>

            <h3>1. Identificación del semoviente</h3>
            <div className="rcm-resumen">
              <div><small>Código individual</small><strong>{animal.codigo}</strong></div>
              <div><small>Especie</small><strong>{ESPECIES[animal.especie] || animal.especie}</strong></div>
              <div><small>Clase</small><strong>{animal.categoria || 'No registrada'}</strong></div>
              <div><small>Sexo</small><strong>{animal.sexo || 'No registrado'}</strong></div>
              <div><small>Unidad</small><strong>{unidad || 'No disponible'}</strong></div>
            </div>
            {animal.especie === 'mular' && (
              <p className="rcm-nota">Los mulares generalmente son estériles. En esta versión solo se permite preparar una evaluación o seguimiento reproductivo excepcional.</p>
            )}
            {esBovinoClasificadoTernero(animal) && (
              <p className="rcm-nota" role="note">Este semoviente está clasificado como {animal.categoria}. Para evitar registrar servicios, gestaciones o partos incompatibles con esta clasificación, solo se ofrecen evaluación y seguimiento reproductivo. Si la clasificación es incorrecta, solicite su corrección por la vía autorizada.</p>
            )}
            {animal.sexo === 'Macho' && (
              <p className="rcm-nota">El ejemplar registrado es macho. Este formulario no ofrece eventos de gestación, parto o postura para el animal seleccionado.</p>
            )}

            <h3>2. Acontecimiento reproductivo</h3>
            <div className="rcm-grid">
              <div className="rcm-campo">
                <label htmlFor="rcm-tipo">Tipo de acontecimiento *</label>
                <select id="rcm-tipo" ref={primerCampo} value={datos.tipo} disabled={guardando} onChange={e => cambiar('tipo', e.target.value)} aria-invalid={Boolean(errores.tipo)}>
                  <option value="">Seleccione un evento</option>
                  {tipos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                </select>
                {errores.tipo && <small className="rcm-error" role="alert">{errores.tipo}</small>}
              </div>
              {campo('fecha', 'Fecha del acontecimiento', { tipo: 'date', requerido: true, max: hoyLocal() })}
              {campo('responsable', 'Responsable que documenta', { completo: true, requerido: true, maxLength: 120, placeholder: 'Nombre de prueba del responsable' })}
              {campo('resultado', 'Resultado o estado documentado', { completo: true, requerido: true, maxLength: 200, placeholder: 'Ej.: seguimiento, confirmado, sin novedad' })}
            </div>

            {servicio && (
              <>
                <h3>3. Datos del servicio</h3>
                <div className="rcm-grid">
                  {campo('reproductor', 'Código del reproductor (si se conoce)', { placeholder: 'Ej.: RB-023' })}
                  {campo('metodo', 'Método o procedencia', { placeholder: 'Ej.: monta natural' })}
                </div>
              </>
            )}
            {gestacion && (
              <>
                <h3>3. Seguimiento de gestación</h3>
                <div className="rcm-grid">
                  {campo('metodo', 'Método de diagnóstico', { placeholder: 'Ej.: ecografía, palpación' })}
                  {campo('fechaProbable', 'Fecha probable de parto', { tipo: 'date', min: datos.fecha || undefined })}
                  {campo('reproductor', 'Código del reproductor (si se conoce)', { completo: true })}
                </div>
              </>
            )}
            {nacimiento && (
              <>
                <h3>3. Datos del parto o nacimiento</h3>
                <div className="rcm-grid">
                  {campo('cantidadCrias', 'Cantidad de crías', { tipo: 'number', requerido: true, min: '1' })}
                  {campo('reproductor', 'Código del reproductor (si se conoce)' )}
                  {campo('crias', 'Códigos de crías, si ya existen', { completo: true, placeholder: 'Separados por coma. No se registran animales nuevos.' })}
                </div>
                <p className="rcm-nota">La validación de este borrador no crea ni modifica registros de crías. El alta ganadera será un procedimiento separado y autorizado.</p>
              </>
            )}
            {huevos && (
              <>
                <h3>3. Control avícola</h3>
                <div className="rcm-grid">
                  {campo('huevos', 'Cantidad de huevos', { tipo: 'number', requerido: true, min: '1' })}
                  {campo('huevosFertiles', 'Huevos fértiles (si se conoce)', { tipo: 'number', min: '0' })}
                  {campo('nacidos', 'Nacimientos por eclosión (si corresponde)', { tipo: 'number', min: '0' })}
                </div>
              </>
            )}

            <h3>{servicio || gestacion || nacimiento || huevos ? '4' : '3'}. Detalle y observaciones</h3>
            <div className="rcm-grid">
              {campo('detalle', 'Descripción del acontecimiento', { largo: true, completo: true, requerido: true, maxLength: 1500, placeholder: 'Describe el acontecimiento usando datos ficticios' })}
              {campo('proximoControl', 'Próximo control programado', { tipo: 'date', min: datos.fecha || undefined })}
              {campo('observaciones', 'Observaciones complementarias', { largo: true, completo: true, maxLength: 1500 })}
            </div>
            {errorGuardado && <p className="rcm-error rcm-error-guardado" role="alert" style={{ padding: 12, borderRadius: 8, background: '#fff2f2', border: '1px solid #e0aaaa' }}>{errorGuardado}</p>}
          </div>
          <footer className="rcm-pie">
            <span>Registro de prueba · Guardado protegido por RLS</span>
            <div>
              <button type="button" className="rcm-cancelar" disabled={guardando} onClick={onCerrar}>Cancelar</button>
              <button type="submit" className="rcm-validar" disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar acontecimiento'}</button>
            </div>
          </footer>
        </form>
      </section>
    </div>
  )
}

export default NuevoControlReproductivoModal

// RIO_BLANCO - PASO 17.5 | Registro sanitario autorizado con Supabase.
// Escritura exclusivamente a traves de RLS y triggers PostgreSQL.
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../services/supabaseClient'
import './NuevoControlSanitarioModal.css'

const ESPECIES = {
  bovino: 'Ganado vacuno',
  equino: 'Ganado equino',
  caprino: 'Ganado caprino',
  mular: 'Ganado mular',
  porcino: 'Ganado porcino'
}

const TIPOS = [
  { valor: 'Vacunación', etiqueta: 'Vacunación' },
  { valor: 'Desparasitación', etiqueta: 'Desparasitación' },
  { valor: 'Diagnóstico', etiqueta: 'Enfermedad o diagnóstico' },
  { valor: 'Tratamiento', etiqueta: 'Tratamiento veterinario' },
  { valor: 'Revisión', etiqueta: 'Consulta o revisión veterinaria' },
  { valor: 'Control preventivo', etiqueta: 'Control preventivo' }
]

const REGISTRO_INICIAL = {
  tipo: '',
  fecha: '',
  responsable: '',
  motivo: '',
  diagnostico: '',
  producto: '',
  dosis: '',
  unidadDosis: '',
  via: '',
  lote: '',
  proximoControl: '',
  observaciones: ''
}

function fechaLocalHoy() {
  const d = new Date()
  const dos = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`
}

function NuevoControlSanitarioModal({ animal, unidad, onCerrar, onGuardado }) {
  const [formulario, setFormulario] = useState({ ...REGISTRO_INICIAL })
  const [errores, setErrores] = useState({})
  const [guardando, setGuardando] = useState(false)
  const [errorGeneral, setErrorGeneral] = useState('')
  const guardandoRef = useRef(false)
  const primerCampo = useRef(null)
  const modalRef = useRef(null)
  const cerrarRef = useRef(onCerrar)
  cerrarRef.current = () => { if (!guardandoRef.current) onCerrar() }
  const tituloId = 'scm-titulo'
  const abierto = Boolean(animal?.id)

  useEffect(() => {
    if (!abierto) return
    setFormulario({ ...REGISTRO_INICIAL })
    setErrores({})
    setErrorGeneral('')
    setGuardando(false)
    guardandoRef.current = false

    // Mantener el foco dentro de la tarea principal y evitar scroll de fondo.
    const elementoPrevio = document.activeElement
    const desbordamientoAnterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const marco = requestAnimationFrame(() => {
      modalRef.current?.querySelector('.scm-cuerpo')?.scrollTo({ top: 0 })
      primerCampo.current?.focus({ preventScroll: true })
    })

    function teclado(e) {
      if (e.key === 'Escape') {
        e.preventDefault()
        cerrarRef.current()
      }
      if (e.key === 'Tab' && modalRef.current) {
        const focusables = Array.from(modalRef.current.querySelectorAll(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])'
        ))
        if (!focusables.length) return
        const primero = focusables[0]
        const ultimo = focusables[focusables.length - 1]
        if (e.shiftKey && document.activeElement === primero) {
          e.preventDefault()
          ultimo.focus()
        } else if (!e.shiftKey && document.activeElement === ultimo) {
          e.preventDefault()
          primero.focus()
        }
      }
    }
    window.addEventListener('keydown', teclado)
    return () => {
      cancelAnimationFrame(marco)
      document.body.style.overflow = desbordamientoAnterior
      window.removeEventListener('keydown', teclado)
      elementoPrevio?.focus?.()
    }
  }, [abierto, animal?.id])

  if (!abierto) return null

  const cambiar = (campo, valor) => {
    setFormulario(actual => ({ ...actual, [campo]: valor }))
    setErrores(actual => ({ ...actual, [campo]: undefined }))
    setErrorGeneral('')
  }

  const validarFormulario = async (e) => {
    e.preventDefault()
    if (guardandoRef.current) return

    const erroresNuevos = {}
    const hoy = fechaLocalHoy()
    const f = formulario
    const necesitaProducto = ['Vacunación', 'Desparasitación', 'Tratamiento'].includes(f.tipo)
    const dosisTexto = f.dosis.trim()
    const unidadDosis = f.unidadDosis

    if (!TIPOS.some(t => t.valor === f.tipo)) {
      erroresNuevos.tipo = 'Seleccione un tipo de acontecimiento.'
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.fecha) || f.fecha > hoy) {
      erroresNuevos.fecha = 'Indique una fecha válida que no sea futura.'
    }
    if (f.responsable.trim().length < 3 || f.responsable.trim().length > 120) {
      erroresNuevos.responsable = 'Indique el responsable (entre 3 y 120 caracteres).'
    }
    if (f.motivo.trim().length < 5 || f.motivo.trim().length > 2000) {
      erroresNuevos.motivo = 'Describa el motivo (entre 5 y 2000 caracteres).'
    }
    if (necesitaProducto && !f.producto.trim()) {
      erroresNuevos.producto = 'Indique el producto, vacuna o tratamiento empleado.'
    }
    if (f.producto.length > 160) {
      erroresNuevos.producto = 'Máximo 160 caracteres.'
    }
    if ((dosisTexto && !unidadDosis) || (!dosisTexto && unidadDosis)) {
      erroresNuevos.dosis = 'La dosis y su unidad deben indicarse juntas.'
    }
    if (dosisTexto && (!/^\d+(?:\.\d{1,3})?$/.test(dosisTexto) ||
        Number(dosisTexto) <= 0 || Number(dosisTexto) > 999999999.999)) {
      erroresNuevos.dosis = 'Dosis positiva con hasta 3 decimales.'
    }
    if (f.proximoControl && f.fecha && f.proximoControl < f.fecha) {
      erroresNuevos.proximoControl = 'Debe ser igual o posterior al control.'
    }
    if (f.diagnostico.length > 2000) {
      erroresNuevos.diagnostico = 'Máximo 2000 caracteres.'
    }
    if (f.observaciones.length > 2000) {
      erroresNuevos.observaciones = 'Máximo 2000 caracteres.'
    }
    setErrores(erroresNuevos)
    if (Object.keys(erroresNuevos).length) return

    // El servidor determina la cuenta registrada_por con auth.uid().
    // Nunca enviar id, registrado_por, registrado_en ni unidad_id.
    const registro = {
      semoviente_id: animal.id,
      tipo_control: f.tipo,
      fecha_control: f.fecha,
      responsable_sanitario: f.responsable.trim(),
      motivo: f.motivo.trim(),
      diagnostico: f.diagnostico.trim() || null,
      producto: f.producto.trim() || null,
      dosis: dosisTexto ? Number(dosisTexto) : null,
      unidad_dosis: unidadDosis || null,
      via_administracion: f.via.trim() || null,
      lote_producto: f.lote.trim() || null,
      proximo_control: f.proximoControl || null,
      observaciones: f.observaciones.trim() || null
    }

    guardandoRef.current = true
    setGuardando(true)
    setErrorGeneral('')
    try {
      // Sin .select(): PostgreSQL no concede SELECT de vuelta de la fila insertada.
      // El trigger publica el evento historial en la MISMA transacción.
      const { error } = await supabase.from('controles_sanitarios').insert(registro)
      if (error) {
        console.error('RIO_BLANCO 17.5 - Error sanitario:', error.code, error.message)
        if (error.code === '42501') {
          setErrorGeneral('Acceso denegado. Verifique su rol RESP_UNIDAD y la unidad asignada.')
        } else if (error.code === '23514' || error.code === '23502' || error.code === '22003') {
          setErrorGeneral('Los datos no cumplen las validaciones de PostgreSQL.')
        } else if (error.code === '23503') {
          setErrorGeneral('El semoviente ya no está disponible para registrar este control.')
        } else {
          setErrorGeneral('No se pudo guardar. Compruebe la conexión y consulte al administrador.')
        }
        return
      }
      onGuardado?.(animal)
    } catch (error) {
      console.error('RIO_BLANCO 17.5 - Error de conexión:', error)
      setErrorGeneral('No se pudo completar el registro sanitario.')
    } finally {
      guardandoRef.current = false
      setGuardando(false)
    }
  }

  const necesitaProducto = ['Vacunación', 'Desparasitación', 'Tratamiento'].includes(formulario.tipo)

  const campo = (nombre, etiqueta, opciones = {}) => (
    <div className={`scm-campo ${opciones.anchoCompleto ? 'scm-ancho-completo' : ''}`}>
      <label htmlFor={`scm-${nombre}`}>
        {etiqueta}{opciones.requerido ? ' *' : ''}
      </label>
      {opciones.multilinea ? (
        <textarea
          id={`scm-${nombre}`}
          disabled={guardando}
          rows={opciones.filas || 3}
          maxLength={opciones.maxLength || 1000}
          value={formulario[nombre]}
          onChange={e => cambiar(nombre, e.target.value)}
          aria-invalid={Boolean(errores[nombre])}
          aria-describedby={errores[nombre] ? `scm-error-${nombre}` : undefined}
          placeholder={opciones.placeholder || ''}
        />
      ) : (
        <input
          id={`scm-${nombre}`}
          ref={opciones.primerCampo ? primerCampo : undefined}
          disabled={guardando}
          type={opciones.tipo || 'text'}
          min={opciones.min}
          max={opciones.max}
          step={opciones.step}
          maxLength={opciones.maxLength || 160}
          value={formulario[nombre]}
          onChange={e => cambiar(nombre, e.target.value)}
          aria-invalid={Boolean(errores[nombre])}
          aria-describedby={errores[nombre] ? `scm-error-${nombre}` : undefined}
          placeholder={opciones.placeholder || ''}
        />
      )}
      {errores[nombre] && (
        <small className="scm-error" id={`scm-error-${nombre}`} role="alert">
          {errores[nombre]}
        </small>
      )}
    </div>
  )

  return (
    <div className="scm-capa">
      <section ref={modalRef} className="scm-modal" role="dialog" aria-modal="true" aria-labelledby={tituloId}>
        <header className="scm-cabecera">
          <div>
            <span className="scm-sobretitulo">ARMADA BOLIVIANA · CONTROL SANITARIO</span>
            <h2 id={tituloId}>Nuevo acontecimiento sanitario</h2>
            <p>
              Animal <strong>{animal.codigo}</strong> · {ESPECIES[animal.especie] || animal.especie}
              {' · '}{unidad || 'Unidad no disponible'}
            </p>
          </div>
          <button type="button" className="scm-cerrar" onClick={onCerrar} disabled={guardando} aria-label="Cerrar formulario">×</button>
        </header>

        <form className="scm-formulario" onSubmit={validarFormulario} noValidate aria-busy={guardando}>
          <div className="scm-cuerpo">

            <h3>1. Identificación del semoviente</h3>
            <div className="scm-resumen-animal">
              <div><small>Código</small><strong>{animal.codigo}</strong></div>
              <div><small>Especie</small><strong>{ESPECIES[animal.especie] || animal.especie}</strong></div>
              <div><small>Clase</small><strong>{animal.categoria || 'No registrada'}</strong></div>
              <div><small>Unidad</small><strong>{unidad || 'No disponible'}</strong></div>
            </div>

            <h3>2. Datos de la intervención</h3>
            <div className="scm-grid">
              <div className="scm-campo">
                <label htmlFor="scm-tipo">Tipo de control *</label>
                <select
                  id="scm-tipo"
                  ref={primerCampo}
                  disabled={guardando}
                  value={formulario.tipo}
                  onChange={e => cambiar('tipo', e.target.value)}
                  aria-invalid={Boolean(errores.tipo)}
                  aria-describedby={errores.tipo ? 'scm-error-tipo' : undefined}
                >
                  <option value="">Seleccione el tipo</option>
                  {TIPOS.map(tipo => (
                    <option key={tipo.valor} value={tipo.valor}>{tipo.etiqueta}</option>
                  ))}
                </select>
                {errores.tipo && <small className="scm-error" id="scm-error-tipo" role="alert">{errores.tipo}</small>}
              </div>
              {campo('fecha', 'Fecha del control', { tipo: 'date', requerido: true, max: fechaLocalHoy() })}
              {campo('responsable', 'Responsable sanitario', {
                requerido: true, anchoCompleto: true, maxLength: 120,
                placeholder: 'Nombre del profesional responsable'
              })}
              {campo('motivo', 'Motivo o descripción del control', {
                requerido: true, multilinea: true, anchoCompleto: true,
                placeholder: 'Describa brevemente la intervención'
              })}
              {campo('diagnostico', 'Diagnóstico u observaciones clínicas', {
                multilinea: true, anchoCompleto: true,
                placeholder: 'Opcional, según el tipo de intervención'
              })}
            </div>

            <h3>3. Tratamiento o producto aplicado</h3>
            <div className="scm-grid">
              {campo('producto', 'Vacuna, medicamento o tratamiento', {
                requerido: necesitaProducto, anchoCompleto: true,
                placeholder: 'Opcional para controles sin aplicación de productos'
              })}
              {campo('dosis', 'Dosis', { tipo: 'number', min: '0.001', step: 'any', placeholder: 'Ej.: 2.5' })}
              <div className="scm-campo">
                <label htmlFor="scm-unidadDosis">Unidad de dosis</label>
                <select id="scm-unidadDosis" disabled={guardando} value={formulario.unidadDosis} onChange={e => cambiar('unidadDosis', e.target.value)}>
                  <option value="">No aplica / Sin especificar</option>
                  <option value="mL">mL</option>
                  <option value="mg">mg</option>
                  <option value="UI">UI</option>
                  <option value="dosis">dosis</option>
                </select>
              </div>
              {campo('via', 'Vía de administración', { maxLength: 120, placeholder: 'Si corresponde' })}
              {campo('lote', 'Lote del producto', { placeholder: 'Si corresponde' })}
              {campo('proximoControl', 'Próximo control programado', { tipo: 'date', min: formulario.fecha || undefined })}
            </div>

            <h3>4. Observaciones</h3>
            <div className="scm-grid">
              {campo('observaciones', 'Observaciones adicionales', {
                multilinea: true, anchoCompleto: true, maxLength: 2000,
                placeholder: 'Añada información relevante para la ficha'
              })}
            </div>

            {errorGeneral && (
              <p className="scm-error scm-error-servidor" role="alert">{errorGeneral}</p>
            )}
          </div>

          <footer className="scm-pie">
            <span>Registro sanitario</span>
            <div>
              <button type="button" className="scm-cancelar" onClick={onCerrar} disabled={guardando}>Cancelar</button>
              <button type="submit" className="scm-validar" disabled={guardando}>
                {guardando ? 'Guardando...' : 'Guardar control sanitario'}
              </button>
            </div>
          </footer>
        </form>
      </section>
    </div>
  )
}

export default NuevoControlSanitarioModal

import { useEffect, useState } from 'react'
import { supabase } from '../../services/supabaseClient'
import './NuevoSemovienteModal.css'

const CLASES = {
  bovino: ['Ternero','Ternera','Torillo','Vaquilla','Toro','Vaca','Novillo'],
  equino: ['Potro','Potranca','Caballo','Yegua'],
  caprino: ['Cabrito','Cabrita','Macho','Cabra'],
  mular: ['Cría','Macho','Hembra'],
  avicola: ['Pollito','Pollita','Gallo','Gallina'],
  porcino: ['Lechón','Lechona','Verraco','Cerda']
}

const NOMBRES = {
  bovino: 'Ganado vacuno',
  equino: 'Ganado equino',
  caprino: 'Ganado caprino',
  mular: 'Ganado mular',
  avicola: 'Ganado avícola',
  porcino: 'Ganado porcino'
}

const INICIAL = {
  codigo: '',
  categoria: '',
  raza: '',
  sexo: '',
  fecha_nacimiento: '',
  fecha_ingreso: '',
  procedencia: '',
  marca_ancla: false,
  vacuna_brucelosis: false,
  observaciones: ''
}

const SEXO_BOVINO = {
  Ternero: 'Macho',
  Ternera: 'Hembra',
  Torillo: 'Macho',
  Vaquilla: 'Hembra',
  Toro: 'Macho',
  Vaca: 'Hembra',
  Novillo: 'Macho'
}

function NuevoSemovienteModal({
  abierto,
  onCerrar,
  onGuardado,
  especie,
  unidad
}) {
  const [formulario, setFormulario] = useState(INICIAL)
  const [errores, setErrores] = useState({})
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')

  useEffect(() => {
    if (abierto) {
      setFormulario({ ...INICIAL })
      setErrores({})
      setMensaje('')
      setGuardando(false)
    }
  }, [abierto, especie])

  useEffect(() => {
    if (!abierto) return

    const teclado = (e) => {
      if (e.key === 'Escape' && !guardando) onCerrar()
    }

    document.addEventListener('keydown', teclado)
    return () => document.removeEventListener('keydown', teclado)
  }, [abierto, guardando, onCerrar])

  if (!abierto) return null

  const actualizar = (campo, valor) => {
    setFormulario(f => ({ ...f, [campo]: valor }))
    setErrores(e => ({ ...e, [campo]: '' }))
    setMensaje('')
  }

  const validar = () => {
    const nuevos = {}
    const f = formulario
    const codigo = f.codigo.trim().toUpperCase()

    const hoy = new Date().toLocaleDateString('en-CA')

    if (!/^[A-Z0-9-]{3,50}$/.test(codigo))
      nuevos.codigo = 'Use de 3 a 50 letras, números o guiones.'

    if (!CLASES[especie]?.includes(f.categoria))
      nuevos.categoria = 'Seleccione una clase válida.'

    if (!['Macho', 'Hembra'].includes(f.sexo))
      nuevos.sexo = 'Seleccione el sexo.'

    if (especie === 'bovino' &&
        SEXO_BOVINO[f.categoria] &&
        SEXO_BOVINO[f.categoria] !== f.sexo)
      nuevos.sexo = 'El sexo no corresponde a la clase bovina.'

    if (!f.fecha_ingreso)
      nuevos.fecha_ingreso = 'La fecha de ingreso es obligatoria.'
    else if (f.fecha_ingreso > hoy)
      nuevos.fecha_ingreso = 'No puede ser una fecha futura.'

    if (f.fecha_nacimiento && f.fecha_nacimiento > hoy)
      nuevos.fecha_nacimiento = 'No puede ser una fecha futura.'

    if (f.fecha_nacimiento &&
        f.fecha_ingreso &&
        f.fecha_nacimiento > f.fecha_ingreso)
      nuevos.fecha_nacimiento = 'El nacimiento es posterior al ingreso.'

    setErrores(nuevos)
    return Object.keys(nuevos).length === 0
  }

  const guardar = async (e) => {
    e.preventDefault()
    if (guardando || !validar()) return

    setGuardando(true)
    setMensaje('')

    const f = formulario

    const registro = {
      codigo: f.codigo.trim().toUpperCase(),
      especie,
      categoria: f.categoria,
      sexo: f.sexo,
      raza: f.raza.trim() || null,
      fecha_nacimiento: f.fecha_nacimiento || null,
      fecha_ingreso: f.fecha_ingreso,
      procedencia: f.procedencia.trim() || null,
      marca_ancla: f.marca_ancla,
      vacuna_brucelosis: f.vacuna_brucelosis,
      observaciones: f.observaciones.trim() || null
    }

    try {
      const { error } = await supabase
        .from('semovientes')
        .insert(registro)

      if (error) {
        console.error('Error RIO_BLANCO:', error.code, error.message)

        if (error.code === '23505') {
          setMensaje('Ya existe un animal con ese código en la unidad.')
        } else if (error.code === '23514') {
          setMensaje('Los datos no cumplen las reglas ganaderas.')
        } else if (error.code === '42501') {
          setMensaje('No tienes autorización para registrar este animal.')
        } else {
          setMensaje('No se pudo guardar. Revisa los datos y permisos.')
        }
        return
      }

      onGuardado?.()
    } catch (error) {
      console.error('Error de conexión RIO_BLANCO:', error)
      setMensaje('No se pudo completar el registro.')
    } finally {
      setGuardando(false)
    }
  }

  const campo = (nombre, etiqueta, tipo = 'text') => (
    <div className="ns-campo">
      <label htmlFor={'ns-' + nombre}>{etiqueta}</label>
      <input
        id={'ns-' + nombre}
        type={tipo}
        value={formulario[nombre]}
        disabled={guardando}
        onChange={e => actualizar(nombre, e.target.value)}
        aria-invalid={Boolean(errores[nombre])}
      />
      {errores[nombre] && (
        <small className="ns-error">{errores[nombre]}</small>
      )}
    </div>
  )

  return (
    <div className="ns-overlay">
      <section className="ns-modal" role="dialog"
        aria-modal="true" aria-labelledby="ns-titulo">

        <header className="ns-header">
          <div>
            <span>RIO_BLANCO · REGISTRO GANADERO</span>
            <h2 id="ns-titulo">Nuevo registro de semoviente</h2>
            <p>Unidad Operativa {unidad}</p>
          </div>
          <button type="button" className="ns-cerrar"
            disabled={guardando} onClick={onCerrar}
            aria-label="Cerrar formulario">×</button>
        </header>

        <form onSubmit={guardar} noValidate>
          <div className="ns-contenido">
            <div className="ns-aviso">
              ENTORNO DE PRUEBAS: utilizar únicamente datos ficticios.
              El registro se guardará en Supabase.
            </div>

            <h3>1. Identificación del animal</h3>
            <div className="ns-grid">
              {campo('codigo', 'Código individual *')}

              <div className="ns-campo">
                <label>Especie</label>
                <input value={NOMBRES[especie]} readOnly />
              </div>

              <div className="ns-campo">
                <label htmlFor="ns-clase">Clase *</label>
                <select id="ns-clase"
                  disabled={guardando}
                  value={formulario.categoria}
                  onChange={e => actualizar('categoria', e.target.value)}>
                  <option value="">Seleccione una clase</option>
                  {(CLASES[especie] || []).map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                {errores.categoria && (
                  <small className="ns-error">{errores.categoria}</small>
                )}
              </div>

              <div className="ns-campo">
                <label htmlFor="ns-sexo">Sexo *</label>
                <select id="ns-sexo"
                  disabled={guardando}
                  value={formulario.sexo}
                  onChange={e => actualizar('sexo', e.target.value)}>
                  <option value="">Seleccione el sexo</option>
                  <option value="Macho">Macho</option>
                  <option value="Hembra">Hembra</option>
                </select>
                {errores.sexo && (
                  <small className="ns-error">{errores.sexo}</small>
                )}
              </div>

              {campo('raza', 'Raza')}
            </div>

            <h3>2. Procedencia e ingreso</h3>
            <div className="ns-grid">
              {campo('fecha_nacimiento', 'Fecha de nacimiento', 'date')}
              {campo('fecha_ingreso', 'Fecha de ingreso *', 'date')}
              {campo('procedencia', 'Procedencia')}
            </div>

            <h3>3. Identificación complementaria</h3>
            <div className="ns-checks">
              <label>
                <input type="checkbox" disabled={guardando}
                  checked={formulario.marca_ancla}
                  onChange={e => actualizar('marca_ancla', e.target.checked)}
                />
                Marca Ancla
              </label>

              <label>
                <input type="checkbox" disabled={guardando}
                  checked={formulario.vacuna_brucelosis}
                  onChange={e => actualizar('vacuna_brucelosis', e.target.checked)}
                />
                Vacunación contra brucelosis
              </label>
            </div>

            <div className="ns-campo">
              <label htmlFor="ns-observaciones">Observaciones</label>
              <textarea id="ns-observaciones" rows="3"
                disabled={guardando} maxLength={2000}
                value={formulario.observaciones}
                onChange={e => actualizar('observaciones', e.target.value)}
              />
            </div>

            {mensaje && <p className="ns-error" role="alert">{mensaje}</p>}
          </div>

          <footer className="ns-footer">
            <button type="button" disabled={guardando} onClick={onCerrar}>
              Cancelar
            </button>
            <button className="ns-validar" type="submit"
              disabled={guardando}>
              {guardando ? 'Guardando...' : 'Guardar semoviente'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  )
}

export default NuevoSemovienteModal

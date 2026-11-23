import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../services/supabaseClient'
import { PREFIJOS_ACTIVO, proponerCodigoActivo, validarCodigoActivo } from '../../utils/codigosActivo'
import './NuevoSemovienteModal.css'

const CLASES = {
  bovino: ['Ternero', 'Ternera', 'Torillo', 'Vaquilla', 'Toro', 'Vaca', 'Novillo'],
  equino: ['Potro', 'Potranca', 'Caballo', 'Yegua'],
  caprino: ['Cabrito', 'Cabrita', 'Macho', 'Cabra'],
  mular: ['Cría', 'Macho', 'Hembra'],
  porcino: ['Lechón', 'Lechona', 'Verraco', 'Cerda'],
}

const NOMBRES = {
  bovino: 'Ganado vacuno',
  equino: 'Ganado equino',
  caprino: 'Ganado caprino',
  mular: 'Ganado mular',
  porcino: 'Ganado porcino',
}

const INICIAL = {
  codigo: '',
  codigo_activo: '',
  categoria: '',
  raza: '',
  sexo: '',
  fecha_nacimiento: '',
  fecha_ingreso: '',
  procedencia: '',
  marca_ancla: false,
  vacuna_brucelosis: false,
  observaciones: '',
}

const SEXO_BOVINO = {
  Ternero: 'Macho', Ternera: 'Hembra', Torillo: 'Macho',
  Vaquilla: 'Hembra', Toro: 'Macho', Vaca: 'Hembra', Novillo: 'Macho',
}

const VISTAS = [
  { id: 'frontal', nombre: 'Frontal', etiqueta: '1', ayuda: 'Vista de frente' },
  { id: 'lateral_izquierdo', nombre: 'Lateral izquierdo', etiqueta: '2', ayuda: 'Costado izquierdo' },
  { id: 'lateral_derecho', nombre: 'Lateral derecho', etiqueta: '3', ayuda: 'Costado derecho' },
]

const MAX_FOTO = 5 * 1024 * 1024
const TIPOS_FOTO = Object.freeze({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' })
const BUCKET = 'semovientes-fotos'

function SeleccionFoto({ vista, archivo, cambiar, deshabilitado, error }) {
  const [url, setUrl] = useState('')

  useEffect(() => {
    if (!archivo) return undefined
    const temporal = URL.createObjectURL(archivo)
    setUrl(temporal)
    return () => URL.revokeObjectURL(temporal)
  }, [archivo])

  return (
    <article className={`ns-foto ${archivo ? 'ns-foto-elegida' : ''}`}>
      <div className="ns-foto-cabecera">
        <span className="ns-foto-numero">{vista.etiqueta}</span>
        <div>
          <strong>{vista.nombre}</strong>
          <small>{vista.ayuda}</small>
        </div>
      </div>
      <div className="ns-foto-imagen">
        {archivo && url ? (
          <img src={url} alt={`Vista previa: ${vista.nombre.toLowerCase()}`} />
        ) : (
          <div className="ns-foto-vacia" aria-hidden="true">
            <span>▧</span>
            <small>Sin fotografía</small>
          </div>
        )}
      </div>
      <div className="ns-foto-acciones">
        <label className={`ns-subir ${deshabilitado ? 'ns-subir-deshabilitado' : ''}`} htmlFor={`ns-foto-${vista.id}`}>
          {archivo ? 'Cambiar imagen' : 'Cargar fotografía'}
        </label>
        <input
          id={`ns-foto-${vista.id}`}
          className="ns-archivo-oculto"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={deshabilitado}
          aria-label={`Subir fotografía ${vista.nombre.toLowerCase()}`}
          onChange={event => {
            cambiar(vista.id, event.target.files?.[0] || null)
            event.target.value = ''
          }}
        />
        {archivo && !deshabilitado && (
          <button type="button" className="ns-foto-quitar" onClick={() => cambiar(vista.id, null)}>
            Quitar
          </button>
        )}
      </div>
      {archivo && <small className="ns-foto-nombre" title={archivo.name}>{archivo.name}</small>}
      {error && <small className="ns-error" role="alert">{error}</small>}
    </article>
  )
}

function NuevoSemovienteModal({ abierto, onCerrar, onGuardado, especie, unidad }) {
  const [formulario, setFormulario] = useState(INICIAL)
  const [fotos, setFotos] = useState({})
  const [errores, setErrores] = useState({})
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [registroCreado, setRegistroCreado] = useState(null)
  const rutasSubidas = useRef({})
  const vistasRegistradas = useRef(new Set())

  const prefijo = PREFIJOS_ACTIVO[unidad?.codigo] || ''
  const fotosElegidas = VISTAS.filter(v => fotos[v.id]).length

  useEffect(() => {
    if (abierto) {
      setFormulario({ ...INICIAL })
      setFotos({})
      setErrores({})
      setMensaje('')
      setGuardando(false)
      setRegistroCreado(null)
      rutasSubidas.current = {}
      vistasRegistradas.current = new Set()
    }
  }, [abierto, especie])

  useEffect(() => {
    if (!abierto) return undefined
    const teclado = event => {
      if (event.key === 'Escape' && !guardando) onCerrar()
    }
    document.addEventListener('keydown', teclado)
    return () => document.removeEventListener('keydown', teclado)
  }, [abierto, guardando, onCerrar])

  if (!abierto) return null

  const actualizar = (campo, valor) => {
    if (campo === 'codigo') {
      setFormulario(actual => {
        const sugerenciaAnterior = proponerCodigoActivo(unidad?.codigo, actual.codigo)
        const nuevoCodigo = valor.toUpperCase()
        const seguirAutomatico = !actual.codigo_activo || actual.codigo_activo === sugerenciaAnterior
        return {
          ...actual,
          codigo: nuevoCodigo,
          codigo_activo: seguirAutomatico
            ? proponerCodigoActivo(unidad?.codigo, nuevoCodigo)
            : actual.codigo_activo,
        }
      })
      setErrores(actual => ({ ...actual, codigo: '', codigo_activo: '' }))
    } else {
      setFormulario(actual => ({ ...actual, [campo]: valor }))
      setErrores(actual => ({ ...actual, [campo]: '' }))
    }
    setMensaje('')
  }

  const cambiarFoto = (vista, archivo) => {
    if (!archivo) {
      setFotos(actual => ({ ...actual, [vista]: null }))
      setErrores(actual => ({ ...actual, [`foto_${vista}`]: '' }))
      return
    }
    if (!Object.hasOwn(TIPOS_FOTO, archivo.type)) {
      setErrores(actual => ({ ...actual, [`foto_${vista}`]: 'Formato no admitido. Use JPG, PNG o WebP.' }))
      return
    }
    if (archivo.size > MAX_FOTO || archivo.size === 0) {
      setErrores(actual => ({ ...actual, [`foto_${vista}`]: 'La imagen debe pesar entre 1 byte y 5 MB.' }))
      return
    }
    setFotos(actual => ({ ...actual, [vista]: archivo }))
    setErrores(actual => ({ ...actual, [`foto_${vista}`]: '' }))
    setMensaje('')
  }

  const validar = () => {
    const nuevos = {}
    const f = formulario
    const codigo = f.codigo.trim().toUpperCase()
    const hoy = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date())

    if (!unidad?.id || !prefijo) nuevos.codigo_activo = 'No se identificó una unidad operativa válida.'
    if (!/^[A-Z0-9-]{3,50}$/.test(codigo)) nuevos.codigo = 'Use de 3 a 50 letras, números o guiones.'
    if (!validarCodigoActivo(unidad?.codigo, f.codigo_activo)) {
      nuevos.codigo_activo = `Debe comenzar con ${prefijo || 'el prefijo de la unidad'} y tener un identificador válido.`
    }
    if (!CLASES[especie]?.includes(f.categoria)) nuevos.categoria = 'Seleccione una clase válida.'
    if (!['Macho', 'Hembra'].includes(f.sexo)) nuevos.sexo = 'Seleccione el sexo.'
    if (especie === 'bovino' && SEXO_BOVINO[f.categoria] && SEXO_BOVINO[f.categoria] !== f.sexo) {
      nuevos.sexo = 'El sexo no corresponde a la clase bovina.'
    }
    if (!f.fecha_ingreso) nuevos.fecha_ingreso = 'La fecha de ingreso es obligatoria.'
    else if (f.fecha_ingreso > hoy) nuevos.fecha_ingreso = 'No puede ser una fecha futura.'
    if (f.fecha_nacimiento && f.fecha_nacimiento > hoy) nuevos.fecha_nacimiento = 'No puede ser una fecha futura.'
    if (f.fecha_nacimiento && f.fecha_ingreso && f.fecha_nacimiento > f.fecha_ingreso) {
      nuevos.fecha_nacimiento = 'El nacimiento es posterior al ingreso.'
    }
    setErrores(nuevos)
    return Object.keys(nuevos).length === 0
  }

  const guardar = async event => {
    event.preventDefault()
    if (guardando || (!registroCreado && !validar())) return

    setGuardando(true)
    setMensaje('')
    let id = registroCreado

    try {
      if (!id) {
        const f = formulario
        const registro = {
          codigo: f.codigo.trim().toUpperCase(),
          codigo_activo: f.codigo_activo.trim().toUpperCase(),
          especie,
          categoria: f.categoria,
          sexo: f.sexo,
          raza: f.raza.trim() || null,
          fecha_nacimiento: f.fecha_nacimiento || null,
          fecha_ingreso: f.fecha_ingreso,
          procedencia: f.procedencia.trim() || null,
          marca_ancla: f.marca_ancla,
          vacuna_brucelosis: f.vacuna_brucelosis,
          observaciones: f.observaciones.trim() || null,
        }
        const { data, error } = await supabase.from('semovientes').insert(registro).select('id').single()
        if (error) throw { origen: 'registro', error }
        id = data.id
        setRegistroCreado(id)
      }

      for (const vista of VISTAS) {
        const archivo = fotos[vista.id]
        if (!archivo || vistasRegistradas.current.has(vista.id)) continue
        let ruta = rutasSubidas.current[vista.id]
        if (!ruta) {
          const extension = TIPOS_FOTO[archivo.type]
          ruta = `${unidad.id}/${id}/${vista.id}-${crypto.randomUUID()}.${extension}`
          const { error } = await supabase.storage.from(BUCKET).upload(ruta, archivo, {
            cacheControl: '3600', contentType: archivo.type, upsert: false,
          })
          if (error) throw { origen: 'foto', vista: vista.nombre, error }
          rutasSubidas.current[vista.id] = ruta
        }
        const { error } = await supabase.from('semoviente_fotografias').insert({
          semoviente_id: id, vista: vista.id, ruta,
        })
        if (error) throw { origen: 'foto', vista: vista.nombre, error }
        vistasRegistradas.current.add(vista.id)
      }

      onGuardado?.()
    } catch (fallo) {
      const error = fallo.error || fallo
      console.error('Registro de semoviente:', fallo.origen, error)
      if (fallo.origen === 'foto' || id) {
        setMensaje(
          `El semoviente ya fue registrado (ID ${id}), pero no se completó la fotografía ${fallo.vista || ''}. ` +
          'No volveremos a crear el animal: revisa la configuración de Storage y pulsa «Reintentar fotografías». ' +
          `Detalle: ${error?.message || 'fallo de conexión'}`
        )
      } else if (error?.code === '23505') {
        const activoDuplicado = /codigo_activo/i.test(`${error.message} ${error.details} ${error.constraint}`)
        setMensaje(activoDuplicado
          ? 'El Código del Activo ya está registrado en esta unidad.'
          : 'El código individual ya existe en esta unidad.')
      } else if (['42703', 'PGRST204', '42P01', 'PGRST205'].includes(error?.code)) {
        setMensaje('Falta instalar la actualización de Nuevo Registro en Supabase. Consulte el archivo SQL incluido en el ZIP.')
      } else if (error?.code === '42501' || error?.status === 403) {
        setMensaje('No tienes autorización para registrar este animal. Revisa el rol y la unidad asignada.')
      } else if (error?.code === '23514') {
        setMensaje('Algún dato no cumple las validaciones de la base de datos.')
      } else {
        setMensaje(`No se pudo guardar el registro: ${error?.message || 'comprueba tu conexión y los permisos'}.`)
      }
    } finally {
      setGuardando(false)
    }
  }

  const campo = (nombre, etiqueta, tipo = 'text') => (
    <div className="ns-campo">
      <label htmlFor={`ns-${nombre}`}>{etiqueta}</label>
      <input
        id={`ns-${nombre}`}
        type={tipo}
        value={formulario[nombre]}
        disabled={guardando || Boolean(registroCreado)}
        onChange={event => actualizar(nombre, event.target.value)}
        aria-invalid={Boolean(errores[nombre])}
      />
      {errores[nombre] && <small className="ns-error">{errores[nombre]}</small>}
    </div>
  )

  return (
    <div className="ns-overlay">
      <section className="ns-modal" role="dialog" aria-modal="true" aria-labelledby="ns-titulo">
        <header className="ns-header">
          <div>
            <span>ARMADA BOLIVIANA · REGISTRO GANADERO</span>
            <h2 id="ns-titulo">Nuevo registro de semoviente</h2>
            <p>Unidad Operativa {unidad?.nombre || 'No asignada'}</p>
          </div>
          <button type="button" className="ns-cerrar" disabled={guardando} onClick={onCerrar} aria-label="Cerrar formulario">×</button>
        </header>

        <form onSubmit={guardar} noValidate>
          <div className="ns-contenido">

            <h3>1. Identificación del animal</h3>
            <div className="ns-grid ns-codigos">
              {campo('codigo', 'Código individual *')}
              <div className="ns-campo">
                <label htmlFor="ns-codigo-activo">Código del Activo *</label>
                <input
                  id="ns-codigo-activo"
                  type="text"
                  value={formulario.codigo_activo}
                  disabled={guardando || Boolean(registroCreado)}
                  onChange={event => actualizar('codigo_activo', event.target.value.toUpperCase())}
                  aria-invalid={Boolean(errores.codigo_activo)}
                  placeholder={`${prefijo || 'UOSPGRB-86-WI-'}007`}
                  maxLength={110}
                  autoComplete="off"
                />
                <small className="ns-ayuda">Se propone con el código individual; es único dentro de {unidad?.nombre || 'la unidad'}.</small>
                {errores.codigo_activo && <small className="ns-error">{errores.codigo_activo}</small>}
              </div>
            </div>
            <div className="ns-grid">
              <div className="ns-campo">
                <label>Especie</label>
                <input value={NOMBRES[especie] || especie} readOnly />
              </div>
              <div className="ns-campo">
                <label htmlFor="ns-clase">Clase *</label>
                <select id="ns-clase" disabled={guardando || Boolean(registroCreado)} value={formulario.categoria}
                  onChange={event => actualizar('categoria', event.target.value)}>
                  <option value="">Seleccione una clase</option>
                  {(CLASES[especie] || []).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                {errores.categoria && <small className="ns-error">{errores.categoria}</small>}
              </div>
              <div className="ns-campo">
                <label htmlFor="ns-sexo">Sexo *</label>
                <select id="ns-sexo" disabled={guardando || Boolean(registroCreado)} value={formulario.sexo}
                  onChange={event => actualizar('sexo', event.target.value)}>
                  <option value="">Seleccione el sexo</option>
                  <option value="Macho">Macho</option>
                  <option value="Hembra">Hembra</option>
                </select>
                {errores.sexo && <small className="ns-error">{errores.sexo}</small>}
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
              <label><input type="checkbox" disabled={guardando || Boolean(registroCreado)} checked={formulario.marca_ancla}
                onChange={event => actualizar('marca_ancla', event.target.checked)} /> Marca Ancla</label>
              <label><input type="checkbox" disabled={guardando || Boolean(registroCreado)} checked={formulario.vacuna_brucelosis}
                onChange={event => actualizar('vacuna_brucelosis', event.target.checked)} /> Vacunación contra brucelosis</label>
            </div>
            <div className="ns-campo">
              <label htmlFor="ns-observaciones">Observaciones</label>
              <textarea id="ns-observaciones" rows="3" disabled={guardando || Boolean(registroCreado)} maxLength={2000}
                value={formulario.observaciones} onChange={event => actualizar('observaciones', event.target.value)} />
            </div>

            <h3>4. Fotografías del semoviente</h3>
            <p className="ns-ayuda ns-fotos-instruccion">Adjunta hasta tres imágenes: frontal, lateral izquierdo y lateral derecho. JPG, PNG o WebP; máximo 5 MB cada una. Son opcionales.</p>
            <div className="ns-fotos-grid">
              {VISTAS.map(vista => (
                <SeleccionFoto key={vista.id} vista={vista} archivo={fotos[vista.id]}
                  cambiar={cambiarFoto} deshabilitado={guardando || Boolean(registroCreado)}
                  error={errores[`foto_${vista.id}`]} />
              ))}
            </div>
            <div className="ns-fotos-resumen">{fotosElegidas} de 3 fotografías seleccionadas</div>

            {registroCreado && <p className="ns-validado" role="status">El animal quedó guardado con ID {registroCreado}. Si alguna foto falló, puedes reintentar aquí sin duplicar el animal.</p>}
            {mensaje && <p className="ns-mensaje-error" role="alert">{mensaje}</p>}
          </div>

          <footer className="ns-footer">
            <button type="button" disabled={guardando} onClick={onCerrar}>
              {registroCreado ? 'Cerrar sin reintentar' : 'Cancelar'}
            </button>
            <button className="ns-validar" type="submit" disabled={guardando}>
              {guardando ? 'Guardando...' : registroCreado ? 'Reintentar fotografías' : 'Guardar semoviente'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  )
}

export default NuevoSemovienteModal

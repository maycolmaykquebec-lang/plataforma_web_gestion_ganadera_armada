import { useEffect, useState } from 'react'
import { supabase } from '../../services/supabaseClient'
import ResumenReproductivo from '../reproduccion/ResumenReproductivo'
import { edadLegible, ESPECIES_HISTORIAL, fechaHistorial, TIPOS_HISTORIAL } from '../../utils/historialGanadero'
import { ESPECIES_HABILITADAS } from '../../utils/especies'
import './PerfilHistorialSemoviente.css'

const PESTANAS = [
  ['resumen', 'Resumen', '⌂'],
  ['datos', 'Datos generales', '▣'],
  ['sanidad', 'Historial sanitario', '✚'],
  ['reproduccion', 'Historial reproductivo', '♀'],
  ['movimientos', 'Movimientos', '⇄'],
  ['bajas', 'Altas y bajas', '⊞'],
  ['descarte', 'Evaluaciones', '◇'],
  ['fotos', 'Archivos y fotografías', '▧'],
]
const FOTOS = [['frontal', 'Frontal'], ['lateral_izquierdo', 'Lateral izquierdo'], ['lateral_derecho', 'Lateral derecho']]
const POR_EVENTOS = 30
const LIMITE_LISTAS = 100

function FichaDato({ titulo, valor }) {
  return <div className="hix-dato"><span>{titulo}</span><strong>{valor === '' || valor == null ? 'No registrado' : valor}</strong></div>
}
function TextoVacio({ children = 'No existen registros documentados para este semoviente.' }) {
  return <p className="hix-vacio">{children}</p>
}
function TarjetaLista({ titulo, fecha, children, auxiliar }) {
  return <article className="hix-registro-item"><div><strong>{titulo}</strong><span>{fecha}</span></div>{children && <p>{children}</p>}{auxiliar && <small>{auxiliar}</small>}</article>
}
function EtiquetaEstado({ estado }) {
  return <span className={`hix-etiqueta ${estado === 'Activo' ? 'hix-activo' : 'hix-inactivo'}`}>{estado || '—'}</span>
}

export default function PerfilHistorialSemoviente({ animalId, onVolver }) {
  const [pestana, setPestana] = useState('resumen')
  const [animal, setAnimal] = useState(null)
  const [unidades, setUnidades] = useState({})
  const [fotos, setFotos] = useState([])
  const [fotoEvidencia, setFotoEvidencia] = useState(null)
  const [datos, setDatos] = useState({ sanitario: [], reproduccion: [], movimientos: [], bajas: [], descarte: [] })
  const [erroresDatos, setErroresDatos] = useState({})
  const [eventos, setEventos] = useState([])
  const [totalEventos, setTotalEventos] = useState(0)
  const [cargando, setCargando] = useState(true)
  const [cargandoEventos, setCargandoEventos] = useState(false)
  const [error, setError] = useState('')
  const [vistaFoto, setVistaFoto] = useState(null)

  useEffect(() => {
    let vivo = true
    async function cargar() {
      setCargando(true); setAnimal(null); setError(''); setDatos({ sanitario: [], reproduccion: [], movimientos: [], bajas: [], descarte: [] })
      setEventos([]); setTotalEventos(0); setFotos([]); setFotoEvidencia(null); setVistaFoto(null); setErroresDatos({}); setPestana('resumen')
      // La consulta del animal precede al resto: si RLS lo bloquea, no se cargan datos relacionados.
      const { data: ficha, error: fallo } = await supabase.from('semovientes').select(`
        id,codigo,codigo_activo,especie,categoria,raza,sexo,fecha_nacimiento,fecha_ingreso,
        procedencia,marca_ancla,vacuna_brucelosis,estado,observaciones,unidad_id,created_at,updated_at
      `).eq('id', animalId).in('especie', ESPECIES_HABILITADAS).maybeSingle()
      if (!vivo) return
      if (fallo || !ficha) { setError('El semoviente no está disponible para su perfil o ya no existe.'); setCargando(false); return }
      setAnimal(ficha)
      const consultas = {
        unidades: supabase.from('unidades_operativas').select('id,nombre'),
        fotografias: supabase.from('semoviente_fotografias').select('vista,ruta').eq('semoviente_id', ficha.id),
        sanitario: supabase.from('controles_sanitarios').select('id,tipo_control,fecha_control,responsable_sanitario,motivo,diagnostico,producto,dosis,unidad_dosis,proximo_control,observaciones')
          .eq('semoviente_id', ficha.id).order('fecha_control', { ascending: false }).limit(LIMITE_LISTAS),
        reproduccion: supabase.from('controles_reproductivos').select('id,semoviente_id,reproductor_id,tipo_evento,fecha_evento,responsable_reproductivo,resultado,metodo,cantidad_crias,detalle,proximo_control')
          .or(`semoviente_id.eq.${Number(ficha.id)},reproductor_id.eq.${Number(ficha.id)}`).order('fecha_evento', { ascending: false }).limit(LIMITE_LISTAS),
        movimientos: supabase.from('solicitudes_movimientos').select('id,unidad_origen_id,unidad_destino_id,estado,fecha_prevista,fecha_ejecucion,creado_en,motivo,fundamento_decision')
          .eq('semoviente_id', ficha.id).order('creado_en', { ascending: false }).limit(LIMITE_LISTAS),
        bajas: supabase.from('rb_bajas').select('id,semoviente_id,unidad_id,tipo,fecha,motivo,detalles').eq('semoviente_id', ficha.id).order('fecha', { ascending: false }).limit(LIMITE_LISTAS),
        descarte: supabase.from('rb_evaluaciones_descarte').select('id,fecha,motivo,dictamen').eq('semoviente_id', ficha.id).order('fecha', { ascending: false }).limit(LIMITE_LISTAS),
        eventos: supabase.from('semoviente_eventos').select('id,tipo_evento,fecha_evento,titulo,detalle,origen_modulo', { count: 'exact' })
          .eq('semoviente_id', ficha.id).order('fecha_evento', { ascending: false }).order('id', { ascending: false }).range(0, POR_EVENTOS - 1),
      }
      const claves = Object.keys(consultas)
      const resultados = await Promise.all(claves.map(k => consultas[k]))
      if (!vivo) return
      const r = Object.fromEntries(claves.map((k, i) => [k, resultados[i]]))
      const nuevasListas = {}
      const errores = {}
      for (const k of ['sanitario', 'reproduccion', 'movimientos', 'bajas', 'descarte']) {
        nuevasListas[k] = r[k].error ? [] : r[k].data || []
        if (r[k].error) errores[k] = `No se pudo consultar ${k} con los permisos actuales.`
      }
      setDatos(nuevasListas)
      setErroresDatos(errores)
      if (!r.unidades.error) setUnidades(Object.fromEntries((r.unidades.data || []).map(u => [String(u.id), u.nombre])))
      if (r.eventos.error) errores.eventos = 'No fue posible consultar la línea de tiempo.'
      else { setEventos(r.eventos.data || []); setTotalEventos(r.eventos.count ?? 0) }
      setErroresDatos({ ...errores })
      // Obtener únicamente enlaces temporales de las fotografías autorizadas.
      if (!r.fotografias.error && r.fotografias.data?.length) {
        const urls = await Promise.all(r.fotografias.data.map(async fila => {
          const { data: firmada, error: falloFirma } = await supabase.storage.from('semovientes-fotos').createSignedUrl(fila.ruta, 60 * 20)
          return falloFirma ? null : { vista: fila.vista, url: firmada.signedUrl }
        }))
        if (!vivo) return
        setFotos(urls.filter(Boolean))
        if (urls.some(u => !u)) setErroresDatos(v => ({ ...v, fotos: 'No fue posible abrir alguna fotografía privada.' }))
      } else if (r.fotografias.error) {
        setErroresDatos(v => ({ ...v, fotos: 'No fue posible consultar las fotografías privadas.' }))
      }
      const baja = nuevasListas.bajas.find(b => b.tipo === 'defuncion')
      if (baja) {
        const ruta = `${baja.unidad_id}/${baja.id}/evidencia.jpg`
        const { data: evidencia, error: errorEvidencia } = await supabase.storage.from('bajas-fotos').createSignedUrl(ruta, 60 * 20)
        if (!vivo) return
        if (!errorEvidencia && evidencia?.signedUrl) setFotoEvidencia(evidencia.signedUrl)
      }
      setCargando(false)
    }
    cargar()
    return () => { vivo = false }
  }, [animalId])

  async function verMasEventos() {
    if (!animal || cargandoEventos || eventos.length >= totalEventos) return
    setCargandoEventos(true)
    const { data, error: fallo } = await supabase.from('semoviente_eventos')
      .select('id,tipo_evento,fecha_evento,titulo,detalle,origen_modulo')
      .eq('semoviente_id', animal.id).order('fecha_evento', { ascending: false }).order('id', { ascending: false })
      .range(eventos.length, eventos.length + POR_EVENTOS - 1)
    if (fallo) setErroresDatos(v => ({ ...v, eventos: 'No se pudieron cargar más acontecimientos.' }))
    else setEventos(v => [...v, ...(data || []).filter(item => !v.some(anterior => anterior.id === item.id))])
    setCargandoEventos(false)
  }

  const nombreUnidad = id => unidades[String(id)] || (String(animal?.unidad_id) === String(id) ? 'Unidad asignada' : `Unidad ${id}`)
  const fotoPrincipal = fotos.find(f => f.vista === 'frontal')?.url || fotos[0]?.url || `/images/semovientes/${animal?.especie || 'bovino'}.jpg`
  const fotoSeleccionada = vistaFoto || fotoPrincipal
  const especie = animal ? ESPECIES_HISTORIAL[animal.especie] || animal.especie : ''

  return <main className="hix-page">
    <nav className="hix-ubicacion" aria-label="Navegación"><button type="button" onClick={onVolver}>Historial Individual</button><span>›</span><strong>Expediente del semoviente</strong></nav>
    <div className="hix-superior"><div><small>ARMADA BOLIVIANA · TRAZABILIDAD GANADERA</small><h1>Historial Individual del Semoviente</h1><p>Ficha integral del animal y sus acontecimientos registrados en Supabase</p></div><button type="button" className="hix-volver" onClick={onVolver}>← Volver al listado</button></div>
    {cargando && <div className="hix-panel"><p role="status">Cargando ficha, historial y fotografías…</p></div>}
    {error && <div className="hix-panel hix-alerta" role="alert">{error}</div>}
    {!cargando && animal && <>
      <section className="hix-cabecera hix-panel">
        <div className="hix-imagen-principal"><img src={fotoSeleccionada} alt={`Vista del semoviente ${animal.codigo}`} /></div>
        <div className="hix-info-principal">
          <div className="hix-id-titulo"><div><h2>{animal.codigo_activo || `Código ${animal.codigo}`}</h2><p>{especie} · {animal.raza || 'Raza no declarada'}</p></div><EtiquetaEstado estado={animal.estado} /></div>
          <div className="hix-campos-rapidos"><FichaDato titulo="Código individual" valor={animal.codigo} /><FichaDato titulo="Sexo" valor={animal.sexo} /><FichaDato titulo="Fecha de nacimiento" valor={fechaHistorial(animal.fecha_nacimiento)} /><FichaDato titulo="Edad" valor={edadLegible(animal.fecha_nacimiento)} /><FichaDato titulo="Clase" valor={animal.categoria} /><FichaDato titulo="Unidad actual" valor={nombreUnidad(animal.unidad_id)} /><FichaDato titulo="Ingreso" valor={fechaHistorial(animal.fecha_ingreso)} /><FichaDato titulo="Procedencia" valor={animal.procedencia} /></div>
        </div>
        <div className="hix-acciones"><button type="button" onClick={() => window.print()}>▤ Imprimir ficha</button><span>Solo consulta</span></div>
      </section>

      <nav className="hix-pestanas" aria-label="Secciones del expediente">{PESTANAS.map(([id, nombre, icono]) => <button type="button" key={id} aria-current={pestana === id ? 'page' : undefined} className={pestana === id ? 'hix-seleccionada' : ''} onClick={() => setPestana(id)}><span aria-hidden="true">{icono}</span> {nombre}</button>)}</nav>

      {pestana === 'resumen' && <>
        <div className="hix-dos-columnas">
          <section className="hix-panel"><h3 className="hix-panel-titulo">▣ Resumen del semoviente</h3><dl className="hix-ficha-tabla">{[
            ['Código individual', animal.codigo],['Código del Activo', animal.codigo_activo || 'Pendiente de asignación'],['Especie', especie],['Raza', animal.raza || '—'],['Sexo', animal.sexo],['Fecha de nacimiento', fechaHistorial(animal.fecha_nacimiento)],['Edad', edadLegible(animal.fecha_nacimiento)],['Categoría', animal.categoria],['Procedencia', animal.procedencia],['Fecha de ingreso', fechaHistorial(animal.fecha_ingreso)],['Unidad', nombreUnidad(animal.unidad_id)],['Estado', animal.estado]
          ].map(([k,v]) => <div key={k}><dt>{k}</dt><dd>{v || '—'}</dd></div>)}</dl></section>
          <section className="hix-panel"><div className="hix-panel-titulo hix-titulo-linea"><h3>◉ Línea de tiempo del historial</h3><span>{totalEventos} acontecimientos</span></div>
            {erroresDatos.eventos && <p className="hix-advertencia" role="alert">{erroresDatos.eventos}</p>}
            {!erroresDatos.eventos && eventos.length === 0 && <TextoVacio>No existen acontecimientos documentados en la línea de tiempo. La fecha de ingreso declarada puede consultarse en Datos generales.</TextoVacio>}
            <ol className="hix-timeline">{eventos.map(ev => {const tipo = TIPOS_HISTORIAL[ev.tipo_evento] || ['Acontecimiento','hix-observacion','•']; return <li key={ev.id}><span className={`hix-timeline-icon ${tipo[1]}`} aria-hidden="true">{tipo[2]}</span><time>{fechaHistorial(ev.fecha_evento)}</time><div><strong>{ev.titulo}</strong>{ev.detalle && <p>{ev.detalle}</p>}<small>{tipo[0]}</small></div></li>})}</ol>
            {eventos.length < totalEventos && <button type="button" className="hix-mas" disabled={cargandoEventos} onClick={verMasEventos}>{cargandoEventos ? 'Cargando…' : `Mostrar más (${eventos.length} de ${totalEventos})`}</button>}
          </section>
        </div>
        <div className="hix-dos-columnas hix-inferior">
          <section className="hix-panel"><h3 className="hix-panel-titulo">▧ Fotografías del semoviente</h3>{erroresDatos.fotos && <p className="hix-advertencia">{erroresDatos.fotos}</p>}<div className="hix-galeria">{FOTOS.map(([tipo,nombre]) => {const foto=fotos.find(f => f.vista === tipo);return <button type="button" disabled={!foto} key={tipo} title={nombre} className={foto?.url === fotoSeleccionada ? 'hix-mini-activa' : ''} onClick={() => foto && setVistaFoto(foto.url)}>{foto ? <img src={foto.url} alt={nombre} /> : <span>Sin foto</span>}<small>{nombre}</small></button>})}</div><p className="hix-nota">Imágenes de identificación recuperadas del almacenamiento privado.</p></section>
          <section className="hix-panel"><h3 className="hix-panel-titulo">✎ Observaciones generales</h3><p className="hix-observaciones">{animal.observaciones || 'No se registraron observaciones generales.'}</p><div className="hix-fecha-actualizacion">Última actualización: {fechaHistorial(animal.updated_at, true)}</div></section>
        </div>
      </>}

      {pestana === 'datos' && <section className="hix-panel"><h3 className="hix-panel-titulo">Datos generales del semoviente</h3><div className="hix-datos-grid">
        <FichaDato titulo="Código individual" valor={animal.codigo}/><FichaDato titulo="Código del Activo" valor={animal.codigo_activo || 'Pendiente de asignación'}/><FichaDato titulo="Especie" valor={especie}/><FichaDato titulo="Categoría / clase" valor={animal.categoria}/><FichaDato titulo="Sexo" valor={animal.sexo}/><FichaDato titulo="Raza" valor={animal.raza}/><FichaDato titulo="Nacimiento" valor={fechaHistorial(animal.fecha_nacimiento)}/><FichaDato titulo="Edad" valor={edadLegible(animal.fecha_nacimiento)}/><FichaDato titulo="Procedencia" valor={animal.procedencia}/><FichaDato titulo="Fecha de ingreso" valor={fechaHistorial(animal.fecha_ingreso)}/><FichaDato titulo="Marca Ancla" valor={animal.marca_ancla ? 'Sí' : 'No'}/><FichaDato titulo="Vacuna brucelosis (dato inicial)" valor={animal.vacuna_brucelosis ? 'Sí' : 'No'}/><FichaDato titulo="Unidad actual" valor={nombreUnidad(animal.unidad_id)}/><FichaDato titulo="Estado actual" valor={animal.estado}/><FichaDato titulo="Registro digital" valor={fechaHistorial(animal.created_at, true)}/><FichaDato titulo="Actualizado" valor={fechaHistorial(animal.updated_at, true)}/>
      </div><h3 className="hix-subtitulo">Observaciones</h3><p className="hix-observaciones">{animal.observaciones || 'Sin observaciones registradas.'}</p></section>}

      {pestana === 'sanidad' && <section className="hix-panel"><h3 className="hix-panel-titulo">Historial sanitario <span>({datos.sanitario.length})</span></h3>{erroresDatos.sanitario && <p role="alert" className="hix-advertencia">{erroresDatos.sanitario}</p>}{!datos.sanitario.length && !erroresDatos.sanitario && <TextoVacio/>}<div className="hix-lista-registros">{datos.sanitario.map(c => <TarjetaLista key={c.id} titulo={c.tipo_control} fecha={fechaHistorial(c.fecha_control)} auxiliar={`Responsable: ${c.responsable_sanitario || 'No registrado'} · Próximo control: ${fechaHistorial(c.proximo_control)}`}>{[c.motivo,c.diagnostico,c.producto ? `Producto: ${c.producto}${c.dosis ? ` · Dosis: ${c.dosis} ${c.unidad_dosis || ''}` : ''}` : ''].filter(Boolean).join(' · ')}</TarjetaLista>)}</div></section>}

      {pestana === 'reproduccion' && <section className="hix-panel"><h3 className="hix-panel-titulo">Historial reproductivo</h3><ResumenReproductivo semovienteId={animal.id} sexo={animal.sexo} />{erroresDatos.reproduccion && <p role="alert" className="hix-advertencia">{erroresDatos.reproduccion}</p>}{!datos.reproduccion.length && !erroresDatos.reproduccion && <TextoVacio/>}<div className="hix-lista-registros">{datos.reproduccion.map(c => <TarjetaLista key={c.id} titulo={`${c.tipo_evento}${c.reproductor_id === animal.id && c.semoviente_id !== animal.id ? ' · macho vinculado' : ''}`} fecha={fechaHistorial(c.fecha_evento)} auxiliar={`Resultado: ${c.resultado || '—'} · Responsable: ${c.responsable_reproductivo || '—'}`}>{[c.detalle, c.metodo ? `Método: ${c.metodo}` : '', c.cantidad_crias ? `Crías: ${c.cantidad_crias}` : ''].filter(Boolean).join(' · ')}</TarjetaLista>)}</div></section>}

      {pestana === 'movimientos' && <section className="hix-panel"><h3 className="hix-panel-titulo">Historial de movimientos</h3>{erroresDatos.movimientos && <p role="alert" className="hix-advertencia">{erroresDatos.movimientos}</p>}{!datos.movimientos.length && !erroresDatos.movimientos && <TextoVacio/>}<div className="hix-lista-registros">{datos.movimientos.map(c => <TarjetaLista key={c.id} titulo={`Solicitud N.º ${c.id} · ${c.estado}`} fecha={fechaHistorial(c.creado_en, true)} auxiliar={`Fecha prevista: ${fechaHistorial(c.fecha_prevista)} · Fecha de ejecución: ${fechaHistorial(c.fecha_ejecucion, true)}`}>{`${nombreUnidad(c.unidad_origen_id)} → ${nombreUnidad(c.unidad_destino_id)} · ${c.motivo || 'Sin motivo'}`}</TarjetaLista>)}</div></section>}

      {pestana === 'bajas' && <section className="hix-panel"><h3 className="hix-panel-titulo">Altas y bajas</h3><TarjetaLista titulo="Fecha de ingreso declarada" fecha={fechaHistorial(animal.fecha_ingreso)} auxiliar="Dato administrativo; no representa necesariamente un acontecimiento de alta documentado">Procedencia: {animal.procedencia || 'No registrada'}</TarjetaLista>{erroresDatos.bajas && <p role="alert" className="hix-advertencia">{erroresDatos.bajas}</p>}{!datos.bajas.length && !erroresDatos.bajas && <TextoVacio>No hay bajas registradas para este animal.</TextoVacio>}<div className="hix-lista-registros">{datos.bajas.map(c => <TarjetaLista key={c.id} titulo={`Baja por ${c.tipo}`} fecha={fechaHistorial(c.fecha)} auxiliar={`Registro de baja N.º ${c.id}`}>{c.motivo}</TarjetaLista>)}</div>{fotoEvidencia && <div className="hix-evidencia"><strong>Fotografía de evidencia de defunción</strong><img alt="Evidencia adjunta a la baja registrada" src={fotoEvidencia} /></div>}</section>}

      {pestana === 'descarte' && <section className="hix-panel"><h3 className="hix-panel-titulo">Historial de evaluaciones por descarte</h3><p className="hix-nota">Las alertas actuales por edad se consultan en Evaluación por Descarte. Aquí solo se presentan evaluaciones históricas existentes.</p>{erroresDatos.descarte && <p role="alert" className="hix-advertencia">{erroresDatos.descarte}</p>}{!datos.descarte.length && !erroresDatos.descarte && <TextoVacio/>}<div className="hix-lista-registros">{datos.descarte.map(c => <TarjetaLista key={c.id} titulo={`Dictamen: ${c.dictamen}`} fecha={fechaHistorial(c.fecha)}>{c.motivo}</TarjetaLista>)}</div></section>}

      {pestana === 'fotos' && <section className="hix-panel"><h3 className="hix-panel-titulo">Galería de fotografías</h3>{erroresDatos.fotos && <p role="alert" className="hix-advertencia">{erroresDatos.fotos}</p>}<div className="hix-galeria-completa">{FOTOS.map(([tipo,nombre]) => {const f = fotos.find(x => x.vista === tipo);return <div key={tipo} className="hix-foto-detalle">{f ? <a href={f.url} target="_blank" rel="noreferrer"><img src={f.url} alt={nombre}/></a> : <div className="hix-foto-no">Fotografía no adjuntada</div>}<strong>{nombre}</strong></div>})}{fotoEvidencia && <div className="hix-foto-detalle"><a href={fotoEvidencia} target="_blank" rel="noreferrer"><img src={fotoEvidencia} alt="Evidencia de baja" /></a><strong>Evidencia de defunción</strong></div>}</div><p className="hix-nota">Las fotografías se muestran mediante enlaces temporales protegidos, sin alterar el registro.</p></section>}
      <p className="hix-pie-pagina">Consulta de solo lectura · Información visible según las políticas de seguridad de Supabase. Esta pantalla no crea ni modifica datos.</p>
    </>}
  </main>
}

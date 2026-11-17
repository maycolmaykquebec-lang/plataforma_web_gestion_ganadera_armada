import { useEffect, useMemo, useState } from 'react'
import { usePerfil } from '../contexts/PerfilContext'
import { supabase } from '../services/supabaseClient'
import { leerTablaProtegida, COLUMNAS_OPERATIVAS, mensajeGestion, crearCSV, descargarContenido, fechaBolivia } from '../services/gestionDatos'
import './ModulosGestion.css'

const ESPECIES = [['bovino', 'Vacuno'], ['equino', 'Equino'], ['caprino', 'Caprino'], ['mular', 'Mular'], ['avicola', 'Avícola'], ['porcino', 'Porcino']]
const CONTENIDO_INICIAL = { animales: [], bajas: [], evaluaciones: [], movimientos: [], unidades: [] }
const camposInventario = [['Código', 'codigo'], ['Unidad', 'unidad'], ['Especie', 'especie'], ['Clase', 'categoria'], ['Sexo', 'sexo'], ['Estado actual', 'estado'], ['Fecha de ingreso', 'fecha_ingreso']]

export default function ReportesPage() {
  const perfil = usePerfil()
  const [datos, setDatos] = useState(CONTENIDO_INICIAL)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [recarga, setRecarga] = useState(0)
  const [unidad, setUnidad] = useState('todas')
  const [especie, setEspecie] = useState('todas')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [exportando, setExportando] = useState(false)
  const [consultadoEn, setConsultadoEn] = useState(null)
  useEffect(() => {
    const controller = new AbortController()
    let vigente = true
    async function cargar() {
      setCargando(true); setError(''); setMensaje('')
      try {
        const tablas = ['semovientes', 'rb_bajas', 'rb_evaluaciones_descarte', 'solicitudes_movimientos']
        const valores = await Promise.all(tablas.map(tabla => leerTablaProtegida({ tabla, columnas: COLUMNAS_OPERATIVAS[tabla], signal: controller.signal })))
        const u = await supabase.from('unidades_operativas').select('id,codigo,nombre').order('nombre').abortSignal(controller.signal)
        if (u.error) throw u.error
        if (vigente) {
          setDatos({ animales: valores[0], bajas: valores[1], evaluaciones: valores[2], movimientos: valores[3], unidades: u.data || [] })
          setConsultadoEn(new Date())
        }
      } catch (fallo) {
        if (vigente) { setDatos(CONTENIDO_INICIAL); setConsultadoEn(null); setError(mensajeGestion(fallo, 'cargar el reporte completo')) }
      } finally { if (vigente) setCargando(false) }
    }
    cargar()
    return () => { vigente = false; controller.abort() }
  }, [recarga])
  const invalido = Boolean(desde && hasta && desde > hasta)
  const reporte = useMemo(() => {
    const animales = datos.animales.filter(a => (unidad === 'todas' || String(a.unidad_id) === unidad) && (especie === 'todas' || a.especie === especie))
    const codigos = new Map(datos.animales.map(a => [String(a.id), a]))
    const enPeriodo = fecha => (!desde || fecha >= desde) && (!hasta || fecha <= hasta)
    const especieEvento = registro => especie === 'todas' || codigos.get(String(registro.semoviente_id))?.especie === especie
    const bajas = datos.bajas.filter(b => (unidad === 'todas' || String(b.unidad_id) === unidad) && especieEvento(b) && enPeriodo(b.fecha))
    const evaluaciones = datos.evaluaciones.filter(e => (unidad === 'todas' || String(e.unidad_id) === unidad) && especieEvento(e) && enPeriodo(e.fecha))
    const movimientos = datos.movimientos.filter(m => (unidad === 'todas' || [m.unidad_origen_id, m.unidad_destino_id].some(id => String(id) === unidad)) && especieEvento(m) && enPeriodo(fechaBolivia(new Date(m.creado_en))))
    const resumen = ESPECIES.map(([id, nombre]) => ({ especie: nombre, registrados: animales.filter(a => a.especie === id).length, activos: animales.filter(a => a.especie === id && a.estado === 'Activo').length, bajas_actuales: animales.filter(a => a.especie === id && a.estado === 'Baja').length, altas_periodo: animales.filter(a => a.especie === id && enPeriodo(a.fecha_ingreso)).length }))
    return { animales, bajas, evaluaciones, movimientos, resumen, altas: animales.filter(a => enPeriodo(a.fecha_ingreso)).length }
  }, [datos, unidad, especie, desde, hasta])
  const disponible = !cargando && !error && !invalido
  const nombreUnidad = id => datos.unidades.find(u => String(u.id) === String(id))?.nombre || `Unidad ${id}`
  const inventario = reporte.animales.map(a => ({ ...a, unidad: nombreUnidad(a.unidad_id) }))
  async function excel() {
    if (!disponible || exportando) return
    setExportando(true); setMensaje(''); setError('')
    try {
      const ExcelJS = (await import('exceljs')).default
      const libro = new ExcelJS.Workbook()
      libro.creator = 'UOSPG. RÍO BLANCO · Armada Boliviana'
      const resumen = libro.addWorksheet('Resumen')
      resumen.addRow(['REPORTE DE SEMOVIENTES · ARMADA BOLIVIANA'])
      resumen.addRow(['Consulta', consultadoEn?.toLocaleString('es-BO', { timeZone: 'America/La_Paz' })])
      resumen.addRow(['Período de acontecimientos', `${desde || 'Sin límite inicial'} a ${hasta || 'Sin límite final'}`])
      resumen.addRow(['Alcance', unidad === 'todas' ? 'Unidades autorizadas de la sesión' : nombreUnidad(unidad)])
      resumen.addRow(['Inventario', 'Estado actual; no constituye un corte histórico'])
      resumen.addRow([])
      resumen.addRow(['Especie', 'Registrados actuales', 'Activos actuales', 'Bajas actuales', 'Altas del período'])
      for (const r of reporte.resumen) resumen.addRow([r.especie, r.registrados, r.activos, r.bajas_actuales, r.altas_periodo])
      const agregar = (nombre, columnas, filas) => {
        const hoja = libro.addWorksheet(nombre)
        hoja.addRow(columnas.map(([titulo]) => titulo))
        for (const fila of filas) hoja.addRow(columnas.map(([, campo]) => fila[campo] ?? ''))
        hoja.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
        hoja.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF16466B' } }
        hoja.columns.forEach(c => { c.width = 23 })
        hoja.views = [{ state: 'frozen', ySplit: 1 }]
        return hoja
      }
      agregar('Inventario actual', camposInventario, inventario)
      agregar('Bajas del período', [['ID', 'id'], ['ID semoviente', 'semoviente_id'], ['Unidad', 'unidad'], ['Tipo', 'tipo'], ['Fecha', 'fecha'], ['Motivo', 'motivo']], reporte.bajas.map(b => ({ ...b, unidad: nombreUnidad(b.unidad_id) })))
      agregar('Evaluaciones del período', [['ID', 'id'], ['ID semoviente', 'semoviente_id'], ['Unidad', 'unidad'], ['Fecha', 'fecha'], ['Dictamen', 'dictamen'], ['Motivo', 'motivo']], reporte.evaluaciones.map(e => ({ ...e, unidad: nombreUnidad(e.unidad_id) })))
      agregar('Movimientos del período', [['ID', 'id'], ['ID semoviente', 'semoviente_id'], ['Origen', 'origen'], ['Destino', 'destino'], ['Estado', 'estado'], ['Fecha prevista', 'fecha_prevista'], ['Motivo', 'motivo']], reporte.movimientos.map(m => ({ ...m, origen: nombreUnidad(m.unidad_origen_id), destino: nombreUnidad(m.unidad_destino_id) })))
      resumen.columns.forEach(c => { c.width = 30 })
      const buffer = await libro.xlsx.writeBuffer()
      descargarContenido(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `RIO_BLANCO_REPORTE_${fechaBolivia()}.xlsx`)
      setMensaje('Reporte Excel descargado con todas las filas de la consulta autorizada.')
    } catch (fallo) { setMensaje(mensajeGestion(fallo, 'generar el archivo Excel')) }
    finally { setExportando(false) }
  }
  return <div className="gestion-page">
    <header><small>ARMADA BOLIVIANA · INFORMACIÓN INSTITUCIONAL</small><h1>Reportes ganaderos</h1><p>Inventario actual y acontecimientos registrados dentro del alcance de su perfil.</p></header>
    {error && <p role="alert" className="gestion-error">{error}</p>}
    {mensaje && <p role="status" className="gestion-nota">{mensaje}</p>}
    <section className="gestion-panel"><div className="gestion-heading"><h2>Alcance del reporte</h2><button className="gestion-secondary" onClick={() => setRecarga(n => n + 1)} disabled={cargando || exportando}>Actualizar</button></div>
      <div className="gestion-grid">
        <label>Unidad<select value={unidad} onChange={e => setUnidad(e.target.value)}><option value="todas">Todas las unidades autorizadas</option>{datos.unidades.filter(u => perfil?.rol?.codigo !== 'RESP_UNIDAD' || String(u.id) === String(perfil?.unidad?.id)).map(u => <option value={u.id} key={u.id}>{u.nombre}</option>)}</select></label>
        <label>Especie<select value={especie} onChange={e => setEspecie(e.target.value)}><option value="todas">Todas las especies</option>{ESPECIES.map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}</select></label>
        <label>Desde<input type="date" value={desde} onChange={e => setDesde(e.target.value)} /></label>
        <label>Hasta<input type="date" value={hasta} onChange={e => setHasta(e.target.value)} /></label>
      </div>
      {invalido && <p role="alert" className="gestion-error">La fecha inicial debe ser anterior o igual a la final.</p>}
      <p className="gestion-muted">Las fechas filtran altas, bajas, evaluaciones y solicitudes. El inventario muestra el estado actual, no una reconstrucción histórica. Las especies de acontecimientos se relacionan con las fichas que su sesión puede consultar.</p>
    </section>
    <section className="gestion-kpis" aria-label="Indicadores del reporte">
      {[['Activos actuales', reporte.animales.filter(a => a.estado === 'Activo').length], ['Altas del período', reporte.altas], ['Bajas del período', reporte.bajas.length], ['Traslados recibidos del período', reporte.movimientos.filter(m => m.estado === 'ejecutado').length]].map(([titulo, valor]) => <div key={titulo} className="gestion-kpi"><strong>{disponible ? valor.toLocaleString('es-BO') : '—'}</strong><span>{titulo}</span></div>)}
    </section>
    <section className="gestion-panel"><h2>Existencias por especie</h2><div className="gestion-scroll"><table><thead><tr><th>Especie</th><th>Registrados actuales</th><th>Activos actuales</th><th>Bajas actuales</th><th>Altas del período</th></tr></thead><tbody>{disponible ? reporte.resumen.map(r => <tr key={r.especie}><td>{r.especie}</td><td>{r.registrados}</td><td>{r.activos}</td><td>{r.bajas_actuales}</td><td>{r.altas_periodo}</td></tr>) : <tr><td colSpan={5} className="gestion-empty">{cargando ? 'Consultando todos los registros autorizados…' : 'Reporte no disponible.'}</td></tr>}</tbody></table></div>
      <div className="gestion-actions"><button onClick={excel} disabled={!disponible || exportando}>{exportando ? 'Generando Excel…' : 'Descargar reporte Excel'}</button><button className="gestion-secondary" disabled={!disponible || exportando} onClick={() => descargarContenido(crearCSV(camposInventario, inventario), `RIO_BLANCO_INVENTARIO_ACTUAL_${fechaBolivia()}.csv`, 'text/csv;charset=utf-8')}>Descargar inventario CSV</button></div>
      {consultadoEn && <p className="gestion-muted">Consultado: {consultadoEn.toLocaleString('es-BO', { timeZone: 'America/La_Paz' })}. Exportaciones operativas sin firma institucional.</p>}
    </section>
  </div>
}

import { useEffect, useMemo, useState } from 'react'
import { usePerfil } from '../contexts/PerfilContext'
import { supabase } from '../services/supabaseClient'
import { leerTablaProtegida, COLUMNAS_OPERATIVAS, mensajeGestion } from '../services/gestionDatos'
import { calcularReporteGanadero, configuracionesGraficos, ESPECIES_REPORTE } from '../utils/reportesGanaderos'
import { urlSVGReporte } from '../utils/graficosReporteSVG'
import { exportarReporteExcelConGraficos } from '../services/exportarReportesConGraficos'
import './ModulosGestion.css'
import './ReportesPage.css'

const VACIO = { animales: [], bajas: [], evaluaciones: [], movimientos: [], unidades: [] }

export default function ReportesPage() {
  const perfil = usePerfil()
  const [datos, setDatos] = useState(VACIO)
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
      setCargando(true)
      setError('')
      setMensaje('')
      try {
        const tablas = ['semovientes', 'rb_bajas', 'rb_evaluaciones_descarte', 'solicitudes_movimientos']
        const columnas = tabla => tabla === 'semovientes'
          ? `${COLUMNAS_OPERATIVAS.semovientes},codigo_activo`
          : COLUMNAS_OPERATIVAS[tabla]
        const registros = await Promise.all(tablas.map(tabla =>
          leerTablaProtegida({ tabla, columnas: columnas(tabla), signal: controller.signal })
        ))
        const unidades = await supabase.from('unidades_operativas')
          .select('id,codigo,nombre').order('nombre').abortSignal(controller.signal)
        if (unidades.error) throw unidades.error
        if (vigente) {
          setDatos({ animales: registros[0], bajas: registros[1], evaluaciones: registros[2], movimientos: registros[3], unidades: unidades.data || [] })
          setConsultadoEn(new Date())
        }
      } catch (e) {
        if (vigente) {
          setDatos(VACIO)
          setConsultadoEn(null)
          setError(mensajeGestion(e, 'cargar los reportes autorizados'))
        }
      } finally { if (vigente) setCargando(false) }
    }
    cargar()
    return () => { vigente = false; controller.abort() }
  }, [recarga])

  const invalido = Boolean(desde && hasta && desde > hasta)
  const filtros = useMemo(() => ({ unidad, especie, desde, hasta }), [unidad, especie, desde, hasta])
  const reporte = useMemo(() => calcularReporteGanadero(datos, filtros), [datos, filtros])
  const graficos = useMemo(() => configuracionesGraficos(reporte), [reporte])
  const disponible = !cargando && !error && !invalido
  const opcionesUnidad = datos.unidades.filter(u =>
    perfil?.rol?.codigo !== 'RESP_UNIDAD' || String(u.id) === String(perfil?.unidad?.id)
  )

  async function exportarExcel() {
    if (!disponible || exportando) return
    setExportando(true)
    setMensaje('')
    try {
      await exportarReporteExcelConGraficos({ reporte, filtros, unidades: datos.unidades, consultadoEn })
      setMensaje('Excel descargado: incluye tablas y cuatro gráficos visibles en las hojas Resumen y Gráficos.')
    } catch (e) {
      setMensaje(mensajeGestion(e, 'generar Excel con gráficos'))
    } finally { setExportando(false) }
  }

  return <div className="gestion-page reporte-page">
    <header>
      <small>ARMADA BOLIVIANA · INFORMACIÓN INSTITUCIONAL</small>
      <h1>Reportes ganaderos</h1>
      <p>Indicadores, gráficos y exportación Excel de la información autorizada de las unidades ganaderas.</p>
    </header>

    {error && <p role="alert" className="gestion-error">{error}</p>}
    {mensaje && <p role="status" className="gestion-nota">{mensaje}</p>}

    <section className="gestion-panel" aria-label="Filtros de reportes">
      <div className="gestion-heading">
        <h2>Alcance de la consulta</h2>
        <button className="gestion-secondary" onClick={() => setRecarga(n => n + 1)} disabled={cargando || exportando}>Actualizar datos</button>
      </div>
      <div className="gestion-grid reporte-filtros">
        <label>Unidad operativa
          <select value={unidad} onChange={e => setUnidad(e.target.value)}>
            <option value="todas">Todas las unidades autorizadas</option>
            {opcionesUnidad.map(u => <option key={u.id} value={String(u.id)}>{u.nombre}</option>)}
          </select>
        </label>
        <label>Especie
          <select value={especie} onChange={e => setEspecie(e.target.value)}>
            <option value="todas">Todas las especies</option>
            {ESPECIES_REPORTE.map(([codigo, nombre]) => <option key={codigo} value={codigo}>{nombre}</option>)}
          </select>
        </label>
        <label>Desde<input type="date" value={desde} onChange={e => setDesde(e.target.value)}/></label>
        <label>Hasta<input type="date" value={hasta} onChange={e => setHasta(e.target.value)}/></label>
      </div>
      {invalido && <p role="alert" className="gestion-error">La fecha inicial no puede ser posterior a la final.</p>}
      <p className="gestion-muted">Las fechas filtran altas, bajas y solicitudes de traslado. Los indicadores de existencias reflejan el <strong>estado actual</strong>, no un inventario histórico.</p>
    </section>

    <section className="gestion-kpis" aria-label="Resumen estadístico">
      {[
        ['Activos actuales', reporte.activos],
        ['Altas del período', reporte.altas],
        ['Bajas del período', reporte.bajas.length],
        [unidad === 'todas' ? 'Traslados ejecutados del período' : 'Traslados recibidos del período', reporte.trasladosIndicador],
      ].map(([nombre, numero]) => <div key={nombre} className="gestion-kpi">
        <strong>{disponible ? numero.toLocaleString('es-BO') : '—'}</strong><span>{nombre}</span>
      </div>)}
    </section>

    <section className="gestion-panel reporte-panel-graficos">
      <div className="gestion-heading">
        <div>
          <h2>Panel de gráficos</h2>
          <p className="gestion-muted">Los gráficos se actualizan según los filtros seleccionados y también se incluyen en el Excel.</p>
        </div>
        <button onClick={exportarExcel} disabled={!disponible || exportando}>
          {exportando ? 'Preparando Excel con gráficos…' : 'Exportar reporte Excel con gráficos (.xlsx)'}
        </button>
      </div>
      {disponible ? <div className="reporte-graficos-grid">
        {graficos.map(config => <figure key={config.id} className="reporte-grafico">
          <img src={urlSVGReporte(config)} alt={`${config.titulo}. ${config.subtitulo}.`} loading="lazy"/>
          <figcaption>{config.titulo}</figcaption>
        </figure>)}
      </div> : <p className="gestion-empty">{cargando ? 'Cargando los gráficos autorizados…' : 'No hay gráficos disponibles para estos filtros.'}</p>}
      <p className="gestion-muted">Las tortas representan proporciones; las barras muestran cantidades. Los gráficos exportados a Excel se insertan como imágenes PNG, visibles aunque no sean editables como gráficos nativos.</p>
    </section>

    <section className="gestion-panel">
      <h2>Existencias y acontecimientos por especie</h2>
      <div className="gestion-scroll">
        <table>
          <thead><tr><th>Especie</th><th>Registrados</th><th>Activos</th><th>Bajas actuales</th><th>Altas del período</th><th>Bajas del período</th></tr></thead>
          <tbody>{disponible ? reporte.resumen.map(r => <tr key={r.codigo}>
            <td>{r.especie}</td><td>{r.registrados}</td><td>{r.activos}</td><td>{r.bajas_actuales}</td><td>{r.altas_periodo}</td><td>{r.bajas_periodo}</td>
          </tr>) : <tr><td colSpan={6} className="gestion-empty">{cargando ? 'Consultando registros autorizados…' : 'Reporte no disponible.'}</td></tr>}</tbody>
        </table>
      </div>
      <div className="gestion-actions">
        <button onClick={exportarExcel} disabled={!disponible || exportando}>
          {exportando ? 'Generando Excel…' : 'Descargar reporte Excel con gráficos'}
        </button>
      </div>
      {consultadoEn && <p className="gestion-muted">Última consulta: {consultadoEn.toLocaleString('es-BO', { timeZone: 'America/La_Paz' })}. Datos visibles según las políticas de Supabase.</p>}
    </section>
  </div>
}

import { useEffect, useMemo, useState } from 'react'
import {
  AF9_NOMBRES_INICIALES, XLSX_MIME, cargosAF9, obtenerUnidadAF9,
  normalizarAF9, prepararDatosAF9, generarExcelAF9, crearHTMLAF9,
} from '../../services/exportarAF9'
import './AF9OriginalPanel.css'

const especies = [
  ['todas', 'Todas las especies'], ['bovino', 'Ganado vacuno'],
  ['equino', 'Ganado equino'], ['caprino', 'Ganado caprino'],
  ['mular', 'Ganado mular'], ['porcino', 'Ganado porcino'],
]
const hoy = () => {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const valor = tipo => partes.find(p => p.type === tipo)?.value
  return `${valor('year')}-${valor('month')}-${valor('day')}`
}

export default function AF9OriginalPanel({ animales = [], unidades = {}, unidadSeleccionada = 'todas', disponible = false }) {
  const [especie, setEspecie] = useState('bovino')
  const [unidadAF9, setUnidadAF9] = useState('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState(hoy)
  const [nombres, setNombres] = useState([...AF9_NOMBRES_INICIALES])
  const [mensaje, setMensaje] = useState('')
  const [generando, setGenerando] = useState(false)

  const opcionesUnidad = useMemo(() => {
    const ids = [...new Set(animales.map(a => String(a.unidad_id)))].filter(id => obtenerUnidadAF9(unidades[id]))
    return ids.sort((a, b) => (unidades[a] || '').localeCompare(unidades[b] || '', 'es'))
  }, [animales, unidades])

  useEffect(() => {
    if (unidadSeleccionada !== 'todas' && opcionesUnidad.includes(String(unidadSeleccionada))) {
      setUnidadAF9(String(unidadSeleccionada))
    } else {
      setUnidadAF9(actual => opcionesUnidad.includes(actual) ? actual : (opcionesUnidad[0] || ''))
    }
  }, [unidadSeleccionada, opcionesUnidad])

  const unidadInfo = obtenerUnidadAF9(unidades[unidadAF9])
  const activos = useMemo(() => animales.filter(a => String(a.unidad_id) === unidadAF9 &&
    normalizarAF9(a.estado) === 'activo' && (especie === 'todas' || normalizarAF9(a.especie) === especie)), [animales, especie, unidadAF9])
  const hayFechaInvalida = !fechaHasta || !!fechaDesde && fechaDesde > fechaHasta
  const listo = disponible && !!unidadAF9 && !!unidadInfo && activos.length > 0 && !hayFechaInvalida && !generando

  const datos = () => prepararDatosAF9({ animales: activos, unidades, especie, fecha: fechaHasta, fechaDesde, nombres })

  async function descargar() {
    setGenerando(true)
    setMensaje('')
    try {
      const reporte = await generarExcelAF9(datos())
      const enlace = URL.createObjectURL(new Blob([reporte.buffer], { type: XLSX_MIME }))
      const a = document.createElement('a')
      a.href = enlace
      a.download = `AF09_${unidadInfo.clave}_${especie}_${fechaHasta}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.setTimeout(() => URL.revokeObjectURL(enlace), 5000)
      setMensaje(`AF-09 descargado correctamente (${reporte.hojas} hoja/s).`)
    } catch (e) { setMensaje(e?.message || 'No se pudo generar el Excel.') }
    finally { setGenerando(false) }
  }
  function imprimir() {
    setMensaje('')
    try {
      const ventana = window.open('', '_blank')
      if (!ventana) throw new Error('Permita abrir ventanas emergentes para imprimir.')
      ventana.document.open()
      ventana.document.write(crearHTMLAF9(datos()))
      ventana.document.close()
    } catch (e) { setMensaje(e?.message || 'No se pudo preparar la impresión.') }
  }

  return <section className="rio_blanco-af9-original rio_blanco-inv-panel">
    <div className="rio_blanco-af9-original-head"><div>
      <h2>FORM. AF-09 · Inventario de activos fijos semovientes</h2>
      <p>Exportación por unidad y especie, con el formato de columnas del AF-09 institucional.</p>
    </div></div>
    <div className="rio_blanco-af9-original-grid">
      <label>Unidad operativa del AF-09
        <select value={unidadAF9} onChange={e => { setUnidadAF9(e.target.value); setMensaje('') }}>
          {!opcionesUnidad.length && <option value="">Sin unidades visibles</option>}
          {opcionesUnidad.map(id => <option key={id} value={id}>{unidades[id]}</option>)}
        </select>
      </label>
      <label>Especie
        <select value={especie} onChange={e => setEspecie(e.target.value)}>
          {especies.map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
        </select>
      </label>
      <label>Del (fecha opcional)
        <input type="date" value={fechaDesde} max={fechaHasta} onChange={e => setFechaDesde(e.target.value)} />
      </label>
      <label>Al (fecha de emisión)
        <input type="date" value={fechaHasta} max={hoy()} onChange={e => setFechaHasta(e.target.value)} />
      </label>
    </div>
    <div className="rio_blanco-af9-original-info">
      <strong>Unidad: {unidadInfo?.nombre || 'Sin seleccionar'} · Activos a exportar: {activos.length}</strong>
      <span>Ficha Veterinaria: NO · Descripción: vacía · Costo unitario y total: vacíos.</span>
    </div>
    <h3>Responsables (nombres y grados editables)</h3>
    <div className="rio_blanco-af9-original-firmas">
      {nombres.map((nombre, i) => <fieldset key={i}>
        <legend>Responsable {i + 1}</legend>
        <label>Nombre y grado
          <input value={nombre} maxLength={80} placeholder="Escriba el nombre y grado (opcional)" onChange={e => setNombres(v => v.map((x, j) => j === i ? e.target.value : x))} />
        </label>
        <label>Cargo institucional
          <input readOnly value={cargosAF9(unidadInfo)[i]} />
        </label>
      </fieldset>)}
    </div>
    {!disponible && <p className="rio_blanco-af9-original-alerta">Espere a que termine la carga del inventario; no se exportan datos parciales.</p>}
    {disponible && !activos.length && <p className="rio_blanco-af9-original-alerta">No hay semovientes activos para la unidad y especie seleccionadas.</p>}
    {hayFechaInvalida && <p className="rio_blanco-af9-original-alerta">La fecha «Del» no puede superar la fecha «Al».</p>}
    <div className="rio_blanco-af9-original-pie">
      <p>Los costos y la descripción se dejan realmente vacíos; las firmas manuscritas no se copian. Los nombres pueden completarse ahora o editarse en Excel.</p>
      <div>
        <button type="button" className="rio_blanco-inv-primary" disabled={!listo} onClick={descargar}>{generando ? 'Generando AF-09…' : 'Exportar AF-09 en Excel (.xlsx)'}</button>{' '}
        <button type="button" className="rio_blanco-inv-secondary" disabled={!listo} onClick={imprimir}>Imprimir</button>
      </div>
    </div>
    {mensaje && <p role="status" className="rio_blanco-af9-original-mensaje">{mensaje}</p>}
  </section>
}

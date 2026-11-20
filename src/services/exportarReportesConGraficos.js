import { descargarContenido, fechaBolivia } from './gestionDatos'
import { configuracionesGraficos } from '../utils/reportesGanaderos'
import { pngDeSVGReporte } from '../utils/graficosReporteSVG'

const NARANJA = 'FFE88734'
const AZUL = 'FF15476D'
const AZUL_CLARO = 'FFEAF3FA'
const GRIS = 'FF5E768B'
const EXCEL_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

// Se muestran como texto los valores provenientes de campos libres, para
// impedir que una descripción ingresada por un usuario sea interpretada como fórmula.
function celdaSegura(valor) {
  if (valor === null || valor === undefined) return ''
  if (typeof valor === 'number' || typeof valor === 'boolean') return valor
  const s = String(valor)
  return /^\s*[=+\-@]/.test(s) ? `'${s}` : s
}

function cabecera(hoja, fila, alto = 25) {
  const r = hoja.getRow(fila)
  r.height = alto
  r.font = { name: 'Arial', bold: true, size: 11, color: { argb: 'FFFFFFFF' } }
  r.alignment = { vertical: 'middle', wrapText: true }
  r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } }
  r.eachCell(celda => { celda.border = { bottom: { style: 'thin', color: { argb: 'FFB6CBDC' } } } })
}

function titulo(hoja, texto, ultima = 'F') {
  hoja.mergeCells(`A1:${ultima}1`)
  hoja.getCell('A1').value = texto
  hoja.getCell('A1').font = { name: 'Arial', size: 17, bold: true, color: { argb: 'FFFFFFFF' } }
  hoja.getCell('A1').alignment = { vertical: 'middle' }
  hoja.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } }
  hoja.getRow(1).height = 38
  hoja.getRow(2).height = 12
}

function hojaDatos(libro, nombre, columnas, filas) {
  const hoja = libro.addWorksheet(nombre, { views: [{ state: 'frozen', ySplit: 1 }] })
  hoja.addRow(columnas.map(c => c[0]))
  cabecera(hoja, 1, 33)
  for (const item of filas) hoja.addRow(columnas.map(c => celdaSegura(item[c[1]])))
  hoja.columns.forEach((c, i) => { c.width = Math.min(44, Math.max(17, columnas[i][2] || 21)) })
  hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columnas.length } }
  hoja.eachRow((fila, i) => {
    if (i <= 1) return
    fila.height = 21
    fila.alignment = { vertical: 'middle' }
    if (i % 2 === 0) fila.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F7FB' } }
  })
  hoja.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
  return hoja
}

export async function exportarReporteExcelConGraficos({ reporte, filtros, unidades, consultadoEn }) {
  const { default: ExcelJS } = await import('exceljs')
  const libro = new ExcelJS.Workbook()
  libro.creator = 'Plataforma de Gestión Ganadera · Armada Boliviana'
  libro.subject = 'Reporte institucional con gráficos de consulta'
  libro.created = new Date()
  const nombreUnidad = id => unidades.find(u => String(u.id) === String(id))?.nombre || `Unidad ${id}`
  const { unidad, especie, desde, hasta } = filtros
  const leyendaUnidad = unidad === 'todas' ? 'Unidades autorizadas' : nombreUnidad(unidad)
  const leyendaFechas = `${desde || 'Sin límite inicial'} / ${hasta || 'Sin límite final'}`
  const graficos = configuracionesGraficos(reporte)
  // La conversión se hace ANTES de generar/descargar el libro. Si falla,
  // no se entregará un archivo sin gráficos accidentalmente.
  const pngs = await Promise.all(graficos.map(pngDeSVGReporte))
  const idsImagen = pngs.map(base64 => libro.addImage({ base64, extension: 'png' }))

  const resumen = libro.addWorksheet('Resumen')
  titulo(resumen, 'REPORTE GANADERO · ARMADA BOLIVIANA', 'P')
  resumen.addRow(['Unidad', leyendaUnidad])
  resumen.addRow(['Especie', especie === 'todas' ? 'Todas las especies' : especie])
  resumen.addRow(['Acontecimientos entre', leyendaFechas])
  resumen.addRow(['Consultado', consultadoEn?.toLocaleString('es-BO', { timeZone: 'America/La_Paz' }) || fechaBolivia()])
  resumen.addRow(['Nota', 'El inventario es actual; las fechas delimitan acontecimientos, no reconstruyen el inventario histórico.'])
  resumen.addRow([])
  resumen.getRow(7).height = 15
  resumen.addRow(['INDICADOR', 'TOTAL'])
  cabecera(resumen, 8)
  const kpis = [
    ['Semovientes activos actuales', reporte.activos],
    ['Altas del período', reporte.altas],
    ['Bajas del período', reporte.bajas.length],
    [unidad === 'todas' ? 'Traslados ejecutados del período' : 'Traslados recibidos del período', reporte.trasladosIndicador],
  ]
  kpis.forEach(([nombre, valor]) => resumen.addRow([nombre, valor]))
  resumen.addRow([])
  resumen.addRow(['ESPECIE', 'REGISTRADOS ACTUALES', 'ACTIVOS', 'BAJAS ACTUALES', 'ALTAS PERÍODO', 'BAJAS PERÍODO'])
  cabecera(resumen, 14, 34)
  for (const r of reporte.resumen) {
    resumen.addRow([r.especie, r.registrados, r.activos, r.bajas_actuales, r.altas_periodo, r.bajas_periodo])
  }
  resumen.getColumn(1).width = 31
  resumen.getColumn(2).width = 25
  for (let i = 3; i <= 6; i++) resumen.getColumn(i).width = 20
  for (let i = 7; i <= 16; i++) resumen.getColumn(i).width = 12
  resumen.getCell('A6').font = { color: { argb: GRIS }, italic: true }
  resumen.views = [{ state: 'frozen', ySplit: 2 }]
  resumen.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 2 }
  resumen.addImage(idsImagen[0], { tl: { col: 6.2, row: 2 }, ext: { width: 610, height: 333 } })
  resumen.addImage(idsImagen[1], { tl: { col: 6.2, row: 20 }, ext: { width: 610, height: 333 } })

  const hojaGraficos = libro.addWorksheet('Gráficos')
  titulo(hojaGraficos, 'PANEL DE GRÁFICOS · REPORTE GANADERO', 'U')
  hojaGraficos.mergeCells('A3:U3')
  hojaGraficos.getCell('A3').value = `Unidad: ${leyendaUnidad}  |  Período: ${leyendaFechas}`
  hojaGraficos.getCell('A3').font = { size: 11, color: { argb: GRIS } }
  for (let i = 1; i <= 21; i++) hojaGraficos.getColumn(i).width = 11
  for (let i = 4; i <= 48; i++) hojaGraficos.getRow(i).height = 22
  hojaGraficos.addImage(idsImagen[0], { tl: { col: 0.3, row: 4.5 }, ext: { width: 655, height: 357 } })
  hojaGraficos.addImage(idsImagen[1], { tl: { col: 10.7, row: 4.5 }, ext: { width: 655, height: 357 } })
  hojaGraficos.addImage(idsImagen[2], { tl: { col: 0.3, row: 25.0 }, ext: { width: 655, height: 357 } })
  hojaGraficos.addImage(idsImagen[3], { tl: { col: 10.7, row: 25.0 }, ext: { width: 655, height: 357 } })
  hojaGraficos.pageSetup = { orientation: 'landscape', paperSize: 8, fitToPage: true, fitToWidth: 1, fitToHeight: 1 }

  const inventario = reporte.animales.map(a => ({ ...a, unidad: nombreUnidad(a.unidad_id) }))
  hojaDatos(libro, 'Inventario actual', [
    ['Código individual', 'codigo', 19], ['Código del Activo', 'codigo_activo', 26], ['Unidad', 'unidad', 20],
    ['Especie', 'especie'], ['Clase', 'categoria'], ['Sexo', 'sexo'], ['Estado actual', 'estado'],
    ['Fecha de ingreso', 'fecha_ingreso', 19], ['Fecha de nacimiento', 'fecha_nacimiento', 20],
  ], inventario)
  hojaDatos(libro, 'Bajas del período', [
    ['ID de baja', 'id'], ['Código semoviente', 'codigo'], ['Unidad', 'unidad'],
    ['Tipo', 'tipo'], ['Fecha', 'fecha'], ['Motivo', 'motivo', 42],
  ], reporte.bajas.map(b => ({ ...b, codigo: reporte.animales.find(a => a.id === b.semoviente_id)?.codigo || String(b.semoviente_id), unidad: nombreUnidad(b.unidad_id) })))
  hojaDatos(libro, 'Evaluaciones del período', [
    ['ID', 'id'], ['ID semoviente', 'semoviente_id'], ['Unidad', 'unidad'], ['Fecha', 'fecha'],
    ['Dictamen', 'dictamen'], ['Motivo', 'motivo', 44],
  ], reporte.evaluaciones.map(e => ({ ...e, unidad: nombreUnidad(e.unidad_id) })))
  hojaDatos(libro, 'Movimientos del período', [
    ['ID', 'id'], ['ID semoviente', 'semoviente_id'], ['Origen', 'origen'], ['Destino', 'destino'],
    ['Estado', 'estado'], ['Fecha prevista', 'fecha_prevista'], ['Fecha ejecución', 'fecha_ejecucion'],
    ['Motivo', 'motivo', 42],
  ], reporte.movimientos.map(m => ({ ...m, origen: nombreUnidad(m.unidad_origen_id), destino: nombreUnidad(m.unidad_destino_id) })))

  const buffer = await libro.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: EXCEL_MIME })
  const nombreSeguro = (unidad === 'todas' ? 'UNIDADES_AUTORIZADAS' : leyendaUnidad).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9_\-]+/g, '_')
  descargarContenido(blob, `REPORTE_GANADERO_${nombreSeguro}_${fechaBolivia()}.xlsx`)
}

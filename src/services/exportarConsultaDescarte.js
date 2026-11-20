import { clasificarPorEdad, criterioPara, formatoFechaCorta } from '../utils/criteriosDescarte'

const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const textoSeguro = valor => {
  const texto = String(valor ?? '').replace(/[\x00-\x1f\x7f]/g, ' ').trim()
  return /^[=+@-]/.test(texto) ? `'${texto}` : texto
}

export async function exportarConsultaDescarte({ registros, fechaConsulta, pestana, nombreUnidad, nombreEspecie, nombreArchivo }) {
  if (!Array.isArray(registros) || !registros.length) throw new Error('No existen registros para exportar.')
  // ExcelJS ya forma parte de las dependencias del proyecto.
  const exceljs = await import('exceljs')
  const ExcelJS = exceljs.default || exceljs
  const libro = new ExcelJS.Workbook()
  libro.creator = 'Gestión Ganadera · Armada Boliviana'
  libro.created = new Date()
  const hoja = libro.addWorksheet(pestana === 'elegibles' ? 'Revisión por edad' : 'Edad no determinada', {
    views: [{ state: 'frozen', ySplit: 5 }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })
  hoja.columns = [
    { key: 'numero', width: 8 }, { key: 'codigo', width: 18 }, { key: 'activo', width: 27 },
    { key: 'unidad', width: 21 }, { key: 'especie', width: 21 }, { key: 'sexo', width: 12 },
    { key: 'clase', width: 19 }, { key: 'nacimiento', width: 18 }, { key: 'edad', width: 19 },
    { key: 'umbral', width: 23 },
  ]
  hoja.mergeCells('A1:J1')
  hoja.getCell('A1').value = 'EVALUACIÓN POR DESCARTE · CONSULTA DE EDADES'
  hoja.getCell('A1').font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 15 }
  hoja.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF113C64' } }
  hoja.getCell('A1').alignment = { vertical: 'middle' }
  hoja.getRow(1).height = 32
  hoja.mergeCells('A2:J2')
  hoja.getCell('A2').value = `Fecha de referencia: ${formatoFechaCorta(fechaConsulta)} · ${pestana === 'elegibles' ? 'Semovientes activos que alcanzan su umbral' : 'Semovientes activos sin fecha de nacimiento'}`
  hoja.getCell('A2').font = { color: { argb: 'FF315572' }, size: 11 }
  hoja.mergeCells('A3:J3')
  hoja.getCell('A3').value = 'Solo consulta. Cumplir la edad no significa autorización ni recomendación automática de descarte.'
  hoja.getCell('A3').font = { color: { argb: 'FF7C4D14' }, italic: true, size: 10 }
  const titulos = ['N.º', 'Código individual', 'Código del Activo', 'Unidad', 'Especie', 'Sexo', 'Clase', 'Fecha de nacimiento', 'Edad', 'Criterio de revisión']
  const cabecera = hoja.getRow(5)
  titulos.forEach((t, i) => {
    const c = cabecera.getCell(i + 1)
    c.value = t
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF215B8A' } }
    c.alignment = { vertical: 'middle', wrapText: true }
  })
  cabecera.height = 28
  registros.forEach((a, i) => {
    const cl = clasificarPorEdad(a, fechaConsulta)
    const criterio = criterioPara(a.especie, a.sexo)
    const valores = [
      i + 1, textoSeguro(a.codigo), textoSeguro(a.codigo_activo), textoSeguro(nombreUnidad(a.unidad_id)),
      textoSeguro(nombreEspecie(a.especie)), textoSeguro(a.sexo), textoSeguro(a.categoria),
      formatoFechaCorta(a.fecha_nacimiento),
      cl.edad ? `${cl.edad.anos} años${cl.edad.meses ? `, ${cl.edad.meses} meses` : ''}` : 'No determinada',
      criterio ? `Desde ${criterio.edad} años` : 'Sin criterio',
    ]
    const fila = hoja.addRow(valores)
    fila.alignment = { vertical: 'middle', wrapText: true }
    fila.height = 22
    if (i % 2 === 1) fila.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F6FA' } } })
  })
  hoja.autoFilter = { from: 'A5', to: 'J5' }
  hoja.pageSetup.printTitlesRow = '1:5'
  hoja.headerFooter.oddFooter = 'Consulta institucional · Página &P de &N'
  const buffer = await libro.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: MIME_XLSX })
  const url = URL.createObjectURL(blob)
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombreArchivo
  document.body.appendChild(enlace)
  enlace.click()
  enlace.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

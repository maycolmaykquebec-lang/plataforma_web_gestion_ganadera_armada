const ESPECIES = Object.freeze({ bovino: 'Ganado vacuno', equino: 'Ganado equino', caprino: 'Ganado caprino', mular: 'Ganado mular', avicola: 'Ganado avícola', porcino: 'Ganado porcino' })
export const AF9_CARGOS = Object.freeze([
  'ENCARGADO DE PRADERAS',
  'ENCARGADO DE INVENTARIOS',
  'JEFE UOSPG. "RÍO BLANCO"',
  'JEFE DEL DPTO. VII "PARTICIPACIÓN EN EL DESARROLLO"',
  'DIR. GRAL. DE BIENES Y PATRIMONIO DE LA A.B.',
])
export const AF9_NOMBRES_INICIALES = Object.freeze(['', '', '', '', ''])
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
export const normalizarAF9 = value => String(value ?? '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
export const esRioBlancoAF9 = value => normalizarAF9(value).replace(/[\s_-]+/g, ' ') === 'rio blanco'
const texto = value => String(value ?? '').replace(/[\r\n\t\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ').trim()
const celdaTexto = value => { const s = texto(value); return /^[=+@-]/.test(s) ? `'${s}` : s }
const fechaValida = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value
const fechaTexto = fecha => new Intl.DateTimeFormat('es-BO', { timeZone: 'UTC', day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(`${fecha}T12:00:00Z`))
const escapar = value => texto(value).replace(/[&<>"']/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[x])

export function prepararDatosAF9({ animales = [], unidades = {}, especie = 'bovino', fecha, nombres = [] }) {
  if (!fechaValida(fecha)) throw new Error('La fecha de referencia no es válida.')
  if (especie !== 'todas' && !Object.hasOwn(ESPECIES, especie)) throw new Error('Seleccione una especie válida.')
  if (!Array.isArray(nombres) || nombres.length !== 5 || nombres.some(n => !texto(n) || texto(n).length > 80)) throw new Error('Complete los cinco nombres y grados (máximo 80 caracteres).')
  if (!Array.isArray(animales) || animales.length === 0) throw new Error('No hay semovientes para exportar.')
  const ids = new Set(animales.map(a => String(a.unidad_id)))
  if (ids.size !== 1 || !esRioBlancoAF9(unidades[[...ids][0]])) throw new Error('El parte debe contener únicamente semovientes de Río Blanco.')
  const semovientes = animales.map(a => {
    const tipo = normalizarAF9(a.especie)
    if (normalizarAF9(a.estado) !== 'activo' || !Object.hasOwn(ESPECIES, tipo) || (especie !== 'todas' && especie !== tipo)) throw new Error('El inventario contiene animales fuera del estado o especie elegidos.')
    if (!texto(a.codigo) || texto(a.codigo).length > 80) throw new Error('Existe un semoviente sin código válido.')
    if (a.fecha_nacimiento && !fechaValida(a.fecha_nacimiento)) throw new Error('Existe una fecha de nacimiento no válida.')
    return { codigo: texto(a.codigo), especie: tipo, categoria: texto(a.categoria), sexo: texto(a.sexo), raza: texto(a.raza), fecha_nacimiento: a.fecha_nacimiento || null }
  })
  return { fecha, especie, unidad: 'UOSPG. “RÍO BLANCO”', semovientes, responsables: nombres.map((n, i) => ({ nombre: texto(n), cargo: AF9_CARGOS[i] })) }
}

function paginasGeneradas(datos) {
  const paginas = []
  for (const especie of Object.keys(ESPECIES)) {
    const filas = datos.semovientes.filter(a => a.especie === especie)
    for (let inicio = 0; inicio < filas.length; inicio += 24) paginas.push({ especie, filas: filas.slice(inicio, inicio + 24), inicio, capacidad: 24 })
  }
  return paginas
}

function configuracionPagina(hoja, ultimaFila) {
  hoja.pageSetup = { ...hoja.pageSetup, paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1, printArea: `A1:T${ultimaFila}`, margins: { left: .18, right: .18, top: .25, bottom: .25, header: .1, footer: .1 } }
  hoja.headerFooter = { ...(hoja.headerFooter || {}), oddFooter: 'RÍO BLANCO · Sin firmas manuscritas · Página &P de &N' }
}

function firmasEnCeldas(hoja, fila, datos) {
  for (const rango of [...(hoja.model.merges || [])]) {
    const fin = Number(rango.split(':').at(-1).match(/\d+$/)?.[0] || 0)
    if (fin >= fila) hoja.unMergeCells(rango)
  }
  datos.responsables.forEach((responsable, i) => {
    const inicio = i * 4 + 1; const fin = inicio + 3
    hoja.mergeCells(fila, inicio, fila, fin)
    hoja.mergeCells(fila + 1, inicio, fila + 2, fin)
    hoja.mergeCells(fila + 3, inicio, fila + 4, fin)
    for (const [r, valor] of [[fila, '........................................'], [fila + 1, responsable.nombre], [fila + 3, responsable.cargo]]) {
      const c = hoja.getCell(r, inicio)
      c.value = celdaTexto(valor)
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      c.font = { name: 'Arial', size: r === fila + 3 ? 7 : 8, bold: r === fila + 3 }
    }
  })
  for (let r = fila; r <= fila + 4; r++) hoja.getRow(r).height = r === fila ? 20 : 17
}

function ponerDatos(hoja, pagina) {
  pagina.filas.forEach((a, i) => {
    const fila = i + 14
    hoja.getCell(`B${fila}`).value = pagina.inicio + i + 1
    hoja.getCell(`C${fila}`).value = 1
    if (a.fecha_nacimiento) {
      const [anio, mes, dia] = a.fecha_nacimiento.split('-').map(Number)
      hoja.getCell(`D${fila}`).value = dia
      hoja.getCell(`E${fila}`).value = mes
      hoja.getCell(`F${fila}`).value = anio
    }
    hoja.getCell(`G${fila}`).value = normalizarAF9(a.sexo) === 'hembra' ? 'H' : normalizarAF9(a.sexo) === 'macho' ? 'M' : ''
    hoja.getCell(`H${fila}`).value = celdaTexto(a.raza)
    hoja.getCell(`N${fila}`).value = celdaTexto(`${a.categoria} · Código individual: ${a.codigo}`)
    hoja.getRow(fila).height = 20
  })
}

function hojaGenerada(libro, pagina, indice, datos) {
  const hoja = libro.addWorksheet(`AF09_${pagina.especie.toUpperCase()}_${indice + 1}`, { views: [{ state: 'frozen', ySplit: 13, xSplit: 3, zoomScale: 75 }] })
  hoja.columns = Array.from({ length: 20 }, (_, i) => ({ width: i === 0 ? 17 : [7, 13].includes(i) ? 14 : i === 1 || i === 2 ? 5 : 8 }))
  const titulo = (fila, valor, tamano = 11) => {
    hoja.mergeCells(fila, 1, fila, 20)
    const c = hoja.getCell(fila, 1); c.value = valor; c.font = { name: 'Arial', size: tamano, bold: true }
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; hoja.getRow(fila).height = 22
  }
  titulo(1, 'ARMADA BOLIVIANA', 14)
  titulo(2, 'FORM. AF-09 · INVENTARIO DE ACTIVOS FIJOS SEMOVIENTES', 12)
  titulo(3, 'DPTO. VII “PARTICIPACIÓN EN EL DESARROLLO” · DIV. “B” “PRODUCCIÓN”', 10)
  titulo(5, `Fecha de referencia: ${fechaTexto(datos.fecha)}`)
  titulo(6, `${datos.unidad} · ${ESPECIES[pagina.especie]}`)
  titulo(8, 'Inventario actual generado con los registros visibles de la plataforma', 9)
  titulo(10, 'Formato generado · no reproduce una plantilla oficial no proporcionada', 8)
  const etiquetas = ['Código patrimonial', 'N.º', 'Cant.', 'Día', 'Mes', 'Año', 'Sexo', 'Raza', 'Marca', 'Color', 'Costo original', 'Actualización', 'Costo actual', 'Descripción / código individual', '', '', '', '', 'Matrícula', 'Observaciones']
  hoja.mergeCells('N12:R13')
  etiquetas.forEach((valor, i) => {
    if (i >= 14 && i <= 17) return
    if (i !== 13) hoja.mergeCells(12, i + 1, 13, i + 1)
    const c = hoja.getCell(12, i + 1); c.value = valor; c.font = { name: 'Arial', size: 8, bold: true }; c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE4EDF7' } }
  })
  hoja.getRow(12).height = 22; hoja.getRow(13).height = 20
  for (let fila = 14; fila < 14 + pagina.capacidad; fila++) {
    hoja.mergeCells(fila, 14, fila, 18)
    for (let col = 1; col <= 20; col++) {
      const c = hoja.getCell(fila, col)
      c.font = { name: 'Arial', size: 8 }; c.alignment = { horizontal: col === 14 ? 'left' : 'center', vertical: 'middle', wrapText: true }
      c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
    }
  }
  ponerDatos(hoja, pagina)
  firmasEnCeldas(hoja, 39, datos)
  hoja.mergeCells('A45:T45'); hoja.getCell('A45').value = 'Campos sin fuente verificable en blanco. Documento generado sin firmas manuscritas.'; hoja.getCell('A45').font = { name: 'Arial', size: 8 }
  configuracionPagina(hoja, 45)
  return hoja
}

function planPlantilla(datos, fuente) {
  const paginas = []
  for (const especie of Object.keys(ESPECIES)) {
    const filas = datos.semovientes.filter(a => a.especie === especie)
    if (!filas.length) continue
    const capacidad = especie === 'bovino' ? 44 : especie === 'equino' ? 19 : 24
    if (filas.length > capacidad) throw new Error(`La plantilla conocida admite ${capacidad} registros de ${ESPECIES[especie]}. Use el formato generado para exportarlos todos.`)
    const partes = especie === 'bovino' && filas.length > 23 ? [filas.slice(0, 23), filas.slice(23)] : [filas]
    partes.forEach((parte, indice) => {
      const nombre = especie === 'bovino' ? indice ? 'Hoja1' : 'Form-AF-09 RIO BLANCO' : especie === 'equino' ? 'Hoja2' : 'Form-AF-09'
      const hoja = fuente.getWorksheet(nombre)
      if (!hoja) throw new Error(`La plantilla no contiene la hoja esperada «${nombre}». Puede exportar sin plantilla.`)
      if (hoja.rowCount > 500 || hoja.columnCount > 64) throw new Error('La plantilla contiene un rango inesperado. Use el modelo AF-09 conocido o el formato generado.')
      paginas.push({ especie, filas: parte, inicio: indice * 23, capacidad: especie === 'bovino' ? indice ? 21 : 23 : especie === 'equino' ? 19 : 24, modelo: hoja })
    })
  }
  return paginas
}

function hojaDesdePlantilla(libro, pagina, indice, datos) {
  const hoja = libro.addWorksheet(`AF09_${pagina.especie.toUpperCase()}_${indice + 1}`)
  const modelo = JSON.parse(JSON.stringify(pagina.modelo.model))
  modelo.name = hoja.name; modelo.media = []
  hoja.model = modelo
  hoja.name = `AF09_${pagina.especie.toUpperCase()}_${indice + 1}`
  // El libro de salida es nuevo: no lleva imágenes, firmas ni hojas ocultas del modelo.
  hoja.state = 'visible'
  hoja.eachRow({ includeEmpty: true }, (fila, numero) => fila.eachCell({ includeEmpty: true }, celda => {
    if (numero >= 14) celda.value = null
    else if (typeof celda.value === 'object' && celda.value !== null) celda.value = celda.text
  }))
  for (let fila = 12; fila <= Math.max(54, hoja.rowCount); fila++) for (let col = 21; col <= Math.max(24, hoja.columnCount); col++) hoja.getCell(fila, col).value = null
  hoja.getCell('B5').value = celdaTexto(fechaTexto(datos.fecha)); hoja.getCell('M5').value = celdaTexto(fechaTexto(datos.fecha))
  hoja.getCell('D6').value = 'DEPARTAMENTO VII “PARTICIPACIÓN EN EL DESARROLLO”'
  hoja.getCell('D7').value = 'UOSPG. “RÍO BLANCO”'; hoja.getCell('J7').value = 'UOSPGRB'; hoja.getCell('O7').value = '086'; hoja.getCell('S7').value = pagina.especie === 'bovino' ? '2' : pagina.especie === 'equino' ? '3' : ''
  ponerDatos(hoja, pagina)
  const pie = 15 + pagina.capacidad
  firmasEnCeldas(hoja, pie, datos)
  configuracionPagina(hoja, pie + 4)
  return hoja
}

export async function crearLibroAF9(datos, plantilla = null) {
  const modulo = await import('exceljs')
  const ExcelJS = modulo.default || modulo
  const libro = new ExcelJS.Workbook()
  libro.creator = 'Plataforma Río Blanco'; libro.created = new Date(`${datos.fecha}T12:00:00Z`)
  if (plantilla) {
    const fuente = new ExcelJS.Workbook(); await fuente.xlsx.load(plantilla)
    for (const [i, pagina] of planPlantilla(datos, fuente).entries()) hojaDesdePlantilla(libro, pagina, i, datos)
  } else for (const [i, pagina] of paginasGeneradas(datos).entries()) hojaGenerada(libro, pagina, i, datos)
  return libro
}

export async function generarExcelAF9(datos, plantilla = null) {
  const libro = await crearLibroAF9(datos, plantilla)
  return { buffer: await libro.xlsx.writeBuffer(), hojas: libro.worksheets.length, modo: plantilla ? 'plantilla-compatible' : 'generado' }
}

export function crearHTMLAF9(datos) {
  const paginas = paginasGeneradas(datos)
  const hojas = paginas.map(p => `<section class="hoja"><h1>ARMADA BOLIVIANA</h1><h2>FORM. AF-09 · INVENTARIO DE ACTIVOS FIJOS SEMOVIENTES</h2><p>DPTO. VII “PARTICIPACIÓN EN EL DESARROLLO” · DIV. “B” “PRODUCCIÓN”</p><p><strong>${escapar(datos.unidad)} · ${escapar(ESPECIES[p.especie])}</strong></p><p>Fecha de referencia: ${escapar(fechaTexto(datos.fecha))}</p><table><thead><tr><th>N.º</th><th>Cant.</th><th>Código patrimonial</th><th>Nacimiento</th><th>Sexo</th><th>Raza</th><th>Descripción / código individual</th><th>Matrícula</th><th>Costo</th></tr></thead><tbody>${p.filas.map((a, i) => `<tr><td>${p.inicio + i + 1}</td><td>1</td><td></td><td>${escapar(a.fecha_nacimiento || '')}</td><td>${escapar(a.sexo)}</td><td>${escapar(a.raza)}</td><td>${escapar(a.categoria)} · ${escapar(a.codigo)}</td><td></td><td></td></tr>`).join('')}</tbody></table><div class="firmas">${datos.responsables.map(r => `<div><p>........................................</p><p>${escapar(r.nombre)}</p><strong>${escapar(r.cargo)}</strong></div>`).join('')}</div><p class="nota">Formato generado con datos actuales de la plataforma; no reproduce una plantilla oficial no proporcionada. Campos sin fuente verificable en blanco. Sin firmas manuscritas.</p></section>`).join('')
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>AF-09 · Río Blanco · ${escapar(datos.fecha)}</title><style>@page{size:A4 landscape;margin:12mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#111;margin:0}.hoja{padding:12mm;break-after:page}.hoja:last-child{break-after:auto}h1{font-size:17px;text-align:center;margin:0 0 7px}h2{font-size:13px;text-align:center;margin:0 0 8px}p{font-size:10px;text-align:center;margin:5px 0}table{border-collapse:collapse;width:100%;margin-top:12px;table-layout:fixed}th,td{border:1px solid #333;padding:5px;font-size:9px;overflow-wrap:anywhere}thead{display:table-header-group}tr{break-inside:avoid}.firmas{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-top:35px}.firmas p,.firmas strong{font-size:8px;text-align:center;display:block;overflow-wrap:anywhere}.nota{margin-top:14px;font-size:8px}.acciones{padding:15px;background:#eaf2fb}.acciones button{padding:10px 20px;cursor:pointer}@media print{.acciones{display:none}.hoja{padding:0}}</style></head><body><div class="acciones"><button id="imprimir">Imprimir / Guardar PDF</button></div>${hojas}</body></html>`
}

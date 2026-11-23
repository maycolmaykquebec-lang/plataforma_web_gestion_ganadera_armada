/**
 * Exportación AF-09 basada en la estructura de la referencia visual suministrada.
 * Solo lectura: NO escribe en Supabase. La consulta RLS la realiza InventarioGanaderoPage.
 */
const ESPECIES = Object.freeze({
  bovino: 'Ganado vacuno', equino: 'Ganado equino', caprino: 'Ganado caprino',
  mular: 'Ganado mular', porcino: 'Ganado porcino',
})

export const AF9_NOMBRES_INICIALES = Object.freeze(['', '', '', '', ''])
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
export const normalizarAF9 = valor => String(valor ?? '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const limpio = valor => String(valor ?? '').replace(/[\x00-\x1f\x7f]/g, ' ').trim()
const celdaSegura = valor => {
  const s = limpio(valor)
  return /^[=+@-]/.test(s) ? `'${s}` : s
}
const escapar = valor => limpio(valor).replace(/[&<>"']/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[x])
const fechaValida = valor => typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor) &&
  !Number.isNaN(Date.parse(`${valor}T12:00:00Z`)) && new Date(`${valor}T12:00:00Z`).toISOString().slice(0, 10) === valor
const fechaLarga = fecha => fecha ? new Intl.DateTimeFormat('es-BO', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${fecha}T12:00:00Z`)) : ''

const UNIDADES = Object.freeze({
  'rio blanco': { clave: 'RIO-BLANCO', nombre: 'RÍO BLANCO', sigla: 'UOSPGRB', area: '086' },
  'tamarinero': { clave: 'TAMARINERO', nombre: 'TAMARINERO', sigla: 'UOSPGT', area: '' },
  'mamore': { clave: 'MAMORE', nombre: 'MAMORÉ', sigla: 'UOSPGM', area: '' },
})
export function obtenerUnidadAF9(valor) {
  const n = normalizarAF9(valor).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  return Object.values(UNIDADES).find(u => normalizarAF9(u.nombre) === n || normalizarAF9(u.clave).replace(/-/g, ' ') === n) || null
}
// Compatibilidad con importaciones existentes: no se usa para bloquear otras unidades.
export const esRioBlancoAF9 = valor => obtenerUnidadAF9(valor)?.clave === 'RIO-BLANCO'
export function cargosAF9(unidad) {
  const u = typeof unidad === 'string' ? obtenerUnidadAF9(unidad) : unidad
  return [
    'ENCARGADO DE PRADERAS',
    'ENCARGADO DE INVENTARIOS',
    `JEFE U.O.S.P.G. “${u?.nombre || 'UNIDAD'}”`,
    'JEFE DEL DPTO. VII “PARTICIPACIÓN EN EL DESARROLLO”',
    'DIR. GRAL. DE BIENES Y PATRIMONIO DE LA A.B.',
  ]
}
export const AF9_CARGOS = Object.freeze(cargosAF9(UNIDADES['rio blanco']))

export function prepararDatosAF9({ animales = [], unidades = {}, especie = 'bovino', fecha, fechaDesde = '', nombres = [] }) {
  if (!fechaValida(fecha) || (fechaDesde && (!fechaValida(fechaDesde) || fechaDesde > fecha))) {
    throw new Error('Verifique las fechas del período AF-09.')
  }
  if (especie !== 'todas' && !Object.hasOwn(ESPECIES, especie)) throw new Error('Seleccione una especie válida.')
  if (!Array.isArray(nombres) || nombres.length !== 5 || nombres.some(n => limpio(n).length > 80)) throw new Error('Cada nombre o grado puede tener como máximo 80 caracteres.')
  if (!Array.isArray(animales) || !animales.length) throw new Error('No hay semovientes activos en esta unidad y especie.')
  const ids = new Set(animales.map(a => String(a.unidad_id)))
  if (ids.size !== 1) throw new Error('El AF-09 debe exportarse para una única unidad operativa.')
  const id = [...ids][0]
  const unidad = obtenerUnidadAF9(unidades[id])
  if (!unidad) throw new Error('No se reconoce la unidad. Seleccione Río Blanco, Tamarinero o Mamoré.')
  const semovientes = animales.map(a => {
    const tipo = normalizarAF9(a.especie)
    if (normalizarAF9(a.estado) !== 'activo' || !Object.hasOwn(ESPECIES, tipo) || (especie !== 'todas' && especie !== tipo)) {
      throw new Error('El inventario contiene animales fuera del estado o especie seleccionados.')
    }
    if (!limpio(a.codigo)) throw new Error('Hay un semoviente sin código individual válido.')
    if (a.fecha_nacimiento && !fechaValida(a.fecha_nacimiento)) throw new Error('Hay una fecha de nacimiento inválida.')
    return {
      id: a.id, codigo: limpio(a.codigo), codigo_activo: limpio(a.codigo_activo),
      especie: tipo, categoria: limpio(a.categoria), sexo: limpio(a.sexo),
      raza: limpio(a.raza), fecha_nacimiento: a.fecha_nacimiento || null,
      marcado: a.marca_ancla === true ? 'ANCLA' : '',
      // El esquema actual no contiene valores confiables para matrícula, descripción ni costos.
      matricula: '', descripcion: '', costo_unitario: null, costo_total: null,
      fiebre_aftosa: 'NO', cadera: 'NO', uneta: 'NO',
    }
  })
  semovientes.sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true }))
  return {
    fecha, fechaDesde, especie, unidad, unidadId: id, semovientes,
    responsables: nombres.map((n, i) => ({ nombre: limpio(n), cargo: cargosAF9(unidad)[i] })),
  }
}

const POR_PAGINA = 25
function paginasAF9(datos) {
  const paginas = []
  for (const tipo of Object.keys(ESPECIES)) {
    const fichas = datos.semovientes.filter(a => a.especie === tipo)
    for (let i = 0; i < fichas.length; i += POR_PAGINA) {
      paginas.push({ tipo, fichas: fichas.slice(i, i + POR_PAGINA), offset: i, pagina: Math.floor(i / POR_PAGINA) + 1 })
    }
  }
  return paginas
}

const BORDE = { style: 'thin', color: { argb: 'FF222222' } }
const bordes = () => ({ top: BORDE, bottom: BORDE, left: BORDE, right: BORDE })
function escribirCelda(hoja, ubicacion, valor, opciones = {}) {
  const c = hoja.getCell(ubicacion)
  c.value = valor === null || valor === undefined || valor === '' ? null : typeof valor === 'number' ? valor : celdaSegura(valor)
  c.font = { name: 'Arial', size: opciones.size ?? 8, bold: !!opciones.bold, color: { argb: 'FF101010' } }
  c.alignment = { horizontal: opciones.align || 'center', vertical: 'middle', wrapText: true }
  if (opciones.border) c.border = bordes()
  return c
}
function bloque(hoja, rango, valor, opciones = {}) {
  hoja.mergeCells(rango)
  return escribirCelda(hoja, rango.split(':')[0], valor, opciones)
}
function cabeceraTabla(hoja) {
  const encabezados = [
    ['A11:A12', 'Código del\nActivo'], ['B11:B12', 'N.º\nCorrelativo'],
    ['C11:C12', 'Cantidad'], ['D11:F11', 'Fecha de\nNacimiento'],
    ['G11:G12', 'Sexo'], ['H11:H12', 'Raza'], ['I11:I12', 'Marcado'],
    ['J11:J12', 'Matrícula'], ['K11:M11', 'Ficha Veterinaria'],
    ['N11:N12', 'Descripción'], ['O11:O12', 'Costo\nUnitario\nen Bs.'],
    ['P11:P12', 'Costo\nTotal\nBs.'],
  ]
  for (const [rango, contenido] of encabezados) bloque(hoja, rango, contenido, { bold: true, border: true, size: 8 })
  for (const [col, titulo] of [['D', 'D'], ['E', 'M'], ['F', 'A'], ['K', 'Fiebre\nAftosa'], ['L', 'Cadera'], ['M', 'Uñeta']]) {
    escribirCelda(hoja, `${col}12`, titulo, { bold: true, border: true, size: 7 })
  }
  for (const fila of [11, 12]) for (let col = 1; col <= 16; col++) hoja.getRow(fila).getCell(col).border = bordes()
  hoja.getRow(11).height = 38; hoja.getRow(12).height = 26
}

function firmasAF9(hoja, fila, datos) {
  const grupos = [[1, 3], [4, 6], [7, 9], [10, 12], [13, 16]]
  datos.responsables.forEach((persona, i) => {
    const [ini, fin] = grupos[i]
    for (const d of [0, 1, 2]) hoja.mergeCells(fila + d, ini, fila + d, fin)
    escribirCelda(hoja, hoja.getCell(fila, ini).address, '____________________', { size: 8 })
    escribirCelda(hoja, hoja.getCell(fila + 1, ini).address, persona.nombre, { size: 8 })
    escribirCelda(hoja, hoja.getCell(fila + 2, ini).address, persona.cargo, { size: 7, bold: true })
  })
  hoja.getRow(fila - 1).height = 20
  hoja.getRow(fila).height = 25
  hoja.getRow(fila + 1).height = 21
  hoja.getRow(fila + 2).height = 33
}
function hojaAF9(libro, datos, pagina) {
  const hoja = libro.addWorksheet(`AF09_${pagina.tipo.toUpperCase()}_${pagina.pagina}`.slice(0, 31), { views: [{ state: 'frozen', ySplit: 12, xSplit: 1, zoomScale: 70 }] })
  const anchos = [25, 9, 9, 5, 5, 8, 7, 15, 12, 13, 10, 9, 9, 38, 14, 14]
  hoja.columns = anchos.map(width => ({ width }))
  bloque(hoja, 'A1:D1', 'DPTO. VII “PART. EN EL DES.”', { bold: true, size: 9 })
  bloque(hoja, 'A2:D2', `U.O.S.P.G. “${datos.unidad.nombre}”`, { bold: true, size: 9 })
  bloque(hoja, 'A3:D3', 'BOLIVIA', { bold: true, size: 9 })
  bloque(hoja, 'O1:P2', 'FORM. AF-9', { bold: true, size: 10 })
  bloque(hoja, 'C5:N5', 'INVENTARIO DE ACTIVOS FIJOS SEMOVIENTES', { bold: true, size: 14 })
  escribirCelda(hoja, 'A7', 'Del:', { bold: true, align: 'left' })
  bloque(hoja, 'B7:F7', fechaLarga(datos.fechaDesde), { size: 9 })
  escribirCelda(hoja, 'H7', 'Al:', { bold: true })
  bloque(hoja, 'I7:P7', fechaLarga(datos.fecha), { size: 9 })
  bloque(hoja, 'A8:B8', 'Unidad Principal:', { bold: true, align: 'left' })
  bloque(hoja, 'C8:P8', 'DEPARTAMENTO VII “PARTICIPACIÓN EN EL DESARROLLO”', { size: 9, align: 'left' })
  bloque(hoja, 'A9:B9', 'Unidad Dependiente:', { bold: true, align: 'left' })
  bloque(hoja, 'C9:F9', `U.O.S.P.G. “${datos.unidad.nombre}”`, { size: 8 })
  escribirCelda(hoja, 'G9', 'Sigla:', { bold: true })
  bloque(hoja, 'H9:I9', datos.unidad.sigla)
  bloque(hoja, 'J9:K9', 'Área de Trabajo:', { bold: true })
  escribirCelda(hoja, 'L9', datos.unidad.area)
  bloque(hoja, 'M9:N9', 'Código:', { bold: true })
  // El número administrativo de código no puede inferirse del ID de Supabase.
  bloque(hoja, 'O9:P9', '')
  hoja.getRow(5).height = 26
  hoja.getRow(7).height = 22
  hoja.getRow(8).height = 19
  hoja.getRow(9).height = 24
  cabeceraTabla(hoja)
  const filasVisibles = Math.max(20, pagina.fichas.length)
  for (let i = 0; i < filasVisibles; i++) {
    const fila = 13 + i
    const a = pagina.fichas[i]
    const valores = a ? [
      a.codigo_activo || '', pagina.offset + i + 1, 1,
      ...(a.fecha_nacimiento ? [Number(a.fecha_nacimiento.slice(8, 10)), Number(a.fecha_nacimiento.slice(5, 7)), Number(a.fecha_nacimiento.slice(0, 4))] : ['', '', '']),
      normalizarAF9(a.sexo) === 'hembra' ? 'H' : normalizarAF9(a.sexo) === 'macho' ? 'M' : '',
      a.raza, a.marcado, '', 'NO', 'NO', 'NO', '', '', '',
    ] : Array(16).fill('')
    for (let j = 0; j < 16; j++) escribirCelda(hoja, hoja.getRow(fila).getCell(j + 1).address, valores[j], { size: 8, border: true, align: j === 13 ? 'left' : 'center' })
    hoja.getRow(fila).height = 21
  }
  const pie = 13 + filasVisibles + 3
  firmasAF9(hoja, pie, datos)
  hoja.pageSetup = {
    paperSize: 8, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1,
    printArea: `A1:P${pie + 2}`, margins: { left: .2, right: .2, top: .22, bottom: .22, header: .1, footer: .1 },
  }
  hoja.headerFooter.oddFooter = `U.O.S.P.G. ${datos.unidad.nombre} · Página &P de &N`
  return hoja
}
export async function crearLibroAF9(datos) {
  const paquete = await import('exceljs')
  const ExcelJS = paquete.default || paquete
  const libro = new ExcelJS.Workbook()
  libro.creator = 'Plataforma de Gestión Ganadera'
  libro.created = new Date(`${datos.fecha}T12:00:00Z`)
  for (const pagina of paginasAF9(datos)) hojaAF9(libro, datos, pagina)
  return libro
}
export async function generarExcelAF9(datos) {
  const libro = await crearLibroAF9(datos)
  return { buffer: await libro.xlsx.writeBuffer(), hojas: libro.worksheets.length, modo: 'af09-referencia' }
}
export function crearHTMLAF9(datos) {
  const paginas = paginasAF9(datos)
  const documentos = paginas.map(pagina => {
    const filas = pagina.fichas.map((a, i) => {
      const nacimiento = a.fecha_nacimiento?.split('-') || ['', '', '']
      return `<tr>${[a.codigo_activo, pagina.offset + i + 1, 1, nacimiento[2], nacimiento[1], nacimiento[0], normalizarAF9(a.sexo) === 'hembra' ? 'H' : 'M', a.raza, a.marcado, '', 'NO', 'NO', 'NO', '', '', ''].map(v => `<td>${escapar(v)}</td>`).join('')}</tr>`
    }).join('')
    const firmas = datos.responsables.map(f => `<div><p>________________</p><p>${escapar(f.nombre)}</p><strong>${escapar(f.cargo)}</strong></div>`).join('')
    return `<section class="pagina"><header><strong>DPTO. VII “PART. EN EL DES.”<br>U.O.S.P.G. “${escapar(datos.unidad.nombre)}”<br>BOLIVIA</strong><b>FORM. AF-9</b></header><h2>INVENTARIO DE ACTIVOS FIJOS SEMOVIENTES</h2><p>Del: ${escapar(fechaLarga(datos.fechaDesde))} &emsp; Al: ${escapar(fechaLarga(datos.fecha))}</p><p>Unidad Principal: DEPARTAMENTO VII “PARTICIPACIÓN EN EL DESARROLLO”</p><p>Unidad Dependiente: U.O.S.P.G. “${escapar(datos.unidad.nombre)}” &emsp; Sigla: ${escapar(datos.unidad.sigla)}</p><table><thead><tr><th rowspan="2">Código del Activo</th><th rowspan="2">N.º Correlativo</th><th rowspan="2">Cantidad</th><th colspan="3">Fecha de Nacimiento</th><th rowspan="2">Sexo</th><th rowspan="2">Raza</th><th rowspan="2">Marcado</th><th rowspan="2">Matrícula</th><th colspan="3">Ficha Veterinaria</th><th rowspan="2">Descripción</th><th rowspan="2">Costo Unitario Bs.</th><th rowspan="2">Costo Total Bs.</th></tr><tr><th>D</th><th>M</th><th>A</th><th>Fiebre Aftosa</th><th>Cadera</th><th>Uñeta</th></tr></thead><tbody>${filas}</tbody></table><div class="firmas">${firmas}</div></section>`
  }).join('')
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>AF-09 · ${escapar(datos.unidad.nombre)}</title><style>@page{size:A3 landscape;margin:12mm}body{font:10px Arial;color:#111}header{display:flex;justify-content:space-between}header b{font-size:13px}h2{text-align:center;font-size:18px}p{margin:6px 0}table{border-collapse:collapse;width:100%;table-layout:fixed;margin-top:16px}th,td{border:1px solid #333;padding:5px 3px;text-align:center;overflow-wrap:anywhere}thead{display:table-header-group}.pagina{page-break-after:always}.pagina:last-child{page-break-after:auto}.firmas{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin-top:60px;text-align:center}.firmas p,.firmas strong{font-size:9px}#acciones{padding:12px;background:#e7eef7}@media print{#acciones{display:none}}</style></head><body><div id="acciones"><button id="imprimir" onclick="window.print()">Imprimir</button></div>${documentos}</body></html>`
}

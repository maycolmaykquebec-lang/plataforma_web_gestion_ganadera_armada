import test from 'node:test'
import assert from 'node:assert/strict'
import { prepararDatosAF9, generarExcelAF9, crearHTMLAF9, cargosAF9 } from '../src/services/exportarAF9.js'
import ExcelJS from 'exceljs'
const nombres = ['Adm. II. Juan', 'Sgto. I. Pedro', 'Tte. Frag. Carlos', 'Cap. Nav. Juan', 'Cap. Nav. José']
const casos = [
  [3, 'RÍO BLANCO', 'UOSPGRB', 'UOSPGRB-86-WI-007'],
  [2, 'TAMARINERO', 'UOSPGT', 'UOSPGT-86-WI-002'],
  [1, 'MAMORE', 'UOSPGM', 'UOSPGM-86-WI-001'],
]
for (const [id, unidad, sigla, codigoActivo] of casos) {
  test(`AF09 de ${unidad}: exporta y deja campos solicitados en blanco`, async () => {
    const animales = [{ id: 20, unidad_id: id, codigo: '001', codigo_activo: codigoActivo, estado: 'Activo', especie: 'bovino', categoria: 'Vaca', sexo: 'Hembra', raza: 'Nelore', marca_ancla: true, fecha_nacimiento: '2020-05-12' }]
    const datos = prepararDatosAF9({ animales, unidades: { [id]: unidad }, especie: 'bovino', nombres, fecha: '2026-11-20' })
    assert.equal(datos.unidad.sigla, sigla)
    assert.match(datos.responsables[2].cargo, new RegExp(datos.unidad.nombre))
    const excel = await generarExcelAF9(datos)
    const libro = new ExcelJS.Workbook()
    await libro.xlsx.load(excel.buffer)
    const hoja = libro.worksheets[0]
    assert.equal(hoja.getCell('A13').value, codigoActivo)
    assert.equal(hoja.getCell('C13').value, 1)
    assert.equal(hoja.getCell('D13').value, 12)
    assert.equal(hoja.getCell('E13').value, 5)
    assert.equal(hoja.getCell('F13').value, 2020)
    assert.equal(hoja.getCell('I13').value, 'ANCLA')
    for (const col of ['K', 'L', 'M']) assert.equal(hoja.getCell(`${col}13`).value, 'NO')
    for (const col of ['N', 'O', 'P']) assert.equal(hoja.getCell(`${col}13`).value, null)
    assert.match(crearHTMLAF9(datos), /NO/)
  })
}
test('permite nombres vacíos, pero no mezcla unidades', () => {
  const base = { id: 1, unidad_id: 1, codigo: '001', codigo_activo: '', estado: 'Activo', especie: 'bovino' }
  const datos = prepararDatosAF9({ animales: [base], unidades: { 1: 'MAMORE' }, especie: 'bovino', fecha: '2026-11-20', nombres: ['', '', '', '', ''] })
  assert.equal(datos.responsables[0].nombre, '')
  assert.match(cargosAF9('TAMARINERO')[2], /TAMARINERO/)
  assert.throws(() => prepararDatosAF9({ animales: [base, { ...base, unidad_id: 3 }], unidades: { 1: 'MAMORE', 3: 'RÍO BLANCO' }, especie: 'bovino', fecha: '2026-11-20', nombres: ['', '', '', '', ''] }), /única unidad/)
})

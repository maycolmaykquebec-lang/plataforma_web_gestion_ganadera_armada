import test from 'node:test'
import assert from 'node:assert/strict'
import {prepararDatosAF9,generarExcelAF9,crearHTMLAF9} from '../src/services/exportarAF9.js'
import ExcelJS from 'exceljs'
test('genera un archivo Excel legible con datos y nombres de responsables',async()=>{
 const animales=[{codigo:'RB-001',unidad_id:3,especie:'bovino',categoria:'Vaca',sexo:'Hembra',raza:'Nelore',estado:'Activo',fecha_nacimiento:'2020-01-01'}]
 const d=prepararDatosAF9({animales,unidades:{3:'RÍO BLANCO'},especie:'bovino',fecha:'2026-11-17',nombres:['Uno','Dos','Tres','Cuatro','Cinco']})
 const r=await generarExcelAF9(d);const libro=new ExcelJS.Workbook();await libro.xlsx.load(r.buffer)
 assert.equal(libro.worksheets.length,1);assert.match(libro.worksheets[0].getCell('N14').text,/RB-001/);assert.match(crearHTMLAF9(d),/RB-001/)
 assert.throws(()=>prepararDatosAF9({animales,unidades:{3:'MAMORE'},especie:'bovino',fecha:'2026-11-17',nombres:['Uno','Dos','Tres','Cuatro','Cinco']}))
})

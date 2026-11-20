import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CRITERIOS_DESCARTE, criterioPara, fechaCorteEdad, clasificarPorEdad,
  filtroServidorPorEdad, limpiarCodigoBusqueda, edadExacta,
} from '../src/utils/criteriosDescarte.js'

const hoy = '2026-11-20'
const animal = (especie, sexo, fecha) => ({ especie, sexo, fecha_nacimiento: fecha, estado: 'Activo' })
test('umbrales acordados y exclusión avícola', () => {
  assert.equal(CRITERIOS_DESCARTE.length, 10)
  assert.equal(criterioPara('bovino', 'Macho').edad, 4)
  assert.equal(criterioPara('bovino', 'Hembra').edad, 6)
  assert.equal(criterioPara('equino', 'Hembra').edad, 10)
  assert.equal(criterioPara('mular', 'Macho').edad, 10)
  assert.equal(criterioPara('caprino', 'Macho').edad, 5)
  assert.equal(criterioPara('porcino', 'Macho').edad, 5)
  assert.equal(criterioPara('porcino', 'Hembra').edad, 4)
  assert.equal(criterioPara('avicola', 'Macho'), null)
})
test('edad exacta por cumpleaños: límite y un día antes', () => {
  assert.equal(clasificarPorEdad(animal('bovino', 'Macho', '2022-11-20'), hoy).estado, 'elegible')
  assert.equal(clasificarPorEdad(animal('bovino', 'Macho', '2022-11-21'), hoy).estado, 'no_elegible')
  assert.equal(clasificarPorEdad(animal('bovino', 'Hembra', '2020-11-20'), hoy).estado, 'elegible')
  assert.equal(clasificarPorEdad(animal('bovino', 'Hembra', '2020-11-21'), hoy).estado, 'no_elegible')
  assert.deepEqual(edadExacta('2022-11-20', hoy), { anos: 4, meses: 0 })
  assert.equal(fechaCorteEdad(hoy, 10), '2016-11-20')
})
test('sin fecha, animal dado de baja y avícola', () => {
  assert.equal(clasificarPorEdad(animal('mular', 'Macho', null), hoy).estado, 'sin_fecha')
  assert.equal(clasificarPorEdad(animal('avicola', 'Macho', '2015-02-01'), hoy).estado, 'excluido')
  assert.equal(clasificarPorEdad({ ...animal('equino','Macho','2010-01-01'), estado: 'Baja' }, hoy).estado, 'excluido')
  assert.equal(clasificarPorEdad(animal('porcino','Hembra','2027-01-01'), hoy).estado, 'sin_fecha')
})
test('expresión segura de servidor filtra exactamente sexo, especie y edad', () => {
  const f = filtroServidorPorEdad({ hoy, especie: 'porcino', sexo: 'Hembra', codigo: 'UOSPGM-86-WI-001' })
  assert.match(f, /especie\.eq\.porcino/)
  assert.match(f, /sexo\.eq\.Hembra/)
  assert.match(f, /fecha_nacimiento\.lte\.2022-11-20/)
  assert.match(f, /codigo_activo\.ilike\.\*UOSPGM-86-WI-001\*/)
  assert.doesNotMatch(f, /sexo\.eq\.Macho/)
  assert.equal(limpiarCodigoBusqueda('001),estado.eq.Baja'), '001estadoeqBaja')
})

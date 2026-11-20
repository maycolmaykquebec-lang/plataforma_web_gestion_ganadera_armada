import test from 'node:test'
import assert from 'node:assert/strict'
import { edadSemoviente, edadLegible, fechaHistorial, ESPECIES_HISTORIAL } from '../src/utils/historialGanadero.js'

test('cumpleaños exacto cuenta año completo', () => {
  assert.deepEqual(edadSemoviente('2020-11-20','2026-11-20'), {anios:6,meses:0})
})
test('antes del cumpleaños no suma año', () => {
  assert.deepEqual(edadSemoviente('2020-12-01','2026-11-20'), {anios:5,meses:11})
})
test('falta fecha no inventa edad', () => {
  assert.equal(edadLegible(null, '2026-11-20'), 'Edad no determinada')
  assert.equal(edadSemoviente('2026-02-30','2026-11-20'), null)
})
test('sin corrimiento de fecha ISO de nacimiento', () => {
  assert.equal(fechaHistorial('2026-11-20'), '20/11/2026')
})
test('incluye seis especies, con sus nombres', () => {
  assert.equal(Object.keys(ESPECIES_HISTORIAL).length, 6)
  assert.equal(ESPECIES_HISTORIAL.porcino, 'Ganado porcino')
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { PREFIJOS_ACTIVO, proponerCodigoActivo, validarCodigoActivo } from '../src/utils/codigosActivo.js'

test('prefijos de las tres unidades definidos por el usuario', () => {
  assert.deepEqual(Object.keys(PREFIJOS_ACTIVO).sort(), ['MAMORE', 'RIO-BLANCO', 'TAMARINERO'])
  assert.equal(proponerCodigoActivo('RIO-BLANCO', '007'), 'UOSPGRB-86-WI-007')
  assert.equal(proponerCodigoActivo('TAMARINERO', '002'), 'UOSPGT-86-WI-002')
  assert.equal(proponerCodigoActivo('MAMORE', '001'), 'UOSPGM-86-WI-001')
})

test('no se confunden los prefijos de unidades', () => {
  assert.equal(validarCodigoActivo('RIO-BLANCO', 'UOSPGRB-86-WI-007'), true)
  assert.equal(validarCodigoActivo('RIO-BLANCO', 'UOSPGT-86-WI-007'), false)
  assert.equal(validarCodigoActivo('MAMORE', 'UOSPGRB-86-WI-001'), false)
  assert.equal(validarCodigoActivo('MAMORE', ''), false)
})

test('identificadores invalidos no generan sugerencia', () => {
  assert.equal(proponerCodigoActivo('TAMARINERO', 'a'), '')
  assert.equal(proponerCodigoActivo('OTRA', '007'), '')
  assert.equal(validarCodigoActivo('TAMARINERO', 'UOSPGT-86-WI-xx'), false)
})

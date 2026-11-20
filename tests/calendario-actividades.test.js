import { test } from 'node:test'
import assert from 'node:assert/strict'
import { diasCalendario, sumarMeses, resumirActividades, validarActividad } from '../src/utils/calendarioGanadero.js'
import { menuPermitido } from '../src/auth/permisos.js'

test('calendario de noviembre 2026 empieza en lunes y tiene 30 días', () => {
  const d = diasCalendario('2026-11')
  assert.equal(d.filter(Boolean).length, 30)
  assert.equal(d[6], '2026-11-01')
  assert.equal(d.at(-1), '2026-11-30')
})
test('paso entre años', () => {
  assert.equal(sumarMeses('2026-12', 1), '2027-01')
  assert.equal(sumarMeses('2027-01', -1), '2026-12')
})
test('no confundir realizadas con vencidas', () => {
  assert.deepEqual(resumirActividades([
    { fecha: '2026-11-19', estado: 'programada' },
    { fecha: '2026-11-21', estado: 'programada' },
    { fecha: '2026-11-18', estado: 'realizada' },
    { fecha: '2026-11-17', estado: 'cancelada' }
  ], '2026-11-20'), { programadas: 2, proximas: 1, realizadas: 1, vencidas: 1 })
})
test('validación de título y fecha', () => {
  const a = { titulo:'Vacunar lote 1', fecha:'2026-11-24', tipo:'vacunacion', unidad_id:1, estado:'programada', prioridad:'alta', hora:'08:00' }
  assert.equal(validarActividad(a), '')
  assert.match(validarActividad({...a, titulo:'abc'}), /título/)
  assert.match(validarActividad({...a, hora:'25:00'}), /hora/)
})
test('los tres roles ven calendario y ninguno ve respaldos', () => {
  for (const codigo of ['SUP_DEPTO_VII','JEFE_DIV_B','RESP_UNIDAD']) {
    const perfil = { activo:true, rol:{codigo}, unidad:{id:1,codigo:'MAMORE'} }
    assert.ok(menuPermitido(perfil).includes('calendario'))
    assert.ok(!menuPermitido(perfil).includes('respaldos'))
  }
})

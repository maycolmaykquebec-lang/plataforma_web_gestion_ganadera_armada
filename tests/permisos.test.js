import test from 'node:test'
import assert from 'node:assert/strict'
import { perfilValido, puedeRegistrar, consultaGeneral, menuPermitido } from '../src/auth/permisos.js'
const perfil = (rol, codigo = 'RIO-BLANCO') => ({ activo: true, rol: { codigo: rol }, unidad: { id: 1, codigo } })
test('cada responsable usa el mismo rol en una unidad admitida', () => {
  for (const unidad of ['RIO-BLANCO', 'TAMARINERO', 'MAMORE']) {
    const p = perfil('RESP_UNIDAD', unidad)
    assert.equal(puedeRegistrar(p), true)
    assert.equal(consultaGeneral(p), false)
    assert.ok(menuPermitido(p).includes('movimientos'))
  }
})
test('supervisión general no permite registrar semovientes ni controles', () => {
  for (const rol of ['SUP_DEPTO_VII', 'JEFE_DIV_B']) {
    assert.equal(consultaGeneral(perfil(rol)), true)
    assert.equal(puedeRegistrar(perfil(rol)), false)
  }
})
test('el menú del supervisor incluye usuarios y no incluye auditoría', () => {
  const menu = menuPermitido(perfil('SUP_DEPTO_VII'))
  assert.ok(menu.includes('usuarios'))
  assert.ok(!menu.includes('auditoria'))
  assert.ok(menuPermitido(perfil('JEFE_DIV_B')).includes('auditoria'))
})
test('rechazar perfiles inactivos, roles heredados y responsables sin unidad válida', () => {
  for (const p of [null, { ...perfil('RESP_UNIDAD'), activo: false }, perfil('OPERADOR'), perfil('ADMIN_DIV_B'), perfil('RESP_UNIDAD', 'OTRA'), { ...perfil('RESP_UNIDAD'), unidad: null }]) {
    assert.equal(perfilValido(p), false)
    assert.equal(puedeRegistrar(p), false)
    assert.deepEqual(menuPermitido(p), [])
  }
})

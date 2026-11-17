// Prueba local de módulos adicionales contra el esquema heredado adaptado.
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
process.on('uncaughtException', error => {
  console.error(error.message, { code: error.code, query: error.query?.slice(0, 450) })
  process.exit(1)
})
const root = new URL('../', import.meta.url)
const db = new PGlite()
const rows = async (sql, params = []) => (await db.query(sql, params)).rows
const uuid = i => `00000000-0000-4000-8000-${String(500 + i).padStart(12, '0')}`
await db.exec(await readFile(new URL('tests/fixtures/esquema-existente.sql', root), 'utf8'))
for (const [i, rol] of ['SUP_DEPTO_VII', 'OPERADOR', 'SANITARIO', 'REPRODUCTIVO'].entries()) {
  await db.query('insert into auth.users(id) values($1)', [uuid(i)])
  await db.query(`insert into public.perfiles(id,nombre_completo,rol_id,unidad_id,activo)
    select $1,$2,id,$3,true from public.roles_sistema where codigo=$4`,
    [uuid(i), `Persona ficticia ${i}`, i ? 3 : null, rol])
}
await db.exec(await readFile(new URL('supabase/adaptacion/INSTALAR_BASE_EXISTENTE.sql', root), 'utf8'))
const cuentasAntes = await rows('select * from public.perfiles order by id')
const catalogoAntes = await rows('select * from public.roles_sistema order by id')
const actualizacion = await readFile(new URL('supabase/actualizaciones/01_modulos_pendientes.sql', root), 'utf8')
await db.exec(actualizacion)
assert.deepEqual(await rows('select * from public.perfiles order by id'), cuentasAntes)
assert.deepEqual(await rows('select * from public.roles_sistema order by id'), catalogoAntes)

async function como(i, sql, params = []) {
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uuid(i)])
  await db.exec('set role authenticated')
  return rows(sql, params)
}
async function admin(sql, params = []) {
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claim.sub','',false)")
  return rows(sql, params)
}
async function no(i, sql, params = []) { await assert.rejects(() => como(i, sql, params)) }
const guardar = 'select public.rb_guardar_perfil($1,$2,$3,$4,$5,$6)'
// El Supervisor administra perfiles de cuentas Auth ya existentes, nunca las crea.
for (const i of [4, 5, 6, 7, 8, 9]) await admin('insert into auth.users(id) values($1)', [uuid(i)])
await como(0, guardar, [uuid(4), 'Jefe ficticio', 'Jefatura', 'JEFE_DIV_B', null, true])
await como(0, guardar, [uuid(5), 'Responsable Mamore', 'Responsable', 'RESP_UNIDAD', 1, true])
await como(0, guardar, [uuid(6), 'Responsable inactivo', null, 'RESP_UNIDAD', 3, false])
await admin(`insert into public.perfiles(id,nombre_completo,rol_id,departamento_id,division_id,activo)
  select $1,'Perfil de otro departamento',id,2,2,true from public.roles_sistema where codigo='JEFE_DIV_B'`, [uuid(7)])
assert.equal((await como(0, 'select * from public.rb_listar_usuarios()')).length, 7)
for (const i of [1, 4, 5, 6, 7]) await no(i, 'select * from public.rb_listar_usuarios()')
await no(0, guardar, [uuid(7), 'No invadir otro departamento', null, 'JEFE_DIV_B', null, true])
await no(1, guardar, [uuid(8), 'Responsable indebido', null, 'RESP_UNIDAD', 3, true])
await no(4, guardar, [uuid(8), 'Responsable indebido', null, 'RESP_UNIDAD', 3, true])
await no(0, guardar, [uuid(20), 'Auth inexistente', null, 'RESP_UNIDAD', 3, true])
await no(0, guardar, [uuid(8), 'Rol heredado prohibido', null, 'ADMIN_DIV_B', null, true])
await no(0, guardar, [uuid(8), 'Unidad inexistente', null, 'RESP_UNIDAD', 999, true])
await no(0, guardar, [uuid(0), 'Supervisor ficticio', null, 'SUP_DEPTO_VII', null, false])
await no(0, guardar, [uuid(0), 'Supervisor ficticio', null, 'RESP_UNIDAD', 3, true])
await como(0, guardar, [uuid(0), 'Supervisor con nombre actualizado', 'Cargo actualizado', 'SUP_DEPTO_VII', null, true])
// Actualizar/desactivar y reactivar a otra cuenta sí está permitido y queda auditado.
await como(0, guardar, [uuid(2), 'Responsable de prueba editado', 'Cargo de prueba', 'RESP_UNIDAD', 3, false])
assert.equal((await admin('select activo from public.perfiles where id=$1', [uuid(2)]))[0].activo, false)
await no(2, 'select public.rb_listar_usuarios()')
await como(0, guardar, [uuid(2), 'Responsable de prueba editado', 'Cargo de prueba', 'RESP_UNIDAD', 3, true])
await no(1, 'update public.perfiles set activo=false where id=$1', [uuid(0)])

async function animal(i, codigo) {
  await como(i, `insert into public.semovientes(codigo,especie,categoria,sexo,fecha_ingreso)
    values($1,'bovino','Vaca','Hembra',current_date)`, [codigo])
  return (await como(i, 'select id from public.semovientes where codigo=$1', [codigo]))[0].id
}
const a = await animal(1, 'RB-BAJA-PRUEBA')
const b = await animal(1, 'RB-EVALUACION-PRUEBA')
const c = await animal(1, 'RB-TRASLADO-PRUEBA')
const baja = 'select public.rb_registrar_baja($1,$2,current_date,$3) as id'
const evaluar = 'select public.rb_evaluar_descarte($1,current_date,$2,$3) as id'
const motivo = 'Motivo confidencial ficticio que nunca debe aparecer en auditoría'
for (const i of [0, 4, 5, 6, 7]) {
  await no(i, baja, [a, 'defuncion', motivo])
  await no(i, evaluar, [b, motivo, 'candidato'])
}
await no(1, baja, [a, 'invalido', motivo])
await no(1, baja, [a, 'defuncion', 'corto'])
await no(1, 'select public.rb_registrar_baja($1,$2,current_date+1,$3)', [a, 'defuncion', motivo])
await no(1, 'select public.rb_evaluar_descarte($1,current_date+1,$2,$3)', [b, motivo, 'candidato'])
await no(1, evaluar, [b, motivo, 'dictamen_inexistente'])
const ev = (await como(1, evaluar, [b, motivo, 'candidato']))[0].id
assert.ok(ev)
assert.equal((await como(1, 'select estado from public.semovientes where id=$1', [b]))[0].estado, 'Activo')
assert.equal((await como(1, "select id from public.semoviente_eventos where semoviente_id=$1 and tipo_evento='descarte'", [b])).length, 1)
const bajaDetallada = 'select public.rb_registrar_baja($1,$2,current_date,$3,$4::jsonb) as id'
for (const detalles of [null, [], { firma: 'No se admite firmante en datos persistidos' }, { fotografia: 'No persistir fotos' }, { hora: '24:99' }, { lugar: 'a'.repeat(301) }, { descripcion: 'á'.repeat(5000) }]) {
  await no(1, bajaDetallada, [a, 'defuncion', motivo, JSON.stringify(detalles)])
}
await no(1, `select public.rb_registrar_baja($1,'defuncion',
 ((current_timestamp at time zone 'America/La_Paz')+interval '1 minute')::date,$2,
 jsonb_build_object('hora',to_char((current_timestamp at time zone 'America/La_Paz')+interval '1 minute','HH24:MI')))`, [a, motivo])
const detallesActa = { hora: '00:00', lugar: 'Lugar ficticio reservado', referencia_informe: 'REF-FICTICIA', marcado: 'Marcado ficticio', descripcion: 'Descripción ficticia de acta' }
const idBaja = (await como(1, bajaDetallada, [a, 'defuncion', motivo, JSON.stringify(detallesActa)]))[0].id
assert.ok(idBaja)
assert.equal((await como(1, 'select estado from public.semovientes where id=$1', [a]))[0].estado, 'Baja')
const acta = (await como(1, 'select * from public.rb_bajas where id=$1', [idBaja]))[0]
assert.equal(acta.tipo, 'defuncion')
assert.equal(acta.unidad_id, 3)
assert.equal(acta.registrado_por, uuid(1))
assert.deepEqual(acta.detalles, detallesActa)
await no(1, baja, [a, 'defuncion', motivo])
await no(1, evaluar, [a, motivo, 'seguimiento'])
assert.equal((await como(1, "select id from public.semoviente_eventos where semoviente_id=$1 and tipo_evento='baja'", [a])).length, 1)
const movimiento = (await como(1, 'select public.solicitar_movimiento($1,1,$2,current_date) as id', [c, 'Traslado para probar bloqueo de baja']))[0].id
await no(1, baja, [c, 'venta', motivo])
await como(0, 'select public.autorizar_movimiento($1)', [movimiento])
await no(1, baja, [c, 'venta', motivo])
assert.equal((await como(1, 'select estado from public.semovientes where id=$1', [c]))[0].estado, 'Activo')
assert.equal((await como(1, 'select id from public.rb_bajas where semoviente_id=$1', [c])).length, 0)
await como(5, 'select public.confirmar_recepcion($1)', [movimiento])

const sanitario = `insert into public.controles_sanitarios(semoviente_id,tipo_control,fecha_control,responsable_sanitario,motivo)
 values($1,'Revisión',current_date,'Veterinario ficticio',$2)`
await como(1, sanitario, [b, motivo])
const reproductivo = `insert into public.controles_reproductivos(semoviente_id,tipo_evento,fecha_evento,responsable_reproductivo,resultado,detalle)
 values($1,'seguimiento',current_date,'Profesional ficticio','Sin novedad',$2)`
await como(1, reproductivo, [b, motivo])
const audit = await como(0, 'select * from public.rb_auditoria')
for (const tabla of ['perfiles', 'semovientes', 'rb_bajas', 'rb_evaluaciones_descarte', 'solicitudes_movimientos', 'controles_sanitarios', 'controles_reproductivos']) {
  assert.ok(audit.some(f => f.tabla === tabla), `Auditoría faltante: ${tabla}`)
}
assert.ok(audit.some(f => f.actor_id === uuid(1) && f.tabla === 'rb_bajas'))
assert.equal(JSON.stringify(audit).includes(motivo), false)
assert.equal(JSON.stringify(audit).includes('Supervisor con nombre actualizado'), false)
assert.equal(JSON.stringify(audit).includes('Veterinario ficticio'), false)
assert.equal(JSON.stringify(audit).includes(detallesActa.lugar), false)
assert.equal(JSON.stringify(audit).includes(detallesActa.descripcion), false)
assert.ok((await como(4, 'select id from public.rb_auditoria')).length > 0)
assert.ok((await como(1, 'select * from public.rb_auditoria')).every(f => f.unidad_id === 3))
assert.ok((await como(5, 'select * from public.rb_auditoria')).every(f => f.unidad_id === 1))
assert.equal((await como(6, 'select * from public.rb_auditoria')).length, 0)
assert.equal((await como(7, 'select * from public.rb_auditoria')).length, 0)
assert.equal((await como(5, 'select * from public.rb_bajas')).length, 0)
assert.equal((await como(5, 'select * from public.rb_evaluaciones_descarte')).length, 0)
for (const tabla of ['rb_bajas', 'rb_evaluaciones_descarte', 'rb_auditoria']) {
  await no(1, `delete from public.${tabla}`)
  await no(0, `update public.${tabla} set id=id`)
}
await no(1, "insert into public.rb_auditoria(tabla,registro_id,accion) values('falsa','1','INSERT')")
await no(1, "insert into public.rb_bajas(semoviente_id,unidad_id,tipo,fecha,motivo,registrado_por) values($1,3,'otro',current_date,$2,$3)", [b, motivo, uuid(1)])
await db.exec('reset role; set role anon')
for (const tabla of ['rb_bajas', 'rb_evaluaciones_descarte', 'rb_auditoria']) await assert.rejects(() => db.query(`select * from public.${tabla}`))
await assert.rejects(() => db.query('select public.rb_listar_usuarios()'))
await assert.rejects(() => db.query("select public.rb_registrar_baja(1,'otro',current_date,'No autorizado')"))
await db.exec('reset role')
await assert.rejects(() => db.exec(actualizacion), /actualización ya existe/)
await db.exec('rollback')
assert.equal((await rows('select count(*)::int as n from public.rb_bajas'))[0].n, 1)
const conDetallesPorDefecto = await animal(1, 'RB-BAJA-SIN-DETALLE')
const bajaPorDefecto = (await como(1, baja, [conDetallesPorDefecto, 'otro', motivo]))[0].id
assert.deepEqual((await como(1, 'select detalles from public.rb_bajas where id=$1', [bajaPorDefecto]))[0].detalles, {})
console.log('OK: bajas con acta y bloqueo por traslado, descarte sin baja automática, usuarios con alcance y protección propia, auditoría mínima append-only y RLS de nuevos módulos.')
await db.close()

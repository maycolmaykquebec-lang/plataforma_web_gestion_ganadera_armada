// Verificación local contra un esquema heredado de prueba, nunca contra Supabase.
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'

process.on('uncaughtException', error => {
  console.error(error.message, { code: error.code, query: error.query?.slice(0, 500) })
  process.exit(1)
})
const root = new URL('../', import.meta.url)
const db = new PGlite()
await db.exec(await readFile(new URL('tests/fixtures/esquema-existente.sql', root), 'utf8'))
const cuentas = [
  { rol: 'SUP_DEPTO_VII', departamento: 1, division: null, unidad: null },
  { rol: 'JEFE_DIV_B', departamento: 1, division: 1, unidad: null },
  { rol: 'RESP_UNIDAD', departamento: 1, division: 1, unidad: 3 },
  { rol: 'RESP_UNIDAD', departamento: 1, division: 1, unidad: 1 },
  { rol: 'RESP_UNIDAD', departamento: 1, division: 1, unidad: 2 },
  { rol: 'RESP_UNIDAD', departamento: 1, division: 1, unidad: 3, activo: false },
  { rol: 'OPERADOR', departamento: 1, division: 1, unidad: 3 },
  { rol: 'SUP_DEPTO_VII', departamento: 2, division: null, unidad: null },
  { rol: 'JEFE_DIV_B', departamento: 2, division: 2, unidad: null },
  { rol: 'RESP_UNIDAD', departamento: 2, division: 2, unidad: 3 },
]
const uuid = i => `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`
for (const [i, c] of cuentas.entries()) {
  await db.query('insert into auth.users(id) values($1)', [uuid(i)])
  await db.query(`insert into public.perfiles(id,nombre_completo,activo,rol_id,departamento_id,division_id,unidad_id)
    select $1,$2,$3,id,$4,$5,$6 from public.roles_sistema where codigo=$7`,
    [uuid(i), `Persona ficticia ${i}`, c.activo !== false, c.departamento, c.division, c.unidad, c.rol])
}
const rpcHeredadas = [
  ['public.sigha_20316_solicitar_traslado(bigint,bigint,date,text,text,text)', "select public.sigha_20316_solicitar_traslado(1,2,current_date,'motivo ficticio','ref ficticia','observación ficticia')"],
  ['public.sigha_20320_decidir_traslado(bigint,text,text,text)', "select public.sigha_20320_decidir_traslado(1,'aprobado','fundamento ficticio','ref ficticia')"],
  ['public.sigha_20321_listar_pendientes()', 'select public.sigha_20321_listar_pendientes()'],
  ['public.sigha_20421_ejecutar_traslado(bigint)', 'select public.sigha_20421_ejecutar_traslado(1)'],
  ['public.sigha_20423_listar_aprobados()', 'select public.sigha_20423_listar_aprobados()'],
]
for (const [firma] of rpcHeredadas) {
  const privilegio = (await db.query("select has_function_privilege('authenticated',$1,'EXECUTE') as permitido", [firma])).rows[0].permitido
  assert.equal(privilegio, !firma.includes('20421'))
}
const triggersAntes = (await db.query("select tgname,tgfoid,tgenabled from pg_trigger where tgrelid='public.semovientes'::regclass and not tgisinternal order by tgname")).rows
assert.equal(triggersAntes.length, 2)
const catalogoAntes = (await db.query('select id,codigo from public.roles_sistema order by id')).rows
const perfilesAntes = (await db.query('select id,rol_id,unidad_id,division_id,departamento_id,activo from public.perfiles order by id')).rows
for (const archivo of ['00_retirar_rpc_anteriores.sql', '01_roles_y_permisos.sql', '02_movimientos.sql']) {
  await db.exec(await readFile(new URL(`supabase/adaptacion/${archivo}`, root), 'utf8'))
  console.log(`Adaptación OK: ${archivo}`)
}
assert.deepEqual((await db.query('select id,codigo from public.roles_sistema order by id')).rows, catalogoAntes)
assert.deepEqual((await db.query('select id,rol_id,unidad_id,division_id,departamento_id,activo from public.perfiles order by id')).rows, perfilesAntes)

async function como(i, sql, params = []) {
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uuid(i)])
  await db.exec('set role authenticated')
  return db.query(sql, params)
}
async function denegado(i, sql, params = []) {
  await assert.rejects(() => como(i, sql, params))
}
async function admin(sql, params = []) {
  await db.exec('reset role')
  return db.query(sql, params)
}
async function registrar(i, codigo) {
  await como(i, `insert into public.semovientes(codigo,especie,categoria,sexo,fecha_ingreso)
    values($1,'bovino','Vaca','Hembra',current_date)`, [codigo])
  return (await como(i, 'select id,unidad_id,created_by from public.semovientes where codigo=$1', [codigo])).rows[0]
}
assert.deepEqual((await admin("select tgname,tgfoid,tgenabled from pg_trigger where tgrelid='public.semovientes'::regclass and not tgisinternal order by tgname")).rows, triggersAntes)
for (const [firma, consulta] of rpcHeredadas) {
  const meta = (await admin("select to_regprocedure($1) is not null as existe, has_function_privilege('authenticated',$1,'EXECUTE') as autenticado, has_function_privilege('anon',$1,'EXECUTE') as anonimo", [firma])).rows[0]
  assert.deepEqual(meta, { existe: true, autenticado: false, anonimo: false })
  await admin(consulta)
  await denegado(0, consulta)
  await denegado(2, consulta)
  await db.exec('reset role; set role anon')
  await assert.rejects(() => db.query(consulta))
}
await denegado(2, `insert into public.semovientes(codigo,especie,categoria,sexo,fecha_ingreso)
 values('FECHA-FUTURA','bovino','Vaca','Hembra',current_date+1)`)
const rio = await registrar(2, 'RIO-PRUEBA-1')
await admin("update public.semovientes set updated_at='2000-01-01' where id=$1", [rio.id])
assert.ok(new Date((await como(2, 'select updated_at from public.semovientes where id=$1', [rio.id])).rows[0].updated_at).getFullYear() > 2000)
const mamore = await registrar(3, 'MAM-PRUEBA-1')
const tamarinero = await registrar(4, 'TAM-PRUEBA-1')
assert.equal(rio.unidad_id, 3)
assert.equal(rio.created_by, uuid(2))
for (const [i, unidad] of [[2, 3], [3, 1], [4, 2]]) {
  const filas = (await como(i, 'select unidad_id from public.semovientes')).rows
  assert.equal(filas.length, 1)
  assert.ok(filas.every(f => f.unidad_id === unidad))
}
for (const i of [0, 1]) assert.equal((await como(i, 'select id from public.semovientes')).rows.length, 3)
for (const i of [5, 6, 7, 8, 9]) assert.equal((await como(i, 'select id from public.semovientes')).rows.length, 0)
for (const i of [0, 1, 5, 6]) {
  await denegado(i, `insert into public.semovientes(codigo,especie,categoria,sexo,fecha_ingreso)
    values('DENEGADO','bovino','Vaca','Hembra',current_date)`)
}
await denegado(2, 'update public.perfiles set rol_id=1 where id=$1', [uuid(2)])
await denegado(2, `insert into public.semovientes(codigo,unidad_id,especie,categoria,sexo,fecha_ingreso)
  values('UNIDAD-AJENA',1,'bovino','Vaca','Hembra',current_date)`)
await denegado(2, `insert into public.semovientes(codigo,created_by,especie,categoria,sexo,fecha_ingreso)
  values('AUTOR-AJENO',$1,'bovino','Vaca','Hembra',current_date)`, [uuid(3)])
const sanitario = `insert into public.controles_sanitarios(semoviente_id,tipo_control,fecha_control,responsable_sanitario,motivo)
  values($1,'Revisión',current_date,'Veterinario ficticio','Seguimiento de prueba')`
await como(2, sanitario, [rio.id])
for (const i of [0, 1, 3, 5, 6]) await denegado(i, sanitario, [rio.id])
const reproductivo = `insert into public.controles_reproductivos(semoviente_id,tipo_evento,fecha_evento,responsable_reproductivo,resultado,detalle)
  values($1,'seguimiento',current_date,'Responsable ficticio','Sin novedad','Acontecimiento de prueba')`
await como(2, reproductivo, [rio.id])
for (const i of [0, 3, 5, 6]) await denegado(i, reproductivo, [rio.id])
await admin(`insert into public.semoviente_eventos(semoviente_id,tipo_evento,fecha_evento,titulo,detalle,origen_modulo,registrado_por)
  values($1,'observacion',now(),'Observación previa','Historia ficticia que debe conservarse','historial',$2)`, [rio.id, uuid(2)])

const pedir = 'select public.solicitar_movimiento($1,$2,$3,current_date) as id'
for (const i of [0, 1, 3, 5, 6, 7, 8]) await denegado(i, pedir, [rio.id, 1, 'Solicitud no autorizada'])
await denegado(2, pedir, [rio.id, 3, 'Destino igual a origen'])
const movimiento = (await como(2, pedir, [rio.id, 1, 'Traslado institucional de prueba'])).rows[0].id
assert.ok(movimiento)
let registro = (await como(2, 'select * from public.solicitudes_movimientos where id=$1', [movimiento])).rows[0]
assert.equal(registro.estado, 'pendiente')
assert.equal(registro.solicitado_por, uuid(2))
assert.equal(registro.unidad_origen_id, 3)
assert.equal(registro.unidad_destino_id, 1)
assert.ok(registro.fecha_prevista)
assert.equal((await como(3, 'select id from public.solicitudes_movimientos where id=$1', [movimiento])).rows.length, 1)
assert.equal((await como(4, 'select id from public.solicitudes_movimientos where id=$1', [movimiento])).rows.length, 0)
await denegado(2, pedir, [rio.id, 2, 'Solicitud abierta duplicada'])
await denegado(3, 'select public.confirmar_recepcion($1)', [movimiento])
for (const i of [1, 2, 3, 6, 7, 8]) await denegado(i, 'select public.autorizar_movimiento($1)', [movimiento])
// El mismo usuario no puede autorizar su solicitud ni siquiera tras cambiar de rol.
await admin(`update public.perfiles set rol_id=(select id from public.roles_sistema where codigo='SUP_DEPTO_VII') where id=$1`, [uuid(2)])
await denegado(2, 'select public.autorizar_movimiento($1)', [movimiento])
await admin(`update public.perfiles set rol_id=(select id from public.roles_sistema where codigo='RESP_UNIDAD') where id=$1`, [uuid(2)])
await como(0, 'select public.autorizar_movimiento($1)', [movimiento])
assert.equal((await como(2, 'select unidad_id from public.semovientes where id=$1', [rio.id])).rows[0].unidad_id, 3)
for (const i of [0, 1, 2, 4, 5, 6]) await denegado(i, 'select public.confirmar_recepcion($1)', [movimiento])

// Dos animales distintos pueden compartir código cuando están en unidades diferentes.
const colision = await registrar(3, 'RIO-PRUEBA-1')
assert.notEqual(colision.id, rio.id)
await denegado(3, 'select public.confirmar_recepcion($1)', [movimiento])
registro = (await como(0, 'select estado,ejecutado_por,fecha_ejecucion from public.solicitudes_movimientos where id=$1', [movimiento])).rows[0]
assert.equal(registro.estado, 'aprobado')
assert.equal(registro.ejecutado_por, null)
assert.equal(registro.fecha_ejecucion, null)
assert.equal((await como(2, 'select unidad_id from public.semovientes where id=$1', [rio.id])).rows[0].unidad_id, 3)
await admin("update public.semovientes set codigo='CODIGO-DESTINO-DISTINTO' where id=$1", [colision.id])
await como(3, 'select public.confirmar_recepcion($1)', [movimiento])
registro = (await como(3, 'select * from public.solicitudes_movimientos where id=$1', [movimiento])).rows[0]
assert.equal(registro.estado, 'ejecutado')
assert.equal(registro.ejecutado_por, uuid(3))
assert.ok(registro.fecha_ejecucion)
assert.equal((await como(2, 'select id from public.semovientes where id=$1', [rio.id])).rows.length, 0)
assert.equal((await como(3, 'select unidad_id from public.semovientes where id=$1', [rio.id])).rows[0].unidad_id, 1)
const historia = (await como(3, 'select tipo_evento,titulo from public.semoviente_eventos where semoviente_id=$1', [rio.id])).rows
assert.ok(historia.some(e => e.titulo === 'Observación previa'))
assert.equal(historia.filter(e => e.tipo_evento === 'movimiento').length, 1)
await denegado(3, 'select public.confirmar_recepcion($1)', [movimiento])
assert.equal((await como(2, 'select id from public.solicitudes_movimientos where id=$1', [movimiento])).rows.length, 1)
await denegado(0, "update public.solicitudes_movimientos set estado='ejecutado' where id=$1", [movimiento])
await denegado(2, 'delete from public.semovientes where id=$1', [mamore.id])
await denegado(4, 'update public.semovientes set unidad_id=1 where id=$1', [tamarinero.id])
await db.exec('reset role; set role anon')
await assert.rejects(() => db.query('select * from public.semovientes'))
await assert.rejects(() => db.query('select * from public.solicitudes_movimientos'))
await assert.rejects(() => db.query('select public.autorizar_movimiento($1)', [movimiento]))
console.log('OK: RPC heredadas retiradas sin borrar y triggers conservados; adaptación conserva cuentas/catálogos, scope departamento/división/unidad, roles heredados bloqueados, controles y traslado transaccional con colisión de código e historial.')
await db.close()

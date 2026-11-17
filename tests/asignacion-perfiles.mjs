// Pruebas locales del plan autorizado para las tres cuentas heredadas de Río Blanco.
// Nunca conecta a la base remota; usa un PostgreSQL PGlite nuevo por escenario.
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'

process.on('uncaughtException', error => {
  console.error(error.message, { code: error.code, query: error.query?.slice(0, 400) })
  process.exit(1)
})
const root = new URL('../', import.meta.url)
const instalacion = await readFile(new URL('supabase/adaptacion/INSTALAR_BASE_EXISTENTE.sql', root), 'utf8')
const uuid = indice => `00000000-0000-4000-8000-${String(100 + indice).padStart(12, '0')}`
const filas = async (db, sql, params = []) => (await db.query(sql, params)).rows

async function preparar(escenario) {
  const db = new PGlite()
  await db.exec(await readFile(new URL('tests/fixtures/esquema-existente.sql', root), 'utf8'))
  const roles = ['SUP_DEPTO_VII', 'OPERADOR', 'SANITARIO', 'REPRODUCTIVO']
  for (const [i, rol] of roles.entries()) {
    await db.query('insert into auth.users(id) values($1)', [uuid(i)])
    await db.query(`insert into public.perfiles(id,nombre_completo,rol_id,departamento_id,division_id,unidad_id,activo)
      select $1,$2,id,$3,null,$4,$5 from public.roles_sistema where codigo=$6`, [
      uuid(i), `Cuenta ficticia ${i}`, i === 0 && escenario === 'supervisor_ajeno' ? 2 : null,
      i === 0 ? null : 3, !(escenario === 'cantidad_distinta' && i === 3), rol,
    ])
  }
  return db
}
async function instantanea(db) {
  return {
    auth: await filas(db, 'select id from auth.users order by id'),
    perfiles: await filas(db, `select id,rol_id,unidad_id,division_id,departamento_id,activo
      from public.perfiles order by id`),
    roles: await filas(db, 'select id,codigo,nombre from public.roles_sistema order by id'),
    rpc: await filas(db, `select p.oid,p.proname,p.proacl::text as acl
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname like 'sigha_%' order by p.proname`),
    politicas: await filas(db, `select schemaname,tablename,policyname,qual,with_check
      from pg_policies where schemaname='public' order by tablename,policyname`),
    defaultUnidad: await filas(db, `select column_default from information_schema.columns
      where table_schema='public' and table_name='semovientes' and column_name='unidad_id'`),
  }
}

async function correcto() {
  const db = await preparar('correcto')
  try {
    const antes = await instantanea(db)
    assert.equal(antes.auth.length, 4)
    assert.equal(antes.roles.length, 9)
    assert.equal(antes.rpc.length, 5)
    assert.equal(antes.perfiles.filter(p => p.unidad_id === 3 && p.activo).length, 3)
    await db.exec(instalacion)
    const despues = await instantanea(db)
    assert.deepEqual(despues.auth, antes.auth)
    assert.deepEqual(despues.roles, antes.roles)
    assert.equal(despues.perfiles.length, 4)
    for (const p of despues.perfiles) {
      const previo = antes.perfiles.find(a => a.id === p.id)
      assert.equal(p.id, previo.id)
      assert.equal(p.activo, previo.activo)
      assert.equal(p.unidad_id, previo.unidad_id)
    }
    const conRoles = await filas(db, `select p.id,r.codigo,p.departamento_id,p.division_id,p.unidad_id
      from public.perfiles p join public.roles_sistema r on r.id=p.rol_id order by p.id`)
    const supervisor = conRoles.find(p => p.id === uuid(0))
    assert.equal(supervisor.codigo, 'SUP_DEPTO_VII')
    assert.equal(supervisor.departamento_id, 1)
    assert.equal(supervisor.division_id, null)
    assert.equal(supervisor.unidad_id, null)
    for (let i = 1; i < 4; i++) {
      const p = conRoles.find(p => p.id === uuid(i))
      assert.equal(p.codigo, 'RESP_UNIDAD')
      assert.equal(p.unidad_id, 3)
      assert.equal(p.division_id, 1)
      assert.equal(p.departamento_id, 1)
    }
    const respaldos = await filas(db, `select perfil_id as id,rol_id,unidad_id,division_id,departamento_id,activo
      from private.rb_respaldo_perfiles_adaptacion order by perfil_id`)
    assert.deepEqual(respaldos, antes.perfiles)
    assert.equal(respaldos.length, 4)
    const nuevaTabla = (await filas(db, `select tableowner from pg_tables
      where schemaname='private' and tablename='rb_respaldo_perfiles_adaptacion'`))[0]
    assert.ok(nuevaTabla?.tableowner)
    const proteccionRespaldo = (await filas(db, `select c.relrowsecurity as rls
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='private' and c.relname='rb_respaldo_perfiles_adaptacion'`))[0]
    assert.equal(proteccionRespaldo?.rls, true)
    // El propietario mantiene acceso a las cuatro filas bajo RLS.
    assert.equal((await filas(db, 'select count(*)::int as total from private.rb_respaldo_perfiles_adaptacion'))[0].total, 4)
    for (const rol of ['authenticated', 'anon']) {
      for (const operacion of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
        assert.equal((await filas(db, `select has_table_privilege($1,'private.rb_respaldo_perfiles_adaptacion',$2) as permitido`, [rol, operacion]))[0].permitido, false)
      }
      await db.exec(`set role ${rol}`)
      await assert.rejects(() => db.query('select * from private.rb_respaldo_perfiles_adaptacion'))
      await db.exec('reset role')
    }
    // La asignación habilita únicamente las cuentas autorizadas y sus ámbitos.
    for (let i = 0; i < 4; i++) {
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uuid(i)])
      await db.exec('set role authenticated')
      const rol = (await filas(db, 'select private.rb_rol_actual() as codigo'))[0].codigo
      assert.equal(rol, i === 0 ? 'SUP_DEPTO_VII' : 'RESP_UNIDAD')
      await db.exec('reset role')
    }
    console.log('OK: 4 cuentas preservadas; 3 roles migrados con ámbito Río Blanco; Supervisor completado; catálogo de 9 roles intacto y respaldo de 4 perfiles privado.')
  } finally { await db.close() }
}

async function debeRevertir(escenario, esperado) {
  const db = await preparar(escenario)
  try {
    const antes = await instantanea(db)
    await assert.rejects(() => db.exec(instalacion), error => {
      assert.match(error.message, esperado)
      return true
    })
    await db.exec('rollback')
    const despues = await instantanea(db)
    assert.deepEqual(despues, antes)
    assert.equal((await filas(db, "select to_regclass('private.rb_respaldo_perfiles_adaptacion') as tabla"))[0].tabla, null)
    assert.equal((await filas(db, "select to_regprocedure('private.rb_rol_actual()') as funcion"))[0].funcion, null)
    assert.equal((await filas(db, "select to_regprocedure('public.autorizar_movimiento(bigint)') as funcion"))[0].funcion, null)
    // También se revierten las revocaciones efectuadas por el primer script.
    for (const firma of [
      'public.sigha_20316_solicitar_traslado(bigint,bigint,date,text,text,text)',
      'public.sigha_20320_decidir_traslado(bigint,text,text,text)',
      'public.sigha_20321_listar_pendientes()',
      'public.sigha_20423_listar_aprobados()',
    ]) {
      assert.equal((await filas(db, "select has_function_privilege('authenticated',$1,'EXECUTE') as permitido", [firma]))[0].permitido, true)
    }
    console.log(`OK: escenario ${escenario} aborta la instalación completa sin cambiar cuentas, catálogo, políticas, defaults ni ACL heredadas.`)
  } finally { await db.close() }
}

await correcto()
await debeRevertir('supervisor_ajeno', /ámbito incompatibles/)
await debeRevertir('cantidad_distinta', /tres cuentas ya no coinciden/)

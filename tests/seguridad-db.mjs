process.on('uncaughtException', e => { console.error(e.message, e.query ?? ''); process.exit(1) })
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs/promises'
import assert from 'node:assert/strict'
const db = new PGlite()
const root = fileURLToPath(new URL('../', import.meta.url)).replace(/[\\/]$/, '')
await db.exec(`set timezone='America/La_Paz'; create role anon; create role authenticated; create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`)
for(const f of (await fs.readdir(root+'/supabase/migrations')).sort()){
 await db.exec(await fs.readFile(root+'/supabase/migrations/'+f,'utf8')); console.log('Migración OK:',f)
}
const ids=['00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000006']
for(let i=0;i<ids.length;i++){
 const rol=i===3?'SUP_DEPTO_VII':i===4?'JEFE_DIV_B':'RESP_UNIDAD'
 const unidad=i===3||i===4?'null':i===5?1:i+1
 await db.exec(`insert into auth.users values('${ids[i]}');insert into public.perfiles(id,nombre_completo,activo,rol_id,unidad_id,departamento_id) select '${ids[i]}','Prueba ${i}',${i!==5},id,${unidad},1 from public.roles_sistema where codigo='${rol}';`)
}
ids.push('00000000-0000-0000-0000-000000000007')
await db.exec(`insert into public.departamentos(nombre) values('Departamento externo de prueba');
insert into auth.users values('${ids[6]}');
insert into public.perfiles(id,nombre_completo,activo,rol_id,departamento_id)
select '${ids[6]}','Supervisor externo',true,r.id,d.id from public.roles_sistema r
cross join public.departamentos d where r.codigo='SUP_DEPTO_VII' and d.nombre='Departamento externo de prueba';`)
async function as(i,sql){await db.exec(`reset role;select set_config('request.jwt.claim.sub','${ids[i]}',false);set role authenticated;`);return db.query(sql)}
async function denied(i,sql){await assert.rejects(()=>as(i,sql));}
for(let i=0;i<3;i++) await as(i,`insert into public.semovientes(codigo,especie,categoria,sexo,fecha_ingreso) values('RB-${i}','bovino','Vaca','Hembra',current_date)`)
assert.equal((await as(0,'select * from public.semovientes')).rows.length,1)
assert.equal((await as(3,'select * from public.semovientes')).rows.length,3)
assert.equal((await as(4,'select * from public.semovientes')).rows.length,3)
assert.equal((await as(5,'select * from public.semovientes')).rows.length,0)
await denied(4,`insert into public.semovientes(codigo,especie,categoria,sexo,fecha_ingreso) values('X','bovino','Vaca','Hembra',current_date)`)
await denied(0,`update public.perfiles set rol_id=1`)
await denied(0,`insert into public.semovientes(codigo,unidad_id,especie,categoria,sexo,fecha_ingreso) values('X',2,'bovino','Vaca','Hembra',current_date)`)
const sanitario=id=>`insert into public.controles_sanitarios(semoviente_id,tipo_control,fecha_control,responsable_sanitario,motivo) values(${id},'Revisión',current_date,'Veterinario de prueba','Control de prueba')`
await as(0,sanitario(1))
await denied(1,sanitario(1))
await denied(3,sanitario(1))
await as(0,`insert into public.controles_reproductivos(semoviente_id,tipo_evento,fecha_evento,responsable_reproductivo,detalle,resultado) values(1,'seguimiento',current_date,'Responsable de prueba','Seguimiento de prueba','Sin novedad')`)
assert.equal((await as(0,'select * from public.semoviente_eventos')).rows.length,2)
await denied(1,`select public.solicitar_movimiento(1,3,'Traslado indebido',current_date)`)
await denied(5,`select public.solicitar_movimiento(1,3,'Perfil inactivo',current_date)`)
await denied(0,`select public.solicitar_movimiento(1,2,'Motivo de prueba',null)`)
await denied(0,`select public.solicitar_movimiento(1,2,'Corto',current_date)`)

await as(0,`select public.solicitar_movimiento(1,2,'Traslado de prueba',current_date)`)
await denied(0,`select public.solicitar_movimiento(1,3,'Solicitud duplicada',current_date)`)
await denied(1,`select public.confirmar_recepcion(1)`)
await denied(4,`select public.autorizar_movimiento(1)`)
assert.equal((await as(6,'select * from public.solicitudes_movimientos')).rows.length,0)
await denied(6,`select public.autorizar_movimiento(1)`)

await denied(0,`select public.autorizar_movimiento(1)`)
await as(3,`select public.autorizar_movimiento(1)`)
assert.equal((await as(3,'select estado from public.solicitudes_movimientos where id=1')).rows[0].estado,'aprobado')
assert.equal((await as(0,'select unidad_id from public.semovientes where id=1')).rows[0].unidad_id,1)
await denied(0,`select public.confirmar_recepcion(1)`)
await denied(2,`select public.confirmar_recepcion(1)`)
await as(1,`select public.confirmar_recepcion(1)`)
assert.equal((await as(1,'select estado from public.solicitudes_movimientos where id=1')).rows[0].estado,'ejecutado')
assert.equal((await as(0,'select * from public.semovientes where id=1')).rows.length,0)
assert.equal((await as(1,'select unidad_id from public.semovientes where id=1')).rows[0].unidad_id,2)
assert.equal((await as(2,'select * from public.solicitudes_movimientos')).rows.length,0)
assert.equal((await as(1,"select * from public.semoviente_eventos where tipo_evento='movimiento'")).rows.length,1)
await denied(1,`select public.confirmar_recepcion(1)`)
await denied(3,`update public.solicitudes_movimientos set estado='ejecutado'`)
await denied(0,`insert into public.solicitudes_movimientos(semoviente_id,unidad_origen_id,unidad_destino_id,fecha_prevista,motivo,solicitado_por) values(2,1,3,current_date,'Registro directo',auth.uid())`)
assert.equal((await as(2,'select * from public.controles_sanitarios')).rows.length,0)
await db.exec('reset role; set role anon;')
await assert.rejects(() => db.query('select * from public.semovientes'))
await assert.rejects(() => db.query("select public.solicitar_movimiento(1,2,'Acceso anónimo',current_date)"))
console.log('OK: aislamiento por unidad, roles de consulta, perfil inactivo, controles e historial, privilegios y ciclo completo de traslado.')
await db.close()

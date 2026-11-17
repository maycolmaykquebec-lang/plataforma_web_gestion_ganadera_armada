-- Autorizado por el usuario: las tres cuentas activas OPERADOR/SANITARIO/
-- REPRODUCTIVO de Río Blanco pasan a RESP_UNIDAD, con sus funciones completas.
-- No cambia contraseñas, usuarios de Auth, estado activo ni unidades.
begin;
create table private.rb_respaldo_perfiles_adaptacion (
 perfil_id uuid primary key,
 rol_id bigint not null, unidad_id bigint, division_id bigint, departamento_id bigint,
 activo boolean not null, respaldado_en timestamptz not null default now()
);
-- Sin políticas para clientes: el respaldo solo es accesible al propietario administrativo.
alter table private.rb_respaldo_perfiles_adaptacion enable row level security;
revoke all on private.rb_respaldo_perfiles_adaptacion from public,anon,authenticated;
DO $$
declare unidad bigint; division bigint; departamento bigint; responsable bigint; cantidad bigint;
begin
 select u.id,u.division_id,v.departamento_id into strict unidad,division,departamento
 from public.unidades_operativas u join public.divisiones v on v.id=u.division_id
 join public.departamentos d on d.id=v.departamento_id
 where u.codigo='RIO-BLANCO' and u.activo and v.activo and d.activo;
 select id into strict responsable from public.roles_sistema where codigo='RESP_UNIDAD';
 -- Evita aplicar el plan a cuentas distintas si la base cambió desde el diagnóstico.
 lock table public.perfiles in share row exclusive mode;
 select count(*) into cantidad from public.perfiles p join public.roles_sistema r on r.id=p.rol_id
 where p.activo and p.unidad_id=unidad and r.codigo in ('OPERADOR','SANITARIO','REPRODUCTIVO');
 if cantidad<>3 or exists(
  select 1 from (values('OPERADOR'),('SANITARIO'),('REPRODUCTIVO')) expected(codigo)
  where (select count(*) from public.perfiles p join public.roles_sistema r on r.id=p.rol_id
   where p.activo and p.unidad_id=unidad and r.codigo=expected.codigo)<>1
 ) then raise exception 'Las tres cuentas ya no coinciden con el diagnóstico; no se reasignó ninguna'; end if;
 if exists(select 1 from public.perfiles p join public.roles_sistema r on r.id=p.rol_id where p.activo and
  ((p.unidad_id=unidad and r.codigo in ('OPERADOR','SANITARIO','REPRODUCTIVO')
    and ((p.division_id is not null and p.division_id<>division) or (p.departamento_id is not null and p.departamento_id<>departamento)))
   or (r.codigo='SUP_DEPTO_VII' and p.departamento_id is not null and p.departamento_id<>departamento))) then
  raise exception 'Hay asignaciones de ámbito incompatibles; revisar sin sobrescribirlas';
 end if;
 select count(*) into cantidad from public.perfiles p join public.roles_sistema r on r.id=p.rol_id
 where p.activo and r.codigo='SUP_DEPTO_VII';
 if cantidad<>1 then raise exception 'Se esperaba un Supervisor activo, según diagnóstico'; end if;
 insert into private.rb_respaldo_perfiles_adaptacion(perfil_id,rol_id,unidad_id,division_id,departamento_id,activo)
 select p.id,p.rol_id,p.unidad_id,p.division_id,p.departamento_id,p.activo
 from public.perfiles p join public.roles_sistema r on r.id=p.rol_id
 where p.activo and ((p.unidad_id=unidad and r.codigo in ('OPERADOR','SANITARIO','REPRODUCTIVO')) or r.codigo='SUP_DEPTO_VII');
 update public.perfiles p set rol_id=responsable,division_id=division,departamento_id=departamento,updated_at=now()
 from public.roles_sistema r where r.id=p.rol_id and p.activo and p.unidad_id=unidad
 and r.codigo in ('OPERADOR','SANITARIO','REPRODUCTIVO');
 -- Completa únicamente un ámbito faltante; no sobrescribe uno diferente.
 update public.perfiles p set departamento_id=departamento,updated_at=now()
 from public.roles_sistema r where r.id=p.rol_id and p.activo and r.codigo='SUP_DEPTO_VII' and p.departamento_id is null;
end $$;
commit;

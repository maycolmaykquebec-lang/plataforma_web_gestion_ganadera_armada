-- Solo lectura: recuentos sin nombres de usuarios y metadatos de automatizaciones.
-- Permite revisar cuentas heredadas y detectar RPC/triggers antes de ejecutar 01/02.
select jsonb_pretty(jsonb_build_object(
 'perfiles_por_rol', (select jsonb_agg(to_jsonb(x)) from (
  select r.codigo as rol, u.codigo as unidad, p.activo,
   (p.departamento_id is not null) as tiene_departamento,
   (p.division_id is not null) as tiene_division, count(*) as cantidad
  from public.perfiles p join public.roles_sistema r on r.id=p.rol_id
  left join public.unidades_operativas u on u.id=p.unidad_id
  group by r.codigo,u.codigo,p.activo,(p.departamento_id is not null),(p.division_id is not null)
  order by r.codigo,u.codigo,p.activo
 ) x),
 'rpc_privilegiadas', (select jsonb_agg(jsonb_build_object(
   'funcion',p.oid::regprocedure::text,
   'acceso_authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE')
 )) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.prokind='f' and p.prosecdef
 and p.prorettype not in ('trigger'::regtype,'event_trigger'::regtype)),
 'triggers', (select jsonb_agg(jsonb_build_object(
   'tabla',c.relname,'trigger',t.tgname,'estado',t.tgenabled,
   'funcion',t.tgfoid::regprocedure::text,
   'definicion_funcion',pg_get_functiondef(t.tgfoid)
 )) from pg_trigger t join pg_class c on c.oid=t.tgrelid
 join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relname in ('semovientes','solicitudes_movimientos') and not t.tgisinternal)
)) as plan_adaptacion;

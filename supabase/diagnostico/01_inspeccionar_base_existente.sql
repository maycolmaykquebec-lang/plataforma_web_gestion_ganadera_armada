-- DIAGNÓSTICO DE SOLO LECTURA para el SQL Editor del proyecto existente.
-- Ejecutar completo. Devuelve filas seccion / objeto / detalle (JSONB).
-- No lee registros de personas, perfiles, animales ni catálogos institucionales.
-- No ejecuta funciones de la aplicación ni muestra cuerpos de funciones/triggers.
-- No crea, modifica o elimina tablas, permisos ni datos.
-- Comprueba la presencia y estructura de los objetos que espera la aplicación.
-- No verifica por sí mismo la identidad del proyecto: confirmar la referencia
-- yxwgqxzskicddeukwvkk en el panel antes de ejecutarlo.

with esperadas as (
  select unnest(array[
    'departamentos', 'divisiones', 'unidades_operativas', 'roles_sistema',
    'perfiles', 'semovientes', 'semoviente_eventos', 'controles_sanitarios',
    'controles_reproductivos', 'reproduccion_crias_vinculadas', 'movimientos'
  ]) as nombre
), tablas as (
  select c.oid, n.nspname as esquema, c.relname as tabla,
         c.relowner, c.relacl, c.relrowsecurity, c.relforcerowsecurity
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  join esperadas e on e.nombre = c.relname
  where n.nspname = 'public' and c.relkind in ('r', 'p')
), funciones as (
  select p.oid, n.nspname as esquema, p.proname as nombre,
         p.prosecdef, p.proconfig, p.proowner, p.proacl,
         l.lanname as lenguaje
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  join pg_catalog.pg_language l on l.oid = p.prolang
  where p.prokind = 'f' and (
    (n.nspname = 'private' and (
      p.proname in ('rol_actual', 'unidad_actual')
      or p.proname ilike '%rio_blanco%'
    ))
    or (n.nspname = 'public' and p.proname in (
      'solicitar_movimiento', 'autorizar_movimiento', 'confirmar_recepcion'
    ))
  )
), resultado as (
  select '00_entorno'::text as seccion, 'base_actual'::text as objeto,
    jsonb_build_object(
      'base', current_database(),
      'version_postgres', current_setting('server_version'),
      'modo', 'Solo metadatos; no se consultan filas de la aplicación'
    ) as detalle

  union all
  select '01_presencia', 'public.' || e.nombre,
    jsonb_build_object(
      'existe', c.oid is not null,
      'tipo_relacion', c.relkind,
      'tabla_base', coalesce(c.relkind in ('r', 'p'), false)
    )
  from esperadas e
  left join pg_catalog.pg_namespace n on n.nspname = 'public'
  left join pg_catalog.pg_class c
    on c.relnamespace = n.oid and c.relname = e.nombre

  union all
  select '02_columnas', t.esquema || '.' || t.tabla || '.' || a.attname,
    jsonb_build_object(
      'posicion', a.attnum,
      'tipo', pg_catalog.format_type(a.atttypid, a.atttypmod),
      'obligatoria', a.attnotnull,
      'identidad', a.attidentity,
      'generada', a.attgenerated,
      'default', pg_catalog.pg_get_expr(d.adbin, d.adrelid)
    )
  from tablas t
  join pg_catalog.pg_attribute a on a.attrelid = t.oid
  left join pg_catalog.pg_attrdef d
    on d.adrelid = a.attrelid and d.adnum = a.attnum
  where a.attnum > 0 and not a.attisdropped

  union all
  select case when k.contype = 'f' then '04_claves_foraneas' else '03_restricciones' end,
    t.esquema || '.' || t.tabla || '.' || k.conname,
    jsonb_build_object(
      'tipo', k.contype,
      'validada', k.convalidated,
      'diferible', k.condeferrable,
      'inicialmente_diferida', k.condeferred,
      'definicion', pg_catalog.pg_get_constraintdef(k.oid, true)
    )
  from tablas t
  join pg_catalog.pg_constraint k on k.conrelid = t.oid

  union all
  select '05_indices', t.esquema || '.' || t.tabla || '.' || i.indexname,
    jsonb_build_object('definicion', i.indexdef)
  from tablas t
  join pg_catalog.pg_indexes i
    on i.schemaname = t.esquema and i.tablename = t.tabla

  union all
  select '06_rls', t.esquema || '.' || t.tabla,
    jsonb_build_object(
      'habilitado', t.relrowsecurity,
      'forzado_para_propietario', t.relforcerowsecurity
    )
  from tablas t

  union all
  select '07_politicas', t.esquema || '.' || t.tabla || '.' || p.policyname,
    jsonb_build_object(
      'combinacion', p.permissive,
      'roles', p.roles,
      'operacion', p.cmd,
      'usando', p.qual,
      'comprobacion', p.with_check
    )
  from tablas t
  join pg_catalog.pg_policies p
    on p.schemaname = t.esquema and p.tablename = t.tabla

  union all
  select '08_permisos_tabla', t.esquema || '.' || t.tabla,
    jsonb_build_object(
      'rol', case when a.grantee = 0 then 'PUBLIC'
                  else pg_catalog.pg_get_userbyid(a.grantee) end,
      'privilegio', a.privilege_type,
      'delegable', a.is_grantable
    )
  from tablas t
  cross join lateral pg_catalog.aclexplode(
    coalesce(t.relacl, pg_catalog.acldefault('r', t.relowner))
  ) a

  union all
  select '09_permisos_columna', t.esquema || '.' || t.tabla || '.' || c.column_name,
    jsonb_build_object(
      'rol', c.grantee,
      'privilegio', c.privilege_type,
      'delegable', c.is_grantable
    )
  from tablas t
  join information_schema.column_privileges c
    on c.table_schema = t.esquema and c.table_name = t.tabla
  where c.grantee in ('PUBLIC', 'anon', 'authenticated')

  union all
  select '10_triggers', t.esquema || '.' || t.tabla || '.' || tr.tgname,
    jsonb_build_object(
      'habilitado', tr.tgenabled,
      'tipo_evento_bitmask', tr.tgtype,
      'funcion', tr.tgfoid::regprocedure::text,
      'funcion_security_definer', p.prosecdef,
      'funcion_configuracion', p.proconfig
    )
  from tablas t
  join pg_catalog.pg_trigger tr on tr.tgrelid = t.oid and not tr.tgisinternal
  join pg_catalog.pg_proc p on p.oid = tr.tgfoid

  union all
  select '11_funciones', f.esquema || '.' || f.nombre || '(' ||
      pg_catalog.pg_get_function_identity_arguments(f.oid) || ')',
    jsonb_build_object(
      'retorno', pg_catalog.pg_get_function_result(f.oid),
      'lenguaje', f.lenguaje,
      'security_definer', f.prosecdef,
      'configuracion', f.proconfig
    )
  from funciones f

  union all
  select '12_permisos_funcion', f.esquema || '.' || f.nombre || '(' ||
      pg_catalog.pg_get_function_identity_arguments(f.oid) || ')',
    jsonb_build_object(
      'rol', case when a.grantee = 0 then 'PUBLIC'
                  else pg_catalog.pg_get_userbyid(a.grantee) end,
      'privilegio', a.privilege_type,
      'delegable', a.is_grantable
    )
  from funciones f
  cross join lateral pg_catalog.aclexplode(
    coalesce(f.proacl, pg_catalog.acldefault('f', f.proowner))
  ) a
)
select seccion, objeto, detalle
from resultado
order by seccion, objeto, detalle::text;

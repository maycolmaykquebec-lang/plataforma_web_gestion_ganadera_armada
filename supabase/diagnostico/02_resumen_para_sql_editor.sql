-- Solo lectura. Compartir el resultado exportado; no contiene usuarios ni animales.
select jsonb_pretty(jsonb_build_object(
  'columnas', (select jsonb_agg(to_jsonb(c)) from (
    select table_name, column_name, udt_name, is_nullable, column_default
    from information_schema.columns where table_schema = 'public'
    order by table_name, ordinal_position
  ) c),
  'relaciones_y_reglas', (select jsonb_agg(jsonb_build_object(
    'tabla', r.relname, 'nombre', c.conname,
    'definicion', pg_get_constraintdef(c.oid)
  )) from pg_constraint c join pg_class r on r.oid = c.conrelid
  join pg_namespace n on n.oid = r.relnamespace where n.nspname = 'public'),
  'politicas', (select jsonb_agg(to_jsonb(p)) from pg_policies p
    where p.schemaname = 'public'),
  'roles', (select jsonb_agg(jsonb_build_object(
    'codigo', to_jsonb(r)->'codigo', 'nombre', to_jsonb(r)->'nombre'
  )) from public.roles_sistema r),
  'unidades', (select jsonb_agg(jsonb_build_object(
    'id', to_jsonb(u)->'id', 'codigo', to_jsonb(u)->'codigo',
    'nombre', to_jsonb(u)->'nombre', 'sigla', to_jsonb(u)->'sigla'
  )) from public.unidades_operativas u)
)) as diagnostico;

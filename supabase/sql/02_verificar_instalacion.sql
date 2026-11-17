-- RIO_BLANCO | PASO 16.5 | Ejecutar DESPUES de 01.
-- Consulta 1: estado RLS, permisos y cantidad de eventos.
SELECT
  to_regclass('public.semoviente_eventos') AS tabla,
  c.relrowsecurity AS rls_activado,
  has_table_privilege('authenticated', 'public.semoviente_eventos', 'SELECT') AS autenticado_consulta,
  has_table_privilege('authenticated', 'public.semoviente_eventos', 'INSERT') AS autenticado_inserta,
  has_table_privilege('authenticated', 'public.semoviente_eventos', 'UPDATE') AS autenticado_modifica,
  has_table_privilege('authenticated', 'public.semoviente_eventos', 'DELETE') AS autenticado_elimina,
  has_table_privilege('anon', 'public.semoviente_eventos', 'SELECT') AS anon_consulta,
  (SELECT count(*) FROM public.semoviente_eventos) AS acontecimientos
FROM pg_class c
WHERE c.oid = 'public.semoviente_eventos'::regclass;

-- Consulta 2: política de lectura.
SELECT policyname, cmd, roles, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'semoviente_eventos';

-- Consulta 3: índices disponibles.
SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'semoviente_eventos'
ORDER BY indexname;

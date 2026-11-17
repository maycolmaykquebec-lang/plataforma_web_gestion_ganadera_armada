-- RIO_BLANCO | PASO 18.3 | 01 - Inspeccion inicial (solo lectura)
-- Ejecutar en Supabase SQL Editor ANTES de instalar el 02.
SELECT
  to_regclass('public.semovientes') IS NOT NULL AS existe_semovientes,
  to_regclass('public.semoviente_eventos') IS NOT NULL AS existe_historial,
  to_regclass('public.controles_reproductivos') IS NOT NULL AS reproductivos_ya_existe,
  to_regclass('public.reproduccion_crias_vinculadas') IS NOT NULL AS crias_vinculadas_ya_existe,
  (SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public.semovientes')) AS rls_semovientes,
  (SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public.semoviente_eventos')) AS rls_historial,
  EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = to_regclass('public.semovientes') AND attname = 'especie' AND NOT attisdropped) AS existe_especie,
  EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = to_regclass('public.semovientes') AND attname = 'sexo' AND NOT attisdropped) AS existe_sexo;

-- Se espera true en las tablas previas, sus RLS y columnas.
-- Las dos tablas nuevas deben figurar false. Si existen, NO ejecutar 02.

-- RIO_BLANCO | PASO 17.3 | Consulta unica de verificacion principal
-- Ejecutar DESPUES del 01 en Supabase SQL Editor.
SELECT
  to_regclass('public.controles_sanitarios') AS tabla,
  c.relrowsecurity AS rls_activado,
  has_table_privilege('authenticated', 'public.controles_sanitarios', 'SELECT') AS autenticado_consulta,
  has_table_privilege('authenticated', 'public.controles_sanitarios', 'INSERT') AS autenticado_inserta,
  has_table_privilege('authenticated', 'public.controles_sanitarios', 'UPDATE') AS autenticado_modifica,
  has_table_privilege('authenticated', 'public.controles_sanitarios', 'DELETE') AS autenticado_elimina,
  has_table_privilege('anon', 'public.controles_sanitarios', 'SELECT') AS anon_consulta,
  (SELECT COUNT(*) FROM public.controles_sanitarios) AS controles,
  EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid = 'public.controles_sanitarios'::regclass
      AND t.tgname = 'trg_rio_blanco_173_publicar_control_sanitario'
      AND NOT t.tgisinternal AND t.tgenabled = 'O'
  ) AS trigger_historial,
  EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid = 'public.controles_sanitarios'::regclass
      AND t.tgname = 'trg_rio_blanco_173_validar_control_sanitario'
      AND NOT t.tgisinternal AND t.tgenabled = 'O'
  ) AS trigger_fechas
FROM pg_class c
WHERE c.oid = 'public.controles_sanitarios'::regclass;

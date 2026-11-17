-- RIO_BLANCO | PASO 18.7 | 01 - Revisión previa, SOLO LECTURA.
-- No altera datos, esquemas ni permisos.
SELECT
  to_regclass('public.semovientes') IS NOT NULL AS tabla_animales,
  to_regclass('public.controles_reproductivos') IS NOT NULL AS tabla_controles,
  to_regprocedure('private.rio_blanco_183_validar_control()') IS NOT NULL AS trigger_validacion_183_funcion,
  EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.controles_reproductivos'::regclass
      AND tgname = 'trg_rio_blanco_183_validar_control'
      AND NOT tgisinternal AND tgenabled <> 'D'
  ) AS trigger_validacion_183_activo,
  (
    SELECT COUNT(*) FROM public.semovientes s
    JOIN public.unidades_operativas u ON u.id = s.unidad_id
    WHERE u.codigo = 'RIO-BLANCO' AND s.codigo = '007'
      AND s.especie = 'bovino' AND lower(btrim(s.categoria)) = 'ternero'
  ) AS bovino_007_ternero;

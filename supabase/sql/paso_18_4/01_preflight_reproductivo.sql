-- RIO_BLANCO | PASO 18.4 | 01 - COMPROBACION PREVIA (SOLO LECTURA)
-- Ejecutar en Supabase SQL Editor del entorno de DESARROLLO.
-- Un cero en perfiles reproductivos es normal antes de crear la cuenta de prueba.
SELECT
  to_regclass('public.controles_reproductivos') IS NOT NULL AS tabla_reproductiva_existe,
  to_regclass('public.reproduccion_crias_vinculadas') IS NOT NULL AS tabla_crias_existe,
  to_regclass('public.semovientes') IS NOT NULL AS semovientes_existe,
  to_regclass('public.semoviente_eventos') IS NOT NULL AS historial_existe,
  to_regprocedure('private.rol_actual()') IS NOT NULL AS funcion_rol_existe,
  to_regprocedure('private.unidad_actual()') IS NOT NULL AS funcion_unidad_existe,
  EXISTS (SELECT 1 FROM public.roles_sistema WHERE codigo = 'REPRODUCTIVO') AS rol_reproductivo_existe,
  (SELECT count(*) FROM public.perfiles p
   JOIN public.roles_sistema r ON r.id = p.rol_id
   WHERE r.codigo = 'REPRODUCTIVO' AND p.activo AND p.unidad_id IS NOT NULL
  ) AS perfiles_reproductivos_activos_con_unidad,
  (SELECT count(*) FROM public.semovientes s
   JOIN public.unidades_operativas u ON u.id = s.unidad_id
   WHERE u.codigo='RIO-BLANCO' AND s.codigo='007' AND s.estado='Activo'
  ) AS animales_007_activos_rio_blanco;

-- En una consulta nueva (solo si el rol REPRODUCTIVO no existe) puede comprobar
-- las columnas obligatorias de roles_sistema antes de ejecutar 02:
-- SELECT column_name, data_type, is_nullable, column_default, is_identity
-- FROM information_schema.columns
-- WHERE table_schema='public' AND table_name='roles_sistema'
-- ORDER BY ordinal_position;

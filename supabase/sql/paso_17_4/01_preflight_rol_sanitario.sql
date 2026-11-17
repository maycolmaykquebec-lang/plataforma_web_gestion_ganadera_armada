-- RIO_BLANCO | PASO 17.4 | 01 - COMPROBACION PREVIA (SOLO LECTURA)
-- Ejecutar en Supabase SQL Editor. No altera datos ni permisos.
SELECT
  to_regclass('public.controles_sanitarios') IS NOT NULL AS tabla_sanitaria_existe,
  to_regclass('public.semovientes') IS NOT NULL AS tabla_semovientes_existe,
  to_regclass('public.semoviente_eventos') IS NOT NULL AS tabla_historial_existe,
  to_regprocedure('private.rol_actual()') IS NOT NULL AS funcion_rol_existe,
  to_regprocedure('private.unidad_actual()') IS NOT NULL AS funcion_unidad_existe,
  EXISTS (
    SELECT 1 FROM public.roles_sistema WHERE codigo = 'SANITARIO'
  ) AS rol_sanitario_existe,
  (SELECT count(*) FROM public.perfiles p
   JOIN public.roles_sistema r ON r.id = p.rol_id
   WHERE r.codigo = 'SANITARIO' AND p.activo = true AND p.unidad_id IS NOT NULL
  ) AS perfiles_sanitarios_activos_con_unidad,
  (SELECT count(*) FROM public.semovientes s
   JOIN public.unidades_operativas u ON u.id = s.unidad_id
   WHERE u.codigo = 'RIO-BLANCO' AND s.estado = 'Activo'
  ) AS semovientes_activos_rio_blanco;

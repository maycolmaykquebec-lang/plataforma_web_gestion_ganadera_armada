-- Control Reproductivo 2.0 / Consultas no destructivas.
-- Ejecutar DESPUES de la migración 03, en Supabase SQL Editor.
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'controles_reproductivos'
      AND column_name = 'reproductor_id'
  ) AS enlace_macho_existe,
  to_regclass('public.rb_antecedentes_reproductivos') IS NOT NULL AS antecedentes_existen,
  to_regprocedure('public.rb_resumen_reproductivo(bigint)') IS NOT NULL AS contador_disponible,
  EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.controles_reproductivos'::regclass
      AND tgname = 'rb_validar_vinculo_monta' AND NOT tgisinternal
  ) AS validacion_monta_activa;

-- Contar registros reales de partos, SIN modificar datos ni inferir partos previos.
SELECT s.id, s.codigo, s.codigo_activo, s.unidad_id,
       count(c.id) AS partos_documentados,
       coalesce(sum(c.cantidad_crias), 0) AS crias_documentadas,
       max(c.fecha_evento) AS ultimo_parto
FROM public.semovientes s
LEFT JOIN public.controles_reproductivos c
  ON c.semoviente_id = s.id AND c.tipo_evento = 'parto'
WHERE s.sexo = 'Hembra'
GROUP BY s.id, s.codigo, s.codigo_activo, s.unidad_id
ORDER BY s.unidad_id, s.codigo;

-- Contar montas con macho RELACIONADO. Los registros anteriores solo con
-- reproductor_codigo (texto) no se atribuyen automáticamente al macho.
SELECT s.id, s.codigo, s.codigo_activo, s.unidad_id,
       count(c.id) AS montas_vinculadas,
       max(c.fecha_evento) AS ultima_monta
FROM public.semovientes s
LEFT JOIN public.controles_reproductivos c
  ON c.reproductor_id = s.id AND c.tipo_evento = 'monta'
WHERE s.sexo = 'Macho'
GROUP BY s.id, s.codigo, s.codigo_activo, s.unidad_id
ORDER BY s.unidad_id, s.codigo;

-- RIO_BLANCO | PASO 17.4 | 03 - PRIVILEGIOS Y RLS (SOLO LECTURA)
SELECT
  c.relrowsecurity AS rls_activado,
  has_table_privilege('authenticated','public.controles_sanitarios','SELECT') AS autenticado_consulta,
  has_any_column_privilege('authenticated','public.controles_sanitarios','INSERT') AS autenticado_puede_intentar_insertar,
  has_column_privilege('authenticated','public.controles_sanitarios','semoviente_id','INSERT') AS puede_enviar_animal,
  has_column_privilege('authenticated','public.controles_sanitarios','motivo','INSERT') AS puede_enviar_motivo,
  has_column_privilege('authenticated','public.controles_sanitarios','registrado_por','INSERT') AS puede_falsificar_registrador,
  has_column_privilege('authenticated','public.controles_sanitarios','id','INSERT') AS puede_asignar_id,
  has_table_privilege('authenticated','public.controles_sanitarios','UPDATE') AS puede_modificar,
  has_table_privilege('authenticated','public.controles_sanitarios','DELETE') AS puede_eliminar,
  has_any_column_privilege('anon','public.controles_sanitarios','INSERT') AS anon_puede_insertar,
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'controles_sanitarios'
      AND policyname = 'controles_sanitarios_insert_sanitario_unidad'
      AND cmd = 'INSERT' AND 'authenticated' = ANY(roles)
  ) AS politica_insert_existe,
  (SELECT count(*) FROM public.controles_sanitarios) AS controles_existentes
FROM pg_class c
WHERE c.oid = 'public.controles_sanitarios'::regclass;

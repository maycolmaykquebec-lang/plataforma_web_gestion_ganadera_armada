-- RIO_BLANCO | PASO 18.4 | 04 - VERIFICACION DE PRIVILEGIOS Y RLS (SOLO LECTURA)
SELECT
  c.relrowsecurity AS rls_activado,
  has_table_privilege('authenticated','public.controles_reproductivos','SELECT') AS autenticado_consulta,
  has_any_column_privilege('authenticated','public.controles_reproductivos','INSERT') AS puede_intentar_insertar,
  has_column_privilege('authenticated','public.controles_reproductivos','semoviente_id','INSERT') AS puede_enviar_animal,
  has_column_privilege('authenticated','public.controles_reproductivos','registrado_por','INSERT') AS puede_falsificar_autor,
  has_column_privilege('authenticated','public.controles_reproductivos','id','INSERT') AS puede_forzar_id,
  has_table_privilege('authenticated','public.controles_reproductivos','UPDATE') AS puede_modificar,
  has_table_privilege('authenticated','public.controles_reproductivos','DELETE') AS puede_eliminar,
  has_any_column_privilege('anon','public.controles_reproductivos','INSERT') AS anon_inserta,
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='controles_reproductivos'
      AND policyname='controles_reproductivos_insert_responsable_unidad' AND cmd='INSERT'
      AND 'authenticated' = ANY(roles)) AS politica_insert_existe,
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='semovientes'
      AND policyname='semovientes_lectura_reproductivo_unidad' AND cmd='SELECT'
      AND 'authenticated'=ANY(roles)) AS politica_lectura_unidad_existe,
  has_any_column_privilege('authenticated','public.reproduccion_crias_vinculadas','INSERT') AS puede_insertar_vinculos_crias
FROM pg_class c
WHERE c.oid='public.controles_reproductivos'::regclass;

-- La lectura de pg_policies muestra las reglas exactas para una revision humana:
-- SELECT tablename, policyname, cmd, roles, qual, with_check FROM pg_policies
-- WHERE schemaname='public' AND tablename IN ('semovientes','controles_reproductivos');

-- RIO_BLANCO | PASO 17.4 | 05 - PRUEBA POSITIVA OPCIONAL
-- SOLO ejecutarla cuando exista un usuario de Supabase Auth con perfil
-- activo, rol SANITARIO y unidad RIO BLANCO. No crear cuentas automaticamente.
-- Requiere que el rol SANITARIO tenga lectura RLS de semovientes de su unidad.
-- Un INSERT debera generar un evento automatico; todo se revierte con ROLLBACK.
BEGIN;

DO $$
DECLARE
  v_sanitario uuid;
  v_animal bigint;
BEGIN
  SELECT p.id INTO v_sanitario
    FROM public.perfiles p
    JOIN public.roles_sistema r ON r.id = p.rol_id
    JOIN public.unidades_operativas u ON u.id = p.unidad_id
   WHERE r.codigo = 'SANITARIO' AND p.activo AND u.codigo = 'RIO-BLANCO'
   ORDER BY p.created_at LIMIT 1;

  IF v_sanitario IS NULL THEN
    RAISE EXCEPTION 'NO HAY perfil SANITARIO activo de RIO BLANCO; no se ejecuto la prueba positiva.';
  END IF;

  SELECT s.id INTO v_animal
    FROM public.semovientes s
    JOIN public.unidades_operativas u ON u.id = s.unidad_id
   WHERE u.codigo = 'RIO-BLANCO' AND s.estado = 'Activo'
   ORDER BY s.id LIMIT 1;

  IF v_animal IS NULL THEN
    RAISE EXCEPTION 'NO HAY semoviente activo ficticio de RIO BLANCO.';
  END IF;

  PERFORM set_config('rio_blanco174.sanitario', v_sanitario::text, true);
  PERFORM set_config('rio_blanco174.animal', v_animal::text, true);
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('rio_blanco174.sanitario'), true);

WITH insercion AS (
  INSERT INTO public.controles_sanitarios
    (semoviente_id, tipo_control, fecha_control, responsable_sanitario, motivo)
  VALUES (
    current_setting('rio_blanco174.animal')::bigint,
    'Revisión', (CURRENT_TIMESTAMP AT TIME ZONE 'America/La_Paz')::date,
    'Profesional ficticio RIO_BLANCO', 'RIO_BLANCO-174-PRUEBA-SANITARIO'
  ) RETURNING id
)
SELECT
  (SELECT count(*) FROM insercion) AS controles_insertados,
  (SELECT count(*) FROM public.semoviente_eventos e
    JOIN insercion i ON e.origen_modulo='sanidad' AND e.origen_registro_id=i.id::text
   ) AS eventos_creados;

RESET ROLE;
ROLLBACK;

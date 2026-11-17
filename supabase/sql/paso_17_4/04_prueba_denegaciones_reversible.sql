-- RIO_BLANCO | PASO 17.4 | 04 - NEGACION AL SUPERVISOR Y AL OPERADOR
-- Ejecutar SOLO desde Supabase SQL Editor administrativo.
-- Simula los dos perfiles de prueba; NO habilita usuarios, NO persiste registros.
-- Si falla por un error distinto de RLS, la prueba NO se aprueba.
BEGIN;

DO $$
DECLARE
  v_supervisor uuid;
  v_operador uuid;
  v_animal bigint;
BEGIN
  SELECT p.id INTO STRICT v_supervisor
    FROM public.perfiles p
    JOIN public.roles_sistema r ON r.id = p.rol_id
   WHERE p.nombre_completo = 'Supervisor de Prueba'
     AND p.activo AND r.codigo = 'SUP_DEPTO_VII';
  SELECT p.id INTO STRICT v_operador
    FROM public.perfiles p
    JOIN public.roles_sistema r ON r.id = p.rol_id
    JOIN public.unidades_operativas u ON u.id = p.unidad_id
   WHERE p.nombre_completo = 'Operador de Prueba'
     AND p.activo AND r.codigo = 'OPERADOR' AND u.codigo = 'RIO-BLANCO';
  SELECT s.id INTO STRICT v_animal
    FROM public.semovientes s
    JOIN public.unidades_operativas u ON u.id = s.unidad_id
   WHERE u.codigo = 'RIO-BLANCO' AND s.estado = 'Activo'
   ORDER BY s.id LIMIT 1;
  PERFORM set_config('rio_blanco174.supervisor', v_supervisor::text, true);
  PERFORM set_config('rio_blanco174.operador', v_operador::text, true);
  PERFORM set_config('rio_blanco174.animal', v_animal::text, true);
END $$;

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_error text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', current_setting('rio_blanco174.supervisor'), true);
  BEGIN
    INSERT INTO public.controles_sanitarios
      (semoviente_id, tipo_control, fecha_control, responsable_sanitario, motivo)
    VALUES (
      current_setting('rio_blanco174.animal')::bigint, 'Revisión',
      (CURRENT_TIMESTAMP AT TIME ZONE 'America/La_Paz')::date,
      'Profesional ficticio RIO_BLANCO', 'RIO_BLANCO-174-NEGATIVA-SUPERVISOR'
    );
    RAISE EXCEPTION 'FALLO: Supervisor pudo insertar' USING ERRCODE='P0001';
  EXCEPTION WHEN insufficient_privilege THEN
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
    IF position('row-level security' IN lower(v_error)) = 0 THEN
      RAISE EXCEPTION 'Fallo por otra razon, no RLS: %', v_error;
    END IF;
  END;
  PERFORM set_config('rio_blanco174.supervisor_bloqueado', 'SI', true);

  PERFORM set_config('request.jwt.claim.sub', current_setting('rio_blanco174.operador'), true);
  BEGIN
    INSERT INTO public.controles_sanitarios
      (semoviente_id, tipo_control, fecha_control, responsable_sanitario, motivo)
    VALUES (
      current_setting('rio_blanco174.animal')::bigint, 'Revisión',
      (CURRENT_TIMESTAMP AT TIME ZONE 'America/La_Paz')::date,
      'Profesional ficticio RIO_BLANCO', 'RIO_BLANCO-174-NEGATIVA-OPERADOR'
    );
    RAISE EXCEPTION 'FALLO: Operador pudo insertar' USING ERRCODE='P0001';
  EXCEPTION WHEN insufficient_privilege THEN
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
    IF position('row-level security' IN lower(v_error)) = 0 THEN
      RAISE EXCEPTION 'Fallo por otra razon, no RLS: %', v_error;
    END IF;
  END;
  PERFORM set_config('rio_blanco174.operador_bloqueado', 'SI', true);
END $$;

SELECT
  current_setting('rio_blanco174.supervisor_bloqueado', true) AS supervisor_bloqueado_por_rls,
  current_setting('rio_blanco174.operador_bloqueado', true) AS operador_bloqueado_por_rls;

RESET ROLE;
ROLLBACK;

-- RIO_BLANCO | PASO 18.4 | 05 - SUPERVISOR / OPERADOR / SANITARIO NO PUEDEN INSERTAR
-- Requiere los tres perfiles de prueba creados en pasos previos.
-- Prueba de RLS desde Supabase SQL Editor administrativo. No persiste cambios.
BEGIN;
DO $$
DECLARE
  v_supervisor uuid;
  v_operador uuid;
  v_sanitario uuid;
  v_animal bigint;
BEGIN
  SELECT p.id INTO STRICT v_supervisor
    FROM public.perfiles p JOIN public.roles_sistema r ON r.id=p.rol_id
    WHERE r.codigo='SUP_DEPTO_VII' AND p.nombre_completo='Supervisor de Prueba' AND p.activo;
  SELECT p.id INTO STRICT v_operador
    FROM public.perfiles p JOIN public.roles_sistema r ON r.id=p.rol_id
    JOIN public.unidades_operativas u ON u.id=p.unidad_id
    WHERE r.codigo='OPERADOR' AND p.nombre_completo='Operador de Prueba'
      AND u.codigo='RIO-BLANCO' AND p.activo;
  SELECT p.id INTO STRICT v_sanitario
    FROM public.perfiles p JOIN public.roles_sistema r ON r.id=p.rol_id
    JOIN public.unidades_operativas u ON u.id=p.unidad_id
    WHERE r.codigo='SANITARIO' AND u.codigo='RIO-BLANCO' AND p.activo
    ORDER BY p.created_at LIMIT 1;
  SELECT s.id INTO STRICT v_animal
    FROM public.semovientes s JOIN public.unidades_operativas u ON u.id=s.unidad_id
    WHERE u.codigo='RIO-BLANCO' AND s.codigo='007' AND s.estado='Activo';
  PERFORM set_config('rio_blanco184.supervisor',v_supervisor::text,true);
  PERFORM set_config('rio_blanco184.operador',v_operador::text,true);
  PERFORM set_config('rio_blanco184.sanitario',v_sanitario::text,true);
  PERFORM set_config('rio_blanco184.animal',v_animal::text,true);
END $$;

SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_persona record;
  v_error text;
BEGIN
  FOR v_persona IN SELECT * FROM (VALUES
    ('supervisor',current_setting('rio_blanco184.supervisor')),
    ('operador',current_setting('rio_blanco184.operador')),
    ('sanitario',current_setting('rio_blanco184.sanitario'))
  ) AS t(tipo,usuario) LOOP
    PERFORM set_config('request.jwt.claim.sub',v_persona.usuario,true);
    BEGIN
      INSERT INTO public.controles_reproductivos(
        semoviente_id,tipo_evento,fecha_evento,responsable_reproductivo,resultado,detalle
      ) VALUES (
        current_setting('rio_blanco184.animal')::bigint,
        'seguimiento',(CURRENT_TIMESTAMP AT TIME ZONE 'America/La_Paz')::date,
        'Responsable ficticio RIO_BLANCO','Sin novedad','RIO_BLANCO-184-NEGATIVA-'||v_persona.tipo
      );
      RAISE EXCEPTION 'FALLO DE SEGURIDAD: % pudo insertar',v_persona.tipo;
    EXCEPTION WHEN insufficient_privilege THEN
      GET STACKED DIAGNOSTICS v_error=MESSAGE_TEXT;
      IF position('row-level security' IN lower(v_error))=0 THEN
        RAISE EXCEPTION 'Denegacion por otro motivo, no RLS (%): %',v_persona.tipo,v_error;
      END IF;
    END;
    PERFORM set_config('rio_blanco184.denegado_'||v_persona.tipo,'SI',true);
  END LOOP;
END $$;

SELECT
  current_setting('rio_blanco184.denegado_supervisor',true) AS supervisor_bloqueado,
  current_setting('rio_blanco184.denegado_operador',true) AS operador_bloqueado,
  current_setting('rio_blanco184.denegado_sanitario',true) AS sanitario_bloqueado;
RESET ROLE;
ROLLBACK;

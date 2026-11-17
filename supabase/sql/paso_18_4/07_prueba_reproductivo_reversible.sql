-- RIO_BLANCO | PASO 18.4 | 07 - PRUEBA POSITIVA DE REPRODUCTIVO + AISLAMIENTO
-- REQUISITO: usuario auth con perfil REPRODUCTIVO activo en RIO-BLANCO.
-- Crea UN animal ficticio de MAMORE en esta transaccion para probar bloqueo.
-- Si todo es correcto, arroja 1 control / 1 evento / bloqueo SI y hace ROLLBACK.
-- Corrige la prueba: un animal de MAMORE oculto por RLS puede producir 23514
-- desde el trigger (invisible al consultar semovientes), antes del INSERT RLS.
BEGIN;
DO $$
DECLARE
  v_reproductivo uuid;
  v_animal bigint;
  v_otra_unidad bigint;
  v_otro_animal bigint;
BEGIN
  SELECT p.id INTO v_reproductivo
  FROM public.perfiles p JOIN public.roles_sistema r ON r.id=p.rol_id
  JOIN public.unidades_operativas u ON u.id=p.unidad_id
  WHERE r.codigo='REPRODUCTIVO' AND u.codigo='RIO-BLANCO' AND p.activo
  ORDER BY p.created_at LIMIT 1;
  IF v_reproductivo IS NULL THEN
    RAISE EXCEPTION 'No existe perfil REPRODUCTIVO activo de RIO-BLANCO. Ejecute 06 tras crear Auth user.';
  END IF;
  SELECT s.id INTO v_animal
  FROM public.semovientes s JOIN public.unidades_operativas u ON u.id=s.unidad_id
  WHERE u.codigo='RIO-BLANCO' AND s.codigo='007' AND s.estado='Activo';
  IF v_animal IS NULL THEN
    RAISE EXCEPTION 'No existe el semoviente 007 activo de RIO-BLANCO.';
  END IF;
  SELECT id INTO v_otra_unidad FROM public.unidades_operativas WHERE codigo='MAMORE';
  IF v_otra_unidad IS NULL THEN RAISE EXCEPTION 'Falta unidad MAMORE'; END IF;
  INSERT INTO public.semovientes(unidad_id,codigo,especie,categoria,sexo,fecha_ingreso,observaciones)
  VALUES(v_otra_unidad,'RIO_BLANCO-184-OTRA-UNIDAD','bovino','Ternero','Macho',
         (CURRENT_TIMESTAMP AT TIME ZONE 'America/La_Paz')::date,
         'Animal de otra unidad, ficticio, ROLLBACK')
  RETURNING id INTO v_otro_animal;
  -- Verificacion privilegiada: el animal ficticio existe y esta activo.
  -- La consulta posterior como REPRODUCTIVO debe ocultarlo por RLS.
  IF NOT EXISTS (
    SELECT 1 FROM public.semovientes
    WHERE id=v_otro_animal AND unidad_id=v_otra_unidad AND estado='Activo'
  ) THEN
    RAISE EXCEPTION 'El semoviente ficticio de MAMORE no quedo activo. Prueba cancelada.';
  END IF;
  PERFORM set_config('rio_blanco184.usuario',v_reproductivo::text,true);
  PERFORM set_config('rio_blanco184.animal',v_animal::text,true);
  PERFORM set_config('rio_blanco184.animal_otra_unidad',v_otro_animal::text,true);
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('rio_blanco184.usuario'),true);
DO $$
DECLARE v_id bigint;
BEGIN
  INSERT INTO public.controles_reproductivos(
    semoviente_id,tipo_evento,fecha_evento,responsable_reproductivo,resultado,detalle
  ) VALUES (
    current_setting('rio_blanco184.animal')::bigint,
    'seguimiento',(CURRENT_TIMESTAMP AT TIME ZONE 'America/La_Paz')::date,
    'Responsable ficticio RIO_BLANCO','Sin novedad','RIO_BLANCO-184-PRUEBA-REPRODUCTIVO'
  ) RETURNING id INTO v_id;
  PERFORM set_config('rio_blanco184.control_id',v_id::text,true);
END $$;
RESET ROLE;

-- Consulta posterior separada: la misma instruccion INSERT no ve necesariamente
-- los efectos de los triggers en una consulta CTE simultanea.
SELECT
  (SELECT count(*) FROM public.controles_reproductivos
   WHERE id=current_setting('rio_blanco184.control_id')::bigint) AS controles_insertados,
  (SELECT count(*) FROM public.semoviente_eventos
   WHERE origen_modulo='reproduccion'
     AND origen_registro_id=current_setting('rio_blanco184.control_id')) AS eventos_creados;

DO $$
DECLARE v_controles integer; v_eventos integer;
BEGIN
  SELECT count(*) INTO v_controles FROM public.controles_reproductivos
    WHERE id=current_setting('rio_blanco184.control_id')::bigint;
  SELECT count(*) INTO v_eventos FROM public.semoviente_eventos
    WHERE origen_modulo='reproduccion'
      AND origen_registro_id=current_setting('rio_blanco184.control_id');
  IF v_controles<>1 OR v_eventos<>1 THEN
    RAISE EXCEPTION 'Integracion fallida: control %, evento %',v_controles,v_eventos;
  END IF;
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('rio_blanco184.usuario'),true);
DO $$
DECLARE
  v_error text;
  v_estado text;
  v_bloqueado boolean := false;
BEGIN
  -- Primero comprobamos que RLS SELECT oculta el animal de MAMORE.
  -- Si la cuenta lo ve, no se aceptara 23514 como prueba de aislamiento.
  IF EXISTS (
    SELECT 1 FROM public.semovientes
    WHERE id=current_setting('rio_blanco184.animal_otra_unidad')::bigint
  ) THEN
    RAISE EXCEPTION 'FALLO DE AISLAMIENTO: el reproductivo puede consultar el animal de MAMORE';
  END IF;

  BEGIN
    INSERT INTO public.controles_reproductivos(
      semoviente_id,tipo_evento,fecha_evento,responsable_reproductivo,resultado,detalle
    ) VALUES (
      current_setting('rio_blanco184.animal_otra_unidad')::bigint,
      'seguimiento',(CURRENT_TIMESTAMP AT TIME ZONE 'America/La_Paz')::date,
      'Responsable ficticio RIO_BLANCO','Sin novedad','RIO_BLANCO-184-INTENTO-OTRA-UNIDAD'
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error=MESSAGE_TEXT, v_estado=RETURNED_SQLSTATE;
    -- Ambas denegaciones son validas si se comprobo que el animal esta oculto:
    -- 42501 = RLS rechaza INSERT; 23514 = el trigger no ve al animal por RLS.
    IF (v_estado='42501' AND position('row-level security' IN lower(v_error))>0)
       OR (v_estado='23514' AND v_error='El animal debe existir y estar activo') THEN
      v_bloqueado := true;
    ELSE
      RAISE;
    END IF;
  END;

  IF NOT v_bloqueado THEN
    RAISE EXCEPTION 'FALLO DE SEGURIDAD: el reproductivo inserto en MAMORE';
  END IF;
  PERFORM set_config('rio_blanco184.otra_unidad_bloqueada','SI',true);
END $$;
RESET ROLE;
SELECT
  current_setting('rio_blanco184.otra_unidad_bloqueada',true) AS otra_unidad_bloqueada;
ROLLBACK;

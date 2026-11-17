-- RIO_BLANCO | PASO 18.3 | 05 - PRUEBA ADMINISTRATIVA REVERSIBLE
-- Ejecutar SOLO en Supabase SQL Editor de DEMOSTRACION.
-- Inserta un seguimiento ficticio temporal para el animal 007 de RIO-BLANCO,
-- confirma que el trigger crea 1 evento, y siempre finaliza con ROLLBACK.
-- No prueba aun privilegios de INSERT con una sesion de React.
BEGIN;

DO $$
DECLARE
  v_animal bigint;
  v_usuario uuid;
  v_control bigint;
BEGIN
  SELECT s.id INTO v_animal
  FROM public.semovientes s
  JOIN public.unidades_operativas u ON u.id = s.unidad_id
  WHERE s.codigo = '007' AND u.codigo = 'RIO-BLANCO' AND s.estado = 'Activo'
  ORDER BY s.id LIMIT 1;

  SELECT p.id INTO v_usuario
  FROM public.perfiles p
  WHERE p.activo = TRUE
    AND p.unidad_id = (SELECT id FROM public.unidades_operativas WHERE codigo = 'RIO-BLANCO')
  ORDER BY p.created_at LIMIT 1;

  IF v_animal IS NULL OR v_usuario IS NULL THEN
    RAISE EXCEPTION 'No se encontro el semoviente 007 activo o un perfil de prueba de RIO-BLANCO.';
  END IF;

  INSERT INTO public.controles_reproductivos (
    semoviente_id, tipo_evento, fecha_evento,
    responsable_reproductivo, resultado, detalle, registrado_por
  ) VALUES (
    v_animal, 'seguimiento',
    (CURRENT_TIMESTAMP AT TIME ZONE 'America/La_Paz')::date,
    'Responsable ficticio RIO_BLANCO', 'Sin novedad - prueba',
    'RIO_BLANCO-183-PRUEBA-REVERSIBLE', v_usuario
  ) RETURNING id INTO v_control;

  PERFORM set_config('rio_blanco183.control_id', v_control::text, true);
END $$;

-- Esta consulta ocurre DESPUES del INSERT, en una instruccion separada.
SELECT
  (SELECT COUNT(*) FROM public.controles_reproductivos r
   WHERE r.id = current_setting('rio_blanco183.control_id')::bigint) AS controles_temporales,
  (SELECT COUNT(*) FROM public.semoviente_eventos e
   WHERE e.origen_modulo = 'reproduccion'
     AND e.origen_registro_id = current_setting('rio_blanco183.control_id')) AS eventos_temporales;

DO $$
DECLARE v_controles integer; v_eventos integer;
BEGIN
  SELECT COUNT(*) INTO v_controles FROM public.controles_reproductivos
   WHERE id = current_setting('rio_blanco183.control_id')::bigint;
  SELECT COUNT(*) INTO v_eventos FROM public.semoviente_eventos
   WHERE origen_modulo = 'reproduccion'
     AND origen_registro_id = current_setting('rio_blanco183.control_id');
  IF v_controles <> 1 OR v_eventos <> 1 THEN
    RAISE EXCEPTION 'Integracion incorrecta: controles %, eventos %', v_controles, v_eventos;
  END IF;
END $$;

ROLLBACK;

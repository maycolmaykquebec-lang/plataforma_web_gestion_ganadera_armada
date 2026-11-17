-- RIO_BLANCO | PASO 17.3 | PRUEBA OPCIONAL reversible de un control sanitario.
-- Ejecutar SOLO en Supabase SQL Editor con permisos administrativos.
-- NO ejecutarlo desde el navegador ni reutilizarlo como codigo de produccion.
-- Requiere un semoviente de prueba activo en RIO BLANCO y el Operador de Prueba.
-- Verifica que el trigger crea un evento; SIEMPRE termina con ROLLBACK.
BEGIN;

DO $$
DECLARE
  v_animal bigint;
  v_usuario uuid;
  v_control bigint;
  v_total integer;
BEGIN
  SELECT s.id INTO v_animal
  FROM public.semovientes s
  JOIN public.unidades_operativas u ON u.id = s.unidad_id
  WHERE u.codigo = 'RIO-BLANCO' AND s.estado = 'Activo'
  ORDER BY s.id
  LIMIT 1;

  IF v_animal IS NULL THEN
    RAISE EXCEPTION 'No existe animal activo de prueba en RIO BLANCO. No se inserto nada.';
  END IF;

  SELECT p.id INTO STRICT v_usuario
  FROM public.perfiles p
  JOIN public.roles_sistema r ON r.id = p.rol_id
  JOIN public.unidades_operativas u ON u.id = p.unidad_id
  WHERE p.nombre_completo = 'Operador de Prueba'
    AND p.activo = true AND r.codigo = 'OPERADOR' AND u.codigo = 'RIO-BLANCO';

  INSERT INTO public.controles_sanitarios (
    semoviente_id, tipo_control, fecha_control, responsable_sanitario,
    motivo, registrado_por
  ) VALUES (
    v_animal, 'Revisión',
    (CURRENT_TIMESTAMP AT TIME ZONE 'America/La_Paz')::date,
    'Profesional de prueba RIO_BLANCO',
    'RIO_BLANCO-173-PRUEBA-REVERSIBLE', v_usuario
  ) RETURNING id INTO v_control;

  SELECT COUNT(*) INTO v_total
  FROM public.semoviente_eventos
  WHERE origen_modulo = 'sanidad'
    AND origen_registro_id = v_control::text
    AND tipo_evento = 'sanitario';

  IF v_total <> 1 THEN
    RAISE EXCEPTION 'ERROR: se esperaban 1 acontecimiento; se detectaron %', v_total;
  END IF;

  RAISE NOTICE 'PRUEBA CORRECTA: control % genero 1 evento, ambos reversibles.', v_control;
END $$;

SELECT
  (SELECT COUNT(*) FROM public.controles_sanitarios
   WHERE motivo = 'RIO_BLANCO-173-PRUEBA-REVERSIBLE') AS controles_temporales,
  (SELECT COUNT(*) FROM public.semoviente_eventos
   WHERE origen_modulo = 'sanidad'
     AND detalle = 'RIO_BLANCO-173-PRUEBA-REVERSIBLE') AS eventos_temporales;

ROLLBACK;

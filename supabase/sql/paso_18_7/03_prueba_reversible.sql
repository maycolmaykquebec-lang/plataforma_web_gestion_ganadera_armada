-- RIO_BLANCO | PASO 18.7 | 03 - Prueba de rechazo para el bovino 007 (Ternero).
-- SQL Editor administrativo; NO simula permisos RLS de un usuario final.
-- Solo prueba que PostgreSQL RECHAZA una monta para el Ternero 007.
-- NO modifica ni borra registros existentes. La transacción finaliza con ROLLBACK.
BEGIN;
DO $$
DECLARE
  v_animal bigint;
  v_rechazado boolean := false;
  v_mensaje text;
BEGIN
  SELECT s.id INTO v_animal FROM public.semovientes s
  JOIN public.unidades_operativas u ON s.unidad_id=u.id
  WHERE u.codigo='RIO-BLANCO' AND s.codigo='007'
    AND s.especie='bovino' AND lower(btrim(s.categoria))='ternero'
  ORDER BY s.id LIMIT 1;
  IF v_animal IS NULL THEN
    RAISE EXCEPTION 'No se halló el bovino 007 clasificado como Ternero: no se probó el caso';
  END IF;

  BEGIN
    INSERT INTO public.controles_reproductivos
      (semoviente_id, tipo_evento, fecha_evento,
       responsable_reproductivo, resultado, detalle)
    VALUES
      (v_animal, 'monta',
       (CURRENT_TIMESTAMP AT TIME ZONE 'America/La_Paz')::date,
       'Responsable de prueba RIO_BLANCO', 'Sin novedad', 'RIO_BLANCO-187-PRUEBA-REVERSIBLE');
  EXCEPTION WHEN SQLSTATE '23514' THEN
    GET STACKED DIAGNOSTICS v_mensaje = MESSAGE_TEXT;
    IF position('Clasificación Ternero/Ternera:' IN v_mensaje) > 0 THEN
      v_rechazado := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT v_rechazado THEN
    RAISE EXCEPTION 'VALIDACION INSUFICIENTE: la monta no fue bloqueada';
  END IF;
  RAISE NOTICE 'PRUEBA APROBADA: monta para Ternero bloqueada por 18.7';
END $$;
ROLLBACK;

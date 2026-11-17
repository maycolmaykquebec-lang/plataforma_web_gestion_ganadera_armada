-- RIO_BLANCO | PASO 16.5 | PRUEBA OPCIONAL DE AISLAMIENTO DE LECTURA
-- Requisitos: perfiles activos 'Supervisor de Prueba' y 'Operador de Prueba',
-- roles SUP_DEPTO_VII y OPERADOR y unidades MAMORE, TAMARINERO, RIO-BLANCO.
-- Se crean TRES animales ficticios y TRES eventos, SOLO DENTRO DE LA TRANSACCION.
-- Al finalizar, ROLLBACK revierte todos los datos de prueba.
-- Usar exclusivamente en entorno de pruebas.

BEGIN;

DO $$
DECLARE
  v_operador uuid;
  v_supervisor uuid;
BEGIN
  SELECT p.id INTO STRICT v_operador
  FROM public.perfiles p
  JOIN public.roles_sistema r ON r.id = p.rol_id
  JOIN public.unidades_operativas u ON u.id = p.unidad_id
  WHERE p.nombre_completo = 'Operador de Prueba'
    AND r.codigo = 'OPERADOR'
    AND u.codigo = 'RIO-BLANCO'
    AND p.activo = true;

  SELECT p.id INTO STRICT v_supervisor
  FROM public.perfiles p
  JOIN public.roles_sistema r ON r.id = p.rol_id
  WHERE p.nombre_completo = 'Supervisor de Prueba'
    AND r.codigo = 'SUP_DEPTO_VII'
    AND p.activo = true;

  PERFORM set_config('rio_blanco.test_operador_165', v_operador::text, true);
  PERFORM set_config('rio_blanco.test_supervisor_165', v_supervisor::text, true);

  IF (SELECT count(*) FROM public.unidades_operativas
      WHERE codigo IN ('MAMORE','TAMARINERO','RIO-BLANCO')) <> 3 THEN
    RAISE EXCEPTION 'Faltan unidades de prueba';
  END IF;
END $$;

INSERT INTO public.semovientes (
  unidad_id, codigo, especie, categoria, sexo, fecha_ingreso, observaciones
)
SELECT u.id, 'RIO_BLANCO-165-' || u.codigo, 'bovino', 'Ternero', 'Macho', CURRENT_DATE,
       'Registro ficticio: paso 16.5'
FROM public.unidades_operativas u
WHERE u.codigo IN ('MAMORE','TAMARINERO','RIO-BLANCO');

-- Insertion administrativa en prueba; las sesiones de usuario NO pueden insertar eventos.
INSERT INTO public.semoviente_eventos (
  semoviente_id, tipo_evento, fecha_evento, titulo, detalle,
  origen_modulo, registrado_por
)
SELECT s.id, 'observacion', now(), 'RIO_BLANCO-165-EVENTO-PRUEBA',
       'Acontecimiento ficticio, no permanente', 'historial',
       current_setting('rio_blanco.test_operador_165')::uuid
FROM public.semovientes s
WHERE s.codigo LIKE 'RIO_BLANCO-165-%';

DO $$
BEGIN
  IF (SELECT count(*) FROM public.semoviente_eventos
      WHERE titulo = 'RIO_BLANCO-165-EVENTO-PRUEBA') <> 3 THEN
    RAISE EXCEPTION 'No se pudieron crear los 3 eventos ficticios';
  END IF;
END $$;

CREATE TEMP TABLE rio_blanco_resultado_165 (
  perfil text,
  eventos_visibles integer
) ON COMMIT DROP;
GRANT SELECT, INSERT ON rio_blanco_resultado_165 TO authenticated;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('rio_blanco.test_supervisor_165'), true);
INSERT INTO rio_blanco_resultado_165
SELECT 'Supervisor Departamento VII', count(*)::integer
FROM public.semoviente_eventos
WHERE titulo = 'RIO_BLANCO-165-EVENTO-PRUEBA';

SELECT set_config('request.jwt.claim.sub', current_setting('rio_blanco.test_operador_165'), true);
INSERT INTO rio_blanco_resultado_165
SELECT 'Operador Rio Blanco', count(*)::integer
FROM public.semoviente_eventos
WHERE titulo = 'RIO_BLANCO-165-EVENTO-PRUEBA';

RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM rio_blanco_resultado_165
    WHERE perfil = 'Supervisor Departamento VII' AND eventos_visibles = 3
  ) OR NOT EXISTS (
    SELECT 1 FROM rio_blanco_resultado_165
    WHERE perfil = 'Operador Rio Blanco' AND eventos_visibles = 1
  ) THEN
    RAISE EXCEPTION 'Prueba RLS incorrecta: revisar los resultados';
  END IF;
  RAISE NOTICE 'PRUEBA CORRECTA: Supervisor 3, Operador 1';
END $$;

SELECT * FROM rio_blanco_resultado_165 ORDER BY perfil;

ROLLBACK;

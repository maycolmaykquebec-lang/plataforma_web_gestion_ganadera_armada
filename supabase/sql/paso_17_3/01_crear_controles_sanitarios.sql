-- RIO_BLANCO | PASO 17.3 | Tabla de control sanitario e integracion con el historial
-- EJECUTAR SOLO EN SUPABASE SQL EDITOR (entorno de desarrollo).
-- Este script NO habilita INSERT/UPDATE/DELETE para clientes autenticados.
-- NO contiene registros reales ni registros ficticios permanentes.
-- Ejecutar una sola vez: si la tabla ya existe, se detiene sin sobrescribirla.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.semovientes') IS NULL THEN
    RAISE EXCEPTION 'Falta public.semovientes. Instalacion cancelada.';
  END IF;

  IF to_regclass('public.semoviente_eventos') IS NULL THEN
    RAISE EXCEPTION 'Falta public.semoviente_eventos (PASO 16.5). Instalacion cancelada.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'private') THEN
    RAISE EXCEPTION 'Falta el esquema private. Instalacion cancelada.';
  END IF;

  IF to_regclass('public.controles_sanitarios') IS NOT NULL THEN
    RAISE EXCEPTION 'La tabla public.controles_sanitarios ya existe. Revisar antes de reinstalar.';
  END IF;
END;
$$;

CREATE TABLE public.controles_sanitarios (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  semoviente_id       bigint NOT NULL
                        REFERENCES public.semovientes(id) ON DELETE RESTRICT,
  tipo_control        varchar(32) NOT NULL
                        CONSTRAINT controles_sanitarios_tipo_check CHECK (
                          tipo_control IN (
                            'Vacunación', 'Desparasitación', 'Diagnóstico',
                            'Tratamiento', 'Revisión', 'Control preventivo'
                          )
                        ),
  fecha_control       date NOT NULL,
  responsable_sanitario varchar(120) NOT NULL
                        CONSTRAINT controles_sanitarios_responsable_check CHECK (
                          length(btrim(responsable_sanitario)) BETWEEN 3 AND 120
                        ),
  motivo              text NOT NULL
                        CONSTRAINT controles_sanitarios_motivo_check CHECK (
                          length(btrim(motivo)) BETWEEN 5 AND 2000
                        ),
  diagnostico         text
                        CONSTRAINT controles_sanitarios_diagnostico_check CHECK (
                          diagnostico IS NULL OR length(diagnostico) <= 2000
                        ),
  producto            varchar(160),
  dosis               numeric(12,3)
                        CONSTRAINT controles_sanitarios_dosis_check CHECK (
                          dosis IS NULL OR dosis > 0
                        ),
  unidad_dosis        varchar(16)
                        CONSTRAINT controles_sanitarios_unidad_dosis_check CHECK (
                          unidad_dosis IS NULL OR unidad_dosis IN ('mL','mg','UI','dosis')
                        ),
  via_administracion  varchar(120),
  lote_producto       varchar(160),
  proximo_control     date,
  observaciones       text
                        CONSTRAINT controles_sanitarios_observaciones_check CHECK (
                          observaciones IS NULL OR length(observaciones) <= 2000
                        ),
  registrado_por      uuid NOT NULL DEFAULT auth.uid()
                        REFERENCES auth.users(id),
  registrado_en       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT controles_sanitarios_producto_obligatorio_check CHECK (
    tipo_control NOT IN ('Vacunación', 'Desparasitación', 'Tratamiento')
    OR (producto IS NOT NULL AND length(btrim(producto)) > 0)
  ),
  CONSTRAINT controles_sanitarios_producto_no_vacio_check CHECK (
    producto IS NULL OR length(btrim(producto)) > 0
  ),
  CONSTRAINT controles_sanitarios_dosis_y_unidad_check CHECK (
    (dosis IS NULL AND unidad_dosis IS NULL)
    OR (dosis IS NOT NULL AND unidad_dosis IS NOT NULL)
  ),
  CONSTRAINT controles_sanitarios_proximo_control_check CHECK (
    proximo_control IS NULL OR proximo_control >= fecha_control
  )
);

COMMENT ON TABLE public.controles_sanitarios IS
  'RIO_BLANCO: intervenciones veterinarias. Escritura cerrada hasta habilitar autorizacion por rol y unidad en PASO 17.4.';
COMMENT ON COLUMN public.controles_sanitarios.registrado_por IS
  'Cuenta de Supabase Auth que registra el control; diferente del nombre del responsable sanitario.';
COMMENT ON COLUMN public.controles_sanitarios.fecha_control IS
  'Fecha de la intervencion; no incluye hora real de aplicacion.';

CREATE INDEX controles_sanitarios_animal_fecha_idx
  ON public.controles_sanitarios (semoviente_id, fecha_control DESC, id DESC);
CREATE INDEX controles_sanitarios_tipo_fecha_idx
  ON public.controles_sanitarios (tipo_control, fecha_control DESC);
CREATE INDEX controles_sanitarios_registrador_idx
  ON public.controles_sanitarios (registrado_por, registrado_en DESC);

-- Evitar fechas de intervencion futuras con comprobacion dinamica.
CREATE FUNCTION private.rio_blanco_173_validar_control_sanitario()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.fecha_control > (CURRENT_TIMESTAMP AT TIME ZONE 'America/La_Paz')::date THEN
    RAISE EXCEPTION 'La fecha del control sanitario no puede ser futura'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.rio_blanco_173_validar_control_sanitario()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_rio_blanco_173_validar_control_sanitario
  BEFORE INSERT OR UPDATE ON public.controles_sanitarios
  FOR EACH ROW EXECUTE FUNCTION private.rio_blanco_173_validar_control_sanitario();

-- Cada nuevo control genera EXACTAMENTE un evento en el historial.
-- No es invocable como RPC desde public; el trigger se activa en la misma transaccion.
-- El timestamp del evento se deriva de fecha_control a las 00:00 en Bolivia:
-- NO debe presentarse como hora real de la intervencion en la interfaz.
CREATE FUNCTION private.rio_blanco_173_publicar_control_sanitario()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.semoviente_eventos (
    semoviente_id, tipo_evento, fecha_evento, titulo, detalle,
    origen_modulo, origen_registro_id, datos_adicionales, registrado_por
  ) VALUES (
    NEW.semoviente_id,
    'sanitario',
    NEW.fecha_control::timestamp AT TIME ZONE 'America/La_Paz',
    'Control sanitario: ' || NEW.tipo_control,
    NEW.motivo,
    'sanidad',
    NEW.id::text,
    jsonb_strip_nulls(jsonb_build_object(
      'control_sanitario_id', NEW.id,
      'tipo_control', NEW.tipo_control,
      'fecha_control', NEW.fecha_control,
      'responsable_sanitario', NEW.responsable_sanitario,
      'responsable', NEW.responsable_sanitario, -- compatibilidad con tabla del PASO 17.1
      'diagnostico', NEW.diagnostico,
      'producto', NEW.producto,
      'tratamiento', NEW.producto, -- compatibilidad con tabla del PASO 17.1
      'dosis', NEW.dosis,
      'unidad_dosis', NEW.unidad_dosis,
      'via_administracion', NEW.via_administracion,
      'lote_producto', NEW.lote_producto,
      'proximo_control', NEW.proximo_control,
      'observaciones', NEW.observaciones
    )),
    NEW.registrado_por
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.rio_blanco_173_publicar_control_sanitario()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_rio_blanco_173_publicar_control_sanitario
  AFTER INSERT ON public.controles_sanitarios
  FOR EACH ROW EXECUTE FUNCTION private.rio_blanco_173_publicar_control_sanitario();

-- Dos barreras de acceso: privilegios + RLS.
ALTER TABLE public.controles_sanitarios ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.controles_sanitarios FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.controles_sanitarios TO authenticated;

-- Solo puede leer un control quien pueda consultar el animal segun la
-- politica ya existente de public.semovientes. No concede lectura transversal.
CREATE POLICY controles_sanitarios_lectura_por_animal
ON public.controles_sanitarios
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.semovientes s
    WHERE s.id = controles_sanitarios.semoviente_id
  )
);

-- NO hay politica de INSERT, UPDATE ni DELETE.
-- El PASO 17.4 definira que roles y unidades pueden escribir, y como.
COMMIT;

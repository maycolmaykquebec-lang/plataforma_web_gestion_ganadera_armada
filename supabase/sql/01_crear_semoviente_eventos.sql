-- RIO_BLANCO | PASO 16.5 | Estructura de acontecimientos del historial individual
-- Ejecutar UNA VEZ desde Supabase SQL Editor (con permisos de administrador).
-- No inserta semovientes ni acontecimientos; no altera tablas existentes.
-- IMPORTANTE: no habilita INSERT, UPDATE ni DELETE para clientes.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.semovientes') IS NULL THEN
    RAISE EXCEPTION 'No existe public.semovientes. Detenido sin cambios.';
  END IF;

  IF to_regclass('public.semoviente_eventos') IS NOT NULL THEN
    RAISE EXCEPTION 'public.semoviente_eventos ya existe. Revisar antes de repetir la instalación.';
  END IF;
END;
$$;

CREATE TABLE public.semoviente_eventos (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  semoviente_id      bigint NOT NULL
                       REFERENCES public.semovientes(id) ON DELETE RESTRICT,
  tipo_evento        text NOT NULL
                       CONSTRAINT semoviente_eventos_tipo_check CHECK (
                         tipo_evento IN (
                           'registro', 'sanitario', 'reproductivo', 'movimiento',
                           'alta', 'baja', 'descarte', 'observacion'
                         )
                       ),
  fecha_evento       timestamptz NOT NULL,
  titulo             varchar(160) NOT NULL
                       CONSTRAINT semoviente_eventos_titulo_check CHECK (
                         length(btrim(titulo)) BETWEEN 3 AND 160
                       ),
  detalle            text,
  origen_modulo      text NOT NULL
                       CONSTRAINT semoviente_eventos_origen_check CHECK (
                         origen_modulo IN (
                           'historial', 'registro', 'sanidad', 'reproduccion',
                           'movimientos', 'altas_bajas', 'descarte'
                         )
                       ),
  origen_registro_id text,
  datos_adicionales  jsonb NOT NULL DEFAULT '{}'::jsonb
                       CONSTRAINT semoviente_eventos_datos_check CHECK (
                         jsonb_typeof(datos_adicionales) = 'object'
                       ),
  registrado_por     uuid NOT NULL DEFAULT auth.uid()
                       REFERENCES auth.users(id),
  registrado_en      timestamptz NOT NULL DEFAULT now()
);

-- El id del semoviente permite vincular la historia sin duplicar la unidad.
CREATE INDEX semoviente_eventos_animal_fecha_idx
  ON public.semoviente_eventos (semoviente_id, fecha_evento DESC, id DESC);

CREATE INDEX semoviente_eventos_tipo_fecha_idx
  ON public.semoviente_eventos (tipo_evento, fecha_evento DESC);

-- Evita repetir acontecimientos generados desde el mismo registro de origen.
CREATE UNIQUE INDEX semoviente_eventos_origen_unico_idx
  ON public.semoviente_eventos (origen_modulo, origen_registro_id)
  WHERE origen_registro_id IS NOT NULL;

-- Los permisos y RLS trabajan juntos: lectura autorizada, escritura cerrada.
ALTER TABLE public.semoviente_eventos ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.semoviente_eventos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.semoviente_eventos TO authenticated;

-- La política de semovientes existente filtra por rol y unidad operativa.
-- Si el usuario NO puede consultar el animal, tampoco verá sus eventos.
CREATE POLICY semoviente_eventos_lectura_por_animal
ON public.semoviente_eventos
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.semovientes AS s
    WHERE s.id = semoviente_eventos.semoviente_id
  )
);

COMMENT ON TABLE public.semoviente_eventos IS
  'RIO_BLANCO: acontecimientos cronologicos asociados a semovientes. Lectura limitada por RLS del animal; escritura reservada para futuros modulos auditados.';
COMMENT ON COLUMN public.semoviente_eventos.registrado_por IS
  'Usuario de Auth que genero el evento; no debe ser enviado manualmente desde el frontend.';
COMMENT ON COLUMN public.semoviente_eventos.origen_registro_id IS
  'Identificador del registro fuente, cuando se integren sanidad, reproduccion, movimientos y otros modulos.';

COMMIT;

-- V4.2 - Cancelación documentada de un traslado APROBADO y NO EJECUTADO.
-- Ejecutar SOLAMENTE una vez, en una copia de prueba y luego en producción tras respaldo.
-- No cancela ninguna solicitud por sí solo: únicamente instala la capacidad.
-- No modifica autorizar_movimiento, confirmar_recepcion, sigha_20320_decidir_traslado ni rb_registrar_baja.
BEGIN;

DO $preparacion$
BEGIN
  IF to_regclass('public.solicitudes_movimientos') IS NULL
     OR to_regclass('public.semovientes') IS NULL
     OR to_regclass('public.rb_auditoria') IS NULL
     OR to_regclass('public.semoviente_eventos') IS NULL THEN
    RAISE EXCEPTION 'V4.2: faltan tablas del esquema institucional; revise la instalación';
  END IF;
  IF to_regprocedure('private.rb_rol_actual()') IS NULL
     OR to_regprocedure('private.rb_puede_consultar_unidad(bigint)') IS NULL THEN
    RAISE EXCEPTION 'V4.2: faltan funciones institucionales de autorización';
  END IF;
  IF to_regprocedure('public.rb_cancelar_traslado_aprobado(bigint,text,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'V4.2 ya parece instalada: no ejecute la migración por segunda vez';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='solicitudes_movimientos'
      AND column_name IN ('cancelado_por','cancelado_en','motivo_cancelacion','referencia_cancelacion')
  ) THEN
    RAISE EXCEPTION 'V4.2: hay columnas de cancelación existentes; revisar antes de modificar';
  END IF;
END
$preparacion$;

-- Los campos originales de autorización se conservan íntegros.
ALTER TABLE public.solicitudes_movimientos
  ADD COLUMN cancelado_por uuid REFERENCES auth.users(id),
  ADD COLUMN cancelado_en timestamptz,
  ADD COLUMN motivo_cancelacion text,
  ADD COLUMN referencia_cancelacion text;

COMMENT ON COLUMN public.solicitudes_movimientos.motivo_cancelacion IS
  'Justificación registrada en la cancelación por el supervisor. No reemplaza el fundamento original de la aprobación';

CREATE FUNCTION public.rb_cancelar_traslado_aprobado(
  p_solicitud_id bigint,
  p_motivo text,
  p_referencia_documental text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $funcion$
DECLARE
  v_usuario uuid;
  v_mov public.solicitudes_movimientos%ROWTYPE;
  v_animal public.semovientes%ROWTYPE;
BEGIN
  v_usuario := auth.uid();
  IF v_usuario IS NULL OR private.rb_rol_actual() IS DISTINCT FROM 'SUP_DEPTO_VII' THEN
    RAISE EXCEPTION 'Solo el Supervisor Departamento VII puede cancelar un traslado aprobado'
      USING ERRCODE='42501';
  END IF;

  IF p_solicitud_id IS NULL OR p_solicitud_id < 1 THEN
    RAISE EXCEPTION 'Solicitud inválida' USING ERRCODE='23514';
  END IF;
  IF p_motivo IS NULL OR char_length(btrim(p_motivo)) NOT BETWEEN 15 AND 1000 THEN
    RAISE EXCEPTION 'Indique un fundamento de cancelación de 15 a 1000 caracteres'
      USING ERRCODE='23514';
  END IF;
  IF p_referencia_documental IS NOT NULL
     AND char_length(p_referencia_documental) > 200 THEN
    RAISE EXCEPTION 'La referencia documental no puede superar 200 caracteres'
      USING ERRCODE='23514';
  END IF;

  -- Asegura que solo una operación resuelva esta solicitud en cada instante.
  SELECT * INTO v_mov
  FROM public.solicitudes_movimientos
  WHERE id = p_solicitud_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró la solicitud de traslado' USING ERRCODE='23514';
  END IF;
  IF NOT (private.rb_puede_consultar_unidad(v_mov.unidad_origen_id)
          AND private.rb_puede_consultar_unidad(v_mov.unidad_destino_id)) THEN
    RAISE EXCEPTION 'Solicitud fuera del ámbito de supervisión' USING ERRCODE='42501';
  END IF;
  IF v_mov.estado IS DISTINCT FROM 'aprobado'
     OR v_mov.fecha_ejecucion IS NOT NULL
     OR v_mov.ejecutado_por IS NOT NULL THEN
    RAISE EXCEPTION 'Solo se puede cancelar un traslado aprobado que aún no ha sido ejecutado'
      USING ERRCODE='23514';
  END IF;

  -- La cancelación solo aplica mientras el animal siga activo y en el origen.
  SELECT * INTO v_animal
  FROM public.semovientes
  WHERE id = v_mov.semoviente_id
  FOR UPDATE;
  IF NOT FOUND OR v_animal.estado IS DISTINCT FROM 'Activo'
     OR v_animal.unidad_id IS DISTINCT FROM v_mov.unidad_origen_id THEN
    RAISE EXCEPTION 'El semoviente ya no está activo en la unidad de origen'
      USING ERRCODE='23514';
  END IF;

  UPDATE public.solicitudes_movimientos
  SET estado = 'cancelado',
      cancelado_por = v_usuario,
      cancelado_en = now(),
      motivo_cancelacion = btrim(p_motivo),
      referencia_cancelacion = nullif(btrim(p_referencia_documental), ''),
      actualizado_en = now()
  WHERE id = p_solicitud_id AND estado = 'aprobado';

  -- Un acontecimiento único queda en el expediente individual del animal.
  INSERT INTO public.semoviente_eventos (
    semoviente_id,tipo_evento,fecha_evento,titulo,detalle,
    origen_modulo,origen_registro_id,datos_adicionales,registrado_por
  ) VALUES (
    v_mov.semoviente_id, 'movimiento', now(),
    'Traslado aprobado cancelado antes de su ejecución', btrim(p_motivo),
    'movimientos', 'solicitud_movimiento:' || p_solicitud_id::text,
    jsonb_build_object(
      'solicitud_id', p_solicitud_id,
      'unidad_origen_id', v_mov.unidad_origen_id,
      'unidad_destino_id', v_mov.unidad_destino_id,
      'estado', 'cancelado',
      'referencia_documental', nullif(btrim(p_referencia_documental), '')
    ), v_usuario
  );

  -- La instalación institucional normalmente audita UPDATE de forma
  -- automática. Si ese trigger no está instalado, registramos una entrada
  -- de auditoría en esta misma transacción. Así evitamos duplicar entradas.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS t
    JOIN pg_catalog.pg_proc AS f ON f.oid=t.tgfoid
    JOIN pg_catalog.pg_namespace AS n ON n.oid=f.pronamespace
    WHERE t.tgrelid='public.solicitudes_movimientos'::regclass
      AND NOT t.tgisinternal AND t.tgenabled IN ('O','A')
      AND n.nspname='private' AND f.proname='rb_auditar_cambio'
  ) THEN
    INSERT INTO public.rb_auditoria
      (actor_id, unidad_id, tabla, registro_id, accion, detalle)
    VALUES
      (v_usuario, v_mov.unidad_origen_id, 'solicitudes_movimientos',
       p_solicitud_id::text, 'UPDATE',
       jsonb_build_object(
         'tipo_operacion', 'cancelacion_traslado_aprobado',
         'solicitud_id', p_solicitud_id,
         'semoviente_id', v_mov.semoviente_id,
         'unidad_origen_id', v_mov.unidad_origen_id,
         'unidad_destino_id', v_mov.unidad_destino_id,
         'estado_anterior', 'aprobado',
         'estado_nuevo', 'cancelado'
       ));
  END IF;

  RETURN p_solicitud_id;
END
$funcion$;

REVOKE ALL ON FUNCTION public.rb_cancelar_traslado_aprobado(bigint,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rb_cancelar_traslado_aprobado(bigint,text,text)
  TO authenticated;

COMMIT;

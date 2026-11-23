-- Cancelación documentada de solicitudes pendientes, sin autorizarlas primero.
-- Requiere la V4.2 (07_cancelar_traslado_aprobado.sql). No cancela datos al instalar.
BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.rb_cancelar_traslado_aprobado(bigint,text,text)') IS NULL
     OR to_regprocedure('private.rb_rol_actual()') IS NULL
     OR to_regprocedure('private.rb_puede_consultar_unidad(bigint)') IS NULL
     OR to_regclass('public.rb_auditoria') IS NULL
     OR to_regclass('public.semoviente_eventos') IS NULL THEN
    RAISE EXCEPTION 'Falta la actualización V4.2 o una dependencia institucional; no se realizó ningún cambio';
  END IF;
  IF to_regprocedure('public.rb_cancelar_traslado_pendiente(bigint,text,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'La cancelación de pendientes ya está instalada; no se hizo ningún cambio';
  END IF;
  IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='public'
      AND table_name='solicitudes_movimientos' AND column_name IN
      ('cancelado_por','cancelado_en','motivo_cancelacion','referencia_cancelacion')) <> 4 THEN
    RAISE EXCEPTION 'Faltan columnas de cancelación de V4.2';
  END IF;
END $$;

CREATE FUNCTION public.rb_cancelar_traslado_pendiente(
  p_solicitud_id bigint, p_motivo text, p_referencia_documental text DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  usuario uuid := auth.uid();
  movimiento public.solicitudes_movimientos%ROWTYPE;
  animal public.semovientes%ROWTYPE;
BEGIN
  IF usuario IS NULL OR private.rb_rol_actual() IS DISTINCT FROM 'SUP_DEPTO_VII' THEN
    RAISE EXCEPTION 'Solo el Supervisor Departamento VII puede cancelar una solicitud pendiente' USING ERRCODE='42501';
  END IF;
  IF p_solicitud_id IS NULL OR p_solicitud_id < 1 THEN
    RAISE EXCEPTION 'Solicitud inválida' USING ERRCODE='23514';
  END IF;
  IF p_motivo IS NULL OR char_length(btrim(p_motivo)) NOT BETWEEN 15 AND 1000 THEN
    RAISE EXCEPTION 'Indique un fundamento de cancelación de 15 a 1000 caracteres' USING ERRCODE='23514';
  END IF;
  IF p_referencia_documental IS NOT NULL AND char_length(p_referencia_documental)>200 THEN
    RAISE EXCEPTION 'La referencia documental no puede superar 200 caracteres' USING ERRCODE='23514';
  END IF;

  SELECT * INTO movimiento FROM public.solicitudes_movimientos WHERE id=p_solicitud_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No se encontró la solicitud de traslado' USING ERRCODE='23514'; END IF;
  IF NOT (private.rb_puede_consultar_unidad(movimiento.unidad_origen_id)
          AND private.rb_puede_consultar_unidad(movimiento.unidad_destino_id)) THEN
    RAISE EXCEPTION 'Solicitud fuera del ámbito de supervisión' USING ERRCODE='42501';
  END IF;
  IF movimiento.estado IS DISTINCT FROM 'pendiente' OR movimiento.fecha_ejecucion IS NOT NULL
     OR movimiento.ejecutado_por IS NOT NULL OR movimiento.fecha_autorizacion IS NOT NULL
     OR movimiento.autorizado_por IS NOT NULL THEN
    RAISE EXCEPTION 'Solo se puede cancelar una solicitud pendiente sin autorizar ni ejecutar' USING ERRCODE='23514';
  END IF;
  SELECT * INTO animal FROM public.semovientes WHERE id=movimiento.semoviente_id FOR UPDATE;
  IF NOT FOUND OR animal.estado IS DISTINCT FROM 'Activo'
     OR animal.unidad_id IS DISTINCT FROM movimiento.unidad_origen_id THEN
    RAISE EXCEPTION 'El semoviente ya no está activo en la unidad de origen' USING ERRCODE='23514';
  END IF;

  UPDATE public.solicitudes_movimientos SET estado='cancelado', cancelado_por=usuario,
    cancelado_en=now(), motivo_cancelacion=btrim(p_motivo),
    referencia_cancelacion=nullif(btrim(p_referencia_documental),''), actualizado_en=now()
  WHERE id=p_solicitud_id AND estado='pendiente';

  INSERT INTO public.semoviente_eventos
    (semoviente_id,tipo_evento,fecha_evento,titulo,detalle,origen_modulo,origen_registro_id,datos_adicionales,registrado_por)
  VALUES (movimiento.semoviente_id,'movimiento',now(),
    'Solicitud de traslado pendiente cancelada',btrim(p_motivo),'movimientos',
    'solicitud_movimiento:'||p_solicitud_id::text,
    jsonb_build_object('solicitud_id',p_solicitud_id,'unidad_origen_id',movimiento.unidad_origen_id,
      'unidad_destino_id',movimiento.unidad_destino_id,'estado','cancelado',
      'referencia_documental',nullif(btrim(p_referencia_documental),'')),usuario);

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger t
    JOIN pg_catalog.pg_proc f ON f.oid=t.tgfoid
    JOIN pg_catalog.pg_namespace n ON n.oid=f.pronamespace
    WHERE t.tgrelid='public.solicitudes_movimientos'::regclass
      AND NOT t.tgisinternal AND t.tgenabled IN ('O','A')
      AND n.nspname='private' AND f.proname='rb_auditar_cambio'
  ) THEN
    INSERT INTO public.rb_auditoria(actor_id,unidad_id,tabla,registro_id,accion,detalle)
    VALUES (usuario,movimiento.unidad_origen_id,'solicitudes_movimientos',p_solicitud_id::text,'UPDATE',
      jsonb_build_object('tipo_operacion','cancelacion_traslado_pendiente','solicitud_id',p_solicitud_id,
        'semoviente_id',movimiento.semoviente_id,'estado_anterior','pendiente','estado_nuevo','cancelado'));
  END IF;
  RETURN p_solicitud_id;
END $$;

REVOKE ALL ON FUNCTION public.rb_cancelar_traslado_pendiente(bigint,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rb_cancelar_traslado_pendiente(bigint,text,text) TO authenticated;
COMMIT;

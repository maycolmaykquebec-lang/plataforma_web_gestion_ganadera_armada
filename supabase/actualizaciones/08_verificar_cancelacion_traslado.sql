-- V4.2 VERIFICACIONES DE SOLO LECTURA. Ejecute en Supabase SQL Editor.
-- Deben existir la función y los cuatro campos. Ninguna instrucción modifica datos.
SELECT
  to_regprocedure('public.rb_cancelar_traslado_aprobado(bigint,text,text)') IS NOT NULL
    AS funcion_instalada,
  (SELECT count(*) = 4 FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name='solicitudes_movimientos'
     AND column_name IN ('cancelado_por','cancelado_en','motivo_cancelacion','referencia_cancelacion'))
    AS columnas_instaladas,
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='public' AND p.proname='rb_cancelar_traslado_aprobado'
            AND has_function_privilege('authenticated',p.oid,'EXECUTE'))
    AS permiso_rpc_autenticado;

-- SEGUNDA CONSULTA: seguimiento de la solicitud 3, inicialmente aprobada.
-- Si se cancela desde el sistema, estado debe ser 'cancelado', con motivo y actor.
SELECT
  m.id AS solicitud_id,
  s.codigo AS codigo_semoviente,
  m.estado,
  origen.nombre AS origen,
  destino.nombre AS destino,
  m.autorizado_por AS autorizador_original,
  m.fecha_autorizacion,
  m.fundamento_decision,
  m.cancelado_por,
  m.cancelado_en,
  m.motivo_cancelacion,
  m.referencia_cancelacion,
  m.fecha_ejecucion
FROM public.solicitudes_movimientos AS m
JOIN public.semovientes AS s ON s.id=m.semoviente_id
JOIN public.unidades_operativas AS origen ON origen.id=m.unidad_origen_id
JOIN public.unidades_operativas AS destino ON destino.id=m.unidad_destino_id
WHERE m.id=3;

-- TERCERA CONSULTA: constancia de auditoría asociada a la solicitud.
SELECT id,fecha,actor_id,tabla,registro_id,accion,detalle
FROM public.rb_auditoria
WHERE tabla='solicitudes_movimientos' AND registro_id='3'
ORDER BY id DESC LIMIT 10;

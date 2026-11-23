-- Solo lectura. Ejecutar después de instalar 11_cancelar_traslado_pendiente.sql.
SELECT
  to_regprocedure('public.rb_cancelar_traslado_aprobado(bigint,text,text)') IS NOT NULL AS cancelacion_aprobados_instalada,
  to_regprocedure('public.rb_cancelar_traslado_pendiente(bigint,text,text)') IS NOT NULL AS cancelacion_pendientes_instalada,
  coalesce(has_function_privilege('authenticated',
    to_regprocedure('public.rb_cancelar_traslado_pendiente(bigint,text,text)'), 'EXECUTE'), false)
    AS permiso_autenticado,
  coalesce(has_function_privilege('anon',
    to_regprocedure('public.rb_cancelar_traslado_pendiente(bigint,text,text)'), 'EXECUTE'), false)
    AS permiso_anonimo;
-- Se espera: true, true, true, false. Los permisos reales también se validan en la función.

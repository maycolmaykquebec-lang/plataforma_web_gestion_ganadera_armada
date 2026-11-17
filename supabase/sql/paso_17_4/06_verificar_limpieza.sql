-- RIO_BLANCO | PASO 17.4 | 06 - VERIFICAR LIMPIEZA (SOLO LECTURA)
SELECT
  (SELECT count(*) FROM public.controles_sanitarios
   WHERE motivo LIKE 'RIO_BLANCO-174-%') AS controles_prueba,
  (SELECT count(*) FROM public.semoviente_eventos
   WHERE origen_modulo='sanidad' AND detalle LIKE 'RIO_BLANCO-174-%') AS eventos_prueba;

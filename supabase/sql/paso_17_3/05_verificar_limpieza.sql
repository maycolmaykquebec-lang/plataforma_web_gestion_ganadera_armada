-- RIO_BLANCO | PASO 17.3 | Ejecutar DESPUES del SQL 04
-- Ambos conteos deben ser 0; no borrar registros manualmente.
SELECT
  (SELECT COUNT(*) FROM public.controles_sanitarios
   WHERE motivo = 'RIO_BLANCO-173-PRUEBA-REVERSIBLE') AS controles_prueba,
  (SELECT COUNT(*) FROM public.semoviente_eventos
   WHERE origen_modulo = 'sanidad'
     AND detalle = 'RIO_BLANCO-173-PRUEBA-REVERSIBLE') AS eventos_prueba;

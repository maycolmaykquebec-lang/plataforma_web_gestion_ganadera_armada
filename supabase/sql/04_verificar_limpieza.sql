-- Verificar al ejecutar la prueba opcional 03.
-- Ambos conteos deben ser 0; nunca borrar datos manualmente.
SELECT
  (SELECT count(*) FROM public.semovientes
   WHERE codigo LIKE 'RIO_BLANCO-165-%') AS animales_prueba,
  (SELECT count(*) FROM public.semoviente_eventos
   WHERE titulo = 'RIO_BLANCO-165-EVENTO-PRUEBA') AS eventos_prueba;

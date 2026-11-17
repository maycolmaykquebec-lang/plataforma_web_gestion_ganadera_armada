-- RIO_BLANCO | PASO 18.4 | 08 - CONFIRMAR LIMPIEZA (SOLO LECTURA)
-- Ejecutar DESPUES del 05 y del 07. Todos los resultados deben ser 0.
SELECT
  (SELECT count(*) FROM public.controles_reproductivos WHERE detalle LIKE 'RIO_BLANCO-184-%') AS controles_prueba,
  (SELECT count(*) FROM public.semoviente_eventos
   WHERE origen_modulo='reproduccion' AND detalle LIKE 'RIO_BLANCO-184-%') AS eventos_prueba,
  (SELECT count(*) FROM public.semovientes WHERE codigo='RIO_BLANCO-184-OTRA-UNIDAD') AS animales_prueba;

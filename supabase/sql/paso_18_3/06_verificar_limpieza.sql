-- RIO_BLANCO | PASO 18.3 | 06 - Confirmar limpieza de la prueba reversible
-- Solo lectura: ambos resultados deben ser 0.
SELECT
 (SELECT COUNT(*) FROM public.controles_reproductivos
  WHERE detalle = 'RIO_BLANCO-183-PRUEBA-REVERSIBLE') AS controles_prueba,
 (SELECT COUNT(*) FROM public.semoviente_eventos
  WHERE origen_modulo = 'reproduccion'
    AND detalle = 'RIO_BLANCO-183-PRUEBA-REVERSIBLE') AS eventos_prueba;

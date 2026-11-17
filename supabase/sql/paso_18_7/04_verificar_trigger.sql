-- RIO_BLANCO | PASO 18.7 | 04 - SOLO LECTURA
SELECT tgname AS trigger, tgenabled AS estado
FROM pg_trigger
WHERE tgrelid='public.controles_reproductivos'::regclass
  AND tgname IN ('trg_rio_blanco_183_validar_control',
                 'trg_rio_blanco_187_validar_categoria_bovina')
  AND NOT tgisinternal
ORDER BY tgname;
-- Esperado: 2 filas con estado O (activado).

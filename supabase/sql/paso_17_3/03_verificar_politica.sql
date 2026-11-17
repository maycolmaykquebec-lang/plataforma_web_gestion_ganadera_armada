-- RIO_BLANCO | PASO 17.3 | Comprobar politica de lectura
SELECT policyname, cmd, roles, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'controles_sanitarios'
ORDER BY policyname;

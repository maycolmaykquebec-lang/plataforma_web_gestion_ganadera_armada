-- RIO_BLANCO | PASO 18.3 | 04 - Politicas de lectura (solo lectura)
SELECT tablename, policyname, cmd, roles, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('controles_reproductivos', 'reproduccion_crias_vinculadas')
ORDER BY tablename, policyname;

-- Esperado: exactamente una politica SELECT por tabla para authenticated.
-- La politica SELECT se apoya en RLS de semovientes. La prueba real de
-- aislamiento entre unidades queda para el PASO 18.4.

-- RIO_BLANCO | PASO 18.3 | 03 - Verificacion de estructura, permisos y triggers
-- Solo lectura. Ejecute DESPUES de instalar 02.
SELECT
  c.relname AS tabla,
  c.relrowsecurity AS rls_activo,
  has_table_privilege('authenticated', c.oid, 'SELECT') AS autenticado_consulta,
  has_table_privilege('authenticated', c.oid, 'INSERT') AS autenticado_inserta,
  has_table_privilege('authenticated', c.oid, 'UPDATE') AS autenticado_modifica,
  has_table_privilege('authenticated', c.oid, 'DELETE') AS autenticado_elimina,
  has_table_privilege('anon', c.oid, 'SELECT') AS anon_consulta,
  (SELECT COUNT(*) FROM pg_trigger t WHERE t.tgrelid = c.oid
     AND NOT t.tgisinternal AND t.tgenabled <> 'D') AS triggers_activos
FROM pg_class c
WHERE c.oid IN ('public.controles_reproductivos'::regclass,
                'public.reproduccion_crias_vinculadas'::regclass)
ORDER BY c.relname;

-- Esperado: ambas tablas con RLS true; SELECT authenticated true;
-- INSERT/UPDATE/DELETE authenticated false; SELECT anon false.
-- Triggers: controles_reproductivos 2; reproduccion_crias_vinculadas 1.

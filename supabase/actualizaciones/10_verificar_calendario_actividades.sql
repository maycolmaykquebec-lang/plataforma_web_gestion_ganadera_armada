-- V4.6 - Verificaciones de solo lectura (sin cambios en los datos)
SELECT to_regclass('public.calendario_actividades') IS NOT NULL AS calendario_instalado;
SELECT policyname, cmd, permissive, roles
FROM pg_policies
WHERE schemaname='public' AND tablename='calendario_actividades'
ORDER BY cmd, policyname;
SELECT has_table_privilege('authenticated', 'public.calendario_actividades', 'SELECT') AS lectura,
       has_table_privilege('authenticated', 'public.calendario_actividades', 'INSERT') AS insercion,
       has_table_privilege('authenticated', 'public.calendario_actividades', 'UPDATE') AS edicion,
       has_table_privilege('authenticated', 'public.calendario_actividades', 'DELETE') AS borrado;
-- La consulta anterior verifica privilegios básicos. El acceso real también depende de las RLS.

-- RIO_BLANCO | PASO 17.4 | 02 - HABILITAR INSERT PARA ROL INSTITUCIONAL SANITARIO
-- EJECUTAR SOLO en Supabase SQL Editor del proyecto DE DEMOSTRACION.
-- Habilita permiso SQL de columnas para 'authenticated', pero RLS solo permite
-- INSERT a perfiles activos SANITARIO, en su propia unidad y animal ACTIVO.
-- No habilita UPDATE/DELETE ni INSERT sobre public.semoviente_eventos.
-- Se detiene si la politica ya existe, sin reemplazarla.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.controles_sanitarios') IS NULL
     OR to_regclass('public.semovientes') IS NULL
     OR to_regclass('public.semoviente_eventos') IS NULL THEN
    RAISE EXCEPTION 'Faltan tablas de los pasos 15/16/17. Instalacion cancelada.';
  END IF;
  IF to_regprocedure('private.rol_actual()') IS NULL
     OR to_regprocedure('private.unidad_actual()') IS NULL THEN
    RAISE EXCEPTION 'Faltan private.rol_actual() o private.unidad_actual().';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.roles_sistema WHERE codigo = 'SANITARIO') THEN
    RAISE EXCEPTION 'El rol SANITARIO no existe en roles_sistema.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'controles_sanitarios'
      AND policyname = 'controles_sanitarios_insert_sanitario_unidad'
  ) THEN
    RAISE EXCEPTION 'La politica INSERT ya existe: no repetir; revisar antes de continuar.';
  END IF;
END $$;

ALTER TABLE public.controles_sanitarios ENABLE ROW LEVEL SECURITY;

-- No se concede escritura sobre los campos de auditoria ni identidad.
-- Si se agrega un GRANT de tabla completa posteriormente, esta proteccion
-- por columnas perderia su eficacia; revisar siempre privilegios totales.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.controles_sanitarios
  FROM PUBLIC, anon, authenticated;

GRANT INSERT (
  semoviente_id, tipo_control, fecha_control, responsable_sanitario,
  motivo, diagnostico, producto, dosis, unidad_dosis,
  via_administracion, lote_producto, proximo_control, observaciones
) ON TABLE public.controles_sanitarios TO authenticated;

CREATE POLICY controles_sanitarios_insert_sanitario_unidad
ON public.controles_sanitarios
FOR INSERT TO authenticated
WITH CHECK (
  (SELECT auth.uid()) IS NOT NULL
  AND (SELECT private.rol_actual()) = 'SANITARIO'
  AND (SELECT private.unidad_actual()) IS NOT NULL
  AND registrado_por = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.semovientes AS s
    WHERE s.id = semoviente_id
      AND s.unidad_id = (SELECT private.unidad_actual())
      AND s.estado = 'Activo'
  )
);

COMMIT;

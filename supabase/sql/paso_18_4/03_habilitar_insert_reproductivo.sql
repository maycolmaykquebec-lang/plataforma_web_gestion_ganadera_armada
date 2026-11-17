-- RIO_BLANCO | PASO 18.4 | 03 - ESCRITURA MINIMA PARA EL PERFIL REPRODUCTIVO
-- Ejecutar solo tras verificar 01 y 02. Modifica privilegios y RLS.
-- NO habilita UPDATE/DELETE, NO permite insertar enlaces de crias desde React.
-- GRANT INSERT de columnas no equivale a autorizacion: RLS exige rol, unidad y animal activo.
BEGIN;
DO $$
BEGIN
  IF to_regclass('public.controles_reproductivos') IS NULL
     OR to_regclass('public.reproduccion_crias_vinculadas') IS NULL
     OR to_regclass('public.semovientes') IS NULL
     OR to_regclass('public.semoviente_eventos') IS NULL THEN
    RAISE EXCEPTION 'Faltan tablas de los pasos 15/16/18.3. Cancelado.';
  END IF;
  IF to_regprocedure('private.rol_actual()') IS NULL
     OR to_regprocedure('private.unidad_actual()') IS NULL THEN
    RAISE EXCEPTION 'Faltan las funciones privadas de rol y unidad.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.roles_sistema WHERE codigo='REPRODUCTIVO') THEN
    RAISE EXCEPTION 'El rol REPRODUCTIVO no existe. Ejecutar primero 02.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='controles_reproductivos' AND cmd='INSERT') THEN
    RAISE EXCEPTION 'Ya existe otra politica INSERT en controles_reproductivos; revisar antes de instalar.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='semovientes' AND policyname='semovientes_lectura_reproductivo_unidad') THEN
    RAISE EXCEPTION 'La politica de lectura REPRODUCTIVO ya existe; no se sobrescribe.';
  END IF;
  IF has_any_column_privilege('authenticated','public.controles_reproductivos','INSERT') THEN
    RAISE EXCEPTION 'Ya existen privilegios de insercion en controles_reproductivos; revisar antes de cambiar.';
  END IF;
END $$;

ALTER TABLE public.semovientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.controles_reproductivos ENABLE ROW LEVEL SECURITY;

-- Permitir al rol institucional REPRODUCTIVO consultar solo semovientes de su unidad.
-- Esta politica no afecta los roles SUP_DEPTO_VII, OPERADOR ni SANITARIO.
CREATE POLICY semovientes_lectura_reproductivo_unidad
ON public.semovientes FOR SELECT TO authenticated
USING (
  (SELECT auth.uid()) IS NOT NULL
  AND (SELECT private.rol_actual()) = 'REPRODUCTIVO'
  AND unidad_id = (SELECT private.unidad_actual())
);

-- No conceder privilegios sobre id ni campos de autoria/auditoria.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.controles_reproductivos FROM PUBLIC, anon, authenticated;
GRANT INSERT (
  semoviente_id, tipo_evento, fecha_evento,
  responsable_reproductivo, resultado, detalle,
  reproductor_codigo, metodo, fecha_parto_probable,
  cantidad_crias, crias_codigos_referencia,
  cantidad_huevos, huevos_fertiles, nacidos_eclosion,
  proximo_control, observaciones
) ON TABLE public.controles_reproductivos TO authenticated;

CREATE POLICY controles_reproductivos_insert_responsable_unidad
ON public.controles_reproductivos FOR INSERT TO authenticated
WITH CHECK (
  (SELECT auth.uid()) IS NOT NULL
  AND (SELECT private.rol_actual()) = 'REPRODUCTIVO'
  AND (SELECT private.unidad_actual()) IS NOT NULL
  AND registrado_por = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.semovientes s
    WHERE s.id = semoviente_id
      AND s.unidad_id = (SELECT private.unidad_actual())
      AND s.estado = 'Activo'
  )
);

-- Vincular crias requiere controles transaccionales propios en una etapa posterior.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.reproduccion_crias_vinculadas FROM PUBLIC, anon, authenticated;
COMMIT;

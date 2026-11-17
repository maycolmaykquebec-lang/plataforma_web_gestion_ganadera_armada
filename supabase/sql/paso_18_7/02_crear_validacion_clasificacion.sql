-- RIO_BLANCO | PASO 18.7 | 02 - Restricción conservadora de clasificación juvenil bovina.
-- EJECUTAR SOLO UNA VEZ luego de validar 01.
-- NO cambia registros históricos; NO elimina datos; NO concede permisos.
-- La categoría Ternero/Ternera no permite crear NUEVOS montas/servicios,
-- inseminaciones, gestaciones, partos o nacimientos sobre ese animal.
-- No impone umbrales de edad generales ni reglas a otras especies.
BEGIN;
DO $$
BEGIN
  IF to_regclass('public.controles_reproductivos') IS NULL
     OR to_regclass('public.semovientes') IS NULL
     OR to_regprocedure('private.rio_blanco_183_validar_control()') IS NULL THEN
    RAISE EXCEPTION 'Faltan los objetos reproductivos de 18.3; no se instaló la validación';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='private' AND p.proname='rio_blanco_187_validar_categoria_bovina'
  ) OR EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid='public.controles_reproductivos'::regclass
      AND tgname='trg_rio_blanco_187_validar_categoria_bovina'
  ) THEN
    RAISE EXCEPTION 'La validación 18.7 ya existe; revisar, no reinstalar';
  END IF;
END $$;

CREATE FUNCTION private.rio_blanco_187_validar_categoria_bovina()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_especie text;
  v_categoria text;
BEGIN
  SELECT especie, categoria INTO v_especie, v_categoria
  FROM public.semovientes WHERE id = NEW.semoviente_id;
  -- La función preexistente 18.3 valida que el animal exista y esté activo.
  -- Si aquí no es visible, nunca debemos autorizar por nuestra cuenta.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El semoviente no está disponible para este usuario'
      USING ERRCODE = '23514';
  END IF;
  IF v_especie = 'bovino'
     AND lower(btrim(coalesce(v_categoria, ''))) IN ('ternero','ternera')
     AND NEW.tipo_evento IN ('monta','inseminacion','gestacion','parto','nacimiento') THEN
    RAISE EXCEPTION 'Clasificación Ternero/Ternera: solo se permite evaluación o seguimiento reproductivo; revise la ficha del animal'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION private.rio_blanco_187_validar_categoria_bovina()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_rio_blanco_187_validar_categoria_bovina
BEFORE INSERT OR UPDATE ON public.controles_reproductivos
FOR EACH ROW
EXECUTE FUNCTION private.rio_blanco_187_validar_categoria_bovina();
COMMIT;

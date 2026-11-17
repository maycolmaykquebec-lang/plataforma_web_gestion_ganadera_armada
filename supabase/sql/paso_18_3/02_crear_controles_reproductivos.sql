-- RIO_BLANCO | PASO 18.3 | 02 - ESTRUCTURA REPRODUCTIVA E HISTORIAL
-- Entorno DE DEMOSTRACION; ejecutar UNA sola vez con Supabase SQL Editor.
-- NO crea datos, NO habilita escritura desde React ni modifica permisos existentes.
-- Si algun objeto principal ya existe, se cancela y revierte la transaccion.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.semovientes') IS NULL OR
     to_regclass('public.semoviente_eventos') IS NULL THEN
    RAISE EXCEPTION 'Faltan las tablas semovientes/semoviente_eventos. Instalacion cancelada.';
  END IF;
  IF to_regclass('public.controles_reproductivos') IS NOT NULL OR
     to_regclass('public.reproduccion_crias_vinculadas') IS NOT NULL THEN
    RAISE EXCEPTION 'Ya existe una tabla reproductiva. Revisar antes de reinstalar; no se sobrescribe.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'private') THEN
    RAISE EXCEPTION 'Falta esquema private. Instalacion cancelada.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'private' AND p.proname IN
             ('rio_blanco_183_validar_control','rio_blanco_183_publicar_historial','rio_blanco_183_validar_cria')) THEN
    RAISE EXCEPTION 'Funciones del paso 18.3 ya existentes. No se sobrescriben.';
  END IF;
END $$;

CREATE TABLE public.controles_reproductivos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  semoviente_id bigint NOT NULL REFERENCES public.semovientes(id) ON DELETE RESTRICT,
  tipo_evento varchar(24) NOT NULL CONSTRAINT reproduccion_tipo_check
    CHECK (tipo_evento IN (
      'monta','inseminacion','gestacion','parto','nacimiento',
      'evaluacion','seguimiento','postura','incubacion','fertilidad','eclosion'
    )),
  fecha_evento date NOT NULL,
  responsable_reproductivo varchar(120) NOT NULL CONSTRAINT reproduccion_responsable_check
    CHECK (length(btrim(responsable_reproductivo)) BETWEEN 3 AND 120),
  resultado varchar(200) NOT NULL CONSTRAINT reproduccion_resultado_check
    CHECK (length(btrim(resultado)) BETWEEN 3 AND 200),
  detalle text NOT NULL CONSTRAINT reproduccion_detalle_check
    CHECK (length(btrim(detalle)) BETWEEN 5 AND 1500),
  reproductor_codigo varchar(80) CONSTRAINT reproduccion_reproductor_codigo_check
    CHECK (reproductor_codigo IS NULL OR length(btrim(reproductor_codigo)) BETWEEN 1 AND 80),
  metodo varchar(150),
  fecha_parto_probable date,
  cantidad_crias integer,
  crias_codigos_referencia text,
  cantidad_huevos integer,
  huevos_fertiles integer,
  nacidos_eclosion integer,
  proximo_control date,
  observaciones text CONSTRAINT reproduccion_observaciones_check
    CHECK (observaciones IS NULL OR length(observaciones) <= 1500),
  registrado_por uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  registrado_en timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT reproduccion_fechas_check CHECK (
    (fecha_parto_probable IS NULL OR fecha_parto_probable >= fecha_evento)
    AND (proximo_control IS NULL OR proximo_control >= fecha_evento)
  ),
  CONSTRAINT reproduccion_fecha_parto_solo_gestacion CHECK (
    fecha_parto_probable IS NULL OR tipo_evento = 'gestacion'
  ),
  CONSTRAINT reproduccion_crias_condicional CHECK (
    (tipo_evento IN ('parto','nacimiento') AND cantidad_crias IS NOT NULL AND cantidad_crias BETWEEN 1 AND 1000)
    OR (tipo_evento NOT IN ('parto','nacimiento') AND cantidad_crias IS NULL)
  ),
  CONSTRAINT reproduccion_huevos_condicional CHECK (
    (tipo_evento IN ('postura','incubacion','fertilidad','eclosion')
      AND cantidad_huevos IS NOT NULL AND cantidad_huevos BETWEEN 1 AND 1000000)
    OR (tipo_evento NOT IN ('postura','incubacion','fertilidad','eclosion')
      AND cantidad_huevos IS NULL AND huevos_fertiles IS NULL AND nacidos_eclosion IS NULL)
  ),
  CONSTRAINT reproduccion_huevos_cantidades_check CHECK (
    (huevos_fertiles IS NULL OR huevos_fertiles BETWEEN 0 AND cantidad_huevos)
    AND (nacidos_eclosion IS NULL OR nacidos_eclosion BETWEEN 0 AND cantidad_huevos)
    AND (huevos_fertiles IS NULL OR nacidos_eclosion IS NULL
         OR nacidos_eclosion <= huevos_fertiles)
  )
);

COMMENT ON TABLE public.controles_reproductivos IS
 'RIO_BLANCO: acontecimientos reproductivos. Solo lectura a clientes; la escritura se habilitara tras RLS en el PASO 18.4.';
COMMENT ON COLUMN public.controles_reproductivos.reproductor_codigo IS
 'Referencia textual declarada; NO acredita parentesco ni identifica un semoviente de manera univoca entre unidades.';
COMMENT ON COLUMN public.controles_reproductivos.crias_codigos_referencia IS
 'Codigos informativos, NO crea animales ni vinculos de parentesco. Los vinculos verificados usan reproduccion_crias_vinculadas.';

CREATE INDEX controles_reproductivos_animal_fecha_idx
  ON public.controles_reproductivos (semoviente_id, fecha_evento DESC, id DESC);
CREATE INDEX controles_reproductivos_tipo_fecha_idx
  ON public.controles_reproductivos (tipo_evento, fecha_evento DESC);

-- Relaciones formales SOLO con crias que ya constan como semovientes registrados.
CREATE TABLE public.reproduccion_crias_vinculadas (
  control_id bigint NOT NULL REFERENCES public.controles_reproductivos(id) ON DELETE RESTRICT,
  cria_id bigint NOT NULL UNIQUE REFERENCES public.semovientes(id) ON DELETE RESTRICT,
  PRIMARY KEY (control_id, cria_id)
);
COMMENT ON TABLE public.reproduccion_crias_vinculadas IS
 'Relacion verificable entre un parto/nacimiento y una cria previamente registrada. No genera altas automaticamente.';

-- Reglas de especie, sexo, estado y fecha que NO dependen del navegador.
CREATE FUNCTION private.rio_blanco_183_validar_control()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_especie text;
  v_sexo text;
  v_estado text;
  v_nacimiento date;
BEGIN
  SELECT s.especie, s.sexo, s.estado, s.fecha_nacimiento
    INTO v_especie, v_sexo, v_estado, v_nacimiento
  FROM public.semovientes AS s WHERE s.id = NEW.semoviente_id;

  IF NOT FOUND OR v_estado <> 'Activo' THEN
    RAISE EXCEPTION 'El animal debe existir y estar activo' USING ERRCODE = '23514';
  END IF;
  IF NEW.fecha_evento > (CURRENT_TIMESTAMP AT TIME ZONE 'America/La_Paz')::date
     OR (v_nacimiento IS NOT NULL AND NEW.fecha_evento < v_nacimiento) THEN
    RAISE EXCEPTION 'Fecha reproductiva fuera del rango permitido' USING ERRCODE = '23514';
  END IF;
  IF (
    (v_especie = 'avicola' AND NEW.tipo_evento NOT IN
      ('postura','incubacion','fertilidad','eclosion','seguimiento'))
    OR (v_especie = 'mular' AND NEW.tipo_evento NOT IN
      ('evaluacion','seguimiento'))
    OR (v_especie IN ('bovino','equino','caprino','porcino') AND NEW.tipo_evento NOT IN
      ('monta','inseminacion','gestacion','parto','nacimiento','evaluacion','seguimiento'))
    OR v_especie NOT IN ('bovino','equino','caprino','mular','avicola','porcino')
  ) THEN
    RAISE EXCEPTION 'Evento reproductivo no aplicable a la especie %', v_especie
      USING ERRCODE = '23514';
  END IF;
  IF v_sexo <> 'Hembra' AND NEW.tipo_evento IN
     ('gestacion','parto','nacimiento','postura') THEN
    RAISE EXCEPTION 'Este acontecimiento requiere un animal registrado como Hembra'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.rio_blanco_183_validar_control() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_rio_blanco_183_validar_control
  BEFORE INSERT OR UPDATE ON public.controles_reproductivos
  FOR EACH ROW EXECUTE FUNCTION private.rio_blanco_183_validar_control();

-- Cada control nuevo crea un unico acontecimiento en la tabla ya utilizada
-- por el Historial Individual. Una fecha sin hora se muestra a medianoche
-- solo como referencia tecnicamente derivada, NO como hora real de campo.
CREATE FUNCTION private.rio_blanco_183_publicar_historial()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.semoviente_eventos (
    semoviente_id, tipo_evento, fecha_evento, titulo, detalle,
    origen_modulo, origen_registro_id, datos_adicionales, registrado_por
  ) VALUES (
    NEW.semoviente_id,
    'reproductivo',
    NEW.fecha_evento::timestamp AT TIME ZONE 'America/La_Paz',
    'Control reproductivo: ' || NEW.tipo_evento,
    NEW.detalle,
    'reproduccion', NEW.id::text,
    jsonb_strip_nulls(jsonb_build_object(
      'control_reproductivo_id', NEW.id,
      'tipo_evento', NEW.tipo_evento,
      'resultado', NEW.resultado,
      'responsable_reproductivo', NEW.responsable_reproductivo,
      'reproductor_codigo_referencia', NEW.reproductor_codigo,
      'metodo', NEW.metodo,
      'fecha_parto_probable', NEW.fecha_parto_probable,
      'cantidad_crias', NEW.cantidad_crias,
      'crias_codigos_referencia', NEW.crias_codigos_referencia,
      'cantidad_huevos', NEW.cantidad_huevos,
      'huevos_fertiles', NEW.huevos_fertiles,
      'nacidos_eclosion', NEW.nacidos_eclosion,
      'proximo_control', NEW.proximo_control,
      'observaciones', NEW.observaciones
    )),
    NEW.registrado_por
  );
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.rio_blanco_183_publicar_historial() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_rio_blanco_183_publicar_historial
  AFTER INSERT ON public.controles_reproductivos
  FOR EACH ROW EXECUTE FUNCTION private.rio_blanco_183_publicar_historial();

CREATE FUNCTION private.rio_blanco_183_validar_cria()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_madre record;
  v_cria record;
  v_tipo text;
BEGIN
  SELECT s.id, s.especie, s.unidad_id, s.sexo INTO v_madre
  FROM public.controles_reproductivos r
  JOIN public.semovientes s ON s.id = r.semoviente_id
  WHERE r.id = NEW.control_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe el control reproductivo padre' USING ERRCODE = '23514';
  END IF;
  SELECT tipo_evento INTO v_tipo FROM public.controles_reproductivos WHERE id = NEW.control_id;
  SELECT id, especie, unidad_id INTO v_cria FROM public.semovientes WHERE id = NEW.cria_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe la cria indicada' USING ERRCODE = '23514';
  END IF;
  IF v_madre.id = v_cria.id
    OR v_madre.sexo <> 'Hembra' OR v_tipo NOT IN ('parto','nacimiento')
    OR v_madre.unidad_id <> v_cria.unidad_id OR v_madre.especie <> v_cria.especie THEN
    RAISE EXCEPTION 'Vinculo madre-cria no valido (sexo, evento, unidad o especie)'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.rio_blanco_183_validar_cria() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_rio_blanco_183_validar_cria
  BEFORE INSERT OR UPDATE ON public.reproduccion_crias_vinculadas
  FOR EACH ROW EXECUTE FUNCTION private.rio_blanco_183_validar_cria();

-- Seguridad: se hereda el alcance RLS del semoviente visible.
ALTER TABLE public.controles_reproductivos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reproduccion_crias_vinculadas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.controles_reproductivos FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.reproduccion_crias_vinculadas FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.controles_reproductivos TO authenticated;
GRANT SELECT ON TABLE public.reproduccion_crias_vinculadas TO authenticated;

CREATE POLICY controles_reproductivos_lectura_por_animal
ON public.controles_reproductivos FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.semovientes s
  WHERE s.id = controles_reproductivos.semoviente_id
));

CREATE POLICY reproduccion_crias_lectura_por_madre
ON public.reproduccion_crias_vinculadas FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1
  FROM public.controles_reproductivos r
  JOIN public.semovientes c ON c.id = reproduccion_crias_vinculadas.cria_id
  WHERE r.id = reproduccion_crias_vinculadas.control_id
));

-- SIN INSERT/UPDATE/DELETE para authenticated. Los permisos especializados
-- se configuraran y probaran en el PASO 18.4.
COMMIT;

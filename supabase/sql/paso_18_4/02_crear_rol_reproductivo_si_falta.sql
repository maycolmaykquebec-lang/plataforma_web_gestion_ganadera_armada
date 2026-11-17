-- RIO_BLANCO | PASO 18.4 | 02 - CREAR SOLO EL CODIGO INSTITUCIONAL REPRODUCTIVO
-- No crea usuarios, ni cambia perfiles, ni concede acceso de escritura.
-- Si hay otras columnas obligatorias sin valores por defecto, se cancela.
BEGIN;
DO $$
DECLARE
  v_columna text;
BEGIN
  IF to_regclass('public.roles_sistema') IS NULL THEN
    RAISE EXCEPTION 'Falta public.roles_sistema';
  END IF;
  IF EXISTS (SELECT 1 FROM public.roles_sistema WHERE codigo='REPRODUCTIVO') THEN
    RAISE NOTICE 'El rol REPRODUCTIVO ya existe; no se modifica.';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='roles_sistema' AND column_name='codigo')
    OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='roles_sistema' AND column_name='nombre') THEN
    RAISE EXCEPTION 'El esquema de roles_sistema es distinto al esperado; revisar manualmente.';
  END IF;
  SELECT column_name INTO v_columna
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='roles_sistema'
    AND is_nullable='NO' AND column_default IS NULL AND is_identity='NO'
    AND column_name NOT IN ('codigo','nombre')
  ORDER BY ordinal_position LIMIT 1;
  IF v_columna IS NOT NULL THEN
    RAISE EXCEPTION 'Columna obligatoria adicional en roles_sistema: %. No se ha creado el rol.', v_columna;
  END IF;
  INSERT INTO public.roles_sistema(codigo,nombre)
  VALUES ('REPRODUCTIVO','Responsable Reproductivo');
  RAISE NOTICE 'Rol institucional REPRODUCTIVO creado sin usuarios asociados.';
END $$;
COMMIT;

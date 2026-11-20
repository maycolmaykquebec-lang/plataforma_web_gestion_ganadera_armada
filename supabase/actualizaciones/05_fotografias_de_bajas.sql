-- ALTAS Y BAJAS: una fotografia privada de evidencia por baja.
-- No altera la tabla rb_bajas, sus registros, ni la funcion rb_registrar_baja.
-- Ejecutar DESPUÉS de validar respaldo y en una copia de pruebas primero.
-- Los nombres y grados de los firmantes se editan al generar el Word,
-- sin grabar firmas, sellos ni aprobaciones automaticamente.
BEGIN;
DO $$
BEGIN
 IF to_regclass('public.rb_bajas') IS NULL
    OR to_regprocedure('private.rb_rol_actual()') IS NULL
    OR to_regprocedure('private.rb_unidad_actual()') IS NULL
    OR to_regprocedure('private.rb_puede_consultar_unidad(bigint)') IS NULL
    OR to_regclass('storage.buckets') IS NULL
    OR to_regclass('storage.objects') IS NULL
 THEN RAISE EXCEPTION 'Faltan tablas o funciones institucionales requeridas; no se hizo ningun cambio'; END IF;
 IF EXISTS (SELECT 1 FROM storage.buckets WHERE id='bajas-fotos' AND public)
 THEN RAISE EXCEPTION 'El bucket bajas-fotos ya existe como PUBLICO; revisarlo antes de continuar'; END IF;
END $$;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES ('bajas-fotos','bajas-fotos',false,5242880,ARRAY['image/jpeg'])
ON CONFLICT (id) DO NOTHING;

-- Ruta determinista: unidad_id/baja_id/evidencia.jpg
-- Con INSERT sin UPDATE/DELETE no se permite sustituir la evidencia ya presentada.
DROP POLICY IF EXISTS rb_bajas_fotos_lectura ON storage.objects;
CREATE POLICY rb_bajas_fotos_lectura ON storage.objects
FOR SELECT TO authenticated
USING (
 bucket_id='bajas-fotos'
 AND name ~ '^[0-9]+/[0-9]+/evidencia[.]jpg$'
 AND EXISTS (SELECT 1 FROM public.rb_bajas b
   WHERE b.unidad_id::text=split_part(name,'/',1)
     AND b.id::text=split_part(name,'/',2)
     AND private.rb_puede_consultar_unidad(b.unidad_id))
);
DROP POLICY IF EXISTS rb_bajas_fotos_subida ON storage.objects;
CREATE POLICY rb_bajas_fotos_subida ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
 bucket_id='bajas-fotos'
 AND name ~ '^[0-9]+/[0-9]+/evidencia[.]jpg$'
 AND private.rb_rol_actual()='RESP_UNIDAD'
 AND EXISTS (SELECT 1 FROM public.rb_bajas b
   WHERE b.unidad_id::text=split_part(name,'/',1)
     AND b.id::text=split_part(name,'/',2)
     AND b.unidad_id=private.rb_unidad_actual()
     AND b.registrado_por=auth.uid())
);
-- Proteccion incluso si existen otras policies generales en Storage.
DROP POLICY IF EXISTS rb_bajas_fotos_limite_lectura ON storage.objects;
CREATE POLICY rb_bajas_fotos_limite_lectura ON storage.objects
AS RESTRICTIVE FOR SELECT TO authenticated
USING (
 bucket_id<>'bajas-fotos'
 OR (name ~ '^[0-9]+/[0-9]+/evidencia[.]jpg$'
     AND EXISTS (SELECT 1 FROM public.rb_bajas b
       WHERE b.id::text=split_part(name,'/',2)
         AND b.unidad_id::text=split_part(name,'/',1)
         AND private.rb_puede_consultar_unidad(b.unidad_id)))
);
DROP POLICY IF EXISTS rb_bajas_fotos_limite_insert ON storage.objects;
CREATE POLICY rb_bajas_fotos_limite_insert ON storage.objects
AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (
 bucket_id<>'bajas-fotos'
 OR (name ~ '^[0-9]+/[0-9]+/evidencia[.]jpg$'
     AND private.rb_rol_actual()='RESP_UNIDAD'
     AND EXISTS (SELECT 1 FROM public.rb_bajas b
       WHERE b.id::text=split_part(name,'/',2)
         AND b.unidad_id::text=split_part(name,'/',1)
         AND b.unidad_id=private.rb_unidad_actual()
         AND b.registrado_por=auth.uid()))
);
DROP POLICY IF EXISTS rb_bajas_fotos_no_update ON storage.objects;
CREATE POLICY rb_bajas_fotos_no_update ON storage.objects
AS RESTRICTIVE FOR UPDATE TO authenticated
USING (bucket_id<>'bajas-fotos');
DROP POLICY IF EXISTS rb_bajas_fotos_no_delete ON storage.objects;
CREATE POLICY rb_bajas_fotos_no_delete ON storage.objects
AS RESTRICTIVE FOR DELETE TO authenticated
USING (bucket_id<>'bajas-fotos');
DROP POLICY IF EXISTS rb_bajas_fotos_no_anon ON storage.objects;
CREATE POLICY rb_bajas_fotos_no_anon ON storage.objects
AS RESTRICTIVE FOR SELECT TO anon
USING (bucket_id<>'bajas-fotos');
COMMIT;

-- Verificacion (no modifica datos), ejecutar en otra consulta:
-- SELECT id,public FROM storage.buckets WHERE id='bajas-fotos';
-- SELECT policyname,cmd,permissive FROM pg_policies
-- WHERE schemaname='storage' AND tablename='objects' AND policyname LIKE 'rb_bajas_fotos_%';

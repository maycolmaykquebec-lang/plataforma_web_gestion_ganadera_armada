-- CONSULTA SOLO LECTURA: verificar instalaciones y evidencias de bajas.
SELECT id AS bucket, public AS es_publico, file_size_limit AS tamano_maximo
FROM storage.buckets WHERE id='bajas-fotos';

SELECT b.id AS baja_id,b.semoviente_id,b.unidad_id,b.tipo,b.fecha,
       (o.id IS NOT NULL) AS fotografia_en_storage,
       (b.unidad_id::text || '/' || b.id::text || '/evidencia.jpg') AS ruta
FROM public.rb_bajas b
LEFT JOIN storage.objects o
  ON o.bucket_id='bajas-fotos'
 AND o.name=b.unidad_id::text || '/' || b.id::text || '/evidencia.jpg'
ORDER BY b.id DESC LIMIT 25;

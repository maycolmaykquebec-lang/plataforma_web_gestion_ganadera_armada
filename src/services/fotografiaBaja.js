import { fotoComoJpeg, rutaFotoBaja } from './actaDefuncionWord.js'

export function validarArchivoBaja(archivo) {
  if (!archivo || !['image/jpeg', 'image/png', 'image/webp'].includes(archivo.type) || archivo.size <= 0 || archivo.size > 5 * 1024 * 1024) {
    throw new Error('Seleccione una fotografía JPG, PNG o WebP de hasta 5 MB.')
  }
}

// Inserción de una sola vez. Storage sigue verificando rol, unidad y autor;
// nunca se sobrescribe una fotografía ya asociada a la baja.
export async function adjuntarFotografiaBaja({ storage, baja, archivo, convertir = fotoComoJpeg }) {
  validarArchivoBaja(archivo)
  const imagen = await convertir(archivo)
  const resultado = await storage.from('bajas-fotos').upload(rutaFotoBaja(baja), imagen, {
    contentType: 'image/jpeg', cacheControl: '3600', upsert: false,
  })
  if (resultado.error) throw resultado.error
}

export function errorAlAdjuntarFoto(error) {
  const codigo = String(error?.statusCode || error?.status || error?.code || '')
  const mensaje = String(error?.message || '')
  if (codigo === '409' || /already exists|duplicate/i.test(mensaje)) {
    return 'Ya existe un archivo en esa ubicación. No se sobrescribió. Vuelva a consultar la foto y, si sigue sin verse, revise los permisos de lectura.'
  }
  if (['401', '403', '42501'].includes(codigo) || /row.level security|unauthorized|forbidden/i.test(mensaje)) {
    return 'Supabase no permitió adjuntar la fotografía. Compruebe que usa la cuenta que registró la baja y que tiene permisos de Storage.'
  }
  return 'No se pudo confirmar la carga de la fotografía. Vuelva a consultarla antes de reintentar; la baja ya registrada no se modificó.'
}

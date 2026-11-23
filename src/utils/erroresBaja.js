// Traduce mensajes conocidos; para una validación desconocida muestra solo el
// mensaje de Supabase, sin encabezados, payload, detalles ni credenciales.
export function mensajeErrorBaja(error) {
  const detalle = String(error?.message || '')
  const codigo = String(error?.code || '')
  if (/El semoviente tiene un traslado abierto/i.test(detalle)) return 'El semoviente tiene un traslado pendiente o aprobado. El Supervisor debe resolverlo en Movimientos antes de registrar la baja.'
  if (/La hora del acontecimiento no puede ser futura/i.test(detalle)) return 'La hora de defunción no puede ser futura. Revise la fecha y la hora de Bolivia.'
  if (/La hora debe tener formato HH:MM/i.test(detalle)) return 'Revise la hora de defunción: debe tener formato HH:MM.'
  if (/Tipo, fecha o motivo de baja inválidos/i.test(detalle)) return 'Revise la fecha de la baja y el motivo. La fecha debe estar entre el ingreso del animal y hoy; el motivo debe tener entre 10 y 2000 caracteres.'
  if (/Detalles del acta inválidos|Campos del acta no permitidos/i.test(detalle)) return 'Revise los datos complementarios del acta: alguno no cumple el formato o supera el límite permitido.'
  if (/Solo el responsable de unidad registra una baja/i.test(detalle)) return 'Solo el responsable de unidad puede registrar la baja. Verifique el perfil de la cuenta.'
  if (/Animal no disponible en su unidad/i.test(detalle)) return 'El animal no está activo o no pertenece a la unidad de su cuenta. Actualice el listado antes de continuar.'
  if (['PGRST205', '42P01', 'PGRST202', '42883'].includes(codigo)) return 'La función o una tabla necesaria para registrar la baja no está disponible en Supabase. Contacte al administrador.'
  if (codigo === '23505') return 'Se encontró un registro duplicado. Revise las bajas existentes antes de volver a intentarlo.'
  if (codigo === '42501') return 'Supabase rechazó la operación por permisos. Verifique el rol y la unidad de la cuenta.'
  if (codigo === '23514') {
    const mensaje = detalle.replace(/[\r\n\t]+/g, ' ').replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[credencial omitida]').trim().slice(0, 500)
    return `Supabase rechazó una validación del registro.${mensaje ? ` Detalle: ${mensaje}` : ' El servidor no proporcionó más información.'}`
  }
  const referencia = /^[A-Z0-9]{5,10}$/.test(codigo) ? ` Código: ${codigo}.` : ''
  return `No se pudo confirmar el resultado de la baja.${referencia} Antes de reintentar, actualice el listado de bajas y compruebe si el registro fue creado.`
}

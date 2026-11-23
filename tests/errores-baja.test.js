import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mensajeErrorBaja } from '../src/utils/erroresBaja.js'

test('explica el rechazo de hora futura y el bloqueo por traslado', () => {
  assert.match(mensajeErrorBaja({ code: '23514', message: 'La hora del acontecimiento no puede ser futura' }), /hora de defunción no puede ser futura/)
  assert.match(mensajeErrorBaja({ code: '23514', message: 'El semoviente tiene un traslado abierto; resolverlo antes de la baja' }), /traslado pendiente o aprobado/)
})

test('indica que una falla de red no confirma si la baja fue registrada', () => {
  assert.match(mensajeErrorBaja({ message: 'Failed to fetch' }), /compruebe si el registro fue creado/)
})

test('no expone detalles internos desconocidos de la base', () => {
  const mensaje = mensajeErrorBaja({ code: 'XX000', message: 'detalle interno privado' })
  assert.match(mensaje, /XX000/)
  assert.doesNotMatch(mensaje, /detalle interno privado/)
})

test('muestra el mensaje de validación sin incluir detalles ni credenciales', () => {
  const mensaje = mensajeErrorBaja({ code: '23514', message: 'Violación de la restricción check_acta', details: 'fila privada' })
  assert.match(mensaje, /Violación de la restricción check_acta/)
  assert.doesNotMatch(mensaje, /fila privada/)
  assert.doesNotMatch(mensajeErrorBaja({ code: '23514', message: 'eyJabcd.abc.def' }), /eyJabcd/)
})

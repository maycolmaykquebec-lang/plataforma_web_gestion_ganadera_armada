import { test } from 'node:test'
import assert from 'node:assert/strict'
import { adjuntarFotografiaBaja, errorAlAdjuntarFoto, validarArchivoBaja } from '../src/services/fotografiaBaja.js'

const baja = { id: 1, unidad_id: 1 }
const archivo = new Blob(['imagen de prueba'], { type: 'image/png' })
const jpeg = new Blob(['jpeg ficticio'], { type: 'image/jpeg' })

test('adjunta una sola vez en la ruta de la baja existente, sin sobrescribir', async () => {
  const llamadas = []
  const storage = { from: bucket => ({ upload: async (ruta, contenido, opciones) => {
    llamadas.push({ bucket, ruta, contenido, opciones }); return { error: null }
  } }) }
  await adjuntarFotografiaBaja({ storage, baja, archivo, convertir: async () => jpeg })
  assert.equal(llamadas.length, 1)
  assert.equal(llamadas[0].bucket, 'bajas-fotos')
  assert.equal(llamadas[0].ruta, '1/1/evidencia.jpg')
  assert.equal(llamadas[0].contenido, jpeg)
  assert.equal(llamadas[0].opciones.upsert, false)
  assert.equal(llamadas[0].opciones.contentType, 'image/jpeg')
})

test('rechaza archivos vacíos, de tipo incorrecto o mayores a 5 MB', () => {
  for (const invalido of [null, new Blob([],{type:'image/jpeg'}), new Blob(['x'],{type:'application/pdf'}), {type:'image/jpeg',size:5*1024*1024+1}]) {
    assert.throws(() => validarArchivoBaja(invalido), /hasta 5 MB/)
  }
})

test('no modifica una evidencia existente y explica permisos insuficientes', async () => {
  const duplicado = { statusCode: 409, message: 'The resource already exists' }
  const storage = { from: () => ({ upload: async () => ({ error: duplicado }) }) }
  await assert.rejects(adjuntarFotografiaBaja({ storage, baja, archivo, convertir: async () => jpeg }), e => e === duplicado)
  assert.match(errorAlAdjuntarFoto(duplicado), /No se sobrescribió/)
  assert.match(errorAlAdjuntarFoto({statusCode:403}), /cuenta que registró la baja/)
  assert.match(errorAlAdjuntarFoto(new Error('Failed to fetch')), /Vuelva a consultarla antes de reintentar/)
})

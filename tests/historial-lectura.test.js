import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const base = new URL('../src/components/historial/PerfilHistorialSemoviente.jsx', import.meta.url)
const fuente = readFileSync(base, 'utf8')

test('el expediente utiliza solo consultas, no muta datos', () => {
  assert.match(fuente, /\.from\('semovientes'\)/)
  assert.match(fuente, /\.from\('semoviente_eventos'\)/)
  assert.match(fuente, /\.createSignedUrl\(/)
  assert.doesNotMatch(fuente, /\.(insert|update|upsert|delete|remove|upload)\s*\(/)
})
test('contiene pestañas del expediente y galería frontal/laterales', () => {
  for (const nombre of ['Resumen','Datos generales','Historial sanitario','Historial reproductivo','Movimientos','Altas y bajas','Evaluaciones','Archivos y fotografías']) {
    assert.ok(fuente.includes(nombre), nombre)
  }
  for (const vista of ['frontal','lateral_izquierdo','lateral_derecho']) assert.ok(fuente.includes(vista))
})

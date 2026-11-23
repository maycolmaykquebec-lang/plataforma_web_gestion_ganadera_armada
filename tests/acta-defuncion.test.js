import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { construirActaWord, rutaFotoBaja } from '../src/services/actaDefuncionWord.js'
import { abrirDocx, crearDocx } from '../src/services/zipOpenXml.js'

const plantilla = new Uint8Array(await readFile(new URL('../public/plantillas/acta_defuncion_institucional.docx', import.meta.url)))
// Imagen de prueba del repositorio: no representa evidencia de una baja real.
const foto = new Uint8Array(await readFile(new URL('../public/images/semovientes/bovino.jpg', import.meta.url)))
const animal = { codigo: '009', especie: 'bovino', categoria: 'Vaca', sexo: 'Hembra', raza: 'Criolla', fecha_nacimiento: '2020-01-01' }
const formulario = {
  gradoVaquero: 'Adm. II.', nombreVaquero: 'María & José Pérez',
  gradoJefe: 'Tte. Frag.', nombreJefe: 'Juán López Ñúñez',
  numeroActa: '008', numeroInforme: '008/25', fechaActa: '2026-11-20',
  descripcion: 'Color negro', lugarCausa: 'Río Blanco: causa documentada',
}
const bajaPara = codigo => ({ id: 12, unidad_id: 3, fecha: '2026-11-19', motivo: 'Causa documentada', detalles: {}, unidad: { codigo } })
const texto = archivo => new TextDecoder().decode(archivo.datos)
const contar = (s, buscado) => s.split(buscado).length - 1

for (const unidad of ['RIO-BLANCO', 'TAMARINERO', 'MAMORE']) {
  test(`acta ${unidad}: inserta la fotografía enlazada y ambos firmantes dos veces`, async () => {
    const baja = bajaPara(unidad)
    assert.equal(rutaFotoBaja(baja), '3/12/evidencia.jpg')
    const resultado = await construirActaWord({ baja, animal, formulario, plantillaBytes: plantilla, fotoBytes: foto })
    const archivos = await abrirDocx(resultado.bytes)
    const xml = texto(archivos.find(a => a.nombre === 'word/document.xml'))
    const relaciones = texto(archivos.find(a => a.nombre === 'word/_rels/document.xml.rels'))
    const evidencia = archivos.find(a => a.nombre === 'word/media/image2.jpeg').datos
    assert.deepEqual(evidencia, foto)
    assert.match(relaciones, /Id="rId3"[^>]*Target="media\/image2\.jpeg"/)
    assert.match(xml, /r:embed="rId3"/)
    assert.match(xml, /<wp:inline\b[^>]*>[\s\S]*?r:embed="rId3"[\s\S]*?<\/wp:inline>/)
    assert.equal(contar(xml, 'Adm. II. María &amp; José Pérez'), 2)
    assert.equal(contar(xml, 'Tte. Frag. Juán López Ñúñez'), 2)
    assert.doesNotMatch(xml, /\{\{[A-Z_]+\}\}/)
  })
}

test('no genera el acta si la imagen no está enlazada en el documento', async () => {
  const archivos = await abrirDocx(plantilla)
  const documento = archivos.find(a => a.nombre === 'word/document.xml')
  documento.datos = new TextEncoder().encode(texto(documento).replace('r:embed="rId3"', 'r:embed="rId99"'))
  await assert.rejects(construirActaWord({ baja: bajaPara('RIO-BLANCO'), animal, formulario, plantillaBytes: crearDocx(archivos), fotoBytes: foto }), /no vincula correctamente/)
})

test('no genera el acta si falta un firmante en el espacio de firma', async () => {
  const archivos = await abrirDocx(plantilla)
  const documento = archivos.find(a => a.nombre === 'word/document.xml')
  documento.datos = new TextEncoder().encode(texto(documento).replace('{{VAQUERO_NOMBRE}}', 'Sin marcador'))
  await assert.rejects(construirActaWord({ baja: bajaPara('RIO-BLANCO'), animal, formulario, plantillaBytes: crearDocx(archivos), fotoBytes: foto }), /firmantes en el cuerpo/)
})

test('no genera el acta con fotografía inválida ni firmantes incompletos', async () => {
  await assert.rejects(construirActaWord({ baja: bajaPara('RIO-BLANCO'), animal, formulario, plantillaBytes: plantilla, fotoBytes: new Uint8Array([1, 2, 3]) }), /JPEG válido/)
  await assert.rejects(construirActaWord({ baja: bajaPara('RIO-BLANCO'), animal, formulario: { ...formulario, nombreJefe: '' }, plantillaBytes: plantilla, fotoBytes: foto }), /grado y nombre del jefe/)
})

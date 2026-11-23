import test from 'node:test'
import assert from 'node:assert/strict'
import { calcularReporteGanadero, configuracionesGraficos } from '../src/utils/reportesGanaderos.js'
import { generarSVGReporte } from '../src/utils/graficosReporteSVG.js'

const base = {
  animales: [
    { id: 1, codigo: '005', unidad_id: 1, especie: 'bovino', estado: 'Activo', fecha_ingreso: '2026-11-05' },
    { id: 2, codigo: '006', unidad_id: 1, especie: 'bovino', estado: 'Baja', fecha_ingreso: '2024-10-01' },
    { id: 3, codigo: '007', unidad_id: 2, especie: 'porcino', estado: 'Activo', fecha_ingreso: '2026-11-08' },
  ],
  bajas: [ { id: 5, semoviente_id: 2, unidad_id: 1, fecha: '2026-11-18', tipo: 'defuncion' } ],
  evaluaciones: [],
  movimientos: [
    { id: 11, semoviente_id: 1, unidad_origen_id: 1, unidad_destino_id: 2, estado: 'ejecutado', creado_en: '2026-11-01T10:00:00Z', fecha_ejecucion: '2026-11-19T04:30:00Z' },
    { id: 12, semoviente_id: 1, unidad_origen_id: 1, unidad_destino_id: 2, estado: 'cancelado', creado_en: '2026-11-18T10:00:00Z' },
  ],
}

test('inventario actual + altas y bajas por fecha: datos reales, no inventados', () => {
  const r = calcularReporteGanadero(base, { unidad: '1', desde: '2026-11-01', hasta: '2026-11-30' })
  const bovino = r.resumen.find(e => e.codigo === 'bovino')
  assert.deepEqual([r.activos, r.altas, r.bajas.length], [1, 1, 1])
  assert.deepEqual([bovino.registrados, bovino.bajas_actuales, bovino.bajas_periodo], [2, 1, 1])
  assert.equal(r.trasladosIndicador, 0, 'El origen no es un traslado recibido')
})

test('traslado recibido cuenta destino y fecha de ejecución y no de creación', () => {
  const r = calcularReporteGanadero(base, { unidad: '2', desde: '2026-11-19', hasta: '2026-11-19' })
  assert.equal(r.trasladosIndicador, 1)
  assert.equal(r.movimientos.length, 1)
  assert.equal(r.movimientos[0].id, 11)
})

test('el filtro de especie condiciona la vista y los datos de gráficos', () => {
  const r = calcularReporteGanadero(base, { especie: 'porcino' })
  assert.equal(r.resumen.length, 1)
  assert.equal(r.resumen[0].activos, 1)
  assert.equal(configuracionesGraficos(r).length, 4)
})

test('excluye registros y movimientos de especies no habilitadas del reporte general', () => {
  const datos = { ...base,
    animales: [...base.animales, {id:4, unidad_id:1, especie:'avicola', estado:'Activo', fecha_ingreso:'2026-11-01'}],
    bajas: [...base.bajas, {id:9, semoviente_id:4, unidad_id:1, fecha:'2026-11-02'}],
    movimientos: [...base.movimientos, {id:13, semoviente_id:4, unidad_origen_id:1, unidad_destino_id:2, estado:'pendiente', creado_en:'2026-11-02'}],
  }
  const reporte = calcularReporteGanadero(datos)
  assert.equal(reporte.resumen.length, 5)
  assert.equal(reporte.animales.length, 3)
  assert.equal(reporte.bajas.length, 1)
  assert.equal(reporte.movimientos.length, 2)
})

test('gráfico vacío muestra leyenda y no falla', () => {
  const vacio = calcularReporteGanadero({ animales: [], bajas: [], evaluaciones: [], movimientos: [] })
  for (const grafico of configuracionesGraficos(vacio)) {
    const svg = generarSVGReporte(grafico)
    assert.ok(svg.startsWith('<svg xmlns='))
    assert.match(svg, /Sin datos para los filtros seleccionados/)
  }
})

test('los SVG no permiten inyectar etiquetas como elementos XML', () => {
  const svg = generarSVGReporte({ tipo: 'horizontal', titulo: 'T <script>alert(1)</script>', subtitulo: '', datos: [{ etiqueta: 'X<svg onload=evil()>', valor: 3 }] })
  assert.ok(!svg.includes('<script>'))
  assert.ok(!svg.includes('<svg onload='))
  assert.match(svg, /&lt;script&gt;/)
})

// Reportes V4.5: cálculos de solo lectura basados exclusivamente en registros devueltos por RLS.
export const ESPECIES_REPORTE = Object.freeze([
  ['bovino', 'Ganado vacuno'], ['equino', 'Equino'], ['caprino', 'Caprino'],
  ['mular', 'Mular'], ['avicola', 'Avícola'], ['porcino', 'Porcino'],
])

export const ESTADOS_MOVIMIENTOS = Object.freeze([
  ['pendiente', 'Pendiente'], ['aprobado', 'Aprobado'], ['rechazado', 'Rechazado'],
  ['ejecutado', 'Ejecutado'], ['cancelado', 'Cancelado'],
])

const fechaEvento = (fecha) => {
  if (!fecha) return ''
  // En fechas de PostgreSQL DATE no corregir por UTC. Los timestamptz
  // necesitan conversión a la zona institucional America/La_Paz.
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(fecha))) return String(fecha)
  const objeto = new Date(fecha)
  if (Number.isNaN(objeto.getTime())) return ''
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(objeto)
  const datos = Object.fromEntries(partes.map(p => [p.type, p.value]))
  return `${datos.year}-${datos.month}-${datos.day}`
}

export function calcularReporteGanadero(datos, { unidad = 'todas', especie = 'todas', desde = '', hasta = '' } = {}) {
  const animalesConPermiso = datos.animales || []
  const mapa = new Map(animalesConPermiso.map(a => [String(a.id), a]))
  const unidadCoincide = id => unidad === 'todas' || String(id) === String(unidad)
  const especieCoincide = a => especie === 'todas' || a?.especie === especie
  const fechaCoincide = fecha => {
    const f = fechaEvento(fecha)
    return Boolean(f) && (!desde || f >= desde) && (!hasta || f <= hasta)
  }
  const eventoEspecie = e => especieCoincide(mapa.get(String(e.semoviente_id)))
  const animales = animalesConPermiso.filter(a => unidadCoincide(a.unidad_id) && especieCoincide(a))
  const bajas = (datos.bajas || []).filter(b => unidadCoincide(b.unidad_id) && eventoEspecie(b) && fechaCoincide(b.fecha))
  const evaluaciones = (datos.evaluaciones || []).filter(e => unidadCoincide(e.unidad_id) && eventoEspecie(e) && fechaCoincide(e.fecha))
  const movimientos = (datos.movimientos || []).filter(m =>
    (unidad === 'todas' || unidadCoincide(m.unidad_origen_id) || unidadCoincide(m.unidad_destino_id)) &&
    eventoEspecie(m) && fechaCoincide(m.estado === 'ejecutado' && m.fecha_ejecucion ? m.fecha_ejecucion : m.creado_en)
  )
  const especiesVisibles = ESPECIES_REPORTE.filter(([codigo]) => especie === 'todas' || codigo === especie)
  const resumen = especiesVisibles.map(([codigo, nombre]) => ({
    codigo,
    especie: nombre,
    registrados: animales.filter(a => a.especie === codigo).length,
    activos: animales.filter(a => a.especie === codigo && a.estado === 'Activo').length,
    bajas_actuales: animales.filter(a => a.especie === codigo && a.estado === 'Baja').length,
    altas_periodo: animales.filter(a => a.especie === codigo && fechaCoincide(a.fecha_ingreso)).length,
    bajas_periodo: bajas.filter(b => mapa.get(String(b.semoviente_id))?.especie === codigo).length,
  }))
  const movimientosPorEstado = ESTADOS_MOVIMIENTOS.map(([codigo, nombre]) => ({
    codigo, nombre, cantidad: movimientos.filter(m => m.estado === codigo).length,
  }))
  const ejecutados = movimientos.filter(m => m.estado === 'ejecutado')
  return {
    animales, bajas, evaluaciones, movimientos, resumen, movimientosPorEstado,
    altas: resumen.reduce((a, x) => a + x.altas_periodo, 0),
    activos: resumen.reduce((a, x) => a + x.activos, 0),
    trasladosIndicador: unidad === 'todas' ? ejecutados.length : ejecutados.filter(m => unidadCoincide(m.unidad_destino_id)).length,
  }
}

export function configuracionesGraficos(reporte) {
  return [
    {
      id: 'torta_especies', tipo: 'torta', titulo: 'Distribución de semovientes activos',
      subtitulo: 'Existencias actuales por especie (no históricas)',
      datos: reporte.resumen.map(x => ({ etiqueta: x.especie, valor: x.activos })),
    },
    {
      id: 'barras_existencias', tipo: 'barras', titulo: 'Existencias por especie',
      subtitulo: 'Estado actual: activos y bajas',
      datos: reporte.resumen.map(x => ({ etiqueta: x.especie, valores: [x.activos, x.bajas_actuales] })),
      series: ['Activos', 'Bajas actuales'],
    },
    {
      id: 'barras_acontecimientos', tipo: 'barras', titulo: 'Altas y bajas del período',
      subtitulo: 'Acontecimientos según fechas seleccionadas',
      datos: reporte.resumen.map(x => ({ etiqueta: x.especie, valores: [x.altas_periodo, x.bajas_periodo] })),
      series: ['Altas', 'Bajas'],
    },
    {
      id: 'barras_movimientos', tipo: 'horizontal', titulo: 'Solicitudes de traslado por estado',
      subtitulo: 'Solicitudes en el período filtrado',
      datos: reporte.movimientosPorEstado.map(x => ({ etiqueta: x.nombre, valor: x.cantidad })),
    },
  ]
}

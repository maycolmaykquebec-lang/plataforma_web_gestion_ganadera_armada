import { supabase } from './supabaseClient'

const BLOQUE = 500
const MAX_FILAS = 100000

export function mensajeGestion(error, contexto = 'consultar los datos') {
  const codigo = String(error?.code || '')
  if (['42P01', 'PGRST200', 'PGRST202', 'PGRST204', 'PGRST205', '42883'].includes(codigo)) {
    return 'Este módulo requiere instalar la actualización de Supabase de los módulos pendientes. Contacte al administrador.'
  }
  if (['42501', 'PGRST301', 'PGRST302'].includes(codigo) || error?.status === 401 || error?.status === 403) {
    return `No tiene permisos para ${contexto}. Verifique su sesión y su perfil institucional.`
  }
  return error?.message ? `No fue posible ${contexto}: ${error.message}` : `No fue posible ${contexto}. Verifique la conexión e inténtelo de nuevo.`
}

export function aplicarFiltros(consulta, filtros = []) {
  for (const [operacion, columna, valor] of filtros) {
    if (!['eq', 'gte', 'lte'].includes(operacion)) throw new Error('Filtro no admitido')
    consulta = consulta[operacion](columna, valor)
  }
  return consulta
}

// Exportaciones completas de las filas que devuelve RLS. Se rechaza un resultado
// truncado o cambiante; nunca se presenta un bloque parcial como respaldo completo.
export async function leerTablaProtegida({ tabla, columnas, ordenes = ['id'], filtros = [], signal, progreso }) {
  const filas = []
  let esperado = null
  for (let desde = 0; ; desde += BLOQUE) {
    if (signal?.aborted) throw new DOMException('Consulta cancelada', 'AbortError')
    let consulta = aplicarFiltros(supabase.from(tabla).select(columnas, { count: 'exact' }), filtros)
    for (const orden of ordenes) consulta = consulta.order(orden, { ascending: true })
    consulta = consulta.range(desde, desde + BLOQUE - 1)
    if (signal) consulta = consulta.abortSignal(signal)
    const { data, error, count } = await consulta
    if (error) throw error
    if (!Number.isInteger(count) || count < 0) throw new Error('No se pudo comprobar la cantidad total de registros. No se generó una exportación parcial.')
    if (count > MAX_FILAS) throw new Error(`La consulta supera ${MAX_FILAS.toLocaleString('es-BO')} filas. Solicite una exportación administrativa de Supabase.`)
    if (esperado === null) esperado = count
    if (count !== esperado) throw new Error('Los registros cambiaron durante la consulta. Actualice y vuelva a exportar.')
    const bloque = data || []
    filas.push(...bloque)
    progreso?.({ tabla, recibidas: filas.length, total: esperado })
    if (filas.length === esperado) return filas
    if (!bloque.length || bloque.length < BLOQUE || filas.length > esperado) throw new Error('La respuesta quedó incompleta. No se generó una exportación parcial.')
  }
}

export function descargarContenido(contenido, nombre, tipo = 'application/json;charset=utf-8') {
  const blob = contenido instanceof Blob ? contenido : new Blob([contenido], { type: tipo })
  const url = URL.createObjectURL(blob)
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombre
  document.body.appendChild(enlace)
  enlace.click()
  enlace.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

export function crearCSV(columnas, filas) {
  const celda = valor => {
    const texto = String(valor ?? '')
    const seguro = /^\s*[=+\-@]/.test(texto) ? `'${texto}` : texto
    return `"${seguro.replace(/"/g, '""')}"`
  }
  return '\uFEFF' + [columnas.map(([titulo]) => celda(titulo)).join(';'), ...filas.map(fila => columnas.map(([, campo]) => celda(fila[campo])).join(';'))].join('\r\n')
}

export function fechaBolivia(fecha = new Date()) {
  const partes = new Intl.DateTimeFormat('en-US', { timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(fecha)
  const mapa = Object.fromEntries(partes.map(p => [p.type, p.value]))
  return `${mapa.year}-${mapa.month}-${mapa.day}`
}

export const COLUMNAS_OPERATIVAS = Object.freeze({
  semovientes: 'id,unidad_id,codigo,especie,raza,sexo,fecha_nacimiento,categoria,procedencia,fecha_ingreso,marca_ancla,vacuna_brucelosis,estado,observaciones,created_at,updated_at',
  semoviente_eventos: 'id,semoviente_id,tipo_evento,fecha_evento,titulo,detalle,origen_modulo,origen_registro_id,datos_adicionales,registrado_por,registrado_en',
  controles_sanitarios: 'id,semoviente_id,tipo_control,fecha_control,responsable_sanitario,motivo,diagnostico,producto,dosis,unidad_dosis,via_administracion,lote_producto,proximo_control,observaciones,registrado_por,registrado_en',
  controles_reproductivos: 'id,semoviente_id,tipo_evento,fecha_evento,responsable_reproductivo,resultado,detalle,reproductor_codigo,metodo,fecha_parto_probable,cantidad_crias,crias_codigos_referencia,cantidad_huevos,huevos_fertiles,nacidos_eclosion,proximo_control,observaciones,registrado_por,registrado_en',
  reproduccion_crias_vinculadas: 'control_id,cria_id',
  solicitudes_movimientos: 'id,semoviente_id,unidad_origen_id,unidad_destino_id,fecha_prevista,motivo,solicitado_por,referencia_autorizacion,estado,autorizado_por,fecha_autorizacion,fecha_ejecucion,observaciones,creado_en,actualizado_en,fundamento_decision,referencia_decision,ejecutado_por',
  rb_bajas: 'id,semoviente_id,unidad_id,tipo,fecha,motivo,detalles,registrado_por,registrado_en',
  rb_evaluaciones_descarte: 'id,semoviente_id,unidad_id,fecha,motivo,dictamen,registrado_por,registrado_en',
  rb_auditoria: 'id,fecha,actor_id,unidad_id,tabla,registro_id,accion,detalle',
})

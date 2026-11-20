// Los mismos SVG sirven para la vista React y para incrustar imágenes PNG en Excel.
// No hay referencias externas, scripts, <foreignObject> ni dependencias de gráficos.
const PALETA = ['#12629A', '#E88734', '#14A69B', '#8C63B9', '#C9516E', '#79A553']
const ESCALA = ['#12629A', '#E88734']
const esc = valor => String(valor ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
const texto = (x, y, str, opts = '') => `<text x="${x}" y="${y}" ${opts}>${esc(str)}</text>`
const rect = (x, y, w, h, color, radio = 0) => `<rect x="${x}" y="${y}" width="${Math.max(0, w)}" height="${Math.max(0, h)}" rx="${radio}" fill="${color}"/>`
const estilos = `font-family="Arial, Helvetica, sans-serif"`
const entero = n => Number(n || 0).toLocaleString('es-BO')
const punto = (cx, cy, r, angulo) => ({ x: cx + r * Math.cos(angulo), y: cy + r * Math.sin(angulo) })
const sinDatos = () => `${rect(90, 165, 920, 330, '#F1F6FB', 22)}${texto(550, 312, 'Sin datos para los filtros seleccionados', 'fill="#667D94" text-anchor="middle" font-size="27" font-weight="bold"')}${texto(550, 350, 'El gráfico se actualizará cuando existan registros autorizados.', 'fill="#667D94" text-anchor="middle" font-size="19"')}`

function torta(datos) {
  const tot = datos.reduce((a, d) => a + Math.max(0, Number(d.valor) || 0), 0)
  if (!tot) return sinDatos()
  const cx = 312, cy = 316, r = 190, rMenor = 103
  let ang = -Math.PI / 2
  let piezas = ''
  datos.forEach((d, i) => {
    const cantidad = Math.max(0, Number(d.valor) || 0)
    if (!cantidad) return
    const fraccion = cantidad / tot
    const color = PALETA[i % PALETA.length]
    if (fraccion >= 0.999999) { piezas += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}"/>` }
    else {
      const fin = ang + fraccion * 2 * Math.PI
      const a = punto(cx, cy, r, ang), b = punto(cx, cy, r, fin)
      const a2 = punto(cx, cy, rMenor, fin), b2 = punto(cx, cy, rMenor, ang)
      piezas += `<path d="M ${a.x} ${a.y} A ${r} ${r} 0 ${fraccion > 0.5 ? 1 : 0} 1 ${b.x} ${b.y} L ${a2.x} ${a2.y} A ${rMenor} ${rMenor} 0 ${fraccion > 0.5 ? 1 : 0} 0 ${b2.x} ${b2.y} Z" fill="${color}" stroke="white" stroke-width="2"/>`
      ang = fin
    }
  })
  piezas += `<circle cx="${cx}" cy="${cy}" r="${rMenor - 1}" fill="white"/>`
  piezas += texto(cx, cy - 3, entero(tot), 'font-size="43" font-weight="bold" fill="#123C5E" text-anchor="middle"')
  piezas += texto(cx, cy + 27, 'Activos', 'font-size="19" fill="#5C7792" text-anchor="middle"')
  datos.forEach((d, i) => {
    const y = 177 + i * 61
    const pct = tot ? (100 * Math.max(0, d.valor) / tot).toFixed(1).replace('.', ',') : '0,0'
    piezas += rect(607, y - 18, 23, 23, PALETA[i % PALETA.length], 5)
    piezas += texto(645, y, d.etiqueta, 'font-size="22" fill="#284D69" font-weight="bold"')
    piezas += texto(1027, y, `${entero(d.valor)} (${pct}%)`, 'font-size="20" fill="#284D69" text-anchor="end"')
  })
  return piezas
}

function barrasAgrupadas(config) {
  const filas = config.datos
  const max = Math.max(1, ...filas.flatMap(f => f.valores || [0]))
  if (!filas.some(f => f.valores.some(n => Number(n) > 0))) return sinDatos()
  let svg = ''
  const izquierda = 216, derecha = 1001, largo = derecha - izquierda
  const n = Math.max(1, filas.length)
  const altura = 335 / n, base = 185
  for (let g = 0; g <= 4; g++) {
    const x = izquierda + (g / 4) * largo
    svg += `<line x1="${x}" y1="164" x2="${x}" y2="526" stroke="#DDE8F0" stroke-width="1.5"/>`
    svg += texto(x, 547, entero(Math.round(max * g / 4)), 'font-size="16" text-anchor="middle" fill="#647C91"')
  }
  filas.forEach((fila, i) => {
    const y = base + altura * i
    svg += texto(16, y + 13, fila.etiqueta, 'font-size="19" fill="#2B526F"')
    fila.valores.forEach((v, j) => {
      const nn = Math.max(0, Number(v) || 0)
      const w = Math.round(nn / max * (largo - 18))
      const by = y - 7 + j * Math.min(20, altura / 3)
      svg += rect(izquierda, by, w, 15, ESCALA[j], 4)
      if (nn > 0) svg += texto(izquierda + w + 8, by + 13, entero(nn), 'font-size="16" font-weight="bold" fill="#274D6B"')
    })
  })
  config.series.forEach((s, i) => {
    svg += rect(222 + i * 290, 121, 19, 19, ESCALA[i], 4)
    svg += texto(250 + i * 290, 138, s, 'font-size="20" fill="#274D6B"')
  })
  return svg
}

function horizontal(config) {
  const filas = config.datos
  const max = Math.max(1, ...filas.map(f => Number(f.valor) || 0))
  if (!filas.some(f => Number(f.valor) > 0)) return sinDatos()
  let svg = ''
  const izquierda = 220, longitud = 750
  for (let g = 0; g <= 4; g++) {
    const x = izquierda + (g / 4) * longitud
    svg += `<line x1="${x}" y1="160" x2="${x}" y2="522" stroke="#DDE8F0" stroke-width="1.5"/>`
    svg += texto(x, 544, entero(Math.round(max * g / 4)), 'font-size="16" text-anchor="middle" fill="#647C91"')
  }
  filas.forEach((fila, i) => {
    const y = 178 + i * 69
    svg += texto(20, y + 25, fila.etiqueta, 'font-size="20" fill="#264E70"')
    const n = Math.max(0, Number(fila.valor) || 0)
    const ancho = n / max * longitud
    svg += rect(izquierda, y, ancho, 40, PALETA[i], 8)
    svg += texto(Math.min(1021, izquierda + ancho + 10), y + 27, entero(n), 'font-size="19" font-weight="bold" fill="#274D6B"')
  })
  return svg
}

export function generarSVGReporte(config) {
  const cuerpo = config.tipo === 'torta' ? torta(config.datos) : config.tipo === 'horizontal' ? horizontal(config) : barrasAgrupadas(config)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="600" viewBox="0 0 1100 600" role="img" aria-label="${esc(config.titulo)}">
    ${rect(0, 0, 1100, 600, '#FFFFFF', 20)}
    ${rect(0, 0, 1100, 10, '#17649B')}
    <g ${estilos}>
    ${texto(38, 59, config.titulo, 'font-size="31" font-weight="bold" fill="#143C60"')}
    ${texto(38, 91, config.subtitulo, 'font-size="18" fill="#617D94"')}
    ${cuerpo}
    ${texto(38, 580, 'Fuente: datos autorizados de Supabase · Plataforma de Gestión Ganadera', 'font-size="15" fill="#8195A6"')}
    </g>
  </svg>`
}

export function urlSVGReporte(config) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(generarSVGReporte(config))}`
}

export async function pngDeSVGReporte(config) {
  if (typeof document === 'undefined') throw new Error('La generación de gráficos para Excel requiere un navegador.')
  const svg = generarSVGReporte(config)
  const temporal = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const imagen = new Image()
    await new Promise((resolve, reject) => {
      imagen.onload = resolve
      imagen.onerror = () => reject(new Error(`No se pudo convertir el gráfico: ${config.titulo}`))
      imagen.src = temporal
    })
    const canvas = document.createElement('canvas')
    canvas.width = 1100
    canvas.height = 600
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('No se pudo crear el lienzo de exportación.')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(imagen, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png')
  } finally { URL.revokeObjectURL(temporal) }
}

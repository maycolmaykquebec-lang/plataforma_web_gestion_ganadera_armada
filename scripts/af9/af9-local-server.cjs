'use strict';
// RIO_BLANCO PASO 19.4: puente EXCLUSIVAMENTE LOCAL entre React y Excel de escritorio.
// No sirve para produccion. No recibe solicitudes de la red ni almacena datos en Supabase.
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const HOST = '127.0.0.1';
const PORT = 8789;
const ORIGINS = new Set(['http://localhost:5173', 'http://127.0.0.1:5173']);
const PROJECT = path.resolve(__dirname, '..', '..');
const GENERATOR = path.join(PROJECT, 'scripts', 'af9', 'generar-af9-original.ps1');
const ESPECIES = new Set(['todas', 'bovino', 'equino', 'caprino', 'mular', 'avicola', 'porcino']);
const LIMIT_BYTES = 1024 * 1024;
let busy = false;

function normalizarUnidad(v) {
  return String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\s_-]/g, '').toUpperCase();
}
function esRioBlanco(v) { return normalizarUnidad(v) === 'RIOBLANCO'; }
function errorUsuario(m) { const e = new Error(m); e.publicMessage = m; return e; }
function texto(v, max, campo) {
  if (typeof v !== 'string' || !v.trim() || v.length > max || /[\u0000-\u001f]/.test(v)) {
    throw errorUsuario(`Campo invalido: ${campo}.`);
  }
  return v.trim();
}
function validar(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) throw errorUsuario('Solicitud JSON invalida.');
  if (p.esquema !== 'RIO_BLANCO_AF9_PLANTILLA_ORIGINAL_V1' ||
      p.plantilla !== 'Form-AF-9 UOSPG RIO BLANCO (1).xlsx' ||
      p.tipo !== 'INVENTARIO_ACTUAL_NO_HISTORICO' ||
      p.unidad_codigo !== 'RIO-BLANCO' || !esRioBlanco(p.unidad_nombre)) {
    throw errorUsuario('La solicitud no corresponde al AF-9 original de RIO BLANCO.');
  }
  if (!ESPECIES.has(p.especie)) throw errorUsuario('Especie no permitida.');
  if (typeof p.fecha_referencia !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(p.fecha_referencia)) {
    throw errorUsuario('Fecha de referencia invalida.');
  }
  const fecha = new Date(`${p.fecha_referencia}T00:00:00Z`);
  if (Number.isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== p.fecha_referencia) {
    throw errorUsuario('Fecha de referencia invalida.');
  }
  if (!Array.isArray(p.responsables) || p.responsables.length !== 5) {
    throw errorUsuario('El AF-9 requiere exactamente cinco responsables.');
  }
  p.responsables.forEach((r, i) => {
    if (!r || typeof r !== 'object') throw errorUsuario('Responsable invalido.');
    texto(r.nombre, 80, `nombre ${i + 1}`);
    texto(r.cargo, 90, `cargo ${i + 1}`);
  });
  if (!Array.isArray(p.semovientes) || p.semovientes.length < 1 || p.semovientes.length > 200) {
    throw errorUsuario('Cantidad de semovientes invalida.');
  }
  const limites = { bovino: 44, equino: 19, caprino: 24, mular: 24, avicola: 24, porcino: 24 };
  const cuentas = Object.fromEntries(Object.keys(limites).map(k => [k, 0]));
  p.semovientes.forEach((a, i) => {
    if (!a || typeof a !== 'object' || !esRioBlanco(a.unidad) ||
        a.estado !== 'Activo' && a.estado !== 'activo' || !Object.hasOwn(limites, a.especie)) {
      throw errorUsuario(`Semoviente ${i + 1}: unidad, estado o especie no permitida.`);
    }
    if (p.especie !== 'todas' && a.especie !== p.especie) {
      throw errorUsuario('Hay animales fuera de la especie seleccionada.');
    }
    texto(a.codigo_rio_blanco, 80, `codigo ${i + 1}`);
    for (const campo of ['clase', 'sexo', 'raza']) {
      if (typeof a[campo] !== 'string' || a[campo].length > 80 || /[\u0000-\u001f]/.test(a[campo])) {
        throw errorUsuario(`Semoviente ${i + 1}: ${campo} invalido.`);
      }
    }
    if (a.fecha_nacimiento != null &&
        (typeof a.fecha_nacimiento !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(a.fecha_nacimiento))) {
      throw errorUsuario(`Semoviente ${i + 1}: nacimiento invalido.`);
    }
    cuentas[a.especie] += 1;
  });
  for (const [esp, max] of Object.entries(limites)) {
    if (cuentas[esp] > max) throw errorUsuario(`La plantilla original admite hasta ${max} animales de especie ${esp}.`);
  }
  return p;
}
function enviarJson(res, codigo, obj) {
  res.writeHead(codigo, { 'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(obj));
}
function ejecutarExcel(entrada, salida) {
  return new Promise((resolve, reject) => {
    const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', GENERATOR, '-Entrada', entrada, '-DirectorioSalida', salida];
    const proceso = spawn('powershell.exe', args, { cwd: PROJECT, windowsHide: true, shell: false });
    let stderr = '';
    let stdout = '';
    const limiteLog = 12000;
    proceso.stdout.on('data', d => { stdout = (stdout + d.toString('utf8')).slice(-limiteLog); });
    proceso.stderr.on('data', d => { stderr = (stderr + d.toString('utf8')).slice(-limiteLog); });
    const to = setTimeout(() => proceso.kill(), 120000);
    proceso.on('error', err => { clearTimeout(to); reject(err); });
    proceso.on('close', code => {
      clearTimeout(to);
      if (code !== 0) {
        // No mostrar nombres, cargos ni datos de semovientes en consola o en la respuesta.
        console.error(`Generador AF-9 terminó con código ${code}.`,
          stderr.includes('Microsoft Excel') || stdout.includes('Microsoft Excel') ? 'Revisar instalación de Excel.' : 'Revisar generador local.');
        reject(errorUsuario('No fue posible generar el Excel. Verifique que Excel esté instalado y cerrado, y que la plantilla privada exista.'));
      } else resolve();
    });
  });
}
async function convertir(p) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rio_blanco-af9-'));
  try {
    const entrada = path.join(temp, 'solicitud.json');
    const salida = path.join(temp, 'salida');
    fs.mkdirSync(salida);
    fs.writeFileSync(entrada, JSON.stringify(p), 'utf8');
    await ejecutarExcel(entrada, salida);
    const resultados = fs.readdirSync(salida).filter(f => f.toLowerCase().endsWith('.xlsx'));
    if (resultados.length !== 1) throw errorUsuario('Excel no produjo exactamente un libro de salida.');
    const buffer = fs.readFileSync(path.join(salida, resultados[0]));
    if (buffer.length < 1000 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
      throw errorUsuario('El archivo generado no parece un Excel valido.');
    }
    return { buffer, nombre: resultados[0] };
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const origen = req.headers.origin;
  const hostValido = req.headers.host === `${HOST}:${PORT}`;
  if (!hostValido || !ORIGINS.has(origen)) return enviarJson(res, 403, { error: 'Origen no permitido.' });
  res.setHeader('Access-Control-Allow-Origin', origen);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-RIO-BLANCO-AF9');
  if (req.url !== '/af9/xlsx') return enviarJson(res, 404, { error: 'Ruta no encontrada.' });
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  if (req.method !== 'POST' || req.headers['x-rio-blanco-af9'] !== 'local') {
    return enviarJson(res, 405, { error: 'Metodo no permitido.' });
  }
  if (busy) return enviarJson(res, 429, { error: 'Ya se está generando un Excel. Intente nuevamente al terminar.' });
  if (req.headers['content-type']?.split(';')[0] !== 'application/json') {
    return enviarJson(res, 415, { error: 'Se requiere JSON.' });
  }
  busy = true;
  try {
    let bytes = 0;
    const fragmentos = [];
    for await (const fragmento of req) {
      bytes += fragmento.length;
      if (bytes > LIMIT_BYTES) throw errorUsuario('La solicitud supera el limite permitido.');
      fragmentos.push(fragmento);
    }
    const p = validar(JSON.parse(Buffer.concat(fragmentos).toString('utf8')));
    if (!fs.existsSync(GENERATOR)) throw errorUsuario('No se encontró el generador AF-9 instalado.');
    if (process.platform !== 'win32') throw errorUsuario('Se necesita Windows y Microsoft Excel de escritorio.');
    const { buffer, nombre } = await convertir(p);
    res.writeHead(200, {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nombre}"`,
      'Content-Length': buffer.length,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Access-Control-Allow-Origin': origen,
      'Vary': 'Origin',
    });
    res.end(buffer);
    console.log('AF-9 Excel generado y enviado al navegador.');
  } catch (e) {
    const msg = e.publicMessage || (e instanceof SyntaxError ? 'La solicitud no contiene JSON válido.' : 'Ocurrió un error interno al generar el Excel.');
    console.error('AF-9:', msg);
    if (!res.headersSent) enviarJson(res, e.publicMessage ? 400 : 500, { error: msg });
    else res.end();
  } finally {
    busy = false;
  }
});
server.listen(PORT, HOST, () => {
  console.log('RIO_BLANCO AF-9: servicio local iniciado en http://127.0.0.1:8789');
  console.log('Mantenga abierta esta terminal mientras utilice la exportación de Excel. Ctrl+C para detenerlo.');
});
server.on('error', err => {
  if (err.code === 'EADDRINUSE') console.error('El puerto 8789 ya está ocupado; verifique si el servicio AF-9 ya está iniciado.');
  else console.error('Error del servicio local:', err.message);
  process.exitCode = 1;
});

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../services/supabaseClient'
import './InventarioGanaderoPage.css';
import { ESPECIES_HABILITADAS } from '../utils/especies'
import AF9OriginalPanel from '../components/inventario/AF9OriginalPanel.jsx';
import { generarParteAF9Provisional } from './generarParteAF9Provisional.js';

// RIO_BLANCO PASO 19.1: inventario de consulta. No escribe en Supabase.
// Todas las consultas usan la sesión actual; PostgreSQL RLS determina las filas autorizadas.
const ESPECIES = [
  { valor: 'bovino', titulo: 'Ganado vacuno' },
  { valor: 'equino', titulo: 'Ganado equino' },
  { valor: 'caprino', titulo: 'Ganado caprino' },
  { valor: 'mular', titulo: 'Ganado mular' },
  { valor: 'porcino', titulo: 'Ganado porcino' },
];
const norm = (s) => String(s ?? '').trim().toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const especieTitulo = (s) => ESPECIES.find((e) => e.valor === norm(s))?.titulo || (s || 'Sin especie');
const cantidad = (arreglo, condicion) => arreglo.filter(condicion).length;
const esActivo = (animal) => norm(animal.estado) === 'activo';
const TITULO = 'Inventario Ganadero';
const TAMANO_PAGINA = 12;
const TAMANO_BLOQUE = 500;
const MAX_FILAS = 20000;

// CSV de exportación de consulta: únicamente filas recibidas mediante RLS.
// Se antepone un apóstrofo a celdas que podrían ejecutarse como fórmulas.
function csvCelda(valor) {
  const original = String(valor ?? '');
  const protegido = /^[\s]*[=+\-@]/.test(original) ? `'${original}` : original;
  return `"${protegido.replace(/"/g, '""')}"`;
}
const CAMPOS_CSV = [
  ['Codigo', 'codigo'], ['Unidad operativa', 'unidad'], ['Especie', 'especie'],
  ['Clase', 'categoria'], ['Raza', 'raza'], ['Sexo', 'sexo'],
  ['Nacimiento', 'fecha_nacimiento'], ['Ingreso', 'fecha_ingreso'], ['Estado', 'estado'],
];

export default function InventarioGanaderoPage() {
  const [animales, setAnimales] = useState([]);
  const [unidades, setUnidades] = useState({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [incompleto, setIncompleto] = useState(false);
  const [recarga, setRecarga] = useState(0);
  const [unidad, setUnidad] = useState('todas');
  const [especie, setEspecie] = useState('todas');
  const [clase, setClase] = useState('todas');
  const [sexo, setSexo] = useState('todos');
  const [estado, setEstado] = useState('Activo');
  const [busqueda, setBusqueda] = useState('');
  const [pagina, setPagina] = useState(1);
  const [af9Mes, setAf9Mes] = useState(() => `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2, '0')}`);
  const [af9Especie, setAf9Especie] = useState('todas');
  const [af9Mensaje, setAf9Mensaje] = useState('');
  const [fechaConsulta, setFechaConsulta] = useState(null);

  useEffect(() => {
    let cancelado = false;
    async function cargar() {
      setCargando(true);
      setError('');
      setIncompleto(false);
      try {
        const acumulado = [];
        let terminado = false;
        for (let desde = 0; desde < MAX_FILAS; desde += TAMANO_BLOQUE) {
          const { data, error: fallo } = await supabase
            .from('semovientes')
            .select('id,codigo,codigo_activo,marca_ancla,unidad_id,especie,categoria,sexo,raza,estado,fecha_nacimiento,fecha_ingreso')
            .in('especie', ESPECIES_HABILITADAS)
            .order('id', { ascending: true })
            .range(desde, desde + TAMANO_BLOQUE - 1);
          if (fallo) throw fallo;
          acumulado.push(...(data || []));
          if (!data || data.length < TAMANO_BLOQUE) { terminado = true; break; }
        }
        const { data: nombres, error: falloUnidades } = await supabase
          .from('unidades_operativas')
          .select('id,codigo,nombre');
        if (cancelado) return;
        const mapa = {};
        if (!falloUnidades) {
          for (const u of nombres || []) mapa[String(u.id)] = u.nombre || u.codigo || `Unidad ${u.id}`;
        }
        setAnimales(acumulado);
        setFechaConsulta(new Date());
        setUnidades(mapa);
        setIncompleto(!terminado);
      } catch (e) {
        if (!cancelado) { setAnimales([]); setError(e?.message || 'No se pudo consultar el inventario autorizado.'); }
      } finally {
        if (!cancelado) setCargando(false);
      }
    }
    cargar();
    return () => { cancelado = true; };
  }, [recarga]);

  const unidadesVisibles = useMemo(() => {
    const ids = [...new Set(animales.map((a) => String(a.unidad_id)).filter((x) => x && x !== 'null'))];
    return ids.map((id) => ({ id, titulo: unidades[id] || `Unidad ${id}` }))
      .sort((a, b) => a.titulo.localeCompare(b.titulo, 'es'));
  }, [animales, unidades]);

  const alcance = useMemo(() => animales.filter((a) =>
    (unidad === 'todas' || String(a.unidad_id) === unidad) &&
    (especie === 'todas' || norm(a.especie) === especie)
  ), [animales, unidad, especie]);

  const clases = useMemo(() => [...new Set(alcance.map((a) => a.categoria).filter(Boolean))].sort((a,b) => a.localeCompare(b, 'es')), [alcance]);
  const filtrados = useMemo(() => alcance.filter((a) =>
    (estado === 'Todos' || norm(a.estado) === norm(estado)) &&
    (sexo === 'todos' || norm(a.sexo) === norm(sexo)) &&
    (clase === 'todas' || a.categoria === clase) &&
    (!busqueda.trim() || [a.codigo, a.raza, a.categoria].some((v) => norm(v).includes(norm(busqueda))))
  ), [alcance, estado, sexo, clase, busqueda]);

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / TAMANO_PAGINA));
  const paginaActual = Math.min(pagina, totalPaginas);
  const visibles = filtrados.slice((paginaActual - 1) * TAMANO_PAGINA, paginaActual * TAMANO_PAGINA);
  const resumen = useMemo(() => ({
    total: alcance.length,
    activos: cantidad(alcance, esActivo),
    bajas: cantidad(alcance, (a) => norm(a.estado) === 'baja'),
    hembras: cantidad(alcance, (a) => esActivo(a) && norm(a.sexo) === 'hembra'),
    machos: cantidad(alcance, (a) => esActivo(a) && norm(a.sexo) === 'macho'),
  }), [alcance]);
  const porEspecie = useMemo(() => ESPECIES.map((e) => {
    const fichas = animales.filter((a) =>
      (unidad === 'todas' || String(a.unidad_id) === unidad) && norm(a.especie) === e.valor
    );
    return {
      ...e, fichas, total: fichas.length,
      activos: cantidad(fichas, esActivo),
      bajas: cantidad(fichas, (a) => norm(a.estado) === 'baja'),
    };
  }), [animales, unidad]);
  const porClase = useMemo(() => {
    const cuenta = new Map();
    for (const a of alcance.filter(esActivo)) {
      const k = String(a.categoria || 'Sin clase');
      cuenta.set(k, (cuenta.get(k) || 0) + 1);
    }
    return [...cuenta].sort((a, b) => b[1] - a[1]);
  }, [alcance]);

  const exportacionDisponible = !cargando && !error && !incompleto;
  const filasGeneral = unidad === 'todas' ? animales : animales.filter((a) => String(a.unidad_id) === unidad);
  function descargarCSV(filas, nombre) {
    if (!exportacionDisponible || filas.length === 0) return;
    const cabecera = CAMPOS_CSV.map(([etiqueta]) => csvCelda(etiqueta)).join(';');
    const cuerpo = filas.map((animal) => {
      const registro = {
        ...animal,
        unidad: unidades[String(animal.unidad_id)] || `Unidad ${animal.unidad_id}`,
        especie: especieTitulo(animal.especie),
      };
      return CAMPOS_CSV.map(([, campo]) => csvCelda(registro[campo])).join(';');
    });
    const contenido = '\uFEFF' + [cabecera, ...cuerpo].join('\r\n') + '\r\n';
    const url = URL.createObjectURL(new Blob([contenido], { type: 'text/csv;charset=utf-8' }));
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = `INVENTARIO_${nombre}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // RIO_BLANCO PASO 19.3: el mes es una referencia, no un corte historico reconstruido.
  const filasAf9 = filasGeneral.filter((a) => af9Especie === 'todas' || norm(a.especie) === af9Especie);
  function descargarParteAf9() {
    if (!exportacionDisponible || filasAf9.length === 0) return;
    try {
      const unidadElegida = unidad === 'todas' ? 'Todas las unidades autorizadas' : (unidades[unidad] || `Unidad ${unidad}`);
      const pdf = generarParteAF9Provisional({
        animales: filasAf9, unidades,
        unidadNombre: unidadElegida,
        especie: af9Especie,
        mesReferencia: af9Mes,
        fechaConsulta: fechaConsulta || new Date(),
      });
      const url = URL.createObjectURL(pdf);
      const enlace = document.createElement('a');
      enlace.href = url;
      const especieArchivo = af9Especie === 'todas' ? 'general' : af9Especie;
      enlace.download = `AF9_PROVISIONAL_${af9Mes}_${especieArchivo}.pdf`;
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 2500);
      setAf9Mensaje(`PDF provisional generado con ${filasAf9.length} fichas autorizadas.`);
    } catch (e) {
      setAf9Mensaje(`No se pudo generar el PDF: ${e?.message || 'Error de exportacion.'}`);
    }
  }

  const resetPagina = (setter) => (valor) => { setter(valor); setPagina(1); };
  const limpiar = () => {
    setUnidad('todas'); setEspecie('todas'); setClase('todas'); setSexo('todos');
    setEstado('Activo'); setBusqueda(''); setPagina(1);
  };

  return (
    <div className="rio_blanco-inv">
      <header className="rio_blanco-inv-hero">
        <div className="rio_blanco-inv-kicker">ARMADA BOLIVIANA · DEPARTAMENTO VII · INVENTARIOS</div>
        <h1>{TITULO}</h1>
        <p>Existencias calculadas desde los semovientes que su sesión está autorizada a consultar.</p>
        <span className="rio_blanco-inv-hero-pill">Consulta protegida por RLS · Sin modificaciones</span>
      </header>

      {error && <div className="rio_blanco-inv-error" role="alert">No fue posible cargar los datos: {error}</div>}
      {incompleto && <div className="rio_blanco-inv-error" role="alert">La consulta superó {MAX_FILAS.toLocaleString('es-BO')} registros. Los totales mostrados son parciales. Se requiere agregación en PostgreSQL antes de utilizar este inventario.</div>}
      <section className="rio_blanco-inv-panel" aria-labelledby="inv-filtros">
        <div className="rio_blanco-inv-panel-head"><div><h2 id="inv-filtros">Consultar existencias</h2><p>Filtre por unidad, especie, clase, sexo y estado. La unidad es un filtro, no una autorización adicional.</p></div><button type="button" className="rio_blanco-inv-secondary" onClick={() => setRecarga((n) => n + 1)} disabled={cargando}>Actualizar datos</button></div>
        <div className="rio_blanco-inv-filtros">
          <label>Unidad operativa<select value={unidad} onChange={(e) => { setUnidad(e.target.value); setClase('todas'); setPagina(1); }}><option value="todas">Todas las unidades visibles</option>{unidadesVisibles.map((u) => <option key={u.id} value={u.id}>{u.titulo}</option>)}</select></label>
          <label>Especie<select value={especie} onChange={(e) => { setEspecie(e.target.value); setClase('todas'); setPagina(1); }}><option value="todas">Todas las especies</option>{ESPECIES.map((e) => <option key={e.valor} value={e.valor}>{e.titulo}</option>)}</select></label>
          <label>Clase<select value={clase} onChange={(e) => resetPagina(setClase)(e.target.value)}><option value="todas">Todas las clases</option>{clases.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
          <label>Sexo<select value={sexo} onChange={(e) => resetPagina(setSexo)(e.target.value)}><option value="todos">Todos</option><option value="Macho">Macho</option><option value="Hembra">Hembra</option></select></label>
          <label>Estado<select value={estado} onChange={(e) => resetPagina(setEstado)(e.target.value)}><option value="Activo">Activos</option><option value="Baja">Bajas</option><option value="Todos">Todos</option></select></label>
          <label>Buscar semoviente<input type="search" placeholder="Código, raza o clase" value={busqueda} onChange={(e) => resetPagina(setBusqueda)(e.target.value)} /></label>
        </div>
        <div className="rio_blanco-inv-actions"><button type="button" className="rio_blanco-inv-secondary" onClick={limpiar}>Limpiar filtros</button></div>
      </section>

      <section className="rio_blanco-inv-panel" aria-labelledby="inv-resumen">
        <div className="rio_blanco-inv-panel-head"><div><h2 id="inv-resumen">Resumen de existencias</h2><p>Indicadores por unidad y especie seleccionadas; las clases, estado, sexo y búsqueda se aplican al listado inferior.</p></div></div>
        <div className="rio_blanco-inv-kpis">
          {[['Total de fichas', resumen.total], ['Activos', resumen.activos], ['Bajas', resumen.bajas], ['Hembras activas', resumen.hembras], ['Machos activos', resumen.machos]].map(([titulo, valor]) =>
            <div className="rio_blanco-inv-kpi" key={titulo}><strong>{cargando || error ? '—' : valor.toLocaleString('es-BO')}</strong><span>{titulo}</span></div>
          )}
        </div>
        <h3>Existencias activas por especie</h3>
        <div className="rio_blanco-inv-especies">
          {porEspecie.map((e) => <button type="button" key={e.valor} aria-pressed={especie === e.valor} className={'rio_blanco-inv-especie' + (especie === e.valor ? ' elegida' : '')} onClick={() => {setEspecie(especie === e.valor ? 'todas' : e.valor);setClase('todas');setPagina(1);}}><span className="rio_blanco-inv-especie-titulo">{e.titulo}</span><strong>{cargando || error ? '—' : e.activos.toLocaleString('es-BO')}</strong><small>activos visibles</small></button>)}
        </div>
        <h3>Activos por clase</h3>
        {porClase.length ? <div className="rio_blanco-inv-clases">{porClase.map(([nombre, n]) => <span key={nombre}>{nombre}: <strong>{n}</strong></span>)}</div> : <p className="rio_blanco-inv-vacio">Sin animales activos en el alcance seleccionado.</p>}
      </section>

      <section className="rio_blanco-inv-panel" aria-labelledby="inv-especies-listado">
        <div className="rio_blanco-inv-panel-head"><div><h2 id="inv-especies-listado">Inventarios separados por especie</h2><p>Tarjetas con datos actuales y descarga CSV por especie. El CSV general respeta la unidad elegida, e incluye todas sus especies y estados.</p></div><button type="button" className="rio_blanco-inv-primary" disabled={!exportacionDisponible || filasGeneral.length === 0} onClick={() => descargarCSV(filasGeneral, 'Inventario_General')}>Exportar CSV general</button></div>
        <div className="rio_blanco-inv-bloques">
          {porEspecie.map((e) => <details key={e.valor} className="rio_blanco-inv-bloque" open={e.valor === 'bovino' ? true : undefined}>
            <summary><span><strong>{e.titulo}</strong><small>Total: {cargando || error ? '—' : e.total} · Activos: {cargando || error ? '—' : e.activos} · Bajas: {cargando || error ? '—' : e.bajas}</small></span><span className="rio_blanco-inv-expansion">Mostrar listado</span></summary>
            <div className="rio_blanco-inv-bloque-cuerpo">
              <button type="button" className="rio_blanco-inv-secondary" disabled={!exportacionDisponible || e.total === 0} onClick={() => descargarCSV(e.fichas, `Listado_${e.valor}`)}>Descargar listado CSV</button>
              <div className="rio_blanco-inv-tabla-scroll" tabIndex="0" role="region" aria-label={`Listado de ${e.titulo} con desplazamiento horizontal`}>
                <table><thead><tr><th>Código</th><th>Clase</th><th>Raza</th><th>Sexo</th><th>Nacimiento</th><th>Unidad</th><th>Estado</th></tr></thead><tbody>
                  {e.fichas.slice(0, 10).map((a) => <tr key={a.id}><td><strong>{a.codigo}</strong></td><td>{a.categoria || '—'}</td><td>{a.raza || '—'}</td><td>{a.sexo || '—'}</td><td>{a.fecha_nacimiento || '—'}</td><td>{unidades[String(a.unidad_id)] || `Unidad ${a.unidad_id}`}</td><td>{a.estado}</td></tr>)}
                  {!cargando && !error && e.total === 0 && <tr><td colSpan="7" className="rio_blanco-inv-vacio">Sin registros de esta especie.</td></tr>}
                </tbody></table>
              </div>
              {e.total > 10 && <p className="rio_blanco-inv-nota">Vista previa de 10 registros. La descarga incluye las {e.total} fichas visibles de esta especie.</p>}
            </div>
          </details>)}
        </div>
      </section>

      {/* AF-09 para las tres unidades operativas; selección aislada de la consulta general. */}
      <AF9OriginalPanel animales={animales} unidades={unidades} unidadSeleccionada={unidad} disponible={exportacionDisponible} />

      <section className="rio_blanco-inv-panel" aria-labelledby="inv-tabla">
        <div className="rio_blanco-inv-panel-head"><div><h2 id="inv-tabla">Listado filtrado del inventario</h2><p>{cargando ? 'Consultando datos…' : error ? 'Consulta no disponible.' : `${filtrados.length.toLocaleString('es-BO')} semovientes coinciden con los filtros.`}</p></div><div className="rio_blanco-inv-head-acciones"><span className="rio_blanco-inv-total">{cargando || error ? '—' : filtrados.length} encontrados</span><button type="button" className="rio_blanco-inv-primary" disabled={!exportacionDisponible || filtrados.length === 0} onClick={() => descargarCSV(filtrados, 'Inventario_Filtrado')}>Exportar CSV filtrado</button></div></div>
        <div className="rio_blanco-inv-tabla-scroll" tabIndex="0" role="region" aria-label="Tabla del inventario con desplazamiento horizontal">
          <table><thead><tr><th>Código</th><th>Unidad</th><th>Especie</th><th>Clase</th><th>Sexo</th><th>Raza</th><th>Estado</th><th>Nacimiento</th><th>Ingreso</th></tr></thead><tbody>
            {visibles.map((a) => <tr key={a.id}><td><strong>{a.codigo}</strong></td><td>{unidades[String(a.unidad_id)] || `Unidad ${a.unidad_id}`}</td><td>{especieTitulo(a.especie)}</td><td>{a.categoria || '—'}</td><td>{a.sexo || '—'}</td><td>{a.raza || '—'}</td><td><span className={'rio_blanco-inv-estado ' + (esActivo(a) ? 'activo' : '')}>{a.estado || '—'}</span></td><td>{a.fecha_nacimiento || '—'}</td><td>{a.fecha_ingreso || '—'}</td></tr>)}
            {!cargando && !error && visibles.length === 0 && <tr><td colSpan="9" className="rio_blanco-inv-vacio">No se encontraron semovientes con estos filtros.</td></tr>}
            {cargando && <tr><td colSpan="9" className="rio_blanco-inv-vacio">Cargando inventario protegido…</td></tr>}
            {error && <tr><td colSpan="9" className="rio_blanco-inv-vacio">Consulta no disponible. Revise la sesión y los permisos.</td></tr>}
          </tbody></table>
        </div>
        <footer className="rio_blanco-inv-paginacion"><span>Página {paginaActual} de {totalPaginas}</span><div><button type="button" disabled={paginaActual <= 1 || cargando} onClick={() => setPagina((p) => Math.max(1,p-1))}>Anterior</button><button type="button" disabled={paginaActual >= totalPaginas || cargando} onClick={() => setPagina((p) => p+1)}>Siguiente</button></div></footer>
        <p className="rio_blanco-inv-nota">Este inventario presenta el estado actual de las fichas visibles de <code>semovientes</code>. No calcula existencias históricas ni sustituye los movimientos y altas/bajas que desarrollaremos posteriormente. Las exportaciones CSV contienen exclusivamente las filas que Supabase devuelve para esta sesión según RLS. No constituyen un parte oficial AF-9.</p>
      </section>
    </div>
  );
}

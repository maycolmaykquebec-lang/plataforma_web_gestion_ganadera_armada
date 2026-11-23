/* RIO_BLANCO PASO 19.3 - PDF provisional del inventario actual.
   Sin bibliotecas externas y sin escrituras a Supabase.
   Este documento NO es el formato AF-9 institucional aprobado.
   Los datos son exclusivamente los recibidos por la consulta RLS del cliente. */

const W = 595.28;
const H = 841.89;
const M = 37;
const CONTENT_W = W - 2 * M;
const ESPECIES = [
  ['bovino','Ganado vacuno'], ['equino','Ganado equino'],
  ['caprino','Ganado caprino'], ['mular','Ganado mular'],
  ['porcino','Ganado porcino'],
];
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const pal = { azul:[0.06,0.20,0.33], medio:[0.10,0.38,0.62], gris:[0.33,0.42,0.51], claro:[0.91,0.95,0.98], blanco:[1,1,1], ambar:[1,.94,.77], borde:[.77,.84,.91] };
const norm = v => String(v ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const esActivo = a => norm(a.estado) === 'activo';
const fechaLocal = value => {
  if (!value) return '-';
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(value);
};
const fechaHora = d => new Intl.DateTimeFormat('es-BO', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(d);
const especieNombre = code => ESPECIES.find(([c])=>c===norm(code))?.[1] || String(code || 'Sin especie');
const limpio = v => String(v ?? '-').replace(/[\u0000-\u001F\u007F]/g,' ').replace(/\s+/g,' ').trim() || '-';

// Codificacion de cadenas para fuentes PDF Helvetica / WinAnsi.
const extras = new Map([['€',128],['‚',130],['ƒ',131],['„',132],['…',133],['†',134],['‡',135],['ˆ',136],['‰',137],['Š',138],['‹',139],['Œ',140],['Ž',142],['‘',145],['’',146],['“',147],['”',148],['•',149],['–',150],['—',151],['˜',152],['™',153],['š',154],['›',155],['œ',156],['ž',158],['Ÿ',159]]);
function esc(v) {
  let out = '';
  for (const char of limpio(v)) {
    const cp = char.codePointAt(0);
    const byte = (cp >= 32 && cp <= 126) || (cp >= 160 && cp <= 255) ? cp : extras.get(char);
    if (byte === undefined) { out += '?'; continue; }
    if (byte === 40 || byte === 41 || byte === 92) out += '\\' + String.fromCharCode(byte);
    else if (byte > 126) out += '\\' + byte.toString(8).padStart(3,'0');
    else out += String.fromCharCode(byte);
  }
  return out;
}
const colorCmd = ([r,g,b], stroke = false) => `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} ${stroke ? 'RG' : 'rg'}`;
function text(lines, x, top, value, size = 10, bold = false, color = pal.azul) {
  lines.push(`${colorCmd(color)} BT /${bold ? 'F2':'F1'} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${(H - top - size).toFixed(2)} Tm (${esc(value)}) Tj ET`);
}
function rect(lines,x,top,w,h,color){lines.push(`${colorCmd(color)} ${x.toFixed(2)} ${(H-top-h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);}
function line(lines,x,top,w,color=pal.borde){lines.push(`${colorCmd(color,true)} .6 w ${x.toFixed(2)} ${(H-top).toFixed(2)} m ${(x+w).toFixed(2)} ${(H-top).toFixed(2)} l S`);}
function approximatedWidth(word, size){
  return [...String(word)].reduce((n,ch)=>n + (/[MW@%]/.test(ch)?0.82:/[il I.,:;!\|]/.test(ch)?0.28:0.51)*size,0);
}
function wrap(value,maxW,size,maxLines=3){
  const words=limpio(value).split(' ');const out=[]; let current='';
  const chunks=[];
  for(let word of words){
    while(approximatedWidth(word,size)>maxW && word.length>1){
      let part=''; while(word.length && approximatedWidth(part+word[0],size)<=maxW-3){part+=word[0];word=word.slice(1);}
      if(!part){part=word[0];word=word.slice(1);} chunks.push(part);
    }
    if(word)chunks.push(word);
  }
  for(const word of chunks){
    const candidate=current?current+' '+word:word;
    if(approximatedWidth(candidate,size)>maxW && current){out.push(current);current=word;}else current=candidate;
  }
  if(current)out.push(current);
  if(out.length>maxLines){
    const cut=out.slice(0,maxLines);
    let last=cut[maxLines-1]; while(last.length>1 && approximatedWidth(last+'...',size)>maxW){last=last.slice(0,-1);}
    cut[maxLines-1]=last+'...';return cut;
  }
  return out.length?out:['-'];
}
function buildPdf(pageBodies){
  const objects=['', '<< /Type /Catalog /Pages 2 0 R >>','',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'];
  const kids=[];
  const total=pageBodies.length;
  for(let i=0;i<total;i++){
    const pageId=objects.length, contentId=pageId+1;
    kids.push(`${pageId} 0 R`);
    const lines=[...pageBodies[i]];
    line(lines,M,805,CONTENT_W);
    text(lines,M,811,'INVENTARIO PROVISIONAL - NO OFICIAL',8,false,pal.gris);
    text(lines,W-105,811,`Pagina ${i+1} de ${total}`,8,true,pal.gris);
    const stream=lines.join('\n')+'\n';
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`);
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
  }
  objects[2]=`<< /Type /Pages /Count ${total} /Kids [${kids.join(' ')}] >>`;
  let binary='%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets=[0];
  for(let i=1;i<objects.length;i++){
    offsets.push(binary.length);
    binary+=`${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref=binary.length;
  binary+=`xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for(let i=1;i<objects.length;i++)binary+=`${String(offsets[i]).padStart(10,'0')} 00000 n \n`;
  binary+=`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  return new Blob([bytes],{type:'application/pdf'});
}

export function generarParteAF9Provisional({animales, unidades={}, unidadNombre='Todas las unidades visibles', especie='todas', mesReferencia, fechaConsulta=new Date()}){
  if(!Array.isArray(animales)) throw new Error('Inventario no disponible para generar el PDF.');
  const match=String(mesReferencia).match(/^(\d{4})-(\d{2})$/);
  if(!match||Number(match[2])<1||Number(match[2])>12)throw new Error('Seleccione un mes de referencia valido.');
  if(animales.length===0)throw new Error('No hay registros autorizados para este parte.');
  if(animales.length>20000)throw new Error('No se puede exportar un inventario parcial o superior al limite de consulta.');
  const mes=`${MESES[Number(match[2])-1]} de ${match[1]}`;
  const fecha=fechaConsulta instanceof Date && !isNaN(fechaConsulta)? fechaConsulta:new Date(fechaConsulta);
  if(Number.isNaN(fecha.getTime()))throw new Error('Fecha de consulta invalida.');
  const fichas=[...animales].sort((a,b)=>`${a.especie||''}|${a.codigo||''}`.localeCompare(`${b.especie||''}|${b.codigo||''}`,'es'));
  const total=fichas.length, activos=fichas.filter(esActivo).length, bajas=fichas.filter(a=>norm(a.estado)==='baja').length;
  const otro=total-activos-bajas;
  const pages=[];let current=null;let y=0;
  function nextPage(){
    current=[];pages.push(current);
    rect(current,0,0,W,92,pal.azul);
    text(current,M,17,'ARMADA BOLIVIANA - DEPARTAMENTO VII',9,true,pal.blanco);
    text(current,M,33,'PARTE AF-9 - PROVISIONAL',19,true,pal.blanco);
    text(current,M,60,'CORTE DE INVENTARIO ACTUAL - DOCUMENTO NO OFICIAL',9,true,[.78,.89,.96]);
    rect(current,M,103,CONTENT_W,43,pal.ambar);
    text(current,M+10,111,'ATENCION: Este parte NO acredita saldos ni movimientos del mes indicado.',9,true,[.46,.29,.03]);
    text(current,M+10,127,'Se genera con las fichas visibles al momento de la consulta, segun RLS.',8,false,[.46,.29,.03]);
    y=158;
  }
  function assure(height){if(!current || y+height>789)nextPage();}
  function subsection(label){assure(34);rect(current,M,y,CONTENT_W,25,pal.claro);text(current,M+9,y+6,label,11,true,pal.azul);y+=33;}
  nextPage();
  text(current,M,y,`Mes de referencia (informativo): ${mes}`,10,true);y+=18;
  text(current,M,y,`Consulta/corte real: ${fechaHora(fecha)}`,10);y+=17;
  text(current,M,y,`Unidad: ${limpio(unidadNombre)}`,10);y+=17;
  text(current,M,y,`Especie: ${especie==='todas'?'Inventario general - cinco especies':especieNombre(especie)}`,10);y+=29;
  subsection('RESUMEN DE FICHAS VISIBLES');
  const stat=[['TOTAL',total],['ACTIVAS',activos],['BAJAS',bajas],['OTROS ESTADOS',otro]];
  const bw=(CONTENT_W-21)/4;
  for(let i=0;i<stat.length;i++){
    const x=M+i*(bw+7);rect(current,x,y,bw,54,[.95,.975,.997]);
    text(current,x+10,y+7,stat[i][0],8,true,pal.gris);
    text(current,x+10,y+22,String(stat[i][1]),20,true,pal.medio);
  }
  y+=69;
  subsection('DETALLE POR ESPECIE');
  rect(current,M,y,CONTENT_W,24,pal.claro);
  text(current,M+10,y+7,'ESPECIE',9,true);text(current,380,y+7,'TOTAL',9,true);
  text(current,438,y+7,'ACTIVOS',9,true);text(current,501,y+7,'BAJAS',9,true);
  y+=27;
  const grupos=especie==='todas'?ESPECIES:ESPECIES.filter(([e])=>e===norm(especie));
  for(const [code,name] of grupos){
    const rows=fichas.filter(a=>norm(a.especie)===code);
    assure(27);
    text(current,M+10,y+7,name,10);text(current,384,y+7,String(rows.length),10);
    text(current,445,y+7,String(rows.filter(esActivo).length),10);
    text(current,508,y+7,String(rows.filter(a=>norm(a.estado)==='baja').length),10);
    line(current,M,y+25,CONTENT_W);y+=27;
  }
  y+=12;
  subsection('FICHAS INDIVIDUALES');
  text(current,M,y,'Listado de fichas consultables; NO es una reconstruccion historica mensual.',9,false,pal.gris);y+=19;
  const cols=[
    {t:'CODIGO',x:40,w:48,get:a=>a.codigo},
    {t:'UNIDAD',x:90,w:105,get:a=>unidades[String(a.unidad_id)]||`Unidad ${a.unidad_id}`},
    {t:'ESPECIE',x:198,w:82,get:a=>especieNombre(a.especie)},
    {t:'CLASE',x:283,w:74,get:a=>a.categoria},
    {t:'SEXO',x:360,w:44,get:a=>a.sexo},
    {t:'ESTADO',x:407,w:53,get:a=>a.estado},
    {t:'NACIMIENTO',x:463,w:94,get:a=>fechaLocal(a.fecha_nacimiento)}
  ];
  function head(){assure(23);rect(current,M,y,CONTENT_W,21,pal.claro);for(const c of cols)text(current,c.x,y+6,c.t,7,true);y+=23;}
  head();
  for(const a of fichas){
    const rowLines=cols.map(c=>wrap(c.get(a),c.w-5,8,3));
    const n=Math.max(...rowLines.map(x=>x.length));const height= Math.max(24, 6+n*10+4);
    if(y+height>785){nextPage();subsection('FICHAS INDIVIDUALES (CONTINUACION)');head();}
    for(let j=0;j<cols.length;j++){
      const c=cols[j]; rowLines[j].forEach((s,k)=>text(current,c.x,y+4+k*10,s,8,j===0));
    }
    line(current,M,y+height-2,CONTENT_W);y+=height;
  }
  assure(60);
  y+=13;
  text(current,M,y,`Fichas incluidas: ${total}. Fuente: semovientes (filas autorizadas por la sesion).`,9,true);y+=15;
  text(current,M,y,'Sin firma, sin validez institucional y sin movimientos mensuales.',9,false,pal.gris);
  return buildPdf(pages);
}

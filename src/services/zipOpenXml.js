/** ZIP OOXML mínimo: lee entradas STORED/DEFLATE, vuelve a escribir STORED.
 * Sin dependencia adicional; usa DecompressionStream de navegadores actuales.
 * El archivo de Word sigue siendo totalmente editable. */
const sig=(d,i)=>d.getUint32(i,true)
const u16=(d,i)=>d.getUint16(i,true)
const td=new TextDecoder('utf-8')
const te=new TextEncoder()

async function inflarDeflate(bytes){
  if(typeof DecompressionStream!=='function') throw new Error('El navegador no admite descompresión ZIP. Utilice una versión actualizada de Edge o Chrome.')
  const flujo=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(flujo).arrayBuffer())
}

export async function abrirDocx(buffer){
  const bytes=new Uint8Array(buffer)
  const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength)
  let eocd=-1
  for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--){if(sig(dv,i)===0x06054b50){eocd=i;break}}
  if(eocd<0)throw new Error('La plantilla no es un Word DOCX válido.')
  const registros=u16(dv,eocd+10), posicion=dv.getUint32(eocd+16,true)
  let cursor=posicion
  const lista=[]
  for(let n=0;n<registros;n++){
    if(sig(dv,cursor)!==0x02014b50)throw new Error('Directorio de Word incompleto.')
    const metodo=u16(dv,cursor+10)
    const longitud=dv.getUint32(cursor+20,true)
    const nombreLen=u16(dv,cursor+28), extraLen=u16(dv,cursor+30), comentarioLen=u16(dv,cursor+32)
    const local=dv.getUint32(cursor+42,true)
    const nombre=td.decode(bytes.subarray(cursor+46,cursor+46+nombreLen))
    if(sig(dv,local)!==0x04034b50)throw new Error('Entrada de Word dañada.')
    const comienzo=local+30+u16(dv,local+26)+u16(dv,local+28)
    const contenido=bytes.subarray(comienzo,comienzo+longitud)
    let datos
    if(metodo===0)datos=new Uint8Array(contenido)
    else if(metodo===8)datos=await inflarDeflate(contenido)
    else throw new Error(`Compresión no compatible para ${nombre}`)
    lista.push({nombre,datos})
    cursor+=46+nombreLen+extraLen+comentarioLen
  }
  return lista
}
let tablaCRC
function crc32(bytes){
  if(!tablaCRC){tablaCRC=Array.from({length:256},(_,i)=>{
    let c=i;for(let k=0;k<8;k++) c=c&1 ? (0xedb88320^(c>>>1)) : (c>>>1);return c>>>0
  })}
  let c=0xffffffff
  for(const b of bytes)c=tablaCRC[(c^b)&255]^(c>>>8)
  return (c^0xffffffff)>>>0
}
function w16(view,pos,v){view.setUint16(pos,v,true)}
function w32(view,pos,v){view.setUint32(pos,v,true)}
export function crearDocx(archivos){
  const entradas=archivos.map(({nombre,datos})=>({nombre:te.encode(nombre),datos,crc:crc32(datos)}))
  const localTotal=entradas.reduce((a,x)=>a+30+x.nombre.length+x.datos.length,0)
  const centralTotal=entradas.reduce((a,x)=>a+46+x.nombre.length,0)
  const bytes=new Uint8Array(localTotal+centralTotal+22),d=new DataView(bytes.buffer)
  let pos=0,off=0
  for(const x of entradas){
    x.off=pos
    w32(d,pos,0x04034b50);w16(d,pos+4,20);w16(d,pos+6,0x800);w16(d,pos+8,0)
    w16(d,pos+10,0);w16(d,pos+12,0);w32(d,pos+14,x.crc)
    w32(d,pos+18,x.datos.length);w32(d,pos+22,x.datos.length)
    w16(d,pos+26,x.nombre.length);w16(d,pos+28,0)
    bytes.set(x.nombre,pos+30);bytes.set(x.datos,pos+30+x.nombre.length)
    pos+=30+x.nombre.length+x.datos.length
  }
  const centralInicio=pos
  for(const x of entradas){
    w32(d,pos,0x02014b50);w16(d,pos+4,20);w16(d,pos+6,20)
    w16(d,pos+8,0x800);w16(d,pos+10,0);w16(d,pos+12,0);w16(d,pos+14,0)
    w32(d,pos+16,x.crc);w32(d,pos+20,x.datos.length);w32(d,pos+24,x.datos.length)
    w16(d,pos+28,x.nombre.length);w16(d,pos+30,0);w16(d,pos+32,0)
    w16(d,pos+34,0);w16(d,pos+36,0);w32(d,pos+38,0);w32(d,pos+42,x.off)
    bytes.set(x.nombre,pos+46);pos+=46+x.nombre.length
  }
  w32(d,pos,0x06054b50);w16(d,pos+4,0);w16(d,pos+6,0)
  w16(d,pos+8,entradas.length);w16(d,pos+10,entradas.length)
  w32(d,pos+12,pos-centralInicio);w32(d,pos+16,centralInicio);w16(d,pos+20,0)
  if(pos+22!==bytes.length)throw new Error('Error interno al ensamblar el Word.')
  return bytes
}

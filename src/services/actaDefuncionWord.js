import { abrirDocx, crearDocx } from './zipOpenXml.js'

const MESES=['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE']
const UNIDADES={
  'RIO-BLANCO':{nombre:'RIO BLANCO',ciudad:'Rio Blanco'},
  'TAMARINERO':{nombre:'TAMARINERO',ciudad:'Tamarinero'},
  'MAMORE':{nombre:'MAMORE',ciudad:'Mamoré'},
}
const UNIDADES_NOMBRE={ 'RÍO BLANCO':'RIO-BLANCO', 'RIO BLANCO':'RIO-BLANCO', 'MAMORÉ':'MAMORE', 'MAMORE':'MAMORE','TAMARINERO':'TAMARINERO' }
export function unidadDocumento(unidad){
  const codigo=String(unidad?.codigo||'').trim().toUpperCase() || UNIDADES_NOMBRE[String(unidad?.nombre||'').toUpperCase()]
  if(!UNIDADES[codigo])throw new Error('No se reconoce la unidad de la baja. No se generará un membrete incorrecto.')
  return UNIDADES[codigo]
}
function enteroEnLetras(n){
 const u=['CERO','UNO','DOS','TRES','CUATRO','CINCO','SEIS','SIETE','OCHO','NUEVE','DIEZ','ONCE','DOCE','TRECE','CATORCE','QUINCE','DIECISÉIS','DIECISIETE','DIECIOCHO','DIECINUEVE','VEINTE','VEINTIUNO','VEINTIDÓS','VEINTITRÉS','VEINTICUATRO','VEINTICINCO','VEINTISÉIS','VEINTISIETE','VEINTIOCHO','VEINTINUEVE']
 if(n<=29)return u[n]||''
 if(n<100){const dec=['','','','TREINTA','CUARENTA','CINCUENTA','SESENTA','SETENTA','OCHENTA','NOVENTA'];return dec[Math.floor(n/10)]+(n%10?' Y '+u[n%10]:'')}
 if(n===100)return 'CIEN'
 if(n<1000){const cent=['','CIENTO','DOSCIENTOS','TRESCIENTOS','CUATROCIENTOS','QUINIENTOS','SEISCIENTOS','SETECIENTOS','OCHOCIENTOS','NOVECIENTOS'];return cent[Math.floor(n/100)]+(n%100?' '+enteroEnLetras(n%100):'')}
 if(n<2000)return 'MIL'+(n%1000?' '+enteroEnLetras(n%1000):'')
 return enteroEnLetras(Math.floor(n/1000))+' MIL'+(n%1000?' '+enteroEnLetras(n%1000):'')
}
function fechaPartes(iso){
 const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(iso||'')
 if(!m)throw new Error('La fecha de la baja no está disponible.')
 return {anio:Number(m[1]),mes:Number(m[2]),dia:Number(m[3])}
}
function edad(animal,fecha){
 if(!animal?.fecha_nacimiento)return ''
 const a=fechaPartes(fecha),n=fechaPartes(animal.fecha_nacimiento)
 let años=a.anio-n.anio
 if(a.mes<n.mes||(a.mes===n.mes&&a.dia<n.dia))años--
 return años>=0?` ${años} AÑO${años===1?'':'S'}`:''
}
export function rutaFotoBaja(baja){return `${baja.unidad_id}/${baja.id}/evidencia.jpg`}
export async function fotoComoJpeg(blob){
 if(!blob || blob.size<=0)throw new Error('No se pudo leer la fotografía de la baja.')
 const url=URL.createObjectURL(blob)
 try{
  const img=new Image();img.src=url;await img.decode()
  const c=document.createElement('canvas');c.width=1040;c.height=780
  const ctx=c.getContext('2d');if(!ctx)throw new Error('No hay soporte de imágenes en este navegador.')
  ctx.fillStyle='#fff';ctx.fillRect(0,0,1040,780)
  const escala=Math.min(1040/img.naturalWidth,780/img.naturalHeight)
  const w=Math.round(img.naturalWidth*escala),h=Math.round(img.naturalHeight*escala)
  ctx.drawImage(img,Math.round((1040-w)/2),Math.round((780-h)/2),w,h)
  const convertido=await new Promise(resolve=>c.toBlob(resolve,'image/jpeg',0.83))
  if(!convertido||convertido.size>5*1024*1024)throw new Error('No se pudo procesar la fotografía dentro del límite de 5 MB.')
  return convertido
 }finally{URL.revokeObjectURL(url)}
}
function xmlEscape(valor){return String(valor??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]))}
export function datosActa(baja,animal,formulario){
 const un=unidadDocumento(baja.unidad)
 const {anio,mes,dia}=fechaPartes(formulario.fechaActa)
 const def=fechaPartes(baja.fecha)
 const mesTexto=MESES[mes-1]
 if(!mesTexto||dia<1||dia>31)throw new Error('La fecha de la baja es inválida.')
 const partesFirmante = (grado, nombre, cargo) => {
  const g=String(grado||'').trim().replace(/\s+/g,' ')
  const n=String(nombre||'').trim().replace(/\s+/g,' ')
  if(!g||!n)throw new Error(`Complete el grado y nombre del ${cargo}.`)
  if(g.length>30||n.length>85||(g.length+n.length+1)>105)throw new Error(`Acorte el grado o nombre del ${cargo} para conservar el formato del acta.`)
  if(/\(GRADO|\(NOMBRE|PENDIENTE/i.test(g+' '+n))throw new Error(`Ingrese los datos reales del ${cargo}, no los textos de ejemplo.`)
  return `${g} ${n}`
 }
 const nombreVaquero=partesFirmante(formulario.gradoVaquero, formulario.nombreVaquero,'vaquero')
 const nombreJefe=partesFirmante(formulario.gradoJefe, formulario.nombreJefe,'jefe')
 const cargoVaquero=`VAQUERO DE LA U.O.S.P.G. “${un.nombre}”`
 const cargoJefe=`JEFE DE LA U.O.S.P.G. “${un.nombre}”`
 const d=baja.detalles||{}
 const animalInfo=[animal.categoria,animal.sexo,animal.raza,edad(animal,baja.fecha),formulario.descripcion.trim()].filter(Boolean).join(' ').toUpperCase()
 const causa=formulario.lugarCausa.trim()
 if(!causa)throw new Error('Complete el lugar y la causa del fallecimiento.')
 const codigo=animal.codigo_activo || animal.codigo
 return {
  UNIDAD:un.nombre,
  NUM_ACTA:`${formulario.numeroActa.trim()} / ${anio}`,
  INTRO:`EN EL CENTRO DE PRODUCCION GANADERA “${un.nombre}”, DEL DEPARTAMENTO DE BENI A LOS ${enteroEnLetras(dia)} DÍAS DEL MES DE ${mesTexto} DEL ${enteroEnLetras(anio)} AÑOS, SE HICIERON PRESENTES EN INSTALACIONES DE LA UNIDAD OPERATIVA SERVICIOS DE PRODUCCIÓN GANADERA “${un.nombre}” LOS SRES.:`,
  VAQUERO_NOMBRE:nombreVaquero,
  JEFE_NOMBRE:nombreJefe,
  VAQUERO_CARGO:cargoVaquero,
  VAQUERO_CARGO_CORTO:`VAQUERO U.O.S.P.G. “${un.nombre}”`,
  JEFE_CARGO:cargoJefe,
  INFORME:formulario.numeroInforme.trim() || 'NO REGISTRADO',
  ESPECIE:({bovino:'BOVINO',equino:'EQUINO',caprino:'CAPRINO',mular:'MULAR',avicola:'AVÍCOLA',porcino:'PORCINO'})[animal.especie] || String(animal.especie).toUpperCase(),
  CIUDAD_FECHA:`${un.ciudad}, ${dia} de ${mesTexto.toLowerCase()} del ${anio}`,
  CODIGO_ACTIVO:codigo,
  MARCADO:d.marcado || 'S/A',
  FECHA_CORTA:`${String(def.dia).padStart(2,'0')}-${MESES[def.mes-1].slice(0,3)}-${String(def.anio).slice(-2)}`,
  HORA:d.hora||'NO REG.',
  DESCRIPCION_ANIMAL:animalInfo.replace(/\s+/g,' ').trim(),
  LUGAR_CAUSA:causa.toUpperCase(),
 }
}
export async function descargarActaWord({baja,animal,formulario,fotoBlob}){
 const valores=datosActa(baja,animal,formulario)
 if(!fotoBlob || fotoBlob.size===0){
  throw new Error(`No hay fotografía de evidencia disponible para la baja N.º ${baja.id} de ${valores.UNIDAD}. Abra la baja correcta o compruebe su archivo en Storage. No se descargará el Word con una imagen de reserva.`)
 }
 // El archivo almacenado es JPEG incluso si se seleccionó originalmente WebP o PNG.
 // Convertir de nuevo garantiza una imagen JPEG válida antes de incrustarla en el DOCX.
 const jpg=await fotoComoJpeg(fotoBlob)
 const fotoBytes=new Uint8Array(await jpg.arrayBuffer())
 if(fotoBytes.length<100 || fotoBytes[0]!==0xff || fotoBytes[1]!==0xd8 || fotoBytes[fotoBytes.length-2]!==0xff || fotoBytes[fotoBytes.length-1]!==0xd9){
  throw new Error('La fotografía recuperada no pudo convertirse a un JPEG válido para Word.')
 }
 const base=import.meta.env.BASE_URL||'/'
 const respuesta=await fetch(`${base}plantillas/acta_defuncion_institucional.docx`,{cache:'no-store'})
 if(!respuesta.ok)throw new Error('No se encontró la plantilla Word del acta. Revise la instalación.')
 const archivos=await abrirDocx(await respuesta.arrayBuffer())
 const encontrados=new Set()
 let fotografiaInsertada=false
 for(const archivo of archivos){
  if(archivo.nombre==='word/document.xml'||archivo.nombre==='word/header1.xml'){
   let xml=new TextDecoder('utf-8').decode(archivo.datos)
   for(const [clave,valor] of Object.entries(valores)){
    const token=`{{${clave}}}`
    if(xml.includes(token)){encontrados.add(clave);xml=xml.split(token).join(xmlEscape(valor))}
   }
   archivo.datos=new TextEncoder().encode(xml)
  }
  if(archivo.nombre==='word/media/image2.jpeg'){
   archivo.datos=fotoBytes
   fotografiaInsertada=true
  }
 }
 if(!fotografiaInsertada)throw new Error('La plantilla Word no contiene el espacio correcto para insertar la fotografía.')
 const sinToken=Object.keys(valores).filter(k=>!encontrados.has(k))
 if(sinToken.length)throw new Error('La plantilla no contiene todos los campos necesarios: '+sinToken.join(', '))
 // Verificar que la sustitución no dejó marcadores institucionales pendientes.
 for(const archivo of archivos){
  if((archivo.nombre==='word/document.xml'||archivo.nombre==='word/header1.xml') && /\{\{[A-Z_]+\}\}/.test(new TextDecoder('utf-8').decode(archivo.datos))){
   throw new Error('El acta conserva textos de ejemplo. Se detuvo la descarga para evitar datos incorrectos.')
  }
 }
 const blob=new Blob([crearDocx(archivos)],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'})
 const enlace=document.createElement('a'),url=URL.createObjectURL(blob)
 enlace.href=url;enlace.download=`ACTA_DEFUNCION_${valores.UNIDAD.replace(/\s/g,'_')}_${String(animal.codigo).replace(/[^a-zA-Z0-9_-]/g,'_')}_${baja.id}.docx`
 document.body.append(enlace);enlace.click();enlace.remove();setTimeout(()=>URL.revokeObjectURL(url),30000)
 return enlace.download
}

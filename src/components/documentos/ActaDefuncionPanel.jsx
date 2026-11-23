import { useEffect, useState } from 'react'
import { supabase } from '../../services/supabaseClient'
import { descargarActaWord, rutaFotoBaja, unidadDocumento } from '../../services/actaDefuncionWord'

function fechaHoy(){
 const partes=new Intl.DateTimeFormat('en-CA',{timeZone:'America/La_Paz',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date())
 const v=t=>partes.find(p=>p.type===t)?.value
 return `${v('year')}-${v('month')}-${v('day')}`
}

export default function ActaDefuncionPanel({ baja, animal }) {
 const [gradoVaquero,setGradoVaquero]=useState('')
 const [nombreVaquero,setNombreVaquero]=useState('')
 const [gradoJefe,setGradoJefe]=useState('')
 const [nombreJefe,setNombreJefe]=useState('')
 const [numeroActa,setNumeroActa]=useState(String(baja.id).padStart(3,'0'))
 const [numeroInforme,setNumeroInforme]=useState(baja.detalles?.referencia_informe||'')
 const [fechaActa,setFechaActa]=useState(fechaHoy)
 const [descripcion,setDescripcion]=useState(baja.detalles?.descripcion||'')
 const [lugarCausa,setLugarCausa]=useState([baja.detalles?.lugar,baja.motivo].filter(Boolean).join(' · '))
 const [foto,setFoto]=useState(null)
 const [fotoEstado,setFotoEstado]=useState('consultando')
 const [fotoDetalle,setFotoDetalle]=useState('')
 const [intentoFoto,setIntentoFoto]=useState(0)
 const [urlFoto,setUrlFoto]=useState('')
 const [generando,setGenerando]=useState(false)
 const [error,setError]=useState('')
 const [mensaje,setMensaje]=useState('')

 useEffect(()=>{
  let vigente=true
  async function cargar(){
   setFoto(null);setFotoEstado('consultando');setFotoDetalle('');setError('');setMensaje('')
   try {
    const {data,error:fallo}=await supabase.storage.from('bajas-fotos').download(rutaFotoBaja(baja))
    if(!vigente)return
    if(fallo)throw fallo
    if(!data?.size){setFotoEstado('no_disponible');setFotoDetalle('La fotografía guardada está vacía.');return}
    setFoto(data);setFotoEstado('guardada')
   } catch {
    if(!vigente)return
    setFotoEstado('no_disponible')
    setFotoDetalle('No fue posible descargar la fotografía asociada a esta baja. Verifique la conexión, que el archivo exista y los permisos de Storage.')
   }
  }
  cargar()
  return ()=>{vigente=false}
 },[baja.id,baja.unidad_id,intentoFoto])
 useEffect(()=>{
  if(!foto){setUrlFoto('');return undefined}
  const url=URL.createObjectURL(foto);setUrlFoto(url)
  return ()=>URL.revokeObjectURL(url)
 },[foto])

 let unidad
 try { unidad=unidadDocumento(baja.unidad) } catch {unidad=null}
 async function generar(){
  if(generando)return
  setError('');setMensaje('')
  if(!unidad){setError('La unidad de esta baja no está identificada correctamente.');return}
  if(!gradoVaquero.trim()||!nombreVaquero.trim()||!gradoJefe.trim()||!nombreJefe.trim()) {setError('Introduzca por separado el grado y nombre del vaquero y del jefe.');return}
  if(!numeroActa.trim()||numeroActa.length>25){setError('Indique el número de acta (máximo 25 caracteres).');return}
  if(numeroInforme.length>30 || gradoVaquero.trim().length+nombreVaquero.trim().length>104 || gradoJefe.trim().length+nombreJefe.trim().length>104 || descripcion.length>140 || lugarCausa.length>150){setError('Para conservar el formato, acorte los firmantes (hasta 105 caracteres combinados), informe (30), descripción (140) o lugar y causa (150).');return}
  if(!fechaActa || fechaActa < baja.fecha){setError('La fecha del acta no puede ser anterior a la fecha de defunción.');return}
  if(!lugarCausa.trim()){setError('Indique el lugar y la causa de defunción.');return}
  if(fotoEstado==='consultando'){setError('Se está consultando la fotografía guardada en Supabase.');return}
  if(fotoEstado!=='guardada'||!foto){setError(`La baja N.º ${baja.id} de ${unidad.nombre} no tiene una fotografía de evidencia accesible. No se generará un acta con una foto vacía.`);return}
  setGenerando(true)
  try{
   const nombre=await descargarActaWord({
    baja,animal,fotoBlob:foto,
    formulario:{gradoVaquero,nombreVaquero,gradoJefe,nombreJefe,numeroActa,numeroInforme,fechaActa,descripcion,lugarCausa}
   })
   setMensaje(`Se generó ${nombre} con los dos firmantes escritos en el formulario y la fotografía guardada para esta baja.`)
  }catch(e){setError(e?.message||'No se pudo generar el archivo Word.')}
  finally{setGenerando(false)}
 }

 return <div className="ab-documento-panel">
  <p>Se conservará el diseño de la <strong>plantilla Word original</strong>, adaptando automáticamente el membrete y los cargos a {unidad?.nombre||'la unidad correspondiente'}. La fotografía se recupera de la baja registrada, no de una carga nueva.</p>
  <div className="ab-form-grid">
   <label htmlFor="ab-nacta">N.º de acta<input id="ab-nacta" value={numeroActa} maxLength={25} onChange={e=>setNumeroActa(e.target.value)} placeholder="Ej. 008" /></label>
   <label htmlFor="ab-finforme">N.º de informe del vaquero<input id="ab-finforme" value={numeroInforme} maxLength={30} onChange={e=>setNumeroInforme(e.target.value)} placeholder="Ej. 008/25" /></label>
   <label htmlFor="ab-fecha-acta">Fecha de emisión del acta<input id="ab-fecha-acta" type="date" min={baja.fecha} max={fechaHoy()} value={fechaActa} onChange={e=>setFechaActa(e.target.value)} /></label>
   <div className="ab-rol-fijo"><strong>Unidad del documento</strong><span>U.O.S.P.G. «{unidad?.nombre||'No identificada'}»</span></div>
  </div>
  <div className="ab-form-grid">
   <label htmlFor="ab-grado-vaquero">Grado del vaquero<input id="ab-grado-vaquero" value={gradoVaquero} maxLength={30} onChange={e=>setGradoVaquero(e.target.value)} placeholder="Ej. Adm. II." /></label>
   <label htmlFor="ab-nombre-vaquero">Nombre completo del vaquero<input id="ab-nombre-vaquero" value={nombreVaquero} maxLength={85} onChange={e=>setNombreVaquero(e.target.value)} placeholder="Nombres y apellidos" /></label>
   <label htmlFor="ab-grado-jefe">Grado del jefe<input id="ab-grado-jefe" value={gradoJefe} maxLength={30} onChange={e=>setGradoJefe(e.target.value)} placeholder="Ej. Tte. Frag." /></label>
   <label htmlFor="ab-nombre-jefe">Nombre completo del jefe<input id="ab-nombre-jefe" value={nombreJefe} maxLength={85} onChange={e=>setNombreJefe(e.target.value)} placeholder="Nombres y apellidos" /></label>
  </div>
  <div className="ab-firmantes-vista" aria-label="Vista previa de los firmantes">
   <strong>Así aparecerán en el Word:</strong>
   <p>{[gradoVaquero.trim(),nombreVaquero.trim()].filter(Boolean).join(' ') || 'Grado y nombre del vaquero'}<br />VAQUERO DE LA U.O.S.P.G. «{unidad?.nombre||'…'}»</p>
   <p>{[gradoJefe.trim(),nombreJefe.trim()].filter(Boolean).join(' ') || 'Grado y nombre del jefe'}<br />JEFE DE LA U.O.S.P.G. «{unidad?.nombre||'…'}»</p>
  </div>
  <p className="ab-ayuda">Los cargos institucionales permanecen fijos: <strong>VAQUERO DE LA U.O.S.P.G. «{unidad?.nombre||'…'}»</strong> y <strong>JEFE DE LA U.O.S.P.G. «{unidad?.nombre||'…'}»</strong>. El Word se genera sin copiar firmas ni sellos de otros documentos.</p>
  <div className="ab-form-grid">
   <label htmlFor="ab-ficha-descripcion">Descripción del semoviente (señas, color y características)<textarea id="ab-ficha-descripcion" rows={3} maxLength={140} value={descripcion} onChange={e=>setDescripcion(e.target.value)} /></label>
   <label htmlFor="ab-ficha-causa">Lugar y causa de la muerte (resumen para el acta)<textarea id="ab-ficha-causa" rows={3} maxLength={150} value={lugarCausa} onChange={e=>setLugarCausa(e.target.value)} /></label>
  </div>
  <div className="ab-documento-foto">
   <strong>Fotografía de la baja N.º {baja.id} · {unidad?.nombre||'Unidad desconocida'} · Animal {animal.codigo}</strong>
   {fotoEstado==='consultando' ? <p>Consultando imagen privada…</p> : fotoEstado==='guardada' && foto && urlFoto ? <div className="ab-foto-vista"><img src={urlFoto} alt={`Fotografía de evidencia de la baja ${baja.id}`} onError={()=>{setFotoEstado('no_disponible');setFotoDetalle('La imagen descargada no puede mostrarse. Verifique su integridad en Storage.')}} /><span>Imagen confirmada: esta misma fotografía se insertará en el Word.</span></div> : <div className="ab-error"><p><strong>No se puede preparar el acta con fotografía:</strong> {fotoDetalle||'La fotografía no está disponible.'}</p><p>Compruebe que esté preparando la baja correcta y que su fotografía exista en <code>bajas-fotos/{baja.unidad_id}/{baja.id}/evidencia.jpg</code>. No registre de nuevo una baja existente.</p><button type="button" className="ab-secundario" onClick={()=>setIntentoFoto(n=>n+1)}>Volver a consultar fotografía</button></div>}
  </div>
  {error&&<p className="ab-error" role="alert">{error}</p>}
  {mensaje&&<p className="ab-exito" role="status">{mensaje}</p>}
  <button type="button" disabled={generando||fotoEstado!=='guardada'||!foto} onClick={generar}>{generando?'Preparando documento…':'Descargar acta en Word (.docx)'}</button>
 </div>
}

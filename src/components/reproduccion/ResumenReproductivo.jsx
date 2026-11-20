import { useEffect, useState } from 'react'
import { supabase } from '../../services/supabaseClient'
import './ResumenReproductivo.css'

function fechaCorta(valor) {
  if (!valor) return 'Sin registros'
  const [anio, mes, dia] = valor.split('-')
  return `${dia}/${mes}/${anio}`
}

/** Resumen calculado por Supabase; no confunde cero documentado con historial vital completo. */
export default function ResumenReproductivo({ semovienteId, sexo, recarga = 0, onRegistrarAntecedentes }) {
  const [resumen, setResumen] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!semovienteId) return
    let activo = true
    async function cargar() {
      setCargando(true)
      setResumen(null)
      setError('')
      const { data, error: fallo } = await supabase.rpc('rb_resumen_reproductivo', { p_semoviente_id: semovienteId })
      if (!activo) return
      if (fallo || !Array.isArray(data) || data.length !== 1) {
        setError('No se pudo calcular el resumen. Verifique la migración 03 y sus permisos.')
      } else {
        setResumen(data[0])
      }
      setCargando(false)
    }
    cargar()
    return () => { activo = false }
  }, [semovienteId, recarga])

  if (cargando) return <p className="rr-estado" role="status">Consultando estadísticas reproductivas…</p>
  if (error) return <p className="rr-error" role="alert">{error}</p>
  if (!resumen) return null

  const hembra = sexo === 'Hembra'
  const registros = Number(hembra ? resumen.partos_registrados : resumen.montas_registradas)
  const anteriores = Number(hembra ? resumen.partos_anteriores : resumen.montas_anteriores)
  const total = Number(resumen.total_conocido)
  return (
    <div className="rr-contenedor">
      <div className="rr-titulo">{hembra ? 'Resumen de partos' : 'Resumen de montas'}</div>
      <div className="rr-estadisticas">
        <div className="rr-indicador"><span>{hembra ? 'Partos registrados' : 'Montas vinculadas'}</span><strong>{registros}</strong></div>
        <div className="rr-indicador"><span>Antecedentes declarados</span><strong>{resumen.antecedentes_declarados ? anteriores : '—'}</strong></div>
        <div className="rr-indicador rr-total"><span>Total conocido</span><strong>{total}</strong></div>
        <div className="rr-indicador"><span>{hembra ? 'Último parto' : 'Última monta'}</span><strong className="rr-fecha">{fechaCorta(hembra ? resumen.ultimo_parto : resumen.ultima_monta)}</strong></div>
        {hembra && <div className="rr-indicador"><span>Crías en partos registrados</span><strong>{Number(resumen.crias_en_partos)}</strong></div>}
      </div>
      <p className="rr-explicacion">
        {hembra
          ? 'Cada acontecimiento «parto» cuenta una vez, aunque nazcan varias crías. «Nacimiento» no vuelve a contar el parto.'
          : 'Se cuentan únicamente montas con un macho identificado y vinculado al registro de la hembra.'}
        {!resumen.antecedentes_declarados && ' No hay antecedentes históricos declarados: cero documentado no significa necesariamente que nunca se reprodujo.'}
      </p>
      {onRegistrarAntecedentes && !resumen.antecedentes_declarados && (
        <button className="rr-boton" type="button" onClick={onRegistrarAntecedentes}>+ Declarar antecedentes anteriores al sistema</button>
      )}
    </div>
  )
}

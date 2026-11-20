import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../services/supabaseClient'
import './NuevoControlReproductivoModal.css'

function fechaLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function RegistrarAntecedentesModal({ animal, onCerrar, onGuardado }) {
  const [cantidad, setCantidad] = useState('')
  const [fecha, setFecha] = useState(fechaLocal)
  const [fuente, setFuente] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const pendiente = useRef(false)
  useEffect(() => {
    if (!animal) return
    setCantidad('')
    setFecha(fechaLocal())
    setFuente('')
    setError('')
  }, [animal?.id])

  if (!animal) return null
  const hembra = animal.sexo === 'Hembra'
  async function guardar(e) {
    e.preventDefault()
    if (pendiente.current) return
    if (!/^\d{1,7}$/.test(cantidad) || Number(cantidad) > (hembra ? 10000 : 1000000)) {
      setError('Introduzca un número entero no negativo dentro del límite permitido.')
      return
    }
    if (!fecha || fecha > fechaLocal() || fuente.trim().length < 10 || fuente.trim().length > 500) {
      setError('Indique una fecha válida y una fuente documental de 10 a 500 caracteres.')
      return
    }
    pendiente.current = true
    setGuardando(true)
    setError('')
    try {
      const { error: fallo } = await supabase.from('rb_antecedentes_reproductivos').insert({
        semoviente_id: animal.id,
        partos_previos: hembra ? Number(cantidad) : 0,
        montas_previas: hembra ? 0 : Number(cantidad),
        fecha_referencia: fecha,
        fuente: fuente.trim()
      })
      if (fallo) {
        setError(fallo.code === '23505'
          ? 'Ya existen antecedentes declarados para este animal; no pueden registrarse dos veces.'
          : 'No se pudieron guardar. Compruebe su rol, unidad y las reglas de Supabase.')
        return
      }
      onGuardado?.()
    } catch {
      setError('Error de conexión. No se pudo confirmar el registro de antecedentes.')
    } finally {
      pendiente.current = false
      setGuardando(false)
    }
  }

  return (
    <div className="rcm-capa">
      <section className="rcm-modal" role="dialog" aria-modal="true" aria-labelledby="ra-titulo">
        <header className="rcm-cabecera">
          <div><span className="rcm-sobretitulo">CONTROL REPRODUCTIVO · ANTECEDENTES</span>
            <h2 id="ra-titulo">Declarar antecedentes reproductivos</h2>
            <p>Semoviente {animal.codigo} · {animal.sexo}</p>
          </div>
          <button type="button" className="rcm-cerrar" onClick={onCerrar} disabled={guardando} aria-label="Cerrar">×</button>
        </header>
        <form className="rcm-formulario" onSubmit={guardar}>
          <div className="rcm-cuerpo">
            <p className="rcm-nota">Registre solamente {hembra ? 'partos' : 'montas'} anteriores que NO consten en los acontecimientos digitales. Si ya están registrados, no los vuelva a sumar. Una declaración por semoviente, sin modificación desde la aplicación.</p>
            <div className="rcm-grid">
              <div className="rcm-campo"><label htmlFor="ra-cantidad">{hembra ? 'Partos anteriores no registrados' : 'Montas anteriores no registradas'} *</label>
                <input id="ra-cantidad" type="number" step="1" min="0" max={hembra ? 10000 : 1000000} value={cantidad} disabled={guardando} onChange={e => setCantidad(e.target.value)} required /></div>
              <div className="rcm-campo"><label htmlFor="ra-fecha">Fecha de referencia *</label>
                <input id="ra-fecha" type="date" max={fechaLocal()} value={fecha} disabled={guardando} onChange={e => setFecha(e.target.value)} required /></div>
              <div className="rcm-campo rcm-completo"><label htmlFor="ra-fuente">Fuente o respaldo de los antecedentes *</label>
                <textarea id="ra-fuente" rows="3" maxLength="500" placeholder="Ej.: cuaderno de campo, acta, registro anterior con referencia verificable" value={fuente} disabled={guardando} onChange={e => setFuente(e.target.value)} required /></div>
            </div>
            {error && <p className="rcm-error rcm-error-guardado" role="alert">{error}</p>}
          </div>
          <footer className="rcm-pie"><span>Declaración conservada sin edición desde la interfaz</span>
            <div><button type="button" className="rcm-cancelar" onClick={onCerrar} disabled={guardando}>Cancelar</button>
              <button type="submit" className="rcm-validar" disabled={guardando}>{guardando ? 'Guardando…' : 'Registrar antecedentes'}</button></div>
          </footer>
        </form>
      </section>
    </div>
  )
}

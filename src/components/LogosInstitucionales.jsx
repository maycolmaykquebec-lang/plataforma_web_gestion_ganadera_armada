import armadaLogo from '../assets/logos/armada-boliviana.png'
import departamentoLogo from '../assets/logos/departamento-vii.jpeg'
import rioBlancoLogo from '../assets/logos/rio-blanco.png'

export const logosInstitucionales = {
  armada: armadaLogo,
  departamento: departamentoLogo,
  rioBlanco: rioBlancoLogo
}

export function LogosInstitucionales() {
  return (
    <div className="rio_blanco-logos">
      <div className="rio_blanco-logos-principales">
        <img src={armadaLogo} alt="Armada Boliviana" />
        <img src={departamentoLogo} alt="Departamento VII" />
      </div>

      <div className="rio_blanco-logos-unidades">
<div>
          <img src={tamarineroLogo} alt="Unidad Operativa Tamarinero" />
          <span>TAMARINERO</span>
        </div>

        <div>
          <img src={rioBlancoLogo} alt="Unidad Operativa Río Blanco" />
          <span>RÍO BLANCO</span>
        </div>
      </div>
    </div>
  )
}

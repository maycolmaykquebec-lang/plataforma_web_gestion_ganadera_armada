function SpeciesCard({
  nombre,
  cantidad = 0,
  imagen,
  foto,
  icono,
  seleccionada = false,
  onSelect
}) {
  return (
    <article
      className={`rio_blanco-species-card ${seleccionada ? 'selected' : ''}`}
      style={imagen ? { backgroundImage: `linear-gradient(0deg, rgba(4, 19, 38, .92), rgba(4, 19, 38, .15)), url("${imagen}")` } : undefined}
    >
      <div className="rio_blanco-species-content">
        <span className="rio_blanco-species-icon" aria-hidden="true">
          {icono}
        </span>

        {foto && <small style={{display:'block',fontSize:'10px',marginBottom:'4px'}}>Foto: <a href={foto.pagina} target="_blank" rel="noreferrer" style={{color:'white'}}>{foto.autor}</a> · <a href={foto.licenciaUrl} target="_blank" rel="noreferrer" style={{color:'white'}}>{foto.licencia}</a></small>}
        <h3>{nombre}</h3>
        <p>{cantidad} registrados</p>

        <button
          type="button"
          className="rio_blanco-species-button"
          onClick={onSelect}
          aria-pressed={seleccionada}
        >
          {seleccionada ? 'Especie seleccionada' : 'Seleccionar especie'}
        </button>
      </div>
    </article>
  )
}

export default SpeciesCard

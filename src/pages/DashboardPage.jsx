import { puedeRegistrar, perfilValido } from '../auth/permisos'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePerfil } from '../contexts/PerfilContext'
import { supabase } from '../services/supabaseClient'
import StatCard from '../components/dashboard/StatCard'
import SpeciesCard from '../components/dashboard/SpeciesCard'
import './DashboardPage.css'

const fotografias = {
  "bovino": {
    "imagen": "/images/semovientes/bovino.jpg",
    "autor": "Alabama Extension",
    "pagina": "https://commons.wikimedia.org/wiki/File:Cattle_in_a_Pasture.jpg",
    "licencia": "CC0",
    "licenciaUrl": "http://creativecommons.org/publicdomain/zero/1.0/deed.en"
  },
  "equino": {
    "imagen": "/images/semovientes/equino.jpg",
    "autor": "Carl Young",
    "pagina": "https://commons.wikimedia.org/wiki/File:Horse_in_Tall_Grass.jpg",
    "licencia": "CC BY-SA 4.0",
    "licenciaUrl": "https://creativecommons.org/licenses/by-sa/4.0"
  },
  "caprino": {
    "imagen": "/images/semovientes/caprino.jpg",
    "autor": "Herr Beethoven",
    "pagina": "https://commons.wikimedia.org/wiki/File:Kinder_goat_standing.jpg",
    "licencia": "Public domain",
    "licenciaUrl": "https://commons.wikimedia.org/wiki/Template:PD-self"
  },
  "mular": {
    "imagen": "/images/semovientes/mular.jpg",
    "autor": "Emőke Dénes",
    "pagina": "https://commons.wikimedia.org/wiki/File:Equus_asinus_%C3%97_Equus_caballus_-_1.jpg",
    "licencia": "CC BY-SA 4.0",
    "licenciaUrl": "https://creativecommons.org/licenses/by-sa/4.0"
  },
  "avicola": {
    "imagen": "/images/semovientes/avicola.jpg",
    "autor": "safaritravelplus",
    "pagina": "https://commons.wikimedia.org/wiki/File:Free_Range_Chicken.jpg",
    "licencia": "CC0",
    "licenciaUrl": "http://creativecommons.org/publicdomain/zero/1.0/deed.en"
  },
  "porcino": {
    "imagen": "/images/semovientes/porcino.jpg",
    "autor": "Anonymous",
    "pagina": "https://commons.wikimedia.org/wiki/File:Farm-wildlife-herd-pasture-livestock-mammal-732554-pxhere.jpg",
    "licencia": "CC0",
    "licenciaUrl": "http://creativecommons.org/publicdomain/zero/1.0/deed.en"
  }
}

const especies = [
  {
    id: 'bovino',
    nombre: 'Ganado vacuno',
    cantidad: 0,
    icono: '🐄'
  },
  {
    id: 'equino',
    nombre: 'Ganado equino',
    cantidad: 0,
    icono: '🐎'
  },
  {
    id: 'caprino',
    nombre: 'Ganado caprino',
    cantidad: 0,
    icono: '🐐'
  },
  {
    id: 'mular',
    nombre: 'Ganado mular',
    cantidad: 0,
    icono: '🫏'
  },
  {
    id: 'avicola',
    nombre: 'Ganado avícola',
    cantidad: 0,
    icono: '🐓'
  },
  {
    id: 'porcino',
    nombre: 'Ganado porcino',
    cantidad: 0,
    icono: '🐖'
  }
]


function DashboardPage() {
  const navigate = useNavigate()
  const perfil = usePerfil()
  const unidades = perfil?.rol?.codigo === 'RESP_UNIDAD'
    ? [{ nombre: perfil.unidad.nombre, tipo: perfil.unidad.sigla }]
    : [
      { nombre: 'RÍO BLANCO', tipo: 'UOSPG.' },
      { nombre: 'TAMARINERO', tipo: 'UOSPG.' },
      { nombre: 'MAMORE', tipo: 'UOSPGP.' },
    ]
  const rol = perfil?.rol?.codigo || ''
  const esOperador = puedeRegistrar(perfil)
  const esSanitario = puedeRegistrar(perfil)
  const esReproductivo = puedeRegistrar(perfil)
  const puedeConsultarHistorial = perfilValido(perfil)
  const [especieSeleccionada, setEspecieSeleccionada] = useState(null)
  const [resumen, setResumen] = useState({
    cargando: true,
    error: false,
    activos: null,
    hembras: null,
    machos: null,
    bajas: null,
    total: null,
    porEspecie: {}
  })

  useEffect(() => {
    let vigente = true

    // Los recuentos se calculan en Supabase: RLS determina qué animales
    // puede ver cada perfil. No se envía unidad_id desde el navegador.
    async function cargarResumen() {
      setResumen((previo) => ({ ...previo, cargando: true, error: false }))

      const contar = (filtros = []) => {
        let consulta = supabase
          .from('semovientes')
          .select('id', { count: 'exact', head: true })
        for (const [campo, valor] of filtros) {
          consulta = consulta.eq(campo, valor)
        }
        return consulta
      }

      const consultas = [
        contar(),
        contar([['estado', 'Activo']]),
        contar([['estado', 'Activo'], ['sexo', 'Hembra']]),
        contar([['estado', 'Activo'], ['sexo', 'Macho']]),
        contar([['estado', 'Baja']]),
        ...especies.map((especie) => contar([['especie', especie.id]]))
      ]

      try {
        const resultados = await Promise.all(consultas)
        const fallo = resultados.find((resultado) => resultado.error)
        if (fallo) throw fallo.error
        if (!vigente) return

        const porEspecie = Object.fromEntries(
          especies.map((especie, indice) => [
            especie.id,
            resultados[indice + 5].count ?? 0
          ])
        )

        setResumen({
          cargando: false,
          error: false,
          total: resultados[0].count ?? 0,
          activos: resultados[1].count ?? 0,
          hembras: resultados[2].count ?? 0,
          machos: resultados[3].count ?? 0,
          bajas: resultados[4].count ?? 0,
          porEspecie
        })
      } catch (error) {
        console.error('No se pudo consultar el resumen ganadero:', error)
        if (vigente) {
          setResumen((previo) => ({
            ...previo,
            cargando: false,
            error: true
          }))
        }
      }
    }

    cargarResumen()
    return () => { vigente = false }
  }, [rol])

  const mostrar = (valor) =>
    resumen.cargando ? '…' : resumen.error ? '—' : (valor ?? 0)

  return (
    <div className="rio_blanco-dashboard">
      <div className="rio_blanco-warning" role="note">
        <strong>DEMOSTRACIÓN PÚBLICA</strong>
        <span>
          No ingresar información institucional real.
          Esta versión utiliza datos de ejemplo.
        </span>
      </div>

      <section className="rio_blanco-hero">
        <div className="rio_blanco-hero-content">
          <span className="rio_blanco-eyebrow">
            ARMADA BOLIVIANA · DEPARTAMENTO VII
          </span>

          <h1>RÍO BLANCO</h1>
          <h2>Panel principal</h2>

          <p>
            Plataforma para el registro y control de semovientes
          </p>

          <p className="rio_blanco-hero-description">
            Registro, control y trazabilidad de semovientes
            de la Unidad Operativa de Servicios y Producción Ganadera "RÍO BLANCO", dependiente de la DIV. "B" "PRODUCCIÓN" del DPTO. VII.
          </p>

          <div className="rio_blanco-hero-actions">
            {puedeConsultarHistorial && (
              <button type="button" onClick={() => navigate('/historial')}>
                Consultar historial
              </button>
            )}
            <button type="button" onClick={() => navigate('/inventario')}>
              Ver inventarios
            </button>
          </div>
        </div>
      </section>

      <section className="rio_blanco-stats" aria-label="Resumen ganadero">
        <StatCard value={mostrar(resumen.activos)} label="Semovientes activos" />
        <StatCard value={mostrar(resumen.hembras)} label="Hembras activas" />
        <StatCard value={mostrar(resumen.machos)} label="Machos activos" />
        <StatCard value={mostrar(resumen.bajas)} label="Bajas registradas" />
        <StatCard value="—" label="Candidatos a descarte (pendiente)" />
      </section>

      <div className="rio_blanco-quick-actions">
        {esOperador && (
          <button type="button" onClick={() => navigate('/semovientes')}>
            Ir a registro de semovientes
          </button>
        )}
        {esSanitario && (
          <button type="button" onClick={() => navigate('/sanidad')}>
            Ir a Control Sanitario
          </button>
        )}
        {esReproductivo && (
          <button type="button" onClick={() => navigate('/reproduccion')}>
            Ir a Control Reproductivo
          </button>
        )}
        {puedeConsultarHistorial && (
          <button type="button" onClick={() => navigate('/historial')}>
            Buscar por código
          </button>
        )}
      </div>

      {resumen.error && (
        <p role="alert" className="rio_blanco-selection-info">
          No fue posible cargar el resumen. Compruebe la conexión y los permisos de consulta.
        </p>
      )}

      <section className="rio_blanco-section">
        <div className="rio_blanco-section-heading">
          <div>
            <h2>Especies ganaderas</h2>
            <p>Registros organizados por especie, sin mezclar inventarios.</p>
          </div>
          <span className="rio_blanco-total">Total visible: {mostrar(resumen.total)}</span>
        </div>

        <div className="rio_blanco-species-grid">
          {especies.map((especie) => (
            <SpeciesCard
              key={especie.id}
              {...especie}
              imagen={fotografias[especie.id].imagen}
              foto={fotografias[especie.id]}
              cantidad={mostrar(resumen.porEspecie[especie.id])}
              seleccionada={especieSeleccionada === especie.id}
              onSelect={() => setEspecieSeleccionada(especie.id)}
            />
          ))}
        </div>

        {especieSeleccionada && (
          <p className="rio_blanco-selection-info">
            Filtro seleccionado: {especies.find(
              (item) => item.id === especieSeleccionada
            )?.nombre}. Registros visibles: {mostrar(resumen.porEspecie[especieSeleccionada])}.
          </p>
        )}
      </section>

      <section className="rio_blanco-section">
        <div className="rio_blanco-section-heading">
          <div>
            <h2>Unidades bajo su alcance</h2>
            <p>División "B" Producción · Armada Boliviana</p>
          </div>
        </div>

        <div className="rio_blanco-units-grid">
          {unidades.map((unidad) => (
            <article className="rio_blanco-unit-card" key={unidad.nombre}>
              <span className="rio_blanco-unit-symbol">⚓</span>
              <h3>{unidad.nombre}</h3>
              <p>{unidad.tipo}</p>
              <span className="rio_blanco-unit-status">
                Consulta sujeta a permisos institucionales
              </span>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

export default DashboardPage


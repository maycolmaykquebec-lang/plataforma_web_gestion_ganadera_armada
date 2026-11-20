# Actualización V4.4 — Evaluación por Descarte (solo consulta)

## Qué cambia

Se sustituye por completo la pantalla del módulo **Evaluación por Descarte** por una consulta de animales **activos** que alcanzan la edad de revisión según especie y sexo. No se crean ni editan evaluaciones, no se autorizan descartes y no se dan bajas.

| Especie | Macho | Hembra |
| --- | ---: | ---: |
| Bovino | 4 años | 6 años |
| Equino | 10 años | 10 años |
| Caprino | 5 años | 5 años |
| Porcino | 5 años | 4 años |
| Mular | 10 años | 10 años |
| Avícola | No aplica | No aplica |

**Alcance:** Estos valores se usan como umbrales de **revisión**, no como límites legales oficiales ni órdenes de descarte. Equinos y mulares utilizan umbrales preventivos propuestos; los criterios productivos y reproductivos deben validarse con el equipo veterinario.

El módulo ofrece estadísticas generales, filtros por unidad/especie/sexo, búsqueda por códigos, tabla paginada, pestaña de **Edad no determinada**, **Ver expediente** y exportación `.xlsx`. La fecha de consulta se interpreta en Bolivia (America/La_Paz) y la edad se calcula en años completos (cumpleaños transcurridos). Los animales `Baja` quedan fuera; los que no tienen fecha de nacimiento **no** se clasifican como elegibles.

## Archivos incluidos en el ZIP

- `src/pages/EvaluacionDescartePage.jsx` — reemplaza interfaz y consultas.
- `src/pages/EvaluacionDescartePage.css` — diseño adaptable.
- `src/utils/criteriosDescarte.js` — criterios, edad exacta y filtro PostgREST.
- `src/services/exportarConsultaDescarte.js` — genera Excel desde las filas autorizadas.
- `tests/criterios-descarte.test.js` — pruebas de reglas y filtros.

**No hay SQL.** Las tablas `rb_evaluaciones_descarte` y sus registros antiguos se conservan, pero esta pantalla ya no los utiliza. No se incluyen modificaciones de Nuevo Registro, Control Reproductivo, Altas y Bajas ni Inventario AF-09.

## Instalación por PowerShell en Windows

1. Detenga Vite con `Ctrl + C`.
2. Sitúese en la raíz del proyecto:

```powershell
cd "C:\Users\Lenovo LOQ\plataforma_web_gestion_ganadera_armada"
git status
git branch --show-current
```

3. Respalde cualquier cambio sin confirmar. Se recomienda crear una rama nueva **a partir de la rama que ya contiene V4.3**, si los cambios actuales están guardados:

```powershell
git switch -c mejora/evaluacion-descarte-v4-4
```

4. Si descargó `actualizacion_evaluacion_descarte_v4_4.zip` en Descargas, extraiga el contenido en la raíz del proyecto:

```powershell
$zip = Join-Path $env:USERPROFILE 'Downloads\actualizacion_evaluacion_descarte_v4_4.zip'
if (-not (Test-Path $zip)) { throw "No se encuentra el ZIP: $zip" }
Expand-Archive -LiteralPath $zip -DestinationPath (Get-Location).Path -Force
```

5. Desde la raíz:

```powershell
node --test .\tests\criterios-descarte.test.js
npm.cmd run build
npm.cmd run dev
```

Si falta algún paquete, ejecute `npm.cmd ci` (con `package-lock.json` presente) y repita el build.

6. Entre a **Evaluación por Descarte**. Con cuenta Supervisor/Jefe podrá filtrar las tres unidades; con cuenta Responsable solo verá su unidad. Compruebe la búsqueda, las dos pestañas, la ficha individual y la descarga de Excel.

## Pruebas sugeridas, sin modificar la base de datos

- Bovino macho nacido el 20/11/2022, al 20/11/2026: cumple 4 años.
- Bovino hembra nacida el 21/11/2020, al 20/11/2026: aún no cumple 6 años.
- Un animal avícola de cualquier edad no se incorpora a los resultados.
- Un animal `Baja` no aparece.
- Un semoviente activo sin fecha de nacimiento figura solo en la pestaña de edad no determinada.
- Al abrir un expediente, solo se consulta; no hay botones de evaluación o baja.
- El Excel debe contener exactamente los animales de la consulta filtrada, no solo la página visible.

## Notas de seguridad e integridad

- Las consultas se realizan a través de Supabase con la sesión del usuario y sus políticas RLS.
- Para `RESP_UNIDAD` se incluye también filtro explícito por su `unidad_id`.
- Exportación limitada a 20.000 filas con advertencia para evitar archivos incompletos o excesivos.
- Las búsquedas por código solo aceptan caracteres alfanuméricos y guiones al formar expresiones de consulta.
- No se crean funciones SQL ni se cambian autorizaciones o roles.

## Estado de verificación de esta entrega

- Pruebas unitarias del módulo de criterios: **aprobadas**.
- Sintaxis de los archivos JavaScript sin JSX: **verificada**.
- Compilación React completa: **pendiente en el equipo del usuario**; la instalación de dependencias en este entorno no pudo completarse.
- Integración real con Supabase: **pendiente de probar** con cuentas de los tres roles.

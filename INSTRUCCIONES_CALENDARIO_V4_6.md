# Actualización V4.6 — Sin Respaldos + Calendario de actividades

## Contenido
- `src/App.jsx`: elimina la ruta `/respaldos` y añade `/calendario`.
- `src/components/layout/Sidebar.jsx`: quita Respaldos y agrega Calendario de actividades.
- `src/auth/permisos.js`: visibilidad del calendario para los tres roles y eliminación de Respaldos.
- `src/pages/CalendarioActividadesPage.jsx` y `.css`: interfaz mensual y agenda con formulario de programación.
- `src/utils/calendarioGanadero.js`: lógica de fechas, indicadores y validaciones.
- `supabase/actualizaciones/09_calendario_actividades.sql`: crea tabla y políticas de seguridad.
- `supabase/actualizaciones/10_verificar_calendario_actividades.sql`: comprobación de solo lectura.
- `tests/calendario-actividades.test.js`: pruebas automáticas.

## Instalación en Windows / VS Code
1. Cierre Vite con `Ctrl+C` y ejecute `git status`. Haga un commit o respaldo de cambios no confirmados antes de sobrescribir archivos.
2. Sitúese en la carpeta raíz del repositorio:

   `cd "C:\Users\Lenovo LOQ\plataforma_web_gestion_ganadera_armada"`

3. Extraiga el ZIP descargado en el proyecto:

   `Expand-Archive -LiteralPath "$env:USERPROFILE\Downloads\actualizacion_calendario_sin_respaldos_v4_6.zip" -DestinationPath (Get-Location).Path -Force`

4. Elimine el archivo del módulo antiguo (ya no es usado por rutas ni menú):

   `Remove-Item ".\src\pages\RespaldosPage.jsx" -Force`

5. Compruebe las pruebas:

   `node --test .\tests\calendario-actividades.test.js`

6. **Haga copia de seguridad de Supabase.** En una copia de desarrollo, abra `09_calendario_actividades.sql` desde el SQL Editor y ejecútelo. El script SOLO crea la nueva tabla y sus RLS; no toca tablas operativas existentes.
7. Ejecute `10_verificar_calendario_actividades.sql` para comprobar la tabla y políticas.
8. En la terminal, ejecute `npm.cmd run build` y `npm.cmd run dev`.
9. Entre con un `RESP_UNIDAD`, programe una actividad en su unidad; compruebe que otro usuario solo pueda ver las unidades a las que tiene permiso. Pruebe lectura como `JEFE_DIV_B` y supervisión con `SUP_DEPTO_VII`.

## Permisos
- SUP_DEPTO_VII: ver y programar/editar actividades en unidades autorizadas.
- JEFE_DIV_B: solo consulta de agenda.
- RESP_UNIDAD: ver agenda de su unidad y programar/editar actividades de su autoría en la misma.
- No se permiten borrados: se utiliza estado `cancelada`.

## Alcance y límites de V4.6
- Es una agenda MANUAL. No ejecuta ni modifica automáticamente vacunas, controles reproductivos, traslados, registros de baja ni inventarios.
- Los códigos de semovientes son referencias manuales opcionales, no enlaces validados contra el inventario.
- Se muestran actividades del mes elegido con un máximo de 10.000 registros; filtrar por unidad si se supera ese número.
- La agenda identifica vencimientos en pantalla al consultarla; no envía correos, mensajes ni notificaciones push.
- NO se modifica `Nuevo Registro`, `Inventario`, `Control Reproductivo`, `Altas y Bajas`, `Movimientos`, `Descarte` ni `Reporting`.
- Quitar el módulo Respaldos de React no deshabilita los respaldos de infraestructura y recuperación propios de Supabase.

## Resultado esperado
El menú ya no debe mostrar Respaldos. Aparece Calendario de actividades. El supervisor puede crear actividades en cualquier unidad autorizada, el responsable en la suya y el jefe solo consulta.

# V4.5 · REPORTING CON GRÁFICOS Y EXCEL · GESTIÓN GANADERA

## Qué cambia

- Reemplaza `src/pages/ReportesPage.jsx` y añade su hoja `ReportesPage.css`.
- Añade módulos reutilizables para estadísticas, gráficos SVG y exportación Excel.
- Gráficos visibles: distribución de activos por especie (torta/dona), existencias por especie, altas y bajas por especie, solicitudes de traslado por estado (barras).
- Las fechas filtran acontecimientos, no simulan inventarios históricos.
- En un filtro por una unidad, «traslados recibidos» considera SOLO movimientos ejecutados con destino a esa unidad. Para todas las unidades se muestran traslados ejecutados.
- Exportación `.xlsx`: hojas **Resumen** (incluye dos gráficos), **Gráficos** (incluye cuatro gráficos), **Inventario actual**, **Bajas del período**, **Evaluaciones del período** y **Movimientos del período**.
- Los gráficos se incrustan como **imágenes PNG**, visibles en Excel, pero no editables como gráficos nativos. Los datos numéricos se mantienen en sus hojas editables.
- El botón **Descargar inventario CSV** se eliminó de Reportes. No se tocó el módulo Inventario Ganadero.

## Instalación PowerShell

1. Cierra Vite con Ctrl+C.
2. Ingresa al proyecto:

   ```powershell
   cd "C:\Users\Lenovo LOQ\plataforma_web_gestion_ganadera_armada"
   git status
   ```

3. Respalda la página previa si lo deseas:

   ```powershell
   Copy-Item ".\src\pages\ReportesPage.jsx" "$env:USERPROFILE\Downloads\ReportesPage_antes_V4_5.jsx" -Force
   ```

4. Descarga `actualizacion_reporting_graficos_v4_5.zip` a `Descargas` y extrae:

   ```powershell
   Expand-Archive -LiteralPath "$env:USERPROFILE\Downloads\actualizacion_reporting_graficos_v4_5.zip" -DestinationPath (Get-Location).Path -Force
   ```

5. Pruebas y ejecución:

   ```powershell
   node --test .\tests\reportes-graficos.test.js
   npm.cmd run build
   npm.cmd run dev
   ```

6. En Reportes, selecciona unidad/especie/fechas y comprueba los cuatro gráficos. Exporta Excel y abre primero **Resumen**, luego **Gráficos**.

## Requisitos y seguridad

- **NO** requiere SQL ni cambios en políticas de Supabase.
- **NO** requiere instalar librerías nuevas: utiliza `exceljs` del repositorio y gráficos SVG generados localmente.
- Asume aplicada la actualización de `codigo_activo` (V2), ya instalada según las pruebas del usuario.
- RLS de Supabase determina los registros visibles. El frontend no eleva permisos.
- No se modifica Nuevo Registro, Control Reproductivo, Altas y Bajas, Inventario ni Evaluación por Descarte.
- El reporte se descarga solo si la consulta está completa y no tiene errores.
- Las columnas numéricas del Excel son cantidades autorizadas; no se simulan animales inexistentes.

## Validación de esta entrega

- `node --test tests/reportes-graficos.test.js`: 5 pruebas satisfactorias.
- Sintaxis JSX/JS revisada con el analizador de TypeScript.
- SVG convertidos a PNG y revisados visualmente en un entorno de prueba con datos ilustrativos.
- `npm ci --offline` no pudo completarse porque la caché local no incluye todas las dependencias; por ello **no fue posible realizar una compilación real con Vite ni probar ExcelJS en un navegador conectado a Supabase**. Por favor, ejecuta `npm.cmd run build` en tu equipo antes de considerar la actualización validada por completo.

## Notas de interpretación

- Activos y bajas actuales: situación actual del semoviente, sin «corte histórico».
- Altas del período: fecha de ingreso de los animales cuyo registro está autorizado y que están actualmente en el alcance filtrado.
- Bajas del período: fecha de baja documentada.
- Movimientos: para `ejecutado` se toma la fecha de ejecución; para los demás estados se usa la fecha de creación de la solicitud. El gráfico presenta el estado **actual** de solicitudes pertenecientes a ese período, no el estado que tenían en aquella fecha.
- Se muestran únicamente 0 cuando las fuentes consultadas muestran 0, y un mensaje «Sin datos» cuando no hay elementos que graficar.

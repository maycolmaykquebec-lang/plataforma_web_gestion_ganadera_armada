# Actualización V4.7 · Historial Individual (Armada Boliviana)

## Objetivo
Rediseñar **Historial Individual** para que se parezca a la imagen de referencia: fotografía principal, identificación, pestañas, ficha resumen, línea de tiempo, observaciones y galería.

La ruta **`/historial`** y el elemento **Historial Individual** ya existen en las versiones anteriores; esta actualización **los reutiliza**. No crea una opción duplicada ni altera Nuevo Registro.

## Archivos incluidos en este ZIP

- `src/pages/HistorialIndividualPage.jsx` (actualizado)
- `src/pages/HistorialIndividualPage.css` (actualizado)
- `src/components/historial/PerfilHistorialSemoviente.jsx` (nuevo)
- `src/components/historial/PerfilHistorialSemoviente.css` (nuevo)
- `src/utils/historialGanadero.js` (nuevo)
- `tests/historial-visual.test.js` (nuevo)

**No requiere SQL adicional.** Sólo hace consultas autorizadas a tablas ya existentes, incluidas `semovientes`, `semoviente_fotografias`, `semoviente_eventos`, `controles_sanitarios`, `controles_reproductivos`, `solicitudes_movimientos`, `rb_bajas` y `rb_evaluaciones_descarte`. Usa enlaces firmados de los buckets privados existentes.

## Instalación en Windows / PowerShell

1. **Detener Vite** con Ctrl + C.
2. Abrir terminal en la carpeta del repositorio:
   ```powershell
   cd "C:\Users\Lenovo LOQ\plataforma_web_gestion_ganadera_armada"
   git status
   ```
3. Si hay cambios locales, respaldarlos o confirmar un commit antes de sobrescribir. **No usar `git reset --hard`.**
4. Descargar `actualizacion_historial_individual_v4_7.zip` y guardarlo en `Descargas`.
5. Extraer sobre la raíz del repositorio:
   ```powershell
   Expand-Archive -LiteralPath "$env:USERPROFILE\Downloads\actualizacion_historial_individual_v4_7.zip" -DestinationPath (Get-Location).Path -Force
   ```
6. Ejecutar pruebas y compilar:
   ```powershell
   node --test .\tests\historial-visual.test.js
   npm.cmd run build
   ```
7. Levantar la aplicación:
   ```powershell
   npm.cmd run dev
   ```

## Prueba con una cuenta autorizada

- Entrar en **Historial Individual** desde el menú actual.
- Buscar por **Código individual** (p. ej. `001`) o **Código del Activo** (p. ej. `UOSPGM-86-WI-001`). Si una unidad tiene el mismo código individual que otra, el filtro de unidad permite elegir.
- Pulsar **Ver expediente**: se abre una ficha a página completa con datos reales.
- Revisar las pestañas: Resumen, Datos generales, Historial sanitario, Historial reproductivo, Movimientos, Altas y bajas, Evaluaciones, Archivos y fotografías.
- Comprobar que se vea la foto frontal y las laterales almacenadas; cuando falten, se muestra un recuadro de falta de imagen y **no se inventa una fotografía**.
- Pulsar **Imprimir ficha** para imprimir la vista de resumen o guardar como PDF desde el navegador.
- Volver al listado. Comprobar el mismo comportamiento en los 3 roles operativos.

## Limitaciones conocidas

- Se muestran los últimos 100 registros por categoría en las pestañas; en el Resumen, la línea de tiempo ofrece **Mostrar más** por páginas.
- Si los roles no tienen permiso RLS sobre una tabla, esa sección mostrará un aviso: **la interfaz no desactiva ni amplía políticas de seguridad**.
- Los enlaces temporales de las fotografías caducan después de ~20 minutos; reabrir la ficha si dejan de responder.
- **No hay edición ni subida de fotografías en este módulo.** Esa funcionalidad sigue en sus módulos existentes y no se modifica Nuevo Registro.
- El botón **Imprimir ficha** es impresión desde el navegador y no genera un documento Word oficial.

## Pruebas efectuadas aquí

- Pruebas de cálculo de edad, cumpleaños y fechas: correctas.
- Generación y estructura del paquete: revisadas.
- Compilación completa de Vite y consulta con credenciales reales: **pendientes de ejecutar en la computadora del usuario**, debido a que el entorno de pruebas no tuvo disponibles las dependencias npm completas.

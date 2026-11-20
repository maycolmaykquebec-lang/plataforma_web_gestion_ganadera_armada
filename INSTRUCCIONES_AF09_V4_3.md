# Actualización Inventario Ganadero AF-09 V4.3

## Cambios
- El botón exportar deja de estar restringido a Río Blanco y ya no exige completar los 5 nombres.
- Selector exclusivo de AF-09 para Río Blanco, Tamarinero y Mamoré; no altera el filtro general.
- Membrete, sigla y cargo «JEFE U.O.S.P.G.» varían automáticamente por unidad.
- Se consulta `codigo_activo` y `marca_ancla` desde Supabase (sin migraciones).
- Excel con tabla basada en la captura aportada: columnas A:P, fecha nacimiento D/M/A, ficha veterinaria = NO para fiebre aftosa, cadera y uñeta; descripción y costos sin datos ni fórmulas.
- Se conserva la edición de los cinco nombres y grados; los cargos son institucionales.
- No se insertan firmas manuscritas, ni datos financieros inventados.

## Instalación (Windows, PowerShell)
1. Detén Vite con Ctrl+C.
2. Haz respaldo de tu trabajo: `git status`, y guarda los cambios importantes en un commit o copia.
3. Abre PowerShell en la raíz que contiene package.json:
   `cd "C:\Users\Lenovo LOQ\plataforma_web_gestion_ganadera_armada"`
4. Extrae el ZIP descargado en Descargas:
   `Expand-Archive -LiteralPath "$env:USERPROFILE\Downloads\actualizacion_inventario_af09_v4_3.zip" -DestinationPath (Get-Location).Path -Force`
5. Ejecuta `npm.cmd run dev` y ve a Inventario Ganadero → FORM. AF-09.
6. Elige la unidad, especie y pulsa Exportar.

No ejecutar SQL. La exportación es de solo lectura y usa los permisos RLS de la sesión.

## Advertencias
- El documento reproduce la ESTRUCTURA visible en la captura, pero para una coincidencia pixel a pixel, marcas de agua y configuración oficial se necesita el XLSX de origen (no se adjuntó: solo imágenes).
- Los códigos del activo de animales antiguos que sigan en NULL se dejan vacíos, sin inventar códigos.
- «Área de Trabajo» se conoce como 086 solamente para Río Blanco a partir de la captura. Las otras unidades lo dejan vacío hasta tener el dato verificado.
- Los nombres de los responsables se incorporan en la hoja; no se generan firmas auténticas.
- Esta actualización reemplaza solo dos archivos de Inventario, un servicio AF-09, CSS del panel y sus pruebas; preserva las actualizaciones de otros módulos.

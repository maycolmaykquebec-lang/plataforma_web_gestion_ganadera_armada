param(
  [Parameter(Mandatory=$true)][string]$Entrada,
  [string]$Plantilla = '',
  [string]$DirectorioSalida = ''
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# RIO_BLANCO_AF9_SOLO_EXCEL_1934: copia editable del Excel original, sin PDF
# Requiere Excel de escritorio en Windows. NO crea firmas ni modifica Supabase.
function Texto-Seguro([object]$valor, [int]$maximo=250) {
  $s = [string]$valor
  $s = ($s -replace '[\r\n\t]', ' ').Trim()
  if ($s.Length -gt $maximo) { throw "Texto excede $maximo caracteres: $($s.Substring(0,20))..." }
  return $s
}
function Poner-Texto($hoja, [string]$ref, [object]$valor) {
  $texto = Texto-Seguro $valor
  # Impide ejecutar formulas inyectadas desde el inventario o desde nombres/cargos.
  if ($texto -match '^[\s]*[=+@-]') { $texto = "'" + $texto }
  $hoja.Range($ref).Value2 = $texto
}
function Fecha-Espanol([string]$iso) {
  $fecha = [datetime]::ParseExact($iso, 'yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture)
  $meses = @('enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre')
  return ('{0:dd} de {1} {0:yyyy}' -f $fecha, $meses[$fecha.Month - 1])
}
function Revisar-Firmas($hoja, $responsables) {
  $formas = @()
  for ($i=1; $i -le $hoja.Shapes.Count; $i++) {
    $forma = $hoja.Shapes.Item($i)
    try {
      $texto = [string]$forma.TextFrame.Characters().Text
      if ($texto -match '\.{20,}') { $formas += [pscustomobject]@{ Forma = $forma; Pos = [double]$forma.Left } }
    } catch { }
  }
  $formas = @($formas | Sort-Object Pos)
  if ($formas.Count -ne 5) {
    throw "La hoja '$($hoja.Name)' tiene $($formas.Count) cuadros de firma detectados; se esperaban cinco. No se alterara el formato silenciosamente."
  }
  for ($i=0; $i -lt 5; $i++) {
    $forma = $formas[$i].Forma
    $original = [string]$forma.TextFrame.Characters().Text
    $lineas = @($original -split '\r\n|\n|\r')
    if ($lineas.Count -lt 2) { throw "Bloque de firma $($i+1) inesperado en $($hoja.Name)." }
    $primera = $lineas[0]
    $puntos = [regex]::Match($primera, '^\s*\.{15,}')
    if (-not $puntos.Success) { throw "No se encontro linea punteada en firma $($i+1)." }
    $viejoNombre = $primera.Substring($puntos.Length).Trim()
    $nuevoNombre = Texto-Seguro $responsables[$i].nombre 80
    $nuevoCargo = Texto-Seguro $responsables[$i].cargo 90
    if (!$nuevoNombre -or !$nuevoCargo) { throw "Falta nombre o cargo para responsable $($i+1)." }
    # Reemplazar por fragmentos conserva texto punteado y atributos de la forma.
    # La segunda linea siempre corresponde al cargo en las hojas originales.
    if ($viejoNombre.Length -gt 0) {
      $indice = $original.IndexOf($viejoNombre, [StringComparison]::Ordinal)
      if ($indice -lt 0) { throw "Firma $($i+1): nombre original no localizado." }
      $forma.TextFrame.Characters($indice + 1, $viejoNombre.Length).Text = $nuevoNombre
    } else {
      # Plantilla vacia: insertar nombre al finalizar la linea punteada.
      $forma.TextFrame.Characters($puntos.Length + 1, 0).Insert($nuevoNombre)
    }
    $despues = [string]$forma.TextFrame.Characters().Text
    $partes = @($despues -split '\r\n|\n|\r')
    $viejoCargo = if ($partes.Count -gt 1) { $partes[1].Trim() } else { '' }
    if (-not $viejoCargo) { throw "Firma $($i+1): cargo original vacio; revise la plantilla." }
    $posCargo = $despues.LastIndexOf($viejoCargo, [StringComparison]::Ordinal)
    if ($posCargo -lt 0) { throw "Firma $($i+1): cargo original no localizado." }
    $forma.TextFrame.Characters($posCargo + 1, $viejoCargo.Length).Text = $nuevoCargo
  }
}
function Quitar-Firmas-Antiguas($hoja) {
  # El libro provisto contiene imagenes de firmas manuscritas antiguas.
  # Copiarlas a un reporte con responsables nuevos seria atribuir firmas falsamente.
  # Se conservan los cinco cuadros y lineas de firma en sus posiciones originales.
  for ($i=$hoja.Shapes.Count; $i -ge 1; $i--) {
    $forma = $hoja.Shapes.Item($i)
    if ([int]$forma.Type -eq 13 -or ([string]$forma.Name) -match '^Imagen ' ) { $forma.Delete() } # dibujos de firma del modelo
  }
}
function Preparar-Hoja($hoja, [int]$hasta, [string]$fecha, $responsables, [string]$codigo='') {
  $hoja.Range("A14:T$hasta").ClearContents()
  # Limpiar columnas auxiliares ocultas, sin tocar estilos, bordes ni celdas combinadas.
  $hoja.Range('U12:X54').ClearContents()
  Poner-Texto $hoja 'B5' (Fecha-Espanol $fecha)
  Poner-Texto $hoja 'M5' (Fecha-Espanol $fecha)
  Poner-Texto $hoja 'D6' 'DEPARTAMENTO VII "PARTICIPACION EN EL DESARROLLO"'
  Poner-Texto $hoja 'D7' 'U.O.S.P.G. "RIO BLANCO"'
  Poner-Texto $hoja 'J7' 'UOSPGRB'
  Poner-Texto $hoja 'O7' '086'
  if ($codigo) { Poner-Texto $hoja 'S7' $codigo } else { $hoja.Range('S7').ClearContents() }
  Quitar-Firmas-Antiguas $hoja
  Revisar-Firmas $hoja $responsables
}
function Escribir-Filas($hoja, $filas, [int]$filaInicial=14, [int]$indiceInicial=0) {
  $f = $filaInicial
  foreach ($animal in $filas) {
    $codigo = Texto-Seguro $animal.codigo_rio_blanco 80
    if (!$codigo) { throw 'Se encontro semoviente sin codigo RIO_BLANCO.' }
    if ($codigo -match '^UOSPGRB-86-WI-\d+$') {
      Poner-Texto $hoja "A$f" $codigo
    }
    $hoja.Range("B$f").Value2 = [double]($indiceInicial + ($f - $filaInicial) + 1)
    $hoja.Range("C$f").Value2 = [double]1
    if ($animal.fecha_nacimiento) {
      $iso = Texto-Seguro $animal.fecha_nacimiento 10
      if ($iso -match '^\d{4}-\d{2}-\d{2}$') {
        $dt = [datetime]::ParseExact($iso, 'yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture)
        $hoja.Range("D$f").Value2 = [double]$dt.Day
        $hoja.Range("E$f").Value2 = [double]$dt.Month
        $hoja.Range("F$f").Value2 = [double]$dt.Year
      }
    }
    $sexo = (Texto-Seguro $animal.sexo 20).ToLowerInvariant()
    if ($sexo -eq 'macho') { Poner-Texto $hoja "G$f" 'M' }
    if ($sexo -eq 'hembra') { Poner-Texto $hoja "G$f" 'H' }
    if ($animal.raza) { Poner-Texto $hoja "H$f" (Texto-Seguro $animal.raza 80).ToUpperInvariant() }
    # No es valido convertir un codigo RIO_BLANCO en codigo patrimonial ni matricula.
    # En la columna libre 'Descripcion' se mantiene trazabilidad explicita a RIO_BLANCO.
    $clase = (Texto-Seguro $animal.clase 80).ToUpperInvariant()
    Poner-Texto $hoja "N$f" ("$clase - CODIGO RIO_BLANCO: $codigo".Trim(' ','-'))
    # I, J, K, L, M, S, T: sin fuente verificable, permanecen vacias.
    $f++
  }
}

# RIO_BLANCO_AF9_UNIDAD_RIOBLANCO_V2: validar unidad exacta, tolerando guiones/acentos.
function Test-RIO_BLANCOUnidadRioBlanco([object]$Valor) {
  if ($null -eq $Valor -or [string]::IsNullOrWhiteSpace([string]$Valor)) { return $false }
  $texto = ([string]$Valor).Normalize([System.Text.NormalizationForm]::FormD)
  $texto = [regex]::Replace($texto, '\p{Mn}', '')
  $texto = [regex]::Replace($texto.Trim().ToUpperInvariant(), '[\s_-]+', ' ')
  return ($texto -ceq 'RIO BLANCO')
}

$excel = $null; $libro = $null; $xlsx = ''
try {
  if ([Environment]::OSVersion.Platform -ne 'Win32NT') { throw 'Se requiere Windows con Microsoft Excel de escritorio.' }
  if (-not $Plantilla) { $Plantilla = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'RIO_BLANCO_AF9_PlantillaPrivada\Form-AF-9 UOSPG RIO BLANCO (1).xlsx' }
  if (-not $DirectorioSalida) { $DirectorioSalida = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'RIO_BLANCO_AF9_Salidas' }
  $archivo = (Resolve-Path -LiteralPath $Entrada).Path
  $modelo = (Resolve-Path -LiteralPath $Plantilla).Path
  $p = Get-Content -LiteralPath $archivo -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($p.esquema -ne 'RIO_BLANCO_AF9_PLANTILLA_ORIGINAL_V1' -or $p.unidad_codigo -ne 'RIO-BLANCO') { throw 'Solicitud no corresponde al AF-9 original de RIO BLANCO.' }
  $firmas = @($p.responsables)
  if ($firmas.Count -ne 5) { throw 'Se requieren exactamente cinco responsables y cinco cargos.' }
  $fecha = Texto-Seguro $p.fecha_referencia 10
  if ($fecha -notmatch '^\d{4}-\d{2}-\d{2}$') { throw 'La fecha de referencia es invalida.' }
  [void][datetime]::ParseExact($fecha,'yyyy-MM-dd',[Globalization.CultureInfo]::InvariantCulture)
  $registros = @($p.semovientes)
  if ($registros.Count -eq 0) { throw 'No hay semovientes para el inventario.' }
  foreach ($a in $registros) {
    if ((Texto-Seguro $a.estado).ToLowerInvariant() -ne 'activo') { throw 'El AF-9 actual solo admite animales activos.' }
    if (-not (Test-RIO_BLANCOUnidadRioBlanco $a.unidad)) { throw 'El inventario contiene datos de otra unidad. Se detiene para evitar atribuirlos a RIO BLANCO.' }
  }
  $valores = @('bovino','equino','caprino','mular','avicola','porcino')
  foreach ($a in $registros) { if (([string]$a.especie).ToLowerInvariant() -notin $valores) { throw "Especie no contemplada en AF-9: $($a.especie)" } }
  if ($p.especie -ne 'todas') {
    if ($p.especie -notin $valores) { throw 'Filtro de especie desconocido.' }
    if (@($registros | Where-Object { $_.especie -ne $p.especie }).Count -gt 0) { throw 'La solicitud incluye registros fuera del filtro de especie elegido.' }
  }
  $porEspecie = @{}
  foreach ($e in $valores) { $porEspecie[$e] = @($registros | Where-Object { $_.especie -eq $e }) }
  if ($porEspecie['bovino'].Count -gt 44) { throw 'La plantilla original bovina tiene 44 filas en dos hojas. Exceso detectado: no se truncaran datos ni se alterara el formato.' }
  if ($porEspecie['equino'].Count -gt 19) { throw 'La plantilla original equina tiene 19 filas disponibles. Se necesita otra hoja modelo aprobada.' }
  foreach ($e in @('caprino','mular','avicola','porcino')) {
    if ($porEspecie[$e].Count -gt 24) { throw "La plantilla generica tiene 24 filas para $e. Se necesita otra hoja modelo aprobada." }
  }

  New-Item -ItemType Directory -Path $DirectorioSalida -Force | Out-Null
  $nombre = "RIO_BLANCO_AF9_RIO_BLANCO_$($p.especie)_$($fecha)_SIN_FIRMAR"
  $xlsx = Join-Path $DirectorioSalida ($nombre + '.xlsx')
  if (Test-Path -LiteralPath $xlsx) { throw 'El archivo Excel ya existe. No se sobrescribiran documentos anteriores; mueva o cambie el nombre del archivo anterior.' }
  try { $excel = New-Object -ComObject Excel.Application } catch { throw 'No se detecto Microsoft Excel de escritorio. Instale Excel para exportar sin redibujar el AF-9.' }
  $excel.Visible = $false
  $excel.DisplayAlerts = $false
  $excel.EnableEvents = $false
  $excel.AskToUpdateLinks = $false
  $libro = $excel.Workbooks.Open($modelo,0,$false)
  $s1 = $libro.Worksheets.Item('Form-AF-09')
  $s2 = $libro.Worksheets.Item('Form-AF-09 RIO BLANCO')
  $s3 = $libro.Worksheets.Item('Hoja1')
  $s4 = $libro.Worksheets.Item('Hoja2')
  $visibles = @()
  if ($porEspecie['bovino'].Count -gt 0) {
    Preparar-Hoja $s2 36 $fecha $firmas '2'
    Escribir-Filas $s2 @($porEspecie['bovino'] | Select-Object -First 23) 14 0
    $s2.PageSetup.PrintArea = '$A$1:$T$41'
    $visibles += $s2
    if ($porEspecie['bovino'].Count -gt 23) {
      Preparar-Hoja $s3 34 $fecha $firmas '2'
      Escribir-Filas $s3 @($porEspecie['bovino'] | Select-Object -Skip 23) 14 23
      $s3.PageSetup.PrintArea = '$A$1:$T$40'
      $visibles += $s3
    }
  }
  if ($porEspecie['equino'].Count -gt 0) {
    Preparar-Hoja $s4 32 $fecha $firmas '3'
    Escribir-Filas $s4 $porEspecie['equino'] 14 0
    $s4.PageSetup.PrintArea = '$A$1:$T$38'
    $visibles += $s4
  }
  $otras = @(@('caprino','mular','avicola','porcino') | Where-Object { $porEspecie[$_].Count -gt 0 })
  if ($otras.Count -gt 0) {
    $primera = $true
    foreach ($e in $otras) {
      if ($primera) { $hoja = $s1; $primera = $false }
      else {
        $s1.Copy([Type]::Missing,$libro.Worksheets.Item($libro.Worksheets.Count))
        $hoja = $excel.ActiveSheet
      }
      $hoja.Name = 'AF9_' + $e.ToUpperInvariant()
      Preparar-Hoja $hoja 37 $fecha $firmas ''
      Escribir-Filas $hoja $porEspecie[$e] 14 0
      $hoja.PageSetup.PrintArea = '$A$1:$T$43'
      $visibles += $hoja
    }
  }
  if ($visibles.Count -eq 0) { throw 'No hay hojas con registros.' }
  # Las hojas ajenas contienen ANIMALES y FIRMAS del modelo de 2025.
  # Retirarlas SOLO de la copia de salida evita que esos datos antiguos permanezcan ocultos.
  $visibles[0].Activate()
  for ($ix=$libro.Worksheets.Count; $ix -ge 1; $ix--) {
    $hoja = $libro.Worksheets.Item($ix)
    $esta = $false
    foreach ($v in $visibles) { if ($v.Name -eq $hoja.Name) { $esta = $true; break } }
    if (-not $esta) { $hoja.Delete() }
  }
  $libro.SaveAs($xlsx,51) # xlsx: conserva el XML, cuadros de texto y estilos de la plantilla Excel.
  Write-Host 'RIO_BLANCO PASO 19.3: AF-9 desde el modelo original generado.' -ForegroundColor Green
  Write-Host "EXCEL: $xlsx" -ForegroundColor Cyan
  Write-Host 'Las firmas manuscritas antiguas no se incluyeron. Cinco espacios de firma conservados.' -ForegroundColor Yellow
  Write-Host 'IMPORTANTE: Revise visualmente el Excel antes de utilizarlo. No es una certificacion de inventario historico.' -ForegroundColor Yellow
} catch {
  Write-Host ('RIO_BLANCO AF-9: ' + $_.Exception.Message) -ForegroundColor Red
  if ($xlsx -and (Test-Path -LiteralPath $xlsx)) { Remove-Item -LiteralPath $xlsx -Force -ErrorAction SilentlyContinue }
  exit 1
} finally {
  if ($libro) { try { $libro.Close($false) } catch {} }
  if ($excel) { try { $excel.Quit() } catch {}; try { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($excel) } catch {} }
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
}

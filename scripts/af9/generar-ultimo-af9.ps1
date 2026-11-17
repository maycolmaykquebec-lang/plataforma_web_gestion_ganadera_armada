param([string]$CarpetaDescargas = (Join-Path $HOME 'Downloads'))
$ErrorActionPreference = 'Stop'
$ultimo = Get-ChildItem -LiteralPath $CarpetaDescargas -Filter 'RIO_BLANCO_AF9_ORIGINAL_*.json' -File |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $ultimo) { throw 'No se encontro una solicitud de AF-9 en Descargas. Primero descarguela desde RIO_BLANCO.' }
Write-Host ('Solicitud encontrada: ' + $ultimo.FullName) -ForegroundColor Cyan
$global:LASTEXITCODE = 0 # RIO_BLANCO_AF9_1935
& (Join-Path $PSScriptRoot 'generar-af9-original.ps1') -Entrada $ultimo.FullName
if ($LASTEXITCODE -ne 0) { throw 'La generacion del AF-9 no termino correctamente.' }

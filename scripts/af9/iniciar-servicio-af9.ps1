$ErrorActionPreference = 'Stop'
$archivo = Join-Path $PSScriptRoot 'af9-local-server.cjs'
if (-not (Test-Path -LiteralPath $archivo -PathType Leaf)) { throw 'No se encontro el servicio local AF-9.' }
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { throw 'Node.js no esta instalado o no figura en PATH. Instale Node.js para usar la descarga directa.' }
Write-Host 'RIO_BLANCO AF-9: iniciando servicio SOLO LOCAL para exportar Excel.' -ForegroundColor Cyan
Write-Host 'Deje abierta esta terminal. Para detener el servicio pulse Ctrl+C.' -ForegroundColor Yellow
& node $archivo

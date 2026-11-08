Write-Host "=== 1. Existe el binario? ===" -ForegroundColor Cyan
Test-Path "node_modules\electron\dist\electron.exe"

Write-Host "`n=== 2. Tamaño real del binario ===" -ForegroundColor Cyan
$bin = Get-Item "node_modules\electron\dist\electron.exe" -ErrorAction SilentlyContinue
if ($bin) {
  Write-Host "FullName: $($bin.FullName)"
  Write-Host "Length:   $($bin.Length) bytes ($([math]::Round($bin.Length/1MB, 1)) MB)"
  Write-Host "LastWriteTime: $($bin.LastWriteTime)"
} else {
  Write-Host "NO SE PUDO LEER EL ARCHIVO"
}

Write-Host "`n=== 3. Todos los archivos en node_modules/electron (raiz) ===" -ForegroundColor Cyan
Get-ChildItem "node_modules\electron\" -Force | Select-Object Name, Length | Format-Table -AutoSize

Write-Host "`n=== 4. Contenido del index.js de electron ===" -ForegroundColor Cyan
Get-Content "node_modules\electron\index.js"

Write-Host "`n=== 5. Version de electron en package.json ===" -ForegroundColor Cyan
Get-Content "node_modules\electron\package.json" | Select-String "version"

Write-Host "`n=== 6. Variables de entorno relevantes ===" -ForegroundColor Cyan
Write-Host "ELECTRON_RUN_AS_NODE: $env:ELECTRON_RUN_AS_NODE"
Write-Host "ELECTRON_OVERRIDE_DIST_PATH: $env:ELECTRON_OVERRIDE_DIST_PATH"
Write-Host "ELECTRON_NO_ATTACH_CONSOLE: $env:ELECTRON_NO_ATTACH_CONSOLE"

Write-Host "`n=== 7. Existe path.txt? ===" -ForegroundColor Cyan
Test-Path "node_modules\electron\path.txt"
if (Test-Path "node_modules\electron\path.txt") {
  Write-Host "Contenido de path.txt:"
  Get-Content "node_modules\electron\path.txt"
}
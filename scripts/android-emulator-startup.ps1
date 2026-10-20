param([switch]$Install,[switch]$Remove)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$stateFolder = Join-Path $projectRoot 'android\build'
$stopFile = Join-Path $stateFolder 'emulator-autoconnect.stop'
$shortcutPath = Join-Path ([Environment]::GetFolderPath('Startup')) 'Memoney Android Auto Connect.lnk'
$shell = New-Object -ComObject WScript.Shell
$marker = 'Memoney Android auto-connect for android_dev'
New-Item -ItemType Directory -Path $stateFolder -Force | Out-Null
if ($Install -or $Remove) {
  if (Test-Path -LiteralPath $shortcutPath) {
    $existing = $shell.CreateShortcut($shortcutPath)
    if ($existing.Description -ne $marker) { throw 'Existing startup shortcut is not managed by this project.' }
  }
}
if ($Remove) {
  [IO.File]::WriteAllText($stopFile,'stop',[Text.Encoding]::ASCII)
  if (Test-Path -LiteralPath $shortcutPath) { Remove-Item -LiteralPath $shortcutPath }
  Write-Output 'Memoney auto-connect disabled. Device data was not changed.'
  exit
}
if ($Install) {
  $shortcut = $shell.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = Join-Path $PSHOME 'powershell.exe'
  $shortcut.Arguments = '-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $PSCommandPath + '"'
  $shortcut.WorkingDirectory = $projectRoot
  $shortcut.WindowStyle = 7
  $shortcut.Description = $marker
  $shortcut.Save()
  if (Test-Path -LiteralPath $stopFile) { Remove-Item -LiteralPath $stopFile }
  Write-Output ('Installed startup shortcut: ' + $shortcutPath)
}
if (Test-Path -LiteralPath $stopFile) { exit }
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
$workerScript = Join-Path $PSScriptRoot 'android-emulator-autostart.mjs'
Start-Process -FilePath $nodePath -ArgumentList @('"'+$workerScript+'"') -WorkingDirectory $projectRoot -WindowStyle Hidden
Write-Output 'Memoney auto-connect started without a console window.'

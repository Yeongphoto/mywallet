param(
  [ValidateSet('list','stop')][string]$Action = 'list',
  [int]$ProcessId = 0,
  [string]$StartedAt = ''
)
$ErrorActionPreference = 'Stop'
function Is-MediumPhone($process) {
  return $process.Name -match '^(emulator|qemu-system-x86_64(?:-headless)?)\.exe$' -and
    $process.CommandLine -match '(?:^|\s)-avd\s+"?Medium_Phone"?(?:\s|$)'
}
if ($Action -eq 'list') {
  $items = @(Get-CimInstance Win32_Process | Where-Object { Is-MediumPhone $_ } | ForEach-Object {
    [pscustomobject]@{ id=$_.ProcessId; started=$_.CreationDate.ToUniversalTime().Ticks.ToString(); ageMs=([datetime]::UtcNow-$_.CreationDate.ToUniversalTime()).TotalMilliseconds }
  })
  ConvertTo-Json -InputObject $items -Compress
} else {
  $target = Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId"
  if (!$target) { return }
  if (!(Is-MediumPhone $target) -or $target.CreationDate.ToUniversalTime().Ticks.ToString() -ne $StartedAt) {
    throw 'Process identity changed; refusing to stop it.'
  }
  Stop-Process -Id $ProcessId -Force
}

# Chiude solo il server REV04 avviato da questa cartella (PID file + verifica CommandLine)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$PidFile = Join-Path $Root ".rev04_server.pid"
$Port = 8767
$Quiet = $args -contains "-Quiet"

function Show-Msg([string]$Text) {
  if ($Quiet) {
    Write-Host $Text
    return
  }
  Add-Type -AssemblyName PresentationFramework | Out-Null
  [System.Windows.MessageBox]::Show($Text, "Managing Platform REV04") | Out-Null
}

function Test-IsOurServer([int]$ProcessId) {
  $p = Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction SilentlyContinue
  if (-not $p) { return $false }
  $cmd = [string]$p.CommandLine
  $rootNorm = $Root.TrimEnd("\")
  if ($cmd -like "*$rootNorm*server*src*index.js*") { return $true }
  if ($cmd -match "server[\\/]+src[\\/]+index\.js") {
    if (Test-Path -LiteralPath $PidFile) {
      $raw = (Get-Content -LiteralPath $PidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
      if ($raw -match "^\d+$" -and [int]$raw -eq $ProcessId) { return $true }
    }
  }
  return $false
}

$targets = New-Object System.Collections.Generic.List[int]

if (Test-Path -LiteralPath $PidFile) {
  $raw = (Get-Content -LiteralPath $PidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
  if ($raw -match "^\d+$") {
    $pidVal = [int]$raw
    if (Test-IsOurServer $pidVal) { $targets.Add($pidVal) }
  }
}

$listen = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
  Select-Object -First 1
if ($listen) {
  $lp = [int]$listen.OwningProcess
  if ((Test-IsOurServer $lp) -and -not $targets.Contains($lp)) {
    $targets.Add($lp)
  }
}

if ($targets.Count -eq 0) {
  Show-Msg "Nessun server REV04 attivo da chiudere per questa cartella."
  if (Test-Path -LiteralPath $PidFile) { Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue }
  exit 0
}

foreach ($pidVal in $targets) {
  Stop-Process -Id $pidVal -Force -ErrorAction SilentlyContinue
}

Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
Show-Msg "Server REV04 chiuso."
exit 0

# Managing Platform REV04 — avvio locale (porta 8767)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $Root

$Port = 8767
$Url = "http://127.0.0.1:$Port/"
$PidFile = Join-Path $Root ".rev04_server.pid"
$ServerEntry = Join-Path $Root "server\src\index.js"

function Show-Msg([string]$Text) {
  Add-Type -AssemblyName PresentationFramework | Out-Null
  [System.Windows.MessageBox]::Show($Text, "Managing Platform REV04") | Out-Null
}

function Get-ListenerPid([int]$PortNum) {
  $c = Get-NetTCPConnection -LocalPort $PortNum -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if ($c) { return [int]$c.OwningProcess }
  return $null
}

function Test-IsOurServer([int]$ProcessId) {
  $p = Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction SilentlyContinue
  if (-not $p) { return $false }
  $cmd = [string]$p.CommandLine
  $rootNorm = $Root.TrimEnd("\")
  # Avvio con path assoluto (preferito) oppure path relativo + PID file della cartella
  if ($cmd -like "*$rootNorm*server*src*index.js*") { return $true }
  if ($cmd -match "server[\\/]+src[\\/]+index\.js") {
    if (Test-Path -LiteralPath $PidFile) {
      $raw = (Get-Content -LiteralPath $PidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
      if ($raw -match "^\d+$" -and [int]$raw -eq $ProcessId) { return $true }
    }
  }
  return $false
}

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
  Show-Msg "Node.js non e' disponibile. Installare Node.js oppure verificare il percorso."
  exit 1
}

if (-not (Test-Path -LiteralPath $ServerEntry)) {
  Show-Msg "File server non trovato: server\src\index.js. Verificare la cartella REV04."
  exit 1
}

if (-not (Test-Path -LiteralPath (Join-Path $Root "node_modules\express\package.json"))) {
  Show-Msg "Dipendenze mancanti (node_modules). Eseguire 'npm install' nella cartella REV04."
  exit 1
}

$listenPid = Get-ListenerPid $Port
if ($null -ne $listenPid) {
  $savedPid = $null
  if (Test-Path -LiteralPath $PidFile) {
    $raw = (Get-Content -LiteralPath $PidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
    if ($raw -match "^\d+$") { $savedPid = [int]$raw }
  }

  if (($null -ne $savedPid -and $savedPid -eq $listenPid) -or (Test-IsOurServer $listenPid)) {
    Set-Content -LiteralPath $PidFile -Value "$listenPid" -Encoding ascii
    Start-Process $Url
    exit 0
  }

  Show-Msg "La porta $Port e' gia' utilizzata da un altro programma. Chiuderlo oppure modificare la porta configurata per REV04."
  exit 1
}

# Percorso assoluto nel CommandLine: serve a riconoscere/chiudere solo questo server
$proc = Start-Process -FilePath $nodeCmd.Source `
  -ArgumentList @($ServerEntry) `
  -WorkingDirectory $Root `
  -WindowStyle Minimized `
  -PassThru

Set-Content -LiteralPath $PidFile -Value "$($proc.Id)" -Encoding ascii

$ready = $false
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Milliseconds 500
  if ($null -ne (Get-ListenerPid $Port)) {
    $ready = $true
    break
  }
  if ($proc.HasExited) { break }
}

if (-not $ready) {
  Show-Msg "Il server REV04 non ha risposto sulla porta $Port. Controllare Node.js o i log."
  exit 1
}

Start-Process $Url
exit 0

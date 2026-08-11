<#
.SYNOPSIS
  DEPRECATED — use .\scripts\Start-LocalDemo.ps1 instead.

.DESCRIPTION
  Legacy launcher kept for compatibility. Prefer Start-LocalDemo.ps1 which
  ensures Postgres, starts PhoBERT before backend, waits on health endpoints,
  skips duplicates, and pairs with Stop-LocalDemo.ps1 PID tracking.

  This script still launches FE/BE/NLP windows but does not health-wait and
  may create duplicate processes.
#>

[CmdletBinding()]
param(
    [switch]$SkipFrontend,
    [switch]$SkipBackend,
    [switch]$SkipNlp
)

$ErrorActionPreference = "Stop"

$RepoRoot = $PSScriptRoot
$FrontendDir = Join-Path $RepoRoot "frontend"
$BackendDir = Join-Path $RepoRoot "backend"
$MlRepoDir = Join-Path (Split-Path $RepoRoot -Parent) "smart-livestream-ml"

function Resolve-PythonExe {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ProjectDir
    )

    $venvPython = Join-Path $ProjectDir ".venv\Scripts\python.exe"
    if (Test-Path -LiteralPath $venvPython) {
        return (Resolve-Path -LiteralPath $venvPython).Path
    }

    return "python"
}

function Start-ServiceWindow {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Title,
        [Parameter(Mandatory = $true)]
        [string]$Command
    )

    $wrappedCommand = @"
`$Host.UI.RawUI.WindowTitle = '$Title'
$Command
"@

    Start-Process -FilePath "powershell.exe" -ArgumentList @("-NoExit", "-Command", $wrappedCommand) | Out-Null
}

function Test-RequiredDirectory {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,
        [Parameter(Mandatory = $true)]
        [string]$Label
    )

    if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
        throw "$Label not found: $Path"
    }
}

Write-Host "Smart Livestream V1 - local full stack" -ForegroundColor Cyan
Write-Host "Repo root: $RepoRoot"
Write-Host ""

Test-RequiredDirectory -Path $FrontendDir -Label "Frontend folder"
Test-RequiredDirectory -Path $BackendDir -Label "Backend folder"

if (-not $SkipNlp) {
    Test-RequiredDirectory -Path $MlRepoDir -Label "NLP repo (smart-livestream-ml)"
    Write-Host "NLP model selection: Python registry (config/model_registry.yaml)" -ForegroundColor DarkGray
    if ($env:INTENT_MODEL_DIR) {
        Write-Host ("  INTENT_MODEL_DIR override: " + $env:INTENT_MODEL_DIR) -ForegroundColor DarkGray
    }
    if ($env:INTENT_ACTIVE_MODEL_ID) {
        Write-Host ("  INTENT_ACTIVE_MODEL_ID override: " + $env:INTENT_ACTIVE_MODEL_ID) -ForegroundColor DarkGray
    }
}

if (-not $SkipFrontend) {
    Write-Host "Starting frontend (port 5173)..." -ForegroundColor Green
    $frontendCommand = @"
Set-Location -LiteralPath '$FrontendDir'
npm run dev
"@
    Start-ServiceWindow -Title "Smart Livestream - Frontend" -Command $frontendCommand
}

if (-not $SkipBackend) {
    $backendPython = Resolve-PythonExe -ProjectDir $BackendDir
    Write-Host ("Starting backend (port 8000) using " + $backendPython + "...") -ForegroundColor Green

    # Intent-correction feedback DB stays optional; chat can remain memory.
    # Prefer values already exported; otherwise load common keys from backend/.env.
    $backendCommand = @"
Set-Location -LiteralPath '$BackendDir'
`$env:ML_INTENT_API_URL = if (`$env:ML_INTENT_API_URL) { `$env:ML_INTENT_API_URL } else { 'http://127.0.0.1:8010' }
`$env:ML_INTENT_TIMEOUT_SECONDS = if (`$env:ML_INTENT_TIMEOUT_SECONDS) { `$env:ML_INTENT_TIMEOUT_SECONDS } else { '2' }
`$env:CAMERA_PRODUCT_RECOGNITION_ENABLED = 'false'
`$envFile = Join-Path '$BackendDir' '.env'
if (Test-Path -LiteralPath `$envFile) {
  Get-Content -LiteralPath `$envFile | ForEach-Object {
    `$line = `$_.Trim()
    if (-not `$line -or `$line.StartsWith('#')) { return }
    `$parts = `$line -split '=', 2
    if (`$parts.Count -ne 2) { return }
    `$key = `$parts[0].Trim()
    `$value = `$parts[1].Trim().Trim('"').Trim("'")
    if (`$key -and -not [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable(`$key))) { return }
    Set-Item -Path ("Env:" + `$key) -Value `$value
  }
}
if (-not `$env:CHAT_PERSISTENCE_MODE) { `$env:CHAT_PERSISTENCE_MODE = 'memory' }
& '$backendPython' -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
"@
    Start-ServiceWindow -Title "Smart Livestream - Backend" -Command $backendCommand
}

if (-not $SkipNlp) {
    $mlPython = Resolve-PythonExe -ProjectDir $MlRepoDir
    $serveScript = Join-Path $MlRepoDir "scripts\serve_intent_api.py"

    if (-not (Test-Path -LiteralPath $serveScript -PathType Leaf)) {
        throw "NLP serve script not found: $serveScript"
    }

    Write-Host ("Starting NLP service (port 8010) using " + $mlPython + "...") -ForegroundColor Green

    $nlpEnvLines = @("Set-Location -LiteralPath '$MlRepoDir'")
    if ($env:INTENT_MODEL_DIR) {
        $nlpEnvLines += "`$env:INTENT_MODEL_DIR = '$($env:INTENT_MODEL_DIR)'"
    }
    if ($env:INTENT_ACTIVE_MODEL_ID) {
        $nlpEnvLines += "`$env:INTENT_ACTIVE_MODEL_ID = '$($env:INTENT_ACTIVE_MODEL_ID)'"
    }
    if ($env:INTENT_MODEL_ID) {
        $nlpEnvLines += "`$env:INTENT_MODEL_ID = '$($env:INTENT_MODEL_ID)'"
    }
    $nlpEnvLines += "& '$mlPython' '$serveScript' --port 8010"
    $nlpCommand = ($nlpEnvLines -join "`n")

    Start-ServiceWindow -Title "Smart Livestream - NLP" -Command $nlpCommand
}

Write-Host ""
Write-Host "Service windows opened. Verify when ready:" -ForegroundColor Cyan
if (-not $SkipFrontend) {
    Write-Host "  Frontend:       http://127.0.0.1:5173"
}
if (-not $SkipBackend) {
    Write-Host "  Backend health: http://127.0.0.1:8000/api/health"
}
if (-not $SkipNlp) {
    Write-Host "  NLP health:     http://127.0.0.1:8010/health"
}
Write-Host ""
Write-Host "Close each PowerShell window to stop that service." -ForegroundColor DarkGray

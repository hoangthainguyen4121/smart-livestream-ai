<#
.SYNOPSIS
  Start all V1 local services in separate PowerShell windows for end-to-end verification.

.DESCRIPTION
  Launches (by default):
    1. Frontend - npm run dev on http://127.0.0.1:5173
    2. Backend - uvicorn on http://127.0.0.1:8000 (proxies NLP to port 8010)
    3. NLP ML - smart-livestream-ml serve_intent_api.py on http://127.0.0.1:8010

  Prerequisites:
    - Node.js/npm on PATH
    - Python 3.11+ (or backend/.venv and smart-livestream-ml/.venv)
    - Sibling repo: ../smart-livestream-ml with a trained model under artifacts/

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\start-local-full.ps1

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\start-local-full.ps1 -SkipNlp

.PARAMETER SkipFrontend
  Do not start the Vite dev server.

.PARAMETER SkipBackend
  Do not start the FastAPI backend.

.PARAMETER SkipNlp
  Do not start the PhoBERT intent API (backend falls back to rules).
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

$selectedModelDir = $null
if (-not $SkipNlp) {
    Test-RequiredDirectory -Path $MlRepoDir -Label "NLP repo (smart-livestream-ml)"

    $modelCandidates = @(
        "artifacts/phobert_base_combined_hardcases_v2"
    )

    foreach ($candidate in $modelCandidates) {
        $candidatePath = Join-Path $MlRepoDir $candidate
        if (Test-Path -LiteralPath $candidatePath -PathType Container) {
            $selectedModelDir = $candidate
            break
        }
    }

    if (-not $selectedModelDir) {
        $expected = ($modelCandidates | ForEach-Object { Join-Path $MlRepoDir $_ }) -join "`n  "
        throw @"
No NLP model directory found under smart-livestream-ml.
Expected one of:
  $expected
Use -SkipNlp to start without the ML service.
"@
    }

    Write-Host ("NLP model dir: " + $selectedModelDir) -ForegroundColor DarkGray
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

    $backendCommand = @"
Set-Location -LiteralPath '$BackendDir'
`$env:ML_INTENT_API_URL = 'http://127.0.0.1:8010'
`$env:ML_INTENT_TIMEOUT_SECONDS = '2'
`$env:CAMERA_PRODUCT_RECOGNITION_ENABLED = 'false'
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

    $nlpCommand = @"
Set-Location -LiteralPath '$MlRepoDir'
& '$mlPython' '$serveScript' --model-dir '$selectedModelDir' --port 8010
"@
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

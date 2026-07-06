param(
    [switch]$Reload
)

$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$backendDir = Join-Path $projectRoot "backend"
$pythonExe = Join-Path $projectRoot ".venv\Scripts\python.exe"

if (-not (Test-Path $pythonExe)) {
    Write-Host "Missing virtualenv Python: $pythonExe"
    Write-Host "Create it first: python -m venv .venv"
    exit 1
}

& (Join-Path $projectRoot "scripts\stop-backend.ps1")
if ($LASTEXITCODE -ne 0) {
    Write-Host "Warning: stop-backend reported leftover processes."
}

Set-Location $backendDir

$localEnvFile = Join-Path $backendDir ".env"
if (Test-Path $localEnvFile) {
    Get-Content $localEnvFile | ForEach-Object {
        $line = $_.Trim()
        if ($line -eq "" -or $line.StartsWith("#")) {
            return
        }
        $parts = $line -split "=", 2
        if ($parts.Length -eq 2) {
            $name = $parts[0].Trim()
            $value = $parts[1].Trim()
            if ($name) {
                Set-Item -Path "env:$name" -Value $value
            }
        }
    }
    Write-Host "Loaded backend env from $localEnvFile"
}

$uvicornArgs = @(
    "-m", "uvicorn", "app.main:app",
    "--host", "127.0.0.1",
    "--port", "8000"
)

if ($Reload) {
    Write-Host "Starting backend WITH reload (demo may hang on Ctrl+C if stream is active)."
    $uvicornArgs += "--reload"
    $uvicornArgs += "--reload-exclude"
    $uvicornArgs += "tests/*"
} else {
    Write-Host "Starting backend WITHOUT reload (recommended for demo)."
}

Write-Host "Command: $pythonExe $($uvicornArgs -join ' ')"
& $pythonExe @uvicornArgs

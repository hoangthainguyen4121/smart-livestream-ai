$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    throw "Python was not found on PATH."
}

Write-Host "Starting Smart Livestream desktop camera client..."
Write-Host "Backend dashboard expected at http://127.0.0.1:8000"
Write-Host "Press Q or ESC in the camera window to quit."
Write-Host "Press G to toggle gestures (Thumbs Up, Raise Hand)."

python desktop_client/main.py run `
  --camera-index 0 `
  --width 640 `
  --height 480 `
  --display-width 1280 `
  --display-height 720 `
  --recognition-interval 8 `
  --tracker mosse `
  --no-gestures `
  @args

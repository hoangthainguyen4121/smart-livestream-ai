# Local CV accuracy calibration (Firearm ONNX sweep + Adult score audit).
# Usage: .\scripts\Evaluate-CvAccuracy.ps1
# Output: .local/cv-eval/results.json + results.csv (no media committed)

$ErrorActionPreference = "Stop"
$PocRoot = Split-Path -Parent $PSScriptRoot
$Python = Join-Path $PocRoot ".venv\Scripts\python.exe"
if (-not (Test-Path -LiteralPath $Python)) {
    throw "Missing venv python: $Python"
}

$env:FIREARM_ONNX_ENABLED = "true"
if (-not $env:FIREARM_ONNX_CACHE_DIR) {
    $env:FIREARM_ONNX_CACHE_DIR = Join-Path $env:USERPROFILE ".cache\smart-livestream-firearm-onnx"
}
$env:FIREARM_ONNX_CONF = "0.01"
$env:SUGGESTIVE_CLASSIFIER_ENABLED = "true"
if (-not $env:SUGGESTIVE_MODEL_CACHE_DIR) {
    $env:SUGGESTIVE_MODEL_CACHE_DIR = Join-Path $env:USERPROFILE ".cache\smart-livestream-suggestive"
}
$env:SUGGESTIVE_LOCAL_FILES_ONLY = "true"
$env:NSFW_FRAME_GATE_ENABLED = "true"
if (-not $env:NSFW_MODEL_CACHE_DIR) {
    $env:NSFW_MODEL_CACHE_DIR = Join-Path $env:USERPROFILE ".cache\smart-livestream-nsfw"
}

Write-Host "Running corrected gun GT eval (timestamp-bound annotations)..."
& $Python (Join-Path $PocRoot "scripts\evaluate_gun_ground_truth.py")
if ($LASTEXITCODE -ne 0) {
    throw "evaluate_gun_ground_truth.py failed with exit $LASTEXITCODE"
}
Write-Host "Optional legacy adult+gun script (prior metrics INVALID if reused)..."
& $Python (Join-Path $PocRoot "scripts\evaluate_cv_accuracy.py")
Write-Host "Done. See .local/cv-eval/gun_gt_results.json (authoritative for gun GT)"

<#
.SYNOPSIS
  One-command local demo stack for Smart Livestream POC (+ sibling ML).

.DESCRIPTION
  Postgres (Windows service) → PhoBERT :8010 → Backend :8000 → Frontend :5173.
  NSFW / Grounding DINO run in-process on the backend when local flags are set
  (no extra terminals). Does not rewrite production defaults or deploy.

.EXAMPLE
  .\scripts\Start-LocalDemo.ps1

.EXAMPLE
  .\scripts\Start-LocalDemo.ps1 -WarmCv

.EXAMPLE
  # Research only: enable Custom YOLOX V3 harness (cv-test A/B). MVP hot path keeps it OFF.
  .\scripts\Start-LocalDemo.ps1 -WarmCv -EnableYoloxHarness
#>

[CmdletBinding()]
param(
    [switch]$WarmCv,
    [switch]$SkipFrontend,
    [switch]$SkipBackend,
    [switch]$SkipNlp,
    # OFF by default — YOLOX V3 must not load on DemoPage livestream hot path.
    [switch]$EnableYoloxHarness
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$ScriptDir = $PSScriptRoot
$PocRoot = (Resolve-Path (Join-Path $ScriptDir "..")).Path
$FrontendDir = Join-Path $PocRoot "frontend"
$BackendDir = Join-Path $PocRoot "backend"
$MlRoot = Join-Path (Split-Path $PocRoot -Parent) "smart-livestream-ml"
$StateDir = Join-Path $PocRoot ".local"
$StateFile = Join-Path $StateDir "demo-stack.json"
$PgServiceName = "postgresql-x64-17"
$LocalDbName = "smart_livestream_local"
$DefaultDatabaseUrl = "postgresql+psycopg://postgres:postgres@127.0.0.1:5432/smart_livestream_local"
$DefaultAdminKey = "local-dev-admin-key"

$BackendUrl = "http://127.0.0.1:8000"
$NlpUrl = "http://127.0.0.1:8010"
$FrontendUrl = "http://127.0.0.1:5173"

function Write-Step([string]$Message) {
    Write-Host $Message -ForegroundColor Cyan
}

function Write-Ok([string]$Message) {
    Write-Host $Message -ForegroundColor Green
}

function Write-Warn([string]$Message) {
    Write-Host $Message -ForegroundColor Yellow
}

function Import-DotEnvFile {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [hashtable]$Target
    )
    if (-not (Test-Path -LiteralPath $Path)) {
        return
    }
    Get-Content -LiteralPath $Path | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith("#") -or ($line -notmatch "=")) {
            return
        }
        $parts = $line -split "=", 2
        $key = $parts[0].Trim()
        $value = $parts[1].Trim().Trim('"').Trim("'")
        if (-not $key) { return }
        if (-not $Target.ContainsKey($key)) {
            $Target[$key] = $value
        }
    }
}

function Resolve-PythonExe {
    param([string[]]$Candidates)
    foreach ($path in $Candidates) {
        if ($path -and (Test-Path -LiteralPath $path)) {
            return (Resolve-Path -LiteralPath $path).Path
        }
    }
    $cmd = Get-Command python -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    throw "Python executable not found. Create .venv under POC or ML repo."
}

function Test-HttpOk {
    param(
        [Parameter(Mandatory = $true)][string]$Url,
        [int]$TimeoutSec = 3
    )
    try {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec $TimeoutSec
        return ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300)
    }
    catch {
        return $false
    }
}

function Get-HttpJson {
    param(
        [Parameter(Mandatory = $true)][string]$Url,
        [int]$TimeoutSec = 5
    )
    try {
        $response = Invoke-RestMethod -Uri $Url -TimeoutSec $TimeoutSec
        return $response
    }
    catch {
        return $null
    }
}

function Wait-HttpOk {
    param(
        [Parameter(Mandatory = $true)][string]$Url,
        [Parameter(Mandatory = $true)][string]$Label,
        [int]$TimeoutSec = 120,
        [int]$IntervalSec = 2
    )
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        if (Test-HttpOk -Url $Url) {
            Write-Ok ("  healthy: {0}" -f $Label)
            return
        }
        Start-Sleep -Seconds $IntervalSec
    }
    throw ("Timed out waiting for {0} ({1})" -f $Label, $Url)
}

function Test-PortListening([int]$Port) {
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -First 1
    return $null -ne $conn
}

function Ensure-PostgresService {
    $service = Get-Service -Name $PgServiceName -ErrorAction SilentlyContinue
    if ($null -eq $service) {
        throw ("Windows service '{0}' not found. Install PostgreSQL 17 or update PgServiceName." -f $PgServiceName)
    }
    if ($service.Status -ne "Running") {
        Write-Step ("Starting PostgreSQL service {0}..." -f $PgServiceName)
        Start-Service -Name $PgServiceName
        $service.WaitForStatus("Running", [TimeSpan]::FromSeconds(30))
    }
    else {
        Write-Ok ("PostgreSQL service already running ({0})" -f $PgServiceName)
    }
}

function Ensure-LocalDatabase {
    param([hashtable]$EnvMap)

    $databaseUrl = $EnvMap["DATABASE_URL"]
    if (-not $databaseUrl) {
        $databaseUrl = $DefaultDatabaseUrl
        $EnvMap["DATABASE_URL"] = $databaseUrl
    }

    # Parse user/password/host/port without printing secrets.
    if ($databaseUrl -notmatch "postgresql(?:\+psycopg)?://([^:]+):([^@]+)@([^:/]+):(\d+)/([^?\s]+)") {
        Write-Warn "DATABASE_URL format not recognized; skipping ensure-database (will rely on existing DB)."
        return
    }
    $dbUser = $Matches[1]
    $dbPass = $Matches[2]
    $dbHost = $Matches[3]
    $dbPort = $Matches[4]
    $dbName = $Matches[5]
    if ($dbName -ne $LocalDbName) {
        Write-Warn ("DATABASE_URL points to '{0}' (expected {1}); not auto-creating." -f $dbName, $LocalDbName)
        return
    }

    $psql = $null
    foreach ($candidate in @(
            "C:\Program Files\PostgreSQL\17\bin\psql.exe",
            "C:\Program Files\PostgreSQL\16\bin\psql.exe"
        )) {
        if (Test-Path -LiteralPath $candidate) { $psql = $candidate; break }
    }
    $cmd = Get-Command psql -ErrorAction SilentlyContinue
    if (-not $psql -and $cmd) { $psql = $cmd.Source }
    if (-not $psql) {
        Write-Warn "psql not found; skipping ensure-database."
        return
    }

    $env:PGPASSWORD = $dbPass
    try {
        $exists = & $psql -h $dbHost -p $dbPort -U $dbUser -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$LocalDbName'" 2>$null
        if (($exists | Out-String).Trim() -eq "1") {
            Write-Ok ("Database already exists: {0}" -f $LocalDbName)
            return
        }
        Write-Step ("Creating database {0}..." -f $LocalDbName)
        & $psql -h $dbHost -p $dbPort -U $dbUser -d postgres -c "CREATE DATABASE $LocalDbName" | Out-Null
        Write-Ok ("Database created: {0}" -f $LocalDbName)
    }
    finally {
        Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    }
}

function Ensure-AlembicHead {
    param(
        [Parameter(Mandatory = $true)][string]$PythonExe,
        [hashtable]$EnvMap
    )
    if (-not $EnvMap["DATABASE_URL"]) {
        Write-Warn "No DATABASE_URL; skip Alembic check."
        return
    }

    Push-Location $BackendDir
    $prevEap = $ErrorActionPreference
    try {
        foreach ($key in $EnvMap.Keys) {
            Set-Item -Path ("Env:{0}" -f $key) -Value ([string]$EnvMap[$key])
        }
        # Alembic logs INFO to stderr; do not treat that as a terminating error.
        $ErrorActionPreference = "Continue"
        $currentLines = & $PythonExe -m alembic current 2>&1 | ForEach-Object { "$_" }
        $headLines = & $PythonExe -m alembic heads 2>&1 | ForEach-Object { "$_" }
        $currentRev = ($currentLines | Where-Object { $_ -match '^[0-9a-fA-F_]+' } | Select-Object -First 1)
        $headRev = ($headLines | Where-Object { $_ -match '^[0-9a-fA-F_]+' } | Select-Object -First 1)
        if (-not $currentRev -or -not $headRev) {
            Write-Warn "Alembic current/heads unavailable; skip migrate."
            return
        }
        $currentRev = ($currentRev -split "\s+")[0]
        $headRev = ($headRev -split "\s+")[0]
        if ($currentRev -eq $headRev) {
            Write-Ok ("Alembic already at head ({0})" -f $headRev)
            return
        }
        Write-Step ("Alembic not at head ({0} -> {1}); upgrading..." -f $currentRev, $headRev)
        & $PythonExe -m alembic upgrade head
        if ($LASTEXITCODE -ne 0) {
            throw "alembic upgrade head failed"
        }
        Write-Ok "Alembic upgrade complete"
    }
    finally {
        $ErrorActionPreference = $prevEap
        Pop-Location
    }
}

function Start-TrackedWindow {
    param(
        [Parameter(Mandatory = $true)][string]$Title,
        [Parameter(Mandatory = $true)][string]$WorkingDirectory,
        [Parameter(Mandatory = $true)][string]$CommandBody,
        [Parameter(Mandatory = $true)][string]$Role
    )

    $logDir = Join-Path $StateDir "logs"
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null
    $logFile = Join-Path $logDir ("{0}.log" -f $Role)

    $escapedTitle = $Title.Replace("'", "''")
    $escapedWd = $WorkingDirectory.Replace("'", "''")
    $escapedLog = $logFile.Replace("'", "''")

    $wrapped = @"
`$Host.UI.RawUI.WindowTitle = '$escapedTitle'
Set-Location -LiteralPath '$escapedWd'
`$ErrorActionPreference = 'Continue'
Write-Host '=== $escapedTitle ===' -ForegroundColor Cyan
Write-Host ('cwd: ' + (Get-Location))
try {
  $CommandBody
} catch {
  Write-Host `$_
  Write-Host 'Process exited with error. Window left open for logs.' -ForegroundColor Red
}
"@

    $proc = Start-Process -FilePath "powershell.exe" `
        -ArgumentList @("-NoExit", "-Command", $wrapped) `
        -WorkingDirectory $WorkingDirectory `
        -PassThru

    return [pscustomobject]@{
        role      = $Role
        title     = $Title
        pid       = $proc.Id
        logHint   = $logFile
        startedAt = (Get-Date).ToString("o")
        managed   = $true
    }
}

function Save-StackState {
    param([object]$State)
    New-Item -ItemType Directory -Force -Path $StateDir | Out-Null
    $State | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $StateFile -Encoding UTF8
}

function Get-PreviousManaged {
    # Leading comma prevents PowerShell from unwrapping empty arrays to $null.
    if (-not (Test-Path -LiteralPath $StateFile)) {
        return , @()
    }
    try {
        $prev = Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json
        if ($null -eq $prev -or $null -eq $prev.managed) {
            return , @()
        }
        return , @($prev.managed)
    }
    catch {
        return , @()
    }
}

function Get-AliveManagedRole {
    param(
        [Parameter(Mandatory = $true)][string]$Role,
        $PreviousManaged = @()
    )
    foreach ($item in @($PreviousManaged)) {
        if ($null -eq $item) { continue }
        if ($item.role -ne $Role) { continue }
        if (-not $item.managed) { continue }
        $pidValue = 0
        try { $pidValue = [int]$item.pid } catch { continue }
        if ($pidValue -le 0) { continue }
        $proc = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
        if ($null -ne $proc) {
            return $item
        }
    }
    return $null
}

function Format-CvSummary {
    param(
        $Status,
        [bool]$Warmed
    )
    if ($null -eq $Status) { return "UNKNOWN (status endpoint failed)" }
    $enabled = $false
    try { $enabled = [bool]$Status.enabled } catch { $enabled = $false }
    if (-not $enabled) { return "DISABLED" }
    $ready = $false
    try { $ready = [bool]$Status.ready } catch { $ready = $false }
    if ($Warmed -and $ready) { return "ENABLED / warmed" }
    if ($ready) { return "ENABLED / available" }
    return "ENABLED / lazy"
}

function Stop-ListeningPort {
    param(
        [Parameter(Mandatory = $true)][int]$Port,
        [string]$Label = "service"
    )
    $pids = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($procId in @($pids)) {
        if (-not $procId) { continue }
        Write-Warn ("Recycling {0} on :{1} (PID {2})" -f $Label, $Port, $procId)
        # Stop children first, then parent.
        Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
            Where-Object { $_.ParentProcessId -eq $procId } |
            ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 1
}

function Get-BackendEnvAssignments {
    param(
        [hashtable]$EnvMap,
        [string]$YoloxEnabled = "false"
    )
    $envAssignments = New-Object System.Collections.Generic.List[string]
    foreach ($key in @(
            "DATABASE_URL", "CHAT_PERSISTENCE_MODE", "ML_INTENT_API_URL", "ML_INTENT_TIMEOUT_SECONDS",
            "ADMIN_API_KEY", "NSFW_FRAME_GATE_ENABLED", "NSFW_MODEL_CACHE_DIR",
            "SUGGESTIVE_CLASSIFIER_ENABLED", "SUGGESTIVE_MODEL_CACHE_DIR",
            "SUGGESTIVE_MODEL_ID", "SUGGESTIVE_MODEL_REVISION", "SUGGESTIVE_MIN_SCORE",
            "WEAPON_DETECTOR_ENABLED", "WEAPON_MODEL_CACHE_DIR", "WEAPON_BOX_THRESHOLD",
            "WEAPON_TEXT_THRESHOLD", "FIREARM_ONNX_ENABLED", "FIREARM_ONNX_CACHE_DIR",
            "FIREARM_ONNX_MODEL_PATH", "FIREARM_ONNX_CONF", "FIREARM_ONNX_IOU",
            "FIREARM_YOLOX_ENABLED", "FIREARM_YOLOX_CACHE_DIR", "FIREARM_YOLOX_MODEL_PATH",
            "FIREARM_YOLOX_CONF", "FIREARM_YOLOX_IOU", "FIREARM_YOLOX_IMGSZ", "CORS_ORIGINS"
        )) {
        if ($EnvMap.ContainsKey($key) -and $EnvMap[$key]) {
            $val = [string]$EnvMap[$key]
            $valEscaped = $val.Replace("'", "''")
            $envAssignments.Add("`$env:$key = '$valEscaped'")
        }
    }
    if (-not $EnvMap.ContainsKey("CORS_ORIGINS")) {
        $envAssignments.Add("`$env:CORS_ORIGINS = 'http://localhost:5173,http://127.0.0.1:5173'")
    }
    # Force MVP CV flags last so they always win in the child process.
    # YOLOX stays OFF unless -EnableYoloxHarness (research / #/dev/cv-test only).
    $yoloxFlag = if ($YoloxEnabled -eq "true") { "true" } else { "false" }
    $envAssignments.Add("`$env:NSFW_FRAME_GATE_ENABLED = 'true'")
    $envAssignments.Add("`$env:SUGGESTIVE_CLASSIFIER_ENABLED = 'true'")
    $envAssignments.Add("`$env:WEAPON_DETECTOR_ENABLED = 'true'")
    $envAssignments.Add("`$env:FIREARM_ONNX_ENABLED = 'true'")
    $envAssignments.Add("`$env:FIREARM_YOLOX_ENABLED = '$yoloxFlag'")
    return $envAssignments
}

function Get-FrontendEnvBody {
    param([string]$YoloxEnabled = "false")
    $yoloxFlag = if ($YoloxEnabled -eq "true") { "true" } else { "false" }
    return @"
`$env:VITE_API_BASE_URL = 'http://127.0.0.1:8000'
`$env:VITE_NSFW_FRAME_GATE_ENABLED = 'true'
`$env:VITE_ADULT_MODERATION_ENABLED = 'true'
`$env:VITE_WEAPON_DETECTOR_ENABLED = 'true'
`$env:VITE_FIREARM_YOLOX_ENABLED = '$yoloxFlag'
`$env:VITE_FIREARM_ONNX_ENABLED = 'true'
`$env:VITE_NSFW_MIN_SCORE = '0.70'
`$env:VITE_NSFW_REQUIRED_HITS = '2'
`$env:VITE_NSFW_WINDOW_MS = '5000'
`$env:VITE_NSFW_INFERENCE_INTERVAL_MS = '1000'
`$env:VITE_ADULT_REQUIRED_HITS = '2'
`$env:VITE_ADULT_WINDOW_MS = '5000'
`$env:VITE_ADULT_INFERENCE_INTERVAL_MS = '1500'
`$env:VITE_WEAPON_MIN_SCORE = '0.42'
`$env:VITE_WEAPON_REQUIRED_HITS = '2'
`$env:VITE_WEAPON_WINDOW_MS = '35000'
`$env:VITE_WEAPON_INFERENCE_INTERVAL_MS = '10000'
`$env:VITE_WEAPON_AUTO_TERMINATE = 'false'
npm run dev -- --host 127.0.0.1 --port 5173
"@
}

function Assert-CvBackendEnabled {
    param(
        [Parameter(Mandatory = $true)]$NsfwStatus,
        [Parameter(Mandatory = $true)]$WeaponStatus,
        $AdultStatus = $null
    )
    $nsfwOn = $false
    $weaponOn = $false
    $adultOn = $true
    try { $nsfwOn = [bool]$NsfwStatus.enabled } catch { $nsfwOn = $false }
    try { $weaponOn = [bool]$WeaponStatus.enabled } catch { $weaponOn = $false }
    if ($null -ne $AdultStatus) {
        try { $adultOn = [bool]$AdultStatus.enabled } catch { $adultOn = $false }
    }
    if (-not $nsfwOn -or -not $weaponOn -or -not $adultOn) {
        throw ("CV flags not ENABLED on backend (nsfw.enabled={0}, weapon.enabled={1}, adult.enabled={2}). Expected NSFW + SUGGESTIVE + WEAPON enabled in the backend process." -f $nsfwOn, $weaponOn, $adultOn)
    }
}

function Wait-CvStatusSnapshot {
    param(
        [Parameter(Mandatory = $true)][string]$BackendUrl,
        [int]$Attempts = 20,
        [int]$DelayMs = 500
    )
    # After recycle, /api/health can be up a beat before status routes bind — retry briefly.
    $nsfwStatus = $null
    $adultStatus = $null
    $weaponStatus = $null
    $firearmStatus = $null
    $yoloxStatus = $null
    for ($i = 0; $i -lt $Attempts; $i++) {
        if ($null -eq $nsfwStatus) { $nsfwStatus = Get-HttpJson -Url "$BackendUrl/api/nsfw/status" }
        if ($null -eq $adultStatus) { $adultStatus = Get-HttpJson -Url "$BackendUrl/api/adult/status" }
        if ($null -eq $weaponStatus) { $weaponStatus = Get-HttpJson -Url "$BackendUrl/api/weapon/status" }
        if ($null -eq $firearmStatus) { $firearmStatus = Get-HttpJson -Url "$BackendUrl/api/weapon/firearm-onnx/status" }
        if ($null -eq $yoloxStatus) { $yoloxStatus = Get-HttpJson -Url "$BackendUrl/api/weapon/firearm-yolox/status" }
        if ($null -ne $nsfwStatus -and $null -ne $adultStatus -and $null -ne $weaponStatus -and $null -ne $firearmStatus -and $null -ne $yoloxStatus) {
            return [pscustomobject]@{
                nsfw    = $nsfwStatus
                adult   = $adultStatus
                weapon  = $weaponStatus
                firearm = $firearmStatus
                yolox   = $yoloxStatus
            }
        }
        Start-Sleep -Milliseconds $DelayMs
    }
    throw ("CV status endpoints not ready after recycle (nsfw={0}, adult={1}, weapon={2}, firearm={3}, yolox={4})." -f `
        ($null -ne $nsfwStatus), ($null -ne $adultStatus), ($null -ne $weaponStatus), ($null -ne $firearmStatus), ($null -ne $yoloxStatus))
}

# --- main ---
$startedAt = Get-Date
Write-Step "Smart Livestream - Start-LocalDemo"
Write-Host ("POC: {0}" -f $PocRoot)
Write-Host ("ML : {0}" -f $MlRoot)
Write-Host ""

if (-not (Test-Path -LiteralPath $FrontendDir)) { throw "Frontend missing: $FrontendDir" }
if (-not (Test-Path -LiteralPath $BackendDir)) { throw "Backend missing: $BackendDir" }
if (-not $SkipNlp -and -not (Test-Path -LiteralPath $MlRoot)) {
    throw "ML repo missing: $MlRoot"
}

$envMap = @{}
Import-DotEnvFile -Path (Join-Path $BackendDir ".env") -Target $envMap
Import-DotEnvFile -Path (Join-Path $PocRoot ".env") -Target $envMap

# Local demo overrides (child processes only - do not rewrite files).
if (-not $envMap.ContainsKey("CHAT_PERSISTENCE_MODE")) { $envMap["CHAT_PERSISTENCE_MODE"] = "memory" }
if (-not $envMap.ContainsKey("ML_INTENT_API_URL")) { $envMap["ML_INTENT_API_URL"] = $NlpUrl }
if (-not $envMap.ContainsKey("ML_INTENT_TIMEOUT_SECONDS")) { $envMap["ML_INTENT_TIMEOUT_SECONDS"] = "2" }
if (-not $envMap.ContainsKey("ADMIN_API_KEY")) { $envMap["ADMIN_API_KEY"] = $DefaultAdminKey }
if (-not $envMap.ContainsKey("DATABASE_URL")) { $envMap["DATABASE_URL"] = $DefaultDatabaseUrl }

# CV local flags for this demo session (child-process env only; do not rewrite .env.example).
# Exact names from code:
#   backend NSFW   -> NSFW_FRAME_GATE_ENABLED
#   backend Weapon -> WEAPON_DETECTOR_ENABLED (DINO fallback)
#   backend Firearm ONNX -> FIREARM_ONNX_ENABLED (MVP primary · Subh775)
#   backend Custom YOLOX -> FIREARM_YOLOX_ENABLED (OFF unless -EnableYoloxHarness)
#   frontend NSFW  -> VITE_NSFW_FRAME_GATE_ENABLED
#   frontend Weapon-> VITE_WEAPON_DETECTOR_ENABLED
#   frontend Firearm -> VITE_FIREARM_ONNX_ENABLED (default OFF in prod builds)
#   frontend YOLOX -> VITE_FIREARM_YOLOX_ENABLED (default OFF; research harness only)
$yoloxHarnessFlag = if ($EnableYoloxHarness) { "true" } else { "false" }
$envMap["NSFW_FRAME_GATE_ENABLED"] = "true"
$envMap["SUGGESTIVE_CLASSIFIER_ENABLED"] = "true"
$envMap["WEAPON_DETECTOR_ENABLED"] = "true"
$envMap["FIREARM_YOLOX_ENABLED"] = $yoloxHarnessFlag
$envMap["FIREARM_YOLOX_CONF"] = "0.02"
$envMap["FIREARM_YOLOX_IMGSZ"] = "416"
$envMap["FIREARM_ONNX_ENABLED"] = "true"
$envMap["FIREARM_ONNX_CONF"] = "0.65"
if (-not $envMap.ContainsKey("NSFW_MODEL_CACHE_DIR")) {
    $envMap["NSFW_MODEL_CACHE_DIR"] = (Join-Path $env:USERPROFILE ".cache\smart-livestream-nsfw")
}
if (-not $envMap.ContainsKey("SUGGESTIVE_MODEL_CACHE_DIR")) {
    $envMap["SUGGESTIVE_MODEL_CACHE_DIR"] = (Join-Path $env:USERPROFILE ".cache\smart-livestream-suggestive")
}
if (-not $envMap.ContainsKey("WEAPON_MODEL_CACHE_DIR")) {
    $envMap["WEAPON_MODEL_CACHE_DIR"] = (Join-Path $env:USERPROFILE ".cache\smart-livestream-weapon")
}
if (-not $envMap.ContainsKey("FIREARM_ONNX_CACHE_DIR")) {
    $envMap["FIREARM_ONNX_CACHE_DIR"] = (Join-Path $env:USERPROFILE ".cache\smart-livestream-firearm-onnx")
}
if (-not $envMap.ContainsKey("FIREARM_YOLOX_CACHE_DIR")) {
    $envMap["FIREARM_YOLOX_CACHE_DIR"] = (Join-Path $env:USERPROFILE ".cache\smart-livestream-firearm-yolox\artifacts")
}
if (-not $envMap.ContainsKey("WEAPON_BOX_THRESHOLD")) { $envMap["WEAPON_BOX_THRESHOLD"] = "0.42" }
if (-not $envMap.ContainsKey("WEAPON_TEXT_THRESHOLD")) { $envMap["WEAPON_TEXT_THRESHOLD"] = "0.30" }

$cvNsfwWarmed = $false
$cvAdultWarmed = $false
$cvWeaponWarmed = $false
$cvFirearmWarmed = $false
$cvYoloxWarmed = $false
$backendNeedsCvRecycle = $false
$frontendNeedsCvRestart = $false
# -WarmCv always refreshes Vite so VITE_ADULT / VITE_FIREARM* flags match this script
# (retaining an older FE process can silently keep stale import.meta.env).
if ($WarmCv -and -not $SkipFrontend) {
    $frontendNeedsCvRestart = $true
}

$backendPython = Resolve-PythonExe -Candidates @(
    (Join-Path $PocRoot ".venv\Scripts\python.exe"),
    (Join-Path $BackendDir ".venv\Scripts\python.exe")
)
$mlPython = Resolve-PythonExe -Candidates @(
    (Join-Path $MlRoot ".venv\Scripts\python.exe"),
    (Join-Path $PocRoot ".venv\Scripts\python.exe")
)

# Custom YOLOX V3 is research-only (cv-test / thesis). Not loaded on MVP DemoPage hot path.
$yoloxCacheDir = [string]$envMap["FIREARM_YOLOX_CACHE_DIR"]
$yoloxV3OnnxPath = Join-Path $yoloxCacheDir "v3_train\gun_yolox_nano.onnx"
$yoloxCanonicalOnnxPath = Join-Path $yoloxCacheDir "gun_yolox_nano.onnx"
$yoloxOnnxPath = if (Test-Path -LiteralPath $yoloxV3OnnxPath) { $yoloxV3OnnxPath } else { $yoloxCanonicalOnnxPath }
if (-not $envMap.ContainsKey("FIREARM_YOLOX_MODEL_PATH")) {
    $envMap["FIREARM_YOLOX_MODEL_PATH"] = $yoloxOnnxPath
}
if ($EnableYoloxHarness) {
    if (Test-Path -LiteralPath $yoloxOnnxPath) {
        Write-Ok ("Custom YOLOX harness ONNX (V3 preferred): {0}" -f $yoloxOnnxPath)
    }
    else {
        Write-Warn ("Custom YOLOX ONNX missing at {0} — harness A/B unavailable until weights are present." -f $yoloxOnnxPath)
    }
}
else {
    Write-Host "Custom YOLOX harness OFF (MVP: Subh775 primary; use -EnableYoloxHarness for #/dev/cv-test A/B)." -ForegroundColor DarkGray
}

# Ensure Firearm ONNX file exists outside the repo (export once if missing).
$firearmOnnxPath = Join-Path $envMap["FIREARM_ONNX_CACHE_DIR"] "firearm_yolov8n.onnx"
if (-not (Test-Path -LiteralPath $firearmOnnxPath)) {
    Write-Step "Subh775 Firearm ONNX missing — exporting weights (one-time, may take a few minutes)..."
    $exportScript = Join-Path $PocRoot "scripts\export_firearm_onnx.py"
    if (Test-Path -LiteralPath $exportScript) {
        $prevFirearmCache = $env:FIREARM_ONNX_CACHE_DIR
        $env:FIREARM_ONNX_CACHE_DIR = [string]$envMap["FIREARM_ONNX_CACHE_DIR"]
        try {
            & $backendPython $exportScript
            if ($LASTEXITCODE -ne 0) {
                Write-Warn "Firearm ONNX export failed (exit $LASTEXITCODE). Fallback remains Grounding DINO."
            }
        }
        catch {
            Write-Warn ("Firearm ONNX export failed: {0}" -f $_.Exception.Message)
        }
        finally {
            if ($null -eq $prevFirearmCache) { Remove-Item Env:FIREARM_ONNX_CACHE_DIR -ErrorAction SilentlyContinue }
            else { $env:FIREARM_ONNX_CACHE_DIR = $prevFirearmCache }
        }
    }
    else {
        Write-Warn "export_firearm_onnx.py missing — Subh775 Firearm ONNX unavailable until prepared."
    }
}

$managed = @()
$external = @()
$previousManaged = @(Get-PreviousManaged)
if ($null -eq $previousManaged) { $previousManaged = @() }

# 1) Postgres
Ensure-PostgresService
Ensure-LocalDatabase -EnvMap $envMap
try {
    Ensure-AlembicHead -PythonExe $backendPython -EnvMap $envMap
}
catch {
    Write-Warn ("Alembic check/migrate skipped or failed: {0}" -f $_.Exception.Message)
}

# 2) PhoBERT
if (-not $SkipNlp) {
    if (Test-HttpOk -Url "$NlpUrl/health") {
        Write-Ok "PhoBERT already healthy on :8010 - not starting a duplicate"
        $kept = Get-AliveManagedRole -Role "nlp" -PreviousManaged $previousManaged
        if ($null -ne $kept) {
            $managed += $kept
            Write-Host ("  retaining managed nlp pid={0}" -f $kept.pid) -ForegroundColor DarkGray
        }
        else {
            $external += [pscustomobject]@{ role = "nlp"; url = $NlpUrl; managed = $false }
        }
    }
    else {
        if (Test-PortListening 8010) {
            throw "Port 8010 is in use but /health is not OK. Free the port or fix the process, then retry."
        }
        $serveScript = Join-Path $MlRoot "scripts\serve_intent_api.py"
        if (-not (Test-Path -LiteralPath $serveScript)) {
            throw "Missing $serveScript"
        }
        Write-Step ("Starting PhoBERT intent API on :8010 using {0}" -f $mlPython)
        $nlpBody = @"
`$env:PYTHONUNBUFFERED = '1'
& '$mlPython' '$serveScript' --host 127.0.0.1 --port 8010
"@
        $managed += Start-TrackedWindow -Title "Smart Livestream - PhoBERT :8010" `
            -WorkingDirectory $MlRoot -CommandBody $nlpBody -Role "nlp"
        Wait-HttpOk -Url "$NlpUrl/health" -Label "PhoBERT /health" -TimeoutSec 180
    }

    # Warm-up predict (exactly one)
    Write-Step "Warming PhoBERT with one safe predict..."
    try {
        $warm = Invoke-RestMethod -Method Post -Uri "$NlpUrl/predict-intent" `
            -ContentType "application/json" `
            -Body '{"text":"san pham nay gia bao nhieu"}' `
            -TimeoutSec 60
        Write-Ok ("  warm predict ok intent={0}" -f $warm.intent)
    }
    catch {
        throw ("PhoBERT warm-up failed: {0}" -f $_.Exception.Message)
    }
}

# 3) Backend
function Start-BackendWithCvFlags {
    Write-Step ("Starting backend on :8000 using {0} (MVP CV: Subh775 ON; YOLOX harness={1})" -f $backendPython, $yoloxHarnessFlag)
    $envAssignments = Get-BackendEnvAssignments -EnvMap $envMap -YoloxEnabled $yoloxHarnessFlag
    $backendBody = @"
$($envAssignments -join "`n")
& '$backendPython' -m uvicorn app.main:app --host 127.0.0.1 --port 8000
"@
    $script:managed = @($script:managed | Where-Object { $_.role -ne "backend" })
    $script:managed += Start-TrackedWindow -Title "Smart Livestream - Backend :8000" `
        -WorkingDirectory $BackendDir -CommandBody $backendBody -Role "backend"
    Wait-HttpOk -Url "$BackendUrl/api/health" -Label "Backend /api/health" -TimeoutSec 90
}

if (-not $SkipBackend) {
    if (Test-HttpOk -Url "$BackendUrl/api/health") {
        Write-Ok "Backend already healthy on :8000 - checking CV flags via status endpoints"
        $probeNsfw = Get-HttpJson -Url "$BackendUrl/api/nsfw/status"
        $probeAdult = Get-HttpJson -Url "$BackendUrl/api/adult/status"
        $probeWeapon = Get-HttpJson -Url "$BackendUrl/api/weapon/status"
        $probeFirearm = Get-HttpJson -Url "$BackendUrl/api/weapon/firearm-onnx/status"
        $probeYolox = Get-HttpJson -Url "$BackendUrl/api/weapon/firearm-yolox/status"
        $nsfwOn = $false
        $adultOn = $false
        $weaponOn = $false
        $firearmOn = $false
        $yoloxOn = $false
        try { $nsfwOn = [bool]$probeNsfw.enabled } catch { $nsfwOn = $false }
        try { $adultOn = [bool]$probeAdult.enabled } catch { $adultOn = $false }
        try { $weaponOn = [bool]$probeWeapon.enabled } catch { $weaponOn = $false }
        try { $firearmOn = [bool]$probeFirearm.enabled } catch { $firearmOn = $false }
        try { $yoloxOn = [bool]$probeYolox.enabled } catch { $yoloxOn = $false }
        $yoloxWanted = ($yoloxHarnessFlag -eq "true")
        $yoloxMatches = ($yoloxOn -eq $yoloxWanted)
        if ($nsfwOn -and $adultOn -and $weaponOn -and $firearmOn -and $yoloxMatches) {
            $kept = Get-AliveManagedRole -Role "backend" -PreviousManaged $previousManaged
            if ($null -ne $kept) {
                $managed += $kept
                Write-Host ("  retaining managed backend pid={0} (CV + Adult + Subh775 ON; YOLOX harness={1})" -f $kept.pid, $yoloxHarnessFlag) -ForegroundColor DarkGray
            }
            else {
                $external += [pscustomobject]@{ role = "backend"; url = $BackendUrl; managed = $false }
                Write-Host ("  external backend already has CV + Adult + Subh775 ON; YOLOX harness={0}" -f $yoloxHarnessFlag) -ForegroundColor DarkGray
            }
        }
        else {
            Write-Warn ("Backend CV flags incomplete (nsfw={0}, adult={1}, weapon={2}, firearm_onnx={3}, yolox={4} wanted={5}) - recycling :8000" -f $nsfwOn, $adultOn, $weaponOn, $firearmOn, $yoloxOn, $yoloxWanted)
            $backendNeedsCvRecycle = $true
            $frontendNeedsCvRestart = $true
            Stop-ListeningPort -Port 8000 -Label "backend"
            Start-Sleep -Seconds 1
            if (Test-PortListening 8000) {
                throw "Could not free port 8000 to restart backend with CV flags."
            }
            Start-BackendWithCvFlags
        }
    }
    else {
        if (Test-PortListening 8000) {
            throw "Port 8000 is in use but /api/health is not OK. Free the port or fix the process, then retry."
        }
        Start-BackendWithCvFlags
    }

    if (-not $SkipNlp) {
        $nlpProxy = Get-HttpJson -Url "$BackendUrl/api/nlp/health"
        if ($null -eq $nlpProxy -or $nlpProxy.ml_service_status -ne "ok") {
            throw ("Backend /api/nlp/health did not report ML available. Detail: {0}" -f ($nlpProxy | ConvertTo-Json -Compress))
        }
        Write-Ok ("  NLP proxy sees ML model_id={0}" -f $nlpProxy.model_id)
    }

    # Hard verify: process health alone is not enough (retry — race right after recycle).
    $verify = Wait-CvStatusSnapshot -BackendUrl $BackendUrl
    Assert-CvBackendEnabled -NsfwStatus $verify.nsfw -WeaponStatus $verify.weapon -AdultStatus $verify.adult
    Write-Ok "  CV verified: Adult/NSFW enabled=true, Weapon enabled=true (models may still be lazy)"
}

# 4) Frontend (Vite reads VITE_* from process env before npm run dev)
function Start-FrontendWithCvFlags {
    Write-Step "Starting frontend Vite on :5173 (VITE CV flags forced true)"
    $feBody = Get-FrontendEnvBody -YoloxEnabled $yoloxHarnessFlag
    $script:managed = @($script:managed | Where-Object { $_.role -ne "frontend" })
    $script:managed += Start-TrackedWindow -Title "Smart Livestream - Frontend :5173" `
        -WorkingDirectory $FrontendDir -CommandBody $feBody -Role "frontend"
    Wait-HttpOk -Url $FrontendUrl -Label "Frontend :5173" -TimeoutSec 90
}

if (-not $SkipFrontend) {
    $feAlreadyUp = Test-HttpOk -Url $FrontendUrl
    $keptFe = Get-AliveManagedRole -Role "frontend" -PreviousManaged $previousManaged
    if ($feAlreadyUp -and (-not $frontendNeedsCvRestart) -and ($null -ne $keptFe)) {
        Write-Ok "Frontend already responding on :5173 - retaining managed process with prior VITE CV flags"
        $managed += $keptFe
        Write-Host ("  retaining managed frontend pid={0}" -f $keptFe.pid) -ForegroundColor DarkGray
    }
    elseif ($feAlreadyUp -and (-not $frontendNeedsCvRestart) -and ($null -eq $keptFe)) {
        # External Vite may have been started without VITE_* CV flags - restart to be safe.
        Write-Warn "Frontend on :5173 is external - restarting so VITE_NSFW/VITE_WEAPON flags are set"
        Stop-ListeningPort -Port 5173 -Label "frontend"
        Start-Sleep -Seconds 1
        if (Test-PortListening 5173) {
            throw "Could not free port 5173 to restart frontend with CV flags."
        }
        Start-FrontendWithCvFlags
    }
    elseif ($frontendNeedsCvRestart -and $feAlreadyUp) {
        Write-Warn "Restarting frontend after backend CV recycle so Vite picks up VITE_* flags"
        Stop-ListeningPort -Port 5173 -Label "frontend"
        Start-Sleep -Seconds 1
        Start-FrontendWithCvFlags
    }
    else {
        if (Test-PortListening 5173) {
            throw "Port 5173 is in use but HTTP is not OK. Free the port or fix the process, then retry."
        }
        Start-FrontendWithCvFlags
    }
}

# Optional CV warm (lazy by default - DINO is heavy; YOLOX/Subh775 ONNX are light)
$nsfwStatus = $null
$adultStatus = $null
$weaponStatus = $null
$firearmStatus = $null
$yoloxStatus = $null
if (-not $SkipBackend) {
    $snap = Wait-CvStatusSnapshot -BackendUrl $BackendUrl
    $nsfwStatus = $snap.nsfw
    $adultStatus = $snap.adult
    $weaponStatus = $snap.weapon
    $firearmStatus = $snap.firearm
    $yoloxStatus = $snap.yolox
}

if ($WarmCv -and -not $SkipBackend) {
    Write-Step "WarmCv: Adult → Subh775 ONNX (primary) → Grounding DINO (fallback)$(if ($EnableYoloxHarness) { ' → Custom YOLOX harness' } else { '' })..."
    # Valid 64x64 solid JPEG (1x1 warm payload breaks ImageNet processors / returns 400/503).
    $tinyJpeg = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCABAAEADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD5/ooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA//2Q=="
    try {
        Invoke-RestMethod -Method Post -Uri "$BackendUrl/api/adult/classify-frame" `
            -ContentType "application/json" `
            -Body (@{ imageBase64 = $tinyJpeg } | ConvertTo-Json) `
            -TimeoutSec 300 | Out-Null
        $cvAdultWarmed = $true
        $cvNsfwWarmed = $true
        Write-Ok "  Adult moderation warm classify ok (suggestive + Falconsai)"
    }
    catch {
        Write-Warn ("  Adult warm failed: {0}" -f $_.Exception.Message)
        try {
            Invoke-RestMethod -Method Post -Uri "$BackendUrl/api/nsfw/classify-frame" `
                -ContentType "application/json" `
                -Body (@{ imageBase64 = $tinyJpeg } | ConvertTo-Json) `
                -TimeoutSec 180 | Out-Null
            $cvNsfwWarmed = $true
            Write-Ok "  Falconsai NSFW warm classify ok (fallback warm)"
        }
        catch {
            Write-Warn ("  NSFW warm failed: {0}" -f $_.Exception.Message)
        }
    }
    try {
        Invoke-RestMethod -Method Post -Uri "$BackendUrl/api/weapon/firearm-onnx/detect-frame" `
            -ContentType "application/json" `
            -Body (@{ imageBase64 = $tinyJpeg } | ConvertTo-Json) `
            -TimeoutSec 60 | Out-Null
        $cvFirearmWarmed = $true
        Write-Ok "  Subh775 Firearm ONNX warm detect ok (primary)"
    }
    catch {
        Write-Warn ("  Subh775 Firearm ONNX warm failed (DINO remains fallback): {0}" -f $_.Exception.Message)
    }
    if ($EnableYoloxHarness) {
        try {
            Invoke-RestMethod -Method Post -Uri "$BackendUrl/api/weapon/firearm-yolox/detect-frame" `
                -ContentType "application/json" `
                -Body (@{ imageBase64 = $tinyJpeg } | ConvertTo-Json) `
                -TimeoutSec 60 | Out-Null
            $cvYoloxWarmed = $true
            Write-Ok "  Custom YOLOX V3 warm detect ok (research harness only)"
        }
        catch {
            Write-Warn ("  Custom YOLOX warm failed: {0}" -f $_.Exception.Message)
        }
    }
    else {
        Write-Host "  Custom YOLOX skipped (harness OFF — no extra CPU/RAM on MVP path)" -ForegroundColor DarkGray
    }
    try {
        Invoke-RestMethod -Method Post -Uri "$BackendUrl/api/weapon/detect-frame" `
            -ContentType "application/json" `
            -Body (@{ imageBase64 = $tinyJpeg } | ConvertTo-Json) `
            -TimeoutSec 300 | Out-Null
        $cvWeaponWarmed = $true
        Write-Ok "  Grounding DINO warm detect ok (fallback)"
    }
    catch {
        Write-Warn ("  Grounding DINO warm failed: {0}" -f $_.Exception.Message)
    }
    $nsfwStatus = Get-HttpJson -Url "$BackendUrl/api/nsfw/status"
    $adultStatus = Get-HttpJson -Url "$BackendUrl/api/adult/status"
    $weaponStatus = Get-HttpJson -Url "$BackendUrl/api/weapon/status"
    $firearmStatus = Get-HttpJson -Url "$BackendUrl/api/weapon/firearm-onnx/status"
    $yoloxStatus = Get-HttpJson -Url "$BackendUrl/api/weapon/firearm-yolox/status"
    Assert-CvBackendEnabled -NsfwStatus $nsfwStatus -WeaponStatus $weaponStatus -AdultStatus $adultStatus
}

# Final status snapshot for summary (must come from endpoints, not process presence).
if (-not $SkipBackend) {
    $nsfwStatus = Get-HttpJson -Url "$BackendUrl/api/nsfw/status"
    $adultStatus = Get-HttpJson -Url "$BackendUrl/api/adult/status"
    $weaponStatus = Get-HttpJson -Url "$BackendUrl/api/weapon/status"
    $firearmStatus = Get-HttpJson -Url "$BackendUrl/api/weapon/firearm-onnx/status"
    $yoloxStatus = Get-HttpJson -Url "$BackendUrl/api/weapon/firearm-yolox/status"
    Assert-CvBackendEnabled -NsfwStatus $nsfwStatus -WeaponStatus $weaponStatus -AdultStatus $adultStatus
}

$state = [pscustomobject]@{
    version     = 1
    pocRoot     = $PocRoot
    mlRoot      = $MlRoot
    createdAt   = (Get-Date).ToString("o")
    cvFlags     = @{
        NSFW_FRAME_GATE_ENABLED          = "true"
        SUGGESTIVE_CLASSIFIER_ENABLED    = "true"
        WEAPON_DETECTOR_ENABLED          = "true"
        FIREARM_YOLOX_ENABLED            = $yoloxHarnessFlag
        FIREARM_YOLOX_CONF               = "0.02"
        FIREARM_ONNX_ENABLED             = "true"
        VITE_NSFW_FRAME_GATE_ENABLED     = "true"
        VITE_ADULT_MODERATION_ENABLED    = "true"
        VITE_WEAPON_DETECTOR_ENABLED     = "true"
        VITE_FIREARM_YOLOX_ENABLED       = $yoloxHarnessFlag
        VITE_FIREARM_ONNX_ENABLED        = "true"
    }
    managed     = @($managed)
    external    = @($external)
}
Save-StackState -State $state

$elapsed = [int]((Get-Date) - $startedAt).TotalSeconds
$adultLabel = Format-CvSummary -Status $adultStatus -Warmed:$cvAdultWarmed
$nsfwLabel = Format-CvSummary -Status $nsfwStatus -Warmed:$cvNsfwWarmed
$yoloxLabel = Format-CvSummary -Status $yoloxStatus -Warmed:$cvYoloxWarmed
$firearmLabel = Format-CvSummary -Status $firearmStatus -Warmed:$cvFirearmWarmed
$weaponLabel = Format-CvSummary -Status $weaponStatus -Warmed:$cvWeaponWarmed
$suggestiveModel = "viddexa/nsfw-detection-2-nano"
try {
    if ($null -ne $adultStatus -and $null -ne $adultStatus.suggestive -and $adultStatus.suggestive.model_id) {
        $suggestiveModel = [string]$adultStatus.suggestive.model_id
    }
} catch { }

$onnxPrimaryReady = $false
try {
    $onnxPrimaryReady = (
        [bool]$firearmStatus.enabled -and
        [bool]$firearmStatus.onnx_exists -and
        [bool]$firearmStatus.dependencies_installed
    )
} catch { $onnxPrimaryReady = $false }
$onnxPrimaryNote = if ($onnxPrimaryReady) {
    if ($cvFirearmWarmed) { "ENABLED / warmed / primary" } else { "ENABLED / primary (lazy until first frame)" }
} else {
    "ENABLED but artifact/deps not ready — DemoPage falls back to DINO (YOLOX only if harness ON)"
}
$yoloxSummary = if ($yoloxHarnessFlag -eq "true") {
    "{0} (research harness · thr 0.02 · V3 preferred)" -f $yoloxLabel
} else {
    "DISABLED (MVP hot path; -EnableYoloxHarness for #/dev/cv-test)"
}

Write-Host ""
Write-Host "LOCAL DEMO READY" -ForegroundColor Green
Write-Host ""
Write-Host ("PostgreSQL : RUNNING ({0})" -f $PgServiceName)
Write-Host ("Backend    : {0}" -f $BackendUrl)
Write-Host ("PhoBERT    : {0}" -f $NlpUrl)
Write-Host ("Frontend   : {0}" -f $FrontendUrl)
Write-Host ("Adult moderation: {0}" -f $adultLabel)
Write-Host ("  Suggestive classifier: {0}" -f $suggestiveModel)
Write-Host ("  Explicit classifier: Falconsai ({0})" -f $nsfwLabel)
Write-Host ("Subh775 ONNX: {0}" -f $onnxPrimaryNote)
Write-Host ("  status: {0} · thr 0.65 · AGPL · MVP primary" -f $firearmLabel)
Write-Host ("Custom YOLOX: {0}" -f $yoloxSummary)
Write-Host ("Grounding DINO: {0} (fallback · thr 0.42)" -f $weaponLabel)
Write-Host ("Weapon auto-terminate: false (warning/risk signal only)")
Write-Host ""
Write-Host "CV TEST PAGE:"
Write-Host "http://127.0.0.1:5173/#/dev/cv-test"
Write-Host ""
Write-Host "Open:"
Write-Host $FrontendUrl
Write-Host ""
Write-Host ("Startup wall time: ~{0}s" -f $elapsed) -ForegroundColor DarkGray
Write-Host ("State file: {0}" -f $StateFile) -ForegroundColor DarkGray
Write-Host "Stop with: .\scripts\Stop-LocalDemo.ps1" -ForegroundColor DarkGray
$bothReady = $false
try {
    $bothReady = (
        [bool]$nsfwStatus.ready -and
        ([bool]$firearmStatus.ready -or [bool]$weaponStatus.ready -or ($EnableYoloxHarness -and [bool]$yoloxStatus.ready))
    )
} catch { $bothReady = $false }
if ($WarmCv) {
    Write-Host "CV models warmed when preload succeeded; DemoPage uses Subh775 ONNX at 2 FPS when ready (YOLOX harness OFF by default)." -ForegroundColor DarkGray
}
elseif (-not $bothReady) {
    Write-Host "CV features ENABLED; model weights stay lazy until first frame (use -WarmCv to preload)." -ForegroundColor DarkGray
}
else {
    Write-Host "CV features ENABLED; model weights already loaded in this backend process." -ForegroundColor DarkGray
}

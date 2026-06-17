param(
    [switch]$StopAfterCheck
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$BackendDir = Join-Path $ProjectRoot "backend"
$FrontendDir = Join-Path $ProjectRoot "frontend"
$LogDir = Join-Path $ProjectRoot "logs"
$BackendLog = Join-Path $LogDir "web_mvp_backend_verify.log"
$BackendErrorLog = Join-Path $LogDir "web_mvp_backend_verify.err.log"
$FrontendLog = Join-Path $LogDir "web_mvp_frontend_verify.log"
$FrontendErrorLog = Join-Path $LogDir "web_mvp_frontend_verify.err.log"
$BackendUrl = "http://127.0.0.1:8000"
$FrontendUrl = "http://127.0.0.1:5173"
$WebSocketUrl = "ws://127.0.0.1:8000/ws/realtime"

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Start-LoggedProcess {
    param(
        [string]$WorkingDirectory,
        [string]$FilePath,
        [string[]]$ArgumentList,
        [string]$LogPath,
        [string]$ErrorLogPath
    )

    $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $resolvedLogPath = Resolve-LogPath -Path $LogPath -Timestamp $timestamp
    $resolvedErrorLogPath = Resolve-LogPath -Path $ErrorLogPath -Timestamp $timestamp

    return Start-Process `
        -FilePath $FilePath `
        -ArgumentList $ArgumentList `
        -WorkingDirectory $WorkingDirectory `
        -RedirectStandardOutput $resolvedLogPath `
        -RedirectStandardError $resolvedErrorLogPath `
        -PassThru
}

function Resolve-LogPath {
    param(
        [string]$Path,
        [string]$Timestamp
    )

    if (-not (Test-Path $Path)) {
        return $Path
    }

    try {
        Remove-Item $Path -Force
        return $Path
    }
    catch {
        $directory = Split-Path $Path -Parent
        $fileName = [System.IO.Path]::GetFileNameWithoutExtension($Path)
        $extension = [System.IO.Path]::GetExtension($Path)
        return Join-Path $directory "$fileName.$Timestamp$extension"
    }
}

function Invoke-HttpText {
    param([string]$Url)

    $request = [System.Net.HttpWebRequest]::Create($Url)
    $request.Timeout = 2000
    $request.ReadWriteTimeout = 2000
    $response = $null
    $reader = $null

    try {
        $response = $request.GetResponse()
        $stream = $response.GetResponseStream()
        $reader = [System.IO.StreamReader]::new($stream)
        return @{
            StatusCode = [int]$response.StatusCode
            Body = $reader.ReadToEnd()
        }
    }
    finally {
        if ($null -ne $reader) {
            $reader.Dispose()
        }
        if ($null -ne $response) {
            $response.Dispose()
        }
    }
}

function Wait-BackendHealth {
    param([string]$Url)

    for ($attempt = 1; $attempt -le 30; $attempt++) {
        try {
            $response = Invoke-HttpText -Url "$Url/api/health"
            if ($response.StatusCode -eq 200 -and $response.Body -like '*"status":"ok"*') {
                return $true
            }
        }
        catch {
            Start-Sleep -Seconds 1
        }
    }

    return $false
}

function Wait-Frontend {
    param([string]$Url)

    for ($attempt = 1; $attempt -le 30; $attempt++) {
        try {
            $response = Invoke-HttpText -Url $Url
            if ($response.StatusCode -eq 200) {
                return $true
            }
        }
        catch {
            Start-Sleep -Seconds 1
        }
    }

    return $false
}

function Test-RealtimeWebSocket {
    param([string]$Url)

    $client = [System.Net.WebSockets.ClientWebSocket]::new()
    $cancellationToken = [System.Threading.CancellationToken]::None

    try {
        $client.ConnectAsync([Uri]$Url, $cancellationToken).GetAwaiter().GetResult()

        $messageBytes = [System.Text.Encoding]::UTF8.GetBytes('{ "type": "ping" }')
        $sendBuffer = [ArraySegment[byte]]::new($messageBytes)
        $client.SendAsync(
            $sendBuffer,
            [System.Net.WebSockets.WebSocketMessageType]::Text,
            $true,
            $cancellationToken
        ).GetAwaiter().GetResult()

        $receiveBytes = New-Object byte[] 4096
        $receiveBuffer = [ArraySegment[byte]]::new($receiveBytes)
        $result = $client.ReceiveAsync($receiveBuffer, $cancellationToken).GetAwaiter().GetResult()
        $responseText = [System.Text.Encoding]::UTF8.GetString($receiveBytes, 0, $result.Count)
        $response = $responseText | ConvertFrom-Json

        return ($response.type -eq "error" -and $response.message -like "*Unsupported*")
    }
    catch {
        Write-Host "WebSocket check error: $($_.Exception.Message)"
        return $false
    }
    finally {
        if ($client.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
            $client.CloseAsync(
                [System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure,
                "verification complete",
                $cancellationToken
            ).GetAwaiter().GetResult()
        }
        $client.Dispose()
    }
}

function Stop-StartedProcess {
    param([System.Diagnostics.Process]$Process)

    if ($null -ne $Process -and -not $Process.HasExited) {
        Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
    }
}

$backendProcess = $null
$frontendProcess = $null
$backendPassed = $false
$frontendPassed = $false
$webSocketPassed = $false

try {
    Write-Host "Starting backend..."
    $backendProcess = Start-LoggedProcess `
        -WorkingDirectory $BackendDir `
        -FilePath (Join-Path $ProjectRoot ".venv\Scripts\python.exe") `
        -ArgumentList @("-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000") `
        -LogPath $BackendLog `
        -ErrorLogPath $BackendErrorLog

    Write-Host "Starting frontend..."
    $frontendProcess = Start-LoggedProcess `
        -WorkingDirectory $FrontendDir `
        -FilePath "npm.cmd" `
        -ArgumentList @("run", "dev", "--", "--host", "127.0.0.1", "--port", "5173") `
        -LogPath $FrontendLog `
        -ErrorLogPath $FrontendErrorLog

    Write-Host "Checking backend health..."
    $backendPassed = Wait-BackendHealth -Url $BackendUrl

    Write-Host "Checking frontend dev server..."
    $frontendPassed = Wait-Frontend -Url $FrontendUrl

    Write-Host "Checking realtime WebSocket..."
    if ($backendPassed) {
        $webSocketPassed = Test-RealtimeWebSocket -Url $WebSocketUrl
    }

    if ($frontendPassed) {
        Start-Process $FrontendUrl
    }
}
finally {
    if ($StopAfterCheck) {
        Write-Host "Stopping started servers..."
        Stop-StartedProcess -Process $frontendProcess
        Stop-StartedProcess -Process $backendProcess
    }
}

Write-Host ""
Write-Host "Web MVP Verification Summary"
Write-Host "backend:   $(if ($backendPassed) { 'PASS' } else { 'FAIL' })"
Write-Host "frontend:  $(if ($frontendPassed) { 'PASS' } else { 'FAIL' })"
Write-Host "websocket: $(if ($webSocketPassed) { 'PASS' } else { 'FAIL' })"
Write-Host ""
Write-Host "Logs:"
Write-Host "backend:  $BackendLog"
Write-Host "backend errors:  $BackendErrorLog"
Write-Host "frontend: $FrontendLog"
Write-Host "frontend errors: $FrontendErrorLog"
Write-Host ""
Write-Host "Manual camera checklist:"
Write-Host "- camera permission granted"
Write-Host "- preview visible"
Write-Host "- WS connected"
Write-Host "- debug JSON updates"
Write-Host "- overlay follows face"

if ($backendPassed -and $frontendPassed -and $webSocketPassed) {
    exit 0
}

exit 1

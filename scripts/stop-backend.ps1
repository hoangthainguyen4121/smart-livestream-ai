$ErrorActionPreference = "Stop"

$backendPorts = @(8000)
$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")

Write-Host "Stopping Smart Livestream backend processes..."

Get-CimInstance Win32_Process -Filter "Name = 'python.exe'" |
    Where-Object {
        $_.CommandLine -like "*uvicorn*app.main:app*" -or
        $_.CommandLine -like "*multiprocessing.spawn*spawn_main*"
    } |
    ForEach-Object {
        Write-Host "Stopping PID $($_.ProcessId): $($_.CommandLine)"
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }

foreach ($port in $backendPorts) {
    $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    foreach ($connection in $connections) {
        $owningProcess = Get-Process -Id $connection.OwningProcess -ErrorAction SilentlyContinue
        if ($null -ne $owningProcess) {
            Write-Host "Stopping process on port ${port}: PID $($owningProcess.Id) ($($owningProcess.ProcessName))"
            Stop-Process -Id $owningProcess.Id -Force -ErrorAction SilentlyContinue
        }
    }
}

Start-Sleep -Seconds 1

$remaining = Get-CimInstance Win32_Process -Filter "Name = 'python.exe'" |
    Where-Object { $_.CommandLine -like "*uvicorn*app.main:app*" }

if ($remaining) {
    Write-Host "Some backend processes may still be running:"
    $remaining | ForEach-Object { Write-Host "  PID $($_.ProcessId)" }
    exit 1
}

Write-Host "Backend stopped. Webcam should be released."
exit 0

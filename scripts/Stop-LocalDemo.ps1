<#
.SYNOPSIS
  Stop processes started by Start-LocalDemo.ps1 only.

.DESCRIPTION
  Reads .local/demo-stack.json and stops managed PowerShell window PIDs
  (and their child process trees). Does NOT stop PostgreSQL Windows service
  and does NOT kill unrelated python/node processes.
#>

[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$ScriptDir = $PSScriptRoot
$PocRoot = (Resolve-Path (Join-Path $ScriptDir "..")).Path
$StateFile = Join-Path $PocRoot ".local\demo-stack.json"

function Stop-ProcessTree {
    param([Parameter(Mandatory = $true)][int]$ProcessId)

    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object { $_.ParentProcessId -eq $ProcessId } |
        ForEach-Object {
            Stop-ProcessTree -ProcessId ([int]$_.ProcessId)
        }

    $proc = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
    if ($null -ne $proc) {
        Write-Host ("Stopping PID {0} ({1})" -f $ProcessId, $proc.ProcessName)
        Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
    }
}

if (-not (Test-Path -LiteralPath $StateFile)) {
    Write-Host "No local demo state file found:"
    Write-Host "  $StateFile"
    Write-Host "Nothing managed by Start-LocalDemo to stop."
    Write-Host "PostgreSQL Windows service was left untouched."
    exit 0
}

$state = Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json
$managed = @($state.managed)
if ($managed.Count -eq 0) {
    Write-Host "State file has no managed processes. Cleaning state file."
    Remove-Item -LiteralPath $StateFile -Force
    exit 0
}

Write-Host "Stopping Start-LocalDemo managed processes..."
foreach ($item in $managed) {
    if (-not $item.managed) { continue }
    $pidValue = [int]$item.pid
    if ($pidValue -le 0) { continue }
    try {
        Stop-ProcessTree -ProcessId $pidValue
        Write-Host ("  stopped role={0} pid={1}" -f $item.role, $pidValue)
    }
    catch {
        Write-Host ("  skip role={0} pid={1}: {2}" -f $item.role, $pidValue, $_.Exception.Message)
    }
}

Remove-Item -LiteralPath $StateFile -Force -ErrorAction SilentlyContinue
Write-Host "Done. PostgreSQL service was not stopped."
Write-Host "External processes that were already healthy before Start were left running."
exit 0

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$logsDir = Join-Path $repoRoot "logs"
$pidFile = Join-Path $logsDir "attijari-watchdog.pid.json"
$logFile = Join-Path $logsDir "attijari-watchdog.log"
$running = $false
$watchdogPid = $null
$lastEntry = $null

if (Test-Path $pidFile) {
    try {
        $payload = Get-Content $pidFile -Raw | ConvertFrom-Json
        $watchdogPid = $payload.pid
        if ($watchdogPid -and (Get-Process -Id $watchdogPid -ErrorAction SilentlyContinue)) {
            $running = $true
        }
    } catch {}
}

if (Test-Path $logFile) {
    try {
        $lastLine = Get-Content $logFile -Tail 1
        if ($lastLine) {
            $lastEntry = $lastLine | ConvertFrom-Json
        }
    } catch {}
}

[ordered]@{
    ok = $true
    running = $running
    pid = $watchdogPid
    pid_file = $pidFile
    log = $logFile
    last_entry = $lastEntry
} | ConvertTo-Json -Compress -Depth 10


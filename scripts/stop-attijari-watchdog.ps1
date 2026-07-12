$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$pidFile = Join-Path $repoRoot "logs\attijari-watchdog.pid.json"
if (-not (Test-Path $pidFile)) {
    [ordered]@{
        ok = $true
        stopped = $false
        reason = "pid_file_missing"
    } | ConvertTo-Json -Compress
    exit 0
}

$payload = Get-Content $pidFile -Raw | ConvertFrom-Json
$stopped = $false
if ($payload.pid) {
    $process = Get-Process -Id $payload.pid -ErrorAction SilentlyContinue
    if ($process) {
        Stop-Process -Id $payload.pid -Force
        $stopped = $true
    }
}
Remove-Item $pidFile -Force -ErrorAction SilentlyContinue

[ordered]@{
    ok = $true
    stopped = $stopped
    pid = $payload.pid
} | ConvertTo-Json -Compress

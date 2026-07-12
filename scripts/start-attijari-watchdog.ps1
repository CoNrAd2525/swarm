param(
    [int]$IntervalSeconds = 60,
    [string]$BatchId = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$logsDir = Join-Path $repoRoot "logs"
if (-not (Test-Path $logsDir)) {
    New-Item -ItemType Directory -Force -Path $logsDir | Out-Null
}

$pidFile = Join-Path $logsDir "attijari-watchdog.pid.json"
if (Test-Path $pidFile) {
    try {
        $existing = Get-Content $pidFile -Raw | ConvertFrom-Json
        if ($existing.pid -and (Get-Process -Id $existing.pid -ErrorAction SilentlyContinue)) {
            [ordered]@{
                ok = $true
                already_running = $true
                pid = $existing.pid
                log = (Join-Path $logsDir "attijari-watchdog.log")
            } | ConvertTo-Json -Compress
            exit 0
        }
    } catch {}
}

$scriptPath = Join-Path $PSScriptRoot "attijari-watchdog.ps1"
$commandLine = "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`" -Loop -IntervalSeconds $([Math]::Max(5, $IntervalSeconds))"
if (-not [string]::IsNullOrWhiteSpace($BatchId)) {
    $commandLine += " -BatchId `"$BatchId`""
}

$stdoutLog = Join-Path $logsDir "attijari-watchdog.stdout.log"
$stderrLog = Join-Path $logsDir "attijari-watchdog.stderr.log"

$process = Start-Process -FilePath "powershell.exe" -ArgumentList $commandLine -WorkingDirectory $repoRoot -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog -PassThru
Start-Sleep -Seconds 2
if (-not (Get-Process -Id $process.Id -ErrorAction SilentlyContinue)) {
    [ordered]@{
        ok = $false
        error = "watchdog_failed_to_start"
        stdout_log = $stdoutLog
        stderr_log = $stderrLog
    } | ConvertTo-Json -Compress
    exit 1
}
$payload = [ordered]@{
    pid = $process.Id
    batch_id = $BatchId
    interval_seconds = [Math]::Max(5, $IntervalSeconds)
    started_at = (Get-Date).ToString("o")
    log = (Join-Path $logsDir "attijari-watchdog.log")
    stdout_log = $stdoutLog
    stderr_log = $stderrLog
}
$payload | ConvertTo-Json -Depth 5 | Set-Content -Encoding utf8 $pidFile

[ordered]@{
    ok = $true
    pid = $process.Id
    pid_file = $pidFile
    log = $payload.log
    stdout_log = $stdoutLog
    stderr_log = $stderrLog
} | ConvertTo-Json -Compress

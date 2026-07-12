param(
    [switch]$Loop,
    [int]$IntervalSeconds = 60,
    [string]$BatchId = ""
)

$ErrorActionPreference = "Stop"

function Get-RepoRoot {
    return (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

function Get-SafeBatchId([string]$Value) {
    if ([string]::IsNullOrWhiteSpace($Value)) {
        return ""
    }
    return ([regex]::Replace($Value, "[^a-zA-Z0-9._-]+", "_"))
}

function Read-JsonMaybe([string]$Path) {
    if (-not (Test-Path $Path)) {
        return $null
    }
    try {
        return Get-Content $Path -Raw | ConvertFrom-Json
    } catch {
        return $null
    }
}

function Write-JsonFile([string]$Path, $Payload) {
    $directory = Split-Path -Parent $Path
    if (-not (Test-Path $directory)) {
        New-Item -ItemType Directory -Force -Path $directory | Out-Null
    }
    $Payload | ConvertTo-Json -Depth 10 | Set-Content -Encoding utf8 $Path
}

function Get-Deadline([object]$Packet) {
    if ($null -eq $Packet) {
        return $null
    }
    $deadlineText = [string]$Packet.expected_confirmation_by
    if ([string]::IsNullOrWhiteSpace($deadlineText)) {
        $createdAt = [string]$Packet.created_at
        if ([string]::IsNullOrWhiteSpace($createdAt)) {
            return $null
        }
        try {
            $hoursText = $(if ($null -ne $env:ATTIJARI_CONFIRM_DEADLINE_HOURS -and $env:ATTIJARI_CONFIRM_DEADLINE_HOURS -ne "") { $env:ATTIJARI_CONFIRM_DEADLINE_HOURS } else { "24" })
            $hours = [Math]::Max(1, [int]$hoursText)
            return ([datetime]$createdAt).AddHours($hours)
        } catch {
            return $null
        }
    }
    try {
        return [datetime]$deadlineText
    } catch {
        return $null
    }
}

function Get-ReceiptPath([object]$Packet, [string]$RepoRoot) {
    $receipt = [string]$Packet.receipt_artifact_path
    if ([string]::IsNullOrWhiteSpace($receipt)) {
        $safeBatchId = Get-SafeBatchId ([string]$Packet.batch_id)
        return Join-Path $RepoRoot "exports\bank-wire\bank_wire_instruction_${safeBatchId}.receipt.json"
    }
    return $receipt
}

function New-EscalationPayload([object]$Packet, [string]$ReceiptPath) {
    $batchId = [string]$Packet.batch_id
    $to = @()
    $emails = [string]($(if ($null -ne $env:ATTIJARI_WIRE_ESCALATION_EMAILS -and $env:ATTIJARI_WIRE_ESCALATION_EMAILS -ne "") { $env:ATTIJARI_WIRE_ESCALATION_EMAILS } elseif ($null -ne $env:OWNER_NOTIFY_EMAIL -and $env:OWNER_NOTIFY_EMAIL -ne "") { $env:OWNER_NOTIFY_EMAIL } else { "" }))
    if (-not [string]::IsNullOrWhiteSpace($emails)) {
        $to = $emails.Split(",") | ForEach-Object { $_.Trim() } | Where-Object { $_ } | Select-Object -Unique
    }
    $body = @(
        "Attijari wire confirmation deadline was missed."
        "Batch: $batchId"
        ("Amount: {0} {1}" -f ([string]$Packet.amount), ([string]$Packet.currency)).Trim()
        "Reference: $([string]$Packet.reference)"
        "Expected confirmation by: $([string]$Packet.expected_confirmation_by)"
        "Instruction: $([string]$Packet.instruction_path)"
        "Receipt artifact: $ReceiptPath"
    ) -join "`n"

    return [ordered]@{
        type = "attijari_wire_confirmation_escalation"
        provider = "ATTIJARIWAFA_BANK"
        batch_id = $batchId
        status = "pending_confirmation_deadline_missed"
        created_at = (Get-Date).ToString("o")
        expected_confirmation_by = [string]$Packet.expected_confirmation_by
        receipt_artifact_path = $ReceiptPath
        instruction_path = [string]$Packet.instruction_path
        portal_url = [string]$Packet.portal_url
        amount = $Packet.amount
        currency = [string]$Packet.currency
        reference = [string]$Packet.reference
        beneficiary = $Packet.beneficiary
        email = [ordered]@{
            to = @($to)
            subject = "Attijari wire confirmation overdue: $batchId"
            body = $body
        }
    }
}

function Invoke-AttijariWatchdog([string]$RepoRoot, [string]$FilterBatchId = "") {
    $bankWireDir = Join-Path $RepoRoot "exports\bank-wire"
    $communicationsDir = Join-Path $RepoRoot "exports\communications"
    $logsDir = Join-Path $RepoRoot "logs"
    foreach ($directory in @($bankWireDir, $communicationsDir, $logsDir)) {
        if (-not (Test-Path $directory)) {
            New-Item -ItemType Directory -Force -Path $directory | Out-Null
        }
    }

    $packetFiles = @()
    if (Test-Path $bankWireDir) {
        $packetFiles = Get-ChildItem -Path $bankWireDir -Filter "attijari_wire_packet_*.json" -File |
            Where-Object { $_.Name -notlike "*.escalation.json" }
    }

    $results = @()
    $scanned = 0
    $escalated = 0
    $now = Get-Date

    foreach ($packetFile in $packetFiles) {
        $packet = Read-JsonMaybe $packetFile.FullName
        if ($null -eq $packet -or [string]::IsNullOrWhiteSpace([string]$packet.batch_id)) {
            $results += [ordered]@{
                status = "invalid_packet"
                file = $packetFile.FullName
            }
            continue
        }

        if (-not [string]::IsNullOrWhiteSpace($FilterBatchId) -and [string]$packet.batch_id -ne $FilterBatchId) {
            continue
        }

        $scanned++
        $receiptPath = Get-ReceiptPath $packet $RepoRoot
        if (Test-Path $receiptPath) {
            $results += [ordered]@{
                batch_id = [string]$packet.batch_id
                status = "confirmed"
                receipt_artifact_path = $receiptPath
            }
            continue
        }

        $deadline = Get-Deadline $packet
        if ($null -eq $deadline -or $now -lt $deadline) {
            $results += [ordered]@{
                batch_id = [string]$packet.batch_id
                status = "awaiting_deadline"
                deadline = if ($deadline) { $deadline.ToString("o") } else { $null }
            }
            continue
        }

        $safeBatchId = Get-SafeBatchId ([string]$packet.batch_id)
        $escalationPath = Join-Path $bankWireDir "attijari_wire_packet_${safeBatchId}.escalation.json"
        $communicationPath = Join-Path $communicationsDir "attijari_wire_packet_${safeBatchId}.json"
        if (-not (Test-Path $escalationPath)) {
            $payload = New-EscalationPayload $packet $receiptPath
            Write-JsonFile $escalationPath $payload
            Write-JsonFile $communicationPath $payload.email
        }
        $escalated++
        $results += [ordered]@{
            batch_id = [string]$packet.batch_id
            status = "escalated"
            escalation_path = $escalationPath
            communication_path = $communicationPath
            deadline = $deadline.ToString("o")
        }
    }

    $payload = [ordered]@{
        ok = $true
        scanned = $scanned
        escalated = $escalated
        runtime = [ordered]@{
            engine = "powershell"
            loop = [bool]$Loop
            interval_seconds = $IntervalSeconds
        }
        results = @($results)
        at = (Get-Date).ToString("o")
    }

    $logFile = Join-Path $logsDir "attijari-watchdog.log"
    ($payload | ConvertTo-Json -Compress -Depth 10) | Add-Content -Encoding utf8 $logFile
    $payload | ConvertTo-Json -Compress -Depth 10
}

$repoRoot = Get-RepoRoot

if ($Loop) {
    while ($true) {
        Invoke-AttijariWatchdog -RepoRoot $repoRoot -FilterBatchId $BatchId | Out-Null
        Start-Sleep -Seconds ([Math]::Max(5, $IntervalSeconds))
    }
} else {
    Invoke-AttijariWatchdog -RepoRoot $repoRoot -FilterBatchId $BatchId
}

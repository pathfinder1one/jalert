$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$python = "C:\Users\chira\AppData\Local\Programs\Python\Python313\python.exe"
$currentProcessId = $PID
$port = 8000

function Get-ListeningProcessIds {
    param(
        [int]$Port
    )

    $pids = @()

    try {
        $pids += Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue |
            Where-Object { $_.State -eq "Listen" } |
            Select-Object -ExpandProperty OwningProcess -Unique
    } catch {
        # Fall back to netstat parsing below.
    }

    $netstatLines = netstat -ano -p tcp | Select-String -Pattern "LISTENING"
    foreach ($line in $netstatLines) {
        if ($line.Line -match "^\s*TCP\s+\S+:$Port\s+\S+\s+LISTENING\s+(\d+)\s*$") {
            $pids += [int]$matches[1]
        }
    }

    return @($pids | Where-Object { $_ -and $_ -ne 0 } | Sort-Object -Unique)
}

function Wait-ForPortToFree {
    param(
        [int]$Port,
        [int]$TimeoutSeconds = 10
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        if (-not (Get-ListeningProcessIds -Port $Port)) {
            return $true
        }

        Start-Sleep -Milliseconds 500
    } while ((Get-Date) -lt $deadline)

    return -not (Get-ListeningProcessIds -Port $Port)
}

if (-not (Test-Path $python)) {
    throw "Expected Python interpreter not found at $python"
}

Set-Location $projectRoot

Write-Host "Starting JALERT with pinned Python interpreter..."
Write-Host "Project root: $projectRoot"
Write-Host "Python: $python"

$existingPids = @(
    Get-ListeningProcessIds -Port $port
) | Where-Object { $_ }

foreach ($processId in $existingPids) {
    if ($processId -ne $currentProcessId) {
        try {
            Stop-Process -Id $processId -Force -ErrorAction Stop
            Write-Host "Stopped existing process on port ${port}: $processId"
        } catch {
            try {
                $taskkillOutput = & taskkill.exe /PID $processId /T /F 2>&1
                if ($LASTEXITCODE -eq 0) {
                    Write-Host "Force-stopped existing process tree on port ${port}: $processId"
                } else {
                    Write-Host "Could not stop process $processId on port $port."
                    if ($taskkillOutput) {
                        Write-Host ($taskkillOutput | Out-String).Trim()
                    }
                }
            } catch {
                Write-Host "Could not stop process $processId on port $port."
            }
        }
    }
}

if (-not (Wait-ForPortToFree -Port $port -TimeoutSeconds 10)) {
    $remainingPids = Get-ListeningProcessIds -Port $port
    throw "Port $port is still in use by PID(s): $($remainingPids -join ', '). Close that process or run PowerShell as Administrator, then try again."
}

& $python -m uvicorn app.main:app --host 127.0.0.1 --port $port

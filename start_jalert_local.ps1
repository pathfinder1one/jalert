$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$python = "C:\Users\chira\AppData\Local\Programs\Python\Python313\python.exe"
$currentProcessId = $PID

if (-not (Test-Path $python)) {
    throw "Expected Python interpreter not found at $python"
}

Set-Location $projectRoot

Write-Host "Starting JALERT with pinned Python interpreter..."
Write-Host "Project root: $projectRoot"
Write-Host "Python: $python"

$existingPids = @(
    Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique
) | Where-Object { $_ }

foreach ($processId in $existingPids) {
    if ($processId -ne $currentProcessId) {
        try {
            Stop-Process -Id $processId -Force -ErrorAction Stop
            Write-Host "Stopped existing process on port 8000: $processId"
        } catch {
            Write-Host "Could not stop process $processId on port 8000. Continuing..."
        }
    }
}

& $python -m uvicorn app.main:app --host 127.0.0.1 --port 8000

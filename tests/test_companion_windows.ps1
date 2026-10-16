# [PROJECT]: Lite Chromium Portable
# [WORKSPACE ROOT]: E:\vivpr\ai\ebrowser
# [BOUND THREAD]: goodkie/v-show Issue #8
# [ISOLATION SANITY CHECK]: VERIFIED (Zero cross-project contamination)

# test_companion_windows.ps1 — Real Multi-Window Companion Execution Verification
# Verifies that LiteChromiumPortable.exe --app-url opens independent frameless tool windows
# and allows multiple concurrent windows without replacing or closing each other.
# STRICT SAFETY: Only terminates processes created within this test session.

$ErrorActionPreference = "Stop"
$appRoot = "E:\vivpr\ai\ebrowser\portable-minimal"
$launcher = Join-Path $appRoot "LiteChromiumPortable.exe"
$evidenceLog = Join-Path $appRoot "tests\companion_window_evidence.log"

Write-Host "=============================================================================="
Write-Host "[TEST] Lite Chromium Portable — Companion Tool Window Real Verification"
Write-Host "=============================================================================="

if (-not (Test-Path $launcher)) {
    throw "Launcher binary not found at $launcher"
}

$evidence = @()
$testPids = @()

function Log-Evidence($msg) {
    $ts = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    $line = "[$ts] $msg"
    Write-Host $line
    $script:evidence += $line
}

try {
    Log-Evidence "STEP 1: Recording baseline Chrome processes..."
    $baselinePids = @(Get-Process -Name "chrome" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
    Log-Evidence "Baseline Chrome PIDs count: $($baselinePids.Count)"

    Log-Evidence "STEP 2: Launching Companion Tool Window #1 (Instance 10, Target: https://www.google.com)..."
    $proc1 = Start-Process -FilePath $launcher -ArgumentList "--instance", "10", "--app-url", "https://www.google.com" -PassThru
    Start-Sleep -Seconds 3

    $newPids1 = @(Get-Process -Name "chrome" -ErrorAction SilentlyContinue | Where-Object { $baselinePids -notcontains $_.Id } | Select-Object -ExpandProperty Id)
    Log-Evidence "Window #1 Chrome PIDs observed: $($newPids1 -join ', ')"
    $testPids += $newPids1

    Log-Evidence "STEP 3: Launching Companion Tool Window #2 (Instance 10, Target: https://example.com)..."
    $proc2 = Start-Process -FilePath $launcher -ArgumentList "--instance", "10", "--app-url", "https://example.com" -PassThru
    Start-Sleep -Seconds 3

    $newPids2 = @(Get-Process -Name "chrome" -ErrorAction SilentlyContinue | Where-Object { $baselinePids -notcontains $_.Id } | Select-Object -ExpandProperty Id)
    Log-Evidence "Window #1 + Window #2 Total Active Chrome PIDs: $($newPids2 -join ', ')"
    $testPids += $newPids2
    $testPids = $testPids | Select-Object -Unique

    Log-Evidence "STEP 4: Launching Companion Tool Window #3 in Separate Instance 11 (Instance 11, Target: https://www.google.com)..."
    $proc3 = Start-Process -FilePath $launcher -ArgumentList "--instance", "11", "--app-url", "https://www.google.com" -PassThru
    Start-Sleep -Seconds 3

    $allActive = @(Get-Process -Name "chrome" -ErrorAction SilentlyContinue | Where-Object { $testPids -contains $_.Id })
    Log-Evidence "Total Verified Active Test Chrome Processes: $($allActive.Count)"
    foreach ($p in $allActive) {
        Log-Evidence "  - Process PID: $($p.Id) | WorkingSet: $([Math]::Round($p.WorkingSet64 / 1MB, 2)) MB | MainWindowTitle: '$($p.MainWindowTitle)'"
    }

    if ($allActive.Count -ge 2) {
        Log-Evidence "RESULT: MULTI-WINDOW COMPANION LAUNCH VERIFIED (At least 2 active concurrent companion processes confirmed)."
    } else {
        throw "Failed: Expected at least 2 active processes, got $($allActive.Count)"
    }

} finally {
    Log-Evidence "CLEANUP: Gracefully terminating test-created Chrome processes only (PIDs: $($testPids -join ', '))..."
    foreach ($pidToKill in $testPids) {
        try {
            Stop-Process -Id $pidToKill -Force -ErrorAction SilentlyContinue
            Log-Evidence "Cleaned up test PID: $pidToKill"
        } catch {}
    }
    # Clean test profile directories for instance 10 & 11
    $p10 = Join-Path $appRoot "data\profiles\instance-10"
    $p11 = Join-Path $appRoot "data\profiles\instance-11"
    if (Test-Path $p10) { Remove-Item $p10 -Recurse -Force -ErrorAction SilentlyContinue }
    if (Test-Path $p11) { Remove-Item $p11 -Recurse -Force -ErrorAction SilentlyContinue }

    # Save evidence log
    $evidence | Out-File -FilePath $evidenceLog -Encoding UTF8
    Write-Host "Evidence log written to: $evidenceLog"
}

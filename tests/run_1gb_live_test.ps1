# [PROJECT]: Lite Chromium Portable
# [WORKSPACE ROOT]: E:\vivpr\ai\ebrowser
# [BOUND THREAD]: goodkie/v-show Issue #8
# [ISOLATION SANITY CHECK]: VERIFIED (Zero cross-project contamination)
#
# Controlled 1GB Live Execution & Observation Runner (P2-1GB-LIVE-01 v2)
# Enforces exact SHA check on approved build/ executor baseline, step-by-step
# exit code validation, failure halt without deletion, internal transcript capture,
# and zero-mutation pre-flight verification mode.

param(
    [switch]$PreflightOnly
)

$ErrorActionPreference = "Stop"

$workspaceRoot = "E:\vivpr\ai\ebrowser"
$minimalRoot = "E:\vivpr\ai\ebrowser\portable-minimal"
$vhdPath = "E:\vivpr\ai\ebrowser\build_test_1gb.vhdx"
$transcriptPath = "E:\vivpr\ai\ebrowser\portable-minimal\tests\1gb_live_test_raw_transcript.txt"
$scriptPath = "E:\vivpr\ai\ebrowser\portable-minimal\build\setup_build_volume.ps1"
$expectedBaselineSha = "c6025f415e1c9323e7cb60b9fe52301ee4f2d6ca"

$transcriptStarted = $false
if (-not $PreflightOnly) {
    try {
        Start-Transcript -Path $transcriptPath -Force
        $transcriptStarted = $true
    } catch {
        Write-Warning "Could not start internal transcript: $_"
    }
}

try {
    Write-Host "=== P2 1GB LIVE TEST RUNNER (P2-1GB-LIVE-01 v2) ==="
    $startTime = (Get-Date).ToString("o")
    Write-Host "Test Start Time: $startTime"
    Write-Host "Mode: $(if($PreflightOnly){ 'PREFLIGHT VERIFICATION ONLY' } else { 'LIVE ADMIN EXECUTION' })"

    # 1. Pre-Execution Identity and State Assertions
    Push-Location $minimalRoot
    try {
        $rawDiff = & git --no-pager -c safe.directory=* diff -- build/ 2>&1
        if ($LASTEXITCODE -ne 0) { throw "ABORT: git diff check failed with exit code $LASTEXITCODE. Details: $($rawDiff -join ' ')" }
        $buildDiff = if ($null -ne $rawDiff) { ($rawDiff -join "`n").Trim() } else { "" }

        $rawCached = & git --no-pager -c safe.directory=* diff --cached -- build/ 2>&1
        if ($LASTEXITCODE -ne 0) { throw "ABORT: git diff --cached check failed with exit code $LASTEXITCODE. Details: $($rawCached -join ' ')" }
        $buildCachedDiff = if ($null -ne $rawCached) { ($rawCached -join "`n").Trim() } else { "" }

        if (-not [string]::IsNullOrEmpty($buildDiff)) {
            throw "ABORT: Uncommitted working tree modifications detected in build/ directory."
        }
        if (-not [string]::IsNullOrEmpty($buildCachedDiff)) {
            throw "ABORT: Uncommitted staged modifications detected in build/ directory."
        }

        # Exact blob hash comparison against baseline commit
        $expectedExecutorBlob = (& git --no-pager -c safe.directory=* ls-tree $expectedBaselineSha build/setup_build_volume.ps1 | ForEach-Object { ($_ -split '\s+')[2] }).Trim()
        $expectedModuleBlob = (& git --no-pager -c safe.directory=* ls-tree $expectedBaselineSha build/VirtualDiskSafety.psm1 | ForEach-Object { ($_ -split '\s+')[2] }).Trim()
        $currentExecutorBlob = (& git --no-pager -c safe.directory=* hash-object build/setup_build_volume.ps1).Trim()
        $currentModuleBlob = (& git --no-pager -c safe.directory=* hash-object build/VirtualDiskSafety.psm1).Trim()
    } finally {
        Pop-Location
    }

    Write-Host "Approved Baseline SHA: $expectedBaselineSha"
    Write-Host "Executor Blob: Expected=$expectedExecutorBlob, Actual=$currentExecutorBlob"
    Write-Host "Module Blob:   Expected=$expectedModuleBlob, Actual=$currentModuleBlob"

    if ($currentExecutorBlob -ne $expectedExecutorBlob) {
        throw "ABORT: setup_build_volume.ps1 blob does not match baseline commit $expectedBaselineSha."
    }
    if ($currentModuleBlob -ne $expectedModuleBlob) {
        throw "ABORT: VirtualDiskSafety.psm1 blob does not match baseline commit $expectedBaselineSha."
    }

    if (Test-Path -LiteralPath $vhdPath) {
        throw "ABORT: Target test VHDX '$vhdPath' already exists prior to test execution."
    }

    $xDrive = Get-PSDrive -Name X -ErrorAction SilentlyContinue
    if ($xDrive) {
        throw "ABORT: Target drive letter X: is already in use by $($xDrive.Description)."
    }

    Write-Host "Pre-execution file and drive assertions: ALL PASS"

    if ($PreflightOnly) {
        Write-Host "`n[PREFLIGHT PASS] Pre-flight assertions verified cleanly without administrative mutation."
        Write-Host "Ready for live execution under elevated Administrator."
        return
    }

    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    Write-Host "Administrative Elevation Check: $isAdmin"
    if (-not $isAdmin) {
        throw "ABORT: Administrative elevation is required for 1GB live test execution."
    }

    # 2. Step 1: Create, Identity Verify, Format, Correspondence, Nonce I/O
    Write-Host "`n>>> EXECUTING STEP 1: Create, Verify, Format & Nonce I/O <<<"
    $step1Output = & powershell -NoProfile -ExecutionPolicy Bypass -File $scriptPath -VhdPath $vhdPath -SizeMB 1024 -DriveLetter X -Execute 2>&1
    $step1Exit = $LASTEXITCODE
    Write-Host ($step1Output -join "`n")
    Write-Host "Step 1 Exit Code: $step1Exit"

    if ($step1Exit -ne 0) {
        Write-Warning "CRITICAL: Step 1 failed with exit code $step1Exit. Halting without running Step 2 or deleting file."
        $endTime = (Get-Date).ToString("o")
        Write-Host "Test End Time: $endTime"
        exit $step1Exit
    }

    # 3. Intermediate Verification of Mounted State
    Write-Host "`n>>> INTERMEDIATE VERIFICATION: Checking CIM / Volume State <<<"
    $intermediateImg = Get-DiskImage -ImagePath $vhdPath -ErrorAction Stop
    Write-Host "Backing Image Attached: $($intermediateImg.Attached), Number: $($intermediateImg.Number)"
    $intermediateVol = Get-Volume -DriveLetter X -ErrorAction Stop
    Write-Host "Volume X: Label: '$($intermediateVol.FileSystemLabel)', FileSystem: '$($intermediateVol.FileSystem)', Size: $($intermediateVol.Size) bytes"

    # 4. Step 2: Safe Verified Detach
    Write-Host "`n>>> EXECUTING STEP 2: Safe Verified Detach <<<"
    $step2Output = & powershell -NoProfile -ExecutionPolicy Bypass -File $scriptPath -VhdPath $vhdPath -DriveLetter X -DetachOnly -Execute 2>&1
    $step2Exit = $LASTEXITCODE
    Write-Host ($step2Output -join "`n")
    Write-Host "Step 2 Exit Code: $step2Exit"

    # 5. Final State Observations
    Write-Host "`n>>> FINAL STATE OBSERVATION <<<"
    $finalImg = Get-DiskImage -ImagePath $vhdPath -ErrorAction Stop
    Write-Host "Backing Image Final Attached State: $($finalImg.Attached)"
    $finalX = Get-PSDrive -Name X -ErrorAction SilentlyContinue
    Write-Host "Drive X: Mounted State: $(if($finalX){ 'STILL MOUNTED' } else { 'UNMOUNTED / FREE' })"

    $vhdPreserved = Test-Path -LiteralPath $vhdPath
    if ($vhdPreserved) {
        $vhdItem = Get-Item -LiteralPath $vhdPath
        Write-Host "Test VHDX Preservation: PRESERVED (Path: $vhdPath, Size: $($vhdItem.Length) bytes)"
    } else {
        Write-Host "Test VHDX Preservation: NOT FOUND"
    }

    $endTime = (Get-Date).ToString("o")
    Write-Host "Test End Time: $endTime"

    # Strict check of step 2 and final state
    if ($step2Exit -ne 0) {
        throw "CRITICAL FAILURE: Step 2 detach returned non-zero exit code $step2Exit. Halting without additional mutation."
    }
    if ($finalImg.Attached -ne $false) {
        throw "CRITICAL FAILURE: Backing image is not detached (Attached = $($finalImg.Attached))."
    }
    if ($finalX) {
        throw "CRITICAL FAILURE: Drive X: is still mounted after detach."
    }
    if (-not $vhdPreserved) {
        throw "CRITICAL FAILURE: Test VHDX file $vhdPath was not preserved."
    }

    Write-Host "`n=== 1GB LIVE TEST COMPLETE: ALL STEPS VERIFIED PASS ==="
} catch {
    Write-Host "`n==============================================================================" -ForegroundColor Red
    Write-Host "[FATAL ERROR] 1GB Live Test Aborted:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host "==============================================================================" -ForegroundColor Red
    exit 1
} finally {
    if ($transcriptStarted) {
        Stop-Transcript
    }
}


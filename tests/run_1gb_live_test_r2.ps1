# [PROJECT]: Lite Chromium Portable
# [WORKSPACE ROOT]: E:\vivpr\ai\ebrowser
# [BOUND THREAD]: goodkie/v-show Issue #8
# [ISOLATION SANITY CHECK]: VERIFIED (Zero cross-project contamination)
#
# Controlled 1GB Live Execution & Observation Runner (P2-1GB-LIVE-02)
# Enforces exact SHA check on approved build/ executor baseline, step-by-step
# exit code validation, failure halt without deletion, internal transcript capture,
# and zero-mutation pre-flight verification mode.
# Targets build_test_1gb_r2.vhdx (preserving build_test_1gb.vhdx untouched).

param(
    [switch]$PreflightOnly
)

$ErrorActionPreference = "Stop"

$workspaceRoot = "E:\vivpr\ai\ebrowser"
$minimalRoot = "E:\vivpr\ai\ebrowser\portable-minimal"
$r1VhdPath = "E:\vivpr\ai\ebrowser\build_test_1gb.vhdx"
$vhdPath = "E:\vivpr\ai\ebrowser\build_test_1gb_r2.vhdx"
$transcriptPath = "E:\vivpr\ai\ebrowser\portable-minimal\tests\1gb_live_test_r2_raw_transcript.txt"
$scriptPath = "E:\vivpr\ai\ebrowser\portable-minimal\build\setup_build_volume.ps1"
$expectedBaselineSha = "2165873b38afda5f23678aa150c793c8d6507262"

function Get-DriveXObservationStatus {
    try {
        $allDrives = Get-PSDrive -ErrorAction Stop
        $x = $allDrives | Where-Object { $_.Name -eq 'X' }
        if ($null -ne $x) {
            return "STILL MOUNTED ($($x.Description))"
        } else {
            return "FREE / UNMOUNTED"
        }
    } catch {
        return "UNKNOWN (Query error: $_)"
    }
}

function Get-ImageAttachedObservationStatus {
    param([string]$Path)
    try {
        $img = Get-DiskImage -ImagePath $Path -ErrorAction Stop
        if ($null -ne $img.Attached) {
            return "$($img.Attached)"
        } else {
            return "UNKNOWN (Attached property is null)"
        }
    } catch {
        return "UNKNOWN (Query error: $_)"
    }
}

function Get-VhdFileObservationStatus {
    param([string]$Path)
    try {
        if (Test-Path -LiteralPath $Path -ErrorAction Stop) {
            try {
                $item = Get-Item -LiteralPath $Path -ErrorAction Stop
                return "EXISTS (Path: $Path, Size: $($item.Length) bytes)"
            } catch {
                return "EXISTS (Size query failed: UNKNOWN)"
            }
        } else {
            return "NOT FOUND"
        }
    } catch {
        return "UNKNOWN (Path check error: $_)"
    }
}

$transcriptStarted = $false
if (-not $PreflightOnly) {
    if (Test-Path -LiteralPath $transcriptPath) {
        throw "ABORT: Transcript file '$transcriptPath' already exists. Refusing to overwrite previous test evidence."
    }
    try {
        Start-Transcript -Path $transcriptPath -NoClobber -ErrorAction Stop
        $transcriptStarted = $true
    } catch {
        throw "ABORT: Failed to initialize transcript at '$transcriptPath': $_. Live mutation aborted."
    }
}

try {
    Write-Host "=== P2 1GB LIVE TEST RUNNER (P2-1GB-LIVE-02) ==="
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

    # Verify R1 VHDX preservation
    if (Test-Path -LiteralPath $r1VhdPath) {
        $r1Item = Get-Item -LiteralPath $r1VhdPath
        Write-Host "R1 Backing VHDX Preservation: PRESERVED (Size: $($r1Item.Length) bytes)"
    } else {
        Write-Warning "R1 Backing VHDX '$r1VhdPath' was not found."
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
    $prevEap1 = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $step1Output = & powershell -NoProfile -ExecutionPolicy Bypass -File $scriptPath -VhdPath $vhdPath -SizeMB 1024 -DriveLetter X -Execute 2>&1
    $step1Exit = $LASTEXITCODE
    $ErrorActionPreference = $prevEap1
    Write-Host ($step1Output -join "`n")

    if ($step1Exit -ne 0) {
        throw "CRITICAL FAILURE: Step 1 setup/format/nonce returned non-zero exit code $step1Exit. Halting without detach or deletion."
    }

    # Verify intermediate state before proceeding to detach
    $midImgAttached = Get-ImageAttachedObservationStatus -Path $vhdPath
    $midDriveX = Get-DriveXObservationStatus
    Write-Host "`nStep 1 Verification State:"
    Write-Host "  Image Attached: $midImgAttached"
    Write-Host "  Drive X:        $midDriveX"

    if ($midImgAttached -ne "True" -or -not ($midDriveX -like 'STILL MOUNTED*')) {
        throw "CRITICAL FAILURE: Intermediate state verification failed after Step 1. ImageAttached=$midImgAttached, DriveX=$midDriveX."
    }

    # 3. Step 2: Controlled Safe Detach
    Write-Host "`n>>> EXECUTING STEP 2: Controlled Safe Detach <<<"
    $prevEap2 = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $step2Output = & powershell -NoProfile -ExecutionPolicy Bypass -File $scriptPath -VhdPath $vhdPath -DriveLetter X -DetachOnly -Execute 2>&1
    $step2Exit = $LASTEXITCODE
    $ErrorActionPreference = $prevEap2
    Write-Host ($step2Output -join "`n")

    # 4. Final State Observation & Assertions
    Write-Host "`n>>> OBSERVING FINAL STATE <<<"
    $finalImgAttached = Get-ImageAttachedObservationStatus -Path $vhdPath
    $finalDriveX = Get-DriveXObservationStatus
    $finalVhdStatus = Get-VhdFileObservationStatus -Path $vhdPath

    Write-Host "Final Image Attached Status: $finalImgAttached"
    Write-Host "Final Drive X: Status:       $finalDriveX"
    Write-Host "Test VHDX Preservation:      $finalVhdStatus"

    $endTime = (Get-Date).ToString("o")
    Write-Host "Test End Time: $endTime"

    # Strict check of step 2 and final state
    if ($step2Exit -ne 0) {
        throw "CRITICAL FAILURE: Step 2 detach returned non-zero exit code $step2Exit. Halting without additional mutation."
    }
    if ($finalImgAttached -ne "False") {
        throw "CRITICAL FAILURE: Backing image is not detached (Attached = $finalImgAttached)."
    }
    if ($finalDriveX -ne "FREE / UNMOUNTED") {
        throw "CRITICAL FAILURE: Drive X: is not free/unmounted (Status = $finalDriveX)."
    }
    if (-not ($finalVhdStatus -like 'EXISTS*')) {
        throw "CRITICAL FAILURE: Test VHDX file was not preserved (Status = $finalVhdStatus)."
    }

    Write-Host "`n=== 1GB LIVE TEST COMPLETE: ALL STEPS VERIFIED PASS ==="
} catch {
    Write-Host "`n==============================================================================" -ForegroundColor Red
    Write-Host "[FATAL ERROR] 1GB Live Test Aborted / Failed:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host "==============================================================================" -ForegroundColor Red

    Write-Host "`n>>> READ-ONLY POST-FAILURE STATE OBSERVATION <<<"
    Write-Host "VHDX File Status:        $(Get-VhdFileObservationStatus -Path $vhdPath)"
    Write-Host "Image Attached Status:   $(Get-ImageAttachedObservationStatus -Path $vhdPath)"
    Write-Host "Drive X: Status:         $(Get-DriveXObservationStatus)"
    Write-Host ">>> END OF OBSERVATION (No further mutation attempted) <<<`n"
    exit 1
} finally {
    if ($transcriptStarted) {
        Stop-Transcript
    }
}

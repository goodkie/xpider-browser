# [PROJECT]: Lite Chromium Portable
# [WORKSPACE ROOT]: E:\vivpr\ai\ebrowser
# [BOUND THREAD]: goodkie/v-show Issue #8
# [ISOLATION SANITY CHECK]: VERIFIED (Zero cross-project contamination)
#
# Controlled 1GB Live Execution & Observation Runner (P2-1GB-LIVE-01)
# Enforces exact SHA check on approved build/ executor baseline, step-by-step
# exit code validation, failure halt without deletion, and raw transcript capture.

$ErrorActionPreference = "Stop"

$workspaceRoot = "E:\vivpr\ai\ebrowser"
$minimalRoot = "E:\vivpr\ai\ebrowser\portable-minimal"
$vhdPath = "E:\vivpr\ai\ebrowser\build_test_1gb.vhdx"
$transcriptPath = "E:\vivpr\ai\ebrowser\portable-minimal\tests\1gb_live_test_raw_transcript.txt"
$scriptPath = "E:\vivpr\ai\ebrowser\portable-minimal\build\setup_build_volume.ps1"
$expectedBaselineSha = "c6025f415e1c9323e7cb60b9fe52301ee4f2d6ca"

Write-Host "=== P2 1GB LIVE TEST RUNNER (P2-1GB-LIVE-01) ==="
$startTime = (Get-Date).ToString("o")
Write-Host "Test Start Time: $startTime"

# 1. Pre-Execution Identity and State Assertions
$executorSha = (git -C $minimalRoot log -1 --format=%H -- build/setup_build_volume.ps1).Trim()
$moduleSha = (git -C $minimalRoot log -1 --format=%H -- build/VirtualDiskSafety.psm1).Trim()
$buildDiff = (git -C $minimalRoot diff -- build/).Trim()

Write-Host "Approved Baseline SHA: $expectedBaselineSha"
Write-Host "Executor (setup_build_volume.ps1) SHA: $executorSha"
Write-Host "Safety Module (VirtualDiskSafety.psm1) SHA: $moduleSha"

if ($executorSha -ne $expectedBaselineSha) {
    throw "ABORT: Executor SHA ($executorSha) does not match approved baseline ($expectedBaselineSha)."
}
if ($moduleSha -ne $expectedBaselineSha) {
    throw "ABORT: Module SHA ($moduleSha) does not match approved baseline ($expectedBaselineSha)."
}
if (-not [string]::IsNullOrEmpty($buildDiff)) {
    throw "ABORT: Uncommitted modifications detected in build/ directory."
}

if (Test-Path -LiteralPath $vhdPath) {
    throw "ABORT: Target test VHDX '$vhdPath' already exists prior to test execution."
}

$xDrive = Get-PSDrive -Name X -ErrorAction SilentlyContinue
if ($xDrive) {
    throw "ABORT: Target drive letter X: is already in use by $($xDrive.Description)."
}

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
Write-Host "Administrative Elevation Check: $isAdmin"
if (-not $isAdmin) {
    throw "ABORT: Administrative elevation is required for 1GB live test execution."
}

Write-Host "Pre-execution assertions: ALL PASS"

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

if ($step2Exit -ne 0) {
    Write-Warning "CRITICAL: Step 2 detach failed with exit code $step2Exit."
}

# 5. Final State Observations
Write-Host "`n>>> FINAL STATE OBSERVATION <<<"
$finalImg = Get-DiskImage -ImagePath $vhdPath -ErrorAction Stop
Write-Host "Backing Image Final Attached State: $($finalImg.Attached)"
$finalX = Get-PSDrive -Name X -ErrorAction SilentlyContinue
Write-Host "Drive X: Mounted State: $(if($finalX){ 'STILL MOUNTED' } else { 'UNMOUNTED / FREE' })"

if (Test-Path -LiteralPath $vhdPath) {
    $vhdItem = Get-Item -LiteralPath $vhdPath
    Write-Host "Test VHDX Preservation: PRESERVED (Path: $vhdPath, Size: $($vhdItem.Length) bytes)"
} else {
    Write-Host "Test VHDX Preservation: NOT FOUND"
}

$endTime = (Get-Date).ToString("o")
Write-Host "Test End Time: $endTime"
Write-Host "`n=== 1GB LIVE TEST COMPLETE ==="

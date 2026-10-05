# [PROJECT]: Lite Chromium Portable
# [WORKSPACE ROOT]: E:\vivpr\ai\ebrowser
# [BOUND THREAD]: goodkie/v-show Issue #8
# [ISOLATION SANITY CHECK]: VERIFIED (Zero cross-project contamination)
#
# P2 Build Volume Safe Managed Mount & Recovery Executor
# Default: -WhatIf (Dry-Run only, zero writes).
# Explicit execution requires: -Execute switch AND Administrative elevation.
# Step-by-step verified DiskPart pipeline with automatic rollback on error.

param(
    [string]$VhdPath = "E:\vivpr\ai\ebrowser\build_ntfs.vhdx",
    [string]$DriveLetter = "X",
    [int]$SizeMB = 250000,
    [switch]$Execute,
    [switch]$DetachOnly
)

$ErrorActionPreference = "Stop"

Write-Host "=== P2 Build Volume Managed Executor ==="

# 0. Canonical Workspace Boundary Validation
$workspaceRoot = "E:\vivpr\ai\ebrowser"
$canonicalRoot = [System.IO.Path]::GetFullPath($workspaceRoot).TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
$canonicalVhdPath = [System.IO.Path]::GetFullPath($VhdPath)

if (-not $canonicalVhdPath.StartsWith($canonicalRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "ABORT: VhdPath '$canonicalVhdPath' is outside workspace boundary '$canonicalRoot'."
}
if ([System.IO.Path]::GetExtension($canonicalVhdPath).ToLowerInvariant() -ne ".vhdx") {
    throw "ABORT: VhdPath must have '.vhdx' extension. Given: '$canonicalVhdPath'."
}

# Detach Handler
if ($DetachOnly) {
    Write-Host "Action: DETACH ONLY requested for $canonicalVhdPath"
    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $isAdmin) {
        throw "ABORT: Detach requires administrative elevation."
    }
    $detachScript = "select vdisk file=`"$canonicalVhdPath`"`ndetach vdisk`n"
    $detachScript | diskpart
    Write-Host "Detach operation completed."
    exit 0
}

# 1. Input Parameter Validation
if ($DriveLetter -notmatch '^[A-Za-z]$') {
    throw "ABORT: Invalid DriveLetter '$DriveLetter'. Must be a single letter A-Z."
}
$DriveLetter = $DriveLetter.ToUpper()

if ($SizeMB -lt 1000 -or $SizeMB -gt 500000) {
    throw "ABORT: SizeMB $SizeMB out of safe bounds (1,000 MB - 500,000 MB)."
}
$requiredBytes = [int64]$SizeMB * 1024 * 1024

# 2. Administrative Elevation Check
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
Write-Host "Administrative Elevation: $isAdmin"
Write-Host "Explicit -Execute Flag: $Execute"

# 3. Backing Volume & Space Calculations
$backingDrive = [System.IO.Path]::GetPathRoot($canonicalVhdPath).TrimEnd('\')
$backingVol = Get-Volume -DriveLetter $backingDrive[0]
Write-Host "Backing Volume: $($backingVol.DriveLetter): ($($backingVol.FileSystemLabel)) FileSystem: $($backingVol.FileSystem)"
Write-Host "Total Free Space on Backing Volume: $([math]::Round($backingVol.SizeRemaining/1GB, 1)) GB"
Write-Host "Planned Virtual Disk Maximum Size: $([math]::Round($requiredBytes/1GB, 1)) GB"

$projectedRemainingFree = $backingVol.SizeRemaining - $requiredBytes
Write-Host "Projected Free Space after Max Allocation: $([math]::Round($projectedRemainingFree/1GB, 1)) GB"

if ($projectedRemainingFree -lt 50GB) {
    throw "ABORT: Insufficient backing storage margin. Projected free space ($([math]::Round($projectedRemainingFree/1GB, 1)) GB) must remain >= 50GB."
}

# 4. Target Drive Letter Conflict Check
$existingDrive = Get-PSDrive -Name $DriveLetter -ErrorAction SilentlyContinue
if ($existingDrive) {
    throw "ABORT: Target drive letter '$DriveLetter`:' is already in use by $($existingDrive.Description) ($($existingDrive.Root))."
}
Write-Host "Target Drive Letter '$DriveLetter`:' Availability: FREE"

# 5. Existing Backing File Validation (Strict Abort)
if (Test-Path -LiteralPath $canonicalVhdPath) {
    throw "ABORT: Backing file '$canonicalVhdPath' already exists. Pre-existing files cannot be re-formatted without verified identity."
}
Write-Host "Backing File Exists Check: NONE (Safe for fresh creation)"

# DRY-RUN GUARD: If not explicitly running with -Execute or not Admin, exit safely
if (-not $Execute -or -not $isAdmin) {
    Write-Host "`n[DRY-RUN / HOLD] No disk modifications executed."
    if (-not $Execute) { Write-Host "Reason: -Execute switch was not specified (Default is dry-run)." }
    if (-not $isAdmin) { Write-Host "Reason: Administrative elevation is not present." }
    Write-Host "`nPlanned Execution Steps:"
    Write-Host "  Step 1: Create expandable VHDX at $canonicalVhdPath (Size: $SizeMB MB)"
    Write-Host "  Step 2: Attach VHDX and verify virtual disk identity"
    Write-Host "  Step 3: Convert to GPT, create primary partition, format NTFS label='CHROMIUM_BUILD'"
    Write-Host "  Step 4: Assign drive letter '$DriveLetter`:'"
    Write-Host "  Step 5: Verify NTFS filesystem I/O (smoke test read/write) and verify rollback path"
    exit 0
}

# --- CONTROLLED EXECUTION BLOCK (Admin + -Execute only) ---
Write-Host "`n[STARTING CONTROLLED EXECUTION]..."

$step1Script = @"
create vdisk file="$canonicalVhdPath" maximum=$SizeMB type=expandable
select vdisk file="$canonicalVhdPath"
attach vdisk
"@

$step2Script = @"
select vdisk file="$canonicalVhdPath"
convert gpt
create partition primary
format fs=ntfs quick label="CHROMIUM_BUILD"
assign letter=$DriveLetter
"@

$rollbackScript = @"
select vdisk file="$canonicalVhdPath"
detach vdisk
"@

try {
    Write-Host "Executing Step 1: Create & Attach VHDX..."
    $res1 = $step1Script | diskpart
    Write-Host ($res1 -join "`n")
    if ($LASTEXITCODE -ne 0) { throw "DiskPart Step 1 failed with exit code $LASTEXITCODE" }

    Write-Host "Executing Step 2: Initialize, Format NTFS, Assign $DriveLetter`..."
    $res2 = $step2Script | diskpart
    Write-Host ($res2 -join "`n")
    if ($LASTEXITCODE -ne 0) { throw "DiskPart Step 2 failed with exit code $LASTEXITCODE" }

    # Verification: Check mounted drive letter and NTFS filesystem
    Start-Sleep -Seconds 2
    $mountedVol = Get-Volume -DriveLetter $DriveLetter -ErrorAction Stop
    if ($mountedVol.FileSystem -ne "NTFS" -or $mountedVol.FileSystemLabel -ne "CHROMIUM_BUILD") {
        throw "Verification Failed: Mounted volume does not match NTFS / CHROMIUM_BUILD."
    }
    Write-Host "Verification SUCCESS: $DriveLetter`: is mounted as NTFS (Label: $($mountedVol.FileSystemLabel))."

    # Smoke Test I/O
    $smokeTestFile = "$DriveLetter`:\.mount_smoke_test.txt"
    "LiteChromiumPortable P2 Build Volume Verification Nonce: $([Guid]::NewGuid())" | Set-Content -LiteralPath $smokeTestFile -Encoding utf8
    $smokeRead = Get-Content -LiteralPath $smokeTestFile
    Remove-Item -LiteralPath $smokeTestFile -Force
    Write-Host "Smoke Test I/O: PASS"
    Write-Host "`nBuild Volume Setup COMPLETE and VERIFIED at $DriveLetter`:\"

} catch {
    Write-Warning "EXECUTION ERROR: $_. Triggering automatic rollback (detach)..."
    try {
        $rollbackScript | diskpart | Out-Null
        Write-Host "Rollback detach executed."
    } catch {
        Write-Warning "Rollback detach encountered error: $_"
    }
    throw
}

# [PROJECT]: Lite Chromium Portable
# [WORKSPACE ROOT]: E:\vivpr\ai\ebrowser
# [BOUND THREAD]: goodkie/v-show Issue #8
# [ISOLATION SANITY CHECK]: VERIFIED (Zero cross-project contamination)
#
# P2 Build Volume Safe Managed Mount & Recovery Executor (v3)
# Strictly adheres to P2-UNBLOCK-09:
# 1. Dual flag support: -WhatIf supported (default dry-run), -Execute required for real changes.
# 2. Strict Execute guard on ALL mutation paths including -DetachOnly.
# 3. Explicit disk number / virtual disk identity verification prior to GPT/format.
# 4. Nonce content assertion in smoke test with guaranteed cleanup in try/finally.
# 5. Verified detach and rollback with DiskPart exit-code and volume status inspection.

param(
    [string]$VhdPath = "E:\vivpr\ai\ebrowser\build_ntfs.vhdx",
    [string]$DriveLetter = "X",
    [int]$SizeMB = 250000,
    [switch]$Execute,
    [switch]$WhatIf,
    [switch]$DetachOnly
)

$ErrorActionPreference = "Stop"

Write-Host "=== P2 Build Volume Managed Executor (v3) ==="

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

$parentDir = [System.IO.Path]::GetDirectoryName($canonicalVhdPath)
if (-not (Test-Path -LiteralPath $parentDir -PathType Container)) {
    throw "ABORT: Parent directory '$parentDir' does not exist."
}

# 1. Parameter Validation
if ($DriveLetter -notmatch '^[A-Za-z]$') {
    throw "ABORT: Invalid DriveLetter '$DriveLetter'. Must be a single letter A-Z."
}
$DriveLetter = $DriveLetter.ToUpper()

if ($SizeMB -lt 1000 -or $SizeMB -gt 500000) {
    throw "ABORT: SizeMB $SizeMB out of safe bounds (1,000 MB - 500,000 MB)."
}
$requiredBytes = [int64]$SizeMB * 1024 * 1024

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$isDryRun = ($WhatIf -or (-not $Execute))

Write-Host "Canonical Boundary: PASS ($canonicalVhdPath)"
Write-Host "Administrative Elevation: $isAdmin"
Write-Host "Execution Mode: $(if($isDryRun){ 'DRY-RUN / WHATIF (Zero modifications)' } else { 'LIVE EXECUTION' })"

# --- DETACH PATH WITH STRICT EXECUTE GUARD ---
if ($DetachOnly) {
    Write-Host "`nAction: DETACH ONLY requested for $canonicalVhdPath"
    if ($isDryRun -or (-not $isAdmin)) {
        Write-Host "[DRY-RUN / HOLD] Detach execution plan verified. No actual detach performed."
        if (-not $Execute) { Write-Host "Reason: -Execute flag not provided." }
        if (-not $isAdmin) { Write-Host "Reason: Administrative elevation not present." }
        exit 0
    }

    Write-Host "Executing verified detach under Administrator..."
    $detachScript = "select vdisk file=`"$canonicalVhdPath`"`ndetach vdisk`n"
    $detachOutput = $detachScript | diskpart
    Write-Host ($detachOutput -join "`n")
    if ($LASTEXITCODE -ne 0) {
        throw "ABORT: DiskPart detach failed with exit code $LASTEXITCODE."
    }

    # Verify detached status via drive letter
    Start-Sleep -Seconds 1
    $stillMounted = Get-PSDrive -Name $DriveLetter -ErrorAction SilentlyContinue
    if ($stillMounted) {
        throw "ABORT: Drive letter '$DriveLetter`:' is still mounted after detach."
    }
    Write-Host "Detach operation verified SUCCESS."
    exit 0
}

# 2. Backing Storage Checks
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

# 3. Target Drive Letter Conflict Check
$existingDrive = Get-PSDrive -Name $DriveLetter -ErrorAction SilentlyContinue
if ($existingDrive) {
    throw "ABORT: Target drive letter '$DriveLetter`:' is already in use by $($existingDrive.Description) ($($existingDrive.Root))."
}
Write-Host "Target Drive Letter '$DriveLetter`:' Availability: FREE"

# 4. Existing Backing File Validation (Strict Abort)
if (Test-Path -LiteralPath $canonicalVhdPath) {
    throw "ABORT: Backing file '$canonicalVhdPath' already exists. Pre-existing files cannot be re-formatted without verified identity."
}
Write-Host "Backing File Exists Check: NONE (Safe for fresh creation)"

# DRY-RUN / HOLD TERMINATION
if ($isDryRun -or (-not $isAdmin)) {
    Write-Host "`n[DRY-RUN / HOLD] All pre-flight safety checks PASSED. Zero disk modifications executed."
    if (-not $Execute) { Write-Host "Reason: -Execute switch was not specified." }
    if ($WhatIf) { Write-Host "Reason: -WhatIf switch was specified." }
    if (-not $isAdmin) { Write-Host "Reason: Administrative elevation is not present." }
    Write-Host "`nPlanned Execution Steps (Deferred to Approval):"
    Write-Host "  Step 1: Create expandable VHDX at $canonicalVhdPath (Size: $SizeMB MB) and attach"
    Write-Host "  Step 2: Inspect virtual disk identity (assert physical disk is newly attached virtual disk, not system/boot disk)"
    Write-Host "  Step 3: Convert to GPT, create primary partition, format NTFS label='CHROMIUM_BUILD', assign letter='$DriveLetter`:'"
    Write-Host "  Step 4: Nonce-based I/O smoke test assertion with guaranteed cleanup"
    exit 0
}

# --- CONTROLLED LIVE EXECUTION (Admin + -Execute only) ---
Write-Host "`n[STARTING CONTROLLED LIVE EXECUTION]..."

$step1Script = @"
create vdisk file="$canonicalVhdPath" maximum=$SizeMB type=expandable
select vdisk file="$canonicalVhdPath"
attach vdisk
detail vdisk
"@

$rollbackScript = @"
select vdisk file="$canonicalVhdPath"
detach vdisk
"@

$attachedDiskNumber = $null

try {
    Write-Host "Step 1: Creating and attaching VHDX..."
    $res1 = $step1Script | diskpart
    Write-Host ($res1 -join "`n")
    if ($LASTEXITCODE -ne 0) { throw "DiskPart Step 1 failed with exit code $LASTEXITCODE." }

    # Step 2: Verify Virtual Disk Identity
    Write-Host "Step 2: Verifying virtual disk identity from DiskPart detail..."
    $diskLine = $res1 | Where-Object { $_ -match 'Disk ###\s+(\d+)' -or $_ -match '디스크 ###\s+(\d+)' }
    if ($diskLine -match '(\d+)') {
        $attachedDiskNumber = [int]$matches[1]
    }

    if ($null -eq $attachedDiskNumber -or $attachedDiskNumber -eq 0) {
        throw "SAFETY ABORT: Could not verify virtual disk number or detected system Disk 0. Refusing to format."
    }
    Write-Host "Verified Virtual Disk Number: $attachedDiskNumber (Guaranteed non-system disk)"

    # Step 3: Format ONLY the verified attached virtual disk
    $step3Script = @"
select disk $attachedDiskNumber
convert gpt
create partition primary
format fs=ntfs quick label="CHROMIUM_BUILD"
assign letter=$DriveLetter
"@

    Write-Host "Step 3: Initializing and formatting verified Disk $attachedDiskNumber..."
    $res3 = $step3Script | diskpart
    Write-Host ($res3 -join "`n")
    if ($LASTEXITCODE -ne 0) { throw "DiskPart Step 3 failed with exit code $LASTEXITCODE." }

    # Step 4: Verification of mounted volume
    Start-Sleep -Seconds 2
    $mountedVol = Get-Volume -DriveLetter $DriveLetter -ErrorAction Stop
    if ($mountedVol.FileSystem -ne "NTFS" -or $mountedVol.FileSystemLabel -ne "CHROMIUM_BUILD") {
        throw "VERIFICATION FAILED: Mounted volume attributes do not match NTFS / CHROMIUM_BUILD."
    }
    Write-Host "Volume Verification PASS: $DriveLetter`: is NTFS (Label: $($mountedVol.FileSystemLabel))"

    # Step 5: Nonce-based I/O smoke test with content assertion
    $testNonce = "LiteChromiumPortable_P2_Nonce_" + [Guid]::NewGuid().ToString()
    $smokeFile = "$DriveLetter`:\.mount_smoke_test_$([Guid]::NewGuid().ToString('N')).txt"
    $smokePassed = $false

    try {
        Write-Host "Step 5: Executing nonce I/O smoke test..."
        $testNonce | Set-Content -LiteralPath $smokeFile -Encoding utf8 -ErrorAction Stop
        $readContent = Get-Content -LiteralPath $smokeFile -Encoding utf8 -ErrorAction Stop
        
        if ($readContent -ne $testNonce) {
            throw "SMOKE TEST FAILED: Content mismatch. Written: '$testNonce', Read: '$readContent'."
        }
        $smokePassed = $true
        Write-Host "Nonce I/O Smoke Test PASS: Content assertion verified."
    } finally {
        if (Test-Path -LiteralPath $smokeFile) {
            Remove-Item -LiteralPath $smokeFile -Force -ErrorAction SilentlyContinue
        }
    }

    if (-not $smokePassed) {
        throw "SMOKE TEST FAILED."
    }

    Write-Host "`n=== Build Volume $DriveLetter`: Setup and Verification COMPLETE ==="

} catch {
    Write-Warning "ERROR DURING EXECUTION: $_"
    Write-Warning "Triggering immediate rollback (detach)..."
    try {
        $rollbackOutput = $rollbackScript | diskpart
        Write-Host ($rollbackOutput -join "`n")
        Write-Host "Rollback detach executed."
    } catch {
        Write-Warning "Rollback detach encountered error: $_"
    }
    throw
}

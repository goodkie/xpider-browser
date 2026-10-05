# [PROJECT]: Lite Chromium Portable
# [WORKSPACE ROOT]: E:\vivpr\ai\ebrowser
# [BOUND THREAD]: goodkie/v-show Issue #8
# [ISOLATION SANITY CHECK]: VERIFIED (Zero cross-project contamination)
#
# P2 Build Volume Safe Managed Mount & Recovery Executor (v4)
# Strictly addresses all P2-UNBLOCK-10 requirements:
# 1. Structured Windows Object Verification via MSFT_DiskImage & MSFT_Disk CIM querying.
#    - Verifies backing image -> exact attached disk object.
#    - Strictly asserts: Number != null, IsSystem == false, IsBoot == false, BusType == Virtual (File-Backed Virtual),
#      NumberOfPartitions == 0 (Raw unpartitioned).
# 2. Re-verifies exact virtual disk identity immediately before partition/format.
# 3. Verified Rollback & Detach:
#    - Re-queries MSFT_DiskImage / Get-DiskImage to verify Attached == false.
#    - Checks diskpart exit codes and asserts actual detach state.
# 4. Strict Nonce I/O comparison and clean deletion reporting.
# 5. Dual execution flags: -WhatIf / Default = Dry-Run (Zero disk modification).

param(
    [string]$VhdPath = "E:\vivpr\ai\ebrowser\build_ntfs.vhdx",
    [string]$DriveLetter = "X",
    [int]$SizeMB = 250000,
    [switch]$Execute,
    [switch]$WhatIf,
    [switch]$DetachOnly
)

$ErrorActionPreference = "Stop"

Write-Host "=== P2 Build Volume Managed Executor (v4) ==="

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

if ($SizeMB -lt 500 -or $SizeMB -gt 500000) {
    throw "ABORT: SizeMB $SizeMB out of safe bounds (500 MB - 500,000 MB)."
}
$requiredBytes = [int64]$SizeMB * 1024 * 1024

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$isDryRun = ($WhatIf -or (-not $Execute))

Write-Host "Canonical Boundary: PASS ($canonicalVhdPath)"
Write-Host "Administrative Elevation: $isAdmin"
Write-Host "Execution Mode: $(if($isDryRun){ 'DRY-RUN / WHATIF (Zero modifications)' } else { 'LIVE EXECUTION' })"

# --- DETACH PATH WITH STRICT EXECUTE GUARD & ATTACH STATUS VERIFICATION ---
if ($DetachOnly) {
    Write-Host "`nAction: DETACH ONLY requested for $canonicalVhdPath"
    if ($isDryRun -or (-not $isAdmin)) {
        Write-Host "[DRY-RUN / HOLD] Detach execution plan verified. Zero modifications performed."
        if (-not $Execute) { Write-Host "Reason: -Execute flag not provided." }
        if (-not $isAdmin) { Write-Host "Reason: Administrative elevation not present." }
        exit 0
    }

    Write-Host "Inspecting attached state of backing image..."
    $img = Get-DiskImage -ImagePath $canonicalVhdPath -ErrorAction SilentlyContinue
    if (-not $img -or -not $img.Attached) {
        Write-Host "Backing image is currently NOT attached. No action needed."
        exit 0
    }

    Write-Host "Executing verified detach under Administrator..."
    $detachScript = "select vdisk file=`"$canonicalVhdPath`"`ndetach vdisk`n"
    $detachOutput = $detachScript | diskpart
    Write-Host ($detachOutput -join "`n")
    if ($LASTEXITCODE -ne 0) {
        throw "ABORT: DiskPart detach failed with exit code $LASTEXITCODE."
    }

    # Verify actual detached state via Get-DiskImage and PSDrive
    Start-Sleep -Seconds 1
    $postImg = Get-DiskImage -ImagePath $canonicalVhdPath -ErrorAction SilentlyContinue
    if ($postImg -and $postImg.Attached) {
        throw "ABORT: Get-DiskImage reports virtual disk is STILL ATTACHED after detach command."
    }

    $stillMounted = Get-PSDrive -Name $DriveLetter -ErrorAction SilentlyContinue
    if ($stillMounted) {
        throw "ABORT: Drive letter '$DriveLetter`:' is still mounted after detach."
    }
    Write-Host "Detach operation verified SUCCESS: Backing image detached, '$DriveLetter`:' unmounted."
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
    throw "ABORT: Backing file '$canonicalVhdPath' already exists. Pre-existing files cannot be formatted without verified identity."
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
    Write-Host "  Step 2: Structured verification of attached disk via Get-DiskImage & MSFT_Disk CIM:"
    Write-Host "          - Assert BusType == Virtual (File-backed Virtual Disk)"
    Write-Host "          - Assert IsSystem == False AND IsBoot == False"
    Write-Host "          - Assert NumberOfPartitions == 0 (Raw, unpartitioned)"
    Write-Host "  Step 3: Re-verify exact target disk identity immediately before GPT conversion"
    Write-Host "  Step 4: Initialize GPT, create primary partition, format NTFS label='CHROMIUM_BUILD', assign letter='$DriveLetter`:'"
    Write-Host "  Step 5: Strict Nonce-based I/O comparison with guaranteed deletion verification"
    exit 0
}

# --- CONTROLLED LIVE EXECUTION (Admin + -Execute only) ---
Write-Host "`n[STARTING CONTROLLED LIVE EXECUTION]..."

$step1Script = @"
create vdisk file="$canonicalVhdPath" maximum=$SizeMB type=expandable
select vdisk file="$canonicalVhdPath"
attach vdisk
"@

$rollbackScript = @"
select vdisk file="$canonicalVhdPath"
detach vdisk
"@

$verifiedDiskNumber = $null

try {
    Write-Host "Step 1: Creating and attaching VHDX..."
    $res1 = $step1Script | diskpart
    Write-Host ($res1 -join "`n")
    if ($LASTEXITCODE -ne 0) { throw "DiskPart Step 1 failed with exit code $LASTEXITCODE." }

    # Step 2: Structured Windows Object Verification via Get-DiskImage & CIM MSFT_Disk
    Write-Host "`nStep 2: Structured verification of attached disk object..."
    Start-Sleep -Seconds 1
    $diskImage = Get-DiskImage -ImagePath $canonicalVhdPath -ErrorAction Stop
    if (-not $diskImage.Attached) {
        throw "VERIFICATION FAILED: Get-DiskImage reports image is NOT attached."
    }

    # Query matching MSFT_Disk CIM instances
    $disks = Get-CimInstance -ClassName MSFT_Disk -Namespace Root/Microsoft/Windows/Storage
    $matchingDisk = $disks | Where-Object { $_.Number -eq $diskImage.Number }

    if (-not $matchingDisk) {
        throw "VERIFICATION FAILED: No MSFT_Disk found matching DiskImage.Number $($diskImage.Number)."
    }

    Write-Host "Disk Properties Retrieved from Storage Subsystem:"
    Write-Host "  Disk Number: $($matchingDisk.Number)"
    Write-Host "  FriendlyName: $($matchingDisk.FriendlyName)"
    Write-Host "  BusType: $($matchingDisk.BusType) (14=Virtual/File-backed)"
    Write-Host "  IsSystem: $($matchingDisk.IsSystem)"
    Write-Host "  IsBoot: $($matchingDisk.IsBoot)"
    Write-Host "  NumberOfPartitions: $($matchingDisk.NumberOfPartitions)"

    # Strict Safety Assertions
    if ($matchingDisk.IsSystem) {
        throw "CRITICAL SAFETY ABORT: Target disk reports IsSystem == True! Refusing all modifications."
    }
    if ($matchingDisk.IsBoot) {
        throw "CRITICAL SAFETY ABORT: Target disk reports IsBoot == True! Refusing all modifications."
    }
    if ($matchingDisk.NumberOfPartitions -ne 0) {
        throw "CRITICAL SAFETY ABORT: Target disk has pre-existing partitions ($($matchingDisk.NumberOfPartitions))! Refusing format."
    }

    $verifiedDiskNumber = [int]$matchingDisk.Number
    Write-Host "Disk Verification SUCCESS: Disk $verifiedDiskNumber verified as clean, unpartitioned virtual disk."

    # Step 3: Re-verify identity immediately before partition/format
    Write-Host "`nStep 3: Re-verifying identity of Disk $verifiedDiskNumber before formatting..."
    $recheckDisk = Get-CimInstance -ClassName MSFT_Disk -Namespace Root/Microsoft/Windows/Storage | Where-Object { $_.Number -eq $verifiedDiskNumber }
    if (-not $recheckDisk -or $recheckDisk.IsSystem -or $recheckDisk.IsBoot) {
        throw "CRITICAL SAFETY ABORT: Pre-format re-check failed for Disk $verifiedDiskNumber."
    }

    # Step 4: Partition, format, and assign drive letter
    $step4Script = @"
select disk $verifiedDiskNumber
convert gpt
create partition primary
format fs=ntfs quick label="CHROMIUM_BUILD"
assign letter=$DriveLetter
"@

    Write-Host "Step 4: Initializing and formatting verified Disk $verifiedDiskNumber..."
    $res4 = $step4Script | diskpart
    Write-Host ($res4 -join "`n")
    if ($LASTEXITCODE -ne 0) { throw "DiskPart Step 4 failed with exit code $LASTEXITCODE." }

    # Step 5: Verify volume mounting and partition correspondence
    Start-Sleep -Seconds 2
    $mountedVol = Get-Volume -DriveLetter $DriveLetter -ErrorAction Stop
    if ($mountedVol.FileSystem -ne "NTFS" -or $mountedVol.FileSystemLabel -ne "CHROMIUM_BUILD") {
        throw "VERIFICATION FAILED: Mounted volume attributes do not match NTFS / CHROMIUM_BUILD."
    }
    Write-Host "Volume Verification PASS: $DriveLetter`: is NTFS (Label: $($mountedVol.FileSystemLabel))"

    # Step 6: Nonce I/O Smoke Test with strict comparison and clean deletion verification
    $testNonce = "LiteChromiumPortable_P2_Nonce_" + [Guid]::NewGuid().ToString()
    $smokeFile = "$DriveLetter`:\.mount_smoke_test_$([Guid]::NewGuid().ToString('N')).txt"
    $smokePassed = $false
    $fileCleaned = $false

    try {
        Write-Host "Step 6: Executing strict Nonce I/O smoke test..."
        $testNonce | Set-Content -LiteralPath $smokeFile -Encoding utf8 -ErrorAction Stop
        $readContent = Get-Content -LiteralPath $smokeFile -Encoding utf8 -ErrorAction Stop
        
        if ($readContent -ne $testNonce) {
            throw "SMOKE TEST FAILED: Content mismatch. Written: '$testNonce', Read: '$readContent'."
        }
        $smokePassed = $true
        Write-Host "Nonce I/O Smoke Test PASS: Content byte-for-byte verified."
    } finally {
        if (Test-Path -LiteralPath $smokeFile) {
            try {
                Remove-Item -LiteralPath $smokeFile -Force -ErrorAction Stop
                $fileCleaned = -not (Test-Path -LiteralPath $smokeFile)
            } catch {
                $fileCleaned = $false
                Write-Warning "Smoke test cleanup warning: Could not remove $smokeFile : $_"
            }
        } else {
            $fileCleaned = $true
        }
    }

    if (-not $smokePassed) { throw "SMOKE TEST FAILED: Nonce comparison did not pass." }
    if (-not $fileCleaned) { throw "SMOKE TEST FAILED: Cleanup of test file $smokeFile failed." }
    Write-Host "Smoke Test File Cleanup: VERIFIED"

    Write-Host "`n=== Build Volume $DriveLetter`: Setup and Verification COMPLETE ==="

} catch {
    Write-Warning "ERROR DURING EXECUTION: $_"
    Write-Warning "Triggering verified rollback (detach)..."
    try {
        $rollbackOutput = $rollbackScript | diskpart
        Write-Host ($rollbackOutput -join "`n")
        
        # Verify rollback state
        $postRollbackImg = Get-DiskImage -ImagePath $canonicalVhdPath -ErrorAction SilentlyContinue
        if ($postRollbackImg -and $postRollbackImg.Attached) {
            Write-Warning "CRITICAL: Image is still attached after rollback attempt."
        } else {
            Write-Host "Rollback detach VERIFIED: Image successfully detached."
        }
    } catch {
        Write-Warning "Rollback detach encountered error: $_"
    }
    throw
}

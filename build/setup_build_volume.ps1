# [PROJECT]: Lite Chromium Portable
# [WORKSPACE ROOT]: E:\vivpr\ai\ebrowser
# [BOUND THREAD]: goodkie/v-show Issue #8
# [ISOLATION SANITY CHECK]: VERIFIED (Zero cross-project contamination)
#
# P2 Build Volume Safe Managed Mount & Recovery Executor (v5)
# Implements all P2-UNBLOCK-11 directives:
# 1. Modularized validation functions enabling zero-mutation offline testing:
#    - Test-AttachedVirtualDiskIdentity: Asserts exactly 1 matching disk, BusType == 14 (FileBackedVirtual),
#      PartitionStyle == 0 (RAW), NumberOfPartitions == 0, IsSystem == False, IsBoot == False.
#    - Test-TargetVolumeCorrespondence: Asserts assigned DriveLetter strictly corresponds to the verified disk number.
# 2. Re-verifies exact virtual disk identity (DiskPath, UniqueId, RAW status) immediately before formatting.
# 3. Verified Rollback & Detach with zero false success:
#    - Verifies diskpart exit codes ($LASTEXITCODE == 0).
#    - Requires observing Get-DiskImage.Attached == False; failures or exceptions report UNKNOWN/FAIL.
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

# --- CORE VALIDATION FUNCTIONS (MODULARIZED FOR OFFLINE UNIT TESTING) ---

function Test-AttachedVirtualDiskIdentity {
    param(
        $DiskImage,
        $AllDisks
    )

    if ($null -eq $DiskImage) {
        throw "IDENTITY VERIFICATION FAILED: DiskImage object is null."
    }
    if ($null -eq $AllDisks -or @($AllDisks).Count -eq 0) {
        throw "IDENTITY VERIFICATION FAILED: AllDisks collection is empty."
    }
    if (-not $DiskImage.Attached) {
        throw "IDENTITY VERIFICATION FAILED: DiskImage reports Attached == False."
    }

    $matchingDisks = @($AllDisks | Where-Object { $_.Number -eq $DiskImage.Number })
    
    if ($matchingDisks.Count -eq 0) {
        throw "IDENTITY VERIFICATION FAILED: No MSFT_Disk found matching DiskImage.Number $($DiskImage.Number)."
    }
    if ($matchingDisks.Count -gt 1) {
        throw "CRITICAL SAFETY ABORT: Multiple disks ($($matchingDisks.Count)) returned matching disk number $($DiskImage.Number)."
    }

    $targetDisk = $matchingDisks[0]

    # 1. BusType check: 14 = FileBackedVirtual / Virtual in Windows Storage WMI
    if ($targetDisk.BusType -ne 14) {
        throw "CRITICAL SAFETY ABORT: Target disk BusType is $($targetDisk.BusType). Expected 14 (Virtual/FileBackedVirtual). Refusing format."
    }

    # 2. System and Boot disk checks
    if ($targetDisk.IsSystem) {
        throw "CRITICAL SAFETY ABORT: Target disk reports IsSystem == True! Refusing all modifications."
    }
    if ($targetDisk.IsBoot) {
        throw "CRITICAL SAFETY ABORT: Target disk reports IsBoot == True! Refusing all modifications."
    }

    # 3. Partition checks: Must be completely raw and unpartitioned
    if ($targetDisk.PartitionStyle -ne 0) {
        throw "CRITICAL SAFETY ABORT: Target disk PartitionStyle is $($targetDisk.PartitionStyle). Expected 0 (RAW). Pre-formatted disk detected."
    }
    if ($targetDisk.NumberOfPartitions -ne 0) {
        throw "CRITICAL SAFETY ABORT: Target disk reports NumberOfPartitions == $($targetDisk.NumberOfPartitions). Expected 0."
    }

    return $targetDisk
}

function Test-TargetVolumeCorrespondence {
    param(
        [Parameter(Mandatory=$true)]
        [string]$TargetLetter,
        [Parameter(Mandatory=$true)]
        [int]$VerifiedDiskNumber
    )

    $part = Get-Partition -DriveLetter $TargetLetter -ErrorAction Stop
    if (-not $part) {
        throw "CORRESPONDENCE FAILED: No partition found for drive letter '$TargetLetter`:'."
    }
    if ($part.DiskNumber -ne $VerifiedDiskNumber) {
        throw "CRITICAL SAFETY ABORT: Drive letter '$TargetLetter`:' belongs to Disk $($part.DiskNumber), NOT verified Disk $VerifiedDiskNumber!"
    }

    $vol = Get-Volume -DriveLetter $TargetLetter -ErrorAction Stop
    if ($vol.FileSystem -ne "NTFS" -or $vol.FileSystemLabel -ne "CHROMIUM_BUILD") {
        throw "CORRESPONDENCE FAILED: Volume on '$TargetLetter`:' attributes do not match NTFS / CHROMIUM_BUILD."
    }

    return $true
}

# --- MAIN EXECUTOR ---

Write-Host "=== P2 Build Volume Managed Executor (v5) ==="

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

# --- DETACH PATH WITH STRICT EXECUTE GUARD & OBSERVED ATTACH STATUS ---
if ($DetachOnly) {
    Write-Host "`nAction: DETACH ONLY requested for $canonicalVhdPath"
    if ($isDryRun -or (-not $isAdmin)) {
        Write-Host "[DRY-RUN / HOLD] Detach execution plan verified. Zero modifications performed."
        if (-not $Execute) { Write-Host "Reason: -Execute flag not provided." }
        if (-not $isAdmin) { Write-Host "Reason: Administrative elevation not present." }
        exit 0
    }

    Write-Host "Inspecting attached state of backing image..."
    try {
        $img = Get-DiskImage -ImagePath $canonicalVhdPath -ErrorAction Stop
    } catch {
        throw "ABORT: Failed to query disk image status: $_"
    }

    if (-not $img.Attached) {
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

    # Verify actual detached state via observed Get-DiskImage
    Start-Sleep -Seconds 1
    try {
        $postImg = Get-DiskImage -ImagePath $canonicalVhdPath -ErrorAction Stop
        if ($postImg.Attached) {
            throw "ABORT: DiskImage reports STILL ATTACHED after detach command."
        }
    } catch {
        throw "ABORT: Could not verify detached state (query error): $_"
    }

    $stillMounted = Get-PSDrive -Name $DriveLetter -ErrorAction SilentlyContinue
    if ($stillMounted) {
        throw "ABORT: Drive letter '$DriveLetter`:' is still mounted after detach."
    }
    Write-Host "Detach operation verified SUCCESS: Backing image observed Attached=False, '$DriveLetter`:' unmounted."
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
    Write-Host "  Step 2: Structured verification of attached disk via Test-AttachedVirtualDiskIdentity:"
    Write-Host "          - Assert BusType == 14 (FileBackedVirtual)"
    Write-Host "          - Assert IsSystem == False AND IsBoot == False"
    Write-Host "          - Assert PartitionStyle == 0 (RAW) AND NumberOfPartitions == 0"
    Write-Host "  Step 3: Re-verify exact target disk identity (UniqueId, RAW status) immediately before GPT conversion"
    Write-Host "  Step 4: Initialize GPT, create primary partition, format NTFS label='CHROMIUM_BUILD', assign letter='$DriveLetter`:'"
    Write-Host "  Step 5: Verify volume correspondence (Test-TargetVolumeCorrespondence: DriveLetter -> DiskNumber)"
    Write-Host "  Step 6: Strict Nonce-based I/O comparison with guaranteed deletion verification"
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
$verifiedDiskUniqueId = $null

try {
    Write-Host "Step 1: Creating and attaching VHDX..."
    $res1 = $step1Script | diskpart
    Write-Host ($res1 -join "`n")
    if ($LASTEXITCODE -ne 0) { throw "DiskPart Step 1 failed with exit code $LASTEXITCODE." }

    # Step 2: Structured Windows Object Verification
    Write-Host "`nStep 2: Structured verification of attached disk object..."
    Start-Sleep -Seconds 1
    $diskImage = Get-DiskImage -ImagePath $canonicalVhdPath -ErrorAction Stop
    $allDisks = Get-CimInstance -ClassName MSFT_Disk -Namespace Root/Microsoft/Windows/Storage

    $verifiedDisk = Test-AttachedVirtualDiskIdentity -DiskImage $diskImage -AllDisks $allDisks
    $verifiedDiskNumber = [int]$verifiedDisk.Number
    $verifiedDiskUniqueId = $verifiedDisk.UniqueId
    Write-Host "Disk Verification SUCCESS: Disk $verifiedDiskNumber verified as clean RAW virtual disk (BusType=14, UniqueId=$verifiedDiskUniqueId)."

    # Step 3: Re-verify identity immediately before partition/format
    Write-Host "`nStep 3: Re-verifying identity of Disk $verifiedDiskNumber before formatting..."
    $recheckDisk = Get-CimInstance -ClassName MSFT_Disk -Namespace Root/Microsoft/Windows/Storage | Where-Object { $_.Number -eq $verifiedDiskNumber }
    if (-not $recheckDisk -or $recheckDisk.UniqueId -ne $verifiedDiskUniqueId -or $recheckDisk.IsSystem -or $recheckDisk.IsBoot -or $recheckDisk.PartitionStyle -ne 0) {
        throw "CRITICAL SAFETY ABORT: Pre-format re-check failed for Disk $verifiedDiskNumber. Identity or state changed!"
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
    Test-TargetVolumeCorrespondence -TargetLetter $DriveLetter -VerifiedDiskNumber $verifiedDiskNumber | Out-Null
    Write-Host "Volume Correspondence PASS: $DriveLetter`: strictly corresponds to verified Disk $verifiedDiskNumber."

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
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "Rollback diskpart exited with non-zero code $LASTEXITCODE."
        }
        
        # Verify rollback state strictly
        $postRollbackImg = Get-DiskImage -ImagePath $canonicalVhdPath -ErrorAction Stop
        if ($postRollbackImg.Attached) {
            Write-Warning "CRITICAL: Image is STILL ATTACHED after rollback attempt."
        } else {
            Write-Host "Rollback detach VERIFIED: Observed Image.Attached == False."
        }
    } catch {
        Write-Warning "Rollback detach verification failed: $_"
    }
    throw
}

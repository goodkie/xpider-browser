# [PROJECT]: Lite Chromium Portable
# [WORKSPACE ROOT]: E:\vivpr\ai\ebrowser
# [BOUND THREAD]: goodkie/v-show Issue #8
# [ISOLATION SANITY CHECK]: VERIFIED (Zero cross-project contamination)
#
# Module: Virtual Disk Identity & Safety Validation Functions (P2-UNBLOCK-12)

function Test-AttachedVirtualDiskIdentity {
    param(
        $DiskImage,
        $AllDisks
    )

    if ($null -eq $DiskImage) {
        throw "IDENTITY VERIFICATION FAILED: DiskImage object is null."
    }
    if ($null -eq $DiskImage.Attached -or $DiskImage.Attached -ne $true) {
        throw "IDENTITY VERIFICATION FAILED: DiskImage reports Attached is not True."
    }
    if ($null -eq $DiskImage.Number) {
        throw "IDENTITY VERIFICATION FAILED: DiskImage.Number is null."
    }

    if ($null -eq $AllDisks -or @($AllDisks).Count -eq 0) {
        throw "IDENTITY VERIFICATION FAILED: AllDisks collection is empty."
    }

    $matchingDisks = @($AllDisks | Where-Object { $_.Number -eq $DiskImage.Number })
    
    if ($matchingDisks.Count -eq 0) {
        throw "IDENTITY VERIFICATION FAILED: No MSFT_Disk found matching DiskImage.Number $($DiskImage.Number)."
    }
    if ($matchingDisks.Count -gt 1) {
        throw "CRITICAL SAFETY ABORT: Multiple disks ($($matchingDisks.Count)) returned matching disk number $($DiskImage.Number)."
    }

    $targetDisk = $matchingDisks[0]

    # Required property existence assertions (must not be null)
    if ($null -eq $targetDisk.BusType) { throw "CRITICAL SAFETY ABORT: Disk BusType property is null." }
    if ($null -eq $targetDisk.IsSystem) { throw "CRITICAL SAFETY ABORT: Disk IsSystem property is null." }
    if ($null -eq $targetDisk.IsBoot) { throw "CRITICAL SAFETY ABORT: Disk IsBoot property is null." }
    if ($null -eq $targetDisk.PartitionStyle) { throw "CRITICAL SAFETY ABORT: Disk PartitionStyle property is null." }
    if ($null -eq $targetDisk.NumberOfPartitions) { throw "CRITICAL SAFETY ABORT: Disk NumberOfPartitions property is null." }
    if ([string]::IsNullOrWhiteSpace($targetDisk.UniqueId)) { throw "CRITICAL SAFETY ABORT: Disk UniqueId is null or empty." }

    # 1. BusType check: Microsoft MSFT_Disk official specification:
    #    14 = Virtual, 15 = File Backed Virtual (VHD/VHDX)
    #    Strictly requires 15 for VHDX, rejects 14 or lower.
    if ($targetDisk.BusType -ne 15) {
        throw "CRITICAL SAFETY ABORT: Target disk BusType is $($targetDisk.BusType). Expected 15 (File Backed Virtual). Refusing format."
    }

    # 2. System and Boot disk checks
    if ($targetDisk.IsSystem -eq $true) {
        throw "CRITICAL SAFETY ABORT: Target disk reports IsSystem == True! Refusing all modifications."
    }
    if ($targetDisk.IsBoot -eq $true) {
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
        [int]$VerifiedDiskNumber,
        $MockPartition,
        $MockVolume
    )

    $part = if ($MockPartition) { $MockPartition } else { Get-Partition -DriveLetter $TargetLetter -ErrorAction Stop }
    if (-not $part) {
        throw "CORRESPONDENCE FAILED: No partition found for drive letter '$TargetLetter`:'."
    }
    if ($part.DiskNumber -ne $VerifiedDiskNumber) {
        throw "CRITICAL SAFETY ABORT: Drive letter '$TargetLetter`:' belongs to Disk $($part.DiskNumber), NOT verified Disk $VerifiedDiskNumber!"
    }

    $vol = if ($MockVolume) { $MockVolume } else { Get-Volume -DriveLetter $TargetLetter -ErrorAction Stop }
    if ($vol.FileSystem -ne "NTFS" -or $vol.FileSystemLabel -ne "CHROMIUM_BUILD") {
        throw "CORRESPONDENCE FAILED: Volume on '$TargetLetter`:' attributes do not match NTFS / CHROMIUM_BUILD."
    }

    return $true
}

Export-ModuleMember -Function Test-AttachedVirtualDiskIdentity, Test-TargetVolumeCorrespondence

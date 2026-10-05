# [PROJECT]: Lite Chromium Portable
# [WORKSPACE ROOT]: E:\vivpr\ai\ebrowser
# [BOUND THREAD]: goodkie/v-show Issue #8
# [ISOLATION SANITY CHECK]: VERIFIED (Zero cross-project contamination)
#
# Module: Virtual Disk Identity & Safety Validation Functions (P2-UNBLOCK-13)

function Test-AttachedVirtualDiskIdentity {
    param(
        $DiskImage,
        $AllDisks,
        [string]$ExpectedImagePath = ""
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
    if ([string]::IsNullOrWhiteSpace($DiskImage.ImagePath)) {
        throw "IDENTITY VERIFICATION FAILED: DiskImage.ImagePath is null or empty."
    }
    if (-not [string]::IsNullOrWhiteSpace($ExpectedImagePath)) {
        $canonDiskImg = [System.IO.Path]::GetFullPath($DiskImage.ImagePath)
        $canonExpected = [System.IO.Path]::GetFullPath($ExpectedImagePath)
        if ($canonDiskImg -ne $canonExpected) {
            throw "CRITICAL SAFETY ABORT: DiskImage ImagePath mismatch. Expected '$canonExpected', Actual '$canonDiskImg'."
        }
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
    if ([string]::IsNullOrWhiteSpace($targetDisk.Path)) { throw "CRITICAL SAFETY ABORT: Disk Path is null or empty." }

    # 1. BusType check: Microsoft MSFT_Disk official specification:
    #    14 = Virtual, 15 = File Backed Virtual (VHD/VHDX)
    #    When Storage module is loaded, ETS ScriptProperty exposes string "File Backed Virtual",
    #    while raw CIM instance property exposes integer [uint16]15.
    #    Strictly requires File Backed Virtual / 15, rejecting 14 (Virtual), unknown strings, or null.
    $rawBusType = if ($targetDisk.psBase -and $targetDisk.psBase.CimInstanceProperties -and $targetDisk.psBase.CimInstanceProperties['BusType']) {
        $targetDisk.psBase.CimInstanceProperties['BusType'].Value
    } else {
        $targetDisk.BusType
    }

    $isBusType15 = ($targetDisk.BusType -eq 15 -or $targetDisk.BusType -eq "File Backed Virtual" -or $rawBusType -eq 15)
    $isForbiddenVirtual = ($targetDisk.BusType -eq 14 -or $targetDisk.BusType -eq "Virtual" -or $rawBusType -eq 14)

    if ($isForbiddenVirtual) {
        throw "CRITICAL SAFETY ABORT: Target disk BusType is Virtual (14). Expected 15 (File Backed Virtual). Refusing format."
    }
    if (-not $isBusType15) {
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
    #    When Storage module is loaded, ETS ScriptProperty exposes string "RAW",
    #    while raw CIM instance property exposes integer [uint16]0.
    $rawPartStyle = if ($targetDisk.psBase -and $targetDisk.psBase.CimInstanceProperties -and $targetDisk.psBase.CimInstanceProperties['PartitionStyle']) {
        $targetDisk.psBase.CimInstanceProperties['PartitionStyle'].Value
    } else {
        $targetDisk.PartitionStyle
    }

    $isRawPartStyle = ($targetDisk.PartitionStyle -eq 0 -or $targetDisk.PartitionStyle -eq "RAW" -or $rawPartStyle -eq 0)
    if (-not $isRawPartStyle) {
        throw "CRITICAL SAFETY ABORT: Target disk PartitionStyle is $($targetDisk.PartitionStyle). Expected 0 (RAW). Pre-formatted disk detected."
    }
    if ($targetDisk.NumberOfPartitions -ne 0) {
        throw "CRITICAL SAFETY ABORT: Target disk reports NumberOfPartitions == $($targetDisk.NumberOfPartitions). Expected 0."
    }

    return $targetDisk
}

function Test-PreFormatIdentityMatch {
    param(
        [Parameter(Mandatory=$true)]
        $InitialDisk,
        [Parameter(Mandatory=$true)]
        $CurrentDiskImage,
        [Parameter(Mandatory=$true)]
        [array]$CurrentAllDisks,
        [string]$ExpectedImagePath = ""
    )

    if ($null -eq $InitialDisk) {
        throw "CRITICAL SAFETY ABORT: InitialDisk object is null."
    }
    if ([string]::IsNullOrWhiteSpace($InitialDisk.UniqueId)) {
        throw "CRITICAL SAFETY ABORT: InitialDisk UniqueId is null or empty."
    }
    if ([string]::IsNullOrWhiteSpace($InitialDisk.Path)) {
        throw "CRITICAL SAFETY ABORT: InitialDisk Path is null or empty."
    }

    # Full rigorous re-verification via Test-AttachedVirtualDiskIdentity
    $reverifiedDisk = Test-AttachedVirtualDiskIdentity -DiskImage $CurrentDiskImage -AllDisks $CurrentAllDisks -ExpectedImagePath $ExpectedImagePath

    # Match initial identity: Number, UniqueId, and Path
    if ($reverifiedDisk.Number -ne $InitialDisk.Number) {
        throw "CRITICAL SAFETY ABORT: Pre-format Disk Number mismatch. Initial=$($InitialDisk.Number), Current=$($reverifiedDisk.Number)."
    }
    if ($reverifiedDisk.UniqueId -ne $InitialDisk.UniqueId) {
        throw "CRITICAL SAFETY ABORT: Pre-format Disk UniqueId mismatch. Initial='$($InitialDisk.UniqueId)', Current='$($reverifiedDisk.UniqueId)'."
    }
    if ($reverifiedDisk.Path -ne $InitialDisk.Path) {
        throw "CRITICAL SAFETY ABORT: Pre-format Disk Path mismatch. Initial='$($InitialDisk.Path)', Current='$($reverifiedDisk.Path)'."
    }

    return $reverifiedDisk
}

function Test-ObservedDetachState {
    param(
        $DiskImageQueryOutput
    )

    if ($null -eq $DiskImageQueryOutput) {
        throw "DETACH VERIFICATION FAILED: Query returned null (UNKNOWN state). Cannot confirm detached."
    }
    if ($null -eq $DiskImageQueryOutput.Attached) {
        throw "DETACH VERIFICATION FAILED: Image Attached property is null (UNKNOWN state)."
    }
    if ($DiskImageQueryOutput.Attached -eq $true) {
        throw "DETACH VERIFICATION FAILED: Image is STILL ATTACHED."
    }
    if ($DiskImageQueryOutput.Attached -ne $false) {
        throw "DETACH VERIFICATION FAILED: Image Attached property is ambiguous or not False ($($DiskImageQueryOutput.Attached))."
    }

    return $true # Explicitly observed Attached == False
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

Export-ModuleMember -Function Test-AttachedVirtualDiskIdentity, Test-PreFormatIdentityMatch, Test-ObservedDetachState, Test-TargetVolumeCorrespondence

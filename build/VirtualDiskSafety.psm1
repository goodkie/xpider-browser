# [PROJECT]: Lite Chromium Portable
# [WORKSPACE ROOT]: E:\vivpr\ai\ebrowser
# [BOUND THREAD]: goodkie/v-show Issue #8
# [ISOLATION SANITY CHECK]: VERIFIED (Zero cross-project contamination)
#
function Test-IsIntegerType {
    param($val)
    if ($null -eq $val) { return $false }
    $t = $val.GetType()
    if ($t.IsEnum) { return $true }
    return ($val -is [byte] -or
            $val -is [sbyte] -or
            $val -is [int16] -or
            $val -is [uint16] -or
            $val -is [int32] -or
            $val -is [uint32] -or
            $val -is [int64] -or
            $val -is [uint64])
}

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

    # Type validation helper to reject bool, array, and non-scalar types
    if ($null -eq $targetDisk.BusType) { throw "CRITICAL SAFETY ABORT: Disk BusType property is null." }
    if ($targetDisk.BusType -is [bool] -or ($targetDisk.BusType -is [System.Collections.IEnumerable] -and $targetDisk.BusType -isnot [string])) {
        throw "CRITICAL SAFETY ABORT: Disk BusType has invalid type '$($targetDisk.BusType.GetType().FullName)' (implicit conversion forbidden)."
    }
    if ($null -eq $targetDisk.IsSystem) { throw "CRITICAL SAFETY ABORT: Disk IsSystem property is null." }
    if ($null -eq $targetDisk.IsBoot) { throw "CRITICAL SAFETY ABORT: Disk IsBoot property is null." }
    if ($null -eq $targetDisk.PartitionStyle) { throw "CRITICAL SAFETY ABORT: Disk PartitionStyle property is null." }
    if ($targetDisk.PartitionStyle -is [bool] -or ($targetDisk.PartitionStyle -is [System.Collections.IEnumerable] -and $targetDisk.PartitionStyle -isnot [string])) {
        throw "CRITICAL SAFETY ABORT: Disk PartitionStyle has invalid type '$($targetDisk.PartitionStyle.GetType().FullName)' (implicit conversion forbidden)."
    }
    if ($null -eq $targetDisk.NumberOfPartitions) { throw "CRITICAL SAFETY ABORT: Disk NumberOfPartitions property is null." }
    if ([string]::IsNullOrWhiteSpace($targetDisk.UniqueId)) { throw "CRITICAL SAFETY ABORT: Disk UniqueId is null or empty." }
    if ([string]::IsNullOrWhiteSpace($targetDisk.Path)) { throw "CRITICAL SAFETY ABORT: Disk Path is null or empty." }

    # Determine if a CIM container / metadata is present
    $isCimPresent = $false
    $cimProps = $null

    if ($targetDisk -is [Microsoft.Management.Infrastructure.CimInstance]) {
        $isCimPresent = $true
        try {
            $cimProps = $targetDisk.CimInstanceProperties
        } catch {
            throw "CRITICAL SAFETY ABORT: Failed to retrieve CimInstanceProperties from CimInstance: $_"
        }
    } elseif ($null -ne $targetDisk.PSObject.Properties['CimInstanceProperties']) {
        $isCimPresent = $true
        try {
            $cimProps = $targetDisk.CimInstanceProperties
        } catch {
            throw "CRITICAL SAFETY ABORT: Failed to retrieve CimInstanceProperties container: $_"
        }
    } else {
        try {
            if ($targetDisk.psBase -and $targetDisk.psBase.CimInstanceProperties) {
                $isCimPresent = $true
                $cimProps = $targetDisk.psBase.CimInstanceProperties
            }
        } catch {}
    }

    if ($isCimPresent) {
        if ($null -eq $cimProps) {
            throw "CRITICAL SAFETY ABORT: CIM container is present but CimInstanceProperties is null. Refusing fallback."
        }

        # 1. BusType check on CIM object: MUST exist, MUST query cleanly, MUST NOT fallback
        $rawBusEntry = $null
        if ($cimProps -is [System.Collections.IDictionary]) {
            if (-not $cimProps.Contains('BusType')) {
                throw "CRITICAL SAFETY ABORT: Required raw CIM property 'BusType' is missing from CIM container. Refusing fallback."
            }
            $rawBusEntry = $cimProps['BusType']
        } else {
            try {
                $rawBusEntry = $cimProps['BusType']
            } catch {
                throw "CRITICAL SAFETY ABORT: Query for raw CIM property 'BusType' failed: $_. Refusing fallback."
            }
            if ($null -eq $rawBusEntry) {
                throw "CRITICAL SAFETY ABORT: Required raw CIM property 'BusType' is missing from CIM container. Refusing fallback."
            }
        }

        $rawBusVal = if ($null -ne $rawBusEntry.PSObject.Properties['Value']) { $rawBusEntry.Value } else { $rawBusEntry }
        if ($null -eq $rawBusVal) {
            throw "CRITICAL SAFETY ABORT: Raw CIM BusType property is null/unknown. Refusing fallback."
        }
        if (-not (Test-IsIntegerType $rawBusVal)) {
            throw "CRITICAL SAFETY ABORT: Raw CIM BusType has invalid non-integer type ($($rawBusVal.GetType().FullName))."
        }
        $rawBusNum = [int64]$rawBusVal
        if ($rawBusNum -eq 14) {
            throw "CRITICAL SAFETY ABORT: Target disk BusType is Virtual (14). Expected 15 (File Backed Virtual). Refusing format."
        }
        if ($rawBusNum -ne 15) {
            throw "CRITICAL SAFETY ABORT: Target disk BusType is raw CIM $rawBusVal. Expected 15 (File Backed Virtual). Refusing format."
        }

        # Cross-validate display property if present on the CIM object
        if ($null -ne $targetDisk.BusType) {
            $busMatches = $false
            if ($targetDisk.BusType -is [string] -and $targetDisk.BusType.Trim() -eq "File Backed Virtual") {
                $busMatches = $true
            } elseif ((Test-IsIntegerType $targetDisk.BusType) -and [int64]$targetDisk.BusType -eq 15) {
                $busMatches = $true
            }
            if (-not $busMatches) {
                if (-not ($targetDisk.BusType -is [string]) -and -not (Test-IsIntegerType $targetDisk.BusType)) {
                    throw "CRITICAL SAFETY ABORT: Display BusType has invalid non-integer/non-string type ($($targetDisk.BusType.GetType().FullName))."
                }
                throw "CRITICAL SAFETY ABORT: BusType expression conflict: raw CIM is 15 but display property is '$($targetDisk.BusType)'."
            }
        }

        # 2. System and Boot disk checks
        if ($targetDisk.IsSystem -eq $true) {
            throw "CRITICAL SAFETY ABORT: Target disk reports IsSystem == True! Refusing all modifications."
        }
        if ($targetDisk.IsBoot -eq $true) {
            throw "CRITICAL SAFETY ABORT: Target disk reports IsBoot == True! Refusing all modifications."
        }

        # 3. PartitionStyle check on CIM object: MUST exist, MUST query cleanly, MUST NOT fallback
        $rawPartEntry = $null
        if ($cimProps -is [System.Collections.IDictionary]) {
            if (-not $cimProps.Contains('PartitionStyle')) {
                throw "CRITICAL SAFETY ABORT: Required raw CIM property 'PartitionStyle' is missing from CIM container. Refusing fallback."
            }
            $rawPartEntry = $cimProps['PartitionStyle']
        } else {
            try {
                $rawPartEntry = $cimProps['PartitionStyle']
            } catch {
                throw "CRITICAL SAFETY ABORT: Query for raw CIM property 'PartitionStyle' failed: $_. Refusing fallback."
            }
            if ($null -eq $rawPartEntry) {
                throw "CRITICAL SAFETY ABORT: Required raw CIM property 'PartitionStyle' is missing from CIM container. Refusing fallback."
            }
        }

        $rawPartVal = if ($null -ne $rawPartEntry.PSObject.Properties['Value']) { $rawPartEntry.Value } else { $rawPartEntry }
        if ($null -eq $rawPartVal) {
            throw "CRITICAL SAFETY ABORT: Raw CIM PartitionStyle property is null/unknown. Refusing fallback."
        }
        if (-not (Test-IsIntegerType $rawPartVal)) {
            throw "CRITICAL SAFETY ABORT: Raw CIM PartitionStyle has invalid non-integer type ($($rawPartVal.GetType().FullName))."
        }
        $rawPartNum = [int64]$rawPartVal
        if ($rawPartNum -ne 0) {
            throw "CRITICAL SAFETY ABORT: Target disk PartitionStyle is raw CIM $rawPartVal. Expected 0 (RAW). Pre-formatted disk detected."
        }

        # Cross-validate display property if present on the CIM object
        if ($null -ne $targetDisk.PartitionStyle) {
            $partMatches = $false
            if ($targetDisk.PartitionStyle -is [string] -and $targetDisk.PartitionStyle.Trim() -eq "RAW") {
                $partMatches = $true
            } elseif ((Test-IsIntegerType $targetDisk.PartitionStyle) -and [int64]$targetDisk.PartitionStyle -eq 0) {
                $partMatches = $true
            }
            if (-not $partMatches) {
                if (-not ($targetDisk.PartitionStyle -is [string]) -and -not (Test-IsIntegerType $targetDisk.PartitionStyle)) {
                    throw "CRITICAL SAFETY ABORT: Display PartitionStyle has invalid non-integer/non-string type ($($targetDisk.PartitionStyle.GetType().FullName))."
                }
                throw "CRITICAL SAFETY ABORT: PartitionStyle expression conflict: raw CIM is 0 but display property is '$($targetDisk.PartitionStyle)'."
            }
        }
    } else {
        # Standalone Mock validation (when CIM metadata container is TRULY absent)
        # 1. BusType check:
        $isValidBus = $false
        if ($targetDisk.BusType -is [string] -and $targetDisk.BusType.Trim() -eq "File Backed Virtual") {
            $isValidBus = $true
        } elseif ((Test-IsIntegerType $targetDisk.BusType) -and [int64]$targetDisk.BusType -eq 15) {
            $isValidBus = $true
        }
        if (-not $isValidBus) {
            if (-not ($targetDisk.BusType -is [string]) -and -not (Test-IsIntegerType $targetDisk.BusType)) {
                throw "CRITICAL SAFETY ABORT: BusType has invalid non-integer/non-string type ($($targetDisk.BusType.GetType().FullName)). Implicit type coercion rejected."
            }
            if ($targetDisk.BusType -eq 14 -or $targetDisk.BusType -eq "Virtual") {
                throw "CRITICAL SAFETY ABORT: Target disk BusType is Virtual (14). Expected 15 (File Backed Virtual). Refusing format."
            }
            throw "CRITICAL SAFETY ABORT: Target disk BusType is '$($targetDisk.BusType)'. Expected 15 (File Backed Virtual). Refusing format."
        }

        # 2. System and Boot disk checks
        if ($targetDisk.IsSystem -eq $true) {
            throw "CRITICAL SAFETY ABORT: Target disk reports IsSystem == True! Refusing all modifications."
        }
        if ($targetDisk.IsBoot -eq $true) {
            throw "CRITICAL SAFETY ABORT: Target disk reports IsBoot == True! Refusing all modifications."
        }

        # 3. PartitionStyle check:
        $isValidPart = $false
        if ($targetDisk.PartitionStyle -is [string] -and $targetDisk.PartitionStyle.Trim() -eq "RAW") {
            $isValidPart = $true
        } elseif ((Test-IsIntegerType $targetDisk.PartitionStyle) -and [int64]$targetDisk.PartitionStyle -eq 0) {
            $isValidPart = $true
        }
        if (-not $isValidPart) {
            if (-not ($targetDisk.PartitionStyle -is [string]) -and -not (Test-IsIntegerType $targetDisk.PartitionStyle)) {
                throw "CRITICAL SAFETY ABORT: PartitionStyle has invalid non-integer/non-string type ($($targetDisk.PartitionStyle.GetType().FullName)). Implicit type coercion rejected."
            }
            throw "CRITICAL SAFETY ABORT: Target disk PartitionStyle is '$($targetDisk.PartitionStyle)'. Expected 0 (RAW). Pre-formatted disk detected."
        }
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

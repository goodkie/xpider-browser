# [PROJECT]: Lite Chromium Portable
# [WORKSPACE ROOT]: E:\vivpr\ai\ebrowser
# [BOUND THREAD]: goodkie/v-show Issue #8
# [ISOLATION SANITY CHECK]: VERIFIED (Zero cross-project contamination)
#
# Offline Unit Tests for setup_build_volume.ps1 Validation Functions (v5)
# Zero-mutation tests: Mocks inputs to verify all safety abort paths without touching disks.

$scriptPath = "E:\vivpr\ai\ebrowser\portable-minimal\build\setup_build_volume.ps1"

# Extract functions by dot-sourcing with dummy params in dry-run
. $scriptPath -WhatIf | Out-Null

$testSuitePassed = $true

function Assert-Throws {
    param([scriptblock]$Script, [string]$ExpectedSubstring, [string]$TestName)
    try {
        & $Script
        Write-Host "  [FAIL] $TestName - Expected exception containing '$ExpectedSubstring' but none was thrown." -ForegroundColor Red
        $script:testSuitePassed = $false
    } catch {
        if ($_.Exception.Message -like "*$ExpectedSubstring*") {
            Write-Host "  [PASS] $TestName - Threw expected: $($_.Exception.Message)" -ForegroundColor Green
        } else {
            Write-Host "  [FAIL] $TestName - Threw unexpected exception: $($_.Exception.Message)" -ForegroundColor Red
            $script:testSuitePassed = $false
        }
    }
}

Write-Host "`n=== Running Offline Unit Tests for Identity & Safety Assertions ==="

# Test 1: Null DiskImage
Assert-Throws -Script {
    Test-AttachedVirtualDiskIdentity -DiskImage $null -AllDisks @()
} -ExpectedSubstring "DiskImage object is null" -TestName "Test 1: Null DiskImage abort"

# Test 2: Unattached DiskImage
Assert-Throws -Script {
    Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached = $false; Number = 2 }) -AllDisks @([PSCustomObject]@{ Number = 2 })
} -ExpectedSubstring "Attached == False" -TestName "Test 2: Attached==False abort"

# Test 3: Multiple matching disks (Ambiguity)
$mockDisksMulti = @(
    [PSCustomObject]@{ Number = 2; BusType = 14; IsSystem = $false; IsBoot = $false; PartitionStyle = 0; NumberOfPartitions = 0 },
    [PSCustomObject]@{ Number = 2; BusType = 14; IsSystem = $false; IsBoot = $false; PartitionStyle = 0; NumberOfPartitions = 0 }
)
Assert-Throws -Script {
    Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached = $true; Number = 2 }) -AllDisks $mockDisksMulti
} -ExpectedSubstring "Multiple disks (2) returned" -TestName "Test 3: Multiple matching disks abort"

# Test 4: Wrong BusType (e.g. SATA / NVMe = 11, USB = 7, not 14)
$mockDiskWrongBus = @(
    [PSCustomObject]@{ Number = 2; BusType = 11; IsSystem = $false; IsBoot = $false; PartitionStyle = 0; NumberOfPartitions = 0 }
)
Assert-Throws -Script {
    Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached = $true; Number = 2 }) -AllDisks $mockDiskWrongBus
} -ExpectedSubstring "Expected 14 (Virtual/FileBackedVirtual)" -TestName "Test 4: Wrong BusType abort"

# Test 5: System Disk Protection (IsSystem == True)
$mockDiskSystem = @(
    [PSCustomObject]@{ Number = 2; BusType = 14; IsSystem = $true; IsBoot = $false; PartitionStyle = 0; NumberOfPartitions = 0 }
)
Assert-Throws -Script {
    Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached = $true; Number = 2 }) -AllDisks $mockDiskSystem
} -ExpectedSubstring "IsSystem == True" -TestName "Test 5: IsSystem==True safety abort"

# Test 6: Boot Disk Protection (IsBoot == True)
$mockDiskBoot = @(
    [PSCustomObject]@{ Number = 2; BusType = 14; IsSystem = $false; IsBoot = $true; PartitionStyle = 0; NumberOfPartitions = 0 }
)
Assert-Throws -Script {
    Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached = $true; Number = 2 }) -AllDisks $mockDiskBoot
} -ExpectedSubstring "IsBoot == True" -TestName "Test 6: IsBoot==True safety abort"

# Test 7: Pre-formatted / Non-RAW Disk Protection (PartitionStyle != 0)
$mockDiskPreformatted = @(
    [PSCustomObject]@{ Number = 2; BusType = 14; IsSystem = $false; IsBoot = $false; PartitionStyle = 2; NumberOfPartitions = 0 }
)
Assert-Throws -Script {
    Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached = $true; Number = 2 }) -AllDisks $mockDiskPreformatted
} -ExpectedSubstring "Expected 0 (RAW)" -TestName "Test 7: PartitionStyle!=RAW safety abort"

# Test 8: Pre-existing Partitions Protection (NumberOfPartitions > 0)
$mockDiskHasPartitions = @(
    [PSCustomObject]@{ Number = 2; BusType = 14; IsSystem = $false; IsBoot = $false; PartitionStyle = 0; NumberOfPartitions = 1 }
)
Assert-Throws -Script {
    Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached = $true; Number = 2 }) -AllDisks $mockDiskHasPartitions
} -ExpectedSubstring "NumberOfPartitions == 1. Expected 0" -TestName "Test 8: NumberOfPartitions>0 safety abort"

# Test 9: Valid Clean Raw Virtual Disk (Success Case)
$mockDiskValid = @(
    [PSCustomObject]@{ Number = 2; UniqueId = "VIRTUAL_DISK_GUID_12345"; BusType = 14; IsSystem = $false; IsBoot = $false; PartitionStyle = 0; NumberOfPartitions = 0 }
)
$verified = Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached = $true; Number = 2 }) -AllDisks $mockDiskValid
if ($verified.Number -eq 2 -and $verified.UniqueId -eq "VIRTUAL_DISK_GUID_12345") {
    Write-Host "  [PASS] Test 9: Valid clean RAW virtual disk correctly verified." -ForegroundColor Green
} else {
    Write-Host "  [FAIL] Test 9: Valid clean RAW virtual disk failed verification." -ForegroundColor Red
    $testSuitePassed = $false
}

# Test 10: Volume Correspondence Disagreement
Assert-Throws -Script {
    # C: drive belongs to Disk 0, test with VerifiedDiskNumber = 99
    Test-TargetVolumeCorrespondence -TargetLetter "C" -VerifiedDiskNumber 99
} -ExpectedSubstring "belongs to Disk 0, NOT verified Disk 99" -TestName "Test 10: Volume correspondence mismatch abort"

if (-not $testSuitePassed) {
    throw "Offline unit test suite FAILED."
}

Write-Host "`nAll 10 offline safety assertion unit tests PASSED (Zero mutations executed)."

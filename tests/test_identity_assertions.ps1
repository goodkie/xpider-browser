# [PROJECT]: Lite Chromium Portable
# [WORKSPACE ROOT]: E:\vivpr\ai\ebrowser
# [BOUND THREAD]: goodkie/v-show Issue #8
# [ISOLATION SANITY CHECK]: VERIFIED (Zero cross-project contamination)
#
# Standalone Unit Test Driver for VirtualDiskSafety Module (P2-UNBLOCK-12)
# Zero-mutation test suite: Does not run main script or exit prematurely.

$ErrorActionPreference = "Stop"

Write-Host "=== STARTING OFFLINE VIRTUAL DISK SAFETY UNIT TEST SUITE ==="
Write-Host "Timestamp: $(Get-Date -Format o)"
Write-Host "Process Arch: $(if([Environment]::Is64BitProcess){'x64'}else{'x86'})"

$modulePath = Join-Path $PSScriptRoot "..\build\VirtualDiskSafety.psm1"
Import-Module $modulePath -Force

$executedCount = 0
$passedCount = 0
$failedCount = 0

function Assert-Throws {
    param([scriptblock]$Script, [string]$ExpectedSubstring, [string]$TestName)
    $script:executedCount++
    try {
        & $Script
        Write-Host "  [FAIL] $TestName - Expected exception containing '$ExpectedSubstring' but none was thrown."
        $script:failedCount++
    } catch {
        if ($_.Exception.Message -like "*$ExpectedSubstring*") {
            Write-Host "  [PASS] $TestName"
            $script:passedCount++
        } else {
            Write-Host "  [FAIL] $TestName - Threw unexpected exception: $($_.Exception.Message)"
            $script:failedCount++
        }
    }
}

function Assert-Succeeds {
    param([scriptblock]$Script, [string]$TestName)
    $script:executedCount++
    try {
        & $Script | Out-Null
        Write-Host "  [PASS] $TestName"
        $script:passedCount++
    } catch {
        Write-Host "  [FAIL] $TestName - Unexpected exception: $($_.Exception.Message)"
        $script:failedCount++
    }
}

# 1. Null / Unattached / Incomplete DiskImage Tests
Assert-Throws -Script {
    Test-AttachedVirtualDiskIdentity -DiskImage $null -AllDisks @([PSCustomObject]@{ Number=2 })
} -ExpectedSubstring "DiskImage object is null" -TestName "Test 1: Null DiskImage abort"

Assert-Throws -Script {
    Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached=$false; Number=2 }) -AllDisks @([PSCustomObject]@{ Number=2 })
} -ExpectedSubstring "Attached is not True" -TestName "Test 2: Attached==False abort"

Assert-Throws -Script {
    Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached=$true; Number=$null }) -AllDisks @([PSCustomObject]@{ Number=2 })
} -ExpectedSubstring "DiskImage.Number is null" -TestName "Test 3: Null DiskImage.Number abort"

# 2. Ambiguity & Missing Disks
Assert-Throws -Script {
    Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached=$true; Number=2 }) -AllDisks @()
} -ExpectedSubstring "AllDisks collection is empty" -TestName "Test 4: Empty AllDisks collection abort"

Assert-Throws -Script {
    $multi = @(
        [PSCustomObject]@{ Number=2; BusType=15; IsSystem=$false; IsBoot=$false; PartitionStyle=0; NumberOfPartitions=0; UniqueId="GUID1" },
        [PSCustomObject]@{ Number=2; BusType=15; IsSystem=$false; IsBoot=$false; PartitionStyle=0; NumberOfPartitions=0; UniqueId="GUID2" }
    )
    Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached=$true; Number=2 }) -AllDisks $multi
} -ExpectedSubstring "Multiple disks (2) returned" -TestName "Test 5: Multiple matching disks ambiguity abort"

# 3. Required Property Null Checks
Assert-Throws -Script {
    $nullProp = @([PSCustomObject]@{ Number=2; BusType=$null; IsSystem=$false; IsBoot=$false; PartitionStyle=0; NumberOfPartitions=0; UniqueId="GUID1" })
    Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached=$true; Number=2 }) -AllDisks $nullProp
} -ExpectedSubstring "BusType property is null" -TestName "Test 6: Null BusType abort"

Assert-Throws -Script {
    $nullProp = @([PSCustomObject]@{ Number=2; BusType=15; IsSystem=$null; IsBoot=$false; PartitionStyle=0; NumberOfPartitions=0; UniqueId="GUID1" })
    Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached=$true; Number=2 }) -AllDisks $nullProp
} -ExpectedSubstring "IsSystem property is null" -TestName "Test 7: Null IsSystem abort"

Assert-Throws -Script {
    $nullProp = @([PSCustomObject]@{ Number=2; BusType=15; IsSystem=$false; IsBoot=$null; PartitionStyle=0; NumberOfPartitions=0; UniqueId="GUID1" })
    Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached=$true; Number=2 }) -AllDisks $nullProp
} -ExpectedSubstring "IsBoot property is null" -TestName "Test 8: Null IsBoot abort"

Assert-Throws -Script {
    $nullProp = @([PSCustomObject]@{ Number=2; BusType=15; IsSystem=$false; IsBoot=$false; PartitionStyle=$null; NumberOfPartitions=0; UniqueId="GUID1" })
    Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached=$true; Number=2 }) -AllDisks $nullProp
} -ExpectedSubstring "PartitionStyle property is null" -TestName "Test 9: Null PartitionStyle abort"

Assert-Throws -Script {
    $nullProp = @([PSCustomObject]@{ Number=2; BusType=15; IsSystem=$false; IsBoot=$false; PartitionStyle=0; NumberOfPartitions=0; UniqueId="" })
    Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached=$true; Number=2 }) -AllDisks $nullProp
} -ExpectedSubstring "UniqueId is null or empty" -TestName "Test 10: Empty UniqueId abort"

# 4. BusType Rejection & Acceptance (Official Spec: 14 = Virtual, 15 = File Backed Virtual)
Assert-Throws -Script {
    $bus14 = @([PSCustomObject]@{ Number=2; BusType=14; IsSystem=$false; IsBoot=$false; PartitionStyle=0; NumberOfPartitions=0; UniqueId="GUID1" })
    Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached=$true; Number=2 }) -AllDisks $bus14
} -ExpectedSubstring "Expected 15 (File Backed Virtual)" -TestName "Test 11: BusType=14 rejection abort"

Assert-Throws -Script {
    $busSata = @([PSCustomObject]@{ Number=2; BusType=11; IsSystem=$false; IsBoot=$false; PartitionStyle=0; NumberOfPartitions=0; UniqueId="GUID1" })
    Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached=$true; Number=2 }) -AllDisks $busSata
} -ExpectedSubstring "Expected 15 (File Backed Virtual)" -TestName "Test 12: BusType=11 (SATA/NVMe) rejection abort"

# 5. System, Boot, Pre-formatted and Pre-existing Partition Safety
Assert-Throws -Script {
    $sys = @([PSCustomObject]@{ Number=2; BusType=15; IsSystem=$true; IsBoot=$false; PartitionStyle=0; NumberOfPartitions=0; UniqueId="GUID1" })
    Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached=$true; Number=2 }) -AllDisks $sys
} -ExpectedSubstring "IsSystem == True" -TestName "Test 13: IsSystem==True abort"

Assert-Throws -Script {
    $boot = @([PSCustomObject]@{ Number=2; BusType=15; IsSystem=$false; IsBoot=$true; PartitionStyle=0; NumberOfPartitions=0; UniqueId="GUID1" })
    Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached=$true; Number=2 }) -AllDisks $boot
} -ExpectedSubstring "IsBoot == True" -TestName "Test 14: IsBoot==True abort"

Assert-Throws -Script {
    $gpt = @([PSCustomObject]@{ Number=2; BusType=15; IsSystem=$false; IsBoot=$false; PartitionStyle=2; NumberOfPartitions=0; UniqueId="GUID1" })
    Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached=$true; Number=2 }) -AllDisks $gpt
} -ExpectedSubstring "Expected 0 (RAW)" -TestName "Test 15: PartitionStyle!=RAW abort"

Assert-Throws -Script {
    $part = @([PSCustomObject]@{ Number=2; BusType=15; IsSystem=$false; IsBoot=$false; PartitionStyle=0; NumberOfPartitions=1; UniqueId="GUID1" })
    Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached=$true; Number=2 }) -AllDisks $part
} -ExpectedSubstring "NumberOfPartitions == 1. Expected 0" -TestName "Test 16: NumberOfPartitions>0 abort"

# 6. Valid Clean File-Backed Virtual Disk (BusType=15) Success
Assert-Succeeds -Script {
    $valid = @([PSCustomObject]@{ Number=2; BusType=15; IsSystem=$false; IsBoot=$false; PartitionStyle=0; NumberOfPartitions=0; UniqueId="VALID_VHDX_UID" })
    $res = Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached=$true; Number=2 }) -AllDisks $valid
    if ($res.Number -ne 2 -or $res.UniqueId -ne "VALID_VHDX_UID") { throw "Result mismatch" }
} -TestName "Test 17: Valid clean RAW virtual disk (BusType=15) PASS"

# 7. Volume Correspondence Tests (Completely Mocked - No OS disk assumption)
Assert-Throws -Script {
    $mockPart = [PSCustomObject]@{ DiskNumber = 0; DriveLetter = "X" }
    $mockVol = [PSCustomObject]@{ FileSystem = "NTFS"; FileSystemLabel = "CHROMIUM_BUILD" }
    Test-TargetVolumeCorrespondence -TargetLetter "X" -VerifiedDiskNumber 2 -MockPartition $mockPart -MockVolume $mockVol
} -ExpectedSubstring "belongs to Disk 0, NOT verified Disk 2" -TestName "Test 18: Volume correspondence disk number mismatch abort"

Assert-Throws -Script {
    $mockPart = [PSCustomObject]@{ DiskNumber = 2; DriveLetter = "X" }
    $mockVol = [PSCustomObject]@{ FileSystem = "FAT32"; FileSystemLabel = "CHROMIUM_BUILD" }
    Test-TargetVolumeCorrespondence -TargetLetter "X" -VerifiedDiskNumber 2 -MockPartition $mockPart -MockVolume $mockVol
} -ExpectedSubstring "attributes do not match NTFS" -TestName "Test 19: Volume filesystem mismatch abort"

Assert-Succeeds -Script {
    $mockPart = [PSCustomObject]@{ DiskNumber = 2; DriveLetter = "X" }
    $mockVol = [PSCustomObject]@{ FileSystem = "NTFS"; FileSystemLabel = "CHROMIUM_BUILD" }
    Test-TargetVolumeCorrespondence -TargetLetter "X" -VerifiedDiskNumber 2 -MockPartition $mockPart -MockVolume $mockVol
} -TestName "Test 20: Valid volume correspondence PASS"

Write-Host "`n=== UNIT TEST SUITE SUMMARY ==="
Write-Host "Total Executed: $executedCount"
Write-Host "Total Passed:   $passedCount"
Write-Host "Total Failed:   $failedCount"

if ($failedCount -gt 0) {
    throw "UNIT TEST SUITE FAILED with $failedCount failures."
}

Write-Host "=== END OF UNIT TEST SUITE: ALL $executedCount TESTS PASSED ==="

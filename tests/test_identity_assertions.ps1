# [PROJECT]: Lite Chromium Portable
# [WORKSPACE ROOT]: E:\vivpr\ai\ebrowser
# [BOUND THREAD]: goodkie/v-show Issue #8
# [ISOLATION SANITY CHECK]: VERIFIED (Zero cross-project contamination)
#
# Standalone Unit Test Driver for VirtualDiskSafety Module (P2-UNBLOCK-13)
# Zero-mutation test suite: Does not run main script or exit prematurely.
# Rigorously validates initial verification, pre-format re-verification,
# volume correspondence, and observed detach state assertions.

$ErrorActionPreference = "Stop"

Write-Host "=== STARTING OFFLINE VIRTUAL DISK SAFETY UNIT TEST SUITE (v2) ==="
Write-Host "Timestamp: $(Get-Date -Format o)"
Write-Host "Process Arch: $(if([Environment]::Is64BitProcess){'x64'}else{'x86'})"

$modulePath = Join-Path $PSScriptRoot "..\build\VirtualDiskSafety.psm1"
Import-Module $modulePath -Force

$executedCount = 0
$passedCount = 0
$failedCount = 0

function Assert-Throws {
    param(
        [scriptblock]$Script,
        [string]$ExpectedSubstring,
        [string]$TestName
    )
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
    param(
        [scriptblock]$Script,
        [string]$TestName
    )
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

$sampleImgPath = "E:\vivpr\ai\ebrowser\build_ntfs.vhdx"
$sampleDiskPath = "\\?\scsi#disk&ven_msft&prod_virtual_disk#000001"

# --- SECTION 1: Test-AttachedVirtualDiskIdentity Initial Verification Tests ---
Write-Host "`n--- Section 1: Attached Virtual Disk Identity Tests ---"

# 1. Null / Unattached / Incomplete DiskImage Tests
Assert-Throws -Script {
    Test-AttachedVirtualDiskIdentity -DiskImage $null -AllDisks @([PSCustomObject]@{ Number=2; Path=$sampleDiskPath })
} -ExpectedSubstring "DiskImage object is null" -TestName "Test 1: Null DiskImage abort"

Assert-Throws -Script {
    Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached=$false; Number=2; ImagePath=$sampleImgPath }) -AllDisks @([PSCustomObject]@{ Number=2; Path=$sampleDiskPath })
} -ExpectedSubstring "Attached is not True" -TestName "Test 2: Attached==False abort"

Assert-Throws -Script {
    Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached=$true; Number=$null; ImagePath=$sampleImgPath }) -AllDisks @([PSCustomObject]@{ Number=2; Path=$sampleDiskPath })
} -ExpectedSubstring "DiskImage.Number is null" -TestName "Test 3: Null DiskImage.Number abort"

Assert-Throws -Script {
    Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached=$true; Number=2; ImagePath="" }) -AllDisks @([PSCustomObject]@{ Number=2; Path=$sampleDiskPath })
} -ExpectedSubstring "DiskImage.ImagePath is null or empty" -TestName "Test 4: Empty ImagePath abort"

Assert-Throws -Script {
    Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached=$true; Number=2; ImagePath=$sampleImgPath }) -AllDisks @([PSCustomObject]@{ Number=2; Path=$sampleDiskPath }) -ExpectedImagePath "E:\other\different.vhdx"
} -ExpectedSubstring "DiskImage ImagePath mismatch" -TestName "Test 5: ImagePath mismatch with ExpectedImagePath abort"

# 2. Ambiguity & Missing Disks
Assert-Throws -Script {
    Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached=$true; Number=2; ImagePath=$sampleImgPath }) -AllDisks @()
} -ExpectedSubstring "AllDisks collection is empty" -TestName "Test 6: Empty AllDisks collection abort"

Assert-Throws -Script {
    $multi = @(
        [PSCustomObject]@{ Number=2; BusType=15; IsSystem=$false; IsBoot=$false; PartitionStyle=0; NumberOfPartitions=0; UniqueId="GUID1"; Path=$sampleDiskPath },
        [PSCustomObject]@{ Number=2; BusType=15; IsSystem=$false; IsBoot=$false; PartitionStyle=0; NumberOfPartitions=0; UniqueId="GUID2"; Path=$sampleDiskPath }
    )
    Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached=$true; Number=2; ImagePath=$sampleImgPath }) -AllDisks $multi
} -ExpectedSubstring "Multiple disks (2) returned" -TestName "Test 7: Multiple matching disks ambiguity abort"

# 3. Required Property Null / Empty Checks
Assert-Throws -Script {
    $nullProp = @([PSCustomObject]@{ Number=2; BusType=$null; IsSystem=$false; IsBoot=$false; PartitionStyle=0; NumberOfPartitions=0; UniqueId="GUID1"; Path=$sampleDiskPath })
    Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached=$true; Number=2; ImagePath=$sampleImgPath }) -AllDisks $nullProp
} -ExpectedSubstring "BusType property is null" -TestName "Test 8: Null BusType abort"

Assert-Throws -Script {
    $nullProp = @([PSCustomObject]@{ Number=2; BusType=15; IsSystem=$null; IsBoot=$false; PartitionStyle=0; NumberOfPartitions=0; UniqueId="GUID1"; Path=$sampleDiskPath })
    Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached=$true; Number=2; ImagePath=$sampleImgPath }) -AllDisks $nullProp
} -ExpectedSubstring "IsSystem property is null" -TestName "Test 9: Null IsSystem abort"

Assert-Throws -Script {
    $nullProp = @([PSCustomObject]@{ Number=2; BusType=15; IsSystem=$false; IsBoot=$null; PartitionStyle=0; NumberOfPartitions=0; UniqueId="GUID1"; Path=$sampleDiskPath })
    Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached=$true; Number=2; ImagePath=$sampleImgPath }) -AllDisks $nullProp
} -ExpectedSubstring "IsBoot property is null" -TestName "Test 10: Null IsBoot abort"

Assert-Throws -Script {
    $nullProp = @([PSCustomObject]@{ Number=2; BusType=15; IsSystem=$false; IsBoot=$false; PartitionStyle=$null; NumberOfPartitions=0; UniqueId="GUID1"; Path=$sampleDiskPath })
    Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached=$true; Number=2; ImagePath=$sampleImgPath }) -AllDisks $nullProp
} -ExpectedSubstring "PartitionStyle property is null" -TestName "Test 11: Null PartitionStyle abort"

Assert-Throws -Script {
    $nullProp = @([PSCustomObject]@{ Number=2; BusType=15; IsSystem=$false; IsBoot=$false; PartitionStyle=0; NumberOfPartitions=0; UniqueId=""; Path=$sampleDiskPath })
    Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached=$true; Number=2; ImagePath=$sampleImgPath }) -AllDisks $nullProp
} -ExpectedSubstring "UniqueId is null or empty" -TestName "Test 12: Empty UniqueId abort"

Assert-Throws -Script {
    $nullProp = @([PSCustomObject]@{ Number=2; BusType=15; IsSystem=$false; IsBoot=$false; PartitionStyle=0; NumberOfPartitions=0; UniqueId="GUID1"; Path="" })
    Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached=$true; Number=2; ImagePath=$sampleImgPath }) -AllDisks $nullProp
} -ExpectedSubstring "Path is null or empty" -TestName "Test 13: Empty Path abort"

# 4. BusType Rejection & Acceptance (Official Spec: 14 = Virtual, 15 = File Backed Virtual)
Assert-Throws -Script {
    $bus14 = @([PSCustomObject]@{ Number=2; BusType=14; IsSystem=$false; IsBoot=$false; PartitionStyle=0; NumberOfPartitions=0; UniqueId="GUID1"; Path=$sampleDiskPath })
    Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached=$true; Number=2; ImagePath=$sampleImgPath }) -AllDisks $bus14
} -ExpectedSubstring "Expected 15 (File Backed Virtual)" -TestName "Test 14: BusType=14 rejection abort"

Assert-Throws -Script {
    $busSata = @([PSCustomObject]@{ Number=2; BusType=11; IsSystem=$false; IsBoot=$false; PartitionStyle=0; NumberOfPartitions=0; UniqueId="GUID1"; Path=$sampleDiskPath })
    Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached=$true; Number=2; ImagePath=$sampleImgPath }) -AllDisks $busSata
} -ExpectedSubstring "Expected 15 (File Backed Virtual)" -TestName "Test 15: BusType=11 (SATA/NVMe) rejection abort"

# 5. System, Boot, Pre-formatted and Pre-existing Partition Safety
Assert-Throws -Script {
    $sys = @([PSCustomObject]@{ Number=2; BusType=15; IsSystem=$true; IsBoot=$false; PartitionStyle=0; NumberOfPartitions=0; UniqueId="GUID1"; Path=$sampleDiskPath })
    Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached=$true; Number=2; ImagePath=$sampleImgPath }) -AllDisks $sys
} -ExpectedSubstring "IsSystem == True" -TestName "Test 16: IsSystem==True abort"

Assert-Throws -Script {
    $boot = @([PSCustomObject]@{ Number=2; BusType=15; IsSystem=$false; IsBoot=$true; PartitionStyle=0; NumberOfPartitions=0; UniqueId="GUID1"; Path=$sampleDiskPath })
    Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached=$true; Number=2; ImagePath=$sampleImgPath }) -AllDisks $boot
} -ExpectedSubstring "IsBoot == True" -TestName "Test 17: IsBoot==True abort"

Assert-Throws -Script {
    $gpt = @([PSCustomObject]@{ Number=2; BusType=15; IsSystem=$false; IsBoot=$false; PartitionStyle=2; NumberOfPartitions=0; UniqueId="GUID1"; Path=$sampleDiskPath })
    Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached=$true; Number=2; ImagePath=$sampleImgPath }) -AllDisks $gpt
} -ExpectedSubstring "Expected 0 (RAW)" -TestName "Test 18: PartitionStyle!=RAW abort"

Assert-Throws -Script {
    $part = @([PSCustomObject]@{ Number=2; BusType=15; IsSystem=$false; IsBoot=$false; PartitionStyle=0; NumberOfPartitions=1; UniqueId="GUID1"; Path=$sampleDiskPath })
    Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached=$true; Number=2; ImagePath=$sampleImgPath }) -AllDisks $part
} -ExpectedSubstring "NumberOfPartitions == 1. Expected 0" -TestName "Test 19: NumberOfPartitions>0 abort"

# 6. Valid Clean File-Backed Virtual Disk (BusType=15) Success
Assert-Succeeds -Script {
    $valid = @([PSCustomObject]@{ Number=2; BusType=15; IsSystem=$false; IsBoot=$false; PartitionStyle=0; NumberOfPartitions=0; UniqueId="VALID_VHDX_UID"; Path=$sampleDiskPath })
    $res = Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached=$true; Number=2; ImagePath=$sampleImgPath }) -AllDisks $valid -ExpectedImagePath $sampleImgPath
    if ($res.Number -ne 2 -or $res.UniqueId -ne "VALID_VHDX_UID" -or $res.Path -ne $sampleDiskPath) { throw "Result mismatch" }
} -TestName "Test 20: Valid clean RAW virtual disk (BusType=15 numeric) PASS"

# 7. ETS ScriptProperty Representation Tests (Real Storage Module Provider Representation)
Assert-Throws -Script {
    $busVirtualStr = @([PSCustomObject]@{ Number=2; BusType="Virtual"; IsSystem=$false; IsBoot=$false; PartitionStyle=0; NumberOfPartitions=0; UniqueId="GUID1"; Path=$sampleDiskPath })
    Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached=$true; Number=2; ImagePath=$sampleImgPath }) -AllDisks $busVirtualStr
} -ExpectedSubstring "Target disk BusType is Virtual (14)" -TestName "Test 20a: BusType='Virtual' string rejection abort"

Assert-Throws -Script {
    $busSataStr = @([PSCustomObject]@{ Number=2; BusType="SATA"; IsSystem=$false; IsBoot=$false; PartitionStyle="RAW"; NumberOfPartitions=0; UniqueId="GUID1"; Path=$sampleDiskPath })
    Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached=$true; Number=2; ImagePath=$sampleImgPath }) -AllDisks $busSataStr
} -ExpectedSubstring "Expected 15 (File Backed Virtual)" -TestName "Test 20b: BusType='SATA' string rejection abort"

Assert-Throws -Script {
    $partGptStr = @([PSCustomObject]@{ Number=2; BusType="File Backed Virtual"; IsSystem=$false; IsBoot=$false; PartitionStyle="GPT"; NumberOfPartitions=0; UniqueId="GUID1"; Path=$sampleDiskPath })
    Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached=$true; Number=2; ImagePath=$sampleImgPath }) -AllDisks $partGptStr
} -ExpectedSubstring "Expected 0 (RAW)" -TestName "Test 20c: PartitionStyle='GPT' string rejection abort"

Assert-Throws -Script {
    $partMbrStr = @([PSCustomObject]@{ Number=2; BusType=15; IsSystem=$false; IsBoot=$false; PartitionStyle="MBR"; NumberOfPartitions=0; UniqueId="GUID1"; Path=$sampleDiskPath })
    Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached=$true; Number=2; ImagePath=$sampleImgPath }) -AllDisks $partMbrStr
} -ExpectedSubstring "Expected 0 (RAW)" -TestName "Test 20d: PartitionStyle='MBR' string rejection abort"

Assert-Succeeds -Script {
    $validEts = @([PSCustomObject]@{ Number=2; BusType="File Backed Virtual"; IsSystem=$false; IsBoot=$false; PartitionStyle="RAW"; NumberOfPartitions=0; UniqueId="VALID_VHDX_UID_ETS"; Path=$sampleDiskPath })
    $res = Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached=$true; Number=2; ImagePath=$sampleImgPath }) -AllDisks $validEts -ExpectedImagePath $sampleImgPath
    if ($res.Number -ne 2 -or $res.UniqueId -ne "VALID_VHDX_UID_ETS" -or $res.Path -ne $sampleDiskPath) { throw "Result mismatch" }
} -TestName "Test 20e: Valid clean RAW virtual disk (BusType='File Backed Virtual', PartitionStyle='RAW') PASS"

# --- SECTION 2: Test-PreFormatIdentityMatch Pre-Format Identity Re-Verification Tests ---
Write-Host "`n--- Section 2: Pre-Format Identity Re-Verification & Format Counter Tests ---"

$initialVerifiedDisk = [PSCustomObject]@{
    Number = 2
    UniqueId = "VERIFIED_VHDX_UID_12345"
    Path = $sampleDiskPath
    BusType = 15
    IsSystem = $false
    IsBoot = $false
    PartitionStyle = 0
    NumberOfPartitions = 0
}

# Test 21: Pre-format Disk Number mismatch abort (Format executed count = 0)
$formatExecuted21 = 0
Assert-Throws -Script {
    $currImg = [PSCustomObject]@{ Attached=$true; Number=3; ImagePath=$sampleImgPath }
    $currDisks = @([PSCustomObject]@{ Number=3; BusType=15; IsSystem=$false; IsBoot=$false; PartitionStyle=0; NumberOfPartitions=0; UniqueId="VERIFIED_VHDX_UID_12345"; Path=$sampleDiskPath })
    Test-PreFormatIdentityMatch -InitialDisk $initialVerifiedDisk -CurrentDiskImage $currImg -CurrentAllDisks $currDisks -ExpectedImagePath $sampleImgPath
    $formatExecuted21++
} -ExpectedSubstring "Pre-format Disk Number mismatch" -TestName "Test 21: Pre-format Disk Number mismatch abort (Format count=0)"
if ($formatExecuted21 -ne 0) { throw "CRITICAL TEST FAILURE: Format operation was executed on mismatch!" }

# Test 22: Pre-format UniqueId mismatch abort (Format executed count = 0)
$formatExecuted22 = 0
Assert-Throws -Script {
    $currImg = [PSCustomObject]@{ Attached=$true; Number=2; ImagePath=$sampleImgPath }
    $currDisks = @([PSCustomObject]@{ Number=2; BusType=15; IsSystem=$false; IsBoot=$false; PartitionStyle=0; NumberOfPartitions=0; UniqueId="TAMPERED_UID_99999"; Path=$sampleDiskPath })
    Test-PreFormatIdentityMatch -InitialDisk $initialVerifiedDisk -CurrentDiskImage $currImg -CurrentAllDisks $currDisks -ExpectedImagePath $sampleImgPath
    $formatExecuted22++
} -ExpectedSubstring "Pre-format Disk UniqueId mismatch" -TestName "Test 22: Pre-format UniqueId mismatch abort (Format count=0)"
if ($formatExecuted22 -ne 0) { throw "CRITICAL TEST FAILURE: Format operation was executed on mismatch!" }

# Test 23: Pre-format Path mismatch abort (Format executed count = 0)
$formatExecuted23 = 0
Assert-Throws -Script {
    $currImg = [PSCustomObject]@{ Attached=$true; Number=2; ImagePath=$sampleImgPath }
    $currDisks = @([PSCustomObject]@{ Number=2; BusType=15; IsSystem=$false; IsBoot=$false; PartitionStyle=0; NumberOfPartitions=0; UniqueId="VERIFIED_VHDX_UID_12345"; Path="\\?\scsi#other_path#000002" })
    Test-PreFormatIdentityMatch -InitialDisk $initialVerifiedDisk -CurrentDiskImage $currImg -CurrentAllDisks $currDisks -ExpectedImagePath $sampleImgPath
    $formatExecuted23++
} -ExpectedSubstring "Pre-format Disk Path mismatch" -TestName "Test 23: Pre-format Path mismatch abort (Format count=0)"
if ($formatExecuted23 -ne 0) { throw "CRITICAL TEST FAILURE: Format operation was executed on mismatch!" }

# Test 24: Pre-format re-query mutated state (PartitionStyle!=0) abort (Format executed count = 0)
$formatExecuted24 = 0
Assert-Throws -Script {
    $currImg = [PSCustomObject]@{ Attached=$true; Number=2; ImagePath=$sampleImgPath }
    $currDisks = @([PSCustomObject]@{ Number=2; BusType=15; IsSystem=$false; IsBoot=$false; PartitionStyle=2; NumberOfPartitions=0; UniqueId="VERIFIED_VHDX_UID_12345"; Path=$sampleDiskPath })
    Test-PreFormatIdentityMatch -InitialDisk $initialVerifiedDisk -CurrentDiskImage $currImg -CurrentAllDisks $currDisks -ExpectedImagePath $sampleImgPath
    $formatExecuted24++
} -ExpectedSubstring "Expected 0 (RAW)" -TestName "Test 24: Pre-format state mutation to GPT abort (Format count=0)"
if ($formatExecuted24 -ne 0) { throw "CRITICAL TEST FAILURE: Format operation was executed on state mutation!" }

# Test 25: Pre-format re-query mutated state (IsSystem==True) abort (Format executed count = 0)
$formatExecuted25 = 0
Assert-Throws -Script {
    $currImg = [PSCustomObject]@{ Attached=$true; Number=2; ImagePath=$sampleImgPath }
    $currDisks = @([PSCustomObject]@{ Number=2; BusType=15; IsSystem=$true; IsBoot=$false; PartitionStyle=0; NumberOfPartitions=0; UniqueId="VERIFIED_VHDX_UID_12345"; Path=$sampleDiskPath })
    Test-PreFormatIdentityMatch -InitialDisk $initialVerifiedDisk -CurrentDiskImage $currImg -CurrentAllDisks $currDisks -ExpectedImagePath $sampleImgPath
    $formatExecuted25++
} -ExpectedSubstring "IsSystem == True" -TestName "Test 25: Pre-format state mutation to IsSystem abort (Format count=0)"
if ($formatExecuted25 -ne 0) { throw "CRITICAL TEST FAILURE: Format operation was executed on system disk!" }

# Test 26: Pre-format matching identity PASS (Format executed count = 1)
$formatExecuted26 = 0
Assert-Succeeds -Script {
    $currImg = [PSCustomObject]@{ Attached=$true; Number=2; ImagePath=$sampleImgPath }
    $currDisks = @([PSCustomObject]@{ Number=2; BusType=15; IsSystem=$false; IsBoot=$false; PartitionStyle=0; NumberOfPartitions=0; UniqueId="VERIFIED_VHDX_UID_12345"; Path=$sampleDiskPath })
    $reverified = Test-PreFormatIdentityMatch -InitialDisk $initialVerifiedDisk -CurrentDiskImage $currImg -CurrentAllDisks $currDisks -ExpectedImagePath $sampleImgPath
    if ($reverified.Number -ne 2) { throw "Number mismatch" }
    $script:formatExecuted26++
} -TestName "Test 26: Pre-format matching identity PASS (Format count=1)"
if ($formatExecuted26 -ne 1) { throw "CRITICAL TEST FAILURE: Expected format count of 1 on valid verification!" }

# --- SECTION 3: Test-ObservedDetachState Detach Observation Tests ---
Write-Host "`n--- Section 3: Observed Detach State & Detach Counter Tests ---"

# Test 27: Detach observation with null query output abort (Detach success count = 0)
$detachSuccess27 = 0
Assert-Throws -Script {
    Test-ObservedDetachState -DiskImageQueryOutput $null
    $script:detachSuccess27++
} -ExpectedSubstring "Query returned null" -TestName "Test 27: Detach query null abort (Detach count=0)"
if ($detachSuccess27 -ne 0) { throw "CRITICAL TEST FAILURE: Detach was reported successful on null query!" }

# Test 28: Detach observation with Attached=$null abort (Detach success count = 0)
$detachSuccess28 = 0
Assert-Throws -Script {
    Test-ObservedDetachState -DiskImageQueryOutput ([PSCustomObject]@{ Attached = $null })
    $script:detachSuccess28++
} -ExpectedSubstring "Image Attached property is null" -TestName "Test 28: Detach query Attached=null abort (Detach count=0)"
if ($detachSuccess28 -ne 0) { throw "CRITICAL TEST FAILURE: Detach was reported successful on null Attached property!" }

# Test 29: Detach observation with Attached=$true abort (Detach success count = 0)
$detachSuccess29 = 0
Assert-Throws -Script {
    Test-ObservedDetachState -DiskImageQueryOutput ([PSCustomObject]@{ Attached = $true })
    $script:detachSuccess29++
} -ExpectedSubstring "Image is STILL ATTACHED" -TestName "Test 29: Detach query Attached=True abort (Detach count=0)"
if ($detachSuccess29 -ne 0) { throw "CRITICAL TEST FAILURE: Detach was reported successful while still attached!" }

# Test 30: Detach observation with ambiguous Attached value abort (Detach success count = 0)
$detachSuccess30 = 0
Assert-Throws -Script {
    Test-ObservedDetachState -DiskImageQueryOutput ([PSCustomObject]@{ Attached = "UNKNOWN" })
    $script:detachSuccess30++
} -ExpectedSubstring "Image Attached property is ambiguous or not False" -TestName "Test 30: Detach query Attached='UNKNOWN' abort (Detach count=0)"
if ($detachSuccess30 -ne 0) { throw "CRITICAL TEST FAILURE: Detach was reported successful on ambiguous status!" }

# Test 31: Detach observation with explicitly observed Attached=$false PASS (Detach success count = 1)
$detachSuccess31 = 0
Assert-Succeeds -Script {
    $observed = Test-ObservedDetachState -DiskImageQueryOutput ([PSCustomObject]@{ Attached = $false })
    if ($observed -ne $true) { throw "Observed result not true" }
    $script:detachSuccess31++
} -TestName "Test 31: Explicitly observed Attached=False PASS (Detach count=1)"
if ($detachSuccess31 -ne 1) { throw "CRITICAL TEST FAILURE: Expected detach success count of 1 on valid detach!" }

# --- SECTION 4: Test-TargetVolumeCorrespondence Volume Correspondence Tests ---
Write-Host "`n--- Section 4: Target Volume Correspondence Tests ---"

# Test 32: Volume correspondence disk number mismatch abort
Assert-Throws -Script {
    $mockPart = [PSCustomObject]@{ DiskNumber = 0; DriveLetter = "X" }
    $mockVol = [PSCustomObject]@{ FileSystem = "NTFS"; FileSystemLabel = "CHROMIUM_BUILD" }
    Test-TargetVolumeCorrespondence -TargetLetter "X" -VerifiedDiskNumber 2 -MockPartition $mockPart -MockVolume $mockVol
} -ExpectedSubstring "belongs to Disk 0, NOT verified Disk 2" -TestName "Test 32: Volume correspondence disk number mismatch abort"

# Test 33: Volume correspondence filesystem mismatch abort
Assert-Throws -Script {
    $mockPart = [PSCustomObject]@{ DiskNumber = 2; DriveLetter = "X" }
    $mockVol = [PSCustomObject]@{ FileSystem = "FAT32"; FileSystemLabel = "CHROMIUM_BUILD" }
    Test-TargetVolumeCorrespondence -TargetLetter "X" -VerifiedDiskNumber 2 -MockPartition $mockPart -MockVolume $mockVol
} -ExpectedSubstring "attributes do not match NTFS" -TestName "Test 33: Volume filesystem mismatch abort"

# Test 34: Valid volume correspondence PASS
Assert-Succeeds -Script {
    $mockPart = [PSCustomObject]@{ DiskNumber = 2; DriveLetter = "X" }
    $mockVol = [PSCustomObject]@{ FileSystem = "NTFS"; FileSystemLabel = "CHROMIUM_BUILD" }
    Test-TargetVolumeCorrespondence -TargetLetter "X" -VerifiedDiskNumber 2 -MockPartition $mockPart -MockVolume $mockVol
} -TestName "Test 34: Valid volume correspondence PASS"

Write-Host "`n=== UNIT TEST SUITE SUMMARY ==="
Write-Host "Total Executed: $executedCount"
Write-Host "Total Passed:   $passedCount"
Write-Host "Total Failed:   $failedCount"

if ($failedCount -gt 0) {
    throw "UNIT TEST SUITE FAILED with $failedCount failures."
}

Write-Host "=== END OF UNIT TEST SUITE: ALL $executedCount TESTS PASSED ==="

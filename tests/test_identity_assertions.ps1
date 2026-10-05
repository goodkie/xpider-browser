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

# 8. Type Safety Assertions (Implicit conversion / Bool / Array rejection)
Assert-Throws -Script {
    $boolBus = @([PSCustomObject]@{ Number=2; BusType=$true; IsSystem=$false; IsBoot=$false; PartitionStyle=0; NumberOfPartitions=0; UniqueId="GUID1"; Path=$sampleDiskPath })
    Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached=$true; Number=2; ImagePath=$sampleImgPath }) -AllDisks $boolBus
} -ExpectedSubstring "BusType has invalid type" -TestName "Test 20f: BusType=Boolean abort"

Assert-Throws -Script {
    $arrPart = @([PSCustomObject]@{ Number=2; BusType=15; IsSystem=$false; IsBoot=$false; PartitionStyle=@(0); NumberOfPartitions=0; UniqueId="GUID1"; Path=$sampleDiskPath })
    Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached=$true; Number=2; ImagePath=$sampleImgPath }) -AllDisks $arrPart
} -ExpectedSubstring "PartitionStyle has invalid type" -TestName "Test 20g: PartitionStyle=Array abort"

# 9. Real CIM Provider Representation & Conflict Rejection Tests (CimInstanceProperties)
function New-MockCimDisk {
    param(
        $Number=2,
        $BusType="File Backed Virtual",
        $RawBusType=15,
        $PartitionStyle="RAW",
        $RawPartitionStyle=0,
        $UniqueId="VALID_CIM_UID",
        [switch]$OmitBusType,
        [switch]$OmitPartitionStyle
    )
    $d = [PSCustomObject]@{
        Number = $Number
        BusType = $BusType
        PartitionStyle = $PartitionStyle
        IsSystem = $false
        IsBoot = $false
        NumberOfPartitions = 0
        UniqueId = $UniqueId
        Path = $sampleDiskPath
    }
    $props = @{}
    if (-not $OmitBusType) {
        $props['BusType'] = [PSCustomObject]@{ Value = $RawBusType }
    }
    if (-not $OmitPartitionStyle) {
        $props['PartitionStyle'] = [PSCustomObject]@{ Value = $RawPartitionStyle }
    }
    Add-Member -InputObject $d -NotePropertyName "CimInstanceProperties" -NotePropertyValue $props -Force
    return $d
}

Assert-Succeeds -Script {
    $cimValid = @(New-MockCimDisk -RawBusType 15 -BusType "File Backed Virtual" -RawPartitionStyle 0 -PartitionStyle "RAW")
    $res = Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached=$true; Number=2; ImagePath=$sampleImgPath }) -AllDisks $cimValid -ExpectedImagePath $sampleImgPath
    if ($res.Number -ne 2 -or $res.UniqueId -ne "VALID_CIM_UID") { throw "Result mismatch" }
} -TestName "Test 20h: Valid CIM instance with matching raw properties PASS"

Assert-Throws -Script {
    $cimBusConflict1 = @(New-MockCimDisk -RawBusType 11 -BusType "File Backed Virtual")
    Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached=$true; Number=2; ImagePath=$sampleImgPath }) -AllDisks $cimBusConflict1
} -ExpectedSubstring "Expected 15 (File Backed Virtual)" -TestName "Test 20i: Conflict raw BusType=11 + display='File Backed Virtual' abort"

Assert-Throws -Script {
    $cimBusConflict2 = @(New-MockCimDisk -RawBusType 15 -BusType "SATA")
    Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached=$true; Number=2; ImagePath=$sampleImgPath }) -AllDisks $cimBusConflict2
} -ExpectedSubstring "BusType expression conflict" -TestName "Test 20j: Conflict raw BusType=15 + display='SATA' abort"

Assert-Throws -Script {
    $cimBusNull = @(New-MockCimDisk -RawBusType $null -BusType "File Backed Virtual")
    Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached=$true; Number=2; ImagePath=$sampleImgPath }) -AllDisks $cimBusNull
} -ExpectedSubstring "Raw CIM BusType property is null/unknown" -TestName "Test 20k: Null raw CIM BusType abort (no display fallback)"

Assert-Throws -Script {
    $cimBus14 = @(New-MockCimDisk -RawBusType 14 -BusType "Virtual")
    Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached=$true; Number=2; ImagePath=$sampleImgPath }) -AllDisks $cimBus14
} -ExpectedSubstring "Target disk BusType is Virtual (14)" -TestName "Test 20l: Raw CIM BusType=14 (Virtual) rejection abort"

Assert-Throws -Script {
    $cimPartConflict1 = @(New-MockCimDisk -RawPartitionStyle 2 -PartitionStyle "RAW")
    Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached=$true; Number=2; ImagePath=$sampleImgPath }) -AllDisks $cimPartConflict1
} -ExpectedSubstring "Pre-formatted disk detected" -TestName "Test 20m: Conflict raw PartitionStyle=2 (GPT) + display='RAW' abort"

Assert-Throws -Script {
    $cimPartConflict2 = @(New-MockCimDisk -RawPartitionStyle 0 -PartitionStyle "GPT")
    Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached=$true; Number=2; ImagePath=$sampleImgPath }) -AllDisks $cimPartConflict2
} -ExpectedSubstring "PartitionStyle expression conflict" -TestName "Test 20n: Conflict raw PartitionStyle=0 + display='GPT' abort"

Assert-Throws -Script {
    $cimPartNull = @(New-MockCimDisk -RawPartitionStyle $null -PartitionStyle "RAW")
    Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached=$true; Number=2; ImagePath=$sampleImgPath }) -AllDisks $cimPartNull
} -ExpectedSubstring "Raw CIM PartitionStyle property is null/unknown" -TestName "Test 20o: Null raw CIM PartitionStyle abort (no display fallback)"

Assert-Throws -Script {
    $cimRawBool = @(New-MockCimDisk -RawBusType $true -BusType "File Backed Virtual")
    Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached=$true; Number=2; ImagePath=$sampleImgPath }) -AllDisks $cimRawBool
} -ExpectedSubstring "Raw CIM BusType has invalid non-integer type" -TestName "Test 20p: Raw CIM BusType=Boolean abort"

Assert-Throws -Script {
    $cimRawPartBool = @(New-MockCimDisk -RawPartitionStyle $true -PartitionStyle "RAW")
    Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached=$true; Number=2; ImagePath=$sampleImgPath }) -AllDisks $cimRawPartBool
} -ExpectedSubstring "Raw CIM PartitionStyle has invalid non-integer type" -TestName "Test 20q: Raw CIM PartitionStyle=Boolean abort"

# 10. Strict Integer Whitelist & Non-Integer Type Safety Tests
Assert-Succeeds -Script {
    $uintMock = @([PSCustomObject]@{ Number=2; BusType=[uint16]15; IsSystem=$false; IsBoot=$false; PartitionStyle=[uint16]0; NumberOfPartitions=0; UniqueId="UINT16_VALID"; Path=$sampleDiskPath })
    $res = Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached=$true; Number=2; ImagePath=$sampleImgPath }) -AllDisks $uintMock -ExpectedImagePath $sampleImgPath
    if ($res.Number -ne 2) { throw "Result mismatch" }
} -TestName "Test 20r: Mock UInt16 15/0 integer validation PASS"

Assert-Throws -Script {
    $floatMock = @([PSCustomObject]@{ Number=2; BusType=[double]15.0; IsSystem=$false; IsBoot=$false; PartitionStyle=0; NumberOfPartitions=0; UniqueId="GUID1"; Path=$sampleDiskPath })
    if ($floatMock[0].BusType.GetType().FullName -ne "System.Double") {
        throw "Fixture assertion failure: BusType is not System.Double (actual: $($floatMock[0].BusType.GetType().FullName))"
    }
    Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached=$true; Number=2; ImagePath=$sampleImgPath }) -AllDisks $floatMock
} -ExpectedSubstring "BusType has invalid non-integer" -TestName "Test 20s: Mock BusType=Double (15.0) rejection abort"

Assert-Throws -Script {
    $decMock = @([PSCustomObject]@{ Number=2; BusType=[decimal]15; IsSystem=$false; IsBoot=$false; PartitionStyle=0; NumberOfPartitions=0; UniqueId="GUID1"; Path=$sampleDiskPath })
    if ($decMock[0].BusType.GetType().FullName -ne "System.Decimal") {
        throw "Fixture assertion failure: BusType is not System.Decimal (actual: $($decMock[0].BusType.GetType().FullName))"
    }
    Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached=$true; Number=2; ImagePath=$sampleImgPath }) -AllDisks $decMock
} -ExpectedSubstring "BusType has invalid non-integer" -TestName "Test 20t: Mock BusType=Decimal (15) rejection abort"

Assert-Throws -Script {
    $floatPartMock = @([PSCustomObject]@{ Number=2; BusType=15; IsSystem=$false; IsBoot=$false; PartitionStyle=[double]0.0; NumberOfPartitions=0; UniqueId="GUID1"; Path=$sampleDiskPath })
    if ($floatPartMock[0].PartitionStyle.GetType().FullName -ne "System.Double") {
        throw "Fixture assertion failure: PartitionStyle is not System.Double (actual: $($floatPartMock[0].PartitionStyle.GetType().FullName))"
    }
    Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached=$true; Number=2; ImagePath=$sampleImgPath }) -AllDisks $floatPartMock
} -ExpectedSubstring "PartitionStyle has invalid non-integer" -TestName "Test 20u: Mock PartitionStyle=Double (0.0) rejection abort"

Assert-Throws -Script {
    $decPartMock = @([PSCustomObject]@{ Number=2; BusType=15; IsSystem=$false; IsBoot=$false; PartitionStyle=[decimal]0; NumberOfPartitions=0; UniqueId="GUID1"; Path=$sampleDiskPath })
    if ($decPartMock[0].PartitionStyle.GetType().FullName -ne "System.Decimal") {
        throw "Fixture assertion failure: PartitionStyle is not System.Decimal (actual: $($decPartMock[0].PartitionStyle.GetType().FullName))"
    }
    Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached=$true; Number=2; ImagePath=$sampleImgPath }) -AllDisks $decPartMock
} -ExpectedSubstring "PartitionStyle has invalid non-integer" -TestName "Test 20v: Mock PartitionStyle=Decimal (0) rejection abort"

Assert-Throws -Script {
    $cimRawFloat = @(New-MockCimDisk -RawBusType ([double]15.0) -BusType "File Backed Virtual")
    if ($cimRawFloat[0].CimInstanceProperties['BusType'].Value.GetType().FullName -ne "System.Double") {
        throw "Fixture assertion failure: CimInstanceProperties['BusType'].Value is not System.Double (actual: $($cimRawFloat[0].CimInstanceProperties['BusType'].Value.GetType().FullName))"
    }
    Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached=$true; Number=2; ImagePath=$sampleImgPath }) -AllDisks $cimRawFloat
} -ExpectedSubstring "Raw CIM BusType has invalid non-integer type" -TestName "Test 20w: CIM raw BusType=Double (15.0) rejection abort"

Assert-Throws -Script {
    $cimRawDec = @(New-MockCimDisk -RawBusType ([decimal]15) -BusType "File Backed Virtual")
    if ($cimRawDec[0].CimInstanceProperties['BusType'].Value.GetType().FullName -ne "System.Decimal") {
        throw "Fixture assertion failure: CimInstanceProperties['BusType'].Value is not System.Decimal (actual: $($cimRawDec[0].CimInstanceProperties['BusType'].Value.GetType().FullName))"
    }
    Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached=$true; Number=2; ImagePath=$sampleImgPath }) -AllDisks $cimRawDec
} -ExpectedSubstring "Raw CIM BusType has invalid non-integer type" -TestName "Test 20x: CIM raw BusType=Decimal (15) rejection abort"

Assert-Throws -Script {
    $cimRawPartFloat = @(New-MockCimDisk -RawPartitionStyle ([double]0.0) -PartitionStyle "RAW")
    if ($cimRawPartFloat[0].CimInstanceProperties['PartitionStyle'].Value.GetType().FullName -ne "System.Double") {
        throw "Fixture assertion failure: CimInstanceProperties['PartitionStyle'].Value is not System.Double (actual: $($cimRawPartFloat[0].CimInstanceProperties['PartitionStyle'].Value.GetType().FullName))"
    }
    Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached=$true; Number=2; ImagePath=$sampleImgPath }) -AllDisks $cimRawPartFloat
} -ExpectedSubstring "Raw CIM PartitionStyle has invalid non-integer type" -TestName "Test 20y: CIM raw PartitionStyle=Double (0.0) rejection abort"

Assert-Throws -Script {
    $cimRawPartDec = @(New-MockCimDisk -RawPartitionStyle ([decimal]0) -PartitionStyle "RAW")
    if ($cimRawPartDec[0].CimInstanceProperties['PartitionStyle'].Value.GetType().FullName -ne "System.Decimal") {
        throw "Fixture assertion failure: CimInstanceProperties['PartitionStyle'].Value is not System.Decimal (actual: $($cimRawPartDec[0].CimInstanceProperties['PartitionStyle'].Value.GetType().FullName))"
    }
    Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached=$true; Number=2; ImagePath=$sampleImgPath }) -AllDisks $cimRawPartDec
} -ExpectedSubstring "Raw CIM PartitionStyle has invalid non-integer type" -TestName "Test 20z: CIM raw PartitionStyle=Decimal (0) rejection abort"

# 11. CIM Missing Property Rejection Tests (Refusing Fallback)
Assert-Throws -Script {
    $cimMissingPart = @(New-MockCimDisk -OmitPartitionStyle -BusType "File Backed Virtual" -RawBusType 15 -PartitionStyle "RAW")
    Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached=$true; Number=2; ImagePath=$sampleImgPath }) -AllDisks $cimMissingPart
} -ExpectedSubstring "Required raw CIM property 'PartitionStyle' is missing from CIM container. Refusing fallback." -TestName "Test 20aa: CIM object missing PartitionStyle abort (refusing fallback)"

Assert-Throws -Script {
    $cimMissingBus = @(New-MockCimDisk -OmitBusType -BusType "File Backed Virtual" -PartitionStyle "RAW" -RawPartitionStyle 0)
    Test-AttachedVirtualDiskIdentity -DiskImage ([PSCustomObject]@{ Attached=$true; Number=2; ImagePath=$sampleImgPath }) -AllDisks $cimMissingBus
} -ExpectedSubstring "Required raw CIM property 'BusType' is missing from CIM container. Refusing fallback." -TestName "Test 20ab: CIM object missing BusType abort (refusing fallback)"

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

# --- SECTION 5: Real Runner Observation Functions & Failure Harness Tests ---
Write-Host "`n--- Section 5: Real Runner Observation Functions & Failure Harness Tests ---"

# 1. Safely extract and load observation functions from tests/run_1gb_live_test_r2.ps1 via AST (zero execution of runner body)
$runnerScriptPath = Join-Path $PSScriptRoot "run_1gb_live_test_r2.ps1"
if (-not (Test-Path -LiteralPath $runnerScriptPath)) {
    throw "Target runner script not found at '$runnerScriptPath'"
}
$parserTokens = $null
$parserErrors = $null
$runnerAst = [System.Management.Automation.Language.Parser]::ParseFile($runnerScriptPath, [ref]$parserTokens, [ref]$parserErrors)
if ($parserErrors.Count -gt 0) {
    throw "Parser errors detected in runner script: $($parserErrors -join '; ')"
}

$functionAsts = $runnerAst.FindAll({ $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $true)
$requiredRunnerFunctions = @('Get-DriveXObservationStatus', 'Get-ImageAttachedObservationStatus', 'Get-VhdFileObservationStatus')
$loadedRunnerFunctions = @()
foreach ($fn in $functionAsts) {
    if ($fn.Name -in $requiredRunnerFunctions) {
        Invoke-Expression $fn.Extent.Text
        $loadedRunnerFunctions += $fn.Name
    }
}
if ($loadedRunnerFunctions.Count -ne 3) {
    throw "Failed to extract all 3 observation functions from $runnerScriptPath. Found: $($loadedRunnerFunctions -join ', ')"
}
Write-Host "  [INIT] AST successfully extracted runner observation functions: $($loadedRunnerFunctions -join ', ')"

# Test 35a: Real Get-DriveXObservationStatus with failing Get-PSDrive returns UNKNOWN
Assert-Succeeds -Script {
    function script:Get-PSDrive { throw "Simulated WMI/PSDrive provider failure" }
    try {
        $status = Get-DriveXObservationStatus
        if (-not ($status -like "UNKNOWN*")) { throw "Expected UNKNOWN status, got '$status'" }
        if (-not ($status -like "*Simulated WMI/PSDrive provider failure*")) { throw "Expected error message in UNKNOWN status, got '$status'" }
    } finally {
        Remove-Item function:Get-PSDrive -ErrorAction SilentlyContinue
    }
} -TestName "Test 35a: Real Get-DriveXObservationStatus error injection returns UNKNOWN PASS"

# Test 35b: Real Get-DriveXObservationStatus with no X: drive returns 'FREE / UNMOUNTED'
Assert-Succeeds -Script {
    function script:Get-PSDrive { return @([PSCustomObject]@{ Name="C"; Description="OS" }, [PSCustomObject]@{ Name="D"; Description="Data" }) }
    try {
        $status = Get-DriveXObservationStatus
        if ($status -ne "FREE / UNMOUNTED") { throw "Expected 'FREE / UNMOUNTED', got '$status'" }
    } finally {
        Remove-Item function:Get-PSDrive -ErrorAction SilentlyContinue
    }
} -TestName "Test 35b: Real Get-DriveXObservationStatus clean empty drive returns FREE / UNMOUNTED PASS"

# Test 35c: Real Get-DriveXObservationStatus with mounted X: drive returns 'STILL MOUNTED (...)'
Assert-Succeeds -Script {
    function script:Get-PSDrive { return @([PSCustomObject]@{ Name="X"; Description="BUILD_VOL" }) }
    try {
        $status = Get-DriveXObservationStatus
        if ($status -ne "STILL MOUNTED (BUILD_VOL)") { throw "Expected 'STILL MOUNTED (BUILD_VOL)', got '$status'" }
    } finally {
        Remove-Item function:Get-PSDrive -ErrorAction SilentlyContinue
    }
} -TestName "Test 35c: Real Get-DriveXObservationStatus mounted drive returns STILL MOUNTED PASS"

# Test 36a: Real Get-ImageAttachedObservationStatus with failing Get-DiskImage returns UNKNOWN
Assert-Succeeds -Script {
    function script:Get-DiskImage { param($ImagePath) throw "Simulated Storage Service timeout" }
    try {
        $status = Get-ImageAttachedObservationStatus -Path $sampleImgPath
        if (-not ($status -like "UNKNOWN*")) { throw "Expected UNKNOWN status, got '$status'" }
        if (-not ($status -like "*Simulated Storage Service timeout*")) { throw "Expected error message in UNKNOWN status, got '$status'" }
    } finally {
        Remove-Item function:Get-DiskImage -ErrorAction SilentlyContinue
    }
} -TestName "Test 36a: Real Get-ImageAttachedObservationStatus error injection returns UNKNOWN PASS"

# Test 36b: Real Get-ImageAttachedObservationStatus with Attached=False returns 'False'
Assert-Succeeds -Script {
    function script:Get-DiskImage { param($ImagePath) return [PSCustomObject]@{ Attached = $false } }
    try {
        $status = Get-ImageAttachedObservationStatus -Path $sampleImgPath
        if ($status -ne "False") { throw "Expected 'False', got '$status'" }
    } finally {
        Remove-Item function:Get-DiskImage -ErrorAction SilentlyContinue
    }
} -TestName "Test 36b: Real Get-ImageAttachedObservationStatus unattached returns 'False' PASS"

# Test 36c: Real Get-ImageAttachedObservationStatus with Attached=True returns 'True'
Assert-Succeeds -Script {
    function script:Get-DiskImage { param($ImagePath) return [PSCustomObject]@{ Attached = $true } }
    try {
        $status = Get-ImageAttachedObservationStatus -Path $sampleImgPath
        if ($status -ne "True") { throw "Expected 'True', got '$status'" }
    } finally {
        Remove-Item function:Get-DiskImage -ErrorAction SilentlyContinue
    }
} -TestName "Test 36c: Real Get-ImageAttachedObservationStatus attached returns 'True' PASS"

# Test 36d: Real Get-ImageAttachedObservationStatus with Attached=null returns UNKNOWN
Assert-Succeeds -Script {
    function script:Get-DiskImage { param($ImagePath) return [PSCustomObject]@{ Attached = $null } }
    try {
        $status = Get-ImageAttachedObservationStatus -Path $sampleImgPath
        if (-not ($status -like "UNKNOWN (Attached property is null)*")) { throw "Expected UNKNOWN on null Attached, got '$status'" }
    } finally {
        Remove-Item function:Get-DiskImage -ErrorAction SilentlyContinue
    }
} -TestName "Test 36d: Real Get-ImageAttachedObservationStatus Attached=null returns UNKNOWN PASS"

# Test 37a: Real Get-VhdFileObservationStatus with failing Test-Path returns UNKNOWN
Assert-Succeeds -Script {
    function script:Test-Path { param($LiteralPath) throw "Simulated filesystem access denied" }
    try {
        $status = Get-VhdFileObservationStatus -Path $sampleImgPath
        if (-not ($status -like "UNKNOWN*")) { throw "Expected UNKNOWN status, got '$status'" }
        if (-not ($status -like "*Simulated filesystem access denied*")) { throw "Expected error message in UNKNOWN status, got '$status'" }
    } finally {
        Remove-Item function:Test-Path -ErrorAction SilentlyContinue
    }
} -TestName "Test 37a: Real Get-VhdFileObservationStatus error injection returns UNKNOWN PASS"

# Test 37b: Real Get-VhdFileObservationStatus when file does not exist returns 'NOT FOUND'
Assert-Succeeds -Script {
    function script:Test-Path { param($LiteralPath) return $false }
    try {
        $status = Get-VhdFileObservationStatus -Path $sampleImgPath
        if ($status -ne "NOT FOUND") { throw "Expected 'NOT FOUND', got '$status'" }
    } finally {
        Remove-Item function:Test-Path -ErrorAction SilentlyContinue
    }
} -TestName "Test 37b: Real Get-VhdFileObservationStatus non-existent file returns 'NOT FOUND' PASS"

# Test 37c: Real Get-VhdFileObservationStatus when file exists returns 'EXISTS (Path: ..., Size: ...)'
Assert-Succeeds -Script {
    function script:Test-Path { param($LiteralPath) return $true }
    function script:Get-Item { param($LiteralPath) return [PSCustomObject]@{ Length = 4194304 } }
    try {
        $status = Get-VhdFileObservationStatus -Path $sampleImgPath
        if (-not ($status -like "EXISTS (Path: $sampleImgPath, Size: 4194304 bytes)*")) { throw "Expected EXISTS with size, got '$status'" }
    } finally {
        Remove-Item function:Test-Path -ErrorAction SilentlyContinue
        Remove-Item function:Get-Item -ErrorAction SilentlyContinue
    }
} -TestName "Test 37c: Real Get-VhdFileObservationStatus existing file returns EXISTS with size PASS"

# Test 38: File check error does NOT prevent subsequent Attached and Drive X observations
Assert-Succeeds -Script {
    function script:Test-Path { param($LiteralPath) throw "Simulated filesystem access denied" }
    function script:Get-DiskImage { param($ImagePath) return [PSCustomObject]@{ Attached = $false } }
    function script:Get-PSDrive { return @([PSCustomObject]@{ Name="C" }) }
    try {
        # Execute observation chain in identical sequence to runner post-failure catch block
        $vhdObs = Get-VhdFileObservationStatus -Path $sampleImgPath
        $imgObs = Get-ImageAttachedObservationStatus -Path $sampleImgPath
        $drvObs = Get-DriveXObservationStatus

        if (-not ($vhdObs -like "UNKNOWN*")) { throw "VhdStatus should be UNKNOWN, got: $vhdObs" }
        if ($imgObs -ne "False") { throw "ImageAttached should be 'False', got: $imgObs" }
        if ($drvObs -ne "FREE / UNMOUNTED") { throw "DriveX should be 'FREE / UNMOUNTED', got: $drvObs" }
    } finally {
        Remove-Item function:Test-Path -ErrorAction SilentlyContinue
        Remove-Item function:Get-DiskImage -ErrorAction SilentlyContinue
        Remove-Item function:Get-PSDrive -ErrorAction SilentlyContinue
    }
} -TestName "Test 38: File check failure does not prevent subsequent Attached and Drive X observations PASS"

# Test 39: Zero-mutation stubbed failure harness exits nonzero and suppresses PASS
Assert-Succeeds -Script {
    # Emulate runner's control flow with a stubbed child executor failing (exit code 1)
    $harnessScript = @'
        function Get-DriveXObservationStatus { return "FREE / UNMOUNTED" }
        function Get-ImageAttachedObservationStatus { param($Path) return "UNKNOWN (Query error: Simulated Storage Service timeout)" }
        function Get-VhdFileObservationStatus { param($Path) return "NOT FOUND" }

        try {
            $simulatedChildExit = 1
            if ($simulatedChildExit -ne 0) {
                throw "CRITICAL FAILURE: Step 1 setup/format/nonce returned non-zero exit code $simulatedChildExit. Halting without detach or deletion."
            }
            Write-Host "=== 1GB LIVE TEST COMPLETE: ALL STEPS VERIFIED PASS ==="
            exit 0
        } catch {
            Write-Host "[FATAL ERROR] 1GB Live Test Aborted / Failed:"
            Write-Host $_.Exception.Message
            Write-Host ">>> READ-ONLY POST-FAILURE STATE OBSERVATION <<<"
            Write-Host "VHDX File Status:        $(Get-VhdFileObservationStatus -Path 'dummy.vhdx')"
            Write-Host "Image Attached Status:   $(Get-ImageAttachedObservationStatus -Path 'dummy.vhdx')"
            Write-Host "Drive X: Status:         $(Get-DriveXObservationStatus)"
            Write-Host ">>> END OF OBSERVATION (No further mutation attempted) <<<"
            exit 1
        }
'@
    $tempHarnessPath = Join-Path $env:TEMP "runner_simulated_failure_harness.ps1"
    Set-Content -Path $tempHarnessPath -Value $harnessScript -Encoding UTF8
    try {
        $harnessOutput = & powershell -NoProfile -ExecutionPolicy Bypass -File $tempHarnessPath 2>&1
        $harnessExitCode = $LASTEXITCODE

        if ($harnessExitCode -ne 1) {
            throw "Harness exit code assertion failed: Expected 1, got $harnessExitCode"
        }
        $harnessText = $harnessOutput -join "`n"
        if ($harnessText -like "*ALL STEPS VERIFIED PASS*") {
            throw "Harness output assertion failed: PASS string unexpectedly emitted on failure"
        }
        if ($harnessText -notlike "*[FATAL ERROR]*") {
            throw "Harness output assertion failed: FATAL ERROR marker missing"
        }
        if ($harnessText -notlike "*>>> READ-ONLY POST-FAILURE STATE OBSERVATION <<<*") {
            throw "Harness output assertion failed: Read-only observation block missing"
        }
        if ($harnessText -notlike "*Image Attached Status:   UNKNOWN*") {
            throw "Harness output assertion failed: UNKNOWN image observation missing"
        }
        if ($harnessText -notlike "*Drive X: Status:         FREE / UNMOUNTED*") {
            throw "Harness output assertion failed: FREE / UNMOUNTED drive observation missing"
        }
    } finally {
        Remove-Item -LiteralPath $tempHarnessPath -ErrorAction SilentlyContinue
    }
} -TestName "Test 39: Zero-mutation stubbed failure harness exits nonzero and suppresses PASS"

Write-Host "`n=== UNIT TEST SUITE SUMMARY ==="
Write-Host "Total Executed: $executedCount"
Write-Host "Total Passed:   $passedCount"
Write-Host "Total Failed:   $failedCount"

if ($failedCount -gt 0) {
    throw "UNIT TEST SUITE FAILED with $failedCount failures."
}

Write-Host "=== END OF UNIT TEST SUITE: ALL $executedCount TESTS PASSED ==="

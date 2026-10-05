# [PROJECT]: Lite Chromium Portable
# [WORKSPACE ROOT]: E:\vivpr\ai\ebrowser
# [BOUND THREAD]: goodkie/v-show Issue #8
# [ISOLATION SANITY CHECK]: VERIFIED (Zero cross-project contamination)
#
# Win32 virtdisk.dll VHDX Creation Probe (Audited Implementation v2)
# - Strict C# struct alignment matching native CREATE_VIRTUAL_DISK_PARAMETERS Version 2
# - Abort if target file already exists prior to probe
# - Guaranteed cleanup and handle closure in try/finally
# - Strict exit code assertion: res == 0, magic == 'vhdxfile', cleanup == True

$ErrorActionPreference = "Stop"

$csharpCode = @'
using System;
using System.Runtime.InteropServices;

public class VHDProbeNativeV2 {
    [DllImport("virtdisk.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern int CreateVirtualDisk(
        ref VIRTUAL_STORAGE_TYPE VirtualStorageType,
        string Path,
        int VirtualDiskAccessMask,
        IntPtr SecurityDescriptor,
        int Flags,
        int ProviderSpecificFlags,
        ref CREATE_VIRTUAL_DISK_PARAMETERS Parameters,
        IntPtr Overlapped,
        ref IntPtr Handle
    );

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool CloseHandle(IntPtr hObject);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct VIRTUAL_STORAGE_TYPE {
        public int DeviceId; // 3 = VIRTUAL_STORAGE_TYPE_DEVICE_VHDX
        public Guid VendorId; // EC984AEC-A0F9-47e9-901F-71415A66345B (Microsoft)
    }

    // CREATE_VIRTUAL_DISK_PARAMETERS with Version 2 struct alignment
    [StructLayout(LayoutKind.Explicit, CharSet = CharSet.Unicode)]
    public struct CREATE_VIRTUAL_DISK_PARAMETERS {
        [FieldOffset(0)]
        public int Version; // 2 for VHDX

        // Union member: Version2
        [FieldOffset(8)]
        public Guid UniqueId;

        [FieldOffset(24)]
        public ulong MaximumSize;

        [FieldOffset(32)]
        public uint BlockSizeInBytes;

        [FieldOffset(36)]
        public uint SectorSizeInBytes;

        [FieldOffset(40)]
        public uint PhysicalSectorSizeInBytes;

        [FieldOffset(48)]
        public IntPtr ParentPath;

        [FieldOffset(56)]
        public IntPtr SourcePath;

        [FieldOffset(64)]
        public int OpenFlags; // 32-bit enum (OPEN_VIRTUAL_DISK_FLAG)

        [FieldOffset(68)]
        public VIRTUAL_STORAGE_TYPE ParentVirtualStorageType;

        [FieldOffset(88)]
        public VIRTUAL_STORAGE_TYPE SourceVirtualStorageType;

        [FieldOffset(108)]
        public Guid ResiliencyGuid;
    }
}
'@

Add-Type -TypeDefinition $csharpCode -ErrorAction Stop

# Official Microsoft VHDX Constants
$vst = New-Object VHDProbeNativeV2+VIRTUAL_STORAGE_TYPE
$vst.DeviceId = 3 # VIRTUAL_STORAGE_TYPE_DEVICE_VHDX
$vst.VendorId = [Guid]"EC984AEC-A0F9-47e9-901F-71415A66345B" # VIRTUAL_STORAGE_TYPE_VENDOR_MICROSOFT

$params = New-Object VHDProbeNativeV2+CREATE_VIRTUAL_DISK_PARAMETERS
$params.Version = 2 # CREATE_VIRTUAL_DISK_VERSION_2
$params.MaximumSize = 10485760 # 10MB minimal test payload
$params.SectorSizeInBytes = 512 # Standard sector size
$params.BlockSizeInBytes = 0 # Default block size
$params.PhysicalSectorSizeInBytes = 4096 # 4KB physical sector size
$params.OpenFlags = 0 # OPEN_VIRTUAL_DISK_FLAG_NONE

$testPath = "E:\vivpr\ai\ebrowser\probe_vhdx_audited.vhdx"

# Strict safety rule: ABORT if file already exists
if (Test-Path -LiteralPath $testPath) {
    throw "ABORT: Pre-existing probe file '$testPath' detected. Cannot proceed without clean isolation."
}

$handle = [IntPtr]::Zero
$created = $false
$fileSize = 0
$magic = ""
$cleanupSuccess = $false
$res = -1

if (-not [Environment]::Is64BitProcess) {
    throw "ABORT: Probe requires a 64-bit PowerShell process."
}

try {
    Write-Host "Invoking CreateVirtualDisk API (Native Struct Layout):"
    Write-Host "  Process Arch: $([Environment]::Is64BitProcess)"
    Write-Host "  DeviceId: $($vst.DeviceId) (VHDX)"
    Write-Host "  VendorId: $($vst.VendorId)"
    Write-Host "  ParamVersion: $($params.Version)"
    Write-Host "  SectorSize: $($params.SectorSizeInBytes)"
    Write-Host "  PhysicalSectorSize: $($params.PhysicalSectorSizeInBytes)"
    Write-Host "  TargetPath: $testPath"

    $res = [VHDProbeNativeV2]::CreateVirtualDisk([ref]$vst, $testPath, 0, [IntPtr]::Zero, 0, 0, [ref]$params, [IntPtr]::Zero, [ref]$handle)
    
    if ($res -eq 0 -and $handle -ne [IntPtr]::Zero -and (Test-Path -LiteralPath $testPath)) {
        $created = $true
        $fileSize = (Get-Item -LiteralPath $testPath).Length
        $bytes = [System.IO.File]::ReadAllBytes($testPath)
        if ($bytes.Length -ge 8) {
            $magic = [System.Text.Encoding]::ASCII.GetString($bytes[0..7])
        }
    }
} finally {
    if ($handle -ne [IntPtr]::Zero) {
        $closeOk = [VHDProbeNativeV2]::CloseHandle($handle)
        if (-not $closeOk) {
            Write-Warning "CloseHandle failed with error: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())"
        }
        $handle = [IntPtr]::Zero
    }
    # Only clean up if this specific execution created and verified ownership of the file
    if ($created -and (Test-Path -LiteralPath $testPath)) {
        try {
            Remove-Item -LiteralPath $testPath -Force -ErrorAction Stop
            $cleanupSuccess = -not (Test-Path -LiteralPath $testPath)
        } catch {
            $cleanupSuccess = $false
        }
    }
}

$report = [PSCustomObject]@{
    ProcessArch = if ([Environment]::Is64BitProcess) { "x64" } else { "x86" }
    DeviceId = $vst.DeviceId
    VendorId = $vst.VendorId.ToString()
    ParamVersion = $params.Version
    SectorSizeInBytes = $params.SectorSizeInBytes
    PhysicalSectorSizeInBytes = $params.PhysicalSectorSizeInBytes
    Win32ErrorCode = $res
    HexErrorCode = "0x$($res.ToString('X'))"
    FileCreated = $created
    FileSize = $fileSize
    HeaderMagic = $magic
    FileCleanedUp = $cleanupSuccess
}

$report | Format-List

# Strict Assertion Check
if ($res -ne 0) {
    throw "PROBE FAILED: CreateVirtualDisk returned Win32 error $res (0x$($res.ToString('X')))."
}
if ($magic -ne "vhdxfile") {
    throw "PROBE FAILED: Header magic mismatch. Expected 'vhdxfile', Got '$magic'."
}
if (-not $cleanupSuccess) {
    throw "PROBE FAILED: Probe artifact cleanup failed."
}

Write-Host "All VHDX Creation Probe Assertions PASSED."

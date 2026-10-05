# [PROJECT]: Lite Chromium Portable
# [WORKSPACE ROOT]: E:\vivpr\ai\ebrowser
# [BOUND THREAD]: goodkie/v-show Issue #8
# [ISOLATION SANITY CHECK]: VERIFIED (Zero cross-project contamination)
#
# Win32 virtdisk.dll VHDX Creation Probe (Audited Implementation)
# Strictly tests VHDX header creation on exFAT backing volume without elevation.
# Cleans up probe file immediately upon completion.

$code = @'
using System;
using System.Runtime.InteropServices;

public class VHDProbeAudited {
    [DllImport("virtdisk.dll", CharSet = CharSet.Unicode)]
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

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct CREATE_VIRTUAL_DISK_PARAMETERS {
        public int Version; // 2 for VHDX
        public Guid UniqueId;
        public ulong MaximumSize;
        public uint BlockSizeInBytes;
        public uint SectorSizeInBytes;
        public uint PhysicalSectorSizeInBytes;
        public IntPtr ParentPath;
        public IntPtr SourcePath;
        public IntPtr OpenFlags;
        public VIRTUAL_STORAGE_TYPE ParentVirtualStorageType;
        public VIRTUAL_STORAGE_TYPE SourceVirtualStorageType;
        public Guid ResiliencyGuid;
    }
}
'@

Add-Type -TypeDefinition $code -ErrorAction SilentlyContinue

# Official Microsoft VHDX Constants
$vst = New-Object VHDProbeAudited+VIRTUAL_STORAGE_TYPE
$vst.DeviceId = 3 # VIRTUAL_STORAGE_TYPE_DEVICE_VHDX
$vst.VendorId = [Guid]"EC984AEC-A0F9-47e9-901F-71415A66345B" # VIRTUAL_STORAGE_TYPE_VENDOR_MICROSOFT

$params = New-Object VHDProbeAudited+CREATE_VIRTUAL_DISK_PARAMETERS
$params.Version = 2 # CREATE_VIRTUAL_DISK_VERSION_2
$params.MaximumSize = 10485760 # 10MB minimal test payload

$handle = [IntPtr]::Zero
$testPath = "E:\vivpr\ai\ebrowser\probe_vhdx_audited.vhdx"
if (Test-Path $testPath) { Remove-Item -Force $testPath }

Write-Host "Calling CreateVirtualDisk with:"
Write-Host "  DeviceId: $($vst.DeviceId) (VIRTUAL_STORAGE_TYPE_DEVICE_VHDX)"
Write-Host "  VendorId: $($vst.VendorId) (Official Microsoft Vendor GUID)"
Write-Host "  ParamVersion: $($params.Version)"
Write-Host "  TargetPath: $testPath (exFAT)"

$res = [VHDProbeAudited]::CreateVirtualDisk([ref]$vst, $testPath, 0, [IntPtr]::Zero, 0, 0, [ref]$params, [IntPtr]::Zero, [ref]$handle)

$created = Test-Path $testPath
$size = if ($created) { (Get-Item $testPath).Length } else { 0 }
$magic = ""
if ($created) {
    $bytes = [System.IO.File]::ReadAllBytes($testPath)
    $magic = [System.Text.Encoding]::ASCII.GetString($bytes[0..7])
}

if ($handle -ne [IntPtr]::Zero) {
    [VHDProbeAudited]::CloseHandle($handle) | Out-Null
}

$deleted = $false
try {
    Remove-Item -Force $testPath -ErrorAction Stop
    $deleted = -not (Test-Path $testPath)
} catch {
    $deleted = $false
}

[PSCustomObject]@{
    DeviceId = $vst.DeviceId
    VendorId = $vst.VendorId.ToString()
    ParamVersion = $params.Version
    Win32ErrorCode = $res
    Hex = "0x$($res.ToString('X'))"
    FileCreated = $created
    FileSize = $size
    HeaderMagic = $magic
    FileCleanedUp = $deleted
} | Format-List

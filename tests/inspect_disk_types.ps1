# [PROJECT]: Lite Chromium Portable
# [WORKSPACE ROOT]: E:\vivpr\ai\ebrowser
# [BOUND THREAD]: goodkie/v-show Issue #8
# [ISOLATION SANITY CHECK]: VERIFIED (Zero cross-project contamination)
#
# Non-Mutating Storage Type & Schema Inspection Utility
# Reads existing disk instances without attaching, formatting, or creating disks.

Write-Host "=== STORAGE CIM PROPERTY & ETS TYPEDATA INSPECTION ==="
Write-Host "Timestamp: $(Get-Date -Format o)"

# 1. Pure CIM Instance Properties before Storage Module Import
Write-Host "`n--- 1. Raw CIM Instance Properties (root/Microsoft/Windows/Storage: MSFT_Disk) ---"
$disks = Get-CimInstance -Namespace root/Microsoft/Windows/Storage -ClassName MSFT_Disk
foreach ($d in $disks) {
    Write-Host "`nDisk Number: $($d.Number)"
    $props = @('BusType', 'PartitionStyle', 'IsSystem', 'IsBoot', 'NumberOfPartitions', 'UniqueId', 'Path')
    foreach ($p in $props) {
        $val = $d.$p
        $type = if ($null -ne $val) { $val.GetType().FullName } else { 'NULL' }
        $cimProp = $d.CimInstanceProperties[$p]
        $cimType = if ($null -ne $cimProp) { $cimProp.CimType } else { 'UNKNOWN' }
        Write-Host "  ${p}:"
        Write-Host "    Value:    $val"
        Write-Host "    .NET:     $type"
        Write-Host "    CIM Type: $cimType"
    }
}

# 2. Inspect Storage Module Types XML definitions
Write-Host "`n--- 2. Storage Module ETS Definitions (Storage.types.ps1xml) ---"
$typesXmlPath = "$env:windir\System32\WindowsPowerShell\v1.0\Modules\Storage\Storage.types.ps1xml"
if (Test-Path -LiteralPath $typesXmlPath) {
    Write-Host "Storage.types.ps1xml located at: $typesXmlPath"
    $xml = [xml](Get-Content -LiteralPath $typesXmlPath)
    $diskType = $xml.Types.Type | Where-Object { $_.Name -eq 'Microsoft.Management.Infrastructure.CimInstance#MSFT_Disk' }
    if ($diskType) {
        Write-Host "Found MSFT_Disk ETS Type definition:"
        foreach ($member in $diskType.Members.ScriptProperty) {
            Write-Host "  ScriptProperty: $($member.Name)"
        }
    }
} else {
    Write-Warning "Storage.types.ps1xml not found at expected path: $typesXmlPath"
}

# 3. Behavior after Storage Module Import
Write-Host "`n--- 3. Properties after Import-Module Storage ---"
Import-Module Storage -ErrorAction SilentlyContinue
$postDisks = Get-CimInstance -Namespace root/Microsoft/Windows/Storage -ClassName MSFT_Disk
foreach ($d in $postDisks) {
    Write-Host "`nDisk Number: $($d.Number)"
    Write-Host "  BusType:        $($d.BusType) ($($d.BusType.GetType().FullName))"
    Write-Host "  Raw CIM BusType: $($d.psBase.CimInstanceProperties['BusType'].Value) ($($d.psBase.CimInstanceProperties['BusType'].Value.GetType().FullName))"
    Write-Host "  PartitionStyle: $($d.PartitionStyle) ($($d.PartitionStyle.GetType().FullName))"
    Write-Host "  Raw CIM PartSt: $($d.psBase.CimInstanceProperties['PartitionStyle'].Value) ($($d.psBase.CimInstanceProperties['PartitionStyle'].Value.GetType().FullName))"
}

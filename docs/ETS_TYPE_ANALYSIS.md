# [PROJECT]: Lite Chromium Portable
# [WORKSPACE ROOT]: E:\vivpr\ai\ebrowser
# [BOUND THREAD]: goodkie/v-show Issue #8
# [ISOLATION SANITY CHECK]: VERIFIED (Zero cross-project contamination)

# Windows Storage CIM Property & PowerShell ETS TypeData Investigation

## 1. Executive Summary
This document records non-mutating evidence regarding the representation of disk properties (`BusType`, `PartitionStyle`, etc.) in Windows PowerShell when querying `root/Microsoft/Windows/Storage:MSFT_Disk`.
No disks were attached, modified, formatted, or created to produce this evidence.

---

## 2. Host Physical Disk Observation (Non-Mutating Inspection)

Ran [`tests/inspect_disk_types.ps1`](file:///E:/vivpr/ai/ebrowser/portable-minimal/tests/inspect_disk_types.ps1) on the host environment:

### A. Pure CIM Instance Properties (Before `Import-Module Storage`)
When querying `Get-CimInstance -Namespace root/Microsoft/Windows/Storage -ClassName MSFT_Disk`:
- **`BusType`**:
  - Raw Type: **`System.UInt16`** (`CimType: UInt16`)
  - Measured Values on Host: `11` (SATA SSD), `7` (USB Drive)
- **`PartitionStyle`**:
  - Raw Type: **`System.UInt16`** (`CimType: UInt16`)
  - Measured Values on Host: `2` (GPT on both disks)
- **`IsSystem` / `IsBoot`**:
  - Raw Type: **`System.Boolean`** (`CimType: Boolean`)
- **`NumberOfPartitions`**:
  - Raw Type: **`System.UInt32`** (`CimType: UInt32`)
- **`UniqueId` / `Path`**:
  - Raw Type: **`System.String`** (`CimType: String`)

### B. Extended Type System (ETS) Modification (After `Import-Module Storage`)
When the `Storage` module is imported into the PowerShell session (which occurs whenever `Get-DiskImage` is called):
- PowerShell loads `$env:windir\System32\WindowsPowerShell\v1.0\Modules\Storage\Storage.types.ps1xml`.
- This file injects ETS `<ScriptProperty>` members onto `Microsoft.Management.Infrastructure.CimInstance#MSFT_Disk`:
  - `BusType` ScriptProperty:
    ```xml
    <ScriptProperty>
      <Name>BusType</Name>
      <GetScriptBlock>
        switch ($this.psBase.CimInstanceProperties["BusType"].Value)
        {
          0 { "Unknown" }
          1 { "SCSI" }
          ...
          11 { "SATA" }
          14 { "Virtual" }
          15 { "File Backed Virtual" }
          Default { "Unknown" }
        }
      </GetScriptBlock>
    </ScriptProperty>
    ```
  - `PartitionStyle` ScriptProperty:
    ```xml
    <ScriptProperty>
      <Name>PartitionStyle</Name>
      <GetScriptBlock>
        switch ($this.psBase.CimInstanceProperties["PartitionStyle"].Value)
        {
          0 { "RAW" }
          1 { "MBR" }
          2 { "GPT" }
          Default { "Unknown" }
        }
      </GetScriptBlock>
    </ScriptProperty>
    ```
- **Observed Result on Host Disks**:
  - Disk 0: `$disk.BusType` = `"SATA"` (`System.String`), raw CIM = `11` (`System.UInt16`)
  - Disk 1: `$disk.BusType` = `"USB"` (`System.String`), raw CIM = `7` (`System.UInt16`)
  - Both disks: `$disk.PartitionStyle` = `"GPT"` (`System.String`), raw CIM = `2` (`System.UInt16`)

---

## 3. Host Observation vs. VHDX Inference Distinction

- **Directly Measured on Host**: Physical disks 0 and 1 via `Get-CimInstance` and `Storage.types.ps1xml` schema definition.
- **Inferred for VHDX**: In accordance with the MSFT_Disk specification (BusType 15 = File Backed Virtual) and `Storage.types.ps1xml`:
  - When a VHDX is attached, raw CIM `BusType` property is `[uint16]15`.
  - When `Get-DiskImage` imports `Storage`, ETS ScriptProperty maps `15` to string `"File Backed Virtual"`.
  - An unpartitioned virtual disk has raw CIM `PartitionStyle` = `[uint16]0`, which ETS maps to string `"RAW"`.
- **Zero Mutating Probes**: To respect the FAIL-CLOSED gate, no new attach or format operation was performed to gather this data.

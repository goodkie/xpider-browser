# [PROJECT]: Lite Chromium Portable
# [WORKSPACE ROOT]: E:\vivpr\ai\ebrowser
# [BOUND THREAD]: goodkie/v-show Issue #8
# [ISOLATION SANITY CHECK]: VERIFIED (Zero cross-project contamination)

# P2-250GB Chromium Build Environment Execution Plan (Revision 2)

## 1. Executive Summary & Gate Status

- **Current Gate Status:** **PLANNING & READ-ONLY INVESTIGATION ONLY (No live 250GB VHDX creation, No VS/SDK installation, No file deletion)**.
- **1GB Live Verification Milestone:** Formally ACCEPTED by ChatGPT ([`[CHATGPT][AUDIT ACCEPTED / NEXT PREPARATION][P2-1GB-LIVE-02]`](https://github.com/goodkie/v-show/issues/8#issuecomment-5994593963)).
- **Preserved Backing Files & Logs:**
  - R1 VHDX: `E:\vivpr\ai\ebrowser\build_test_1gb.vhdx` (4,194,304 bytes, Attached=False) preserved intact.
  - R1 Log: `tests/1gb_live_test_raw_transcript.txt` preserved intact.
  - R2 Attempt 1 Log: `tests/1gb_live_test_r2_attempt1_failed_transcript.txt` preserved intact.
  - R2 Attempt 2 Log: `tests/1gb_live_test_r2_raw_transcript.txt` (All Steps PASS) preserved intact.
  - R2 VHDX: `E:\vivpr\ai\ebrowser\build_test_1gb_r2.vhdx` (138,412,032 bytes, Attached=False) preserved intact.
- **Core Distinction (Build Environment vs. Final Portable Browser):**
  - The build environment setup described herein relies on host MSI packages and Windows registry entries for the Visual Studio compiler and Windows SDK infrastructure.
  - In contrast, the final compiled browser artifact deployed to `portable-minimal/dist` is a completely portable, standalone, isolated binary package that runs without external host MSI or registry dependencies.
- **Objective:** Establish an isolated Chromium build environment using an expandable 250GB VHDX mounted as `X:\`, with strictly monitored footprint on the host `C:\` drive, dedicated solely to compiling Lite Chromium Portable at fixed revision `73c14f6228d7cd537c855007e8f88678969cc0eb`.

---

## 2. 1GB Live Test Evidence Clarification & Fact-Based History

In response to ChatGPT review audit items:

1. **Runner Self-Blob Reporting Clarification**:
   - The R2 runner (`tests/run_1gb_live_test_r2.ps1`) verifies the exact blob hashes of the build executor (`build/setup_build_volume.ps1` -> `6e216cb6588bd1e79c514e2dbc9d01b844cf02c7`) and safety module (`build/VirtualDiskSafety.psm1` -> `47bfc232bb722919b65e0fb46325e8584e3e96b3`) against baseline commit `2165873b38afda5f23678aa150c793c8d6507262`.
   - The runner does not compute its own blob hash at runtime within the transcript; rather, the runner's own blob integrity (`3e94c5dd75632eeb41d6b27ec26a7434708f9fc9`) is independently audited and tracked via git tree/index objects.
2. **Attempt 1 vs. Attempt 2 Sequence & Environmental Realities**:
   - **Attempt 1 (06:24:52 ~ 06:25:14 EDT)**:
     - Executed by Owner via `run_1gb_test_r2.bat` (Run as Administrator) prior to ChatGPT's test evidence correction feedback.
     - DiskPart failed to create the virtual disk file during Step 1; subsequent `Get-DiskImage` threw `ObjectNotFound (0x80070002)`.
     - The runner's exception handler caught the failure cleanly, observed `VHDX File Status: NOT FOUND`, `Image Attached Status: UNKNOWN`, `Drive X: Status: FREE / UNMOUNTED`, and exited with code 1 without mutating host drives.
     - Note on DiskPart Exit Codes: DiskPart process exited with code 0 despite not creating the file. This confirms that **structured Windows/CIM object observation (`Get-DiskImage`, `Get-CimInstance MSFT_Disk`, `Get-PSDrive`) must remain the sole authoritative arbiter of disk state**.
     - Raw log was preserved and committed as `tests/1gb_live_test_r2_attempt1_failed_transcript.txt` (commit `eb3debe7fb3bc3242594ffd6bdcb5034ff0dec75`).
   - **Attempt 2 / Controlled Live Retry (07:04:42 ~ 07:05:39 EDT)**:
     - Executed by Owner via `run_1gb_test_r2.bat` (Run as Administrator) following ChatGPT's gate pass ([`[CHATGPT][TECHNICAL GATE PASS / EXECUTE ONE CONTROLLED RETRY]`](https://github.com/goodkie/v-show/issues/8#issuecomment-5992928810)).
     - Full structured pass: Disk 2 verified clean RAW (BusType=15, UniqueId `6002248097D0EFCB4BD0DB1B9FA89EE7`), pre-format reverified, GPT initialized, NTFS formatted (label `CHROMIUM_BUILD`), X: letter mapped, volume correspondence verified, Nonce byte-for-byte read/write verified, clean detach observed (`Attached=False`, `Drive X: FREE`), and VHDX preserved at 138,412,032 bytes.
     - Runner output: `=== 1GB LIVE TEST COMPLETE: ALL STEPS VERIFIED PASS ===`.
3. **Outer Runner Exit Code Status**:
   - Because the outer command prompt window was closed by the user upon completion, the external process exit code is formally cataloged as **UNKNOWN (Transcript verified PASS by structured observation)**.

---

## 3. Host Drive Measurements & Capacity Planning

### 3.1 Read-Only Drive Space Measurements (Updated: 2026-10-15 22:08 EDT)
Measurements obtained via Windows PowerShell `Get-Volume`:

| Drive | FileSystem | Total Size | Free Space (GB) | Free Space Ratio | Role |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`C:`** | **NTFS** | **464.97 GB** (499,254,120,448 B) | **25.31 GB** (27,176,460,288 B) | **5.44%** | Host OS, User Profile, Essential MSI Runtimes |
| **`E:`** | **exFAT** | **4,657.11 GB** (5,000,536,260,608 B) | **473.61 GB** (508,536,815,616 B) | **10.17%** | Workspace Root, Backing Storage for VHDX files |

*Observation*: Host C: drive free space has decreased from 34.70 GB (Oct 5) to **25.31 GB** (Oct 15). Host E: drive free space has decreased from 527.27 GB (Oct 5) to **473.61 GB** (Oct 15). Strict footprint control is imperative.

### 3.2 250GB Dynamic VHDX Allocation & Remaining Margin
- **Backing VHDX Target Path:** `E:\vivpr\ai\ebrowser\build_volume_250gb.vhdx`
- **VHDX Format:** Expandable (Dynamic)
- **Maximum Allocated Logical Size:** **256,000 MB (250.00 GB)**
- **Initial Physical Allocation on E:** ~138 MB
- **Projected Free Space on E: at Maximum Logical Expansion:**
  $$\text{Free Space}_{\text{post-max}} = 473.61\text{ GB} - 250.00\text{ GB} = \mathbf{223.61\text{ GB}}$$
- **Capacity Ratios (Disambiguated):**
  - **Ratio relative to Total E: Capacity:** $\frac{223.61\text{ GB}}{4657.11\text{ GB}} = \mathbf{4.80\%}$ of total E: drive capacity.
  - **Ratio relative to Current Free Space:** $\frac{223.61\text{ GB}}{473.61\text{ GB}} = \mathbf{47.21\%}$ of currently available free space.
- **Safety Margin Assessment & Caveats:**
  - $223.61\text{ GB}$ provides substantial margin, but it is **an estimate, not an absolute guaranteed buffer**. Dynamic VHDX metadata overhead, sector allocation granularity, and concurrent host writes may cause minor variations.

---

## 4. Chromium Sizing Analysis & 250GB Adequacy

### 4.1 Itemized Storage Budget on `X:\` (250 GB Logical Volume)
Building Chromium at fixed revision `73c14f6228d7cd537c855007e8f88678969cc0eb` (Milestone M154 / `154.0.8037.57`) requires the following itemized allocations:

| Component | Estimated Size | Storage Location | Notes / Source & Optimization |
| :--- | :--- | :--- | :--- |
| **`depot_tools`** | ~1.5 GB | `X:\depot_tools\` | Ninja, GN, Python, CIPD bootstrap packages |
| **VS Build Tools & Win11 SDK** | ~12.0 GB | `X:\toolchain\` | Redirected via `--installPath` and `--path` options |
| **Chromium Source Code (`src/`)** | ~35.0 – 42.0 GB | `X:\chromium\src\` | Shallow clone (`--no-history`, depth=1; not blobless) |
| **Prebuilt Toolchains & Hooks** | ~15.0 – 20.0 GB | `X:\chromium\src\third_party\` | Clang/LLVM, Node, Java, Windows sysroots (via `gclient runhooks`) |
| **Intermediate Object Files (`.obj`)**| ~30.0 – 40.0 GB | `X:\chromium\src\out\Default\` | Compiled with `symbol_level=0`, `blink_symbol_level=0`, `is_debug=false` |
| **Final Binaries & Installer** | ~2.5 – 4.0 GB | `X:\chromium\src\out\Default\` | `mini_installer.exe`, `chrome.exe`, `chrome.dll` |
| **Build Cache / Temp Buffer** | ~25.0 – 35.0 GB | `X:\temp\` / `X:\cache\` | Linker scratch buffers, intermediate compiler artifacts |
| **Total Estimated Footprint** | **~121.0 – 154.5 GB** | **Volume `X:\`** | **Total volume capacity: 250.0 GB** |
| **Estimated Remaining Buffer** | **~95.5 – 129.0 GB** | **Volume `X:\`** | **Buffer Margin: ~38.2% – 51.6% free** |

### 4.2 Sizing Adequacy Statement
- The lowest projected free buffer on Volume `X:\` is **95.5 GB** (representing 38.2% free capacity). It is **not** claimed as "always 100 GB+," acknowledging potential toolchain cache overlaps and transient linker files.
- The 250 GB allocation is adequate subject to strict adherence to:
  1. Release build configuration (`is_debug = false`).
  2. Complete suppression of debug symbols (`symbol_level = 0`, `blink_symbol_level = 0`).
  3. Single target compilation (`autoninja -C out\Default chrome` rather than building test suites).

---

## 5. Host Toolchain Status, C: Drive Constraint & Toolchain Redirection Strategy

### 5.1 Host Environment Read-Only Audit Evidence
Read-only inspection performed on the host confirms:
- `C:\Program Files (x86)\Windows Kits` : **DOES NOT EXIST** (`Test-Path` returned False).
- `C:\Program Files\Microsoft Visual Studio` : **DOES NOT EXIST** (`Test-Path` returned False).
- `C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe` : **DOES NOT EXIST**.
- Registry `HKLM:\SOFTWARE\Microsoft\Windows Kits\Installed Roots` : **DOES NOT EXIST**.
- Registry `HKLM:\SOFTWARE\WOW6432Node\Microsoft\VisualStudio` : Contains only legacy runtime entries (v14.51, v14.23); no VS 2022 IDE or Build Tools registered.
- **Conclusion**: The host currently has zero Visual Studio 2022 or Windows 11 SDK development components installed.

### 5.2 Visual Studio Build Tools 2022 Redirection Command
In strict compliance with official Microsoft Visual Studio CLI documentation ([Use command-line parameters to install Visual Studio](https://learn.microsoft.com/en-us/visualstudio/install/use-command-line-parameters-to-install-visual-studio?view=vs-2022), [Change installation locations](https://learn.microsoft.com/en-us/visualstudio/install/change-installation-locations?view=visualstudio)):

```cmd
vs_BuildTools.exe --quiet --wait --norestart --nocache ^
  --installPath "X:\toolchain\vs2022" ^
  --path cache="X:\toolchain\vs_cache" ^
  --path shared="X:\toolchain\vs_shared" ^
  --add Microsoft.VisualStudio.Workload.VCTools ^
  --add Microsoft.VisualStudio.Component.VC.Tools.x86.x64 ^
  --add Microsoft.VisualStudio.Component.VC.ATLMFC ^
  --add Microsoft.VisualStudio.Component.Windows11SDK.26100
```

### 5.3 Technical Realities of Host C: Drive Footprint
Per Microsoft documentation, redirection parameters (`--path cache`, `--path shared`, `--installPath`) relocate product-specific binaries and download caches, but **certain components will always be installed on the system drive (C:) regardless of specified parameters**:
1. **Visual Studio Installer Engine**: Installed unconditionally to `C:\Program Files (x86)\Microsoft Visual Studio\Installer`.
2. **Windows SDK Runtime & Shared CRT**: Side-by-side CRT assemblies and shared headers register directly to `C:\Program Files (x86)\Windows Kits\10`.
3. **MSI Package Metadata & Package Cache Registrations**: Recorded in `C:\ProgramData\Package Cache` and Windows System Registry.

**Updated C: Drive Consumption Estimates & Safety Threshold:**
- **Estimated Host C: Footprint**: **~5.0 to 8.0 GB** (Classified as an **unconfirmed pre-installation estimate**; claims of "SDK 100% on X:" or "C: max 6.5 GB guaranteed" are explicitly retracted).
- **Projected C: Free Space Remaining**: ~17.31 to 20.31 GB (from current 25.31 GB).
- **Hard Safety Abort Threshold**: If host C: drive free space drops below **15.00 GB** at any point prior to or during installation, the procedure must immediately halt and fail-closed.

---

## 6. Fixed Chromium Revision & Synchronization Order

### 6.1 Fixed Target Revision Identity
- **Repository**: `chromium/src`
- **Target Commit Hash**: `73c14f6228d7cd537c855007e8f88678969cc0eb`
- **Milestone / Branch**: Milestone M154 (Branch heads/8037, Tag `154.0.8037.57`)
- **Toolchain Specification (from `build/vs_toolchain.py` at target commit)**:
  - Supported Visual Studio: VS 2026 (18.0) and VS 2022 (17.0, `VC143`).
  - Expected SDK Version: `SDK_VERSION = '10.0.28000.0'` (or compatible Windows 11 SDK `10.0.26100.3323`+ with Debugging Tools for Windows).
  - Required MSVC Workload: Native Desktop / VCTools (`Microsoft.VisualStudio.Workload.VCTools`), `Microsoft.VisualStudio.Component.VC.Tools.x86.x64`, `Microsoft.VisualStudio.Component.VC.ATLMFC`.

### 6.2 Strict Synchronization & Build Sequence
The synchronization process must follow this strict sequence without substituting `main` or arbitrary SDK versions:

1. **Environment Initialization**:
   ```cmd
   set PATH=X:\depot_tools;%PATH%
   set DEPOT_TOOLS_WIN_TOOLCHAIN=0
   set vs2022_install=X:\toolchain\vs2022
   set WINDOWSSDKDIR=X:\toolchain\vs_shared\Windows Kits\10
   set TEMP=X:\temp
   set TMP=X:\temp
   ```
2. **Initial Fetch (`--no-history`)**:
   ```cmd
   cd /d X:\chromium
   fetch --no-history chromium
   ```
   *(Note: `--no-history` creates a shallow clone with depth=1 to minimize initial download bandwidth; it is technically distinct from git blobless `--filter=blob:none`).*
3. **Checkout Fixed Revision**:
   ```cmd
   cd /d X:\chromium\src
   git checkout -b build-fixed 73c14f6228d7cd537c855007e8f88678969cc0eb
   ```
4. **Synchronize Dependencies (`gclient sync`)**:
   ```cmd
   gclient sync --with_branch_heads --with_tags
   ```
5. **Run Hooks (`gclient runhooks`)**:
   ```cmd
   gclient runhooks
   ```
6. **Configure GN Build Arguments via File (`args.gn`)**:
   To avoid shell quoting errors and syntax misinterpretations, create `X:\chromium\src\out\Default\args.gn` directly with the following content:
   ```gn
   is_debug = false
   is_component_build = false
   symbol_level = 0
   blink_symbol_level = 0
   target_cpu = "x64"
   enable_nacl = false
   proprietary_codecs = false
   ```
7. **Generate Ninja Build Files**:
   ```cmd
   gn gen out\Default
   ```
8. **Compile Target**:
   ```cmd
   autoninja -C out\Default chrome
   ```

---

## 7. Mounting, Observation & Safe Detach Operations

### 7.1 Mode A: Fresh Provisioning (`setup_build_volume.ps1`)
Used solely when creating a new volume. Requires that `build_volume_250gb.vhdx` does NOT exist.
```powershell
# Elevated Administrator PowerShell
powershell -NoProfile -ExecutionPolicy Bypass -File "E:\vivpr\ai\ebrowser\portable-minimal\build\setup_build_volume.ps1" -VhdPath "E:\vivpr\ai\ebrowser\build_volume_250gb.vhdx" -SizeMB 256000 -DriveLetter X -Execute
```
- **Assertions:** Backing file does not exist -> Create expandable VHDX -> Verify attached RAW virtual disk via `Test-AttachedVirtualDiskIdentity` (BusType=15, PartitionStyle=RAW(0), Disks=1) -> Pre-format identity reverification via `Test-PreFormatIdentityMatch` -> GPT initialize, format NTFS label="CHROMIUM_BUILD", map X: -> Verify correspondence via `Test-TargetVolumeCorrespondence` -> Nonce I/O read/write/cleanup verification.

### 7.2 Mode B: Re-Attach Existing Formatted Volume (`-AttachOnly`)
Used to re-attach an already formatted 250GB build volume in subsequent sessions. **Never formats, creates, or repartitions**.
```powershell
# Elevated Administrator PowerShell
powershell -NoProfile -ExecutionPolicy Bypass -File "E:\vivpr\ai\ebrowser\portable-minimal\build\setup_build_volume.ps1" -VhdPath "E:\vivpr\ai\ebrowser\build_volume_250gb.vhdx" -DriveLetter X -AttachOnly -Execute
```
- **Assertions:**
  1. Assert backing file exists (`Test-Path`).
  2. Assert target drive letter `X:` is currently unmounted.
  3. DiskPart attach (`select vdisk file="..."; attach vdisk`).
  4. Structured identity check via `Test-AttachedExistingVirtualDiskIdentity`: BusType==15 (File Backed Virtual), IsSystem==False, IsBoot==False, PartitionStyle==2 (GPT), NumberOfPartitions>=1, UniqueId/Path non-empty, ImagePath match.
  5. Assign drive letter `X:` to partition 1 if unassigned.
  6. Assert target volume correspondence via `Test-TargetVolumeCorrespondence` (Partition on verified disk, FileSystem=="NTFS", FileSystemLabel=="CHROMIUM_BUILD").

### 7.3 Mode C: Controlled Safe Detach (`-DetachOnly`)
Used when suspending or concluding build activities.
- **Operational Pre-Requisite (Process Lock Verification):**
  The operator/script must inspect active processes before invoking detach to ensure compiler locks are released:
  ```powershell
  Get-Process -Name ninja, chrome, cl, link, clang, clang-cl, gn -ErrorAction SilentlyContinue
  ```
- **Detach Execution:**
  ```powershell
  # Elevated Administrator PowerShell
  powershell -NoProfile -ExecutionPolicy Bypass -File "E:\vivpr\ai\ebrowser\portable-minimal\build\setup_build_volume.ps1" -VhdPath "E:\vivpr\ai\ebrowser\build_volume_250gb.vhdx" -DriveLetter X -DetachOnly -Execute
  ```
- **Assertions Enforced by Script:**
  1. Inspect `Get-DiskImage -ImagePath ...` (Attached must be True).
  2. DiskPart detach: `select vdisk file="..."; detach vdisk`.
  3. Structured observation via `Test-ObservedDetachState`: Query `Get-DiskImage` to verify `Attached == False`.
  4. Query `Get-PSDrive` to verify `X:` is completely unmounted.
  5. Backing file `build_volume_250gb.vhdx` preserved intact on E: without deletion.

---

## 8. Explicit User Approvals Required (Gate Inventory)

Before any commands in this plan are executed, the following explicit Owner approvals must be formally recorded:

1. **Gate Approval 1 (Disk Allocation):**
   - Permission to create `E:\vivpr\ai\ebrowser\build_volume_250gb.vhdx` (Expandable VHDX, Max 250 GB) on host E: drive.
2. **Gate Approval 2 (Host C: Drive MSI / Toolchain Footprint):**
   - Permission to install Visual Studio 2022 Build Tools (CLI) with redirection to `X:\`, consuming estimated **~5.0 to 8.0 GB** on host `C:\` drive, with hard abort threshold at 15.00 GB free C: capacity.
3. **Gate Approval 3 (High-Volume Network Download & Storage Target):**
   - Permission to download depot_tools (~1.5 GB), shallow Chromium source (~35–42 GB), and prebuilt toolchains/sysroots (~15–20 GB) directly over the network to Volume `X:\`.

---
*End of Plan. Awaiting ChatGPT review and formal Owner gate approvals before executing any live modifications.*

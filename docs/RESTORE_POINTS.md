# Lite Chromium Portable — Restore Points Registry

## Policy & Architecture
All modifications follow the 4-tier restore model:
1. **Git History & Working Branches**: Dedicated `feature/lcw-portable-chromium` branch. Never commit directly to `main` without approved PR/audit.
2. **Immutable Local Checkpoints**: Stored outside working tree in `E:\vivpr\ai\ebrowser\_RESTORE_POINTS/`.
3. **MASTER HUB Audit Trail**: Logged under [goodkie/xpider-browser#1](https://github.com/goodkie/xpider-browser/issues/1).
4. **Project Handover**: Updated in `docs/PROJECT_HANDOVER.md`.

---

## Registered Checkpoints

### 1. `RESTORE_POINT_P0_BASELINE_20261004_032000`
- **Creation Timestamp**: 2026-10-04T03:20:00Z
- **Baseline Git SHA**: `dfccd7f01ef794df57a856fa2801c6b551bd6ac8`
- **Branch**: `feature/lcw-portable-chromium`
- **Location**: `E:\vivpr\ai\ebrowser\_RESTORE_POINTS\P0_BASELINE`
- **Scope**: Clean checkout boundary before any source, launcher, or patch files are added.
- **Verification Evidence**:
  - `E:\vivpr\ai\ebrowser\_RESTORE_POINTS\P0_BASELINE\HEAD_SHA.txt`
  - `E:\vivpr\ai\ebrowser\_RESTORE_POINTS\P0_BASELINE\STATUS.txt`
- **Legacy Safety**: `E:\vivpr\ai\browser` and all historical XPIDER release binaries are unmodified and strictly isolated.

### 2. `RESTORE_POINT_P1A_DELIVERY_20261004_042500`
- **Creation Timestamp**: 2026-10-04T04:25:00Z
- **Commit**: `bee59d7441ad0a143fa6fdcbf85bd7523e176c71`
- **Branch**: `feature/lcw-portable-chromium`
- **Location**: `E:\vivpr\ai\ebrowser\_RESTORE_POINTS\P1A_DELIVERY`
- **Scope**: Native Go launcher (`LiteChromiumPortable.exe`), `engine.lock.json` (Chromium 154.0.8037.57), test fixtures, test reports, and portable release zip.
- **Artifact**: `LiteChromiumPortable_v0.1.0_win64.zip` (264,608,216 bytes, SHA256: `686426b2ad3c59e412cd88663558842c00d6d7470553354718622692a79db903`).
- **Spike Findings**: Unmodified engine Win32 docking evaluated; confirmed `SIDE_PANEL` native context limitation (scoped `FAIL_UNMODIFIED_DOCKING`).

### 3. `RESTORE_POINT_P1A_R1_REMEDIATION_20261004_084500`
- **Creation Timestamp**: 2026-10-04T08:45:00Z
- **Commit**: `fc8e372d3c3c7c4f2351767751ce5bcda5a0425b`
- **Branch**: `feature/lcw-portable-chromium`
- **Scope**: R1~R8 Remediation in response to ChatGPT Audit (Comment #5978144344).
  - R1: Global `taskkill /F /IM chrome.exe` 100% eliminated; strictly targeted process hierarchy management via CIM. Sentinel browser process fully protected and verified.
  - R2: Windows `LockFileEx` cross-process file lock, atomic temp replacement, URL switch injection defense, and instance/batch range bounds.
  - R3: User profile data protection; active instance clean rejection.
  - R4: Transactional extension unzip with bound checks and path traversal protection; per-instance `extensions_config.json` isolation.
  - R5: Real runtime test suite with 20/20 PASS assertions, including batch-5 concurrent launch and profile segregation.
  - R6: Monotonic readiness-based startup latency (5 trials, median 0.078s) and owned-process memory metrics (WorkingSet: 126.27MB, PrivateBytes: 57.96MB).
  - R7: Panel spike static analysis clarity maintained (HOLD on multi/duplicate sidebars on unmodified engine).
  - R8: Chromium upstream source commit SHA mapping (`b859317bf11f6be47f9b7799ec690a0a42a1fb33`).
- **Artifact**: `dist/LiteChromiumPortable_v0.1.0_win64.zip` (264,685,048 bytes, SHA256: `e5dd6b1d21b554e16c98d037790c9feb238bb28b205834cf6c03652db59da348`).
- **Launcher Binary**: `LiteChromiumPortable.exe` (2,743,808 bytes, SHA256: `ffa97680fddf94cffe49337aa6e7c746790cf9ab50fde6b006304add24073eb8`).

### 4. `RESTORE_POINT_P1A_R2_REMEDIATION_20261004_093000`
- **Creation Timestamp**: 2026-10-04T09:30:00Z
- **Branch**: `feature/lcw-portable-chromium`
- **Scope**: R2 Remediation in response to ChatGPT Audit (Comment #5978283912).
  - Atomic File Replacement: Applied Windows `MoveFileExW` (`MOVEFILE_REPLACE_EXISTING`) without prior destructive deletion.
  - Profile Safety: `--clean-profiles` requires explicit `--confirm-destructive` flag and active-instance check before directory deletion.
  - Extension Rollback: Added pre-promotion backup and automatic rollback on staging promotion failure.
  - Source Commit Correction: Fixed Chromium upstream commit SHA to exact `73c14f6228d7cd537c855007e8f88678969cc0eb` (154.0.8037.57 official tag).
  - Clean Minimal Package: Removed 650+ inherited XPIDER extension bulk; clean release zip reduced from 252MB to 190.69MB (SHA256SUMS with 89 matching files).
  - Accurate Browser UI Latency: Measured actual window rendered milestone (`MainWindowHandle != 0`) across 5 trials (median: 11.609s).
  - Recursive Memory: Accurate descendant process tree measurement (WorkingSet: 118.83MB across 4 processes).
  - P2 Native MultiPanel Architecture: Completed in-tree C++ patch design and E: drive local build feasibility (531 GB available).
- **Artifact**: `dist/LiteChromiumPortable_v0.1.0_win64.zip` (199,954,803 bytes, SHA256: `e97c555d37e7b0a260363cea314e409aa3bfd3812a2b338713b6735644231939`).
- **Launcher Binary**: `LiteChromiumPortable.exe` (2,746,368 bytes, SHA256: `6ef1247009dc226d4ac42724706fe03739080b33eb1933707e79f92f574bd66f`).




# P2 Native Multi-Panel Chromium Build Environment & Prerequisite Audit

## 1. Local Toolchain & Hardware Inventory (Verified On-Device)

| Component | Status | Verified Path / Version | Notes |
| :--- | :--- | :--- | :--- |
| **OS** | VERIFIED | Windows 10 Pro x64 (Build 19045) | Physical host workstation |
| **CPU** | VERIFIED | Intel Core i7 (4 Cores, 8 Logical Processors) | Hyperthreading enabled |
| **RAM** | VERIFIED | 24.0 GB Physical RAM | Peak observed free: ~14.2 GB |
| **Storage (E:)** | VERIFIED | NTFS Volume, 531 GB Free Space | Designated source/cache root |
| **Git** | INSTALLED | `C:\Program Files\Git\cmd\git.exe` (v2.44+) | PATH verified |
| **Python** | INSTALLED | `C:\Users\oPus\AppData\Local\Programs\Python\Python312` (v3.12.3) | PATH verified |
| **Go** | INSTALLED | `C:\Program Files\Go\bin\go.exe` (go1.22+) | PATH verified |
| **MSVC / VS** | NOT_IN_PATH | Needs Visual Studio 2022 Community (17.8+) C++ workload | Pending setup |
| **Windows 10/11 SDK** | NOT_IN_PATH | Requires 10.0.22621.0+ with Debugging Tools | Pending setup |
| **depot_tools / GN / Ninja** | NOT_INSTALLED | Required for Chromium checkout & build graph | Pending bootstrap on `E:\` |

---

## 2. Upstream Target Revision & Source Pointers

- **Engine Version**: Chromium `154.0.8037.57` (ungoogled-chromium packaging)
- **Pinned Chromium Source Commit**: `73c14f6228d7cd537c855007e8f88678969cc0eb`
- **Source Inspection Targets**:
  - `chrome/browser/ui/views/side_panel/side_panel_coordinator.h` / `.cc`
  - `chrome/browser/ui/views/side_panel/side_panel_entry_key.h` / `.cc`
  - `chrome/browser/ui/views/side_panel/side_panel_ui_base.h` (`SidePanelUIBase::UniqueKey`)
  - `chrome/browser/ui/views/side_panel/extensions/extension_side_panel_coordinator.h` / `.cc`

---

## 3. Dependency Graph & Realistic Build Time Estimates

> [!IMPORTANT]
> **Source-Only Shortcut Fallacy Correction**:
> Building only the `chrome` target (`ninja -C out/Release chrome`) does NOT eliminate dependency compilation on initial build. The build graph requires compiling ~38,000+ translation units (Blink, V8, Skia, WebRTC, Base, Mojo, Views).
> A C++ patch to `SidePanelCoordinator` and `SidePanelEntryKey` requires linking against `chrome.dll` and its transitive symbol graph.

### Measured / Estimated Build Horizon (Non-Destructive Local Workspace):
- **Workspace Location**: `E:\chromium_build\` (Isolation from project tree)
- **Estimated Source Tree Size**: ~65 GB (shallow/single commit) to ~110 GB (full depot_tools checkout)
- **Estimated Build Output Size**: ~35 GB (`out/Release` with `symbol_level=0`)
- **Initial Clean Build Time (8 Logical Cores, 24GB RAM, Local SSD)**:
  - *Estimated Range*: 4.5 hours ~ 7.0 hours (without distributed build/goma/reclient)
  - *Incremental Rebuild (Patch modification to UI Views only)*: ~3 to 8 minutes
- **Peak RAM Usage during Link**: ~16 to 20 GB (linking `chrome.dll` with LLD / thinLTO requires careful swap budgeting)

---

## 4. Phase 2 Scope & Feasibility Strategy

1. **Phase 1A Delivery (Current Focus)**:
   - Deliver complete, standalone, production-ready zero-install Chromium portable with MV3 extensions and multi-instance isolation (`LiteChromiumPortable_v0.1.0-r4_win64.zip`).
2. **Phase 2 Implementation Track (Authorized Prototype & Source In-Tree Integration)**:
   - Provide minimal patch prototype: `patches/001-native-multipanel.patch`
   - Key modifications:
     - `PanelInstanceId` field introduced in `SidePanelEntryKey` with strict `<` and `==` operators.
     - Multi-slot support in `SidePanelCoordinator` via `std::map<PanelInstanceId, PanelSlot>` replacing single `PanelData.current_key`.
     - Independent `ExtensionViewViews` host instantiations per slot, sharing Service Worker state across slots within the instance profile.
   - Lifecycle plan: 50-cycle open/close/reload/resize stress test suite without memory leaks or context destruction crashes.

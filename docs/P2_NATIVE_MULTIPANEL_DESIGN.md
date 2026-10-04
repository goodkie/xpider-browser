# [P2-DESIGN] Native Chromium MultiPanel & Duplicate Sidebar Architecture

## 1. Upstream Source Anchor & Target Verification
- **Target Chromium Version**: `154.0.8037.57`
- **Upstream Tag**: `154.0.8037.57-1.1` (ungoogled-chromium-windows)
- **Official Chromium Gitiles Tag**: [refs/tags/154.0.8037.57](https://chromium.googlesource.com/chromium/src/+/refs/tags/154.0.8037.57)
- **Exact Upstream Source Commit SHA**: `73c14f6228d7cd537c855007e8f88678969cc0eb`
- **Verification**: `chrome/VERSION` at this commit specifies:
  - `MAJOR=154`
  - `MINOR=0`
  - `BUILD=8037`
  - `PATCH=57`

---

## 2. Chromium In-Tree Class Analysis & Structural Limitations

### 2.1 Existing Single-Panel Architecture
In upstream Chromium (`chrome/browser/ui/views/side_panel/`):
1. **`SidePanelCoordinator`** (`side_panel_coordinator.h/.cc`):
   - Holds a single active entry pointer: `raw_ptr<SidePanelEntry> current_entry_ = nullptr;`
   - Holds a single active view pointer: `raw_ptr<views::View> current_view_ = nullptr;`
   - Switching panels destroys/unparents the previous view via `SidePanel::SetPanelContent()`.
   - Cannot host multiple panels concurrently side-by-side or stacked.
2. **`SidePanel`** (`side_panel.h/.cc`):
   - Derived from `views::View`.
   - Layout is managed by a single vertical/horizontal layout manager hosting only one child view for content.
3. **`BrowserView`** (`browser_view.h`):
   - Member: `raw_ptr<SidePanel> right_aligned_side_panel_;`
   - Docked strictly to one side of the web contents.

### 2.2 Why Win32 External Docking (`SetParent`) Failed (Spike Findings)
- Unmodified engine treats externally spawned browser windows as separate Top-Level Win32 windows with `TAB` or `POPUP` context.
- When docked via Win32 `SetParent`, Chromium's internal `views::Widget` focus, active tab resolution (`chrome.tabs.query({ active: true })`), and `chrome.sidePanel` MV3 context contracts are broken.
- **Conclusion**: A true native multi-sidebar and duplicate-sidebar experience **requires an in-tree Chromium patch** to the Views layer.

---

## 3. P2 Native Patch Design: `MultiPanelCoordinator`

### 3.1 Slot-Based Multi-Panel Model
Instead of a single `current_entry_`, introduce slot-based container management:
```cpp
// Slot identifier: supports multiple concurrent dock positions or stacked panels
enum class PanelSlotId {
  kLeftPrimary = 0,
  kRightPrimary = 1,
  kRightSecondary = 2,
  kRightTertiary = 3
};

struct PanelSlotInstance {
  PanelSlotId slot_id;
  std::unique_ptr<SidePanelEntry::Key> entry_key;
  raw_ptr<views::View> content_view;
  std::unique_ptr<extensions::ExtensionViewViews> extension_host_view;
  std::string instance_tag; // Identifies duplicate instances of the same extension
};
```

### 3.2 Duplicate Sidebar Support (A1 + A2)
- Upstream `SidePanelEntry::Key` is defined by `(SidePanelEntry::Id id, std::optional<extensions::ExtensionId> extension_id)`.
- To allow the same extension to open twice concurrently (e.g., two crawlers or two scraper panels with different configurations):
  - Extend the entry key: `SidePanelEntry::Key(id, extension_id, instance_tag)`.
  - In `ExtensionSidePanelManager`, instantiate discrete `ExtensionViewViews` hosts with isolated WebContents instances, bound to the same extension ID but routed to distinct slot IDs.
  - This ensures separate DOM trees, separate JavaScript contexts, while sharing underlying extension storage or maintaining discrete session states as configured.

### 3.3 Active Tab & MV3 API Compatibility
- `chrome.sidePanel.open({ tabId })` maps to the designated slot.
- `chrome.tabs.query({ active: true, currentWindow: true })` executed inside the panel host correctly resolves the primary browsing WebContents within `BrowserView`.

---

## 4. Local Build Feasibility & Resource Assessment

### 4.1 Local Machine Capacity (Drive E:)
- **Available Free Space on `E:\`**: **531 GB** (Total: 4.65 TB).
- **Required Space for Chromium Windows x64 Build**:
  - Source Tree (`depot_tools` + `src`): ~55 GB.
  - Build Artifacts (`out/Default` with PDBs/thin-LTO): ~80 GB.
  - ccache / Goma / Reclient cache: ~40 GB.
  - **Total Required**: ~175 GB.
- **Feasibility Verdict**: **FULLY VIABLE ON LOCAL `E:\` DRIVE**. Local checkout and patch application will not impact `C:\` or external projects.

### 4.2 Local Toolchain Availability
- Operating System: Windows 11 (OS Build 26100)
- Architecture: x64
- PowerShell / Python 3.12 / Git: Available and functional.
- Required for native build:
  1. `depot_tools` installation into `E:\depot_tools` (PATH prepend).
  2. Windows 11 SDK (10.0.22621.0 or newer) with Debugging Tools.
  3. Visual Studio 2022 C++ Build Tools (MSVC v143 / ClangCL).

### 4.3 Alternative CI/CD Build Worker
- If the Owner prefers not to run intensive compilation (6~8 hours on local CPU), a GitHub Actions self-hosted or standard `windows-2022` 32-core Large Runner can be configured with:
  - Cache: GitHub Actions Cache / AWS S3 for `ninja` build outputs.
  - Artifact output: `chrome.exe` + `chrome.dll` packaged into minimal release bundle.

---

## 5. Next Steps for P2 Implementation
1. **Approval Gate**: Submit this design packet to ChatGPT for P2-DESIGN audit and clearance.
2. **Minimal In-Tree Patch Preparation**:
   - Create `patches/001-native-multipanel-coordinator.patch`.
   - Target files:
     - `chrome/browser/ui/views/side_panel/side_panel_coordinator.h`
     - `chrome/browser/ui/views/side_panel/side_panel_coordinator.cc`
     - `chrome/browser/ui/views/side_panel/side_panel.cc`
     - `chrome/browser/ui/views/frame/browser_view.cc`
3. **Execution**: Apply patch to verified Chromium revision `73c14f6228d7cd537c855007e8f88678969cc0eb` and initiate headless compilation test.

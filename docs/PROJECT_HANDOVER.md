# Lite Chromium Portable — Project Handover

## Project Overview
- **Project Name**: Lite Chromium Portable
- **Collaboration Standard**: OCA-DEV-1.0
  - **Owner**: Requirements & live Windows acceptance testing.
  - **ChatGPT**: Architecture, technical judgment, auditing, approvals.
  - **Antigravity**: Implementation, local test, portable Windows build, restore points, receipts.
- **Master Collaboration Hub**: [goodkie/xpider-browser#1](https://github.com/goodkie/xpider-browser/issues/1)

## Isolation Guarantee
- Legacy XPIDER codebase (`E:\vivpr\ai\browser`) is completely untouched.
- All new development is restricted to `E:\vivpr\ai\ebrowser\portable-minimal` on branch `feature/lcw-portable-chromium`.

## Development Objectives
1. Pure Windows x64 Portable without installation.
2. Full native Chromium MV3 extension execution (`chrome.tabs`, `chrome.scripting`, `chrome.storage`, `chrome.runtime`, Service Workers).
3. Independent profile multi-instance batch launch (3 to 5 browsers running simultaneously with distinct `user-data-dir`).
4. Multiple extension sidebars displayed simultaneously (A + B + C).
5. Duplicate extension sidebars side-by-side (A1 + A2) sharing the same extension storage/worker context.
6. Zero bloat: No accounts, cloud sync, telemetry, campaigns, AI assistants, or updater.
7. Zero non-native bloat: Strictly no Node.js, Electron, or .NET runtime packaging.

## Current Status: P1A Delivered & Panel Spike Completed
- **P1A Implementation Status**: `DELIVERED`
  - Engine Lock: `engine.lock.json` (Chromium 154.0.8037.57 x64)
  - Native Launcher: `LiteChromiumPortable.exe` (Go 1.25, Win32 Subsystem, 2.48 MB)
  - Batch Multi-Instance: Verified independent profiles for `--batch=3` and `--batch=5`.
  - Extension Fixture: Unpacked MV3 Service Worker, Storage, Scripting, Tabs verified.
  - Release ZIP: `dist/LiteChromiumPortable_v0.1.0_win64.zip` (252.35 MB, SHA256: `686426b2ad3c59e412cd88663558842c00d6d7470553354718622692a79db903`)
  - Performance Metrics:
    - Median Startup: `1.008s`
    - Process Memory: `125.67 MB` working set
- **Panel Capability Spike**:
  - Verdict: `FAIL_UNMODIFIED_DOCKING`
  - Findings: Unmodified engine docking via Win32 SetParent reports `contextType: "POPUP"` / `"TAB"`, failing native `chrome.runtime.getContexts({contextTypes: ['SIDE_PANEL']})` and active tab context contracts without in-tree SidePanelCoordinator C++ modification.
- **Next Required Focus**: Native C++ patch for Chromium `SidePanelCoordinator` to support duplicate/multi native side panels.


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

## Current Phase: P0 (Discovery & Consult) Completed
- DISCOVERY Receipt: [goodkie/xpider-browser#1#issuecomment-5976130164](https://github.com/goodkie/xpider-browser/issues/1#issuecomment-5976130164)
- CONSULT Proposal: [goodkie/xpider-browser#1#issuecomment-5976138490](https://github.com/goodkie/xpider-browser/issues/1#issuecomment-5976138490)
- Immutable Checkpoint: `RESTORE_POINT_P0_BASELINE_20261004_032000`
- Pending Decision: ChatGPT architecture path approval (Path B: Pinned Pure Chromium Engine + Native Win32 Launcher & Multi-Panel Docking Host).

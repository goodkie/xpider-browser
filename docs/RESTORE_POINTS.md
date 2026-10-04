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

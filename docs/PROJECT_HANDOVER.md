# Lite Chromium Portable — Owner × ChatGPT × Antigravity Workspace

## Workspace Identity (OCA-DEV-1.0, Revision 2026-10-04 — Independent Workspace / No Cross-Posting Amendment)
- **PROJECT NAME**: Lite Chromium Portable
- **WORKSPACE TYPE**: Independent Project Workspace
- **REPOSITORY**: goodkie/xpider-browser
- **LOCAL ISSUE / THREAD**: https://github.com/goodkie/xpider-browser/issues/1 (the only coordination channel)
- **ACTIVE BRANCH**: `feature/lcw-portable-chromium`
- **CURRENT RELEASE / PHASE**: LCW-0.1 / P1A-R4-BEHAVIOR + P2-PROTOTYPE
- **Local path**: `E:\vivpr\ai\ebrowser\portable-minimal`
- **Declaration (verbatim)**: [OCA-DEV-1.0_DECLARATION.md](OCA-DEV-1.0_DECLARATION.md)
- **Rules**: no global MASTER HUB; no cross-posting of progress/receipts/audits to other projects; other-project Issues are read/written only on explicit Owner instruction naming target and scope. Check PROJECT NAME before reading/writing/accepting any report.
- **Roles**: Owner = goal + real-device acceptance; ChatGPT = design/audit/gates; Antigravity = code/tests/build/restore/evidence.

## Gate / State
- **Current Gate**: HOLD for product completion (development of approved R4 scope continues; not Owner-smoke stage).
- **OWNER ACTION REQUIRED**: NO
- **Baseline (unchanged, do not modify)**: `main` @ `dfccd7f01ef794df57a856fa2801c6b551bd6ac8`
- **Last audited HEAD**: `30e95369fd155afcedbf8408d44e3f3b45a3cf56`. Newer HEADs are listed in the Issue #1 progress comments; this file records the commit that introduced each change in the log below (a file cannot contain its own commit hash).
- **Restore points**: tag `lcw-restore-30e9536` (R3 audited HEAD), older R1–R3 points in [RESTORE_POINTS.md](RESTORE_POINTS.md). Rollback: `git checkout lcw-restore-30e9536` (or `git reset --hard` on a scratch branch).
- **Execution order (fixed by audit #5979561569)**: 1) launcher/transaction correctness + failure evidence → 2) real single-instance fixture probe + same-assertion negative control, then 3/5/restart/relocation → 3) input-bound artifact + P2 native patch/prerequisite report.

## Objectives (unchanged)
1. Windows x64 portable, no installer.
2. Native Chromium MV3 extensions (service worker, tabs, scripting, storage, runtime).
3. 3/5 independent instances (distinct `user-data-dir`).
4. Multiple extension side panels at once (A+B) and duplicates (A1+A2) sharing one worker/storage.
5. No accounts/sync/telemetry/updater; no Node/Electron/.NET runtime.

## Status by item (Implemented / Executed-verified / NOT_VERIFIED kept distinct)
| Item | Implemented | Executed-verified | Notes |
|---|---|---|---|
| Launcher process identity (creation time + image path + profile in command line, tri-state RUNNING/STOPPED/UNKNOWN) | yes | Go unit/concurrency tests with fake engine (UNIT/FIXTURE) | not yet against real Chromium |
| Registry errors (malformed/unreadable/denied write/same instance/concurrent) | yes | Go tests, 21/21 | status exits 1 on error, 2 on UNKNOWN |
| Extension import: lock, journal, rollback verification, name/manifest validation | yes | Go tests incl. failed promotion, failed rollback, simultaneous import | |
| Disabled-wins precedence, config read failure loads none | yes | Go tests | |
| Real MV3 behavior (PONG, scripting, storage), 3/5 isolation, restart, relocation | harness exists (`tests/run_verification_r4.py`) | NOT accepted: negative control is not a same-assertion failure | to be reworked |
| Native enable/disable/reload/remove, stable extension ID after move | — | NOT_VERIFIED | |
| P2 native multi-panel patch | design + sketch (`patches/`) | NOT_VERIFIED | needs key/registry audit, real source |
| Accessible LCW ZIP / input-bound build | — | NOT_VERIFIED | old R3 artifacts are checkpoints only |

## Known corrections pending
- R3 Receipt/`BUILD_RECEIPT.json` cite non-existent SHA `cebd5764…`; actual Action A is `cebd57627f41593f106150bf19ecc4eb420af5ce`.
- READMEs still mention `--clean-profiles` and over-claim verification; to be qualified.
- Legacy `tests/run_verification.py` and `tests/panel_spike_test.py` to be disabled/relabeled (`STATIC_ANALYSIS / NOT_VERIFIED`).

## Next actions
1. Commit launcher R4-A (this change) and post Issue #1 progress.
2. Rework harness: unique owned root, verified-owner teardown in `finally`, same-assertion negative control.
3. Real single-instance fixture probe → 3/5/restart/relocation.
4. Provenance/README/packaging fixes; P2 patch + build inventory.

## Change log
- 2026-10-04: OCA-DEV-1.0 Independent Workspace revision applied; launcher R4-A (identity registry, error propagation, import journal).

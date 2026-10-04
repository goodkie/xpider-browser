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
- **Last audited HEAD**: `43309a7a467f954810457ab991ef2e8efbc1e322` (Review #5979962054).
- **Restore points**: tag `lcw-restore-30e9536`, older R1–R3 points in [RESTORE_POINTS.md](RESTORE_POINTS.md).
- **Execution order (fixed by audit #5979561569)**: 1) launcher/transaction correctness + failure evidence (DELIVERED) → 2) real single-instance fixture probe + SAME-assertion negative control, then 3/5/restart/relocation (DELIVERED) → 3) input-bound artifact + P2 native patch/prerequisite report.

## Objectives (unchanged)
1. Windows x64 portable, no installer.
2. Native Chromium MV3 extensions (service worker, tabs, scripting, storage, runtime).
3. 3/5 independent instances (distinct `user-data-dir`).
4. Multiple extension side panels at once (A+B) and duplicates (A1+A2) sharing one worker/storage.
5. No accounts/sync/telemetry/updater; no Node/Electron/.NET runtime.

## Status by item (Implemented / Executed-verified / NOT_VERIFIED kept distinct)
| Item | Implemented | Executed-verified | Notes |
|---|---|---|---|
| Launcher process identity (creation time + image path + exact parsed `--user-data-dir`, tri-state RUNNING/STOPPED/UNKNOWN) | yes | Go unit/concurrency tests with fake engine (24/24 PASS) & live Chromium test | Prefix collisions, quoted spaces, and URL parameters defended |
| Same-instance handoff with `--new-window` | yes | Go test & live Chromium handoff verification | Passes `--new-window`, live owner preserved |
| Root-relative recovery journal, unknown error preservation, unresolved destination blocking | yes | Go tests (moved root, locked destination, unreadable stat) | Protects against cross-folder/reparse escape |
| Registry errors (malformed/unreadable/denied write/same instance/concurrent) | yes | Go tests, 24/24 PASS | status exits 1 on error, 2 on UNKNOWN |
| Real MV3 behavior (PONG, scripting, cookie, storage, download) | yes | Live Chromium suite `tests/run_verification_r4.py` (7/7 PASS) | Cold-start tolerance, active tab scripting |
| Negative control (SAME assertion fails when extension disabled) | yes | Live Chromium suite T2 (PASS) | Uses exact `evaluate_fixture_assertion` to prove no false positives |
| 3/5 instance isolation, restart persistence, zero leakage | yes | Live Chromium suite T3-A, T3-B, T3-C, T4 (PASS) | Distinct cookie & localStorage sentinels |
| Same-PC relocation (Korean characters & spaces in path) | yes | Live Chromium suite T5 (PASS) | Stable extension ID `mpmmjhlclnpalhaeilhkfkacdjkkhkli` |
| Legacy test runner safety | yes | `run_verification.py` disabled; `panel_spike_test.py` relabeled STATIC_ANALYSIS | Registry-wide taskkill prevented |
| Native enable/disable/reload/remove | — | NOT_VERIFIED | Supported currently via launcher config/flags |
| P2 native multi-panel patch | design + sketch (`patches/`) | NOT_VERIFIED | in-tree C++ patch required for true duplicate SidePanel |
| Accessible LCW ZIP / input-bound build | — | NOT_VERIFIED | Next priority under Order 3 |

## Change log
- 2026-10-04: OCA-DEV-1.0 Independent Workspace revision applied; launcher R4-A (identity registry, error propagation, import journal).
- 2026-10-04: R4-B delivered: exact command-line profile parsing, `--new-window` handoff, root-relative recovery journal, live Chromium MV3 verification (7/7 PASS including SAME-assertion negative control), legacy test runners safely disabled.

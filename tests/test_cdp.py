#!/usr/bin/env python3
# [PROJECT]: Lite Chromium Portable
# [WORKSPACE ROOT]: E:\vivpr\ai\ebrowser
# [BOUND THREAD]: goodkie/v-show Issue #8
# [ISOLATION SANITY CHECK]: VERIFIED (Zero cross-project contamination)

import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request
from datetime import datetime, timezone

app_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
engine_exe = os.path.join(app_root, "engine", "chrome.exe")
exts_dir = os.path.join(app_root, "extensions")
fixture_id = "mpmmjhlclnpalhaeilhkfkacdjkkhkli"
debug_port = 9444
test_profile = os.path.join(app_root, "data", "profiles", "test_ext_cdp")
evidence_json = os.path.join(app_root, "tests", "real_extension_evidence.json")
evidence_log = os.path.join(app_root, "tests", "real_extension_evidence.log")

print("=" * 78)
print("[TEST] Real Multi-Window Extension Execution & CDP Verification")
print("=" * 78)

# Discover valid extensions
loaded_exts = []
for entry in sorted(os.listdir(exts_dir)):
    ep = os.path.join(exts_dir, entry)
    if os.path.isdir(ep) and not entry.startswith((".", "_", "backups", "incoming")):
        if os.path.exists(os.path.join(ep, "manifest.json")):
            loaded_exts.append(ep)

ext_arg = "--load-extension=" + ",".join(loaded_exts)
ext_except_arg = "--disable-extensions-except=" + ",".join(loaded_exts)

if os.path.exists(test_profile):
    shutil.rmtree(test_profile, ignore_errors=True)
os.makedirs(test_profile, exist_ok=True)

url1 = f"chrome-extension://{fixture_id}/sidepanel.html"
url2 = f"chrome-extension://{fixture_id}/popup.html"

cmd1 = [
    engine_exe,
    f"--user-data-dir={test_profile}",
    f"--remote-debugging-port={debug_port}",
    "--remote-allow-origins=*",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-sync",
    "--disable-breakpad",
    ext_arg,
    ext_except_arg,
    f"--app={url1}",
]

proc1 = None
proc2 = None

try:
    print(f"\n[STEP 1] Launching Chromium with Tool Window #1 ({url1})...")
    proc1 = subprocess.Popen(cmd1)
    print(f"  -> Primary Engine Process PID: {proc1.pid}")

    # Wait for CDP to respond (polling up to 10 seconds)
    targets = []
    for attempt in range(10):
        time.sleep(1)
        try:
            req = urllib.request.Request(f"http://127.0.0.1:{debug_port}/json/list")
            with urllib.request.urlopen(req, timeout=2) as resp:
                targets = json.loads(resp.read().decode("utf-8"))
                if len(targets) > 0:
                    print(f"  -> Connected to CDP on attempt {attempt+1}! Total targets: {len(targets)}")
                    break
        except Exception:
            pass

    if not targets:
        raise RuntimeError("Failed to connect to Chromium CDP endpoint!")

    print(f"\n[STEP 2] Launching Second Concurrent Extension Window ({url2}) in the same profile...")
    cmd2 = [
        engine_exe,
        f"--user-data-dir={test_profile}",
        "--no-first-run",
        ext_arg,
        ext_except_arg,
        f"--app={url2}",
    ]
    proc2 = subprocess.Popen(cmd2)
    print(f"  -> Secondary Window Launcher PID: {proc2.pid}")
    time.sleep(4)

    # Query CDP again to see both targets active simultaneously
    req = urllib.request.Request(f"http://127.0.0.1:{debug_port}/json/list")
    with urllib.request.urlopen(req, timeout=2) as resp:
        all_targets = json.loads(resp.read().decode("utf-8"))

    print(f"\n[STEP 3] Inspecting Active CDP Targets (Polling up to 10s)...")
    panel_targets = []
    worker_targets = []
    all_targets = []
    for poll_attempt in range(10):
        time.sleep(1)
        try:
            req = urllib.request.Request(f"http://127.0.0.1:{debug_port}/json/list")
            with urllib.request.urlopen(req, timeout=2) as resp:
                all_targets = json.loads(resp.read().decode("utf-8"))
            panel_targets = [t for t in all_targets if t.get("url", "").startswith(f"chrome-extension://{fixture_id}/")]
            worker_targets = [t for t in all_targets if t.get("type") == "service_worker"]
            if len(panel_targets) >= 2:
                print(f"  -> Both panel targets detected on poll {poll_attempt+1}!")
                break
        except Exception:
            pass

    for t in all_targets:
        print(f"  [TARGET] Type: {t.get('type'):<16} Title: {t.get('title')!r:<25} URL: {t.get('url')}")

    print(f"\n[STEP 4] Verifying Results:")
    print(f"  -> Total Concurrent Fixture Panel Windows: {len(panel_targets)}")
    for i, pt in enumerate(panel_targets, 1):
        print(f"     Window #{i}: ID={pt.get('id')} | Title={pt.get('title')!r} | URL={pt.get('url')}")

    if len(panel_targets) < 2:
        raise RuntimeError(f"Expected at least 2 active panel targets, but found {len(panel_targets)}!")

    print("\n  [PASS] Verified 2 concurrent extension windows (sidepanel.html + popup.html) active simultaneously!")

    evidence = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "fixture_extension_id": fixture_id,
        "engine_pid": proc1.pid,
        "debug_port": debug_port,
        "active_panel_windows_count": len(panel_targets),
        "panel_windows": [
            {
                "window_index": i + 1,
                "target_id": pt.get("id"),
                "title": pt.get("title"),
                "type": pt.get("type"),
                "url": pt.get("url"),
                "ws_debugger_url": pt.get("webSocketDebuggerUrl"),
            }
            for i, pt in enumerate(panel_targets)
        ],
        "service_workers": [
            {
                "target_id": wt.get("id"),
                "url": wt.get("url"),
                "type": wt.get("type"),
            }
            for wt in worker_targets
        ],
        "all_cdp_targets_count": len(all_targets),
        "verdict": "PASS — Concurrent multi-window extension panels confirmed active simultaneously via CDP.",
    }

    with open(evidence_json, "w", encoding="utf-8") as f:
        json.dump(evidence, f, indent=2)
    print(f"\n[EVIDENCE SAVED] {evidence_json}")

    log_content = [
        "=== REAL MULTI-WINDOW EXTENSION EXECUTION EVIDENCE ===",
        f"Timestamp: {evidence['timestamp']}",
        f"Engine PID: {proc1.pid}",
        f"Fixture Extension ID: {fixture_id}",
        f"Concurrent Extension Panel Windows Verified: {len(panel_targets)}",
        f"Window #1: Title={panel_targets[0].get('title')!r} | URL={panel_targets[0].get('url')} | TargetID={panel_targets[0].get('id')}",
        f"Window #2: Title={panel_targets[1].get('title')!r} | URL={panel_targets[1].get('url')} | TargetID={panel_targets[1].get('id')}",
        f"Active Service Workers Count: {len(worker_targets)}",
        "Result: PASS (Independent concurrent rendering of 2 extension panels without replacement or closing)",
    ]
    with open(evidence_log, "w", encoding="utf-8") as f:
        f.write("\n".join(log_content) + "\n")
    print(f"[LOG SAVED]      {evidence_log}")
    print("\n" + "=" * 78)
    print("[SUCCESS] All CDP and multi-window extension tests passed!")
    print("=" * 78)

finally:
    print("\n[CLEANUP] Terminating test processes only...")
    if proc1 and proc1.poll() is None:
        proc1.terminate()
        try:
            proc1.wait(timeout=3)
        except Exception:
            proc1.kill()
        print(f"  -> Terminated test engine PID {proc1.pid}")
    if proc2 and proc2.poll() is None:
        proc2.terminate()
        try:
            proc2.wait(timeout=3)
        except Exception:
            proc2.kill()
    if os.path.exists(test_profile):
        shutil.rmtree(test_profile, ignore_errors=True)

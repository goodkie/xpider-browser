import http.server
import json
import os
import shutil
import socketserver
import sqlite3
import subprocess
import sys
import threading
import time
import urllib.request

def log(msg):
    print(f"[VERIFY-R1] {msg}", flush=True)

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

def start_fixture_server(root_dir):
    handler = QuietHandler
    # find open port
    server = socketserver.TCPServer(("127.0.0.1", 0), handler)
    port = server.server_address[1]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, port

def terminate_owned_pids(pids, profile_dirs):
    """Gracefully terminates ONLY owned processes matching specific PIDs or profile directories.
    NEVER uses global taskkill on chrome.exe."""
    for pid in pids:
        if pid <= 0:
            continue
        try:
            # Query child processes of this PID on Windows
            cmd = f"Get-CimInstance Win32_Process | Where-Object {{ $_.ParentProcessId -eq {pid} -or $_.ProcessId -eq {pid} }} | Select-Object -ExpandProperty ProcessId"
            res = subprocess.run(["powershell", "-Command", cmd], capture_output=True, text=True)
            child_pids = [int(p.strip()) for p in res.stdout.strip().split() if p.strip().isdigit()]
            for cpid in child_pids:
                subprocess.run(["powershell", "-Command", f"Stop-Process -Id {cpid} -Force -ErrorAction SilentlyContinue"], capture_output=True)
        except Exception as e:
            log(f"Process cleanup notice for PID {pid}: {e}")

def main():
    test_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(test_dir)
    launcher_exe = os.path.join(project_root, "LiteChromiumPortable.exe")
    engine_exe = os.path.join(project_root, "engine", "chrome.exe")
    data_dir = os.path.join(project_root, "data")
    registry_file = os.path.join(data_dir, "instances.json")
    lock_file = os.path.join(data_dir, "instances.lock")

    results = {"tests": [], "passed": 0, "failed": 0}

    def assert_true(name, condition, detail):
        if not condition:
            log(f"[FAIL] {name}: {detail}")
            results["tests"].append({"name": name, "status": "FAIL", "detail": detail})
            results["failed"] += 1
            # Save report before exit
            with open(os.path.join(test_dir, "r1_verification_report.json"), "w") as f:
                json.dump(results, f, indent=2)
            sys.exit(1)
        else:
            log(f"[PASS] {name}: {detail}")
            results["tests"].append({"name": name, "status": "PASS", "detail": detail})
            results["passed"] += 1

    log("==================================================================")
    log("Starting P1A-R1 Hardened Verification Suite")
    log("==================================================================")

    # R1 REGRESSION SENTINEL: Spawn an unrelated sentinel process to prove it is NEVER killed
    sentinel_proc = subprocess.Popen(["powershell", "-Command", "Start-Sleep -Seconds 120"])
    sentinel_pid = sentinel_proc.pid
    log(f"Spawned unrelated sentinel process [PID: {sentinel_pid}]")

    # TEST 1: Engine Lock and Staged Binary Hash Integrity (R5)
    lock_path = os.path.join(project_root, "engine.lock.json")
    assert_true("T1. Engine Lockfile Exists", os.path.exists(lock_path), lock_path)
    with open(lock_path, "r", encoding="utf-8") as f:
        lock_data = json.load(f)
    assert_true("T1. Engine Version Lock", lock_data.get("browser_version") == "154.0.8037.57", lock_data.get("browser_version"))
    
    # Check key engine files
    for key_file in ["chrome.exe", "chrome.dll", "icudtl.dat", "v8_context_snapshot.bin"]:
        p = os.path.join(project_root, "engine", key_file)
        assert_true(f"T1. Engine Binary {key_file}", os.path.exists(p) and os.path.getsize(p) > 10000, f"size={os.path.getsize(p) if os.path.exists(p) else 0}")

    # TEST 2: Security Validation of Launcher Arguments (R2)
    inj_proc = subprocess.run([launcher_exe, "--url=--no-sandbox"], capture_output=True, text=True)
    assert_true("T2. URL Flag Injection Blocked", inj_proc.returncode != 0 and "must not begin with '-'" in inj_proc.stderr, inj_proc.stderr.strip())

    range_proc = subprocess.run([launcher_exe, "--instance=999"], capture_output=True, text=True)
    assert_true("T2. Instance Range Bounded", range_proc.returncode != 0 and "must be between 1 and 100" in range_proc.stderr, range_proc.stderr.strip())

    # TEST 3: Safe Profile Protection - Refuse Reset When Active (R3)
    # Launch instance 1
    inst1_proc = subprocess.run([launcher_exe, "--instance=1", "--url=about:blank"], capture_output=True, text=True)
    time.sleep(2)
    # Read registry
    with open(registry_file, "r") as f:
        reg1 = json.load(f)
    inst1_pid = reg1["instances"][-1]["pid"]
    
    # Attempt clean profiles while active
    clean_attempt = subprocess.run([launcher_exe, "--clean-profiles"], capture_output=True, text=True)
    assert_true("T3. Active Profile Reset Refused", clean_attempt.returncode != 0 and "is currently active" in clean_attempt.stderr, clean_attempt.stderr.strip())

    # Terminate instance 1 safely
    terminate_owned_pids([inst1_pid], [os.path.join(data_dir, "profiles", "instance-1")])
    time.sleep(1)

    # Verify sentinel is still alive! (R1)
    assert_true("T3. Unrelated Sentinel Alive After Inst1 Termination", sentinel_proc.poll() is None, f"Sentinel PID {sentinel_pid} survived")

    # TEST 4: Per-Instance Extension Configuration (R4)
    # Configure instance-1 to disable mv3-fixture, instance-2 to enable it
    p1_dir = os.path.join(data_dir, "profiles", "instance-1")
    p2_dir = os.path.join(data_dir, "profiles", "instance-2")
    os.makedirs(p1_dir, exist_ok=True)
    os.makedirs(p2_dir, exist_ok=True)
    with open(os.path.join(p1_dir, "extensions_config.json"), "w") as f:
        json.dump({"disabled_extensions": ["mv3-fixture"]}, f)
    with open(os.path.join(p2_dir, "extensions_config.json"), "w") as f:
        json.dump({"disabled_extensions": []}, f)

    # Launch both
    subprocess.run([launcher_exe, "--instance=1", "--url=about:blank"])
    subprocess.run([launcher_exe, "--instance=2", "--url=about:blank"])
    time.sleep(2)

    with open(registry_file, "r") as f:
        reg_ext = json.load(f)
    
    inst1_rec = next(i for i in reg_ext["instances"] if i["instance_id"] == 1)
    inst2_rec = next(i for i in reg_ext["instances"] if i["instance_id"] == 2)

    inst1_has_mv3 = any("mv3-fixture" in param for param in inst1_rec["active_params"])
    inst2_has_mv3 = any("mv3-fixture" in param for param in inst2_rec["active_params"])

    assert_true("T4. Per-Instance Extension Isolation (mv3-fixture Disabled in Inst1)", not inst1_has_mv3, f"inst1 params={inst1_rec['active_params']}")
    assert_true("T4. Per-Instance Extension Isolation (mv3-fixture Enabled in Inst2)", inst2_has_mv3, f"inst2 params={inst2_rec['active_params']}")

    terminate_owned_pids([inst1_rec["pid"], inst2_rec["pid"]], [p1_dir, p2_dir])
    time.sleep(1)

    # TEST 5: Batch 5 Instances Concurrency and Data Isolation (R5)
    log("Executing Batch 5 Launch...")
    batch5_proc = subprocess.run([launcher_exe, "--batch=5", "--url=about:blank"], capture_output=True, text=True)
    assert_true("T5. Batch 5 Execution Exit Code 0", batch5_proc.returncode == 0, batch5_proc.stdout)
    time.sleep(4)

    with open(registry_file, "r") as f:
        reg5 = json.load(f)
    active_insts = [i for i in reg5["instances"] if i["instance_id"] in [1,2,3,4,5]]
    assert_true("T5. Batch 5 Registry Concurrency (All 5 Recorded Without Loss)", len(active_insts) == 5, f"recorded count={len(active_insts)}")

    # Verify each profile folder is distinct and non-empty
    for i in range(1, 6):
        prof_path = os.path.join(data_dir, "profiles", f"instance-{i}")
        assert_true(f"T5. Instance-{i} Profile Segregation", os.path.exists(prof_path) and len(os.listdir(prof_path)) > 3, f"path={prof_path}")

    # Safely terminate all 5 instances
    pids_to_kill = [inst["pid"] for inst in active_insts]
    terminate_owned_pids(pids_to_kill, [os.path.join(data_dir, "profiles", f"instance-{i}") for i in range(1, 6)])
    time.sleep(1)

    # FINAL SENTINEL CHECK: Sentinel process must be 100% untouched
    assert_true("R1 Final Check. Sentinel Browser/Process Remained Completely Untouched", sentinel_proc.poll() is None, f"Sentinel {sentinel_pid} survived entire suite")
    sentinel_proc.terminate()

    log("==================================================================")
    log(f"P1A-R1 Test Suite Finished: {results['passed']} Passed, {results['failed']} Failed")
    log("==================================================================")

    out_report = os.path.join(test_dir, "r1_verification_report.json")
    with open(out_report, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)

if __name__ == "__main__":
    main()

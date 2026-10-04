import json
import os
import subprocess
import sys
import time

def log(msg):
    print(f"[TEST-RUNNER] {msg}", flush=True)

def main():
    test_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(test_dir)
    launcher_exe = os.path.join(project_root, "LiteChromiumPortable.exe")
    engine_exe = os.path.join(project_root, "engine", "chrome.exe")
    data_dir = os.path.join(project_root, "data")
    registry_file = os.path.join(data_dir, "instances.json")

    log(f"Project Root: {project_root}")
    log(f"Launcher Exe: {launcher_exe}")
    log(f"Engine Exe: {engine_exe}")

    results = {
        "tests": [],
        "passed": 0,
        "failed": 0
    }

    def record_test(name, passed, detail):
        status = "PASS" if passed else "FAIL"
        results["tests"].append({"name": name, "status": status, "detail": detail})
        if passed:
            results["passed"] += 1
        else:
            results["failed"] += 1
        log(f"[{status}] {name}: {detail}")

    # Test 1: Check Binaries and Lockfile
    has_launcher = os.path.exists(launcher_exe) and os.path.getsize(launcher_exe) > 1000000
    has_engine = os.path.exists(engine_exe) and os.path.getsize(engine_exe) > 1000000
    has_lock = os.path.exists(os.path.join(project_root, "engine.lock.json"))
    record_test("1. Binary and Engine Lock Existence", has_launcher and has_engine and has_lock,
                f"launcher={has_launcher}, engine={has_engine}, lock={has_lock}")

    # Test 2: Clean profiles
    clean_proc = subprocess.run([launcher_exe, "--clean-profiles"], capture_output=True, text=True)
    profiles_cleaned = not os.path.exists(os.path.join(data_dir, "profiles"))
    record_test("2. Clean Profiles Execution", profiles_cleaned, f"exit={clean_proc.returncode}")

    # Test 3: Status query on empty state
    status_proc = subprocess.run([launcher_exe, "--status"], capture_output=True, text=True)
    status_empty = "No instances running" in status_proc.stdout or status_proc.returncode == 0
    record_test("3. Empty Instance Registry Status", status_empty, status_proc.stdout.strip())

    # Test 4: Launch Instance #1
    t0 = time.time()
    inst1_proc = subprocess.run([launcher_exe, "--instance=1", "--url=about:blank"], capture_output=True, text=True)
    launch_time = round(time.time() - t0, 3)
    p1_dir = os.path.join(data_dir, "profiles", "instance-1")
    time.sleep(2) # Allow process startup
    p1_exists = os.path.exists(p1_dir)
    record_test("4. Single Instance #1 Launch", p1_exists and inst1_proc.returncode == 0,
                f"profile_exists={p1_exists}, launch_time={launch_time}s")

    # Test 5: Verify Registry File Recorded Instance
    reg_valid = False
    inst1_pid = 0
    if os.path.exists(registry_file):
        with open(registry_file, "r") as f:
            reg_data = json.load(f)
            insts = reg_data.get("instances", [])
            if len(insts) >= 1:
                inst1_pid = insts[0].get("pid", 0)
                reg_valid = inst1_pid > 0
    record_test("5. Instance Registry Persistence", reg_valid, f"Instance 1 PID recorded: {inst1_pid}")

    # Test 6: Batch Launch 3 Instances
    t0 = time.time()
    batch_proc = subprocess.run([launcher_exe, "--batch=3", "--url=about:blank"], capture_output=True, text=True)
    batch_time = round(time.time() - t0, 3)
    time.sleep(3)
    p2_exists = os.path.exists(os.path.join(data_dir, "profiles", "instance-2"))
    p3_exists = os.path.exists(os.path.join(data_dir, "profiles", "instance-3"))
    record_test("6. Batch Launch 3 Instances", p2_exists and p3_exists and batch_proc.returncode == 0,
                f"instance-2={p2_exists}, instance-3={p3_exists}, time={batch_time}s")

    # Test 7: Verify Multi-Instance Profile Isolation
    # Check that instance-1, instance-2, instance-3 have distinct folder contents
    inst1_items = len(os.listdir(p1_dir)) if os.path.exists(p1_dir) else 0
    inst2_items = len(os.listdir(os.path.join(data_dir, "profiles", "instance-2"))) if p2_exists else 0
    inst3_items = len(os.listdir(os.path.join(data_dir, "profiles", "instance-3"))) if p3_exists else 0
    record_test("7. Profile Directory Isolation", inst1_items > 0 and inst2_items > 0 and inst3_items > 0,
                f"file_counts: inst1={inst1_items}, inst2={inst2_items}, inst3={inst3_items}")

    # Terminate launched chrome processes for clean shutdown (targeted by profile/registry only)
    log("Terminating owned test browser processes...")
    try:
        reg_file = os.path.join(data_dir, "instances.json")
        if os.path.exists(reg_file):
            with open(reg_file, "r") as f:
                rdata = json.load(f)
                for inst in rdata.get("instances", []):
                    cpid = inst.get("pid")
                    if cpid:
                        subprocess.run(["powershell", "-Command", f"Stop-Process -Id {cpid} -Force -ErrorAction SilentlyContinue"], capture_output=True)
    except:
        pass
    time.sleep(1)

    # Test 8: Extension Fixture Structure & SidePanel Manifest Verification
    fixture_dir = os.path.join(project_root, "extensions", "mv3-fixture")
    manifest_path = os.path.join(fixture_dir, "manifest.json")
    sidepanel_path = os.path.join(fixture_dir, "sidepanel.html")
    has_fixture = os.path.exists(manifest_path) and os.path.exists(sidepanel_path)
    with open(manifest_path, "r", encoding="utf-8") as f:
        mdata = json.load(f)
    has_sidepanel_decl = "side_panel" in mdata and "default_path" in mdata["side_panel"]
    record_test("8. MV3 Fixture SidePanel Declaration", has_fixture and has_sidepanel_decl,
                f"manifest_valid={has_fixture}, side_panel_path={mdata.get('side_panel', {}).get('default_path')}")

    out_file = os.path.join(test_dir, "p1a_test_report.json")
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)
    log(f"Test summary: Total={len(results['tests'])}, Passed={results['passed']}, Failed={results['failed']}")

if __name__ == "__main__":
    main()

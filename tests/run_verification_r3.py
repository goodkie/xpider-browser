import hashlib
import json
import os
import shutil
import subprocess
import sys
import time

sys.stdout.reconfigure(encoding='utf-8')

def log(msg):
    print(f"[VERIFY-R3] {msg}", flush=True)

def terminate_process_by_pid(pid):
    if pid <= 0:
        return
    subprocess.run(["powershell", "-Command", f"Stop-Process -Id {pid} -Force -ErrorAction SilentlyContinue"], capture_output=True)

def terminate_owned_tree(root_pid):
    if root_pid <= 0:
        return
    cmd = f"""
    $targetPids = @({root_pid})
    $toCheck = @({root_pid})
    while ($toCheck.Count -gt 0) {{
        $nextCheck = @()
        foreach ($id in $toCheck) {{
            $kids = Get-CimInstance Win32_Process | Where-Object {{ $_.ParentProcessId -eq $id }} | Select-Object -ExpandProperty ProcessId
            if ($kids) {{
                foreach ($k in $kids) {{
                    if ($targetPids -notcontains $k) {{
                        $targetPids += $k
                        $nextCheck += $k
                    }}
                }}
            }}
        }}
        $toCheck = $nextCheck
    }}
    foreach ($p in $targetPids) {{
        Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
    }}
    """
    subprocess.run(["powershell", "-Command", cmd], capture_output=True)

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    temp_test_root = os.path.join(project_root, "temp_test_root_r3")

    assertions = []

    def assert_true(name, condition, detail=""):
        status = "PASS" if condition else "FAIL"
        assertions.append({"name": name, "status": status, "detail": str(detail)})
        log(f"[{status}] {name} - {detail}")
        if not condition:
            log(f"CRITICAL ASSERTION FAILED: {name}")

    log("=== Commencing P1A-R3 Isolated Runtime Verification ===")

    # Setup isolated test root
    if os.path.exists(temp_test_root):
        shutil.rmtree(temp_test_root, ignore_errors=True)
    os.makedirs(temp_test_root, exist_ok=True)

    log(f"Preparing isolated runtime test root in: {temp_test_root}")
    # Copy essential binaries to temp_test_root
    shutil.copy2(os.path.join(project_root, "LiteChromiumPortable.exe"), os.path.join(temp_test_root, "LiteChromiumPortable.exe"))
    shutil.copy2(os.path.join(project_root, "engine.lock.json"), os.path.join(temp_test_root, "engine.lock.json"))
    shutil.copy2(os.path.join(project_root, "BUILD_RECEIPT.json"), os.path.join(temp_test_root, "BUILD_RECEIPT.json"))
    shutil.copy2(os.path.join(project_root, "LICENSE.txt"), os.path.join(temp_test_root, "LICENSE.txt"))
    
    # Copy engine directory
    shutil.copytree(os.path.join(project_root, "engine"), os.path.join(temp_test_root, "engine"))

    # Copy minimal test extensions
    os.makedirs(os.path.join(temp_test_root, "extensions"), exist_ok=True)
    shutil.copytree(os.path.join(project_root, "extensions", "mv3-fixture"), os.path.join(temp_test_root, "extensions", "mv3-fixture"))

    isolated_launcher = os.path.join(temp_test_root, "LiteChromiumPortable.exe")
    isolated_engine = os.path.join(temp_test_root, "engine", "chrome.exe")

    # 1. Independent Sentinel Chromium Browser
    sentinel_profile = os.path.join(temp_test_root, "sentinel_profile")
    os.makedirs(sentinel_profile, exist_ok=True)
    sentinel_marker = os.path.join(sentinel_profile, "sentinel_marker.txt")
    with open(sentinel_marker, "w") as f:
        f.write("SENTINEL_SURVIVAL_DATA_INTEGRITY")

    sentinel_proc = subprocess.Popen([
        isolated_engine,
        f"--user-data-dir={sentinel_profile}",
        "--no-first-run",
        "--no-default-browser-check",
        "about:blank"
    ])
    sentinel_pid = sentinel_proc.pid
    log(f"Spawned Sentinel Chromium Browser [PID: {sentinel_pid}]")
    time.sleep(1.5)

    try:
        # T1: Security Bounds: --clean-profiles Permanent Rejection
        p_clean = subprocess.run([isolated_launcher, "--clean-profiles"], capture_output=True, text=True)
        assert_true("T1. Permanent Clean Profiles Rejection", p_clean.returncode != 0 and "permanently disabled" in p_clean.stderr, f"rc={p_clean.returncode}, stderr={p_clean.stderr.strip()}")

        # T2: Security Bounds: URL Switch Injection Defense
        p_inj = subprocess.run([isolated_launcher, "--url=--disable-web-security"], capture_output=True, text=True)
        assert_true("T2. URL Switch Injection Defense", p_inj.returncode != 0, f"rc={p_inj.returncode}, stderr={p_inj.stderr.strip()}")

        # T3: Launch 3 Concurrent Isolated Instances in temp_test_root
        log("Launching 3 concurrent instances in isolated test root...")
        p1 = subprocess.Popen([isolated_launcher, "--instance=1", "--url=about:blank"])
        p2 = subprocess.Popen([isolated_launcher, "--instance=2", "--url=about:blank"])
        p3 = subprocess.Popen([isolated_launcher, "--instance=3", "--url=about:blank"])

        # Wait for all 3 processes to register in registry
        reg_file = os.path.join(temp_test_root, "data", "instances.json")
        active_instances = []
        deadline = time.time() + 15.0
        while time.time() < deadline:
            if os.path.exists(reg_file):
                try:
                    with open(reg_file, "r") as f:
                        rdata = json.load(f)
                        insts = [i for i in rdata.get("instances", []) if i.get("instance_id") in [1, 2, 3]]
                        if len(insts) == 3:
                            active_instances = insts
                            break
                except:
                    pass
            time.sleep(0.3)

        assert_true("T3. Multi-Instance Concurrency (3 Registered in Isolated Root)", len(active_instances) == 3, f"count={len(active_instances)}")

        # Wait for profiles to be populated on disk
        p1_dir = os.path.join(temp_test_root, "data", "profiles", "instance-1")
        p2_dir = os.path.join(temp_test_root, "data", "profiles", "instance-2")
        p3_dir = os.path.join(temp_test_root, "data", "profiles", "instance-3")

        p1_files = 0
        p2_files = 0
        p3_files = 0
        deadline = time.time() + 10.0
        while time.time() < deadline:
            p1_files = len(os.listdir(p1_dir)) if os.path.exists(p1_dir) else 0
            p2_files = len(os.listdir(p2_dir)) if os.path.exists(p2_dir) else 0
            p3_files = len(os.listdir(p3_dir)) if os.path.exists(p3_dir) else 0
            if p1_files > 0 and p2_files > 0 and p3_files > 0:
                break
            time.sleep(0.3)

        assert_true("T4. Instance 1 Profile Created & Populated", p1_files > 0, f"entries={p1_files}")
        assert_true("T4. Instance 2 Profile Created & Populated", p2_files > 0, f"entries={p2_files}")
        assert_true("T4. Instance 3 Profile Created & Populated", p3_files > 0, f"entries={p3_files}")

        # Terminate running test instances
        for inst in active_instances:
            terminate_owned_tree(inst.get("pid"))
        time.sleep(1.0)

        # T5: Extension Configuration Segregation: Enabled, Disabled, and Empty Whitelist
        p4_dir = os.path.join(temp_test_root, "data", "profiles", "instance-4")
        p5_dir = os.path.join(temp_test_root, "data", "profiles", "instance-5")
        p6_dir = os.path.join(temp_test_root, "data", "profiles", "instance-6")
        os.makedirs(p4_dir, exist_ok=True)
        os.makedirs(p5_dir, exist_ok=True)
        os.makedirs(p6_dir, exist_ok=True)

        with open(os.path.join(p4_dir, "extensions_config.json"), "w") as f:
            json.dump({"enabled_extensions": ["mv3-fixture"]}, f)
        with open(os.path.join(p5_dir, "extensions_config.json"), "w") as f:
            json.dump({"disabled_extensions": ["mv3-fixture"]}, f)
        with open(os.path.join(p6_dir, "extensions_config.json"), "w") as f:
            json.dump({"enabled_extensions": []}, f)  # empty allowlist -> zero extensions loaded!

        p_4 = subprocess.Popen([isolated_launcher, "--instance=4", "--url=about:blank"])
        p_5 = subprocess.Popen([isolated_launcher, "--instance=5", "--url=about:blank"])
        p_6 = subprocess.Popen([isolated_launcher, "--instance=6", "--url=about:blank"])

        inst4_loaded = False
        inst5_excluded = False
        inst6_zero_loaded = False
        active_ext_pids = []

        deadline = time.time() + 15.0
        while time.time() < deadline:
            if os.path.exists(reg_file):
                try:
                    with open(reg_file, "r") as f:
                        rdata = json.load(f)
                        insts = [i for i in rdata.get("instances", []) if i.get("instance_id") in [4, 5, 6]]
                        if len(insts) == 3:
                            for inst in insts:
                                iid = inst.get("instance_id")
                                params = " ".join(inst.get("active_params", []))
                                active_ext_pids.append(inst.get("pid"))
                                if iid == 4 and "mv3-fixture" in params:
                                    inst4_loaded = True
                                if iid == 5 and "mv3-fixture" not in params:
                                    inst5_excluded = True
                                if iid == 6 and "--load-extension" not in params:
                                    inst6_zero_loaded = True
                            break
                except:
                    pass
            time.sleep(0.3)

        for pid in set(active_ext_pids):
            terminate_owned_tree(pid)
        time.sleep(1.0)

        assert_true("T5. Explicit Enabled Extension Loaded (Inst 4)", inst4_loaded, "mv3-fixture loaded")
        assert_true("T5. Explicit Disabled Extension Excluded (Inst 5)", inst5_excluded, "mv3-fixture excluded")
        assert_true("T5. Empty Whitelist Loads Zero Extensions (Inst 6)", inst6_zero_loaded, "zero extensions loaded")

        # T6: Sentinel Chromium Browser Survival & Data Integrity Assertion
        sentinel_alive = subprocess.run(
            ["powershell", "-Command", f"Get-Process -Id {sentinel_pid} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id"],
            capture_output=True, text=True
        ).stdout.strip()
        assert_true("T6. Sentinel Chromium Browser Alive", sentinel_alive == str(sentinel_pid), f"PID={sentinel_pid}")
        
        with open(sentinel_marker, "r") as f:
            content = f.read()
        assert_true("T6. Sentinel Profile Data Unmodified", content == "SENTINEL_SURVIVAL_DATA_INTEGRITY", "marker data verified")

    finally:
        log("Cleaning up test harness...")
        if sentinel_pid > 0:
            terminate_owned_tree(sentinel_pid)
        if os.path.exists(temp_test_root):
            shutil.rmtree(temp_test_root, ignore_errors=True)

    passed = sum(1 for a in assertions if a["status"] == "PASS")
    failed = sum(1 for a in assertions if a["status"] == "FAIL")

    report = {
        "suite": "P1A-R3 Isolated Runtime Verification",
        "passed": passed,
        "failed": failed,
        "assertions": assertions
    }

    out_file = os.path.join(script_dir, "r3_verification_report.json")
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    log(f"Verification Suite Completed: {passed} PASSED, {failed} FAILED.")
    if failed > 0:
        sys.exit(1)

if __name__ == "__main__":
    main()

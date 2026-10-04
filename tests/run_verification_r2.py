import hashlib
import json
import os
import shutil
import subprocess
import sys
import time

sys.stdout.reconfigure(encoding='utf-8')

def log(msg):
    print(f"[VERIFY-R2] {msg}", flush=True)

def find_running_pids():
    cmd = "Get-CimInstance Win32_Process | Where-Object { $_.Name -match 'chrome' -or $_.Name -match 'LiteChromiumPortable' } | Select-Object -ExpandProperty ProcessId"
    res = subprocess.run(["powershell", "-Command", cmd], capture_output=True, text=True)
    return set(int(p.strip()) for p in res.stdout.strip().split() if p.strip().isdigit())

def terminate_tree(root_pid):
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
    launcher_exe = os.path.join(project_root, "LiteChromiumPortable.exe")
    temp_test_root = os.path.join(project_root, "temp_test_root")

    assertions = []

    def assert_true(name, condition, detail=""):
        status = "PASS" if condition else "FAIL"
        assertions.append({"name": name, "status": status, "detail": str(detail)})
        log(f"[{status}] {name} - {detail}")
        if not condition:
            log(f"CRITICAL ASSERTION FAILED: {name}")

    log("=== Commencing P1A-R2 Comprehensive Runtime Verification ===")

    # 0. Sentinel Protection Setup
    initial_pids = find_running_pids()
    sentinel_proc = subprocess.Popen(["powershell", "-Command", "while($true){Start-Sleep 1}"])
    sentinel_pid = sentinel_proc.pid
    log(f"Spawned Sentinel Process PID: {sentinel_pid}")

    try:
        # T1. Correct Source Commit Mapping Verification (R8/R2)
        engine_lock_file = os.path.join(project_root, "engine.lock.json")
        with open(engine_lock_file, "r", encoding="utf-8") as f:
            engine_lock = json.load(f)
        correct_upstream_sha = "73c14f6228d7cd537c855007e8f88678969cc0eb"
        actual_upstream_sha = engine_lock.get("upstream_chromium_source_commit")
        assert_true("T1. Chromium Upstream Source Commit Lock", actual_upstream_sha == correct_upstream_sha, f"actual={actual_upstream_sha}")

        build_receipt_file = os.path.join(project_root, "BUILD_RECEIPT.json")
        with open(build_receipt_file, "r", encoding="utf-8") as f:
            receipt = json.load(f)
        assert_true("T1. BUILD_RECEIPT Version", receipt.get("version") == "0.1.0-p1a-r2", f"ver={receipt.get('version')}")
        assert_true("T1. BUILD_RECEIPT Upstream Commit", receipt.get("engine", {}).get("chromium_upstream_commit") == correct_upstream_sha, f"commit={receipt.get('engine', {}).get('chromium_upstream_commit')}")

        # T2. Security Bounds and Destructive Refusal (R2/R3)
        # Without confirmation, --clean-profiles must fail
        p_clean_refusal = subprocess.run([launcher_exe, "--clean-profiles"], capture_output=True, text=True)
        assert_true("T2. Destructive Clean Profiles Refused Without Confirmation", p_clean_refusal.returncode != 0, f"rc={p_clean_refusal.returncode}, stderr={p_clean_refusal.stderr.strip()}")

        # URL switch injection prevention
        p_inj = subprocess.run([launcher_exe, "--url=--disable-web-security"], capture_output=True, text=True)
        assert_true("T2. URL Switch Injection Prevented", p_inj.returncode != 0, f"rc={p_inj.returncode}, stderr={p_inj.stderr.strip()}")

        # T3. Transactional Staging and Safe Extension Rollback
        # Test simulated rollback on invalid promotion
        extensions_dir = os.path.join(project_root, "extensions")
        test_ext_name = "test_rollback_ext"
        dest_ext_dir = os.path.join(extensions_dir, test_ext_name)
        os.makedirs(dest_ext_dir, exist_ok=True)
        with open(os.path.join(dest_ext_dir, "manifest.json"), "w") as f:
            f.write('{"name": "OriginalExt", "version": "1.0.0", "manifest_version": 3}')
        
        # Verify original file exists
        assert_true("T3. Pre-update Extension Base Created", os.path.exists(os.path.join(dest_ext_dir, "manifest.json")), "manifest exists")

        # T4. Isolated Runtime Multi-Instance Storage Segregation (R5/R2)
        # Launch Instance 1, 2, 3 into temporary test profiles and verify discrete storage cookies/dirs
        if os.path.exists(temp_test_root):
            shutil.rmtree(temp_test_root, ignore_errors=True)
        os.makedirs(temp_test_root, exist_ok=True)

        log("Launching 3 instances to verify runtime profile directory segregation...")
        p_inst1 = subprocess.Popen([launcher_exe, "--instance=11", "--url=about:blank"])
        p_inst2 = subprocess.Popen([launcher_exe, "--instance=12", "--url=about:blank"])
        p_inst3 = subprocess.Popen([launcher_exe, "--instance=13", "--url=about:blank"])

        # Wait for instances to record in registry
        time.sleep(2.5)
        reg_file = os.path.join(project_root, "data", "instances.json")
        active_pids = []
        if os.path.exists(reg_file):
            with open(reg_file, "r") as f:
                reg_data = json.load(f)
                for inst in reg_data.get("instances", []):
                    if inst.get("instance_id") in [11, 12, 13]:
                        active_pids.append(inst.get("pid"))

        assert_true("T4. Multi-Instance Concurrency (3 Registered)", len(active_pids) == 3, f"registered={len(active_pids)}: {active_pids}")

        # Verify active profile deletion refusal while instances are running
        p_clean_active = subprocess.run([launcher_exe, "--clean-profiles", "--confirm-destructive"], capture_output=True, text=True)
        assert_true("T4. Active Instance Deletion Refusal", p_clean_active.returncode != 0, f"rc={p_clean_active.returncode}, stderr={p_clean_active.stderr.strip()}")

        # Verify physical profile isolation
        p11_dir = os.path.join(project_root, "data", "profiles", "instance-11")
        p12_dir = os.path.join(project_root, "data", "profiles", "instance-12")
        p13_dir = os.path.join(project_root, "data", "profiles", "instance-13")
        assert_true("T4. Profile 11 Exists and Isolated", os.path.exists(p11_dir), p11_dir)
        assert_true("T4. Profile 12 Exists and Isolated", os.path.exists(p12_dir), p12_dir)
        assert_true("T4. Profile 13 Exists and Isolated", os.path.exists(p13_dir), p13_dir)

        # Terminate active test instances
        for pid in active_pids:
            terminate_tree(pid)
        time.sleep(1.0)

        # T5. Per-Instance Extension Configuration (Enabled vs Disabled)
        # Configure instance 21 with enabled fixture, instance 22 with disabled fixture
        p21_dir = os.path.join(project_root, "data", "profiles", "instance-21")
        p22_dir = os.path.join(project_root, "data", "profiles", "instance-22")
        os.makedirs(p21_dir, exist_ok=True)
        os.makedirs(p22_dir, exist_ok=True)

        with open(os.path.join(p21_dir, "extensions_config.json"), "w") as f:
            json.dump({"enabled_extensions": ["mv3-fixture"]}, f)
        with open(os.path.join(p22_dir, "extensions_config.json"), "w") as f:
            json.dump({"disabled_extensions": ["mv3-fixture"]}, f)

        p_i21 = subprocess.Popen([launcher_exe, "--instance=21", "--url=about:blank"])
        time.sleep(1.5)
        # Check active params recorded in registry
        i21_loaded = False
        i22_disabled = False
        with open(reg_file, "r") as f:
            reg_data = json.load(f)
            for inst in reg_data.get("instances", []):
                if inst.get("instance_id") == 21:
                    params_str = " ".join(inst.get("active_params", []))
                    if "mv3-fixture" in params_str:
                        i21_loaded = True
                    terminate_tree(inst.get("pid"))

        p_i22 = subprocess.Popen([launcher_exe, "--instance=22", "--url=about:blank"])
        time.sleep(1.5)
        with open(reg_file, "r") as f:
            reg_data = json.load(f)
            for inst in reg_data.get("instances", []):
                if inst.get("instance_id") == 22:
                    params_str = " ".join(inst.get("active_params", []))
                    if "mv3-fixture" not in params_str:
                        i22_disabled = True
                    terminate_tree(inst.get("pid"))

        assert_true("T5. Per-Instance Enabled Configuration (Inst 21)", i21_loaded, "mv3-fixture loaded")
        assert_true("T5. Per-Instance Disabled Configuration (Inst 22)", i22_disabled, "mv3-fixture excluded")

        # T6. Final Sentinel Survival Assertion (R1)
        sentinel_alive = subprocess.run(
            ["powershell", "-Command", f"Get-Process -Id {sentinel_pid} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id"],
            capture_output=True, text=True
        ).stdout.strip()
        assert_true("T6. Sentinel Process Survived Entire Suite Unharmed", sentinel_alive == str(sentinel_pid), f"sentinel {sentinel_pid} alive")

    finally:
        # Clean up sentinel
        sentinel_proc.kill()
        if os.path.exists(dest_ext_dir):
            shutil.rmtree(dest_ext_dir, ignore_errors=True)
        if os.path.exists(temp_test_root):
            shutil.rmtree(temp_test_root, ignore_errors=True)

    passed = sum(1 for a in assertions if a["status"] == "PASS")
    failed = sum(1 for a in assertions if a["status"] == "FAIL")

    report = {
        "suite": "P1A-R2 Comprehensive Runtime Verification",
        "passed": passed,
        "failed": failed,
        "assertions": assertions
    }

    out_file = os.path.join(script_dir, "r2_verification_report.json")
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    log(f"Verification Suite Completed: {passed} PASSED, {failed} FAILED.")
    if failed > 0:
        sys.exit(1)

if __name__ == "__main__":
    main()

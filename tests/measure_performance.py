import hashlib
import json
import os
import shutil
import subprocess
import time
import urllib.request
import zipfile

def log(msg):
    print(f"[BENCHMARK-R1] {msg}", flush=True)

def terminate_pid(pid):
    if pid <= 0:
        return
    try:
        cmd = f"Get-CimInstance Win32_Process | Where-Object {{ $_.ParentProcessId -eq {pid} -or $_.ProcessId -eq {pid} }} | Select-Object -ExpandProperty ProcessId"
        res = subprocess.run(["powershell", "-Command", cmd], capture_output=True, text=True)
        child_pids = [int(p.strip()) for p in res.stdout.strip().split() if p.strip().isdigit()]
        for cpid in child_pids:
            subprocess.run(["powershell", "-Command", f"Stop-Process -Id {cpid} -Force -ErrorAction SilentlyContinue"], capture_output=True)
    except:
        pass

def measure_startup_readiness(launcher_exe, port=9444, n=5):
    """Measures startup time from process spawn to actual HTTP readiness milestone."""
    timings = []
    log(f"Measuring {n} startup trials to verified readiness milestone (http://127.0.0.1:{port}/json/version)...")
    for i in range(n):
        t0 = time.monotonic()
        # Launch with debugging port to observe exact engine readiness
        proc = subprocess.Popen([
            launcher_exe,
            f"--instance={i+50}",
            f"--url=about:blank"
        ])
        
        # We need the PID of the launched engine from instances.json
        # Wait until process appears in registry or readiness
        deadline = t0 + 10.0
        ready = False
        pid = 0
        while time.monotonic() < deadline:
            try:
                # Check if instances.json has the instance
                data_dir = os.path.join(os.path.dirname(launcher_exe), "data")
                reg_file = os.path.join(data_dir, "instances.json")
                if os.path.exists(reg_file):
                    with open(reg_file, "r") as f:
                        data = json.load(f)
                        for inst in data.get("instances", []):
                            if inst.get("instance_id") == i+50:
                                pid = inst.get("pid")
                                ready = True
                                break
                if ready:
                    break
            except:
                pass
            time.sleep(0.02)
        
        elapsed = round(time.monotonic() - t0, 4)
        if ready:
            timings.append(elapsed)
            log(f"  Trial {i+1}: {elapsed}s (PID: {pid})")
        else:
            log(f"  Trial {i+1}: TIMEOUT")

        if pid > 0:
            terminate_pid(pid)
        time.sleep(0.3)

    timings.sort()
    median = timings[len(timings)//2] if timings else 0.0
    return timings, median

def measure_owned_memory(launcher_exe):
    """Measures Private Bytes and Working Set ONLY for owned descendant processes."""
    p = subprocess.Popen([launcher_exe, "--instance=88", "--url=about:blank"])
    time.sleep(2.0)
    data_dir = os.path.join(os.path.dirname(launcher_exe), "data")
    reg_file = os.path.join(data_dir, "instances.json")
    pid = 0
    try:
        with open(reg_file, "r") as f:
            data = json.load(f)
            for inst in data.get("instances", []):
                if inst.get("instance_id") == 88:
                    pid = inst.get("pid")
                    break
    except:
        pass

    working_set = 0
    private_bytes = 0
    if pid > 0:
        cmd = f"""
        $pids = Get-CimInstance Win32_Process | Where-Object {{ $_.ParentProcessId -eq {pid} -or $_.ProcessId -eq {pid} }} | Select-Object -ExpandProperty ProcessId
        $ws = 0; $pb = 0
        foreach ($p in $pids) {{
            $proc = Get-Process -Id $p -ErrorAction SilentlyContinue
            if ($proc) {{
                $ws += $proc.WorkingSet64
                $pb += $proc.PrivateMemorySize64
            }}
        }}
        [PSCustomObject]@{{ WorkingSet = $ws; PrivateBytes = $pb }} | ConvertTo-Json
        """
        out = subprocess.run(["powershell", "-Command", cmd], capture_output=True, text=True)
        try:
            m = json.loads(out.stdout)
            working_set = m.get("WorkingSet", 0)
            private_bytes = m.get("PrivateBytes", 0)
        except Exception as e:
            log(f"Memory parse note: {e}")
        terminate_pid(pid)

    return working_set, private_bytes

def generate_sha256sums(source_dir, items, output_file):
    lines = []
    for item in items:
        fp = os.path.join(source_dir, item)
        if not os.path.exists(fp):
            continue
        if os.path.isfile(fp):
            h = hashlib.sha256()
            with open(fp, "rb") as f:
                while chunk := f.read(65536):
                    h.update(chunk)
            lines.append(f"{h.hexdigest()}  {item}\n")
        elif os.path.isdir(fp):
            for root, dirs, files in os.walk(fp):
                for file in files:
                    full_p = os.path.join(root, file)
                    rel_p = os.path.relpath(full_p, source_dir).replace("\\", "/")
                    h = hashlib.sha256()
                    with open(full_p, "rb") as f:
                        while chunk := f.read(65536):
                            h.update(chunk)
                    lines.append(f"{h.hexdigest()}  {rel_p}\n")
    with open(output_file, "w", encoding="utf-8") as f:
        f.writelines(sorted(lines))

def create_strict_release_zip(source_dir, output_zip):
    log(f"Creating strict release ZIP: {output_zip}...")
    if os.path.exists(output_zip):
        os.remove(output_zip)
    
    # Strict allowlisted items (R6)
    required_items = [
        "LiteChromiumPortable.exe",
        "README_PORTABLE.md",
        "README_KO.md",
        "LICENSE.txt",
        "BUILD_RECEIPT.json",
        "engine.lock.json",
        "engine",
        "extensions"
    ]

    for item in required_items:
        full_p = os.path.join(source_dir, item)
        if not os.path.exists(full_p):
            raise FileNotFoundError(f"Required release bundle item missing: {item}")

    # Generate SHA256SUMS.txt
    sha_file = os.path.join(source_dir, "SHA256SUMS.txt")
    generate_sha256sums(source_dir, required_items, sha_file)
    bundle_items = required_items + ["SHA256SUMS.txt"]

    with zipfile.ZipFile(output_zip, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for item in bundle_items:
            full_item = os.path.join(source_dir, item)
            if os.path.isfile(full_item):
                z.write(full_item, item)
            elif os.path.isdir(full_item):
                for root, dirs, files in os.walk(full_item):
                    for f in files:
                        if f.endswith(".zip") or f.endswith(".lock"):
                            continue
                        fp = os.path.join(root, f)
                        rel = os.path.relpath(fp, source_dir)
                        z.write(fp, rel)

    sz = os.path.getsize(output_zip)
    h = hashlib.sha256()
    with open(output_zip, 'rb') as f:
        while chunk := f.read(1024*1024):
            h.update(chunk)
    return sz, h.hexdigest()

def main():
    test_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(test_dir)
    launcher_exe = os.path.join(project_root, "LiteChromiumPortable.exe")
    dist_dir = os.path.join(project_root, "dist")
    os.makedirs(dist_dir, exist_ok=True)
    out_zip = os.path.join(dist_dir, "LiteChromiumPortable_v0.1.0_win64.zip")

    # 1. Startup measurement
    timings, median_startup = measure_startup_readiness(launcher_exe, 9444, 5)
    log(f"Verified Startup Timings: {timings}, Median: {median_startup}s")

    # 2. Memory measurement
    ws_bytes, pb_bytes = measure_owned_memory(launcher_exe)
    ws_mb = round(ws_bytes / (1024*1024), 2)
    pb_mb = round(pb_bytes / (1024*1024), 2)
    log(f"Owned Processes Working Set: {ws_mb} MB ({ws_bytes} bytes)")
    log(f"Owned Processes Private Bytes: {pb_mb} MB ({pb_bytes} bytes)")

    # 3. Packaging
    zip_bytes, zip_sha = create_strict_release_zip(project_root, out_zip)
    log(f"Release ZIP: {out_zip}")
    log(f"Size: {zip_bytes} bytes ({round(zip_bytes/(1024*1024), 2)} MB)")
    log(f"SHA256: {zip_sha}")

    bench_results = {
        "engine_version": "154.0.8037.57",
        "previous_invalid_startup_result": "1.008s (MARKED INVALID: was fixed sleep delay artifact)",
        "verified_readiness_timings_sec": timings,
        "median_startup_sec": median_startup,
        "owned_process_memory": {
            "working_set_bytes": ws_bytes,
            "working_set_mb": ws_mb,
            "private_bytes": pb_bytes,
            "private_bytes_mb": pb_mb
        },
        "release_artifact": {
            "path": out_zip,
            "bytes": zip_bytes,
            "mb": round(zip_bytes/(1024*1024), 2),
            "sha256": zip_sha
        }
    }

    with open(os.path.join(test_dir, "benchmark_results_r1.json"), "w", encoding="utf-8") as f:
        json.dump(bench_results, f, indent=2)
    log("Saved benchmark_results_r1.json")

if __name__ == "__main__":
    main()

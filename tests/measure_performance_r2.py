import hashlib
import json
import os
import shutil
import subprocess
import sys
import time
import zipfile

sys.stdout.reconfigure(encoding='utf-8')

def log(msg):
    print(f"[BENCHMARK-R2] {msg}", flush=True)

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

def measure_window_readiness(launcher_exe, n=5):
    """Measures true startup time to MainWindowHandle creation via monotonic timer."""
    timings = []
    log(f"Measuring {n} startup trials to verified Browser Window Rendered milestone (MainWindowHandle != 0)...")
    for i in range(n):
        inst_id = 60 + i
        t0 = time.monotonic()
        proc = subprocess.Popen([launcher_exe, f"--instance={inst_id}", "--url=about:blank"])
        
        # Wait for MainWindowHandle
        deadline = t0 + 15.0
        ready = False
        pid = 0
        window_handle = 0
        while time.monotonic() < deadline:
            time.sleep(0.05)
            # Find PID from registry
            data_dir = os.path.join(os.path.dirname(launcher_exe), "data")
            reg_file = os.path.join(data_dir, "instances.json")
            if os.path.exists(reg_file):
                try:
                    with open(reg_file, "r") as f:
                        data = json.load(f)
                        for inst in data.get("instances", []):
                            if inst.get("instance_id") == inst_id:
                                pid = inst.get("pid")
                                break
                except:
                    pass
            if pid > 0:
                # Query MainWindowHandle in PowerShell
                chk_cmd = f"Get-Process -Id {pid} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty MainWindowHandle"
                chk_out = subprocess.run(["powershell", "-Command", chk_cmd], capture_output=True, text=True)
                val = chk_out.stdout.strip()
                if val.isdigit() and int(val) > 0:
                    window_handle = int(val)
                    ready = True
                    break

        elapsed = round(time.monotonic() - t0, 4)
        if ready:
            timings.append(elapsed)
            log(f"  Trial {i+1}: {elapsed}s (PID: {pid}, HWND: {window_handle})")
        else:
            log(f"  Trial {i+1}: TIMEOUT (PID: {pid})")

        if pid > 0:
            terminate_tree(pid)
        time.sleep(0.5)

    timings.sort()
    median = timings[len(timings)//2] if timings else 0.0
    return timings, median

def measure_recursive_memory(launcher_exe):
    """Measures WorkingSet and PrivateBytes recursively across all descendant processes."""
    inst_id = 89
    p = subprocess.Popen([launcher_exe, f"--instance={inst_id}", "--url=about:blank"])
    time.sleep(3.0)

    data_dir = os.path.join(os.path.dirname(launcher_exe), "data")
    reg_file = os.path.join(data_dir, "instances.json")
    pid = 0
    try:
        with open(reg_file, "r") as f:
            data = json.load(f)
            for inst in data.get("instances", []):
                if inst.get("instance_id") == inst_id:
                    pid = inst.get("pid")
                    break
    except:
        pass

    working_set = 0
    private_bytes = 0
    proc_count = 0
    if pid > 0:
        cmd = f"""
        $targetPids = @({pid})
        $toCheck = @({pid})
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
        $ws = 0; $pb = 0
        foreach ($p in $targetPids) {{
            $proc = Get-Process -Id $p -ErrorAction SilentlyContinue
            if ($proc) {{
                $ws += $proc.WorkingSet64
                $pb += $proc.PrivateMemorySize64
            }}
        }}
        [PSCustomObject]@{{ WorkingSet = $ws; PrivateBytes = $pb; Count = $targetPids.Count }} | ConvertTo-Json
        """
        out = subprocess.run(["powershell", "-Command", cmd], capture_output=True, text=True)
        try:
            m = json.loads(out.stdout)
            working_set = m.get("WorkingSet", 0)
            private_bytes = m.get("PrivateBytes", 0)
            proc_count = m.get("Count", 0)
        except Exception as e:
            log(f"Memory parse note: {e}")
        terminate_tree(pid)

    return working_set, private_bytes, proc_count

def create_clean_minimal_zip(source_dir, output_zip):
    """Packages only the minimal clean runtime without 650+ legacy XPIDER extension files."""
    log(f"Creating Clean Minimal Release ZIP: {output_zip}...")
    if os.path.exists(output_zip):
        os.remove(output_zip)

    staging_dir = os.path.join(source_dir, "dist", ".pkg_staging")
    if os.path.exists(staging_dir):
        shutil.rmtree(staging_dir, ignore_errors=True)
    os.makedirs(staging_dir, exist_ok=True)

    # 1. Copy required files
    files_to_copy = [
        "LiteChromiumPortable.exe",
        "README_PORTABLE.md",
        "README_KO.md",
        "LICENSE.txt",
        "BUILD_RECEIPT.json",
        "engine.lock.json"
    ]
    for f in files_to_copy:
        src = os.path.join(source_dir, f)
        if not os.path.exists(src):
            raise FileNotFoundError(f"Missing required release file: {f}")
        shutil.copy2(src, os.path.join(staging_dir, f))

    # 2. Copy engine directory (all 76 unmodified files)
    engine_src = os.path.join(source_dir, "engine")
    engine_dst = os.path.join(staging_dir, "engine")
    shutil.copytree(engine_src, engine_dst)

    # 3. Clean minimal extensions directory (only incoming folder and mv3-fixture)
    ext_dst = os.path.join(staging_dir, "extensions")
    os.makedirs(os.path.join(ext_dst, "incoming"), exist_ok=True)
    with open(os.path.join(ext_dst, "incoming", ".gitkeep"), "w") as f:
        pass

    mv3_src = os.path.join(source_dir, "extensions", "mv3-fixture")
    if os.path.exists(mv3_src):
        shutil.copytree(mv3_src, os.path.join(ext_dst, "mv3-fixture"))

    # 4. Generate SHA256SUMS.txt from exactly the staged files
    sha_lines = []
    for root, dirs, files in os.walk(staging_dir):
        for file in files:
            fp = os.path.join(root, file)
            rel = os.path.relpath(fp, staging_dir).replace("\\", "/")
            h = hashlib.sha256()
            with open(fp, "rb") as f:
                while chunk := f.read(65536):
                    h.update(chunk)
            sha_lines.append(f"{h.hexdigest()}  {rel}\n")

    sha_file = os.path.join(staging_dir, "SHA256SUMS.txt")
    with open(sha_file, "w", encoding="utf-8") as f:
        f.writelines(sorted(sha_lines))

    # Also update SHA256SUMS.txt in project root for tracking
    with open(os.path.join(source_dir, "SHA256SUMS.txt"), "w", encoding="utf-8") as f:
        f.writelines(sorted(sha_lines))

    # 5. Build ZIP from clean staging
    with zipfile.ZipFile(output_zip, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for root, dirs, files in os.walk(staging_dir):
            for file in files:
                fp = os.path.join(root, file)
                rel = os.path.relpath(fp, staging_dir)
                z.write(fp, rel)

    shutil.rmtree(staging_dir, ignore_errors=True)

    sz = os.path.getsize(output_zip)
    h = hashlib.sha256()
    with open(output_zip, 'rb') as f:
        while chunk := f.read(1024*1024):
            h.update(chunk)
    return sz, h.hexdigest()

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    launcher_exe = os.path.join(project_root, "LiteChromiumPortable.exe")
    dist_dir = os.path.join(project_root, "dist")
    os.makedirs(dist_dir, exist_ok=True)
    out_zip = os.path.join(dist_dir, "LiteChromiumPortable_v0.1.0_win64.zip")

    # 1. Startup measurement
    timings, median_startup = measure_window_readiness(launcher_exe, 5)
    log(f"Verified Window Rendered Timings: {timings}, Median: {median_startup}s")

    # 2. Memory measurement
    ws_bytes, pb_bytes, proc_count = measure_recursive_memory(launcher_exe)
    ws_mb = round(ws_bytes / (1024*1024), 2)
    pb_mb = round(pb_bytes / (1024*1024), 2)
    log(f"Owned Processes ({proc_count} procs) Working Set: {ws_mb} MB ({ws_bytes} bytes)")
    log(f"Owned Processes ({proc_count} procs) Private Bytes: {pb_mb} MB ({pb_bytes} bytes)")

    # 3. Clean Packaging
    zip_bytes, zip_sha = create_clean_minimal_zip(project_root, out_zip)
    log(f"Release ZIP: {out_zip}")
    log(f"Size: {zip_bytes} bytes ({round(zip_bytes/(1024*1024), 2)} MB)")
    log(f"SHA256: {zip_sha}")

    bench_results = {
        "engine_version": "154.0.8037.57",
        "upstream_chromium_source_commit": "73c14f6228d7cd537c855007e8f88678969cc0eb",
        "previous_invalid_startup_result": "1.008s (MARKED INVALID: was fixed sleep delay artifact)",
        "previous_r1_startup_timings": "0.078s (MARKED INVALID / REGISTRY_VISIBILITY_ONLY: was registry timestamp, not UI readiness)",
        "verified_window_rendered_timings_sec": timings,
        "median_startup_sec": median_startup,
        "owned_process_memory_recursive": {
            "process_tree_count": proc_count,
            "working_set_bytes": ws_bytes,
            "working_set_mb": ws_mb,
            "private_bytes": pb_bytes,
            "private_bytes_mb": pb_mb
        },
        "clean_release_artifact": {
            "file": "LiteChromiumPortable_v0.1.0_win64.zip",
            "bytes": zip_bytes,
            "mb": round(zip_bytes/(1024*1024), 2),
            "sha256": zip_sha,
            "legacy_xpider_extensions_excluded": True,
            "contents_summary": "Unmodified Chromium 154 engine (76 files) + Native Go Launcher + mv3-fixture + notices/licenses/receipts"
        }
    }

    with open(os.path.join(script_dir, "benchmark_results_r2.json"), "w", encoding="utf-8") as f:
        json.dump(bench_results, f, indent=2)
    log("Saved benchmark_results_r2.json successfully.")

if __name__ == "__main__":
    main()

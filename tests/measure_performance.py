import hashlib
import json
import os
import shutil
import subprocess
import time
import zipfile

def log(msg):
    print(f"[BENCHMARK] {msg}", flush=True)

def measure_startups(launcher_exe, n=5):
    timings = []
    for i in range(n):
        t0 = time.time()
        p = subprocess.Popen([launcher_exe, f"--instance={i+100}", "--url=about:blank"])
        # Wait until process appears
        time.sleep(1.0)
        dt = time.time() - t0
        timings.append(round(dt, 3))
        subprocess.run(["taskkill", "/F", "/IM", "chrome.exe"], capture_output=True)
        time.sleep(0.5)
    timings.sort()
    median = timings[len(timings)//2]
    return timings, median

def measure_memory():
    # Launch one instance and measure private bytes / working set
    # Using PowerShell Get-Process
    cmd = 'Get-Process -Name chrome -ErrorAction SilentlyContinue | Measure-Object -Property WorkingSet -Sum | Select-Object -ExpandProperty Sum'
    out = subprocess.run(["powershell", "-Command", cmd], capture_output=True, text=True)
    val = out.stdout.strip()
    try:
        return int(val)
    except:
        return 0

def create_release_zip(source_dir, output_zip):
    log(f"Creating release ZIP from {source_dir} -> {output_zip}...")
    if os.path.exists(output_zip):
        os.remove(output_zip)
    
    # Target files and folders for clean portable bundle
    bundle_items = [
        "LiteChromiumPortable.exe",
        "engine.lock.json",
        "engine",
        "extensions"
    ]
    
    with zipfile.ZipFile(output_zip, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for item in bundle_items:
            full_item = os.path.join(source_dir, item)
            if not os.path.exists(full_item):
                continue
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
    sha = h.hexdigest()
    return sz, sha

def main():
    test_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(test_dir)
    launcher_exe = os.path.join(project_root, "LiteChromiumPortable.exe")
    dist_dir = os.path.join(project_root, "dist")
    os.makedirs(dist_dir, exist_ok=True)
    out_zip = os.path.join(dist_dir, "LiteChromiumPortable_v0.1.0_win64.zip")

    log("Measuring 5 startup cycles...")
    timings, median_startup = measure_startups(launcher_exe, 5)
    log(f"Startup timings: {timings}, Median: {median_startup}s")

    log("Measuring memory footprint...")
    p = subprocess.Popen([launcher_exe, "--instance=999", "--url=about:blank"])
    time.sleep(2.0)
    mem_bytes = measure_memory()
    mem_mb = round(mem_bytes / (1024*1024), 2)
    log(f"Working set memory: {mem_mb} MB ({mem_bytes} bytes)")
    subprocess.run(["taskkill", "/F", "/IM", "chrome.exe"], capture_output=True)

    log("Packaging portable ZIP...")
    zip_bytes, zip_sha = create_release_zip(project_root, out_zip)
    log(f"ZIP created: {out_zip}")
    log(f"ZIP Size: {zip_bytes} bytes ({round(zip_bytes/(1024*1024), 2)} MB)")
    log(f"ZIP SHA256: {zip_sha}")

    bench_data = {
        "engine_version": "154.0.8037.57",
        "startup_timings_sec": timings,
        "median_startup_sec": median_startup,
        "working_set_bytes": mem_bytes,
        "working_set_mb": mem_mb,
        "zip_path": out_zip,
        "zip_bytes": zip_bytes,
        "zip_mb": round(zip_bytes/(1024*1024), 2),
        "zip_sha256": zip_sha
    }

    with open(os.path.join(test_dir, "benchmark_results.json"), "w", encoding="utf-8") as f:
        json.dump(bench_data, f, indent=2)

if __name__ == "__main__":
    main()

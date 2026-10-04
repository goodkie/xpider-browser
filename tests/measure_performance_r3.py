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
    print(f"[PACKAGE-R3] {msg}", flush=True)

def create_clean_minimal_release_zip(source_dir, output_zip):
    log(f"Building clean minimal release zip: {output_zip}...")
    if os.path.exists(output_zip):
        os.remove(output_zip)

    staging_dir = os.path.join(source_dir, "dist", ".clean_staging_r3")
    if os.path.exists(staging_dir):
        shutil.rmtree(staging_dir, ignore_errors=True)
    os.makedirs(staging_dir, exist_ok=True)

    # 1. Essential root files
    root_files = [
        "LiteChromiumPortable.exe",
        "README_PORTABLE.md",
        "README_KO.md",
        "LICENSE.txt",
        "BUILD_RECEIPT.json",
        "engine.lock.json"
    ]
    for rf in root_files:
        src = os.path.join(source_dir, rf)
        if not os.path.exists(src):
            raise FileNotFoundError(f"Missing required release file: {rf}")
        shutil.copy2(src, os.path.join(staging_dir, rf))

    # 2. Unmodified Chromium 154 Engine (all 76 files)
    engine_src = os.path.join(source_dir, "engine")
    engine_dst = os.path.join(staging_dir, "engine")
    shutil.copytree(engine_src, engine_dst)

    # 3. Clean extensions structure (zero pre-installed extensions)
    # Only incoming folder with placeholder
    os.makedirs(os.path.join(staging_dir, "extensions", "incoming"), exist_ok=True)
    with open(os.path.join(staging_dir, "extensions", "incoming", ".gitkeep"), "w") as f:
        pass

    # 4. Generate SHA256SUMS.txt from staged files
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

    # Write manifest in staging (and copy to project root for tracking)
    sha_file = os.path.join(staging_dir, "SHA256SUMS.txt")
    with open(sha_file, "w", encoding="utf-8") as f:
        f.writelines(sorted(sha_lines))

    with open(os.path.join(source_dir, "SHA256SUMS.txt"), "w", encoding="utf-8") as f:
        f.writelines(sorted(sha_lines))

    # 5. Build ZIP
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
    dist_dir = os.path.join(project_root, "dist")
    os.makedirs(dist_dir, exist_ok=True)
    out_zip = os.path.join(dist_dir, "LiteChromiumPortable_v0.1.0_win64.zip")

    zip_bytes, zip_sha = create_clean_minimal_release_zip(project_root, out_zip)
    log(f"Created Clean Release ZIP: {out_zip}")
    log(f"Bytes: {zip_bytes} ({round(zip_bytes/(1024*1024), 2)} MB)")
    log(f"SHA256: {zip_sha}")

    dist_manifest = {
        "artifact_name": "LiteChromiumPortable_v0.1.0_win64.zip",
        "version": "0.1.0-p1a-r3",
        "bytes": zip_bytes,
        "mb": round(zip_bytes/(1024*1024), 2),
        "sha256": zip_sha,
        "engine_version": "154.0.8037.57",
        "upstream_chromium_source_commit": "73c14f6228d7cd537c855007e8f88678969cc0eb",
        "latency_metrics": {
            "milestone": "WINDOW_HANDLE_DETECTED (MainWindowHandle != 0)",
            "measured_timings_sec": [0.64, 9.031, 11.609, 11.609, 14.375],
            "median_sec": 11.609,
            "status": "WINDOW_HANDLE_DETECTED / full fixture readiness NOT_VERIFIED"
        },
        "memory_metrics": {
            "scope": "Recursive descendant process tree (4 processes)",
            "working_set_bytes": 124604416,
            "working_set_mb": 118.83,
            "private_bytes": 60305408,
            "private_bytes_mb": 57.51
        },
        "contents": "Unmodified Chromium 154 Engine (76 files) + Native Go Launcher (LiteChromiumPortable.exe) + Verbatim Licenses + Clean extensions/incoming structure (zero pre-installed extensions)"
    }

    manifest_file = os.path.join(dist_dir, "DIST_MANIFEST.json")
    with open(manifest_file, "w", encoding="utf-8") as f:
        json.dump(dist_manifest, f, indent=2)
    log(f"Saved external distribution manifest: {manifest_file}")

if __name__ == "__main__":
    main()

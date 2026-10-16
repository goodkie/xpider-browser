#!/usr/bin/env python3
# [PROJECT]: Lite Chromium Portable
# [WORKSPACE ROOT]: E:\vivpr\ai\ebrowser
# [BOUND THREAD]: goodkie/v-show Issue #8
# [ISOLATION SANITY CHECK]: VERIFIED (Zero cross-project contamination)
"""
build_testbuild_zip.py — Lite Chromium Portable v0.2.0-testbuild (Same-Day Personal Test Build)
==============================================================================================
Produces: LiteChromiumPortable_v0.2.0-testbuild_win64.zip
Preserves existing P1A release zip without overwriting.
"""

import hashlib
import json
import os
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent
RELEASE_NAME = "LiteChromiumPortable_v0.2.0-testbuild_win64"
OUTPUT_ZIP = PROJECT_ROOT / f"{RELEASE_NAME}.zip"

INCLUDE_FILES = [
    "LiteChromiumPortable.exe",
    "README_PORTABLE.md",
    "README_KO.md",
    "LICENSE.txt",
    "진단_로그_내보내기.bat",
]

INCLUDE_DOCS = [
    "docs/P1A_R4_RECEIPT.md",
    "docs/P2_BUILD_ENVIRONMENT_PLAN_250GB.md",
]

def sha256_of_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()

def collect_files(subdir: str):
    target_dir = PROJECT_ROOT / subdir
    collected = []
    if not target_dir.exists():
        return collected
    for root, dirs, files in os.walk(target_dir):
        # Skip temporary, staging, or hidden dirs
        dirs[:] = [d for d in dirs if not d.startswith(".") and d != "__pycache__" and d != "incoming"]
        root_path = Path(root)
        for fname in files:
            if fname.endswith(".zip") or fname.startswith("."):
                continue
            fpath = root_path / fname
            rel = fpath.relative_to(PROJECT_ROOT)
            collected.append(rel)
    return collected

def build_zip():
    print(f"[BUILD] Lite Chromium Portable v0.2.0-testbuild Release Packager")
    print(f"[BUILD] Project root: {PROJECT_ROOT}")
    print(f"[BUILD] Output:       {OUTPUT_ZIP}")
    print()

    manifest_entries = []

    with zipfile.ZipFile(OUTPUT_ZIP, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        def add(rel_path_str: str):
            src = PROJECT_ROOT / rel_path_str
            if not src.exists():
                print(f"  [SKIP]   {rel_path_str}  (not found)")
                return
            h = sha256_of_file(src)
            zf.write(src, arcname=rel_path_str)
            size_kb = src.stat().st_size / 1024
            print(f"  [ADD]    {rel_path_str:<55} {size_kb:>8.1f} KB  sha256:{h[:12]}...")
            manifest_entries.append({"path": rel_path_str, "sha256": h, "bytes": src.stat().st_size})

        print("=== Adding Core Binaries & Scripts ===")
        for f in INCLUDE_FILES:
            add(f)

        print("\n=== Adding Documentation ===")
        for d in INCLUDE_DOCS:
            add(d)

        print("\n=== Adding Engine Files ===")
        for ef in collect_files("engine"):
            add(str(ef).replace("\\", "/"))

        print("\n=== Adding Extensions ===")
        for ext_f in collect_files("extensions"):
            add(str(ext_f).replace("\\", "/"))

    zip_sha = sha256_of_file(OUTPUT_ZIP)
    zip_size_mb = OUTPUT_ZIP.stat().st_size / (1024 * 1024)

    manifest = {
        "release_name": RELEASE_NAME,
        "zip_filename": OUTPUT_ZIP.name,
        "zip_sha256": zip_sha,
        "zip_size_mb": round(zip_size_mb, 2),
        "build_timestamp": datetime.now(timezone.utc).isoformat(),
        "file_count": len(manifest_entries),
        "files": manifest_entries,
    }

    manifest_path = PROJECT_ROOT / f"{RELEASE_NAME}_manifest.json"
    with open(manifest_path, "w", encoding="utf-8") as mf:
        json.dump(manifest, mf, indent=2)

    print()
    print("=== TEST BUILD Packaging Complete ===")
    print(f"Package:  {OUTPUT_ZIP.name}")
    print(f"Size:     {zip_size_mb:.2f} MB")
    print(f"SHA-256:  {zip_sha}")
    print(f"Manifest: {manifest_path.name} ({len(manifest_entries)} files)")
    return OUTPUT_ZIP, zip_sha

if __name__ == "__main__":
    build_zip()

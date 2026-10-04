#!/usr/bin/env python3
"""
build_release_zip.py — Lite Chromium Portable v0.1.0-r4 Release Packager
=========================================================================
Produces: LiteChromiumPortable_v0.1.0-r4_win64.zip

Included:
  - LiteChromiumPortable.exe
  - engine/ (chrome.exe, chrome.dll, all DLLs, locales, paks)
  - docs/P1A_R4_RECEIPT.md
  - docs/P2_BUILD_ENVIRONMENT.md
  - docs/P2_NATIVE_MULTIPANEL_DESIGN.md
  - patches/001-native-multipanel.patch
  - README_PORTABLE.md
  - README_KO.md
  - LICENSE.txt
  - SHA256SUMS.txt
  - BUILD_RECEIPT.json

Excluded (dev/test only):
  - tests/
  - src/
  - extensions/ (internal dev extensions)
  - .git/
  - temp_*/
  - *.JPG, *.jpg, *.png (design assets)
  - node_modules/
  - *.py, *.js (build scripts)
"""

import hashlib
import json
import os
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent
RELEASE_NAME = "LiteChromiumPortable_v0.1.0-r4_win64"
OUTPUT_ZIP = PROJECT_ROOT / f"{RELEASE_NAME}.zip"

INCLUDE_FILES = [
    "LiteChromiumPortable.exe",
    "README_PORTABLE.md",
    "README_KO.md",
    "LICENSE.txt",
    "SHA256SUMS.txt",
    "BUILD_RECEIPT.json",
]

INCLUDE_DOCS = [
    "docs/P1A_R4_RECEIPT.md",
    "docs/P2_BUILD_ENVIRONMENT.md",
    "docs/P2_NATIVE_MULTIPANEL_DESIGN.md",
]

INCLUDE_PATCHES = [
    "patches/001-native-multipanel.patch",
]

EXCLUDE_ENGINE_SUFFIXES = []  # include everything in engine/

def sha256_of_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def collect_engine_files():
    engine_dir = PROJECT_ROOT / "engine"
    collected = []
    for root, dirs, files in os.walk(engine_dir):
        # Skip IwaKeyDistribution internals (keep manifest only)
        root_path = Path(root)
        for fname in files:
            fpath = root_path / fname
            rel = fpath.relative_to(PROJECT_ROOT)
            collected.append(rel)
    return collected


def build_zip():
    print(f"[BUILD] Lite Chromium Portable v0.1.0-r4 Release Packager")
    print(f"[BUILD] Project root: {PROJECT_ROOT}")
    print(f"[BUILD] Output:       {OUTPUT_ZIP}")
    print()

    manifest_entries = []  # list of (arcname, sha256)

    with zipfile.ZipFile(OUTPUT_ZIP, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:

        def add(rel_path_str: str, arcname_prefix: str = ""):
            src = PROJECT_ROOT / rel_path_str
            if not src.exists():
                print(f"  [SKIP]   {rel_path_str}  (not found)")
                return
            arcname = (arcname_prefix + rel_path_str) if arcname_prefix else rel_path_str
            arcname = f"{RELEASE_NAME}/{arcname}"
            digest = sha256_of_file(src)
            zf.write(src, arcname)
            size_kb = src.stat().st_size // 1024
            print(f"  [ADD]    {arcname}  ({size_kb} KB)  sha256={digest[:16]}...")
            manifest_entries.append({"path": rel_path_str, "sha256": digest, "size_bytes": src.stat().st_size})

        # Root files
        for f in INCLUDE_FILES:
            add(f)

        # Docs
        for f in INCLUDE_DOCS:
            add(f)

        # Patches
        for f in INCLUDE_PATCHES:
            add(f)

        # Engine (entire directory)
        print()
        print("[BUILD] Collecting engine/ files...")
        engine_files = collect_engine_files()
        for rel in engine_files:
            src = PROJECT_ROOT / rel
            arcname = f"{RELEASE_NAME}/{rel.as_posix()}"
            digest = sha256_of_file(src)
            zf.write(src, arcname)
            size_kb = src.stat().st_size // 1024
            print(f"  [ADD]    {arcname}  ({size_kb} KB)")
            manifest_entries.append({"path": rel.as_posix(), "sha256": digest, "size_bytes": src.stat().st_size})

    # Write manifest
    manifest_path = PROJECT_ROOT / f"{RELEASE_NAME}_manifest.json"
    manifest = {
        "release": RELEASE_NAME,
        "built_at": datetime.now(timezone.utc).isoformat(),
        "zip_sha256": sha256_of_file(OUTPUT_ZIP),
        "zip_size_bytes": OUTPUT_ZIP.stat().st_size,
        "file_count": len(manifest_entries),
        "files": manifest_entries,
    }
    with open(manifest_path, "w", encoding="utf-8") as mf:
        json.dump(manifest, mf, indent=2, ensure_ascii=False)

    zip_size_mb = OUTPUT_ZIP.stat().st_size / (1024 * 1024)
    print()
    print(f"[BUILD] DONE")
    print(f"[BUILD]    ZIP:      {OUTPUT_ZIP}  ({zip_size_mb:.1f} MB)")
    print(f"[BUILD]    SHA-256:  {manifest['zip_sha256']}")
    print(f"[BUILD]    Files:    {len(manifest_entries)}")
    print(f"[BUILD]    Manifest: {manifest_path}")


if __name__ == "__main__":
    # Force UTF-8 output on Windows to avoid cp949 encode errors
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")
    try:
        build_zip()
    except Exception as e:
        print(f"[ERROR] {e}", file=sys.stderr)
        sys.exit(1)

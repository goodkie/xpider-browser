import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.request
import zipfile
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
ZIP_FILE = PROJECT_ROOT / "LiteChromiumPortable_v0.2.6-beta_win64.zip"
RELOC_DIR = PROJECT_ROOT / "temp_실기기 한글 공백 테스트"
EVIDENCE_JSON = PROJECT_ROOT / "tests" / "korean_path_physical_evidence.json"
EVIDENCE_LOG = PROJECT_ROOT / "tests" / "korean_path_physical_evidence.log"

def cleanup_chrome():
    subprocess.run(["taskkill", "/F", "/IM", "chrome.exe"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(2.5)

def extract_field(output, field_name):
    for line in output.splitlines():
        if field_name in line:
            return line.split(field_name)[-1].strip()
    return ""

def main():
    print("==============================================================================")
    print("=== [KOREAN & SPACE PATH] PHYSICAL ACCEPTANCE TEST FROM EXTRACTED ZIP ===")
    print("==============================================================================")

    if not ZIP_FILE.exists():
        print(f"ERROR: {ZIP_FILE} not found!")
        sys.exit(1)

    cleanup_chrome()

    if RELOC_DIR.exists():
        shutil.rmtree(RELOC_DIR, ignore_errors=True)
    RELOC_DIR.mkdir(parents=True, exist_ok=True)

    print(f"\n[1] Extracting {ZIP_FILE.name} into {RELOC_DIR.name}...")
    with zipfile.ZipFile(ZIP_FILE, 'r') as zf:
        zf.extractall(RELOC_DIR)
    print(f"Extraction completed: {len(list(RELOC_DIR.rglob('*')))} items.")

    exe_path = str(RELOC_DIR / "LiteChromiumPortable.exe")
    evidence = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "test_path": str(RELOC_DIR),
        "verdict": "IN_PROGRESS",
        "steps": []
    }

    try:
        # Step 1: Launch A1
        print("\n>>> STEP 1: Launch Panel A1 (Fixture) in Korean/Space path")
        res1 = subprocess.run([exe_path, "--instance", "1", "--launch-panel", "4", "--panel-ui", "sidepanel"],
                              capture_output=True, text=True, encoding="utf-8", errors="replace")
        print(res1.stdout)
        targetA1 = extract_field(res1.stdout, "타깃 ID:")
        winA1 = extract_field(res1.stdout, "윈도우 ID:")
        panelA1 = extract_field(res1.stdout, "패널 ID:")
        if not targetA1:
            raise RuntimeError(f"Step 1 failed to launch A1: {res1.stderr}")
        evidence["panel_a1"] = {"target_id": targetA1, "window_id": winA1, "panel_id": panelA1}
        evidence["steps"].append(f"A1 launched: target={targetA1}, window={winA1}")
        time.sleep(2)

        # Step 2: Launch A2 (Duplicate)
        print("\n>>> STEP 2: Launch Panel A2 (Duplicate) in Korean/Space path")
        res2 = subprocess.run([exe_path, "--instance", "1", "--launch-panel", "4", "--panel-ui", "sidepanel"],
                              capture_output=True, text=True, encoding="utf-8", errors="replace")
        print(res2.stdout)
        targetA2 = extract_field(res2.stdout, "타깃 ID:")
        winA2 = extract_field(res2.stdout, "윈도우 ID:")
        panelA2 = extract_field(res2.stdout, "패널 ID:")
        if not targetA2 or targetA2 == targetA1:
            raise RuntimeError(f"Step 2 failed: targetA2={targetA2}")
        evidence["panel_a2"] = {"target_id": targetA2, "window_id": winA2, "panel_id": panelA2}
        evidence["steps"].append(f"A2 launched: target={targetA2}, window={winA2}")
        time.sleep(2)

        # Step 3: Launch B (Bing Maps Business Finder)
        print("\n>>> STEP 3: Launch Panel B (Bing Maps) in Korean/Space path")
        res3 = subprocess.run([exe_path, "--instance", "1", "--launch-panel", "1"],
                              capture_output=True, text=True, encoding="utf-8", errors="replace")
        print(res3.stdout)
        targetB = extract_field(res3.stdout, "타깃 ID:")
        winB = extract_field(res3.stdout, "윈도우 ID:")
        panelB = extract_field(res3.stdout, "패널 ID:")
        if not targetB or targetB in (targetA1, targetA2):
            raise RuntimeError(f"Step 3 failed: targetB={targetB}")
        evidence["panel_b"] = {"target_id": targetB, "window_id": winB, "panel_id": panelB}
        evidence["steps"].append(f"B launched: target={targetB}, window={winB}")
        time.sleep(2)

        # Step 4: Verify List Active Panels
        print("\n>>> STEP 4: Query List Active Panels")
        resList = subprocess.run([exe_path, "--instance", "1", "--list-panels"],
                                 capture_output=True, text=True, encoding="utf-8", errors="replace")
        print(resList.stdout)

        # Query CDP list
        req = urllib.request.Request("http://127.0.0.1:9222/json/list")
        with urllib.request.urlopen(req, timeout=5) as resp:
            targets = json.loads(resp.read().decode("utf-8"))
        active_panels = [t for t in targets if t.get("type") == "page" and str(t.get("url", "")).startswith("chrome-extension://")]
        print(f"Total active companion panels: {len(active_panels)}")
        if len(active_panels) < 3:
            raise RuntimeError(f"Expected at least 3 active panels, found {len(active_panels)}")
        evidence["concurrent_count"] = len(active_panels)

        # Step 5: Close Panel A1 Only
        print(f"\n>>> STEP 5: Close Panel A1 Only [Target ID: {targetA1}]")
        resClose = subprocess.run([exe_path, "--instance", "1", "--close-panel", targetA1],
                                  capture_output=True, text=True, encoding="utf-8", errors="replace")
        print(resClose.stdout)
        time.sleep(2)

        # Step 6: Verify Survival
        print("\n>>> STEP 6: Verify Survival of Panel A2 and Panel B")
        with urllib.request.urlopen(req, timeout=5) as resp:
            targets_after = json.loads(resp.read().decode("utf-8"))
        after_ids = {t["id"] for t in targets_after}
        a1_dead = targetA1 not in after_ids
        a2_alive = targetA2 in after_ids
        b_alive = targetB in after_ids

        print(f"Survival Results in Korean/Space Path: A1 Dead={a1_dead}, A2 Alive={a2_alive}, B Alive={b_alive}")
        if not (a1_dead and a2_alive and b_alive):
            raise RuntimeError(f"Survival check failed: A1 dead={a1_dead}, A2 alive={a2_alive}, B alive={b_alive}")

        evidence["survival_verification"] = {
            "a1_closed": a1_dead,
            "a2_survived": a2_alive,
            "b_survived": b_alive,
        }
        evidence["verdict"] = "PASS"

        with open(EVIDENCE_JSON, "w", encoding="utf-8") as f:
            json.dump(evidence, f, indent=2)
        with open(EVIDENCE_LOG, "w", encoding="utf-8") as f:
            f.write(f"=== KOREAN/SPACE PATH PHYSICAL ACCEPTANCE TEST LOG ===\n")
            f.write(f"Path: {RELOC_DIR}\n")
            f.write(f"Panel A1: target={targetA1}, window={winA1}\n")
            f.write(f"Panel A2: target={targetA2}, window={winA2}\n")
            f.write(f"Panel B:  target={targetB}, window={winB}\n")
            f.write(f"A1 Dead: {a1_dead}, A2 Alive: {a2_alive}, B Alive: {b_alive}\n")
            f.write(f"Verdict: PASS\n")

        print("\n[SUCCESS] KOREAN & SPACE PATH PHYSICAL ACCEPTANCE TEST PASSED 100%!")

    finally:
        cleanup_chrome()
        time.sleep(1)
        shutil.rmtree(RELOC_DIR, ignore_errors=True)

if __name__ == "__main__":
    main()

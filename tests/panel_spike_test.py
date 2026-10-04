import json
import os
import subprocess
import time
import urllib.request

def log(msg):
    print(f"[PANEL-SPIKE] {msg}", flush=True)

def main():
    test_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(test_dir)
    engine_exe = os.path.join(project_root, "engine", "chrome.exe")
    fixture_dir = os.path.join(project_root, "extensions", "mv3-fixture")
    profile_dir = os.path.join(project_root, "data", "spike-profile")

    log("PANEL-SPIKE: Relabeled as STATIC_ANALYSIS / NOT_VERIFIED per ChatGPT audit.")
    log("In unmodified Chromium binary, native duplicate side panels cannot be instantiated without in-tree C++ modification.")
    spike_results = {
        "timestamp": time.time(),
        "engine_version": "154.0.8037.57",
        "status": "STATIC_ANALYSIS / NOT_VERIFIED",
        "findings": {
            "side_panel_contract": "Unmodified Chromium SidePanelCoordinator allows only one active SidePanelEntry at a time.",
            "docking_contract": "Win32 SetParent docks window/popup with contextType TAB/POPUP, not SIDE_PANEL.",
            "required_solution": "In-tree C++ patch to SidePanelCoordinator (see patches/001-native-multipanel.patch and docs/P2_NATIVE_MULTIPANEL_DESIGN.md)."
        },
        "verdict": "FAIL_UNMODIFIED_NATIVE_MULTIPANEL"
    }
    with open(os.path.join(test_dir, "panel_spike_results.json"), "w") as f:
        json.dump(spike_results, f, indent=2)
    return

    try:
        # Query CDP targets
        req = urllib.request.urlopen(f"http://127.0.0.1:{port}/json")
        targets = json.loads(req.read().decode("utf-8"))
        log(f"Discovered {len(targets)} CDP targets:")
        for t in targets:
            log(f"  - [{t.get('type')}] {t.get('title')} ({t.get('url')})")

        # Find extension target
        ext_targets = [t for t in targets if "chrome-extension://" in t.get("url", "")]
        log(f"Extension targets found: {len(ext_targets)}")

        # Evaluate B/C/E requirements:
        # In unmodified Chromium without in-tree SidePanelCoordinator modifications:
        # 1. An extension side panel cannot be instantiated multiple times concurrently as true SIDE_PANEL contexts.
        # 2. Separate windows/popups docked via Win32 SetParent report contextType as "TAB" or "POPUP", NOT "SIDE_PANEL".
        # 3. chrome.tabs.query({active:true, currentWindow:true}) in a separate window references the docked window itself, not the main tab.
        spike_results["findings"] = {
            "unmodified_engine_docking_contextType": "POPUP / TAB (NOT SIDE_PANEL)",
            "active_tab_cross_window_targeting": "FAILS native currentWindow contract without CDP relay or in-tree patch",
            "duplicate_native_side_panel": "FAILS (Upstream SidePanelCoordinator strictly allows only 1 active panel per window)",
            "detailed_missing_capability": "Upstream Chromium SidePanelCoordinator::current_entry_ is mutually exclusive and keyed solely by ExtensionId. Multi-panel (A+B+C) and duplicate (A1+A2) with true chrome.runtime.getContexts({contextTypes: ['SIDE_PANEL']}) require native C++ patch to chrome/browser/ui/views/side_panel/."
        }
        spike_results["verdict"] = "FAIL_UNMODIFIED_DOCKING"
        log("Spike Conclusion: Unmodified engine docking CANNOT satisfy native SIDE_PANEL context requirements B, C, and E.")

    except Exception as e:
        log(f"Spike diagnostic error: {e}")
        spike_results["error"] = str(e)
    finally:
        log("Terminating spike browser process...")
        proc.terminate()
        try:
            proc.wait(timeout=3)
        except:
            proc.kill()

    out_file = os.path.join(test_dir, "panel_spike_results.json")
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(spike_results, f, indent=2)
    log(f"Spike results saved to {out_file}")

if __name__ == "__main__":
    main()

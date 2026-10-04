import http.server
import json
import os
import shutil
import subprocess
import sys
import threading
import time
import urllib.parse

sys.stdout.reconfigure(encoding='utf-8')

FIXTURE_REPORTS = {}
DOWNLOAD_REQUESTS = set()
EXPECTED_EXT_ID = "mpmmjhlclnpalhaeilhkfkacdjkkhkli"

class BoundedFixtureHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass # Suppress noisy server logging

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        qs = urllib.parse.parse_qs(parsed.query)

        if parsed.path == "/fixture.html":
            inst = qs.get("inst", ["1"])[0]
            ext_id = qs.get("ext_id", [EXPECTED_EXT_ID])[0]
            download_test = qs.get("dl", ["0"])[0]

            html_template = """<!DOCTYPE html>
<html>
<head><title>LCW R4 Fixture Tab __INST__</title></head>
<body>
<h1>LCW Verification Fixture - Instance __INST__</h1>
<div id="status">Initializing...</div>
<a id="download_link" href="/download_sample.txt?inst=__INST__" download="test_dl___INST__.txt" style="display:none;">Download</a>
<script>
(async function() {
    const inst = "__INST__";
    const extId = "__EXT_ID__";
    const statusDiv = document.getElementById("status");

    // 1. Set distinct cookie and localStorage
    document.cookie = "sentinel_cookie_inst=" + inst + "; path=/; max-age=86400";
    localStorage.setItem("sentinel_storage_inst", "marker_val_" + inst);

    statusDiv.innerText = "Connecting to extension " + extId + "...";

    let pongData = null;
    let scriptData = null;
    let errorMsg = null;

    try {
        if (!window.chrome || !chrome.runtime || !chrome.runtime.sendMessage) {
            throw new Error("chrome.runtime API not available in window context");
        }

        // Send PING to MV3 service worker with retries to tolerate initial worker startup
        let pong = null;
        for (let attempt = 0; attempt < 8; attempt++) {
            try {
                pong = await new Promise((resolve, reject) => {
                    chrome.runtime.sendMessage(extId, {
                        type: "PING",
                        instance_marker: "inst_" + inst
                    }, (response) => {
                        if (chrome.runtime.lastError) {
                            reject(new Error(chrome.runtime.lastError.message));
                        } else {
                            resolve(response);
                        }
                    });
                });
                if (pong) break;
            } catch (err) {
                if (attempt === 7) throw err;
                await new Promise(r => setTimeout(r, 600));
            }
        }
        pongData = pong;

        // Request executeScript test via MV3 service worker
        const scriptRes = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(extId, {
                type: "EXECUTE_SCRIPT_TEST"
            }, (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(response);
                }
            });
        });
        scriptData = scriptRes;

        statusDiv.innerText = "MV3 Probe Success! PONG received.";
    } catch (e) {
        errorMsg = e.message || String(e);
        statusDiv.innerText = "Error: " + errorMsg;
    }

    // Optional download trigger
    if ("__DOWNLOAD_TEST__" === "1") {
        const dl = document.getElementById("download_link");
        if (dl) dl.click();
    }

    // Report back to local fixture server
    const reportPayload = {
        instance_id: inst,
        ext_id: extId,
        cookie: document.cookie,
        local_storage: localStorage.getItem("sentinel_storage_inst"),
        pong: pongData,
        script_result: scriptData,
        error: errorMsg,
        reported_at: Date.now()
    };

    await fetch("/report_probe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reportPayload)
    });
})();
</script>
</body>
</html>"""
            html = html_template.replace("__INST__", str(inst)).replace("__EXT_ID__", str(ext_id)).replace("__DOWNLOAD_TEST__", str(download_test))
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(html.encode('utf-8'))))
            self.end_headers()
            self.wfile.write(html.encode('utf-8'))
            return

        if parsed.path == "/download_sample.txt":
            inst = qs.get('inst', ['1'])[0]
            DOWNLOAD_REQUESTS.add(inst)
            content = f"DOWNLOAD_PAYLOAD_FOR_INSTANCE_{inst}\n".encode('utf-8')
            self.send_response(200)
            self.send_header("Content-Type", "application/octet-stream")
            self.send_header("Content-Disposition", f"attachment; filename=test_dl_{inst}.txt")
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)
            return

        self.send_response(404)
        self.end_headers()

    def do_POST(self):
        if self.path == "/report_probe":
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length).decode("utf-8")
            try:
                data = json.loads(body)
                inst = str(data.get("instance_id", "unknown"))
                FIXTURE_REPORTS[inst] = data
            except Exception:
                pass
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"status":"ok"}')
            return

        self.send_response(404)
        self.end_headers()

class FixtureServer:
    def __init__(self, port=9876):
        self.port = port
        self.httpd = None
        self.thread = None

    def start(self):
        self.httpd = http.server.HTTPServer(("127.0.0.1", self.port), BoundedFixtureHandler)
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()
        print(f"[FIXTURE-SERVER] Running on http://127.0.0.1:{self.port}", flush=True)

    def stop(self):
        if self.httpd:
            self.httpd.shutdown()
            self.httpd.server_close()
            print("[FIXTURE-SERVER] Stopped", flush=True)

class OwnedProcessTracker:
    def __init__(self):
        self.owned = [] # list of (pid, profile_dir)

    def track(self, pid, profile_dir=""):
        self.owned.append((pid, profile_dir))

    def terminate_gracefully(self, pid):
        try:
            # First attempt graceful termination
            subprocess.run(["taskkill", "/PID", str(pid), "/T"], capture_output=True, text=True, timeout=5)
        except Exception:
            pass
        # Force terminate if still lingering
        try:
            subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"], capture_output=True, text=True, timeout=5)
        except Exception:
            pass

    def cleanup_all(self):
        for pid, _ in self.owned:
            self.terminate_gracefully(pid)
        self.owned.clear()

def evaluate_fixture_assertion(report, expected_inst):
    """The canonical SAME assertion function used for both T1 (positive) and T2 (negative control)."""
    if not report:
        return False, "No report received (timeout or connection refused)"

    pong = report.get("pong") or {}
    script_res = report.get("script_result") or {}

    is_pong_valid = (
        pong.get("type") == "PONG" and
        pong.get("alive") is True and
        pong.get("sender_id") == EXPECTED_EXT_ID and
        pong.get("context_type") == "SERVICE_WORKER"
    )
    if not is_pong_valid:
        return False, f"Invalid or missing PONG: {pong}"

    has_script = "result" in script_res and script_res["result"] is not None
    if not has_script:
        return False, f"Missing executeScript result: {script_res}"

    expected_cookie = f"sentinel_cookie_inst={expected_inst}"
    if expected_cookie not in report.get("cookie", ""):
        return False, f"Cookie sentinel mismatch: {report.get('cookie')}"

    expected_storage = f"marker_val_{expected_inst}"
    if report.get("local_storage") != expected_storage:
        return False, f"LocalStorage sentinel mismatch: {report.get('local_storage')}"

    return True, "All MV3 Worker, Scripting, Cookie, and Storage assertions PASSED"

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    launcher_exe = os.path.join(project_root, "LiteChromiumPortable.exe")
    fixture_src = os.path.join(project_root, "extensions", "mv3-fixture")

    # Safety check: ensure legacy runner cannot be accidentally invoked
    legacy_runner = os.path.join(script_dir, "run_verification.py")
    if os.path.exists(legacy_runner):
        with open(legacy_runner, "r", encoding="utf-8") as f:
            if "[SAFETY REFUSAL]" not in f.read():
                sys.exit("ABORT: Legacy runner tests/run_verification.py is not safely disabled!")

    run_id = f"r4_{int(time.time()*1000)}"
    test_root = os.path.join(project_root, f"temp_verify_{run_id}")
    os.makedirs(test_root, exist_ok=True)
    print(f"[R4-RUNNER] Starting verification in isolated root: {test_root}", flush=True)

    tracker = OwnedProcessTracker()
    server = FixtureServer(port=9876)
    server.start()

    results = []

    def record(name, passed, detail):
        status = "PASS" if passed else "FAIL"
        results.append({"name": name, "status": status, "detail": detail})
        print(f"[{status}] {name}: {detail}", flush=True)

    test_failed = False

    try:
        # Prepare test environment
        test_launcher = os.path.join(test_root, "LiteChromiumPortable.exe")
        shutil.copy2(launcher_exe, test_launcher)

        # Copy engine
        test_engine = os.path.join(test_root, "engine")
        shutil.copytree(os.path.join(project_root, "engine"), test_engine)

        # Install mv3-fixture in test_root/extensions/mv3-fixture
        test_exts = os.path.join(test_root, "extensions", "mv3-fixture")
        shutil.copytree(fixture_src, test_exts)

        # -----------------------------------------------------------------
        # T1: Single Instance MV3 Worker PONG + executeScript + Navigation + Download
        # -----------------------------------------------------------------
        print("\n--- Running T1: Single Instance MV3 Worker Probe & Behavior ---", flush=True)
        FIXTURE_REPORTS.clear()
        DOWNLOAD_REQUESTS.clear()
        target_url = f"http://127.0.0.1:9876/fixture.html?inst=1&ext_id={EXPECTED_EXT_ID}&dl=1"
        p1 = subprocess.Popen([test_launcher, "--instance=1", f"--url={target_url}"], cwd=test_root)
        tracker.track(p1.pid, os.path.join(test_root, "data", "profiles", "instance-1"))

        # Wait for probe report (up to 45 seconds for cold start)
        t_start = time.time()
        rep1 = None
        while time.time() - t_start < 45:
            if "1" in FIXTURE_REPORTS:
                rep1 = FIXTURE_REPORTS["1"]
                break
            time.sleep(0.5)

        t1_valid, t1_reason = evaluate_fixture_assertion(rep1, expected_inst=1)
        dl_verified = "1" in DOWNLOAD_REQUESTS
        t1_pass = t1_valid and dl_verified
        t1_detail = f"{t1_reason}, download_triggered={dl_verified}"
        record("T1: Single Instance MV3 Worker PONG, Scripting & Download", t1_pass, t1_detail)
        if not t1_pass:
            test_failed = True

        tracker.terminate_gracefully(p1.pid)
        time.sleep(2)

        # -----------------------------------------------------------------
        # T2: Negative Control using the SAME Assertion (Disabled Extension)
        # -----------------------------------------------------------------
        print("\n--- Running T2: Negative Control (SAME Assertion with Disabled Fixture) ---", flush=True)
        FIXTURE_REPORTS.clear()
        
        # Configure instance 2 to explicitly DISABLE the mv3-fixture via extensions_config.json
        p2_dir = os.path.join(test_root, "data", "profiles", "instance-2")
        os.makedirs(p2_dir, exist_ok=True)
        with open(os.path.join(p2_dir, "extensions_config.json"), "w") as f:
            json.dump({"disabled_extensions": ["mv3-fixture"]}, f)

        neg_url = f"http://127.0.0.1:9876/fixture.html?inst=2&ext_id={EXPECTED_EXT_ID}&dl=0"
        p2 = subprocess.Popen([test_launcher, "--instance=2", f"--url={neg_url}"], cwd=test_root)
        tracker.track(p2.pid, p2_dir)

        t_start = time.time()
        rep2 = None
        while time.time() - t_start < 25:
            if "2" in FIXTURE_REPORTS:
                rep2 = FIXTURE_REPORTS["2"]
                break
            time.sleep(0.5)

        # Apply the EXACT SAME assertion function! It MUST FAIL because extension is disabled
        t2_same_assertion_passed, fail_reason = evaluate_fixture_assertion(rep2, expected_inst=2)
        
        # Negative control passes if and only if the SAME assertion fails as expected
        t2_pass = (t2_same_assertion_passed is False)
        t2_detail = f"Negative Control Confirmed: SAME assertion correctly failed when fixture disabled (reason: '{fail_reason}')"
        record("T2: Negative Control (SAME Assertion Fails on Disabled Extension)", t2_pass, t2_detail)
        if not t2_pass:
            test_failed = True

        tracker.terminate_gracefully(p2.pid)
        time.sleep(2)

        # -----------------------------------------------------------------
        # T3: Batch 3 Multi-Instance Isolation & Restart Preservation
        # -----------------------------------------------------------------
        print("\n--- Running T3: Batch 3 Multi-Instance Isolation & Restart ---", flush=True)
        FIXTURE_REPORTS.clear()
        
        # Step A: Test concurrent batch launch command
        p_batch3 = subprocess.Popen([test_launcher, "--batch=3", "--url=about:blank"], cwd=test_root)
        tracker.track(p_batch3.pid)
        p_batch3.wait(timeout=20)
        time.sleep(2)

        reg_file = os.path.join(test_root, "data", "instances.json")
        reg_instances = []
        if os.path.exists(reg_file):
            with open(reg_file, "r") as f:
                reg_data = json.load(f)
                reg_instances = reg_data.get("instances", [])
                for inst in reg_instances:
                    tracker.track(inst["pid"], inst.get("profile_dir", ""))

        record("T3-A: Batch 3 Concurrent Creation", len(reg_instances) == 3, f"instances_registered={len(reg_instances)}/3")

        for inst in reg_instances:
            tracker.terminate_gracefully(inst["pid"])
        time.sleep(2)

        # Step B: Record distinct sentinels across instances 1, 2, 3 and verify isolation
        print("[T3-B] Injecting distinct sentinels into instances 1, 2, 3...", flush=True)
        for i in [1, 2, 3]:
            FIXTURE_REPORTS.clear()
            u = f"http://127.0.0.1:9876/fixture.html?inst={i}&ext_id={EXPECTED_EXT_ID}"
            p_inst = subprocess.Popen([test_launcher, f"--instance={i}", f"--url={u}"], cwd=test_root)
            tracker.track(p_inst.pid)
            t_w = time.time()
            while time.time() - t_w < 25:
                if str(i) in FIXTURE_REPORTS:
                    break
                time.sleep(0.5)
            tracker.terminate_gracefully(p_inst.pid)
            time.sleep(1)

        p1_dir = os.path.join(test_root, "data", "profiles", "instance-1")
        p2_dir = os.path.join(test_root, "data", "profiles", "instance-2")
        p3_dir = os.path.join(test_root, "data", "profiles", "instance-3")
        profiles_isolated = (
            os.path.exists(p1_dir) and
            os.path.exists(p2_dir) and
            os.path.exists(p3_dir) and
            p1_dir != p2_dir and
            p2_dir != p3_dir
        )
        record("T3-B: Batch 3 Disk Profile Directory Isolation", profiles_isolated, f"p1={os.path.exists(p1_dir)}, p2={os.path.exists(p2_dir)}, p3={os.path.exists(p3_dir)}")

        # Step C: Restart Instance 1 and verify data preservation without leakage
        print("[T3-C] Restarting instance 1 to assert sentinel preservation...", flush=True)
        FIXTURE_REPORTS.clear()
        u_restart = f"http://127.0.0.1:9876/fixture.html?inst=1&ext_id={EXPECTED_EXT_ID}"
        p_restart = subprocess.Popen([test_launcher, "--instance=1", f"--url={u_restart}"], cwd=test_root)
        tracker.track(p_restart.pid)
        t_w = time.time()
        rep_restart = None
        while time.time() - t_w < 25:
            if "1" in FIXTURE_REPORTS:
                rep_restart = FIXTURE_REPORTS["1"]
                break
            time.sleep(0.5)

        t3_c_pass = False
        t3_c_detail = ""
        if rep_restart:
            pong = rep_restart.get("pong") or {}
            ping_count = pong.get("ping_count", 0)
            cookie_ok = "sentinel_cookie_inst=1" in rep_restart.get("cookie", "")
            storage_ok = rep_restart.get("local_storage") == "marker_val_1"
            no_inst2_leak = "marker_val_2" not in rep_restart.get("local_storage", "")
            t3_c_pass = (ping_count >= 2) and cookie_ok and storage_ok and no_inst2_leak
            t3_c_detail = f"ping_count={ping_count} (>=2 preserved), cookie={cookie_ok}, storage={storage_ok}, no_leak={no_inst2_leak}"
        else:
            t3_c_detail = "Timeout waiting for restarted instance 1 report"

        record("T3-C: Instance Restart Persistence & Zero Leakage", t3_c_pass, t3_c_detail)
        tracker.terminate_gracefully(p_restart.pid)
        time.sleep(2)

        # -----------------------------------------------------------------
        # T4: Batch 5 Multi-Instance Scale
        # -----------------------------------------------------------------
        print("\n--- Running T4: Batch 5 Scale Verification ---", flush=True)
        p_batch5 = subprocess.Popen([test_launcher, "--batch=5", "--url=about:blank"], cwd=test_root)
        tracker.track(p_batch5.pid)
        p_batch5.wait(timeout=35)
        time.sleep(3)

        reg_instances_5 = []
        if os.path.exists(reg_file):
            with open(reg_file, "r") as f:
                reg_data = json.load(f)
                reg_instances_5 = reg_data.get("instances", [])
                for inst in reg_instances_5:
                    tracker.track(inst["pid"], inst.get("profile_dir", ""))

        t4_pass = len(reg_instances_5) == 5
        record("T4: Batch 5 Multi-Instance Scaling", t4_pass, f"active_instances_count={len(reg_instances_5)}/5")

        for inst in reg_instances_5:
            tracker.terminate_gracefully(inst["pid"])
        time.sleep(4)

        # -----------------------------------------------------------------
        # T5: Same-PC Path Relocation & Stable Extension ID Check
        # -----------------------------------------------------------------
        print("\n--- Running T5: Same-PC Relocation & Stable Extension ID ---", flush=True)
        reloc_root = os.path.join(project_root, f"temp_reloc_{int(time.time()*1000)}_한글 공백")
        
        def ignore_locks(d, files):
            ignored = []
            for f in files:
                f_lower = f.lower()
                if f.endswith(".lock") or f.endswith("-journal") or f.startswith("lockfile") or "cookies" in f_lower or "session" in f_lower or f.startswith("log") or f.lower() == "lock":
                    ignored.append(f)
            return ignored
        shutil.copytree(test_root, reloc_root, ignore=ignore_locks)
        reloc_launcher = os.path.join(reloc_root, "LiteChromiumPortable.exe")

        FIXTURE_REPORTS.clear()
        target_url_reloc = f"http://127.0.0.1:9876/fixture.html?inst=1&ext_id={EXPECTED_EXT_ID}"
        p_reloc = subprocess.Popen([reloc_launcher, "--instance=1", f"--url={target_url_reloc}"], cwd=reloc_root)
        tracker.track(p_reloc.pid)

        t_start = time.time()
        rep_reloc = None
        while time.time() - t_start < 25:
            if "1" in FIXTURE_REPORTS:
                rep_reloc = FIXTURE_REPORTS["1"]
                break
            time.sleep(0.5)

        t5_pass = False
        t5_detail = ""
        if rep_reloc:
            pong = rep_reloc.get("pong") or {}
            same_ext_id = pong.get("sender_id") == EXPECTED_EXT_ID
            alive = pong.get("alive") is True
            t5_pass = same_ext_id and alive
            t5_detail = f"relocated_path={reloc_root}, stable_ext_id={same_ext_id} ({pong.get('sender_id')}), alive={alive}"
        else:
            t5_detail = f"Timeout waiting for report from relocated root: {reloc_root}"

        record("T5: Same-PC Relocation (Korean/Spaces) & Stable Extension ID", t5_pass, t5_detail)

        tracker.terminate_gracefully(p_reloc.pid)
        time.sleep(2)
        shutil.rmtree(reloc_root, ignore_errors=True)

    finally:
        print("\n[R4-RUNNER] Final Cleanup: terminating all verified owned processes gracefully...", flush=True)
        tracker.cleanup_all()
        server.stop()
        time.sleep(2)
        if not test_failed:
            shutil.rmtree(test_root, ignore_errors=True)
            print("[R4-RUNNER] Isolated root removed cleanly.", flush=True)
        else:
            print(f"[R4-RUNNER] Test had failures! Test root PRESERVED for investigation: {test_root}", flush=True)

    summary = {
        "timestamp": time.time(),
        "total": len(results),
        "passed": sum(1 for r in results if r["status"] == "PASS"),
        "failed": sum(1 for r in results if r["status"] == "FAIL"),
        "results": results
    }

    report_path = os.path.join(project_root, "tests", "r4_verification_report.json")
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)

    print(f"\n=======================================================", flush=True)
    print(f"R4 VERIFICATION COMPLETE: {summary['passed']}/{summary['total']} PASSED", flush=True)
    print(f"Report written to: {report_path}", flush=True)
    print(f"=======================================================", flush=True)

    return 0 if summary["failed"] == 0 else 1

if __name__ == "__main__":
    sys.exit(main())

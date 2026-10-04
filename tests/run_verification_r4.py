import ctypes
from ctypes import wintypes
import hashlib
import http.server
import json
import os
import shutil
import subprocess
import sys
import threading
import time
import urllib.parse
import psutil

sys.stdout.reconfigure(encoding='utf-8')

RAW_PROBE_REPORTS = []
LATEST_REPORTS = {}
DOWNLOAD_REQUESTS = set()
EXPECTED_EXT_ID = "mpmmjhlclnpalhaeilhkfkacdjkkhkli"

user32 = ctypes.windll.user32
WNDENUMPROC = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)

def parse_cookies(cookie_str):
    cookies = {}
    if not cookie_str:
        return cookies
    for part in cookie_str.split(";"):
        if "=" in part:
            k, v = part.strip().split("=", 1)
            cookies[k.strip()] = v.strip()
    return cookies

def get_visible_windows_for_pid(target_pid, descendant_pids=None):
    pids = {target_pid}
    if descendant_pids:
        pids.update(descendant_pids)
    hwnds = []

    def enum_cb(hwnd, lparam):
        if user32.IsWindowVisible(hwnd):
            pid = wintypes.DWORD()
            user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
            if pid.value in pids:
                length = user32.GetWindowTextLengthW(hwnd)
                if length > 0:
                    hwnds.append(hwnd)
        return True

    cb = WNDENUMPROC(enum_cb)
    user32.EnumWindows(cb, 0)
    return hwnds

def get_browser_window_for_pid(target_pid):
    hwnds = []
    def enum_cb(hwnd, lparam):
        wp = wintypes.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(wp))
        if wp.value == target_pid:
            cls_buf = ctypes.create_unicode_buffer(256)
            user32.GetClassNameW(hwnd, cls_buf, 256)
            if "Chrome_WidgetWin_1" in cls_buf.value and user32.IsWindowVisible(hwnd):
                hwnds.append(hwnd)
        return True
    user32.EnumWindows(WNDENUMPROC(enum_cb), 0)
    return hwnds

def close_windows_for_pid(target_pid, descendant_pids=None):
    pids = {target_pid}
    if descendant_pids:
        pids.update(descendant_pids)
    hwnds = []

    def enum_cb(hwnd, lparam):
        pid = wintypes.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        if pid.value in pids:
            cls_buf = ctypes.create_unicode_buffer(256)
            user32.GetClassNameW(hwnd, cls_buf, 256)
            # Only target top-level browser frame windows (Chrome_WidgetWin_1)
            # Never send WM_CLOSE to message-only windows (Chrome_WidgetWin_0), IME, or helper windows!
            if "Chrome_WidgetWin_1" in cls_buf.value and user32.IsWindowVisible(hwnd):
                hwnds.append(hwnd)
        return True

    cb = WNDENUMPROC(enum_cb)
    user32.EnumWindows(cb, 0)
    for hwnd in hwnds:
        user32.PostMessageW(hwnd, 0x0010, 0, 0) # WM_CLOSE
    return len(hwnds)

class BoundedFixtureHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass # Suppress noisy server logging

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        qs = urllib.parse.parse_qs(parsed.query)

        if parsed.path == "/fixture.html":
            inst = qs.get("inst", ["1"])[0]
            ext_id = qs.get("ext_id", [EXPECTED_EXT_ID])[0]
            mode = qs.get("mode", ["seed"])[0] # "seed" or "read"
            nonce = qs.get("nonce", ["default_nonce"])[0]
            dl_flag = qs.get("dl", ["0"])[0]
            dl_filename = qs.get("dl_filename", [f"dl_{inst}_{nonce}.txt"])[0]

            html_template = """<!DOCTYPE html>
<html>
<head><title>LCW R4 Fixture Tab __INST__</title></head>
<body>
<h1>LCW Verification Fixture - Instance __INST__</h1>
<div id="status">Initializing...</div>
<a id="download_link" href="/download_sample.txt?filename=__DL_FILENAME__&inst=__INST__&nonce=__NONCE__" download="__DL_FILENAME__" style="display:none;">Download</a>
<script>
(async function() {
    const inst = "__INST__";
    const extId = "__EXT_ID__";
    const mode = "__MODE__";
    const nonce = "__NONCE__";
    const dlFlag = "__DOWNLOAD_TEST__";
    const statusDiv = document.getElementById("status");

    let cookieVal = "";
    let storageVal = "";
    let storageNonce = "";

    if (mode === "seed") {
        document.cookie = "sentinel_cookie_inst=" + inst + "; path=/; max-age=86400";
        document.cookie = "sentinel_nonce=" + nonce + "; path=/; max-age=86400";
        localStorage.setItem("sentinel_storage_inst", "marker_val_" + inst);
        localStorage.setItem("sentinel_nonce", nonce);
    }

    cookieVal = document.cookie;
    storageVal = localStorage.getItem("sentinel_storage_inst") || "";
    storageNonce = localStorage.getItem("sentinel_nonce") || "";

    statusDiv.innerText = "Connecting to extension " + extId + " (mode=" + mode + ")...";

    let extData = null;
    let scriptData = null;
    let errorMsg = null;

    try {
        if (!window.chrome || !chrome.runtime || !chrome.runtime.sendMessage) {
            throw new Error("chrome.runtime API not available in window context");
        }

        const payload = (mode === "seed") 
            ? { type: "SEED", instance_marker: "inst_" + inst, nonce: nonce }
            : { type: "READ" };

        let resp = null;
        for (let attempt = 0; attempt < 8; attempt++) {
            try {
                resp = await new Promise((resolve, reject) => {
                    chrome.runtime.sendMessage(extId, payload, (res) => {
                        if (chrome.runtime.lastError) {
                            reject(new Error(chrome.runtime.lastError.message));
                        } else {
                            resolve(res);
                        }
                    });
                });
                if (resp) break;
            } catch (err) {
                if (attempt === 7) throw err;
                await new Promise(r => setTimeout(r, 600));
            }
        }
        extData = resp;

        const scriptRes = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(extId, { type: "EXECUTE_SCRIPT_TEST" }, (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(response);
                }
            });
        });
        scriptData = scriptRes;

        statusDiv.innerText = "Probe Success! Response received.";
    } catch (e) {
        errorMsg = e.message || String(e);
        statusDiv.innerText = "Error: " + errorMsg;
    }

    if (dlFlag === "1") {
        const dl = document.getElementById("download_link");
        if (dl) dl.click();
    }

    const reportPayload = {
        instance_id: inst,
        ext_id: extId,
        mode: mode,
        nonce: nonce,
        cookie: cookieVal,
        local_storage: storageVal,
        storage_nonce: storageNonce,
        ext_data: extData,
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
            html = (html_template
                    .replace("__INST__", str(inst))
                    .replace("__EXT_ID__", str(ext_id))
                    .replace("__MODE__", str(mode))
                    .replace("__NONCE__", str(nonce))
                    .replace("__DOWNLOAD_TEST__", str(dl_flag))
                    .replace("__DL_FILENAME__", str(dl_filename)))
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(html.encode('utf-8'))))
            self.end_headers()
            self.wfile.write(html.encode('utf-8'))
            return

        if parsed.path == "/download_sample.txt":
            inst = qs.get('inst', ['1'])[0]
            nonce = qs.get('nonce', [''])[0]
            filename = qs.get('filename', [f"dl_{inst}_{nonce}.txt"])[0]
            DOWNLOAD_REQUESTS.add(inst)
            content = f"DOWNLOAD_PAYLOAD_FOR_INSTANCE_{inst}_{nonce}\n".encode('utf-8')
            self.send_response(200)
            self.send_header("Content-Type", "application/octet-stream")
            self.send_header("Content-Disposition", f"attachment; filename={filename}")
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
                entry = {
                    "probe_index": len(RAW_PROBE_REPORTS) + 1,
                    "received_at": time.time(),
                    "instance_id": inst,
                    "mode": data.get("mode"),
                    "nonce": data.get("nonce"),
                    "data": data
                }
                RAW_PROBE_REPORTS.append(entry)
                LATEST_REPORTS[inst] = data
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

class OwnerRecord:
    def __init__(self, instance_id, pid, profile_dir, create_time, executable, cmdline):
        self.instance_id = instance_id
        self.pid = pid
        self.profile_dir = profile_dir
        self.create_time = create_time
        self.executable = executable
        self.cmdline = cmdline

class OwnedProcessTracker:
    def __init__(self, expected_engine_exe):
        self.expected_engine_exe = os.path.normcase(os.path.abspath(expected_engine_exe))
        self.active_owners = {} # pid -> OwnerRecord
        self.all_history = []
        self.events = []

    def log_event(self, event_type, details):
        self.events.append({
            "timestamp": time.time(),
            "type": event_type,
            "details": details
        })

    def register_owner(self, instance_id, pid, profile_dir):
        try:
            p = psutil.Process(pid)
            exe = p.exe()
            cmdline = p.cmdline()
            create_time = p.create_time()
        except Exception as e:
            raise RuntimeError(f"Owner PID {pid} inspection failed: {e}")

        norm_exe = os.path.normcase(os.path.abspath(exe))
        if norm_exe != self.expected_engine_exe:
            raise RuntimeError(f"Owner PID {pid} executable mismatch: {norm_exe} vs expected {self.expected_engine_exe}")

        clean_profile = os.path.normcase(os.path.abspath(profile_dir))
        has_profile_arg = any(f"--user-data-dir={profile_dir}" in arg or clean_profile in os.path.normcase(arg) for arg in cmdline)
        if not has_profile_arg:
            raise RuntimeError(f"Owner PID {pid} command line missing exact profile argument {profile_dir}")

        if create_time <= 0:
            raise RuntimeError(f"Owner PID {pid} has invalid creation time {create_time}")

        rec = OwnerRecord(instance_id, pid, profile_dir, create_time, exe, cmdline)
        self.active_owners[pid] = rec
        self.all_history.append(rec)
        self.log_event("OWNER_REGISTERED", {
            "instance_id": instance_id,
            "pid": pid,
            "profile_dir": profile_dir,
            "create_time": create_time,
            "exe": exe
        })
        return rec

    def get_windows(self, pid):
        try:
            p = psutil.Process(pid)
            children = [c.pid for c in p.children(recursive=True)]
        except Exception:
            children = []
        return get_visible_windows_for_pid(pid, children)

    def close_and_wait_owner(self, pid, timeout=12):
        rec = self.active_owners.get(pid)
        inst_id = rec.instance_id if rec else "unknown"
        self.log_event("CLOSE_REQUESTED", {"instance_id": inst_id, "pid": pid})
        try:
            p = psutil.Process(pid)
        except psutil.NoSuchProcess:
            if pid in self.active_owners:
                del self.active_owners[pid]
            self.log_event("PROCESS_EXITED", {"instance_id": inst_id, "pid": pid, "exit_mode": "already_dead", "clean_exit": True})
            return True, "already_dead"

        try:
            t_start = time.time()
            graceful_success = False
            last_sent = 0
            try:
                known_children = p.children(recursive=True)
            except Exception:
                known_children = []

            while time.time() - t_start < timeout:
                if not psutil.pid_exists(pid) or not p.is_running():
                    graceful_success = True
                    break

                now = time.time()
                if now - last_sent >= 1.5:
                    hwnds = []
                    def enum_cb(hwnd, lparam):
                        w_pid = wintypes.DWORD()
                        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(w_pid))
                        if w_pid.value == pid:
                            cls_buf = ctypes.create_unicode_buffer(256)
                            user32.GetClassNameW(hwnd, cls_buf, 256)
                            if "Chrome_WidgetWin_1" in cls_buf.value and user32.IsWindowVisible(hwnd):
                                hwnds.append(hwnd)
                        return True
                    user32.EnumWindows(WNDENUMPROC(enum_cb), 0)

                    for h in hwnds:
                        user32.PostMessageW(h, 0x0010, 0, 0)
                    if hwnds:
                        last_sent = now

                time.sleep(0.1)

            exit_mode = "graceful_wm_close" if graceful_success else "forced_kill"

            procs = [p] + [c for c in known_children if psutil.pid_exists(c.pid)]

            if not graceful_success:
                for proc in procs:
                    try:
                        if psutil.pid_exists(proc.pid):
                            proc.kill()
                    except Exception:
                        pass

            gone, alive = psutil.wait_procs(procs, timeout=3)
            if alive:
                for a in alive:
                    try:
                        a.kill()
                    except Exception:
                        pass
                psutil.wait_procs(alive, timeout=2)

            final_dead = not psutil.pid_exists(pid)

            self.log_event("PROCESS_EXITED", {
                "instance_id": inst_id,
                "pid": pid,
                "exit_mode": exit_mode,
                "clean_exit": final_dead
            })
            if final_dead and pid in self.active_owners:
                del self.active_owners[pid]
            return final_dead, exit_mode
        except Exception as e:
            self.log_event("CLOSE_ERROR", {"instance_id": inst_id, "pid": pid, "error": str(e), "clean_exit": False})
            return False, str(e)

    def cleanup_all(self):
        all_clean = True
        for pid in list(self.active_owners.keys()):
            dead, mode = self.close_and_wait_owner(pid, timeout=6)
            if not dead:
                all_clean = False
        return all_clean

def evaluate_fixture_assertion(report, expected_inst, expected_nonce, expected_mode, server_port=9876):
    """The canonical SAME assertion function used for all positive tests and negative controls."""
    if not report:
        return False, "No report received (timeout or connection refused)"

    if report.get("error"):
        return False, f"Extension error reported: {report['error']}"

    ext_data = report.get("ext_data") or {}
    if not ext_data.get("alive"):
        return False, f"Extension not alive or invalid ext_data: {ext_data}"

    if ext_data.get("sender_id") != EXPECTED_EXT_ID:
        return False, f"Sender ID mismatch: {ext_data.get('sender_id')} vs expected {EXPECTED_EXT_ID}"

    if ext_data.get("context_type") != "SERVICE_WORKER":
        return False, f"Context type mismatch: {ext_data.get('context_type')}"

    # Verify storage values
    if expected_mode == "seed":
        if ext_data.get("instance_marker") != f"inst_{expected_inst}":
            return False, f"Seed instance_marker mismatch: {ext_data.get('instance_marker')} vs inst_{expected_inst}"
        if ext_data.get("seed_nonce") != expected_nonce:
            return False, f"Seed nonce mismatch: {ext_data.get('seed_nonce')} vs {expected_nonce}"
    elif expected_mode == "read":
        storage_data = ext_data.get("data") or {}
        if storage_data.get("instance_marker") != f"inst_{expected_inst}":
            return False, f"Read instance_marker mismatch in extension storage: {storage_data.get('instance_marker')} vs inst_{expected_inst}"
        if storage_data.get("seed_nonce") != expected_nonce:
            return False, f"Read nonce mismatch in extension storage: {storage_data.get('seed_nonce')} vs {expected_nonce}"

    # Check script execution (exact tab, frame, and URL target match)
    script_res = report.get("script_result") or {}
    if script_res.get("frame_id") != 0:
        return False, f"Script frame_id mismatch: {script_res.get('frame_id')} != 0"
    if script_res.get("tab_id") is None:
        return False, "Missing tab_id in executeScript result"

    res_obj = script_res.get("result") or {}
    expected_origin = f"http://127.0.0.1:{server_port}"
    if res_obj.get("origin") != expected_origin:
        return False, f"Script origin mismatch: {res_obj.get('origin')} != {expected_origin}"
    if res_obj.get("pathname") != "/fixture.html":
        return False, f"Script pathname mismatch: {res_obj.get('pathname')} != /fixture.html"

    # Exact query parameters validation
    parsed_qs = urllib.parse.parse_qs(res_obj.get("search", "").lstrip("?"))
    if parsed_qs.get("inst") != [str(expected_inst)]:
        return False, f"Script URL inst parameter mismatch: {parsed_qs.get('inst')} != {[str(expected_inst)]}"
    if parsed_qs.get("mode") != [expected_mode]:
        return False, f"Script URL mode parameter mismatch: {parsed_qs.get('mode')} != {[expected_mode]}"
    if parsed_qs.get("nonce") != [expected_nonce]:
        return False, f"Script URL nonce parameter mismatch: {parsed_qs.get('nonce')} != {[expected_nonce]}"

    expected_title = f"LCW R4 Fixture Tab {expected_inst}"
    if res_obj.get("title") != expected_title:
        return False, f"Script Title mismatch: {res_obj.get('title')} vs {expected_title}"

    # Check cookies with exact key-value match
    cookies = parse_cookies(report.get("cookie", ""))
    if cookies.get("sentinel_cookie_inst") != str(expected_inst):
        return False, f"Exact cookie sentinel mismatch: {cookies.get('sentinel_cookie_inst')} != {expected_inst}"
    if cookies.get("sentinel_nonce") != expected_nonce:
        return False, f"Exact cookie nonce mismatch: {cookies.get('sentinel_nonce')} != {expected_nonce}"

    # Check localStorage
    if report.get("local_storage") != f"marker_val_{expected_inst}":
        return False, f"LocalStorage sentinel mismatch: {report.get('local_storage')} vs marker_val_{expected_inst}"
    if report.get("storage_nonce") != expected_nonce:
        return False, f"LocalStorage nonce mismatch: {report.get('storage_nonce')} vs {expected_nonce}"

    return True, "All MV3 Worker, Scripting, Target Tab URL, Cookie, and Storage assertions PASSED"

def find_actual_owner_pid(test_root, instance_id):
    reg_file = os.path.join(test_root, "data", "instances.json")
    if os.path.exists(reg_file):
        try:
            with open(reg_file, "r") as f:
                data = json.load(f)
                for inst in data.get("instances", []):
                    if inst.get("instance_id") == instance_id:
                        return inst.get("pid"), inst.get("profile_dir", "")
        except Exception:
            pass
    return None, ""

def compute_sha256(filepath):
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    launcher_exe = os.path.join(project_root, "LiteChromiumPortable.exe")
    fixture_src = os.path.join(project_root, "extensions", "mv3-fixture")
    expected_engine = os.path.join(project_root, "engine", "chrome.exe")

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

    isolated_engine = os.path.join(test_root, "engine", "chrome.exe")
    tracker = OwnedProcessTracker(expected_engine_exe=isolated_engine)
    server = FixtureServer(port=9876)
    server.start()

    results = []
    test_failed = False
    reloc_root = None

    def record(name, passed, detail):
        nonlocal test_failed
        status = "PASS" if passed else "FAIL"
        results.append({"name": name, "status": status, "detail": detail})
        print(f"[{status}] {name}: {detail}", flush=True)
        if not passed:
            test_failed = True

    try:
        # Prepare test environment
        test_launcher = os.path.join(test_root, "LiteChromiumPortable.exe")
        shutil.copy2(launcher_exe, test_launcher)
        launcher_hash = compute_sha256(test_launcher)

        # Copy engine
        test_engine_dir = os.path.join(test_root, "engine")
        shutil.copytree(os.path.join(project_root, "engine"), test_engine_dir)

        # Install mv3-fixture in test_root/extensions/mv3-fixture
        test_exts = os.path.join(test_root, "extensions", "mv3-fixture")
        shutil.copytree(fixture_src, test_exts)

        # -----------------------------------------------------------------
        # T0: Wrong-Target & Target-URL Rejection Control
        # -----------------------------------------------------------------
        print("\n--- Running T0: Target Identity & Negative Assertion Controls ---", flush=True)
        dummy_inst1_report = {
            "instance_id": "1",
            "ext_id": EXPECTED_EXT_ID,
            "mode": "seed",
            "nonce": "test_nonce_1",
            "cookie": "sentinel_cookie_inst=10; sentinel_nonce=test_nonce_1", # prefix collision
            "local_storage": "marker_val_1",
            "storage_nonce": "test_nonce_1",
            "ext_data": {
                "alive": True,
                "sender_id": EXPECTED_EXT_ID,
                "context_type": "SERVICE_WORKER",
                "instance_marker": "inst_1",
                "seed_nonce": "test_nonce_1"
            },
            "script_result": {
                "frame_id": 0,
                "tab_id": 100,
                "result": {
                    "origin": "http://127.0.0.1:9876",
                    "pathname": "/fixture.html",
                    "search": "?inst=1&mode=seed&nonce=test_nonce_1",
                    "url": "http://127.0.0.1:9876/fixture.html?inst=1&mode=seed&nonce=test_nonce_1",
                    "title": "LCW R4 Fixture Tab 1"
                }
            },
            "error": None
        }
        passed_coll, reason_coll = evaluate_fixture_assertion(dummy_inst1_report, expected_inst=1, expected_nonce="test_nonce_1", expected_mode="seed")

        # Wrong-target control: Normal markers for inst 1, but target tab URL belongs to inst 2
        dummy_wrong_target_report = dict(dummy_inst1_report)
        dummy_wrong_target_report["cookie"] = "sentinel_cookie_inst=1; sentinel_nonce=test_nonce_1" # correct cookie
        dummy_wrong_target_report["script_result"] = {
            "frame_id": 0,
            "tab_id": 100,
            "result": {
                "origin": "http://127.0.0.1:9876",
                "pathname": "/fixture.html",
                "search": "?inst=2&mode=seed&nonce=test_nonce_1", # wrong URL
                "url": "http://127.0.0.1:9876/fixture.html?inst=2&mode=seed&nonce=test_nonce_1",
                "title": "LCW R4 Fixture Tab 2"
            }
        }
        passed_wrong_url, reason_wrong_url = evaluate_fixture_assertion(dummy_wrong_target_report, expected_inst=1, expected_nonce="test_nonce_1", expected_mode="seed")

        t0_pass = (not passed_coll) and (not passed_wrong_url)
        record("T0: Wrong-Target & Cookie Substring Rejection Control", t0_pass, 
               f"cookie_collision_rejected={not passed_coll} ('{reason_coll}'), target_url_mismatch_rejected={not passed_wrong_url} ('{reason_wrong_url}')")

        # -----------------------------------------------------------------
        # T1: Single Instance Seed + Completed Download in Test-Root + Strict Window Count
        # -----------------------------------------------------------------
        print("\n--- Running T1: Single Instance Seed, Download & Window Handoff ---", flush=True)
        LATEST_REPORTS.clear()
        DOWNLOAD_REQUESTS.clear()
        nonce_t1 = f"nonce_{int(time.time()*1000)}_inst1"
        dl_filename = f"dl_{run_id}_{nonce_t1}.txt"

        custom_dl_dir = os.path.join(test_root, "downloads")
        os.makedirs(custom_dl_dir, exist_ok=True)

        p1_profile = os.path.join(test_root, "data", "profiles", "instance-1")
        p1_default = os.path.join(p1_profile, "Default")
        os.makedirs(p1_default, exist_ok=True)
        with open(os.path.join(p1_default, "Preferences"), "w", encoding="utf-8") as f:
            json.dump({
                "download": {
                    "default_directory": custom_dl_dir,
                    "prompt_for_download": False,
                    "directory_upgrade": True
                }
            }, f)

        target_url = f"http://127.0.0.1:9876/fixture.html?inst=1&ext_id={EXPECTED_EXT_ID}&mode=seed&nonce={nonce_t1}&dl=1&dl_filename={dl_filename}"
        res1 = subprocess.run([test_launcher, "--instance=1", f"--url={target_url}"], cwd=test_root, capture_output=True, text=True, encoding="utf-8", errors="replace")
        time.sleep(2)

        p1_pid, p1_prof = find_actual_owner_pid(test_root, 1)
        if not p1_pid:
            record("T1: Actual Owner Registration", False, f"Launcher output: {res1.stdout} {res1.stderr}")
        else:
            rec1 = tracker.register_owner(1, p1_pid, p1_prof)
            print(f"[T1] Bound actual browser owner: PID={p1_pid}, Exe={rec1.executable}, CreateTime={rec1.create_time}", flush=True)

            # Wait until initial owner window is actually visible and ready
            w_initial = 0
            t_win_wait = time.time()
            while time.time() - t_win_wait < 12:
                hwnds = tracker.get_windows(p1_pid)
                if len(hwnds) >= 1:
                    w_initial = len(hwnds)
                    break
                time.sleep(0.5)

            if w_initial < 1:
                record("T1-A: Initial Owner Window Visibility", False, f"No visible top-level windows detected for PID {p1_pid}")
            else:
                record("T1-A: Initial Owner Window Visibility", True, f"Detected {w_initial} ready visible windows for PID {p1_pid}")

                # Trigger handoff with --new-window
                handoff_url = f"http://127.0.0.1:9876/fixture.html?inst=1&ext_id={EXPECTED_EXT_ID}&mode=seed&nonce={nonce_t1}&dl=0"
                subprocess.run([test_launcher, "--instance=1", f"--url={handoff_url}"], cwd=test_root, capture_output=True, text=True, encoding="utf-8", errors="replace")
                
                # Poll for exact window count increase (must be strictly w_initial + 1)
                w_after = 0
                t_handoff_wait = time.time()
                while time.time() - t_handoff_wait < 12:
                    curr_w = len(tracker.get_windows(p1_pid))
                    if curr_w == w_initial + 1:
                        w_after = curr_w
                        break
                    time.sleep(0.5)

                window_handoff_pass = (w_after == w_initial + 1)
                record("T1-A: Strict Same-Instance Handoff Window Count (+1 HWND)", window_handoff_pass, 
                       f"windows_initial={w_initial}, windows_after={w_after} (expected {w_initial+1})")

            # Wait for probe report
            t_start = time.time()
            rep1 = None
            while time.time() - t_start < 40:
                if "1" in LATEST_REPORTS:
                    rep1 = LATEST_REPORTS["1"]
                    break
                time.sleep(0.5)

            t1_valid, t1_reason = evaluate_fixture_assertion(rep1, expected_inst=1, expected_nonce=nonce_t1, expected_mode="seed")

            # Verify completed download file STRICTLY inside test_root/downloads
            expected_dl_path = os.path.join(custom_dl_dir, dl_filename)
            dl_file_found = False
            t_dl_wait = time.time()
            while time.time() - t_dl_wait < 12:
                if os.path.exists(expected_dl_path) and os.path.getsize(expected_dl_path) > 0 and not expected_dl_path.endswith(".crdownload"):
                    dl_file_found = True
                    break
                time.sleep(0.5)

            dl_content_ok = False
            if dl_file_found:
                with open(expected_dl_path, "r", encoding="utf-8") as f:
                    content = f.read()
                    expected_content = f"DOWNLOAD_PAYLOAD_FOR_INSTANCE_1_{nonce_t1}\n"
                    dl_content_ok = (content == expected_content)

            t1_pass = t1_valid and dl_file_found and dl_content_ok
            t1_detail = f"{t1_reason}, isolated_file_downloaded={dl_file_found} ({expected_dl_path}), payload_verified={dl_content_ok}"
            record("T1: Single Instance MV3 Worker Probe, Scripting & Completed Isolated Download", t1_pass, t1_detail)

            # Close owner and verify actual dead state
            closed, mode = tracker.close_and_wait_owner(p1_pid, timeout=12)
            record("T1-B: Verified Owner Closure & Exit", closed, f"PID {p1_pid} dead={closed}, exit_mode={mode}")
            if not closed:
                test_failed = True

        time.sleep(2)

        # -----------------------------------------------------------------
        # T2: Selective Negative Control (Reach Fixture + Explicit Error + Assertion Fails)
        # -----------------------------------------------------------------
        print("\n--- Running T2: Selective Negative Control (Disable Existing Instance) ---", flush=True)
        LATEST_REPORTS.clear()

        # Disable mv3-fixture in instance-1 profile
        p1_cfg_file = os.path.join(test_root, "data", "profiles", "instance-1", "extensions_config.json")
        with open(p1_cfg_file, "w", encoding="utf-8") as f:
            json.dump({"disabled_extensions": ["mv3-fixture"]}, f)

        neg_nonce = f"neg_nonce_{int(time.time()*1000)}"
        neg_url = f"http://127.0.0.1:9876/fixture.html?inst=1&ext_id={EXPECTED_EXT_ID}&mode=seed&nonce={neg_nonce}&dl=0"
        subprocess.run([test_launcher, "--instance=1", f"--url={neg_url}"], cwd=test_root, capture_output=True, text=True, encoding="utf-8", errors="replace")
        time.sleep(2)

        p1_neg_pid, _ = find_actual_owner_pid(test_root, 1)
        if p1_neg_pid:
            tracker.register_owner(1, p1_neg_pid, p1_prof)

        # The disabled browser MUST reach fixture and report an explicit recognized extension failure
        t_start = time.time()
        rep2 = None
        while time.time() - t_start < 30:
            if "1" in LATEST_REPORTS:
                rep2 = LATEST_REPORTS["1"]
                break
            time.sleep(0.5)

        if not rep2:
            record("T2: Negative Control (Explicit Extension Error Required)", False, "Harness FAIL: browser failed to reach fixture or timed out!")
        else:
            reported_err = str(rep2.get("error", ""))
            nonce_matched = (rep2.get("nonce") == neg_nonce)
            has_recognized_err = ("chrome.runtime API not available" in reported_err or "Could not establish connection" in reported_err)
            same_assertion_passed, fail_reason = evaluate_fixture_assertion(rep2, expected_inst=1, expected_nonce=neg_nonce, expected_mode="seed")
            
            t2_pass = nonce_matched and has_recognized_err and (same_assertion_passed is False)
            record("T2: Negative Control (SAME Assertion Fails on Disabled Extension)", t2_pass, 
                   f"fixture_reached=True (nonce_matched={nonce_matched}), recognized_error='{reported_err}', SAME_assertion_failed={not same_assertion_passed} ('{fail_reason}')")

        if p1_neg_pid:
            closed, mode = tracker.close_and_wait_owner(p1_neg_pid, timeout=10)
            if not closed or mode == "forced_kill":
                record("T2: Owner Exit PID " + str(p1_neg_pid), False, f"clean_exit=False, mode={mode}")

        # Restore instance-1 extensions_config.json
        if os.path.exists(p1_cfg_file):
            os.remove(p1_cfg_file)
        time.sleep(2)

        # -----------------------------------------------------------------
        # T3: Batch 3 Multi-Instance Isolation & Read-Only Restart Persistence
        # -----------------------------------------------------------------
        print("\n--- Running T3: Batch 3 Multi-Instance Isolation & Read-Only Restart ---", flush=True)

        # Step 3-A: Batch creation
        subprocess.run([test_launcher, "--batch=3", "--url=about:blank"], cwd=test_root, capture_output=True, text=True, encoding="utf-8", errors="replace")
        time.sleep(2)
        b3_pids = []
        for i in [1, 2, 3]:
            pid_i, prof_i = find_actual_owner_pid(test_root, i)
            if pid_i:
                tracker.register_owner(i, pid_i, prof_i)
                b3_pids.append(pid_i)

        record("T3-A: Batch 3 Concurrent Creation", len(b3_pids) == 3, f"verified_owners={len(b3_pids)}/3 (PIDs: {b3_pids})")

        # Wait for all batch windows to be ready before initiating closing sequence
        for pid in b3_pids:
            t0 = time.time()
            while time.time() - t0 < 30:
                if get_browser_window_for_pid(pid):
                    break
                time.sleep(0.3)

        for pid in b3_pids:
            closed, mode = tracker.close_and_wait_owner(pid, timeout=25)
            if not closed or mode == "forced_kill":
                record(f"T3-A Exit PID {pid}", False, f"clean_exit=False, mode={mode}")
        time.sleep(2)

        # Step 3-B: Seed distinct nonces across instances 1, 2, 3
        print("[T3-B] Seeding distinct sentinels and nonces across instances 1, 2, 3...", flush=True)
        nonces_3 = {}
        for i in [1, 2, 3]:
            LATEST_REPORTS.clear()
            nonce_i = f"nonce_{int(time.time()*1000)}_b3_inst{i}"
            nonces_3[i] = nonce_i
            u = f"http://127.0.0.1:9876/fixture.html?inst={i}&ext_id={EXPECTED_EXT_ID}&mode=seed&nonce={nonce_i}"
            subprocess.run([test_launcher, f"--instance={i}", f"--url={u}"], cwd=test_root, capture_output=True, text=True, encoding="utf-8", errors="replace")
            time.sleep(1)
            pid_i, prof_i = find_actual_owner_pid(test_root, i)
            if pid_i:
                tracker.register_owner(i, pid_i, prof_i)

            t_w = time.time()
            while time.time() - t_w < 30:
                if str(i) in LATEST_REPORTS and LATEST_REPORTS[str(i)].get("nonce") == nonce_i:
                    break
                time.sleep(0.5)

            closed, mode = tracker.close_and_wait_owner(pid_i, timeout=10)
            if not closed or mode == "forced_kill":
                record(f"T3-B Exit PID {pid_i}", False, f"clean_exit=False, mode={mode}")
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

        # Step 3-C: Read persistence BEFORE mutation (mode=read, zero reseeding)
        print("[T3-C] Restarting instances 1, 2, 3 in READ-ONLY mode to assert persistence before mutation...", flush=True)
        read_successes = []
        for i in [1, 2, 3]:
            LATEST_REPORTS.clear()
            nonce_i = nonces_3[i]
            u_read = f"http://127.0.0.1:9876/fixture.html?inst={i}&ext_id={EXPECTED_EXT_ID}&mode=read&nonce={nonce_i}"
            subprocess.run([test_launcher, f"--instance={i}", f"--url={u_read}"], cwd=test_root, capture_output=True, text=True, encoding="utf-8", errors="replace")
            time.sleep(1)
            pid_i, prof_i = find_actual_owner_pid(test_root, i)
            if pid_i:
                tracker.register_owner(i, pid_i, prof_i)

            t_w = time.time()
            rep_i = None
            while time.time() - t_w < 30:
                if str(i) in LATEST_REPORTS and LATEST_REPORTS[str(i)].get("mode") == "read":
                    rep_i = LATEST_REPORTS[str(i)]
                    break
                time.sleep(0.5)

            v_ok, v_reason = evaluate_fixture_assertion(rep_i, expected_inst=i, expected_nonce=nonce_i, expected_mode="read")
            if v_ok:
                read_successes.append(i)
            else:
                print(f"[T3-C] Instance {i} read verification failed: {v_reason}", flush=True)

            closed, mode = tracker.close_and_wait_owner(pid_i, timeout=10)
            if not closed or mode == "forced_kill":
                record(f"T3-C Exit PID {pid_i}", False, f"clean_exit=False, mode={mode}")
            time.sleep(1)

        t3_c_pass = (len(read_successes) == 3)
        record("T3-C: Instance Restart Read-Only Persistence & Zero Contamination", t3_c_pass, f"verified_instances={read_successes}/[1, 2, 3]")

        # -----------------------------------------------------------------
        # T4: Batch 5 Multi-Instance Scale & Distinct Nonce Verification
        # -----------------------------------------------------------------
        print("\n--- Running T4: Batch 5 Scale & Distinct Verification ---", flush=True)
        subprocess.run([test_launcher, "--batch=5", "--url=about:blank"], cwd=test_root, capture_output=True, text=True, encoding="utf-8", errors="replace")
        time.sleep(4)

        b5_pids = []
        for i in range(1, 6):
            pid_i, prof_i = find_actual_owner_pid(test_root, i)
            if pid_i:
                tracker.register_owner(i, pid_i, prof_i)
                b5_pids.append(pid_i)

        record("T4-A: Batch 5 Scaling Creation", len(b5_pids) == 5, f"active_instances_count={len(b5_pids)}/5 (PIDs: {b5_pids})")

        # Wait for all batch windows to be ready before initiating closing sequence
        for pid in b5_pids:
            t0 = time.time()
            while time.time() - t0 < 60:
                if get_browser_window_for_pid(pid):
                    break
                time.sleep(0.3)

        for pid in b5_pids:
            closed, mode = tracker.close_and_wait_owner(pid, timeout=25)
            if not closed or mode == "forced_kill":
                record(f"T4-A Exit PID {pid}", False, f"clean_exit=False, mode={mode}")
        time.sleep(2)

        # Seed distinct nonces across all 5 instances
        print("[T4-B] Seeding distinct nonces across instances 1..5...", flush=True)
        nonces_5 = {}
        for i in range(1, 6):
            LATEST_REPORTS.clear()
            nonce_i = f"nonce_{int(time.time()*1000)}_b5_inst{i}"
            nonces_5[i] = nonce_i
            u = f"http://127.0.0.1:9876/fixture.html?inst={i}&ext_id={EXPECTED_EXT_ID}&mode=seed&nonce={nonce_i}"
            subprocess.run([test_launcher, f"--instance={i}", f"--url={u}"], cwd=test_root, capture_output=True, text=True, encoding="utf-8", errors="replace")
            time.sleep(1)
            pid_i, prof_i = find_actual_owner_pid(test_root, i)
            if pid_i:
                tracker.register_owner(i, pid_i, prof_i)

            t_w = time.time()
            while time.time() - t_w < 30:
                if str(i) in LATEST_REPORTS and LATEST_REPORTS[str(i)].get("nonce") == nonce_i:
                    break
                time.sleep(0.5)

            closed, mode = tracker.close_and_wait_owner(pid_i, timeout=10)
            if not closed or mode == "forced_kill":
                record(f"T4-B Seed Exit PID {pid_i}", False, f"clean_exit=False, mode={mode}")
            time.sleep(1)

        # Read back all 5 instances in READ-ONLY mode
        print("[T4-C] Reading back all 5 instances in READ-ONLY mode...", flush=True)
        b5_read_successes = []
        for i in range(1, 6):
            LATEST_REPORTS.clear()
            nonce_i = nonces_5[i]
            u_read = f"http://127.0.0.1:9876/fixture.html?inst={i}&ext_id={EXPECTED_EXT_ID}&mode=read&nonce={nonce_i}"
            subprocess.run([test_launcher, f"--instance={i}", f"--url={u_read}"], cwd=test_root, capture_output=True, text=True, encoding="utf-8", errors="replace")
            time.sleep(1)
            pid_i, prof_i = find_actual_owner_pid(test_root, i)
            if pid_i:
                tracker.register_owner(i, pid_i, prof_i)

            t_w = time.time()
            rep_i = None
            while time.time() - t_w < 30:
                if str(i) in LATEST_REPORTS and LATEST_REPORTS[str(i)].get("mode") == "read":
                    rep_i = LATEST_REPORTS[str(i)]
                    break
                time.sleep(0.5)

            v_ok, v_reason = evaluate_fixture_assertion(rep_i, expected_inst=i, expected_nonce=nonce_i, expected_mode="read")
            if v_ok:
                b5_read_successes.append(i)
            else:
                print(f"[T4-C] Instance {i} read verification failed: {v_reason}", flush=True)

            closed, mode = tracker.close_and_wait_owner(pid_i, timeout=10)
            if not closed or mode == "forced_kill":
                record(f"T4-C Read Exit PID {pid_i}", False, f"clean_exit=False, mode={mode}")
            time.sleep(1)

        record("T4-B: Batch 5 Distinct Nonce Read Persistence & Zero Contamination", len(b5_read_successes) == 5, f"verified={b5_read_successes}/[1, 2, 3, 4, 5]")

        # -----------------------------------------------------------------
        # T5: Complete Profile Relocation (Korean/Spaces) & Read-Only Persistence
        # -----------------------------------------------------------------
        print("\n--- Running T5: Complete Relocation & Read-Only Persistence ---", flush=True)
        # Ensure all owners are completely closed before directory copy
        cleanup_ok = tracker.cleanup_all()
        if not cleanup_ok:
            record("T5: Pre-Relocation Owner Cleanup", False, "Some owners failed to terminate cleanly before relocation")
        time.sleep(2)

        reloc_root = os.path.join(project_root, f"temp_reloc_{int(time.time()*1000)}_한글 공백")
        shutil.copytree(test_root, reloc_root)
        reloc_launcher = os.path.join(reloc_root, "LiteChromiumPortable.exe")
        reloc_engine = os.path.join(reloc_root, "engine", "chrome.exe")
        reloc_tracker = OwnedProcessTracker(expected_engine_exe=reloc_engine)

        LATEST_REPORTS.clear()
        target_url_reloc = f"http://127.0.0.1:9876/fixture.html?inst=1&ext_id={EXPECTED_EXT_ID}&mode=read&nonce={nonces_5[1]}"
        subprocess.run([reloc_launcher, "--instance=1", f"--url={target_url_reloc}"], cwd=reloc_root, capture_output=True, text=True, encoding="utf-8", errors="replace")
        time.sleep(2)

        reloc_pid, reloc_prof = find_actual_owner_pid(reloc_root, 1)
        if reloc_pid:
            reloc_tracker.register_owner(1, reloc_pid, reloc_prof)

        t_start = time.time()
        rep_reloc = None
        while time.time() - t_start < 30:
            if "1" in LATEST_REPORTS and LATEST_REPORTS["1"].get("mode") == "read":
                rep_reloc = LATEST_REPORTS["1"]
                break
            time.sleep(0.5)

        t5_pass, t5_detail = evaluate_fixture_assertion(rep_reloc, expected_inst=1, expected_nonce=nonces_5[1], expected_mode="read")
        record("T5: Complete Directory Relocation (Korean/Spaces) & Read-Only Retention", t5_pass, f"reloc_path={reloc_root}, {t5_detail}")

        if reloc_pid:
            closed, mode = reloc_tracker.close_and_wait_owner(reloc_pid, timeout=10)
            if not closed or mode == "forced_kill":
                record("T5: Relocated Owner Exit", False, f"clean_exit=False, mode={mode}")

        # Merge reloc tracker events into main tracker
        tracker.events.extend(reloc_tracker.events)
        time.sleep(2)

    except Exception as e:
        test_failed = True
        record("R4 Suite Unhandled Exception", False, str(e))
    finally:
        print("\n[R4-RUNNER] Final Cleanup: terminating all verified owned processes...", flush=True)
        final_ok = tracker.cleanup_all()
        server.stop()
        time.sleep(2)

        if not final_ok:
            test_failed = True
            print("[R4-RUNNER] WARNING: final cleanup had lingering processes!", flush=True)

        if any(r["status"] == "FAIL" for r in results):
            test_failed = True

        if not test_failed:
            shutil.rmtree(test_root, ignore_errors=True)
            if reloc_root and os.path.exists(reloc_root):
                shutil.rmtree(reloc_root, ignore_errors=True)
            print("[R4-RUNNER] All tests passed! Test roots removed cleanly.", flush=True)
        else:
            print(f"[R4-RUNNER] TEST SUITE FAILED! Preserving test root for audit: {test_root}", flush=True)
            if reloc_root:
                print(f"[R4-RUNNER] Preserving relocated root for audit: {reloc_root}", flush=True)

    summary = {
        "timestamp": time.time(),
        "launcher_sha256": launcher_hash if 'launcher_hash' in locals() else "",
        "total": len(results),
        "passed": sum(1 for r in results if r["status"] == "PASS"),
        "failed": sum(1 for r in results if r["status"] == "FAIL"),
        "results": results
    }

    report_path = os.path.join(project_root, "tests", "r4_verification_report.json")
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)

    raw_diagnostics_path = os.path.join(project_root, "tests", "r4_verification_raw_diagnostics.json")
    with open(raw_diagnostics_path, "w", encoding="utf-8") as f:
        json.dump({
            "summary": summary,
            "raw_probe_reports_count": len(RAW_PROBE_REPORTS),
            "raw_probe_reports": RAW_PROBE_REPORTS,
            "lifecycle_events_count": len(tracker.events),
            "lifecycle_events": tracker.events,
            "all_registered_owners_count": len(tracker.all_history),
            "all_registered_owners": [
                {
                    "instance_id": o.instance_id,
                    "pid": o.pid,
                    "profile_dir": o.profile_dir,
                    "create_time": o.create_time,
                    "executable": o.executable
                } for o in tracker.all_history
            ]
        }, f, indent=2)

    print(f"\n=======================================================", flush=True)
    print(f"R4 VERIFICATION COMPLETE: {summary['passed']}/{summary['total']} PASSED", flush=True)
    print(f"Report written to: {report_path}", flush=True)
    print(f"Raw diagnostics written to: {raw_diagnostics_path}", flush=True)
    print(f"=======================================================", flush=True)

    return 0 if summary["failed"] == 0 else 1

if __name__ == "__main__":
    sys.exit(main())

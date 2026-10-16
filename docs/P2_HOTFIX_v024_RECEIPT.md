# [OCA-DEV-1.1] Lite Chromium Portable — v0.2.4-hotfix Delivery Receipt

```markdown
[PROJECT]: Lite Chromium Portable
[WORKSPACE ROOT]: E:\vivpr\ai\ebrowser
[BOUND THREAD]: goodkie/v-show Issue #8
[ISOLATION SANITY CHECK]: VERIFIED (Zero cross-project contamination)
```

## 1. Executive Summary
- **Release Version**: `v0.2.4-hotfix`
- **Package Archive**: `LiteChromiumPortable_v0.2.4-hotfix_win64.zip`
- **Purpose**: Immediate remediation of critical BAT execution syntax errors and extension startup failures reported in `v0.2.3-beta`.
- **Target OS**: Windows 10 / 11 x64
- **Engine**: Chromium M154 (`154.0.8037.57`)

---

## 2. Root Cause Analysis & Local Reproduction

### A. Windows cmd.exe Batch Parsing Errors
1. **Shell Redirection Operator `< >`**:
   - In `03_보조도구창_실행.bat`, the example prompt contained `<id>`, causing `cmd.exe` to treat `<` and `>` as stdin/stdout redirection.
   - **Fix**: Replaced with safe placeholders `[EXTENSION_ID]`.
2. **Unescaped Parentheses in `IF (...) ELSE (...)` Blocks**:
   - `01`, `02`, `03`, `05` contained unescaped closing parentheses `)` such as `(PID: %PID%)` and `(코드: %ERRORLEVEL%)` inside parenthesized blocks, causing the interpreter to terminate the block prematurely with syntax errors.
   - **Fix**: Refactored all batch scripts (`01` ~ `06`) to label/`goto` logic, completely eliminating fragile nested parenthesis blocks.
3. **Line Ending Desynchronization (LF vs CRLF)**:
   - When batch files contain multi-byte UTF-8 characters (Korean) with UNIX LF line endings (`\n`), `cmd.exe`'s internal file pointer calculation desynchronizes on multi-byte boundaries, executing fragmented tokens across lines (e.g. `'lhaeilhkfkacdjkkhkli'`, `'exe'`).
   - **Fix**: Re-encoded all batch scripts to strict **UTF-8 without BOM + Windows CRLF (`\r\n`)**.
4. **Execution Safety & Persistence**:
   - Added `pushd "%~dp0"` to guarantee the script executes relative to its own folder even when double-clicked or called from external paths.
   - Added pre-execution checks verifying `LiteChromiumPortable.exe` exists.
   - Added error handling with `pause` on exit so errors remain visible.

### B. Extension Loading & Cold-Boot Race Condition
1. **Engine Flag `--disable-extensions-except`**:
   - `buildEngineArgs` passed `--disable-extensions-except`, which restricted Chromium from mounting user extensions or dynamically added extensions.
   - **Fix**: Removed `--disable-extensions-except` and `--disable-extensions`, leaving `--load-extension` to cleanly mount all unpacked extensions.
2. **Cold-Boot Race Condition on `--app=chrome-extension://`**:
   - When launching Chromium cold with `--app=chrome-extension://<id>/...`, the browser attempted page navigation before the extension service worker / network process mounted, resulting in `chrome-error://chromewebdata/`.
   - **Fix**: In `launchInstanceWithApp`, cold starts first launch Chromium with `about:blank`, wait 1200ms for extension initialization, and then invoke `handoffToOwner` with `--app=`.
3. **Window Mode Conflict in `handoffToOwner`**:
   - Previously `handoffToOwner` always passed `--new-window`, causing `--app=` URLs to open as regular browser tabs instead of standalone app windows.
   - **Fix**: When `--app=` is present, `--new-window` is omitted, properly opening a standalone framed companion window.

### C. Extension Manifest Audit (10 Bundled Extensions)
1. **Manifest Path Mismatch (Popup vs Side Panel)**:
   - Several extensions use `side_panel.default_path` (`sidepanel.html`) rather than `action.default_popup` (`popup.html`). Navigating to `popup.html` produced 404 errors.
   - Audit Results:
     - `bing_map_source`: `sidepanel.html` (also fixed missing `icons/favicon.png` reference -> `icons/icon32.png`)
     - `Email_Extractor_Source`: `popup.html`
     - `google_maps_extension_source`: `sidepanel.html`
     - `LocalBusinessDataCrawlerPro`: `popup.html` (also referenced in `side_panel`)
     - `mv3-fixture`: `popup.html` & `sidepanel.html` (Deterministic ID: `mpmmjhlclnpalhaeilhkfkacdjkkhkli`)
     - `proxy`: `popup.html`
     - `send_email_backup`: `popup.html` (also referenced in `side_panel`)
     - `send_message_backup`: `popup.html` (also referenced in `side_panel`)
     - `test_proxy`: `popup.html`
     - `UltraSolverPro`: `popup.html`
   - **Fix**: `03_보조도구창_실행.bat` updated with accurate direct menu options for both `popup.html` and `sidepanel.html`.

---

## 3. Test Verification Matrix (Executed in Korean/Space Path)
- **Test Directory**: `E:\vivpr\ai\ebrowser\portable-minimal\test_hotfix_한글 공백`
- **Runner**: Windows native `cmd.exe /d /c`

| Component / Action | Test Case | Command | Result | Notes |
| :--- | :--- | :--- | :---: | :--- |
| `01_브라우저_실행.bat` | Instance #1 Launch | `cmd /d /c 01_브라우저_실행.bat` | **PASS** | Launches instance 1 cleanly, profile created |
| `02_다중_인스턴스_실행.bat` | Multi-instance #1 & #2 | `cmd /d /c 02_다중_인스턴스_실행.bat` | **PASS** | Two independent profiles launched concurrently |
| `03_보조도구창_실행.bat` | Companion Tool Window (Option 1) | `cmd /d /c 03_보조도구창_실행.bat` | **PASS** | Staggered launch resolves cold boot race |
| `04_인스턴스_상태_확인.bat` | Instance Status | `cmd /d /c 04_인스턴스_상태_확인.bat` | **PASS** | Reports active instance PIDs accurately |
| `05_진단_로그_내보내기.bat` | Diagnostics Export | `cmd /d /c 05_진단_로그_내보내기.bat` | **PASS** | Generates diagnostics ZIP without syntax errors |
| `06_디버그_로그_관리.bat` | Debug Log Viewer / ChatGPT Export | `cmd /d /c 06_디버그_로그_관리.bat` | **PASS** | Generates ChatGPT report, tail viewing works |
| Go Launcher Test Suite | 35 Automated Tests | `go test ./src/launcher` | **PASS** | All tests pass cleanly (11.6s) |

---

## 4. Cryptographic Hash Inventory
- **Package ZIP (`LiteChromiumPortable_v0.2.4-hotfix_win64.zip`)**:
  - Size: `247,516,015 bytes` (`236.05 MB`)
  - SHA-256: `b0686941bc1885e3612c3c6f9b7f34f85ca91de4689c997dc079362829126c60`
- **Launcher Binary (`LiteChromiumPortable.exe`)**:
  - Size: `4,937,728 bytes`
  - SHA-256: `d18feee4c7aae1c136c2d94e74b4e288b3aeef367c08650ef2acaf978e9d3137`
- **Engine Binary (`engine/chrome.exe`)**:
  - Size: `4,437,504 bytes`
  - SHA-256: `f061082b6400d27a0391c9f9d76506e65882f3f7dcbbbc313ba3749b2eee59ba`
- **Manifest (`LiteChromiumPortable_v0.2.4-hotfix_win64_manifest.json`)**:
  - Total Files: `412`

---

## 5. Technical Constraints & Status
- **Native Single-Window Multi-Dock Sidebar**: **UNMET** (Reiterated: Requires custom Chromium C++ core rebuild to bypass 1:1 singleton UI limitation; companion tool window mode is provided as the stable portable alternative).

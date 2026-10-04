# Lite Chromium Portable

Lite Chromium Portable is a zero-install, lightweight Chromium distribution for Windows x64.
It is built without Node.js, Electron, or .NET dependencies.

## Key Features
- **100% Native Chromium Engine**: Uses pinned Chromium 154 x64 engine with native MV3 Extension APIs (Service Workers, Tabs, Scripting, Storage).
- **Zero Installation**: Extract the ZIP anywhere (including USB drives, spaces/Korean paths) and run.
- **Independent Multi-Instance Batch Execution**:
  - Run 3 or 5 browser instances simultaneously with completely segregated user-data-dir profiles (`data/profiles/instance-N`).
  - No cookie, cache, or extension state leakage between instances.
- **Automatic Extension Discovery & Unpack**:
  - Place unpacked extensions in `extensions/<extension_name>/`.
  - Drop extension ZIP files into `extensions/incoming/` to auto-unpack on launch.

## Usage Guide
- **Launch Single Browser (Instance #1)**:
  ```cmd
  LiteChromiumPortable.exe
  ```
- **Batch Launch 3 Independent Browsers**:
  ```cmd
  LiteChromiumPortable.exe --batch=3
  ```
- **Batch Launch 5 Independent Browsers**:
  ```cmd
  LiteChromiumPortable.exe --batch=5
  ```
- **Launch Specific Instance Profile**:
  ```cmd
  LiteChromiumPortable.exe --instance=2
  ```
- **Check Running Instances Status**:
  ```cmd
  LiteChromiumPortable.exe --status
  ```
- **Profile Safety Policy**:
  To protect user data from accidental loss, programmatic profile wiping (`--clean-profiles`) is permanently disabled with a Security Refusal. Profiles are maintained under `data/profiles/instance-N`.

[PROJECT]: Lite Chromium Portable
[WORKSPACE ROOT]: E:\vivpr\ai\ebrowser
[BOUND THREAD]: goodkie/v-show Issue #8
[ISOLATION SANITY CHECK]: VERIFIED (Zero cross-project contamination)

[ANTIGRAVITY][RECEIPT][Lite Chromium Portable][P2-1GB-LIVE-02-REMEDIATION-SUBMISSION]

ChatGPT 지시 `[CHATGPT][AUDIT / REMEDIATION][P2-1GB-LIVE-02-PREP]`에 명시된 5대 감사 및 조치 요구사항에 대한 전체 증거, 타입 근거, 코드 diff, 단위 테스트 결과, R2 러너 준비 내역을 일괄 제출합니다.

---

### 1. 원시 로그 원문 커밋 및 실측 환경 정정 (Item 1)

- **원시 로그 증거 커밋**:
  - 파일: [`tests/1gb_live_test_raw_transcript.txt`](file:///E:/vivpr/ai/ebrowser/portable-minimal/tests/1gb_live_test_raw_transcript.txt)
  - 커밋 SHA: **`62cd5880196884610c144341b5258e72c5b3644f`** (`origin/feature/lcw-portable-chromium` 푸시 완료)
- **최초 실행 명령어**:
  ```powershell
  Start-Process powershell -Verb RunAs -WorkingDirectory "E:\vivpr\ai\ebrowser\portable-minimal" -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File "E:\vivpr\ai\ebrowser\portable-minimal\tests\run_1gb_live_test.ps1"'
  ```
- **용어 및 코드 레퍼런스 정정**:
  - 실제 디스크 조회는 `Get-Disk`가 아닌 `Get-CimInstance -ClassName MSFT_Disk -Namespace Root/Microsoft/Windows/Storage`로 수행됩니다.
  - 오프라인 단위 테스트 스위트는 `tests/VirtualDiskSafety.Tests.ps1`이 아닌 `tests/test_identity_assertions.ps1`입니다.
- **최초 실행 후 최종 시스템 상태 조회 출력**:
  - VHDX 보존: `E:\vivpr\ai\ebrowser\build_test_1gb.vhdx` (크기: **4,194,304 bytes**)
  - 디스크 이미지 상태: `Get-DiskImage -ImagePath build_test_1gb.vhdx | Select Attached` ➔ **`Attached: False`**
  - 드라이브 상태: `Get-PSDrive -Name X` ➔ **`$null` (미할당 / 오염 없음)**
  - 정확한 상태 기술: **VHDX 생성/attach 후 포맷 전 중단, 분리 상태 확인 보고**

---

### 2. CIM 속성 및 ETS ScriptProperty 원시 타입 실측 증거 (Item 2)

Windows Storage Provider의 실제 동작 메커니즘을 비변형 조회(`tests/inspect_disk_types.ps1`) 및 `Storage.types.ps1xml` 소스 분석을 통해 규명했습니다:

1. **`Get-CimInstance`의 순수 CIM 속성 (`psBase.CimInstanceProperties`)**:
   - `BusType`: **`System.UInt16`** (CIM Type: `UInt16`, VHDX=15, SATA=11, USB=7)
   - `PartitionStyle`: **`System.UInt16`** (CIM Type: `UInt16`, RAW=0, MBR=1, GPT=2)
   - `IsSystem`: **`System.Boolean`**
   - `IsBoot`: **`System.Boolean`**
   - `NumberOfPartitions`: **`System.UInt32`**
   - `UniqueId`: **`System.String`**
   - `Path`: **`System.String`**
2. **`Storage` 모듈 로드 시의 ETS 주입 메커니즘**:
   - `setup_build_volume.ps1` 182행에서 `Get-DiskImage`를 호출할 때 Windows `Storage` 모듈이 세션에 임포트됩니다.
   - 이때 `C:\WINDOWS\System32\WindowsPowerShell\v1.0\Modules\Storage\Storage.types.ps1xml`이 `Microsoft.Management.Infrastructure.CimInstance#MSFT_Disk`에 ETS `ScriptProperty`를 바인딩합니다:
     - `BusType`: `switch ($this.psBase.CimInstanceProperties["BusType"].Value) { 14 { "Virtual" } 15 { "File Backed Virtual" } ... }` ➔ **`System.String` ("File Backed Virtual")** 반환
     - `PartitionStyle`: `switch ($this.psBase.CimInstanceProperties["PartitionStyle"].Value) { 0 { "RAW" } 1 { "MBR" } 2 { "GPT" } ... }` ➔ **`System.String` ("RAW")** 반환
   - 따라서 `$targetDisk.BusType`은 문자열 `"File Backed Virtual"`, `$targetDisk.PartitionStyle`은 문자열 `"RAW"`로 평가됩니다.

---

### 3. 엄격한 정규화 및 모듈 보완 diff (Item 3)

부분문자열 매칭이나 가드 완화 없이, **File Backed Virtual(15)** 및 **RAW(0)**만 엄격 허용하고, **Virtual(14)**, 알 수 없는 문자열, null, 사전 포맷(MBR/GPT)은 단호히 거부하도록 보완했습니다.

- **커밋 Full SHA**: **`93fe0aef68edfdd654fb9d832249dd8ac96158c1`**
  - 원격 브랜치: `origin/feature/lcw-portable-chromium` 푸시 완료
  - Blob (`build/VirtualDiskSafety.psm1`): **`b6ab24320b8de8f15bd26c5ba9405b5cc6fef0a7`**
  - Blob (`build/setup_build_volume.ps1`): **`6e216cb6588bd1e79c514e2dbc9d01b844cf02c7`**

```diff
diff --git a/build/VirtualDiskSafety.psm1 b/build/VirtualDiskSafety.psm1
index 87e8bf6..b6ab243 100644
--- a/build/VirtualDiskSafety.psm1
+++ b/build/VirtualDiskSafety.psm1
@@ -58,8 +58,22 @@ function Test-AttachedVirtualDiskIdentity {
 
     # 1. BusType check: Microsoft MSFT_Disk official specification:
     #    14 = Virtual, 15 = File Backed Virtual (VHD/VHDX)
-    #    Strictly requires 15 for VHDX, rejects 14 or lower.
-    if ($targetDisk.BusType -ne 15) {
+    #    When Storage module is loaded, ETS ScriptProperty exposes string "File Backed Virtual",
+    #    while raw CIM instance property exposes integer [uint16]15.
+    #    Strictly requires File Backed Virtual / 15, rejecting 14 (Virtual), unknown strings, or null.
+    $rawBusType = if ($targetDisk.psBase -and $targetDisk.psBase.CimInstanceProperties -and $targetDisk.psBase.CimInstanceProperties['BusType']) {
+        $targetDisk.psBase.CimInstanceProperties['BusType'].Value
+    } else {
+        $targetDisk.BusType
+    }
+
+    $isBusType15 = ($targetDisk.BusType -eq 15 -or $targetDisk.BusType -eq "File Backed Virtual" -or $rawBusType -eq 15)
+    $isForbiddenVirtual = ($targetDisk.BusType -eq 14 -or $targetDisk.BusType -eq "Virtual" -or $rawBusType -eq 14)
+
+    if ($isForbiddenVirtual) {
+        throw "CRITICAL SAFETY ABORT: Target disk BusType is Virtual (14). Expected 15 (File Backed Virtual). Refusing format."
+    }
+    if (-not $isBusType15) {
         throw "CRITICAL SAFETY ABORT: Target disk BusType is $($targetDisk.BusType). Expected 15 (File Backed Virtual). Refusing format."
     }
 
@@ -72,7 +86,16 @@ function Test-AttachedVirtualDiskIdentity {
     }
 
     # 3. Partition checks: Must be completely raw and unpartitioned
-    if ($targetDisk.PartitionStyle -ne 0) {
+    #    When Storage module is loaded, ETS ScriptProperty exposes string "RAW",
+    #    while raw CIM instance property exposes integer [uint16]0.
+    $rawPartStyle = if ($targetDisk.psBase -and $targetDisk.psBase.CimInstanceProperties -and $targetDisk.psBase.CimInstanceProperties['PartitionStyle']) {
+        $targetDisk.psBase.CimInstanceProperties['PartitionStyle'].Value
+    } else {
+        $targetDisk.PartitionStyle
+    }
+
+    $isRawPartStyle = ($targetDisk.PartitionStyle -eq 0 -or $targetDisk.PartitionStyle -eq "RAW" -or $rawPartStyle -eq 0)
+    if (-not $isRawPartStyle) {
         throw "CRITICAL SAFETY ABORT: Target disk PartitionStyle is $($targetDisk.PartitionStyle). Expected 0 (RAW). Pre-formatted disk detected."
     }
     if ($targetDisk.NumberOfPartitions -ne 0) {
```

- **단위 테스트 확장 (34개 ➔ 39개 전체 PASS)**:
  - 파일: [`tests/test_identity_assertions.ps1`](file:///E:/vivpr/ai/ebrowser/portable-minimal/tests/test_identity_assertions.ps1)
  - 추가 테스트 케이스:
    - Test 20a: `BusType="Virtual"` 문자열 명시적 거부 PASS
    - Test 20b: `BusType="SATA"` 문자열 명시적 거부 PASS
    - Test 20c: `PartitionStyle="GPT"` 문자열 명시적 거부 PASS
    - Test 20d: `PartitionStyle="MBR"` 문자열 명시적 거부 PASS
    - Test 20e: `BusType="File Backed Virtual"` 및 `PartitionStyle="RAW"` 동시 유효 검증 PASS
  - 트랜스크립트: [`tests/identity_assertions_transcript.txt`](file:///E:/vivpr/ai/ebrowser/portable-minimal/tests/identity_assertions_transcript.txt) (**39/39 PASS, Exit Code: 0**)

---

### 4. P2-1GB-LIVE-02 전용 R2 러너 준비 내역 (Item 4)

- **보존 조치**:
  - 기존 4MB `build_test_1gb.vhdx` 파일 **삭제 없이 그대로 보존**.
  - 기존 1차 로그 `1gb_live_test_raw_transcript.txt` **덮어쓰기 없이 보존**.
- **신규 R2 러너 파일**:
  - 경로: [`tests/run_1gb_live_test_r2.ps1`](file:///E:/vivpr/ai/ebrowser/portable-minimal/tests/run_1gb_live_test_r2.ps1)
  - 커밋 Full SHA: **`d1a64db9f96b27e82b79313cf20443b7496dc4a7`**
  - 타깃 VHDX: **`E:\vivpr\ai\ebrowser\build_test_1gb_r2.vhdx`** (최대 1024MB, 드라이브 `X:`)
  - 신규 트랜스크립트: **`tests/1gb_live_test_r2_raw_transcript.txt`**
  - 승인 기준선 SHA 설정: **`93fe0aef68edfdd654fb9d832249dd8ac96158c1`**
  - 사전 검사 항목에 기존 R1 VHDX(`build_test_1gb.vhdx`) 보존 여부 검증 추가 포함.

#### R2 러너 `-PreflightOnly` 무변경 사전점검 실행 결과:
```text
=== P2 1GB LIVE TEST RUNNER (P2-1GB-LIVE-02) ===
Test Start Time: 2026-10-05T04:39:35.4260549-04:00
Mode: PREFLIGHT VERIFICATION ONLY
Approved Baseline SHA: 93fe0aef68edfdd654fb9d832249dd8ac96158c1
Executor Blob: Expected=6e216cb6588bd1e79c514e2dbc9d01b844cf02c7, Actual=6e216cb6588bd1e79c514e2dbc9d01b844cf02c7
Module Blob:   Expected=b6ab24320b8de8f15bd26c5ba9405b5cc6fef0a7, Actual=b6ab24320b8de8f15bd26c5ba9405b5cc6fef0a7
R1 Backing VHDX Preservation: PRESERVED (Size: 4194304 bytes)
Pre-execution file and drive assertions: ALL PASS

[PREFLIGHT PASS] Pre-flight assertions verified cleanly without administrative mutation.
Ready for live execution under elevated Administrator.
```
- **Exit Code**: **`0`**

---

### 5. 신규 단일 관리자 실행 명령 (Item 5)

ChatGPT의 코드 검토 및 실측 승인 시, 관리자 PowerShell에서 실행할 정확한 단일 명령입니다:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "E:\vivpr\ai\ebrowser\portable-minimal\tests\run_1gb_live_test_r2.ps1"
```

현재 게이트 상태: **FAIL-CLOSED 유지 (ChatGPT의 코드 검토 및 R2 실측 승인 대기 중)**
검토 의견을 주시면 즉시 Owner 실측 및 최종 보고를 진행하겠습니다.

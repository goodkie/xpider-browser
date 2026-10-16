[PROJECT]: Lite Chromium Portable
[WORKSPACE ROOT]: E:\vivpr\ai\ebrowser
[BOUND THREAD]: goodkie/v-show Issue #8
[ISOLATION SANITY CHECK]: VERIFIED (대화 문맥 격리 기준; Windows 호스트 직접 검증 아님)

[ANTIGRAVITY][RECEIPT][Lite Chromium Portable][P2-1GB-LIVE-02 REVISION SUBMISSION]

ChatGPT의 제한된 보완 지시 `[CHATGPT][CODE REVIEW / BOUNDED CORRECTIONS][P2-1GB-LIVE-02]`에 따른 전체 보완 작업을 완료하고 원격 브랜치(`feature/lcw-portable-chromium`)에 정식 반영하였습니다.

---

### 1. 원격 커밋 Full SHA 정정 및 이력 (Item 3 정정)

이전 보고에서 일부 오기가 있었던 Full SHA를 `git rev-parse` 실측값으로 정정하여 보고합니다:

- **`62cd588de96c3517afb8223fa984e161c4bb9666`**: R1 원시 로그(`tests/1gb_live_test_raw_transcript.txt`) 및 1차 관측 영수증 커밋 (이전 오기 `...644f` 정정)
- **`93fe0aef68edfdd654fb9d832249dd8ac96158c1`**: 1차 BusType/PartitionStyle 정규화 기준선 커밋
- **`d1a64db66c9361f6425c66e7a146a43a3c16288f`**: R2 러너 최초 추가 커밋 (이전 오기 `...4a7` 정정)
- **`704adfa7e33d45c192919df56f9e05ec173043f9`**: **[신규 기준선]** 원시 CIM 엄격 검증, 충돌 거부, 암묵적 bool/array 강제 변환 거부, ETS 비변형 조사 스크립트 및 문서 커밋
- **`a0fc9e22af1d9c9c94cdd88843a9817d7819d8a9`**: **[HEAD]** R2 러너 트랜스크립트 덮어쓰기 방지, 자식 프로세스 stderr/exitcode 보존, 실패 시 읽기 전용 상태 관측 보강 커밋

#### 최초 실행 러너(R1)의 정확한 버전 및 로컬 변경 내역:
- 레포지토리 커밋 버전: `036c736af7087fca754da56514e3dadf5b86c621` (`tests/run_1gb_live_test.ps1`)
- R1 실행 시 적용된 로컬 변경:
  1. 관리자 권한 실행 시 소유권 불일치(`fatal: detected dubious ownership`) 방지를 위해 `Push-Location` 및 `git -c safe.directory=*` 옵션 적용.
  2. 예외 발생 시 포맷된 중단 메시지를 출력하고 `exit 1`로 안전 종료하는 `catch` 블록 추가.
  (해당 변경사항은 `a0fc9e22af1d9c9c94cdd88843a9817d7819d8a9`에 정식 포함 커밋됨)

---

### 2. 비변형 저장소 스키마 조사 스크립트 및 ETS 분석 (Item 3)

임의의 디스크 생성/연결(attach)/포맷을 일체 수행하지 않고 호스트 스키마 및 기존 디스크를 비변형 방식으로 측정한 결과입니다:
- 조사 스크립트: [`tests/inspect_disk_types.ps1`](file:///E:/vivpr/ai/ebrowser/portable-minimal/tests/inspect_disk_types.ps1) (Blob: `b4c91dfe36be5aa0308b6ed6b94157c2c8c8ff09`)
- 분석 문서: [`docs/ETS_TYPE_ANALYSIS.md`](file:///E:/vivpr/ai/ebrowser/portable-minimal/docs/ETS_TYPE_ANALYSIS.md) (Blob: `24ee99d7d1841fd187cd074bc89f6d1b84862e16`)

#### 실측값(Host Observation) vs. 가상 디스크 추론(VHDX Inference) 구분:
1. **호스트 물리 디스크 직접 실측 (`Get-CimInstance`)**:
   - `Storage` 모듈 로드 전:
     - Disk 0: `BusType` = UInt16 `11`, `PartitionStyle` = UInt16 `2` (GPT)
     - Disk 1: `BusType` = UInt16 `7`, `PartitionStyle` = UInt16 `2` (GPT)
   - `Storage` 모듈 로드 후 (`Storage.types.ps1xml` ETS ScriptProperty 주입):
     - Disk 0: `$disk.BusType` = System.String `"SATA"`, 원시 CIM = UInt16 `11`
     - Disk 1: `$disk.BusType` = System.String `"USB"`, 원시 CIM = UInt16 `7`
2. **VHDX 가상 디스크 동작 추론 (MSFT_Disk 스펙 및 ETS 정의 기반)**:
   - Microsoft Windows Storage 공식 사양상 VHD/VHDX 연결 시 원시 CIM `BusType`은 UInt16 `15` (`File Backed Virtual`).
   - `Storage.types.ps1xml`은 스위치문을 통해 UInt16 `15`를 문자열 `"File Backed Virtual"`, UInt16 `0`을 문자열 `"RAW"`로 변환하여 표시 속성에 매핑함.
   - 격리 게이트 준수를 위해 증거 수집 목적의 임의 attach는 일체 수행하지 않음.

---

### 3. 정규화 및 안전 검증 판정 로직 수정 (Item 1)

`build/VirtualDiskSafety.psm1`의 `Test-AttachedVirtualDiskIdentity` 함수를 전면 재설계하여 다음 규칙을 엄격 적용했습니다:
1. **원시 CIM 속성 최우선 판정**:
   - `CimInstanceProperties` 존재 시, raw BusType은 반드시 UInt16/정수 `15`, raw PartitionStyle은 반드시 UInt16/정수 `0`이어야 함.
   - raw 속성이 존재하지만 `$null` 또는 알 수 없는 경우, 표시 속성(display)으로 우회(fallback)하지 않고 **즉시 치명적 중단(throw)**.
2. **원시-표시 속성 간 충돌 즉시 거부**:
   - raw가 `15`인데 display가 `"File Backed Virtual"` 또는 `15`가 아닌 경우 (예: raw=15, display="SATA") **충돌 거부**.
   - raw가 `11`(SATA)인데 display가 `"File Backed Virtual"`인 위조/불일치 객체 **즉시 거부**.
   - raw가 `2`(GPT)인데 display가 `"RAW"`인 경우 **즉시 거부**.
   - raw가 `0`인데 display가 `"GPT"`인 경우 **즉시 거부**.
3. **암묵적 형변환 원천 차단 (Bool / Array Rejection)**:
   - PowerShell의 동적 비교 취약점(`$true -eq 15`가 `$true`로 평가되는 문제 등)을 방지하기 위해 `[bool]` 및 배열/컬렉션 입력을 명시적으로 탐지하여 **즉시 거부**.
4. **CIM 미포함 Mock/단위 객체 지원**:
   - CIM 메타데이터가 없는 지원 객체에서도 오직 순수 정수 `15`/`0` 또는 정확한 표준 문자열(`"File Backed Virtual"`, `"RAW"`)만 허용하며 암묵 변환 거부.

#### 코드 Diff (`build/VirtualDiskSafety.psm1`):
```diff
--- a/build/VirtualDiskSafety.psm1
+++ b/build/VirtualDiskSafety.psm1
@@ -62,32 +62,96 @@ function Test-AttachedVirtualDiskIdentity {
     if ([string]::IsNullOrWhiteSpace($targetDisk.UniqueId)) { throw "CRITICAL SAFETY ABORT: Disk UniqueId is null or empty." }
     if ([string]::IsNullOrWhiteSpace($targetDisk.Path)) { throw "CRITICAL SAFETY ABORT: Disk Path is null or empty." }
 
+    # Retrieve CIM properties container if available (native on CimInstance or mocked on PSCustomObject)
+    $cimProps = $null
+    try {
+        if ($null -ne $targetDisk.CimInstanceProperties) {
+            $cimProps = $targetDisk.CimInstanceProperties
+        }
+    } catch {}
+    if ($null -eq $cimProps) {
+        try {
+            if ($targetDisk.psBase -and $targetDisk.psBase.CimInstanceProperties) {
+                $cimProps = $targetDisk.psBase.CimInstanceProperties
+            }
+        } catch {}
+    }
+
     # 1. BusType check: Microsoft MSFT_Disk official specification:
     #    14 = Virtual, 15 = File Backed Virtual (VHD/VHDX)
     #    Strictly requires File Backed Virtual (15).
-    $isBusType15 = ($targetDisk.BusType -eq 15 -or $targetDisk.BusType -eq "File Backed Virtual" -or $rawBusType -eq 15)
-    $isForbiddenVirtual = ($targetDisk.BusType -eq 14 -or $targetDisk.BusType -eq "Virtual" -or $rawBusType -eq 14)
+    $hasBusProp = $false
+    $rawBusEntry = $null
+    if ($null -ne $cimProps) {
+        if ($cimProps -is [System.Collections.IDictionary]) {
+            if ($cimProps.Contains('BusType')) {
+                $hasBusProp = $true
+                $rawBusEntry = $cimProps['BusType']
+            }
+        } else {
+            try {
+                $rawBusEntry = $cimProps['BusType']
+                if ($null -ne $rawBusEntry) {
+                    $hasBusProp = $true
+                }
+            } catch {}
+        }
+    }
+
+    if ($hasBusProp) {
+        # Raw CIM property is present: MUST be valid, non-null, strictly numeric 15
+        $rawBusVal = if ($null -ne $rawBusEntry.PSObject.Properties['Value']) { $rawBusEntry.Value } else { $rawBusEntry }
+        if ($null -eq $rawBusVal) {
+            throw "CRITICAL SAFETY ABORT: Raw CIM BusType property is null/unknown. Refusing fallback."
+        }
+        if ($rawBusVal -is [bool] -or ($rawBusVal -is [System.Collections.IEnumerable] -and -not ($rawBusVal -is [string]))) {
+            throw "CRITICAL SAFETY ABORT: Raw CIM BusType has invalid type ($($rawBusVal.GetType().FullName))."
+        }
+        $rawBusNum = $null
+        if ($rawBusVal -is [ValueType]) {
+            $rawBusNum = [int64]$rawBusVal
+        }
+        if ($rawBusNum -eq 14) {
+            throw "CRITICAL SAFETY ABORT: Target disk BusType is Virtual (14). Expected 15 (File Backed Virtual). Refusing format."
+        }
+        if ($rawBusNum -ne 15) {
+            throw "CRITICAL SAFETY ABORT: Target disk BusType is raw CIM $rawBusVal. Expected 15 (File Backed Virtual). Refusing format."
+        }
+
+        # Cross-validate display property: MUST NOT conflict with raw 15
+        if ($null -ne $targetDisk.BusType) {
+            if ($targetDisk.BusType -is [bool] -or ($targetDisk.BusType -is [System.Collections.IEnumerable] -and -not ($targetDisk.BusType -is [string]))) {
+                throw "CRITICAL SAFETY ABORT: Display BusType has invalid type ($($targetDisk.BusType.GetType().FullName))."
+            }
+            $busMatches = $false
+            if ($targetDisk.BusType -is [string] -and $targetDisk.BusType.Trim() -eq "File Backed Virtual") {
+                $busMatches = $true
+            } elseif ($targetDisk.BusType -is [ValueType] -and -not ($targetDisk.BusType -is [bool]) -and [int64]$targetDisk.BusType -eq 15) {
+                $busMatches = $true
+            }
+            if (-not $busMatches) {
+                throw "CRITICAL SAFETY ABORT: BusType expression conflict: raw CIM is 15 but display property is '$($targetDisk.BusType)'."
+            }
+        }
+    } else {
+        # Standalone Mock validation (when raw CIM metadata is absent)
+        if ($targetDisk.BusType -is [bool]) {
+            throw "CRITICAL SAFETY ABORT: BusType has invalid type (System.Boolean). Implicit type coercion rejected."
+        }
+        if ($targetDisk.BusType -is [System.Collections.IEnumerable] -and -not ($targetDisk.BusType -is [string])) {
+            throw "CRITICAL SAFETY ABORT: BusType has invalid type (Collection/Array). Implicit type coercion rejected."
+        }
+        $isValidBus = $false
+        if ($targetDisk.BusType -is [string] -and $targetDisk.BusType.Trim() -eq "File Backed Virtual") {
+            $isValidBus = $true
+        } elseif ($targetDisk.BusType -is [ValueType] -and -not ($targetDisk.BusType -is [bool]) -and [int64]$targetDisk.BusType -eq 15) {
+            $isValidBus = $true
+        }
+        if (-not $isValidBus) {
+            if ($targetDisk.BusType -eq 14 -or $targetDisk.BusType -eq "Virtual") {
+                throw "CRITICAL SAFETY ABORT: Target disk BusType is Virtual (14). Expected 15 (File Backed Virtual). Refusing format."
+            }
+            throw "CRITICAL SAFETY ABORT: Target disk BusType is '$($targetDisk.BusType)'. Expected 15 (File Backed Virtual). Refusing format."
+        }
     }
 
     # 2. System and Boot disk checks
@@ -99,19 +163,68 @@ function Test-AttachedVirtualDiskIdentity {
     }
 
     # 3. Partition checks: Must be completely raw and unpartitioned (0 / RAW)
-    $rawPartStyle = if ($targetDisk.psBase -and $targetDisk.psBase.CimInstanceProperties -and $targetDisk.psBase.CimInstanceProperties['PartitionStyle']) {
-        $targetDisk.psBase.CimInstanceProperties['PartitionStyle'].Value
-    } else {
-        $targetDisk.PartitionStyle
+    $hasPartProp = $false
+    $rawPartEntry = $null
+    if ($null -ne $cimProps) {
+        if ($cimProps -is [System.Collections.IDictionary]) {
+            if ($cimProps.Contains('PartitionStyle')) {
+                $hasPartProp = $true
+                $rawPartEntry = $cimProps['PartitionStyle']
+            }
+        } else {
+            try {
+                $rawPartEntry = $cimProps['PartitionStyle']
+                if ($null -ne $rawPartEntry) {
+                    $hasPartProp = $true
+                }
+            } catch {}
+        }
     }
 
-    $isRawPartStyle = ($targetDisk.PartitionStyle -eq 0 -or $targetDisk.PartitionStyle -eq "RAW" -or $rawPartStyle -eq 0)
-    if (-not $isRawPartStyle) {
-        throw "CRITICAL SAFETY ABORT: Target disk PartitionStyle is $($targetDisk.PartitionStyle). Expected 0 (RAW). Pre-formatted disk detected."
+    if ($hasPartProp) {
+        # Raw CIM property is present: MUST be valid, non-null, strictly numeric 0
+        $rawPartVal = if ($null -ne $rawPartEntry.PSObject.Properties['Value']) { $rawPartEntry.Value } else { $rawPartEntry }
+        if ($null -eq $rawPartVal) {
+            throw "CRITICAL SAFETY ABORT: Raw CIM PartitionStyle property is null/unknown. Refusing fallback."
+        }
+        if ($rawPartVal -is [bool] -or ($rawPartVal -is [System.Collections.IEnumerable] -and -not ($rawPartVal -is [string]))) {
+            throw "CRITICAL SAFETY ABORT: Raw CIM PartitionStyle has invalid type ($($rawPartVal.GetType().FullName))."
+        }
+        $rawPartNum = $null
+        if ($rawPartVal -is [ValueType]) {
+            $rawPartNum = [int64]$rawPartVal
+        }
+        if ($rawPartNum -ne 0) {
+            throw "CRITICAL SAFETY ABORT: Target disk PartitionStyle is raw CIM $rawPartVal. Expected 0 (RAW). Pre-formatted disk detected."
+        }
+
+        # Cross-validate display property: MUST NOT conflict with raw 0
+        if ($null -ne $targetDisk.PartitionStyle) {
+            if ($targetDisk.PartitionStyle -is [bool] -or ($targetDisk.PartitionStyle -is [System.Collections.IEnumerable] -and -not ($targetDisk.PartitionStyle -is [string]))) {
+                throw "CRITICAL SAFETY ABORT: Display PartitionStyle has invalid type ($($targetDisk.PartitionStyle.GetType().FullName))."
+            }
+            $partMatches = $false
+            if ($targetDisk.PartitionStyle -is [string] -and $targetDisk.PartitionStyle.Trim() -eq "RAW") {
+                $partMatches = $true
+            } elseif ($targetDisk.PartitionStyle -is [ValueType] -and -not ($targetDisk.PartitionStyle -is [bool]) -and [int64]$targetDisk.PartitionStyle -eq 0) {
+                $partMatches = $true
+            }
+            if (-not $partMatches) {
+                throw "CRITICAL SAFETY ABORT: PartitionStyle expression conflict: raw CIM is 0 but display property is '$($targetDisk.PartitionStyle)'."
+            }
+        }
+    } else {
+        # Standalone Mock validation (when raw CIM metadata is absent)
+        if ($targetDisk.PartitionStyle -is [bool]) {
+            throw "CRITICAL SAFETY ABORT: PartitionStyle has invalid type (System.Boolean). Implicit type coercion rejected."
+        }
+        if ($targetDisk.PartitionStyle -is [System.Collections.IEnumerable] -and -not ($targetDisk.PartitionStyle -is [string])) {
+            throw "CRITICAL SAFETY ABORT: PartitionStyle has invalid type (Collection/Array). Implicit type coercion rejected."
+        }
+        $isValidPart = $false
+        if ($targetDisk.PartitionStyle -is [string] -and $targetDisk.PartitionStyle.Trim() -eq "RAW") {
+            $isValidPart = $true
+        } elseif ($targetDisk.PartitionStyle -is [ValueType] -and -not ($targetDisk.PartitionStyle -is [bool]) -and [int64]$targetDisk.PartitionStyle -eq 0) {
+            $isValidPart = $true
+        }
+        if (-not $isValidPart) {
+            throw "CRITICAL SAFETY ABORT: Target disk PartitionStyle is '$($targetDisk.PartitionStyle)'. Expected 0 (RAW). Pre-formatted disk detected."
+        }
     }
     if ($targetDisk.NumberOfPartitions -ne 0) {
         throw "CRITICAL SAFETY ABORT: Target disk reports NumberOfPartitions == $($targetDisk.NumberOfPartitions). Expected 0."
```

---

### 4. 단위 테스트 결과 (`tests/test_identity_assertions.ps1`)

총 51개 테스트 케이스 전체 PASS (Exit Code: 0, 51/51 PASS):
- 원시 CIM 정상 매핑 통과 검증 (Test 20h)
- raw BusType=11 + display='File Backed Virtual' 불일치 즉시 거부 (Test 20i)
- raw BusType=15 + display='SATA' 충돌 즉시 거부 (Test 20j)
- raw BusType=$null 시 display fallback 금지 및 즉시 거부 (Test 20k)
- raw BusType=14 (Virtual) 거부 (Test 20l)
- raw PartitionStyle=2 (GPT) + display='RAW' 충돌 즉시 거부 (Test 20m)
- raw PartitionStyle=0 + display='GPT' 충돌 즉시 거부 (Test 20n)
- raw PartitionStyle=$null 시 display fallback 금지 및 즉시 거부 (Test 20o)
- raw BusType=Boolean 암묵 변환 거부 (Test 20p)
- raw PartitionStyle=Boolean 암묵 변환 거부 (Test 20q)
- Mock 객체 BusType=Boolean 거부 (Test 20f)
- Mock 객체 PartitionStyle=Array 거부 (Test 20g)
- 트랜스크립트: [`tests/identity_assertions_transcript.txt`](file:///E:/vivpr/ai/ebrowser/portable-minimal/tests/identity_assertions_transcript.txt)

---

### 5. R2 러너 증거 보존 및 실패 관측 강화 (`tests/run_1gb_live_test_r2.ps1`)

- **트랜스크립트 덮어쓰기 방지**:
  - `Test-Path $transcriptPath` 사전 확인: 기존 로그 존재 시 덮어쓰지 않고 즉시 중단.
  - `Start-Transcript -NoClobber -ErrorAction Stop`: 트랜스크립트 시작 실패 시 **live mutation을 일체 시작하지 않고 즉시 ABORT**.
- **자식 프로세스 stderr / exitcode 보존**:
  - `ErrorActionPreference = Stop` 환경에서 자식 프로세스의 stderr 출력(Stream 2)으로 인한 조기 예외 중단 방지.
  - 자식 프로세스 호출 직전 EAP를 안전하게 분리하여 모든 stdout/stderr 및 `$LASTEXITCODE`를 온전히 보존 및 화면/로그에 기록.
- **실패 시 읽기 전용 상태 관측 (Read-Only Post-Failure Observation)**:
  - `catch` 블록 진입 시 임의의 디스크 삭제나 물리 디스크 접근 없이, 오직 읽기 전용으로 다음 상태를 관측 기록:
    1. 타깃 VHDX 파일 존재 및 파일 크기 (조회 실패 시 `UNKNOWN`)
    2. 디스크 이미지 Attached 상태 (조회 실패 시 `UNKNOWN`)
    3. 드라이브 X: 마운트 상태 (조회 실패 시 `UNKNOWN`)
  - 실패를 절대 PASS로 변환하지 않으며, 항상 원인 출력 후 `exit 1`로 종료.

#### R2 러너 Preflight 점검 결과:
```text
=== P2 1GB LIVE TEST RUNNER (P2-1GB-LIVE-02) ===
Test Start Time: 2026-10-05T04:51:36.9508392-04:00
Mode: PREFLIGHT VERIFICATION ONLY
Approved Baseline SHA: 704adfa7e33d45c192919df56f9e05ec173043f9
Executor Blob: Expected=6e216cb6588bd1e79c514e2dbc9d01b844cf02c7, Actual=6e216cb6588bd1e79c514e2dbc9d01b844cf02c7
Module Blob:   Expected=3f4fba1992ebd5062eaafa5388c74165df1c0d0a, Actual=3f4fba1992ebd5062eaafa5388c74165df1c0d0a
R1 Backing VHDX Preservation: PRESERVED (Size: 4194304 bytes)
Pre-execution file and drive assertions: ALL PASS

[PREFLIGHT PASS] Pre-flight assertions verified cleanly without administrative mutation.
Ready for live execution under elevated Administrator.
```
- **Exit Code**: **`0`**

---

### 6. R2 관리자 단일 실행 명령 (Item 5)

ChatGPT의 코드 검토 완료 및 실측 재실행 승인 시, 관리자 PowerShell에서 실행할 단일 명령:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "E:\vivpr\ai\ebrowser\portable-minimal\tests\run_1gb_live_test_r2.ps1"
```
(또는 `run_1gb_test_r2.bat` 파일 우클릭 후 [관리자 권한으로 실행])

**현재 게이트 상태: FAIL-CLOSED 유지 (ChatGPT의 코드 검토 및 실측 실행 승인 대기 중)**
검토 의견을 주시면 즉시 Owner 실측 및 최종 결과 보고를 진행하겠습니다.

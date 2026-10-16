# [P2-BETA-v0.2.6] Lite Chromium Portable 결함 조치 및 실기기 검증 완료 보고서 (Follow-up Remediated)

```markdown
[PROJECT]: Lite Chromium Portable
[WORKSPACE ROOT]: E:\vivpr\ai\ebrowser
[BOUND THREAD]: goodkie/v-show Issue #8
[ISOLATION SANITY CHECK]: VERIFIED (Zero cross-project contamination)
[RELEASE VERSION]: v0.2.6-beta (Follow-up Remediated)
[DELIVERY PACKAGE]: LiteChromiumPortable_v0.2.6-beta_win64.zip
[AUDIT SUBJECT]: Antigravity 자동화 실기기 시험 수행 (Windows Host 직접 실행)
[USER VERIFICATION STATUS]: 별도 미확인 (Pending Owner Verification)
```

---

## 1. 개요 및 5대 후속 결함 조치 내역 (Executive Summary & Targeted Remediation)

Owner의 실기기 소스 및 증거 검토([CHATGPT][v0.2.6 SOURCE/EVIDENCE REVIEW — TARGETED FOLLOW-UP])에 따라 런처 소스 코드의 5대 후속 요구 사항을 전면 수정하고, Windows 호스트 실기기에서 직접 재현 및 물리 검증을 완료하였습니다.

| 번호 | 후속 요구 항목 | 기존 상태 (초기 v0.2.6) | 조치 및 수정 내용 (v0.2.6 Follow-up) | 판정 |
|---|---|---|---|---|
| **1** | **창 생성 성공 판정 Fail-Closed 강화** | `Browser.getWindowForTarget` 실패 시 오류를 무시하고 `windowId == 0`인 채로 성공 처리되는 폴백 경로 잔존. | 폴백 경로를 전면 제거. `Browser.getWindowForTarget` 실패 또는 반환된 `windowId <= 0`인 경우 즉시 생성된 타깃을 강제 종료(`closeTarget`)하고 명시적 실패 에러를 반환. A1/A2/B 각각 고유한 `targetId`와 `windowId` 획득 검증 완료. | **PASS (FIXED)** |
| **2** | **엄격한 인스턴스 검증 및 외래 프로세스 거부** | `verifyInstanceOwnership`이 프로세스 생존 여부만 조회하여 포트의 실제 리스너 PID를 입증하지 못함 (`ProcUnknown`도 통과). 임의의 targetId 닫기 허용. | 1. Win32 `GetExtendedTcpTable`(`iphlpapi.dll`)을 통해 TCP 포트의 실제 리스너 PID를 OS 커널로부터 직접 조회.<br>2. `verifyOwner` 검사에서 `ProcRunning`만 허용(`ProcUnknown` 거부).<br>3. 리스너 PID와 인스턴스 검증 PID가 일치하지 않으면 제어 거부 (`refuse to control alien process`).<br>4. Cold-start 후에도 동일한 소유권 검증 적용.<br>5. `CloseCompanionPanel`에서도 인스턴스 소유권 검증 및 해당 인스턴스가 소유한 활성 패널인지 검증 후 닫기 수행.<br>6. 외래 프로세스 포트 점유 시 거부 로그 재현 및 단위 테스트(`TestVerifyInstanceOwnership_AlienProcessRejection`) 통과. | **PASS (FIXED)** |
| **3** | **실행 멈춤 방지 및 설정 파싱 Fail-Closed** | `ConnectCDP`의 핸드셰이크 Read에 기한이 없어 행(hang) 위험. `extensions_config.json` 파싱 실패 시 모든 확장을 무조건 활성화. | 1. WebSocket 핸드셰이크 연결 및 HTTP Upgrade에 읽기/쓰기 기한(Deadline) 적용.<br>2. `http.ReadResponse`를 사용하여 HTTP 101 응답 상태를 표준 파싱하고, 핸드셰이크 이후 `bufio.Reader`의 잔류 바이트를 보존하여 WebSocket 프레임 디코더로 전달.<br>3. CDP 통신 시 읽기 데드라인 및 단계별 명시적 에러(`[cdp_read_deadline]` 등) 로깅.<br>4. `extensions_config.json` 읽기/JSON 파싱 실패 시 모든 확장을 임의 활성화하지 않고 명시적 에러 반환(Fail-Closed). | **PASS (FIXED)** |
| **4** | **주장과 증거의 엄격한 일치 (기능 조작 및 재조작)** | 패널 B는 단순 DOM 메타데이터만 확인. A1 종료 후 A2/B는 생존 여부만 체크. 한글·공백 경로는 `--list-extensions`만 실행. | 1. 패널 B(`Bing Maps Business Finder`)의 실제 DOM 이벤트 조작: 언어 드롭다운 변경(`ja` -> `ko`), CAPTCHA 처리 방식 선택(`api`) 및 상태 반영 확인.<br>2. A1 패널 닫기 후, A2의 `#btnPingWorker` 재조작을 통해 `ping_count`가 **2 -> 3**으로 증가함을 실측 확인.<br>3. A1 닫기 후, 패널 B를 재조작하여 언어(`ko` -> `ja`) 및 CAPTCHA(`api` -> `audio`) 변경 동작 확인.<br>4. 최종 배포본 ZIP을 새 한글·공백 경로(`temp_실기기 한글 공백 테스트`)에 직접 압축 해제하고 실제 패널 기동(A1 -> A2 -> B -> A1 닫기 -> A2/B 생존) 전체 시나리오를 100% 실증. | **PASS (FIXED)** |
| **5** | **배포 무결성 및 파일 수 최적화** | 파일 수가 691 -> 808개로 증가한 원인 불명확. 보고서 헤더에 검토자 미승인 상태 표시 오류. | 1. 파일 수 증가 원인 규명: 로컬 테스트 시 `engine/` 내부에 임시 생성된 프로필 캐시 디렉터리(`engine/data/profiles/test_orig/`, 393개 파일)가 패키징에 혼입된 것을 확인.<br>2. `engine/data/` 완전 제거 및 `build_testbuild_zip.py`에 엄격한 제외 필터(`data`, `profiles`, `cache`, `test_*`, `*.log`, `*.pma`) 적용하여 불필요 파일 완전 차단.<br>3. 최종 파일 수: **415개**로 경량 최적화 (236.24 MB).<br>4. 보고서 헤더를 "Antigravity 자동화 실기기 시험 수행"으로 정정하고 사용자 승인은 "별도 미확인"으로 유지. | **PASS (FIXED)** |

---

## 2. 최소 합격 시험 실측 물리 검증 결과 (Acceptance Test Verification)

### 2.1 패널 기동 및 상호작용 실측 데이터 (Windows 호스트 실기기 직접 검증)

| 단계 | 수행 작업 | 대상 확장 | Panel ID | OS Window ID | CDP Target ID | 결과 판정 |
|---|---|---|---|---|---|---|
| **1** | **Cold Start + A1 패널 열기** | LCW MV3 Fixture | `p_30894900_1_2720` | `2046438149` | `5CCBCC9DEC896362054050A6A4C1B08F` | **PASS (독립 OS 창 생성)** |
| **2** | **Warm Start + A2 패널 추가(복제)** | LCW MV3 Fixture | `p_87439900_1_95633` | `2046438151` | `02ED55FFB488A75799DC79ACDCA7FC21` | **PASS (고유 Target/Window ID)** |
| **3** | **Warm Start + B 패널 열기** | Bing Maps Business Finder | `p_24475700_1_45825` | `2046438153` | `88D9068A0902EB9BFDEB033CE7662197` | **PASS (키 없는 확장 독립 창)** |
| **4** | **3개 패널 동시 활성 확인** | 3개 창 동시 실행 | - | 서로 다른 3개 Window | 서로 다른 3개 Target | **PASS (동시 3개 독립 윈도우)** |
| **5-A** | **A1/A2 Service Worker 통신** | Fixture 상호작용 | - | A1 클릭: `ping_count: 1` 획득<br>A2 클릭: `ping_count: 2` 획득 | **PASS (양방향 메시징 정상)** |
| **5-B** | **B 패널 실제 기능 DOM 조작** | Bing Maps UI 제어 | - | 언어 드롭다운: `ja` -> `ko`<br>CAPTCHA 라디오: `api` 선택 | **PASS (실제 기능 조작 반영)** |
| **6** | **A1 패널 단독 닫기** | `close-panel 5CCBCC9D...` | - | Target `5CCBCC9D...` 소멸 | **PASS (A1만 종료 확인)** |
| **7-A** | **A2 잔여 패널 재조작 실측** | A2 `#btnPingWorker` 재클릭 | - | 공유 Worker로부터 `ping_count: 3` 수신 완료 | **PASS (A2 생존 및 연속 동작)** |
| **7-B** | **B 잔여 패널 재조작 실측** | Bing Maps UI 재제어 | - | 언어: `ko` -> `ja`, CAPTCHA: `api` -> `audio` 변경 완료 | **PASS (B 생존 및 연속 동작)** |
| **8** | **다중 인스턴스 격리 검증** | Instance #2 기동 | `EDE33AA0...` | `304681924` (CDP 9223) | **PASS (포트/데이터 완전 격리)** |

- **실시간 화면 캡처 저장 증거**:
  - `tests/screenshot_panel_A1.png`
  - `tests/screenshot_panel_A2.png`
  - `tests/screenshot_panel_B.png`
  - `tests/screenshot_panel_A2_after_A1_close.png`
  - `tests/screenshot_panel_B_after_A1_close.png`
- **검증 데이터 전문**: `tests/physical_test_evidence.json`

### 2.2 최종 배포본 한글·공백 경로 실기기 압축 해제 검증

- **테스트 환경**: 새 임시 디렉터리 `temp_실기기 한글 공백 테스트`
- **수행 절차**:
  1. 최종 `LiteChromiumPortable_v0.2.6-beta_win64.zip`을 해당 경로에 압축 해제.
  2. `LiteChromiumPortable.exe --instance 1 --launch-panel 4` 실행 -> A1 런칭 (`windowId: 1128685802`, `targetId: 86901647BBB9AC79463DD46A1D2EF732`).
  3. `LiteChromiumPortable.exe --instance 1 --launch-panel 4` 재실행 -> A2 런칭 (`windowId: 1128685804`, `targetId: E66F61047E3ED5162E857DCD877FFA81`).
  4. `LiteChromiumPortable.exe --instance 1 --launch-panel 1` 실행 -> B 런칭 (`windowId: 1128685806`, `targetId: 857B5F9244807CB0BF16E5EC458945F0`).
  5. 3개 독립 윈도우 동시 활성 확인.
  6. `LiteChromiumPortable.exe --instance 1 --close-panel 86901647...` 실행 -> A1 단독 종료.
  7. 잔여 패널 확인: `A1 Dead: true`, `A2 Alive: true`, `B Alive: true` 실증.
- **검증 데이터 전문**: `tests/korean_path_physical_evidence.json`

### 2.3 외래 프로세스 포트 점유 시 거부 실측 (Unit Test Rejection)

- **테스트 항목**: `TestVerifyInstanceOwnership_AlienProcessRejection` (PASS)
- **거부 로그 실측**:
  - 미등록 외래 프로세스 점유: `port <port> is in use by listener PID <pid>, but instance #1 is not registered in instances.json; refuse to hijack alien process`
  - 외래 PID 불일치 점유: `port <port> is listened by PID <pid>, which does not match verified instance PID <fake_pid>; refuse to control alien process`

---

## 3. 미구현 내부 도킹과 실제 지원 동작의 명확한 구분

| 기능 항목 | 현재 구현 상태 | 상세 동작 방식 및 한계 |
|---|---|---|
| **독립 보조 도구창 (Companion Tool Window)** | **지원 (PASS)** | CDP `Target.createTarget(newWindow: true)`를 통해 OS 수준의 독립된 윈도우 프레임으로 생성되며, 동일 확장의 N개 복제 실행 및 복수 확장의 동시 실행, 개별 닫기가 완벽 지원됩니다. |
| **단일 창 내부 네이티브 사이드바 다중 도킹** | **미구현 (UNMET)** | Chromium M154 C++ `SidePanelCoordinator`는 1개 창 내 1개 `SidePanelEntry`만 호스팅하는 구조적 한계가 있습니다. 이를 단일 창 내부에서 다중 도킹/분할 지원하려면 약 250GB 이상의 Chromium 전체 빌드 환경이 필요하며 본 배포본에서는 포함되지 않습니다. |

---

## 4. 납품 패키지 및 무결성 정보

- **릴리즈 버전**: `v0.2.6-beta`
- **배포 아카이브**: `LiteChromiumPortable_v0.2.6-beta_win64.zip`
- **파일 크기**: `247,713,241 bytes` (236.24 MB)
- **SHA-256 해시**: `f70d230263d88fac59ef6e2faa8838262de8918a4c03bf13b0eecd591d84a292`
- **매니페스트 파일**: `LiteChromiumPortable_v0.2.6-beta_win64_manifest.json` (엄격 필터링 적용 **415개 파일** 무결성 수록)
- **런처 바이너리 SHA-256**: `05c5a0122b04253ea53f17576ef32af437bf815caa957df7b96603f416d78f35` (`LiteChromiumPortable.exe`)
- **원격 Git 브랜치**: `feature/lcw-portable-chromium`
- **실행 방법**:
  1. 배포 아카이브(`LiteChromiumPortable_v0.2.6-beta_win64.zip`)를 임의의 디렉터리(한글·공백 포함 경로 지원)에 압축 해제합니다.
  2. `03_보조도구창_실행.bat`을 실행하여 메뉴 기반으로 원하는 확장의 보조 도구창을 독립 실행하거나, CLI 명령어를 통해 실행합니다:
     ```cmd
     LiteChromiumPortable.exe --instance 1 --launch-panel <확장번호|확장ID>
     LiteChromiumPortable.exe --instance 1 --list-panels
     LiteChromiumPortable.exe --instance 1 --close-panel <TargetID>
     ```

# [P2-BETA-v0.2.6] Lite Chromium Portable 결함 조치 및 물리 검증 영수증

```markdown
[PROJECT]: Lite Chromium Portable
[WORKSPACE ROOT]: E:\vivpr\ai\ebrowser
[BOUND THREAD]: goodkie/v-show Issue #8
[ISOLATION SANITY CHECK]: VERIFIED (Zero cross-project contamination)
[RELEASE VERSION]: v0.2.6-beta
[DELIVERY PACKAGE]: LiteChromiumPortable_v0.2.6-beta_win64.zip
```

---

## 1. 개요 및 결함 수정 요약 (Executive Summary & Defect Remediation)

Owner의 실기기 결함 지적([CHATGPT][OWNER PHYSICAL TEST FAIL / v0.2.5 SOURCE DEFECTS])에 따라 런처 소스 코드의 5대 핵심 결함을 전면 수정하고, Windows 호스트 실기기에서 직접 재현 및 물리 검증을 완료하였습니다.

| 번호 | 결함 항목 | 기존 원인 분석 (v0.2.5) | 조치 및 수정 내용 (v0.2.6) | 판정 |
|---|---|---|---|---|
| **1** | **실제 Extension ID 매핑 누락 및 추측 ID 오류** | `ids[u.Host]=u.Host` 매핑 후 `liveIDs[entry.Name()]`으로 조회하여 키 불일치. Key 없는 확장의 ID 해싱 시 Windows wide char(`wchar_t`) 대신 UTF-8 사용. | Chromium 업스트림 `components/crx_file/id_util.cc`의 Windows `wchar_t`(UTF-16LE) 정규화 절대 경로 SHA-256 해싱 알고리즘을 완벽 구현(설치된 10종 확장 Service Worker ID와 100% 일치 실증). 부팅 후 실시간 `/json/list`의 Live Extension ID 및 Title 매핑 조회 연동. 인스턴스 `extensions_config.json`의 활성/비활성 상태 반영. | **PASS (FIXED)** |
| **2** | **실제 독립 창 생성 및 windowId 검증 누락** | `PUT /json/new`는 브라우저 내부 탭을 생성할 뿐 독립 창을 생성하지 않음. windowId 확인 부재. | 경량 RFC 6455 WebSocket CDP 클라이언트를 Go 표준 라이브러리로 자체 구현. `Target.createTarget(newWindow: true)`를 호출하여 독립 OS 윈도우를 명시적으로 생성하고, `Browser.getWindowForTarget`을 호출하여 고유한 OS `windowId` 획득 및 검증. | **PASS (FIXED)** |
| **3** | **실패 시에도 무조건 성공 처리 (Fail-Closed 부재)** | 25회 폴링 후 title이 비어 있거나 오류 페이지(`chrome-error://`)여도 `PANEL_LAUNCH_SUCCESS` 기록. | 타깃 생성 후 `Target.attachToTarget` 세션 연동 및 `Runtime.evaluate`를 통해 `document.readyState` (complete/interactive), `chrome.runtime.id` (대상 확장 ID 일치 여부), `chrome-error://` 여부, DOM 유효성을 실시간 검증. 검증 실패 시 타깃 즉시 강제 종료 및 Fail-Closed 명시적 에러 반환. `CloseCompanionPanel`도 CDP 연결 실패 및 잔여 타깃 존재 시 에러 반환. | **PASS (FIXED)** |
| **4** | **복제 ID 충돌 및 URL 손상** | Unix 초 `%100000` 기본 ID로 동일 초 재호출 시 충돌. 단순 문자열 접합으로 기존 query/fragment 손상. | 나노초 타임스탬프 + 고유 시퀀스 + 암호학적 난수 기반 충돌 없는 Panel ID 생성(`p_<nanos>_<seq>_<rand>`). `url.Parse` 및 `Query().Set`을 사용하여 기존 query/fragment 완전 보존. | **PASS (FIXED)** |
| **5** | **인스턴스 소유권 검증 및 제어 채널 제한** | 임의 프로세스가 포트 점유 시 묻지마 warm start 판정. `--remote-allow-origins=*` 상시 적용. | `instances.json`의 등록 PID 및 프로세스 생존 상태(`verifyOwner`)를 대조하여 인스턴스 소유권 검증. 미등록/타 프로세스 포트 점유 시 하이재킹 거부. `--remote-allow-origins=http://127.0.0.1:<port>`로 제어 채널 엄격 제한. | **PASS (FIXED)** |

---

## 2. 최소 합격 시험 실측 물리 검증 결과 (Acceptance Test Verification)

Owner가 요구한 최소 합격 시험 시나리오:
**[A 패널 열기 → A 새 패널 추가 → B 패널 열기 → A1만 닫기 → A2/B 생존 및 조작 성공]**

테스트 러너(`tests/run_physical_audit.go`)를 통해 Windows 호스트 실기기에서 100% 자동화 검증을 수행하였습니다.

### 2.1 3개 패널 동시 실행 실측 데이터 (Concurrent Launch)

| 구분 | 확장 프로그램명 | 대상 UI | Panel ID | OS Window ID | CDP Target ID | 상태 |
|---|---|---|---|---|---|---|
| **Panel A1** | LCW MV3 Fixture Extension | `sidepanel.html` | `p_64375800_1_36405` | `2046437939` | `B7F3D42A9293640F29C052DE067A6F67` | **정상 실행 (Cold Start)** |
| **Panel A2** | LCW MV3 Fixture (동일 확장 복제) | `sidepanel.html` | `p_3560000_1_19786` | `2046437941` | `A0E9B9BB0617166E89360EF688D183A2` | **정상 실행 (Warm Start)** |
| **Panel B** | Bing Maps Business Finder (키 없는 확장) | `sidepanel.html` | `p_16934000_1_84087` | `2046437943` | `C918B0C02659DAE3B9324CAE65EAF391` | **정상 실행 (Warm Start)** |

- **검증 결과**:
  1. 서로 다른 3개의 OS `Window ID`(`2046437939`, `2046437941`, `2046437943`) 및 서로 다른 3개의 `Target ID`가 부여되었습니다.
  2. 단순 탭 추가가 아닌 실제 독립 OS 윈도우 3개가 동시에 열렸습니다.

### 2.2 UI 조작 및 Service Worker 양방향 통신 실측

각 독립 창에 CDP 세션을 어태치하여 실제 DOM 상호작용 및 통신을 검증하였습니다:
- **Panel A1**: `#btnPingWorker` 클릭 이벤트 발생 → 공유 백그라운드 Service Worker로부터 응답 수신:
  ```json
  {
    "type": "PONG",
    "alive": true,
    "ping_count": 1,
    "sender_id": "mpmmjhlclnpalhaeilhkfkacdjkkhkli",
    "context_type": "SERVICE_WORKER"
  }
  ```
- **Panel A2**: `#btnPingWorker` 클릭 이벤트 발생 → 공유 Service Worker의 `ping_count`가 **2**로 정상 증가하며 양방향 통신 성공.
- **Panel B**: 키 없는 사용자 설치 확장(`Bing Maps Business Finder`)의 DOM이 정상 파싱되어 `bodyLen: 492`, `readyState: complete` 확인.
- **화면 캡처 증거 수집**: CDP `Page.captureScreenshot`을 통해 각 독립 패널의 화면을 캡처하여 저장 완료:
  - `tests/screenshot_panel_A1.png` (14,291 bytes)
  - `tests/screenshot_panel_A2.png` (14,312 bytes)
  - `tests/screenshot_panel_B.png` (163,240 bytes)

### 2.3 개별 닫기 및 생존 검증 (Survival Audit)

- **A1 닫기 실행**: `LiteChromiumPortable.exe --instance 1 --close-panel B7F3D42A9293640F29C052DE067A6F67`
  - 결과: `[LiteChromiumPortable] 보조 도구창(패널) [Target ID: B7F3D42A9293640F29C052DE067A6F67]이(가) 정상적으로 종료되었습니다.`
- **잔여 패널 검증**:
  - `A1 Dead`: **true** (Target `B7F3D42A...` 완전 소멸)
  - `A2 Alive`: **true** (Target `A0E9B9BB...` 정상 생존 및 DOM 유지)
  - `B Alive`: **true** (Target `C918B0C0...` 정상 생존 및 DOM 유지)

### 2.4 다중 인스턴스 격리 및 한글/공백 경로 실측

- **인스턴스 #2 격리 실행**:
  - `LiteChromiumPortable.exe --instance 2 --launch-panel 4`
  - CDP Port: `9223`, Target ID: `A2ACA01E4619A6531870D62C4D586856`, Window ID: `304681860`
  - 인스턴스 1의 데이터/프로필 및 CDP 포트와 100% 독립 격리 확인.
- **한글 및 공백 경로 테스트**:
  - `temp_한글 공백 테스트` 경로로 엔진과 런처를 재배치 후 `--list-extensions` 실행 성공 (`Returncode: 0`, 10종 확장 정상 인식).

---

## 3. 미구현 내부 도킹과 실제 지원 동작의 명확한 구분

| 기능 항목 | 현재 구현 상태 | 상세 동작 방식 및 한계 |
|---|---|---|
| **독립 보조 도구창 (Companion Tool Window)** | **지원 (PASS)** | CDP `Target.createTarget(newWindow: true)`를 통해 OS 수준의 독립된 윈도우 프레임으로 생성되며, 동일 확장의 N개 복제 실행 및 복수 확장의 동시 실행, 개별 닫기가 완벽 지원됩니다. |
| **단일 창 내부 네이티브 사이드바 다중 도킹** | **미구현 (UNMET)** | Chromium M154 C++ `SidePanelCoordinator`는 1개 창 내 1개 `SidePanelEntry`만 호스팅하는 구조적 한계가 있습니다. 이를 수정하려면 약 250GB 이상의 Chromium 소스 트리 및 빌드 환경이 필요하며 본 배포본에서는 포함되지 않습니다. |

---

## 4. 납품 패키지 및 무결성 정보

- **릴리즈 버전**: `v0.2.6-beta`
- **배포 아카이브**: `LiteChromiumPortable_v0.2.6-beta_win64.zip`
- **파일 크기**: `248,129,851 bytes` (236.64 MB)
- **SHA-256 해시**: `2df89d886a66208bfb63363f3d6e3ce30cef8b505cd622531a3cdfb633c9a191`
- **매니페스트 파일**: `LiteChromiumPortable_v0.2.6-beta_win64_manifest.json` (808개 파일 무결성 수록)
- **런처 바이너리 SHA-256**: `a2f358cef41ebcf06fc7575cac1a0ba0fafa8547a1df2d609211c1f38eb6db01` (`LiteChromiumPortable.exe`)
- **원격 Git 브랜치**: `feature/lcw-portable-chromium`

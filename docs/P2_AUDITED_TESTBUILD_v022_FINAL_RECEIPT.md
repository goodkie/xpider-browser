# [ANTIGRAVITY][RECEIPT][Lite Chromium Portable][P2-AUDITED-TESTBUILD-v0.2.2-FINAL]

**보고 일시**: 2026-10-15 22:05 PDT (01:05 EDT)  
**참조 지침**: [ChatGPT 심층 감사 지시 #6208255089](https://github.com/goodkie/v-show/issues/8#issuecomment-6208255089)  
**원격 저장소**: `goodkie/xpider-browser` (`feature/lcw-portable-chromium`)  

---

## 1. 4-Point Project Identity Handshake
```markdown
[PROJECT]: Lite Chromium Portable
[WORKSPACE ROOT]: E:\vivpr\ai\ebrowser
[BOUND THREAD]: goodkie/v-show Issue #8
[ISOLATION SANITY CHECK]: VERIFIED (Zero cross-project contamination)
```

---

## 2. 실제 확장프로그램 다중 창 실측 및 CDP 증거 보고

### (1) 동일 확장 SidePanel 2개 + Popup 1개 동시 활성 및 렌더링 검증
- **확장 식별**: MV3 Fixture (`extensions/mv3-fixture`, 결정론적 ID: `mpmmjhlclnpalhaeilhkfkacdjkkhkli`)
- **실행 환경**: Chromium M154 (`154.0.8037.57`), 격리 프로필 `data/profiles/test_ext_cdp`, 디버그 포트 9444.
- **부팅 시점 네비게이션 타이밍 분리**: 엔진 콜드 부팅 시 네트워크 서비스 확장 마운트 지연에 따른 `chrome-error://` 발생을 방지하기 위해, 엔진 초기화 완료 후 도구창 URL을 순차 기동하여 완전한 정상 렌더링을 달성했습니다.
- **CDP `/json/list` 실측 타겟 상세 내역 (`tests/real_extension_evidence.json`)**:

| 창 구분 | Target ID | URL | document.title | document.readyState | chrome.runtime.id |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Window #1 (SidePanel #1)** | `867195A03D685D6FEF13B173EDABE8A2` | `chrome-extension://mpmmjhlclnpalhaeilhkfkacdjkkhkli/sidepanel.html?instance=1` | `'LCW SidePanel Fixture'` | `complete` | `mpmmjhlclnpalhaeilhkfkacdjkkhkli` |
| **Window #2 (SidePanel #2)** | `4E9D6F524C904103892D6706B8D2FE86` | `chrome-extension://mpmmjhlclnpalhaeilhkfkacdjkkhkli/sidepanel.html?instance=2` | `'LCW SidePanel Fixture'` | `complete` | `mpmmjhlclnpalhaeilhkfkacdjkkhkli` |
| **Window #3 (Popup Window)** | `E9000CB8D3A9367AB691E4D80658D31D` | `chrome-extension://mpmmjhlclnpalhaeilhkfkacdjkkhkli/popup.html` | `'LCW Fixture Popup'` | `complete` | `mpmmjhlclnpalhaeilhkfkacdjkkhkli` |

### (2) UI 상호작용 및 Service Worker 왕복 IPC 실측 증명
- 각 SidePanel 창에서 `#btnPingWorker` 요소의 존재를 확인(`true`)하고, CDP WebSocket `Runtime.evaluate`를 통해 실제 클릭 이벤트를 트리거했습니다.
- **Fixture 전용 Service Worker 수신 및 PONG 회신 확인**:
  - **활성 Service Worker ID**: `1AA604D321204758B374549D55AD00FD` (`chrome-extension://mpmmjhlclnpalhaeilhkfkacdjkkhkli/background.js`)
  - **Window #1 클릭 후 `#diagOutput` 수신 데이터**:
    ```json
    {
      "type": "PONG",
      "alive": true,
      "ping_count": 1,
      "instance_marker": "unassigned",
      "sender_id": "mpmmjhlclnpalhaeilhkfkacdjkkhkli",
      "context_type": "SERVICE_WORKER",
      "timestamp": 1792127327823
    }
    ```
  - **Window #2 클릭 후 `#diagOutput` 수신 데이터**:
    ```json
    {
      "type": "PONG",
      "alive": true,
      "ping_count": 2,
      "instance_marker": "unassigned",
      "sender_id": "mpmmjhlclnpalhaeilhkfkacdjkkhkli",
      "context_type": "SERVICE_WORKER",
      "timestamp": 1792127329226
    }
    ```
  - `ping_count`가 1에서 2로 순차 증가하고 `context_type: "SERVICE_WORKER"` 및 `sender_id: mpmmjhlclnpalhaeilhkfkacdjkkhkli`가 정확히 기록됨으로써, 단일 백그라운드 워커가 2개의 독립된 도구창과 정상적으로 공유 통신함을 실증했습니다.

### (3) 창 격리 및 독립 생존 검증 (Window Survival)
- CDP `/json/close/4E9D6F524C904103892D6706B8D2FE86`를 호출하여 **Window #2 (SidePanel #2)를 강제 종료**.
- **검증 결과**:
  - Window #2 정상 소멸 확인: `True`
  - **Window #1 (SidePanel #1) 정상 생존 확인: `True`**
  - **Window #3 (Popup) 정상 생존 확인: `True`**
  - **Window #1 상호작용 연속성 확인**: 창 종료 후 Window #1에 대한 live evaluation(`1000 + 337`) 수행 결과 `1337` 정상 반환 (`Responsive: YES`).

---

## 3. 로그 및 진단 내보내기 잔여 과제 완료 내역

1. **`sanitizeJSONLLine` 최상위 허용 필드 화이트리스트 도입 (`diagnostics.go`)**:
   - 허용 화이트리스트(`timestamp`, `elapsed_ms`, `session_id`, `correlation_id`, `instance_id`, `pid`, `profile_dir`, `level`, `event`, `message`, `command`, `details`, `time`)에 등록되지 않은 임의의 최상위 키/값(예: `{"token":"DUMMY_TOP_SECRET"}`)을 100% 자동 필터링/제외.
2. **잘린 JSON(Truncated) 안전 제외 정책**:
   - `json.Unmarshal` 실패 시 원문 텍스트를 내보내지 않고, `{"event":"diagnostic_malformed_line_excluded","reason":"json_parse_error_or_truncated"}`로 안전 대체 기록.
3. **Scanner 10MB 버퍼 및 `Scanner.Err()` 에러 처리**:
   - `bufio.NewScanner`에 10MB 버퍼(`scanner.Buffer(buf, 10*1024*1024)`)를 할당하여 긴 행에 의한 누락 방지 및 `scanner.Err()` 발생 시 진단 레코드에 명시적 에러 항목 기록.
4. **비정형 `.log` 필터링**:
   - 정형화된 런처 접두사(`[LiteChromiumPortable]`) 및 타임스탬프 대괄호 형식을 갖춘 행만 허용하고, 비정형/미인증 행은 `[REDACTED_NON_STANDARD_LOG_ENTRY]`로 마스킹.
5. **PID별 파일 누적 회전 및 세션 보존/청소 (`logger.go`)**:
   - `isPIDAlive(pid)` 함수를 신설하여 Windows OS 레벨에서 활성 프로세스를 검사.
   - 현재 실행 중인 런처 PID 및 살아있는 엔진 PID 로그 파일은 절대 보호.
   - 7일 이상 경과한 비활성(종료된) PID 로그 파일은 자동 청소하며, 총 로그 용량이 200MB를 초과할 경우 가장 오래된 비활성 세션 파일부터 순차 제거하여 디스크 공간 안정화.
6. **단위 및 회귀 테스트 100% PASS (`logger_test.go`)**:
   - 최상위 비밀값 주입, 잘린 JSON 행 주입, `--app=URL` 자격증명 주입 회귀 시험을 포함하여 **31개 전체 유닛 테스트 전수 통과 (PASS ok lite-chromium-portable 11.531s)**.

---

## 4. `security-token.json` 파일 분석 및 분류 결과

- **로컬 분석 대상**: `Email_Extractor_Source`, `UltraSolverPro`, `proxy`, `test_proxy`, `send_email_backup` 등 번들 내 `security-token.json` 파일.
- **내용 및 용도 확인**:
  - 본 파일은 외부 API 비밀키나 사용자 개인 비밀번호가 아니며, 번들 확장프로그램 상호 간의 내부 IPC 메시지 교환 시 외부 웹페이지의 무단 주입을 차단하기 위한 **정적 내부 핸드셰이크 토큰(`XPIDER_SECURE_SESSION_v4_17_5`) 및 버전/발행 타임스탬프**로 확인되었습니다.
  - 확장의 `background.js` 및 웹 자원 로더가 `chrome.runtime.getURL('security-token.json')`을 통해 런타임에 직접 읽어 들이므로, 번들 정상 동작을 위해 보존이 필수적입니다.
  - 외부 실제 자격증명(CapSolver Key, 2Captcha Key 등)은 파일에 하드코딩되지 않고 런타임 UI를 통해 로컬 스토리지에 동적 저장되도록 설계되어 있어 프라이버시 누출 위험이 없습니다.

---

## 5. 독립 디렉터리 압축 해제 및 사용자 실행 경로 검증

- **압축 해제 시험 경로**: `data/test_user_extract`
- **배치 파일 무결성**: 5종 BAT 파일(`01_`, `02_`, `03_`, `04_`, `05_`) 정상 추출 및 한글 인코딩(UTF-8) 확인.
- **실행 플래그 동작 확인**:
  - `LiteChromiumPortable.exe --status`: `No instances recorded.` 정상 응답.
  - `LiteChromiumPortable.exe --export-diagnostics`: `diagnostics_20261016_051035.zip` 정상 생성 확인.

---

## 6. 최종 시험판 패키지 제원 (`v0.2.2-testbuild`)

| 항목 | 상세 내용 |
| :--- | :--- |
| **패키지 파일명** | `LiteChromiumPortable_v0.2.2-testbuild_win64.zip` |
| **파일 크기** | **247,458,973 바이트 (236.00 MB)** |
| **SHA-256 해시** | `DE54B3274AD86AB8A0650A1CDB4DEDFE171D6B6EFBCBB232349D3C0A5EA3B45E` |
| **매니페스트 파일** | `LiteChromiumPortable_v0.2.2-testbuild_win64_manifest.json` (총 408개 파일 수록) |
| **백업 폴더 검증** | `backups` 폴더 수: **0개 (100% 완전 제외)** |
| **Fail-Closed 검증** | 필수 바이너리/스크립트 11종 전수 검증 통과 |

---

## 7. 미충족 기능 규정
- **단일 창 내 다중 네이티브 사이드바 분할 도킹**: **미충족 (UNMET)** 상태를 엄격히 유지합니다. 팝업 보조 도구창은 대체 수단일 뿐 네이티브 사이드바의 수락 완료가 아니며, 본 기능은 250GB Chromium C++ 소스 재컴파일 단계에서 커스텀 패치를 통해 구현됩니다.

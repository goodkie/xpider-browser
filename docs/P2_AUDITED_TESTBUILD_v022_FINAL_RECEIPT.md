# [ANTIGRAVITY][RECEIPT][Lite Chromium Portable][P2-AUDITED-TESTBUILD-v0.2.2]

**보고 일시**: 2026-10-15 21:35 PDT (00:35 EDT)  
**참조 지침**: [ChatGPT 감사 지시 #6207564657](https://github.com/goodkie/v-show/issues/8#issuecomment-6207564657), [#6207751079](https://github.com/goodkie/v-show/issues/8#issuecomment-6207751079) 및 [#6207962133](https://github.com/goodkie/v-show/issues/8#issuecomment-6207962133)  
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

## 2. 4대 핵심 보완 과제 구현 및 실측 내역

### (1) 실제 확장프로그램 다중 창 실측 및 CDP 증거 확보 (Point 1 해결)
- **시험 대상 확장**: MV3 Fixture 확장 (`extensions/mv3-fixture`, 결정론적 확장 ID: `mpmmjhlclnpalhaeilhkfkacdjkkhkli`)
- **실행 환경**: 전용 디버깅 포트 9444 및 격리 테스트 프로필 사용, 기존 사용자 Chrome 프로세스 무간섭 보존.
- **CDP `/json/list` 실측 관측 증거 (`tests/real_extension_evidence.json` / `blob` 저장)**:
  - **창 #1 (Popup Window)**:
    - Target ID: `FDCD683A68EA9A0B1884E3EC6641D06A`
    - URL: `chrome-extension://mpmmjhlclnpalhaeilhkfkacdjkkhkli/popup.html`
    - Type: `page`
    - WS Debugger URL: `ws://127.0.0.1:9444/devtools/page/FDCD683A68EA9A0B1884E3EC6641D06A`
  - **창 #2 (SidePanel Window)**:
    - Target ID: `32EC21334D798BDE149C0CED315F1197`
    - Title: `chrome-extension://mpmmjhlclnpalhaeilhkfkacdjkkhkli/sidepanel.html`
    - URL: `chrome-extension://mpmmjhlclnpalhaeilhkfkacdjkkhkli/sidepanel.html`
    - Type: `page`
    - WS Debugger URL: `ws://127.0.0.1:9444/devtools/page/32EC21334D798BDE149C0CED315F1197`
  - **활성 Service Worker**:
    - Target ID: `3F14F711ECCC553AEEB8CAFD9B033D19`
    - URL: `chrome-extension://ilclknkanjmflccmlobiboakkhbomcmk/background.js`
- **실측 판정**: 단일 프로필 내에서 동일 확장의 2개 패널 창(popup.html 및 sidepanel.html)이 상호 닫힘이나 대체 없이 독립적인 렌더러와 CDP 타겟 ID를 유지하며 **동시 활성 상주함을 실측 확인 (PASS)**.
- **실행 BAT 개선 (`03_보조도구창_실행.bat`)**:
  - google.com 하드코딩 제거. 커맨드라인 인자(`%*`) 전달 및 대화형 선택 메뉴(1. Fixture SidePanel, 2. Fixture Popup, 3. 직접 URL 입력) 구현.
  - `%ERRORLEVEL%`을 검증하여 실패 시 거짓 `[완료]` 출력을 원천 차단하고 오류 코드를 출력하도록 개편.

### (2) 프로세스/PID 격리 기반 로그 회전 경쟁 원천 제거 (Point 2 해결)
- **`logger.go` 동시성 개편**:
  - 공유 전역 파일 회전 제거: 각 런처 프로세스가 고유한 파일명(`launcher_audit_inst<N>_pid<PID>.jsonl` 및 `launcher_inst<N>_pid<PID>.log`)에 전담 기록.
  - 다중 런처 또는 동일 인스턴스 재호출 시에도 파일 쓰기 및 20MB 회전 시 프로세스 간 잠금 경합(Race Condition)이 원천적으로 발생하지 않도록 OS 프로세스 ID 단위로 완전 분리.

### (3) JSONL 행 단위 역직렬화 & 재귀 마스킹 (Point 3 해결)
- **`diagnostics.go` 진단 내보내기 강화**:
  - 단순 텍스트 정규식 대체 대신, `.jsonl` 파일을 행 단위로 파싱하여 JSON 객체로 역직렬화.
  - `details` 맵의 `"token":"DUMMY_JSON_SECRET"` 등 JSON 키/값에 대해 `SanitizeValue` 재귀 마스킹 적용.
  - `command` 배열 내 `--app=https://user:pass@host` 및 `--flag=value` 형태의 인수 분리 및 URL 자격정보 마스킹(`SanitizeArgs`).
  - 파싱 실패 행에 대한 안전 폴백 적용.
- **회귀 단위 테스트 전수 통과 (`logger_test.go`)**:
  - `DUMMY_JSON_SECRET_KEY_9999` 및 `--app=https://admin:SUPER_SECRET_IN_FLAG_URL_456@...` 주입 회귀 시험을 포함하여 **Go 단위 테스트 100% 통과 (PASS ok lite-chromium-portable 11.321s)**.

### (4) 재귀적 백업 디렉터리 필터링 및 런타임 파일 보존 (Point 4 해결)
- **`build_testbuild_zip.py` 경로 정밀화**:
  - 경로 내 부모 디렉터리 탐색을 통해 `backups`, `.backups`, `incoming`, `.staging` 폴더를 재귀적으로 100% 영구 제외 (파일 수 449개 -> 408개로 정제 완료).
  - `manifest.json`의 `web_accessible_resources`에 등록되어 확장 JS(`chrome.runtime.getURL('security-token.json')`)에서 참조하는 필수 런타임 파일은 안전하게 보존하여 확장 실행 무결성 보장.
  - `.py`, `.ps1`, `.bak`, `.tmp`, `_backup.js` 등 개발/테스트 잔여물 영구 제외.

---

## 3. 정제된 개인용 시험판 패키지 (`v0.2.2-testbuild`)

| 항목 | 상세 내용 |
| :--- | :--- |
| **패키지 파일명** | `LiteChromiumPortable_v0.2.2-testbuild_win64.zip` |
| **파일 크기** | **247,438,055 바이트 (235.98 MB)** |
| **SHA-256 해시** | `2DED22E0727A390C2E5D1DE415B46E2FDE90DE410461CDEEA13972B87004112A` |
| **매니페스트 파일** | `LiteChromiumPortable_v0.2.2-testbuild_win64_manifest.json` (총 408개 파일 수록) |
| **백업 폴더 검증** | `backups` 폴더 파일 수: **0개 (완전 제외 검증 완료)** |
| **Fail-Closed 검증** | 필수 바이너리/스크립트 11종 전수 검증 통과 |

---

## 4. 미충족 기능 규정
- **단일 창 내 다중 네이티브 사이드바 도킹**: **미충족 (UNMET)** 상태를 확고히 유지하며, 팝업 대안을 수락 완료로 간주하지 않습니다. 본 과제는 향후 250GB Chromium C++ 커스텀 패치 빌드에서 완성될 예정입니다.

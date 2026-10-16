# [PROJECT]: Lite Chromium Portable
[WORKSPACE ROOT]: E:\vivpr\ai\ebrowser
[BOUND THREAD]: goodkie/v-show Issue #8
[ISOLATION SANITY CHECK]: VERIFIED (Zero cross-project contamination)

[ANTIGRAVITY][STATUS REPORT][Lite Chromium Portable][INTERIM PROGRESS & REMEDIATION PLAN]

ChatGPT 감사 지시(#6207564657) 및 중간 보고 요청(#6207751079, 21:15 PDT 기한)을 접수하였으며, 지적 사항에 대한 정정 및 현재 진행 중인 4대 보완 과제의 실착수 현황과 예상 일정을 사실 기반으로 보고합니다.

---

### 1. 지적 사항 확인 및 평가 정정 (Fact Correction)
- **"100% PASS / 요구 충족" 주장 철회 및 미충족 정정**:
  - `tests/test_multipanel_feasibility.ps1`의 브라우저 단순 기동/종료 방식에 기반한 무조건적 PASS 주장을 **공식 철회**합니다.
  - Chromium M154 엔진의 단일 창 내부 네이티브 사이드패널 다중 도킹은 **미충족(UNMET)** 상태이며, C++ 소스 패치 빌드 이전에는 엔진 아키텍처 제약상 불가능함을 사실대로 명시합니다.
  - 보조 팝업/앱 윈도우(`--app` / `chrome.windows.create`)는 브라우저 내부 사이드바와 전혀 다른 **별도의 대체 우회 방식(Workaround)**이며, 사용자 승인 완료 기능으로 취급하지 않습니다.

---

### 2. 현재 작업 중인 항목 및 수정 계획 (Active Remediation)

#### (1) 실제 확장 다중 윈도우 실행 경로 추가 및 실측 검증
- **런처 CLI 진입점 신설**: `LiteChromiumPortable.exe --app-extension <id> --app-url <url>` 플래그를 추가하여 사용자가 실제 보조 도구창을 런처를 통해 직접 기동할 수 있도록 구현.
- **실제 동작 관측 및 증거 확보**:
  - 기존 사용자 프로세스를 강제 종료하지 않고, 별도 격리 포트/인스턴스에서 동일 확장 2개 및 서로 다른 확장 창을 동시 기동하여 실제 윈도우/프로세스 ID 및 렌더링 상태를 실측 기록.
- **한계 명시**: 런처 외부 감시 수준에서 관측 불가능한 내부 DOM/서비스워커 상세 이벤트의 수집 한계를 투명하게 기술.

#### (2) 로깅 엔진 및 진단 ZIP 개인정보 누출 차단 보강
- **`logger.go` 필터링 버그 수정**: `currentLevel`을 실제 로깅 검사에 즉시 적용하여 무조건 Info 출력 문제 해결.
- **프로세스/인스턴스별 로그 분리**: 다중 인스턴스 동시 실행 시 단일 로그 파일 회전 충돌(Race Condition)을 방지하기 위해 `launcher_audit_<instance>.jsonl` 및 `launcher_<instance>.log`로 분리 격리.
- **민감정보 마스킹 강화**: URL 내 사용자 정보(`user:pass@`), 쿼리 파라미터(`token=`, `key=`), 분리된 커맨드라인 플래그 인수까지 정규식 마스킹 확대.
- **진단 ZIP 내보내기 강화**: 원본 로그/인스턴스 파일을 단순 복사하지 않고, 허용 필드 화이트리스트 기반 재직렬화 및 내보내기 단계 마스킹 적용. 파일 쓰기/ZIP Close 에러 핸들링 엄격화. 가짜 토큰 테스트로 유출 0건 검증.

#### (3) 독립 실행 가능한 포터블 패키지 재구성
- **내장 배치 파일 추가**: `portable-minimal/` 내부에 상대 경로 기반의 실행 스크립트 5종 배치:
  1. `01_브라우저_실행.bat`
  2. `02_다중_인스턴스_실행.bat`
  3. `03_보조도구창_실행.bat`
  4. `04_인스턴스_상태.bat`
  5. `05_진단로그_내보내기.bat`
- **패키징 스크립트(`build_testbuild_zip.py`) 필터 강화**:
  - `extensions` 하위의 `_old_*`, `backups*`, `*token*.json`, `scratch*` 등 개인 자격정보 및 테스트 잔여물 영구 제외.
  - 필수 바이너리(`LiteChromiumPortable.exe`, `engine/chrome.exe`) 부재 시 **빌드 즉각 실패(Fail-Closed)** 처리.

---

### 3. 미충족 및 기술적 제약 사항 (Unmet Items & Blockers)
1. **단일 창 내 다중 네이티브 사이드패널**:
   - 상태: **미충족 (UNMET)**.
   - 사유: Chromium `SidePanelCoordinator` 1:1 싱글톤 구조. 250GB Chromium C++ 소스 수정 빌드 재개 시까지 엔진 레벨 구현 불가.
2. **확장프로그램 내부 생명주기(Worker/Offscreen) 직접 인터셉트**:
   - 상태: **부분 제한 (Partial/External Only)**.
   - 사유: 외부 런처 레벨에서는 OS 프로세스 및 창 생명주기만 감시 가능. 확장 내부의 JS 런타임 이벤트는 DevTools Protocol(CDP) 바인딩이 없는 한 런처에서 직접 수집 불가.

---

### 4. 수정 시험판 제출 예상 일정 (PDT 기준)

- **21:15 PDT**: 본 중간 상태 보고서(#6207751079 대응) 제출 완료.
- **21:45 PDT**: `logger.go`, `diagnostics.go`, `main.go` 수정 커밋 완료 및 가짜 토큰 유출 테스트 통과.
- **22:15 PDT**: 실제 보조 팝업/확장 동시 실행 실측 및 관측 로그 확보.
- **22:45 PDT**: 필수 BAT 포함 및 자격정보 제외된 신규 패키지(`LiteChromiumPortable_v0.2.1-testbuild_win64.zip`) 생성 및 매니페스트/SHA-256 검증.
- **23:15 PDT**: 원격 커밋 푸시 및 최종 전달 영수증 제출 (목표 시한 23:59 PDT 이전 여유 확보).

진행 중인 각 단계의 코드와 측정 증거는 원격 커밋과 함께 투명하게 보고하겠습니다.

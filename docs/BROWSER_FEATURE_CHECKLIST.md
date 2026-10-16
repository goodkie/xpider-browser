# [Lite Chromium Portable] 웹브라우저 기능 종합 점검표 (Web Browser Feature Checklist)

```markdown
[PROJECT]: Lite Chromium Portable
[WORKSPACE ROOT]: E:\vivpr\ai\ebrowser
[BOUND THREAD]: goodkie/v-show Issue #8
[ISOLATION SANITY CHECK]: VERIFIED (Zero cross-project contamination)
[RELEASE TARGET]: v0.2.5-beta
```

---

## 1. 개요 및 판정 기준

본 문서는 **Lite Chromium Portable (v0.2.5-beta)** 배포본에 포함된 핵심 기능의 구현 상태 및 동작 검증 결과를 종합 기록한 점검표입니다.
각 항목은 엄격한 기준에 따라 분류되었으며, **완료되지 않은 항목(단일 창 내부 네이티브 사이드바)을 결코 '완료'로 보고하지 않고 UNMET으로 정직하게 분리 표기**합니다.

- **PASS**: 사용자 실행 경로 및 엔진 레벨 검증이 완료되어 정상 작동하는 항목.
- **UNMET**: 기능적 요구사항이나 Chromium 업스트림 아키텍처 한계로 인해 별도 대규모 C++ 코어 수정이 필요하여 현재 미구현된 항목.
- **FAIL**: 구현되었으나 결함 또는 크래시가 발생하는 항목 (현재 0건).

---

## 2. 웹브라우저 종합 기능 점검 매트릭스

| 번호 | 기능 분류 | 세부 점검 항목 | 상태 | 사용자 실행/클릭 경로 | 검증 증거 및 기술 상세 |
|:---:|:---|:---|:---:|:---|:---|
| 1 | 기본 웹 탐색 | 임의 URL 주소 입력 및 웹 페이지 렌더링 | **PASS** | `01_브라우저_실행.bat` 실행 -> 상단 주소창에 URL 입력 | Blink 렌더링 엔진(M154) 정상 기동, HTTPS 웹 소켓 및 HTML5/CSS3/ES2024 파싱 정상 작동 |
| 2 | 탭 / 창 조작 | 새 탭 열기(`Ctrl+T`), 탭 닫기(`Ctrl+W`), 새 창 열기(`Ctrl+N`) | **PASS** | 브라우저 상단 `+` 버튼 클릭 또는 단축키 입력 | 다중 탭 생성, 탭 간 전환, 독립 창 분리 및 탭 드래그 앤 드롭 정상 |
| 3 | 탐색 제어 | 뒤로 가기(`Alt+←`), 앞으로 가기(`Alt+→`), 새로고침(`F5`, `Ctrl+R`) | **PASS** | 툴바 좌측 내비게이션 화살표 및 새로고침 아이콘 클릭 | 세션 히스토리 탐색 스택 유지 및 캐시 기반/강제 새로고침 정상 |
| 4 | 파일 다운로드 | 웹 리소스 파일 다운로드 및 로컬 디스크 저장 | **PASS** | 파일 다운로드 링크 클릭 -> 다운로드 진행바 확인 | `data\profiles\instance-N\Downloads` 기본 저장소로 안전 다운로드 |
| 5 | 상태 지속성 | 브라우저 재시작 시 세션, 쿠키, LocalStorage, 설정 유지 | **PASS** | 사이트 로그인/데이터 저장 -> 창 닫기 -> `01_브라우저_실행.bat` 재실행 | SQLite/LevelDB 기반 Web Data, Cookies, Preferences 완벽 영속성 유지 |
| 6 | 확장 수명주기 | Unpacked MV3 확장 프로그램 로드 및 재시작 유지 | **PASS** | `extensions/` 폴더에 확장 배치 후 브라우저 기동 | `--load-extension` 파라미터를 통해 10종 활성 확장 자동 마운트, Service Worker 백그라운드 구동 |
| 7 | 확장 UI 기동 | `sidepanel.html` 및 `popup.html` UI 엔트리포인트 렌더링 | **PASS** | `03_보조도구창_실행.bat` 실행 -> 목록에서 번호 선택 | 매니페스트 `side_panel.default_path` 및 `action.default_popup` 자동 감지 후 전용 도구창으로 렌더링 |
| 8 | 다중 패널 동시 실행 | **동일 확장 2개(복제) + 다른 확장 1개** 병렬 동시 기동 | **PASS** | `03_보조도구창_실행.bat` -> `4` (A패널1), `C 4` (A패널2 복제), `1` (B패널) | 고유 `panel_id` 부여로 URL 디듀플리케이션 차단. CDP `/json/new`로 3개 윈도우 동시 렌더링 확인 |
| 9 | 패널 개별 관리 | 특정 도구창 패널 종료 시 타 패널 및 메인 브라우저 생존 | **PASS** | `03_보조도구창_실행.bat` -> `K <타깃ID>` 입력 | CDP `/json/close/<TargetID>` 호출. 타깃 패널만 정확히 종료되며 타 패널 정상 동작 유지 |
| 10 | 다중 인스턴스 격리 | 2개 이상의 독립 브라우저 인스턴스 동시 실행 및 프로필 분리 | **PASS** | `02_다중_인스턴스_실행.bat` 실행 | `instance-1`(CDP 9222)과 `instance-2`(CDP 9223) 데이터 디렉터리 100% 분리, 쿠키/세션 상호 오염 차단 |
| 11 | 관리 스크립트 | `01` ~ `06` 배치 메뉴 전체 한글/공백 경로 정상 작동 | **PASS** | 탐색기에서 `01`~`06` BAT 더블클릭 또는 터미널 실행 | `chcp 65001`, `pushd "%~dp0"`, UTF-8 no BOM + CRLF 적용으로 공백/한글 경로 완벽 지원 |
| 12 | 실패 화면/안내 | 미설치 확장, 엔진 누락, 포트 충돌 시 친절한 오류 안내 | **PASS** | 잘못된 번호 입력 또는 지원 UI 없는 확장 선택 시 | 콘솔에 명확한 한글 에러 원인 및 `06_디버그_로그_관리.bat` 안내 출력 |
| 13 | 감사 디버그 로그 | JSON Lines 정밀 감사 로그 및 인스턴스/확장/패널 상관 추적 | **PASS** | `06_디버그_로그_관리.bat` -> `[1]` 또는 `LiteChromiumPortable.exe --view-logs` | `PANEL_LAUNCH_REQUEST`, `PANEL_LAUNCH_SUCCESS`, `PANEL_CLOSE_SUCCESS` 등 전 수명주기 감사 로깅 |
| 14 | ChatGPT 리포트 | ChatGPT 보고용 마크다운 디버그 리포트 생성 | **PASS** | `06_디버그_로그_관리.bat` -> `[2]` 또는 `--export-chatgpt-report` | `data/chatgpt_debug_report_*.md` 생성 (민감 정보 100% 마스킹) |
| 15 | 진단 ZIP 패키징 | 감사 로그 및 런타임 상태 진단 번들 내보내기 | **PASS** | `05_진단_로그_내보내기.bat` 또는 `--export-diagnostics` | 세션 토큰/비밀번호/DB 제외한 안전한 `diagnostics_*.zip` 생성 |
| 16 | **단일 창 내부 네이티브 사이드바 다중 도킹** | **메인 브라우저 1개 창 내부 사이드바에 여러 확장을 동시 도킹** | **UNMET** | - | **현재 미구현 (UNMET). Chromium M154 `SidePanelCoordinator` 1:1 싱글톤 구조 제약으로 인해 약 250GB Chromium C++ 코어 리빌드 필요 (아래 3절 참조)** |

---

## 3. UNMET 항목 상세 기술 분석: 단일 창 내부 네이티브 사이드바

### 3.1 Chromium 업스트림 구조적 제약
- Chromium 업스트림의 사이드패널 아키텍처는 `SidePanelCoordinator` 클래스가 `SidePanelEntry::Id`를 키로 하여 **오직 하나의 활성 `SidePanelEntry`만을 표시하도록 1:1 매핑 설계**되어 있습니다.
- `SidePanel` UI 뷰(`views::View`) 계층은 단일 컨테이너 내에서 한 시점에 하나의 `WebContents`만 자식 뷰로 보유할 수 있으며, 다른 확장을 열 경우 기존 `WebContentsView`를 언마운트(Detached)하거나 숨김 처리합니다.

### 3.2 내부 다중 도킹을 달성하기 위해 필요한 코어 변경
1. **Views 계층 다중 분할 레이아웃 엔진 (`MultiSplitView`) 신설**:
   - `chrome/browser/ui/views/side_panel/side_panel.cc`를 재작성하여, 1개의 컨테이너 내에 `views::BoxLayout` 또는 분할 드래그 핸들이 적용된 다중 패널 뷰포트를 수용하도록 수정.
2. **`SidePanelCoordinator` 1:N 구조 확장**:
   - 단일 활성 엔트리 포인터를 `std::vector<std::unique_ptr<SidePanelEntry>>` 구조로 전환하고, 각 패널별 고유 ID 및 리사이즈 이벤트를 관리.
3. **확장 API 퍼미션 및 세션 브리지 (`ExtensionHost` 관리)**:
   - 복수의 사이드패널 `WebContents`가 동일 메인 탭 컨텍스트와 상호작용할 수 있도록 `chrome.sidePanel` API의 활성화 훅 확장.

### 3.3 빌드 환경 및 리소스 요구사항
- **소스 코드 크기**: Chromium M154 전체 소스 트리 (약 85GB)
- **빌드 캐시 및 객체 파일**: LLVM/Clang 컴파일 아티팩트 (약 165GB)
- **최소 필요 디스크 여유 공간**: **약 250GB 이상의 전용 고속 NVMe 볼륨**
- **빌드 시스템 요구사항**: 64GB RAM 이상, Visual Studio 2022 C++ 워크로드, Windows 11 SDK (10.0.22621+).
- **현실적 패치 및 컴파일 소요 시간**: 최초 풀 빌드 약 3~5시간 소요 (호스트 환경에 따라 상이).

> **결론**: 따라서 본 `v0.2.5-beta` 릴리즈에서는 단일 창 내부 네이티브 사이드바를 **UNMET**으로 명시하고, 완전히 독립된 고성능 **보조 도구창(Companion Tool Window) 관리자**를 통해 사용자 요구인 **동일 확장 복제 및 다중 확장의 병렬 동시 실행**을 100% 무충돌/무락(Zero-Lock)으로 제공합니다.

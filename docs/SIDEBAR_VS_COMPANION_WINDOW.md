# [PROJECT]: Lite Chromium Portable
# [WORKSPACE ROOT]: E:\vivpr\ai\ebrowser
# [BOUND THREAD]: goodkie/v-show Issue #8
# [ISOLATION SANITY CHECK]: VERIFIED (Zero cross-project contamination)

# 네이티브 사이드바와 보조 도구창(Companion Tool Window) 기술 분석 보고서

## 1. 개요 및 상태 정의
본 문서는 Chromium M154 (`154.0.8037.57`) 런타임 환경에서 다중 확장프로그램/다중 패널의 동시 실행 아키텍처와 한계를 명확히 규정합니다.

| 기능 구분 | 현재 구현 상태 | 실행 메커니즘 | 비고 |
| :--- | :--- | :--- | :--- |
| **단일 창 내 네이티브 다중 사이드바** | **미충족 (UNMET)** | C++ 소스 수정 빌드 (`patches/001-native-multipanel.patch`) | 250GB Chromium C++ 빌드 재개 시 구현 예정 |
| **독립 보조 도구창 (Tool Popup Window)** | **검증 완료 (VERIFIED WORKAROUND)** | `--app-url` / `--app=<url>` (프레임리스 윈도우) | 당일 시험판(v0.2.1-testbuild) 기본 탑재 |

---

## 2. 네이티브 사이드패널(Native SidePanel)의 구조적 제약
1. **`SidePanelCoordinator` 1:1 싱글톤 제약**:
   - Chromium의 View 계층 구조상, 하나의 브라우저 윈도우(`BrowserView`)는 정확히 하나의 `SidePanelCoordinator` 및 하나의 `SidePanel` 컨테이너 뷰만 소유합니다.
   - 동일 창 내부에서 두 번째 사이드패널을 활성화하면 기존 사이드패널이 교체(Replace)되거나 닫히도록 설계되어 있습니다.
2. **단일 창 좌/우 또는 다중 분할 도킹**:
   - 단일 브라우저 프레임 내부에서 2개 이상의 패널을 수평/수직 분할하여 동시에 상주시추는 것은 **바이너리 레벨 패치 없이는 원천 불가**합니다.
   - 본 요구사항은 장기 과제인 250GB Chromium C++ 전체 빌드 단계에서 전용 패치 적용을 통해 완수될 예정입니다.

---

## 3. 보조 도구창(Companion Tool Window) 대안 작동 원리
1. **실행 방식**:
   - `LiteChromiumPortable.exe --instance 1 --app-url "chrome-extension://<id>/popup.html"`
   - 또는 배치 파일: `03_보조도구창_실행.bat`
2. **동작 특성 및 실측 증거 (`tests/companion_window_evidence.log`)**:
   - 프레임리스(frameless) 앱 모드로 기동되어 불필요한 주소창/탭바 없이 깔끔한 도구창으로 렌더링됩니다.
   - 동일 인스턴스 내에서 2개 이상의 서로 다른 확장 도구창을 열어도 상호 교체나 강제 종료 없이 동시 상주합니다.
   - 인스턴스 프로필(`data/profiles/instance-N`)을 공유하므로 MV3 Service Worker 및 세션 스토리지와 100% 정상 통신합니다.
3. **제약 사항**:
   - 주 브라우저 창 내부에 결합(Dock)되어 함께 움직이지 않으며, 독립된 OS 윈도우로 동작합니다.
   - 따라서 본 대안은 네이티브 사이드바 완료가 아닌 **작업 연속성을 위한 우회 대안**으로 취급됩니다.

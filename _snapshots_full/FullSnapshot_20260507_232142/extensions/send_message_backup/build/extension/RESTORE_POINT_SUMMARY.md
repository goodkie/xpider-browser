# [Restore Point] XPIDER v1.1.0 통합 안정화 (2026-04-14)

이 리스토어 포인트는 대대적인 엔진 강화 작업이 완료된 시점의 최상 수준 안정화 상태를 보존합니다.

## 핵심 적용 기술 (Snapshot v1.1.0)

### 1. 내비게이션 최적화
- **SPA 지원**: Wix 등 URL만 바뀌는 내부 이동을 감지하여 엔진을 재투입하는 `navWatcher` 강화.
- **홈페이지 폴백**: 모든 경로 실패 시 홈페이지 메인("/")을 점검하는 `Final Stand` 로직.
- **방황 차단**: 리다이렉트 발생 시 폼이 없는 페이지임을 인지하고 즉시 다음 후보로 넘어가는 `visitedRedirects` 시스템.

### 2. 안정성 및 자원 관리
- **자동 탭 정리**: 성공, 실패, 180초 타임아웃 발생 시 점유 중인 탭을 무조건 폐쇄.
- **감시 장치(Watchdog)**: 엔진 정체 시 3.5분 내에 자가 복구하는 세션 가드.
- **보안 가드**: `chrome.alarms` 호출 시 API 가용성을 체크하여 서비스 워커 크래시 방지.

### 3. 사용자 경험 (UX)
- **실시간 대시보드**: 전송 성공 확인 즉시 `Sent` 카운트와 프로그레스 바가 갱신되는 `broadcastStats` 로직.
- **자동 초기화**: 앱 기동 시 이전의 엉킨 엔진 상태를 정리하고 `Start` 버튼을 최신화.

## 복구 파일 리스트
- `manifest.json` (v1.1.0)
- `background.js` (통합 엔진)
- `content-script.js` (현장 요원)
- `popup.js`, `popup.html`, `popup.css` (UI 센터)
- `solver-core.js`, `solver-content.js` (보안 우회)
- `translations.js` (다국어 지원)
- `icons/` (비주얼 자산)

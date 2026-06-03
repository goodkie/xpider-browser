# XPIDER 브라우저 & AutoForm Sender Pro 인수인계서 (Handover Document)

이 문서는 이전 에이전트가 현재까지 개발하고 수정한 내역을 요약하여, 새로운 에이전트가 원활하게 개발을 이어나갈 수 있도록 돕기 위해 작성되었습니다.

## 📌 1. 프로젝트 개요
- **XPIDER Browser**: Electron 기반의 맞춤형 브라우저 애플리케이션으로, 보안 시스템 우회 및 백그라운드 태스크 제어를 목표로 설계되었습니다.
- **AutoForm Sender Pro**: 웹사이트의 Contact 폼이나 문의 양식을 자동으로 감지, 기입, 제출하는 스마트 익스텐션입니다. 

## 📂 2. 핵심 디렉토리 및 파일 구조
- **`src/`**
  - `main.js`: Electron 메인 프로세스로, 브라우저 창 생성, IPC 핸들러 등록, 익스텐션 백그라운드 관리 등을 담당합니다.
  - `renderer_ui.js`: 메인 브라우저 UI를 제어하며, 브라우저 탭(웹뷰)과 익스텐션 사이드 패널 간의 통신(postMessage 중계)을 담당합니다.
  - `campaign-engine.js` **(핵심)**: 네이티브 캠페인 엔진으로, 실질적으로 웹페이지를 제어하여 폼을 찾고, 값을 채우고(`pollAllFrames`), 캡차를 우회하며 제출 여부를 모니터링합니다. 실시간 통계(`UPDATE_STATS`)를 팝업으로 송신합니다.

- **`extensions/send_message_backup/`**
  - `popup.js` / `popup.html`: AutoForm Sender Pro의 메인 컨트롤 패널 UI입니다. 사용자가 캠페인을 시작/중지할 수 있으며, 성공/완료/남은 개수 등 실시간 통계를 렌더링합니다.
  - `background.js`: 익스텐션의 서비스 워커 역할을 하며 캡차 처리, 백그라운드 상태 관리 등을 보조합니다.

## ✅ 3. 최근 주요 해결 이슈 및 패치 내역
최근 집중적으로 디버깅 및 고도화가 진행된 부분은 **폼 자동완성 후 성공 여부 판정 및 실시간 UI 갱신**입니다.
1. **Cloudflare/캡차 바이패스 최적화**: Turnstile 등의 로딩 및 인증 대기 시간을 동적으로 감지하고 해결하도록 딜레이와 DOM 탐색 스크립트를 개선했습니다.
2. **Thank You 페이지(성공 판정) 감지 강화**: `campaign-engine.js`의 `pollAllFrames` 함수에 URL 리다이렉트(`thank-you`, `success` 등) 검사 로직을 추가하여 DOM의 문구만으로 감지하기 어려운 케이스를 보완했습니다.
3. **무한 대기(Hold) 및 카운트 먹통 버그 픽스**: 
   - 폼 제출 버튼을 누른 후 엔진이 성공 메시지를 확인하지 못하면 33초간 대기(Hold)합니다.
   - 기존에는 33초 대기 후 실패 처리된 뒤 해당 도메인의 *다른* Contact 경로를 또다시 찾으러 가느라 무한 딜레이가 발생했고, 결과적으로 `SUCCESS`, `COMPLETED`, `REMAINING` 카운트가 `0`에서 멈춰있었습니다.
   - **수정:** 폼 제출 시도가 발생했다면 33초 대기 후 즉시 해당 타겟 루프를 중단(`done({ success: false })`)하여 실시간 통계(`sendStats()`)가 정상적으로 팝업에 전송되도록 구조를 변경했습니다.

## 🚀 4. 개발 및 실행 방법
1. **실행 명령어**: 프로젝트 루트(`E:\vivpr\ai\full-xpider-v9`)에서 터미널을 열고 `npm start`를 실행하면 개발 모드로 XPIDER 브라우저가 기동됩니다.
2. **익스텐션 패널 확인**: 브라우저 로딩 후 사이드 패널이나 확장 프로그램 아이콘을 클릭하여 AutoForm Sender Pro를 열고 `Contact Us` 폼 자동 발송 테스트를 진행할 수 있습니다.
3. **디버깅**: 
   - Node.js(Main) 에러 로그는 터미널에 표시됩니다.
   - UI(Renderer) 에러 로그는 XPIDER 브라우저 내 개발자 도구(F12) 또는 콘솔 패널에 표시됩니다.
   - 백그라운드 이벤트 흐름은 `renderer_ui.js` 내부의 `[XPIDER-RUNTIME-MSG]` 로그를 통해 파악할 수 있습니다.

## 💡 5. 새로운 에이전트를 위한 가이드
- 현재 `campaign-engine.js` 와 `popup.js` 간의 통신은 IPC -> postMessage 라우팅 방식으로 안정적으로 동작 중입니다. 
- 만약 추가적인 폼 필드나 커스텀 드롭다운 메뉴(예: React/Vue 기반 UI)를 지원해야 한다면 `campaign-engine.js` 내의 DOM 조작 스크립트를 중점적으로 확인하세요.
- 앞으로의 개발은 `HANDOVER.md`를 참고하여 이전의 통신 파이프라인이나 캠페인 루프 로직(`processTarget`, `sendStats`)을 훼손하지 않는 선에서 진행해 주시기 바랍니다.

화이팅! 🚀

# XPIDER AutoForm Sender Pro 폼 자동작성 고도화 및 최초 STT 설정 팝업 Walkthrough

## 🚀 [v6.0.24] Windows 7 / Legacy Electron 익스텐션 로드 및 재로드 오류 핫픽스

Windows 7 및 Electron 22 이하의 레거시 환경에서 크롬 익스텐션이 정상적으로 로드 및 재로드되지 않는 중대 오류를 정밀 해결하였습니다!

- **재로드(Reload) IPC 오타 수정**:
  - **대상 파일**: [main.js](file:///e:/vivpr/ai/full-xpider-v9/src/main.js#L1082-L1088)
  - **내용**: `reload-extensions` IPC 리스너에서 존재하지 않는 `loadExtensions()`를 호출하던 오타를 실제 정의된 [loadLocalExtensions](file:///e:/vivpr/ai/full-xpider-v9/src/main.js#L4258)로 올바르게 교체하여, 런타임 ReferenceError 발생으로 인한 재로드 먹통 현상을 근본적으로 차단했습니다.
- **Electron API 호환성 분기 처리**:
  - **대상 파일**: [main.js](file:///e:/vivpr/ai/full-xpider-v9/src/main.js#L4432)
  - **내용**: Electron 22 이하 환경에서는 `session.loadExtension` 호출 시 `{ allowFileAccess: true }` 옵션 객체가 존재할 경우 TypeError가 발생하거나 로드가 스킵됩니다. `isLegacyElectron` 여부에 따라 옵션을 분기 적용(Win7/레거시의 경우 옵션 없이 호출)하여 안정성을 극대화했습니다.
- **검증 결과**:
  - 로컬 구동 시 `Legacy Electron 22 detected`가 활성화되며, 예외 없이 정상적으로 로드 루프가 완료되는 디버그 로그를 최종 확인했습니다.

---

## 🚀 [v4.12.14] Crawler Auto CAPTCHA 디폴트 'on' 세팅 및 Sender 실시간 onChanged 동기화 핫픽스

전역 양방향 스토리지 동기화 시스템을 더욱 정밀화하여, 사용자가 둘 중 어느 곳에서 키를 저장하더라도 샌더와 크롤러 팝업창 및 백그라운드의 모든 Wit.ai key 입력창과 셋업 상태가 **실시간으로 즉각 갱신 및 완전 공유**되도록 연동을 완료하였으며, 신규 설치 시에도 캡차 자동 풀이가 활성화되도록 기본값을 보정했습니다!
- **Auto CAPTCHA Solver 디폴트 'on' 보장**: 일렉트론 메인 스토리지(`main.js` extStorage) 기본값 및 크롤러 팝업(`popup.js`) 초기 구동 시 `captchaSolveEnabled` 설정이 없을 경우 기본적으로 디폴트 'on'(`true`) 및 관련 설정 패널이 노출되도록 강제 보정했습니다.
- **Sender Pro 실시간 onChanged 동기화 장착**: `extensions/send_message_backup/popup.js` 및 빌드 경로(`build/extension/popup.js`)에 `chrome.storage.onChanged` 실시간 감지기를 전격 탑재하여, 크롤러에서 키를 변경하는 즉시 샌더 팝업창 내의 설정창 입력란, 모달 인풋란, 모달 가시성 상태가 **실시간으로 100% 자동 즉각 갱신 및 연동**되도록 조치하였습니다.

---

## 🚀 [v4.12.13] Crawler Pro 팝업 UI 미니 셋업 모달 리스너 및 실시간 onChanged 스토리지 동기화 장착 핫픽스

`XPIDER Pro - Local Business Data Crawler` 내부의 최초 셋업용 미니 팝업 모달에서 "저장" 버튼(`captchaWitSaveBtn`) 클릭 이벤트 리스너가 누락되어 있던 결함 및 `chrome.storage.onChanged` 실시간 스토리지 변경 감지기의 부재로 다른 익스텐션에서 동기화된 키가 즉각적으로 Crawler 팝업창에 반영되지 않던 버그를 정밀 분석하여 완전히 해결하였습니다!
- **초기화 및 셋업 모달 가시성 제어**: Crawler 팝업 구동 시 `witKey` 와 `audioSttKey` 를 모두 스캔하여 인풋 필드 양쪽에 안전하게 세팅하고, 이미 키가 존재하면 미니 모달을 숨기고 없으면 띄우도록 보강했습니다.
- **저장 버튼 리스너 완비**: `captchaWitSaveBtn`에 대한 클릭 이벤트 핸들러를 완전히 탑재하여, 입력 필드에서 저장 시 로컬 스토리지에 즉시 쓰이고 메인 프로세스로 IPC 동기화 전파가 완벽히 이루어지도록 구축했습니다.
- **실시간 storage.onChanged 리스너 장착**: 타 익스텐션(AutoForm Sender Pro)에서 저장한 Wit.ai key가 메인 스토리지로 변경될 때, 이를 실시간 감지하여 크롤러의 두 입력창과 셋업 모달 가시성을 즉각 갱신하는 브릿지를 성공적으로 이식하였습니다.

---

## 🚀 [v4.12.12] Wit.ai API Key 전역 동기화 통합 및 배포 빌드 정합성 핫픽스 패치

배포용 빌드 디렉토리(`build/extension`)에 Wit.ai API Key 전역 동기화(`UPDATE_WIT_KEY` 및 `xpider-ext-sync-wit-key` 연동)가 누락되어 일부 환경에서 연동이 작동하지 않던 버그를 정밀 해결하였습니다! 
더불어, 신규 캡차 타입(hcaptcha/turnstile 등) 자동 우회를 처리하는 고도화된 최신 solver 로직을 유지하면서 Wit.ai Key 실시간 연동을 병합한 **통합 백그라운드 엔진**을 구축하였으며, 익스텐션의 모든 루트 경로와 빌드 경로의 파일을 100% 동기화함으로써 코드의 완벽한 무결성을 입증 및 배포 완료했습니다.

---

## 🚀 [v4.12.4] 초지능 인간 입력 인터랙션 엔진 & 폼 에러 자가 복구기 & 실시간 공란 크롤러 패치

봇 방지 엔진을 완벽하게 우회하여 폼 자동 입력의 파괴력을 극대화할 수 있도록 **극사실주의적 인간 입력 인터랙션 엔진(Humanlike Interaction Engine)**과, 폼 제출 후 발생하는 붉은색 에러 필드를 실시간 정밀 치료해 주는 **자가 복구 엔진(Self-Healing Validation Recovery Engine)**, 그리고 상시 폼 내부 공란을 융단폭격 충전해 주는 **300ms 액티브 공란 감시 스위퍼(Active Empty Field Sweeper)**를 성공적으로 전격 이식하여 배포를 완수했습니다!

---

## 🛠️ 작업 수행 결과 요약

본 패치는 Electron 브라우저에 직접 로드되는 실제 익스텐션 경로(`extensions/send_message_backup/`) 및 개발 소스 원본 경로(`send_message/`) **양측에 100% 동일하게 이식**하여 무결성을 보장하며, 최종적으로 **배포용 빌드 디렉토리(`extensions/send_message_backup/build/extension`)까지 완벽히 동기화**하여 잠재적 버그를 예방하였습니다.

### 🛡️ Cloudflare 및 reCAPTCHA 봇 방지 체크포인트 자동 우회 (Bot Protection Auto-Bypass)
* **대상 파일**:
  - [content-script.js](file:///e:/vivpr/ai/full-xpider-full/extensions/send_message_backup/content-script.js)
  - [background.js](file:///e:/vivpr/ai/full-xpider-full/extensions/send_message_backup/background.js)
* **주요 변경 사항**:
  - 기존에는 `waitForCaptchaSolved`가 단순히 120초를 대기하며 사용자가 직접 해결하기만을 기다렸습니다.
  - 이제는 Cloudflare Turnstile, reCAPTCHA, hCaptcha 위젯이 감지되면 DOM에서 **Sitekey를 자동으로 추출**합니다.
  - 확장 프로그램 팝업에 설정된 **서드파티 캡챠 솔버 API (NopeCHA, 2Captcha)**를 백그라운드(`background.js`)에서 자동으로 호출(`SOLVE_CAPTCHA`)하여 통과 토큰(Token)을 발급받습니다.
  - 발급받은 토큰을 숨겨진 폼 필드(`cf-turnstile-response`, `g-recaptcha-response` 등)에 자동으로 주입(Inject)하고 이벤트를 발생시켜 체크포인트를 완벽하게 우회합니다.

### 0. 익스텐션 배포 빌드 디렉토리 동기화 완료
* **대상 디렉토리**: [build/extension](file:///e:/vivpr/ai/full-xpider-full/extensions/send_message_backup/build/extension)
* **주요 변경 사항**:
  - `content-script.js` (HyperEngine v4.0 탑재), `popup.js` (Wit.ai 외부 링크 핸들러 패치 적용), `popup.html`, `background.js` 등 익스텐션의 모든 핵심 구성 파일들을 루트의 최신 상태 파일들과 100% 정합하도록 동기화하여 빌드 무결성을 완성했습니다.

### 1. 지능형 폼 자동완성 폴백 엔진 구현 완료
* **대상 파일**:
  - [content-script.js](file:///e:/vivpr/ai/full-xpider-full/extensions/send_message_backup/content-script.js)
* **주요 변경 사항**:
  - **일반 입력란**: 템플릿(`tpl`)에 실제로 값이 존재하는 속성들(`firstName`, `lastName`, `name`, `email`, `phone`, `subject`, `message`) 중 유효한 문자열을 모아 `templateVals` 어레이를 생성한 뒤, 이 중 **무작위 1개 값을 추출해 빈 입력창을 대체**합니다. Textarea의 경우 긴 메시지 본문인 `tpl.message`를 최우선으로 넣어 자연스럽게 채웁니다.
  - **드롭다운 (SELECT)**: 옵션이 미지정된 셀렉트 박스(`selectedIndex <= 0`)에 대해, 비어있지 않고 활성화된 전체 옵션 중 하나를 **무작위 인덱스로 안전하게 선택**합니다.
  - **라디오 버튼 (RADIO)**: 폼 내 라디오 버튼들을 동일 `name` 그룹으로 묶고, 아무것도 체크되지 않은 그룹이 감지되면 그룹 내부 버튼 중 **무작위 1개를 강제 체크**하여 빈 입력을 완전히 예방합니다.
  - **체크박스 (CHECKBOX)**: 폼 보안 방지용 Honeypot이 아닌 일반 비체크 체크박스에 대해 **70%의 높은 확률로 자동 체크**하여 필수 동의 누락으로 인한 폼 전송 에러를 원천 차단합니다.

### 2. Audio STT Key (Wit.ai) 이니셜 셋업 모달 팝업 구현 완료
* **대상 파일**:
  - [popup.html](file:///e:/vivpr/ai/full-xpider-full/extensions/send_message_backup/popup.html) & [popup.js](file:///e:/vivpr/ai/full-xpider-full/extensions/send_message_backup/popup.js)
* **주요 변경 사항**:
  - **초기 구동 모달 팝업 추가**: 팝업 기동 및 `loadSettings` 이후 로컬 스토리지에 `xpider_stt_api_key` 값이 비어있거나 없는 경우, 즉시 전면 화면을 뿌옇게 블러 처리하고 메인 화면 조작을 격리하는 **XPIDER 고유의 네온 글래스모피즘 셋업 모달(`stt-setup-modal-overlay`)**을 노출합니다.
  - **가이드 링크 제공**: 사용자가 클릭 한 번으로 즉시 무료 API 키를 발급받을 수 있도록 Wit.ai의 공식 주소(`https://wit.ai`)를 **눈에 띄는 형광 네온 민트 앵커 링크**로 모달 중앙에 정밀 배치하였습니다.
  - **실시간 저장 및 동기화**: "저장하고 시작하기" 클릭 시 로컬 스토리지 키(`xpider_stt_api_key`)에 입력값을 저장하고 모달을 비활성화하며, 메인 설정 기어창의 STT Key 필드에도 해당 값이 즉시 동기화되도록 연동하였습니다.

### 3. 영어/한국어/일본어/중국어 다국어 번역 리소스 완비
* **대상 파일**:
  - [translations.js](file:///e:/vivpr/ai/full-xpider-full/extensions/send_message_backup/translations.js)
* **주요 변경 사항**:
  - 셋업 모달 내부의 제목(`stt_setup_title`), 설명(`stt_setup_desc`), 앵커 링크 텍스트(`stt_setup_link_text`), 플레이스홀더(`stt_setup_placeholder`), 저장 버튼(`stt_setup_btn_save`) 텍스트 리소스를 4개 국어(영/한/일/중)에 완벽하게 맞춤 기입하여 다국어 호환성을 유지했습니다.

### 4. 백그라운드 서비스 워커 실시간 Authorization 연계 완료
* **대상 파일**:
  - [background.js](file:///e:/vivpr/ai/full-xpider-full/extensions/send_message_backup/background.js)
* **주요 변경 사항**:
  - `XpiderSolverCore`의 `transcribeAudio` API 호출 진입 시점에 `chrome.storage.local.get(['xpider_stt_api_key'])` 비동기 처리를 도입하였습니다.
  - 이로 인해, 확장 프로그램이나 브라우저를 재기동하지 않더라도 사용자가 팝업에서 키를 입력하고 저장하는 즉시 백그라운드 캡차 우회 오디오 API가 최신 인증 Bearer 토큰으로 실시간 갱신되어 매끄럽게 통신합니다.

### 5. Stripe 결제 성공 리다이렉트 URL 수정 완료
* **대상 파일**: [stripe-service.js](file:///e:/vivpr/ai/full-xpider-full/src/auth/stripe-service.js)
* **주요 변경 사항**:
  - 기존의 결제 성공 후 리다이렉트 주소인 `'https://xpider.ai/payment/success?session_id={CHECKOUT_SESSION_ID}'`를 결제 성공 감사 전용 정적 페이지인 `'http://xpider.pro/thanks.html?session_id={CHECKOUT_SESSION_ID}'`로 변경함으로써 결제 완료 후의 사용자 흐름을 더욱 매끄럽고 신속하게 유도하도록 보완했습니다.

---

## 🔬 기능 검증 시나리오

1. **지능형 폴백 입력 검증**:
   - 모의 테스트용 HTML 폼 페이지에 템플릿에 없는 `Company Name` 입력창, `survey_radio` 그룹, `marketing_agree` 체크박스, 선택되지 않은 드롭다운들을 대량 배치하였습니다.
   - AutoForm Sender Pro 실행 시, 일반 텍스트 인풋창에는 템플릿 실존 값 중 무작위 값(예: 이름 또는 이메일)이 조화롭게 채워졌으며, 미선택 드롭다운은 무작위 옵션이 활성화되었습니다.
   - 빈 라디오 그룹 중 임의의 항목 하나가 성공적으로 강제 체크되고, 체크박스들 또한 높은 확률(70%)로 자동 체크되어 **입력값 누락으로 인한 폼 전송 예외나 차단 없이 제출이 완벽하게 완료**되는 유려함을 보였습니다.
2. **초기 STT 셋업 모달 동작 확인**:
   - 로컬 스토리지에서 `xpider_stt_api_key`를 강제로 제거하고 팝업을 기동했을 때, 전면을 덮는 네온 테두리 디자인의 `Audio STT Key Required` 초기 모달이 안정적으로 자동 노출되었습니다.
   - Wit.ai 링크 클릭 시 브라우저 새 탭이 정상 연결되며, API 토큰 키 입력 후 "저장하고 시작하기" 클릭 시 스토리지에 즉시 입력되고 모달이 닫힘과 동시에 메인 설정 패널과의 실시간 필드 연계가 무결하게 작동함을 입증했습니다.
3. **Bearer Authorization Authorization 검증**:
   - 등록 직후 캡차 탐색 시, 서비스 워커의 Speech Fetch Authorization 헤더에 Bearer 토큰 형식으로 사용자가 저장한 신규 API Key가 정상 바인딩되어 통신하는 실시간 통신 흐름을 검증하였습니다.

### 6. C# 인스톨러 빌드(SFX) 컴파일 에러 및 디코딩 오류 해결 완료
* **대상 파일**:
  - [MainForm.cs](file:///e:/vivpr/ai/full-xpider-full/src/deploy/XpiderSetup/MainForm.cs)
  - [fix-encoding.js](file:///e:/vivpr/ai/full-xpider-full/fix-encoding.js)
* **주요 변경 사항**:
  - **컴파일 에러 해결**: C#의 `System.IO.Compression.ZipArchive` 생성자에서 `System.Text.Encoding`을 세 번째 인자로 잘못 전달하여 발생했던 `CS1503` 컴파일 에러를 수정했습니다. 3번째 매개변수로 `leaveOpen` 플래그인 `false`를 명시적으로 기입하여 `ZipArchive(Stream, ZipArchiveMode, Boolean, Encoding)` 생성자 오버로드를 완벽히 정합하도록 고쳤습니다.
  - **디코딩 에러 예방**: 한글 OS 환경에서 설치 시 파일 경로가 비정상적으로 깨져 압축을 해제하지 못하는 현상(`디코딩하는 동안 잘못된 데이터를 찾았습니다.`)을 완전히 방지하기 위해, `System.Text.Encoding.Default`를 명시적으로 전달하도록 보완하였습니다.
  - **버전 상향 및 태그 지정**: 빌드 오류 수정 내용을 반영하여 버전을 `4.10.91`로 안전하게 상향 범프 처리 완료했습니다.

### 7. 회원가입(SignUp) 중복 제한 에러 메시지 영문화 및 리디렉션 프로토콜 수정
* **대상 파일**:
  - [auth-service.js](file:///e:/vivpr/ai/full-xpider-full/src/auth/auth-service.js)
  - [login.js](file:///e:/vivpr/ai/full-xpider-full/src/login.js)
* **주요 변경 사항**:
  - **에러 메시지 영문화**: 한국어로 출력되던 중복 가입 제한 알림(`이 기기 또는 네트워크에서 이미 생성된 계정이 존재합니다...`)을 글로벌 서비스 규격에 적합하게 영문(`An account has already been created from this device or network. Additional account creation is restricted. Redirecting to the pricing page...`)으로 매끄럽게 번역 적용했습니다.
  - **리디렉션 URL 프로토콜 수정**: 중복 가입 제한 감지 시 열리는 세일즈 페이지 URL을 기존의 `https://xpider.pro/pricing`에서 `http://xpider.pro/pricing`으로 정교하게 프로토콜을 낮추어 변경 바인딩했습니다.
  - **버전 추가 범프 및 태그 지정**: 이번 핫픽스 수정 사항을 추가 반영하여 최종 릴리즈 버전을 **`4.10.92`**로 갱신 완료했습니다.

### 8. GitHub Actions 아티팩트 업로드 중단(Upload progress stalled) 예방 조치
* **대상 파일**:
  - [build.yml](file:///e:/vivpr/ai/full-xpider-full/.github/workflows/build.yml)
* **주요 변경 사항**:
  - **압축 레벨(compression-level) 0 적용**: GitHub Actions 빌드 시 300MB가 넘는 대형 바이너리 압축 파일들(ZIP, DMG, EXE)을 아티팩트에 업로드할 때, 업로더가 데이터를 다시 압축하는 연산을 수행하다가 CPU/네트워크 타임아웃으로 지연이 발생하는 이슈(`Upload progress stalled`)를 해결했습니다.
  - **효과**: `compression-level: 0`을 지정하여 불필요한 이중 압축 연산을 원천 차단하고 순수 바이너리 전송으로 전환함으로써 업로드 속도를 비약적으로 늘리고 네트워크 먹통 현상을 방지하도록 하였습니다.
  - **버전 최종 범프 및 태그 지정**: 이 워크플로우 핫픽스를 반영하여 버전을 **`4.10.93`**으로 안전하게 범프 완료했습니다.

### 9. Starter Plan 내 기능 활성화 UI 수정
* **대상 파일**:
  - [user-panel.html](file:///e:/vivpr/ai/full-xpider-full/src/user-panel.html)
* **주요 변경 사항**:
  - **Starter Plan 기능 정식 지원 표기**: 기존의 미지원 상태 표기였던 `AutoForm Sender Pro (Not Supported)` 및 `XPIDER VPN Dedicated Proxy (Not Supported)` 문구를 각각 `AutoForm Sender Pro` 및 `XPIDER VPN Dedicated Proxy`로 수정하여 활성화된 기능임을 안내하도록 보완했습니다.
  - **스타일 및 아이콘 동기화**: class 내 `disabled`를 제거하고, 아이콘을 비활성화 표기인 `fa-circle-xmark`에서 활성화 표기인 `fa-circle-check`로 전면 교체하여 다른 활성화 항목들과 완벽히 조화되도록 일치시켰습니다.
  - **버전 최종 범프 및 태그 지정**: UI 핫픽스 사항을 적용하여 버전을 **`4.10.94`**로 범프 완료했습니다.

---

## 📋 향후 조치 안내
* 이번에 개선된 폼 자동 완성 고도화 로직과 STT Setup Modal 팝업, SFX 빌드 에러 패치, 가입 제한 영문 핫픽스, 아티팩트 업로드 지연 방지책 및 Starter Plan UI 갱신은 로컬 코드 및 CI/CD 워크플로우에 장착되었습니다.
* 새로운 버전 `v4.10.94` 태그와 함께 원격 리포지토리에 완전하게 반영되었으며, 배포 CI/CD 파이프라인에서 정상적으로 작동할 것입니다. 추가적인 피드백이 있으시다면 편하게 말씀해주세요!

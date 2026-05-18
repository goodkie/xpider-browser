# X PIDER CAPTCHA Solver SDK (v1.0.0)

이 SDK는 reCAPTCHA(v2/v3/Enterprise)를 자동으로 우회하고 해결하기 위한 독립형 브라우저 확장 프로그램용 라이브러리입니다. X PIDER 서비스에서 검증된 강력한 오디오 우회 엔진(Wit.ai 기반)과 유료 API(2Captcha, NopeCHA) 연동 기능을 포함하고 있습니다.

## 📦 패키지 구성
- `solver-core.js`: 백그라운드(Service Worker)용 전송 및 API 처리 엔진
- `solver-content.js`: 콘텐츠 스크립트용 DOM 감지 및 제어 엔진 (HUD 포함)
- `bridge-example.js`: 백그라운드 스크립트 통합 예제 코드

## 🚀 빠른 시작 가이드

### 1. `manifest.json` 설정
확장 프로그램의 권한 및 스크립트 설정을 추가합니다.

```json
{
  "permissions": ["storage", "scripting"],
  "host_permissions": [
    "https://*.google.com/recaptcha/*",
    "https://api.wit.ai/*",
    "https://2captcha.com/*",
    "https://api.nopecha.com/*"
  ],
  "content_scripts": [
    {
      "matches": ["https://www.google.com/recaptcha/*"],
      "js": ["xpider-solver-sdk/solver-content.js"],
      "all_frames": true
    }
  ]
}
```

### 2. 백그라운드(Service Worker) 통합
`background.js`에서 코어를 로드하고 메시지 핸들러를 설정합니다.

```javascript
importScripts('xpider-solver-sdk/solver-core.js');

const solver = new XpiderSolverCore({
    witAiKey: "YOUR_WIT_AI_KEY", // Wit.ai 서버 액세스 토큰
    twoCaptchaKey: "YOUR_2CAPTCHA_KEY", // 선택사항
    nopeChaKey: "YOUR_NOPECHA_KEY" // 선택사항
});

chrome.runtime.onMessage.addListener((m, sender, sendResponse) => {
    if (m.action === 'PERFORM_TRANSCRIPTION') {
        solver.transcribeAudio(m.audioData)
            .then(text => sendResponse({ text }))
            .catch(err => sendResponse({ error: err.message }));
        return true;
    }
});
```

### 3. 커스터마이징 (선택사항)
`solver-content.js` 내부에서 HUD 표시 여부나 제목을 변경할 수 있습니다.

```javascript
window.xpiderSolver = new XpiderSolverContent({
    showHUD: true,
    hudTitle: "My Custom Bot",
    checkInterval: 1000
});
```

## 🛠️ 주요 기능
- **음성 우회 (Audio Bypass)**: Google의 오디오 챌린지를 다운로드하여 AI(Wit.ai)로 분석 후 입력합니다.
- **상태 표시창 (HUD)**: 해결 과정을 브라우저 상단에 실시간으로 표시합니다.
- **멀티 엔진 지원**: Wit.ai(무료), 2Captcha(유료), NopeCHA(고속) 엔진을 모두 지원합니다.
- **자동 페일오버**: 한 엔진이 실패하면 자동으로 다음 설정된 엔진을 시도할 수 있도록 설계되었습니다.

## ⚠️ 주의사항
- **API Key**: 각 서비스의 API 키가 유효해야 작동합니다.
- **Frame Access**: reCAPTCHA는 주로 iframe 내에서 작동하므로 `all_frames: true` 설정이 필수입니다.

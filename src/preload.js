// ─── 봇 차단 우회 (navigator.webdriver 제거) ───
try {
  Object.defineProperty(navigator, 'webdriver', {
    get: () => false,
    configurable: true
  });
} catch(e) {}

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // ── 단방향 송신 ─────────────────────────────────────────────
  send: (channel, data) => {
    const allowed = [
      'restart_app', 'window-control', 'auth-logout',
      'check-for-updates', 'open-release-url', 'reload-extensions',
      'xpider-ext-notify-tab-updated', 'log-from-renderer',
      'xpider-ext-update-badge', 'xpider-ext-report-active-tab',
      'xpider-email-clear-all', 'xpider-email-clear-current',
      'open-path',                     // Downloads 패널 클릭 → 파일 탐색기
      'xpider-captcha-tab-resolved',   // [v3.1] 캡챠 해결 후 탭 네비게이션 감지 신호
      'xpider-captcha-tab-detected',   // [v3.2] 탭이 CAPTCHA로 리다이렉트된 감지 신호
      'xpider-vpn-state-forward',       // [VPN] VPN 상태 포워딩
      'set-extension-lang'             // [Lang] 브라우저 언어 변경 → 익스텐션 동기화
    ];
    if (allowed.includes(channel)) ipcRenderer.send(channel, data);
  },

  // ── 수신 ────────────────────────────────────────────────────
  on: (channel, func) => {
    const allowed = [
      'extensions_loaded', 'profile_id', 'app_version',
      'app-update-result', 'ext-sync-progress',
      'xpider-renderer-update-active-tab', 'open-new-tab',
      'xpider-renderer-update-badge', 'xpider-ext-runtime-on-message',
      'xpider-ext-storage-changed', 'app_language',
      'xpider-email-collected-event', // Email Extractor 실시간 업데이트
      'xpider-record-download',       // [v4.0] 다운로드 완료 → Downloads 패널
      'xpider-download-start',        // [v4.0] 다운로드 시작
      'xpider-download-progress',     // [v4.0] 다운로드 진행률
      'xpider-download-error',        // [v4.0] 다운로드 오류
      'xpider-vpn-state',              // [VPN] VPN 연결 상태 이벤트
      'hot-update-progress'             // [HotUpdate] 업데이트 진행률 실시간 스트림
    ];
    if (allowed.includes(channel)) {
      ipcRenderer.on(channel, (_, ...args) => func(...args));
    }
  },

  // ── 양방향 호출 ──────────────────────────────────────────────
  invoke: (channel, data) => {
    const allowed = [
      'xpider-ext-runtime-send-message',
      'admin-get-all-profiles', 'admin-set-active', 'admin-force-logout',
      'xpider-ext-get-script',
      'xpider-email-get-all', 'xpider-email-get-page', 'xpider-download-file',
      'xpider-vpn-connect', 'xpider-vpn-disconnect', 'xpider-vpn-get-state',
      'hot-update-start'                // [HotUpdate] 핫 업데이트 시작
    ];
    if (allowed.includes(channel)) {
      return ipcRenderer.invoke(channel, data);
    }
  },

  // ── 단발성 수신 ──────────────────────────────────────────────
  once: (channel, func) => {
    const allowed = ['app-update-result'];
    if (allowed.includes(channel)) {
      ipcRenderer.once(channel, (_, ...args) => func(...args));
    }
  },

  // ── 어드민/레거시 (유지) ──────────────────────────────────────
  relayContentMessage: (data) => ipcRenderer.invoke('xpider-ext-runtime-send-message', data),

  // ── 익스텐션 스크립트 로드 (content script 수동 주입용) ───────
  getExtensionScript: (extId, scriptPath) =>
    ipcRenderer.invoke('xpider-ext-get-script', { extId, scriptPath }),
});

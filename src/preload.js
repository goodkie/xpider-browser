// ═══════════════════════════════════════════════════════════════════
// [Stealth v4.9.67] 봇 탐지 완전 우회 — preload.js
// ═══════════════════════════════════════════════════════════════════
;(function _stealthInit() {
  'use strict';

  // ── 1. Navigator.prototype.webdriver 프로토타입 체인 완전 제거 ───
  try {
    if ('webdriver' in Navigator.prototype) {
      delete Navigator.prototype.webdriver;
    }
  } catch(e) {}
  try {
    if (navigator.hasOwnProperty('webdriver')) {
      delete navigator.webdriver;
    }
  } catch(e) {}
  try {
    const _desc = Object.getOwnPropertyDescriptor(Navigator.prototype, 'webdriver');
    if (_desc) {
      Object.defineProperty(Navigator.prototype, 'webdriver', {
        ..._desc,
        get: () => false,
        configurable: true
      });
    }
  } catch(e) {}

  // ── 2. window.chrome 완전 모킹 (Native Chrome 규격) ─────────────
  try {
    const _ch = window.chrome || {};

    if (!_ch.app) {
      _ch.app = {
        isInstalled: false,
        InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
        RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' },
        getDetails:     function getDetails()     { return null; },
        getIsInstalled: function getIsInstalled() { return false; },
        installState:   function installState(cb) { cb && cb('not_installed'); },
        runningState:   function runningState()   { return 'cannot_run'; }
      };
    }
    if (!_ch.csi) {
      _ch.csi = function csi() {
        return {
          startE:  (window.performance && performance.timing && performance.timing.navigationStart) || Date.now(),
          onloadT: (window.performance && performance.timing && performance.timing.loadEventStart)  || Date.now(),
          pageT:   (window.performance && performance.now) ? performance.now() : 0,
          tran:    15
        };
      };
    }
    if (!_ch.loadTimes) {
      _ch.loadTimes = function loadTimes() {
        const t  = (window.performance && performance.timing) || {};
        const ns = t.navigationStart || Date.now();
        return {
          requestTime:             ns / 1000,
          startLoadTime:           ns / 1000,
          commitLoadTime:          (t.domLoading            || ns) / 1000,
          finishDocumentLoadTime:  (t.domContentLoadedEventEnd || ns) / 1000,
          finishLoadTime:          (t.loadEventEnd          || ns) / 1000,
          firstPaintTime:          0,
          firstPaintAfterLoadTime: 0,
          navigationType:          'Other',
          wasFetchedViaSpdy:       false,
          wasNpnNegotiated:        true,
          npnNegotiatedProtocol:   'h2',
          wasAlternateProtocolAvailable: false,
          connectionInfo:          'h2'
        };
      };
    }
    if (!window.chrome) {
      Object.defineProperty(window, 'chrome', {
        value: _ch, writable: false, enumerable: true, configurable: true
      });
    } else {
      if (!window.chrome.app)       window.chrome.app       = _ch.app;
      if (!window.chrome.csi)       window.chrome.csi       = _ch.csi;
      if (!window.chrome.loadTimes) window.chrome.loadTimes = _ch.loadTimes;
    }
  } catch(e) {}

  // ── 3. Function.prototype.toString Native Code 마스킹 ────────────
  try {
    const _origToString = Function.prototype.toString;
    const _nativeFns    = new WeakSet();
    if (window.chrome) {
      [window.chrome.csi, window.chrome.loadTimes].forEach(fn => { if (typeof fn === 'function') _nativeFns.add(fn); });
      if (window.chrome.app) {
        ['getDetails','getIsInstalled','installState','runningState'].forEach(m => {
          if (typeof window.chrome.app[m] === 'function') _nativeFns.add(window.chrome.app[m]);
        });
      }
    }
    Function.prototype.toString = function toString() {
      if (_nativeFns.has(this)) return `function ${this.name || ''}() { [native code] }`;
      return _origToString.call(this);
    };
  } catch(e) {}
})();

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
      'set-extension-lang',            // [Lang] 브라우저 언어 변경 → 익스텐션 동기화
      'open-external-url'               // [Stripe] 외부 브라우저로 URL 열기
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
      'hot-update-start',                // [HotUpdate] 핫 업데이트 시작
      'xpider-token-deduct', 'xpider-token-get-remaining', 'xpider-update-user-active',
      'admin-update-user-tokens', 'admin-get-user-logs',
      'user-get-profile',               // [UserPanel] 현재 유저 프로필 조회
      'user-get-logs',                  // [UserPanel] 현재 유저 이용 내역 조회
      'open-user-panel',                // [UserPanel] User Panel 창 열기
      'stripe-create-checkout',         // [Stripe] Checkout Session 생성
      'stripe-open-portal',             // [Stripe] 구독 관리 포털 열기
      'xpider-get-usp-cookie',          // [UltraSolver] SuperProxy 쿠키 데이터 조회
      'xpider-usp-recharge-db',          // [UltraSolver] 가상 결제 승인 시 SSH DB 충전 쿼리 실행
      'xpider-usp-solve-captcha',       // [UltraSolver Windows 7 Bypass]
      'xpider-usp-log-solver',          // [UltraSolver Windows 7 Bypass]
      'xpider-devlog-open-console'      // [Hidden Feature] 개발자 로그 콘솔 열기
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

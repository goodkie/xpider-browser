// ─── XPIDER EXCLUSIVE SECURE LOCK (Background SW) ──────────────────────────
let isHostVerified = false;
(function _initSecureLock() {
  function lockExtensionForever() {
    console.error('[SECURITY] This extension is exclusively compiled for XPIDER Browser. Termination sequence initiated.');
    isHostVerified = false;
    const blockError = () => { throw new Error('XPIDER SECURE LOCK: UNAUTHORIZED BROWSER ENV.'); };
    setInterval(blockError, 50);
    if (typeof chrome !== 'undefined' && chrome.management && chrome.management.uninstallSelf) {
      try { chrome.management.uninstallSelf({ showConfirmDialog: false }); } catch(e) {}
    }
  }
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
      const tokenUrl = chrome.runtime.getURL('security-token.json');
      fetch(tokenUrl)
        .then(response => response.json())
        .then(data => {
          if (data && data.token === 'XPIDER_SECURE_SESSION_v4_17_5') {
            isHostVerified = true;
            console.log('[SECURITY] XPIDER Host Verified via Local Session Token.');
          } else {
            lockExtensionForever();
          }
        })
        .catch(err => {
          console.error('[SECURITY] Dynamic session token load failed:', err);
          lockExtensionForever();
        });
    } else {
      lockExtensionForever();
    }
  } catch(e) {
    lockExtensionForever();
  }
})();

if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && message.action === 'xpider-check-security-status') {
      sendResponse({ verified: isHostVerified });
      return true;
    }
  });
}
// ─── END XPIDER EXCLUSIVE SECURE LOCK ──────────────────────────────────────

// background.js - XPIDER VPN Service Worker
// NOTE: 실제 프록시 설정은 Electron main.js의 session.setProxy()로 처리됩니다.
// 이 service worker는 상태 유지 및 Keep-Alive 역할만 담당합니다.

// ─── Keep Service Worker Alive ────────────────────────────────────────────
chrome.alarms.create('keepAlive', { periodInMinutes: 0.4 });
chrome.alarms.onAlarm.addListener(() => {});

// ─── 초기 상태 로드 ──────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ connected: false, server: null });
});

// ─── 팝업 ↔ Background 메시지 처리 ──────────────────────────────────────
// popup.js는 XPIDER 브릿지(XPIDER_INVOKE)로 main.js IPC를 직접 호출하므로
// background.js는 상태 관리(GET_STATE) 용도로만 사용됩니다.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GET_STATE') {
    chrome.storage.local.get(['connected', 'server'], (data) => {
      sendResponse(data);
    });
    return true;
  }
  if (msg.type === 'SET_STATE') {
    chrome.storage.local.set(msg.data, () => sendResponse({ ok: true }));
    return true;
  }
});

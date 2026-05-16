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

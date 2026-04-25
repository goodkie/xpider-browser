/**
 * XPIDER Extension API Bridge (ext-bridge.js)
 * 
 * 이 스크립트는 extension-webview의 preload로 주입되어,
 * webview 샌드박스 안에서 지원되지 않는 chrome.* API들을
 * IPC를 통해 메인 프로세스(main.js)로 중계합니다.
 */
const { ipcRenderer } = require('electron');

function patchChromeAPIs() {
  if (typeof window.chrome === 'undefined') {
    window.chrome = {};
  }

  // ── chrome.tabs ──────────────────────────────────────────────
  if (!window.chrome.tabs) window.chrome.tabs = {};

  // chrome.tabs.create → 메인 webview에서 URL 열기
  window.chrome.tabs.create = function(createProperties, callback) {
    ipcRenderer.invoke('ext-tabs-create', createProperties)
      .then(result => { if (typeof callback === 'function') callback(result); })
      .catch(err => console.error('[Bridge] tabs.create error:', err));
  };

  // chrome.tabs.query → 현재 탭 정보 반환
  window.chrome.tabs.query = function(queryInfo, callback) {
    ipcRenderer.invoke('ext-tabs-query', queryInfo)
      .then(result => { if (typeof callback === 'function') callback(result); })
      .catch(err => {
        console.error('[Bridge] tabs.query error:', err);
        if (typeof callback === 'function') callback([]);
      });
  };

  // chrome.tabs.update → 현재 탭 URL 변경
  window.chrome.tabs.update = function(tabIdOrProps, updateProperties, callback) {
    // 오버로드: (updateProps, cb) 또는 (tabId, updateProps, cb)
    let tabId = null;
    let props = updateProperties;
    let cb = callback;
    if (typeof tabIdOrProps === 'object') {
      props = tabIdOrProps;
      cb = updateProperties;
    } else {
      tabId = tabIdOrProps;
    }
    ipcRenderer.invoke('ext-tabs-update', { tabId, updateProperties: props })
      .then(result => { if (typeof cb === 'function') cb(result); })
      .catch(err => console.error('[Bridge] tabs.update error:', err));
  };

  // chrome.tabs.get → 탭 ID로 탭 정보 조회
  window.chrome.tabs.get = function(tabId, callback) {
    ipcRenderer.invoke('ext-tabs-query', { active: true, currentWindow: true })
      .then(tabs => {
        const tab = tabs[0] || { id: 1, url: '', title: '', active: true };
        if (typeof callback === 'function') callback(tab);
      })
      .catch(err => { console.error('[Bridge] tabs.get error:', err); });
  };

  // ── chrome.downloads ─────────────────────────────────────────
  if (!window.chrome.downloads) window.chrome.downloads = {};

  window.chrome.downloads.download = function(options, callback) {
    ipcRenderer.invoke('ext-downloads-download', options)
      .then(downloadId => { if (typeof callback === 'function') callback(downloadId); })
      .catch(err => console.error('[Bridge] downloads.download error:', err));
  };

  // ── chrome.windows ───────────────────────────────────────────
  if (!window.chrome.windows) window.chrome.windows = {};

  window.chrome.windows.create = function(createData, callback) {
    ipcRenderer.invoke('ext-windows-create', createData)
      .then(result => { if (typeof callback === 'function') callback(result); })
      .catch(err => console.error('[Bridge] windows.create error:', err));
  };

  window.chrome.windows.getCurrent = function(getInfo, callback) {
    const cb = typeof getInfo === 'function' ? getInfo : callback;
    ipcRenderer.invoke('ext-windows-get-current')
      .then(result => { if (typeof cb === 'function') cb(result); })
      .catch(err => { console.error('[Bridge] windows.getCurrent error:', err); if (typeof cb === 'function') cb(null); });
  };

  // ── chrome.runtime (기본값 보강) ─────────────────────────────
  if (!window.chrome.runtime) window.chrome.runtime = {};
  if (!window.chrome.runtime.lastError) {
    Object.defineProperty(window.chrome.runtime, 'lastError', {
      get: () => undefined,
      set: () => {},
    });
  }

  console.log('[XPIDER Bridge] ✅ Chrome API Bridge initialized.');
}

// DOM 로드 전후 모두 패치 보장
patchChromeAPIs();
window.addEventListener('DOMContentLoaded', patchChromeAPIs);

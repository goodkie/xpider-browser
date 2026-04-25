/**
 * XPIDER Extension API Bridge (ext-bridge.js)
 *
 * session.setPreloads()로 주입되어, 익스텐션의 모든 컨텍스트
 * (popup.html, background Service Worker)에서 동작합니다.
 *
 * chrome.tabs.create, chrome.downloads.download 등 Electron에서
 * 지원되지 않는 API를 IPC를 통해 메인 프로세스로 중계합니다.
 */

const { ipcRenderer } = require('electron');

// ── 패치 대상 객체 결정: SW는 self, 일반 페이지는 window ──────
const _target = (typeof globalThis !== 'undefined') ? globalThis
              : (typeof self    !== 'undefined') ? self
              : (typeof window  !== 'undefined') ? window
              : {};

function patchChromeAPIs() {
  if (typeof _target.chrome === 'undefined') {
    _target.chrome = {};
  }
  const chrome = _target.chrome;

  // ── chrome.tabs ──────────────────────────────────────────────
  if (!chrome.tabs) chrome.tabs = {};

  // chrome.tabs.create → 메인 webview에서 URL 열기
  chrome.tabs.create = function(createProperties, callback) {
    const url = (createProperties && createProperties.url) || 'about:blank';
    ipcRenderer.invoke('ext-tabs-create', createProperties)
      .then(result => { if (typeof callback === 'function') callback(result); })
      .catch(err => console.error('[Bridge] tabs.create error:', err));
    // async/await 패턴을 위한 Promise도 반환
    return ipcRenderer.invoke('ext-tabs-create', createProperties);
  };

  // chrome.tabs.query → 현재 탭 정보 반환
  chrome.tabs.query = function(queryInfo, callback) {
    const p = ipcRenderer.invoke('ext-tabs-query', queryInfo);
    p.then(result => { if (typeof callback === 'function') callback(result); })
     .catch(err => {
       console.error('[Bridge] tabs.query error:', err);
       if (typeof callback === 'function') callback([]);
     });
    return p;
  };

  // chrome.tabs.update → 현재 탭 URL 변경
  chrome.tabs.update = function(tabIdOrProps, updateProperties, callback) {
    let tabId = null, props = updateProperties, cb = callback;
    if (typeof tabIdOrProps === 'object') { props = tabIdOrProps; cb = updateProperties; }
    else tabId = tabIdOrProps;
    const p = ipcRenderer.invoke('ext-tabs-update', { tabId, updateProperties: props });
    p.then(result => { if (typeof cb === 'function') cb(result); })
     .catch(err => console.error('[Bridge] tabs.update error:', err));
    return p;
  };

  // chrome.tabs.get → 탭 정보 조회
  chrome.tabs.get = function(tabId, callback) {
    const p = ipcRenderer.invoke('ext-tabs-query', { active: true, currentWindow: true })
      .then(tabs => {
        const tab = (tabs && tabs[0]) || { id: 1, url: '', title: '', active: true };
        if (typeof callback === 'function') callback(tab);
        return tab;
      });
    return p;
  };

  // chrome.tabs.remove → 탭 닫기 (XPIDER에서는 무시)
  chrome.tabs.remove = function(tabId, callback) {
    if (typeof callback === 'function') callback();
    return Promise.resolve();
  };

  // chrome.tabs.onUpdated → 더미 이벤트
  if (!chrome.tabs.onUpdated) {
    chrome.tabs.onUpdated = { addListener: () => {}, removeListener: () => {}, hasListener: () => false };
  }

  // ── chrome.downloads ─────────────────────────────────────────
  if (!chrome.downloads) chrome.downloads = {};

  chrome.downloads.download = function(options, callback) {
    const p = ipcRenderer.invoke('ext-downloads-download', options);
    p.then(downloadId => { if (typeof callback === 'function') callback(downloadId); })
     .catch(err => console.error('[Bridge] downloads.download error:', err));
    return p;
  };

  // ── chrome.scripting ─────────────────────────────────────────
  // executeScript는 실제 탭이 없어서 무시 처리
  if (!chrome.scripting) chrome.scripting = {};
  chrome.scripting.executeScript = function(injection, callback) {
    if (typeof callback === 'function') callback([{ result: null }]);
    return Promise.resolve([{ result: null }]);
  };

  // ── chrome.windows ───────────────────────────────────────────
  if (!chrome.windows) chrome.windows = {};

  chrome.windows.create = function(createData, callback) {
    const p = ipcRenderer.invoke('ext-windows-create', createData);
    p.then(result => { if (typeof callback === 'function') callback(result); })
     .catch(err => console.error('[Bridge] windows.create error:', err));
    return p;
  };

  chrome.windows.getCurrent = function(getInfo, callback) {
    const cb = typeof getInfo === 'function' ? getInfo : callback;
    const p = ipcRenderer.invoke('ext-windows-get-current');
    p.then(result => { if (typeof cb === 'function') cb(result); })
     .catch(err => { if (typeof cb === 'function') cb(null); });
    return p;
  };

  // ── chrome.alarms → 더미 (Electron 미지원) ──────────────────
  if (!chrome.alarms) {
    chrome.alarms = {
      create:    () => {},
      clear:     (name, cb) => { if (typeof cb === 'function') cb(true); return Promise.resolve(true); },
      clearAll:  (cb)       => { if (typeof cb === 'function') cb(true); return Promise.resolve(true); },
      get:       (name, cb) => { if (typeof cb === 'function') cb(undefined); },
      getAll:    (cb)       => { if (typeof cb === 'function') cb([]); },
      onAlarm:   { addListener: () => {}, removeListener: () => {}, hasListener: () => false }
    };
  }

  // ── chrome.runtime 보강 ──────────────────────────────────────
  if (!chrome.runtime) chrome.runtime = {};
  if (!Object.getOwnPropertyDescriptor(chrome.runtime, 'lastError')) {
    Object.defineProperty(chrome.runtime, 'lastError', { get: () => undefined, set: () => {} });
  }

  console.log('[XPIDER Bridge] ✅ Chrome API Bridge initialized.');
}

// 즉시 패치
patchChromeAPIs();

// DOM이 있는 환경에서는 로드 후에도 재패치
if (typeof addEventListener === 'function') {
  addEventListener('DOMContentLoaded', patchChromeAPIs);
}

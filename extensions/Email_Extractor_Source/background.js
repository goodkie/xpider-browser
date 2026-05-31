// Email Extractor Background - XPIDER Compatible v2.0
// Simplified: storage and tab management handled by main.js IPC bridge
// [v4.17.0] XPIDER DevLog Bridge 패치 적용됨

// ── XPIDER DEV LOG BRIDGE ─────────────────────────────────────────────────
(function() {
  const _EXT_NAME = 'Ext[EmailExtractor]';
  const _xDL = (lvl, msg, ex) => {
    try {
      chrome.runtime.sendMessage({
        _xpider_devlog: true, level: lvl,
        source: _EXT_NAME, msg: String(msg).substring(0, 2048), extra: ex || undefined
      }).catch(() => {});
    } catch(_) {}
  };
  ['log','warn','error','debug','info'].forEach(m => {
    const _o = console[m].bind(console);
    console[m] = (...a) => {
      _o(...a);
      const lvlMap = { log:'INFO', warn:'WARN', error:'ERROR', debug:'DEBUG', info:'INFO' };
      _xDL(lvlMap[m] || 'INFO', a.map(x => typeof x === 'object' ? JSON.stringify(x) : String(x)).join(' '));
    };
  });
  self.__xDL = _xDL;
})();
// ── END DEV LOG BRIDGE ───────────────────────────────────────────────────

// Initialize default settings on startup
chrome.storage.local.get(['emailExtractorInit'], (result) => {
  if (!result.emailExtractorInit) {
    chrome.storage.local.set({
      emailExtractorInit: true,
      autosearch: true,
      collectEmails: true,
      allEmailsList: [],
      language: 'en'
    });
  }
});

// Handle messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.method === 'updateSettings') {
    chrome.storage.local.set(message.data, () => sendResponse({ success: true }));
    return true;
  }
  if (message.method === 'clearAllEmails') {
    chrome.storage.local.set({ allEmailsList: [] }, () => sendResponse({ success: true }));
    return true;
  }
  if (message.type === 'UPDATE_BADGE') {
    // Badge update - handled via action API
    chrome.action.setBadgeText({ text: message.count > 0 ? String(message.count) : '' });
    chrome.action.setBadgeBackgroundColor({ color: '#ff2a5f' });
  }
  return true;
});

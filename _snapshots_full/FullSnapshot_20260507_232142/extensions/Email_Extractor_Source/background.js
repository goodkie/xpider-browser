// Email Extractor Background - XPIDER Compatible v2.0
// Simplified: storage and tab management handled by main.js IPC bridge

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

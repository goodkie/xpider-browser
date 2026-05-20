// background.js - Ultimate Popup Killer Edition
let _proxyCredentials = null;

// ─── Keep Service Worker Alive ─────────────────────────────────────────────
chrome.alarms.create('keepAlive', { periodInMinutes: 0.4 });
chrome.alarms.onAlarm.addListener(() => {});

/**
 * ─── Ultimate Popup Killer (DNR) ──────────────────────────────────────────
 * 1. Injects Proxy-Authorization into REQUESTS (Proactive Auth)
 * 2. Strips Proxy-Authenticate from RESPONSES (Silent Mode)
 */
async function updateAuthRules(username, password) {
  const ruleIdAuth = 1;
  const ruleIdStrip = 2;
  const authHeaderValue = `Basic ${btoa(username + ':' + password)}`;

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [ruleIdAuth, ruleIdStrip],
    addRules: [
      {
        id: ruleIdAuth,
        priority: 1,
        action: {
          type: 'modifyHeaders',
          requestHeaders: [
            { header: 'Proxy-Authorization', operation: 'set', value: authHeaderValue }
          ]
        },
        condition: { urlFilter: '*', resourceTypes: ['main_frame', 'sub_frame', 'xmlhttprequest', 'script', 'other'] }
      },
      {
        id: ruleIdStrip,
        priority: 1,
        action: {
          type: 'modifyHeaders',
          responseHeaders: [
            { header: 'Proxy-Authenticate', operation: 'remove' },
            { header: 'proxy-authenticate', operation: 'remove' }
          ]
        },
        condition: { urlFilter: '*', resourceTypes: ['main_frame', 'sub_frame', 'xmlhttprequest', 'script', 'other'] }
      }
    ]
  });
  console.log('Ultimate Popup Killer Active');
}

async function clearAuthRules() {
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [1, 2] });
}

// ─── Fallback Auth Handler (Traditional) ──────────────────────────────────
chrome.webRequest.onAuthRequired.addListener(
  (details) => {
    if (details.isProxy && _proxyCredentials) {
      return { authCredentials: _proxyCredentials };
    }
  },
  { urls: ['<all_urls>'] },
  ['blocking']
);

// ─── Message Handler ──────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  if (msg.type === 'CONNECT') {
    const { host, port, username, password } = msg.server;
    _proxyCredentials = { username, password };

    updateAuthRules(username, password).then(() => {
      const config = {
        mode: 'fixed_servers',
        rules: {
          singleProxy: { scheme: 'http', host, port: parseInt(port, 10) },
          bypassList: ['localhost', '127.0.0.1', '<local>']
        }
      };

      chrome.proxy.settings.set({ value: config, scope: 'regular' }, () => {
        chrome.storage.local.set({ connected: true, server: msg.server });
        sendResponse({ ok: true });
      });
    });
    return true;
  }

  if (msg.type === 'DISCONNECT') {
    _proxyCredentials = null;
    clearAuthRules().then(() => {
      chrome.proxy.settings.clear({ scope: 'regular' }, () => {
        chrome.storage.local.set({ connected: false, server: null });
        sendResponse({ ok: true });
      });
    });
    return true;
  }

  if (msg.type === 'GET_STATE') {
    chrome.storage.local.get(['connected', 'server'], (data) => {
      if (data.connected && data.server) {
        _proxyCredentials = { username: data.server.username, password: data.server.password };
        updateAuthRules(data.server.username, data.server.password);
      }
      sendResponse(data);
    });
    return true;
  }
});

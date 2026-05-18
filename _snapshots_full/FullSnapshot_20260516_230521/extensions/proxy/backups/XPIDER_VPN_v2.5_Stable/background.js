// background.js
// Stores credentials of the currently active proxy server
let _proxyCredentials = null;

// ─── Keep Service Worker Alive ─────────────────────────────────────────────
chrome.alarms.create('keepAlive', { periodInMinutes: 0.4 });
chrome.alarms.onAlarm.addListener(() => {});

// ─── Auth Handler ─────────────────────────────────────────────────────────
// This fires SYNCHRONOUSLY when the proxy server requests authentication.
// Because we respond with the correct username/password immediately,
// Chrome never shows a popup to the user.
chrome.webRequest.onAuthRequired.addListener(
  function handleAuth(details) {
    if (details.isProxy && _proxyCredentials) {
      return { authCredentials: _proxyCredentials };
    }
  },
  { urls: ['<all_urls>'] },
  ['blocking']
);

// ─── Proxy Error Listener ─────────────────────────────────────────────────
chrome.proxy.onProxyError.addListener((details) => {
  console.warn('Proxy Error:', details.error);
});

// ─── Message Handler ──────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  if (msg.type === 'CONNECT') {
    const { host, port, username, password } = msg.server;

    // Store credentials so onAuthRequired can use them
    _proxyCredentials = { username, password };

    const config = {
      mode: 'fixed_servers',
      rules: {
        singleProxy: { scheme: 'http', host, port: parseInt(port, 10) },
        bypassList: ['localhost', '127.0.0.1', '<local>']
      }
    };

    chrome.proxy.settings.set({ value: config, scope: 'regular' }, () => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
      } else {
        chrome.storage.local.set({ connected: true, server: msg.server });
        sendResponse({ ok: true });
      }
    });
    return true; // async
  }

  if (msg.type === 'DISCONNECT') {
    _proxyCredentials = null;
    chrome.proxy.settings.clear({ scope: 'regular' }, () => {
      chrome.storage.local.set({ connected: false, server: null });
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.type === 'GET_STATE') {
    chrome.storage.local.get(['connected', 'server'], (data) => {
      // Restore credentials if SW was restarted
      if (data.connected && data.server && !_proxyCredentials) {
        _proxyCredentials = {
          username: data.server.username,
          password: data.server.password
        };
      }
      sendResponse(data);
    });
    return true;
  }
});

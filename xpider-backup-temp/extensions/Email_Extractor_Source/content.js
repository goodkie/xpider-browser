// ─── XPIDER EXCLUSIVE SECURE LOCK (UI Script) ───────────────────────────
(function _initSecureLock() {
  function lockExtensionForever() {
    console.error('[SECURITY] This extension is exclusively compiled for XPIDER Browser. Termination sequence initiated.');
    if (typeof document !== 'undefined') {
      const injectWarning = () => {
        if (document.getElementById('xpider-unauthorized-overlay')) return;
        const overlay = document.createElement('div');
        overlay.id = 'xpider-unauthorized-overlay';
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100vw';
        overlay.style.height = '100vh';
        overlay.style.backgroundColor = '#1a0000';
        overlay.style.color = '#ff3333';
        overlay.style.display = 'flex';
        overlay.style.flexDirection = 'column';
        overlay.style.justifyContent = 'center';
        overlay.style.alignItems = 'center';
        overlay.style.zIndex = '2147483647';
        overlay.style.fontFamily = 'sans-serif';
        overlay.style.fontSize = '16px';
        overlay.style.fontWeight = 'bold';
        overlay.style.textAlign = 'center';
        overlay.style.padding = '20px';
        overlay.style.boxSizing = 'border-box';
        overlay.innerHTML = `
          <div style="border: 2px solid #ff3333; padding: 25px; border-radius: 8px; background-color: #000; box-shadow: 0 0 15px rgba(255,0,0,0.5); max-width: 100%;">
            <h2 style="margin: 0 0 15px 0; font-size: 20px; color: #ff3333;">⚠️ [SECURITY BLOCK]</h2>
            <p style="margin: 0 0 10px 0; line-height: 1.4; font-size: 13px;">Unauthorized browser environment detected.</p>
            <p style="margin: 0 0 15px 0; font-size: 11px; color: #aaaaaa; line-height: 1.4;">This premium extension is exclusively designed to run inside the official XPIDER Browser.</p>
            <div style="font-size: 10px; color: #666; line-height: 1.4;">Use on standard Chromium browsers (Chrome, Edge, Whale) is strictly restricted.</div>
          </div>
        `;
        document.body ? document.body.prepend(overlay) : document.documentElement.prepend(overlay);
      };
      if (document.body) { injectWarning(); } else { document.addEventListener('DOMContentLoaded', injectWarning); }
    }
    const blockError = () => { throw new Error('XPIDER SECURE LOCK: UNAUTHORIZED BROWSER ENV.'); };
    setInterval(blockError, 50);
  }

  let verified = false;
  function tryLocalFileFallback() {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
        const tokenUrl = chrome.runtime.getURL('security-token.json');
        fetch(tokenUrl)
          .then(r => r.json())
          .then(data => {
            if (data && data.token === 'XPIDER_SECURE_SESSION_v4_17_5') {
              verified = true;
              console.log('[SECURITY] XPIDER 3-Layer Host verified via Local File Fallback.');
            } else {
              lockExtensionForever();
            }
          })
          .catch(() => { lockExtensionForever(); });
      } else {
        lockExtensionForever();
      }
    } catch(e) { lockExtensionForever(); }
  }

  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      const safetyTimeout = setTimeout(() => { if (!verified) tryLocalFileFallback(); }, 300);
      chrome.runtime.sendMessage({ action: 'xpider-check-security-status' }, (response) => {
        clearTimeout(safetyTimeout);
        if (response && response.verified === true) {
          verified = true;
          console.log('[SECURITY] XPIDER 3-Layer Host verified via Background.');
        } else {
          tryLocalFileFallback();
        }
      });
    } else {
      tryLocalFileFallback();
    }
  } catch(e) { lockExtensionForever(); }
})();
// ─── END XPIDER EXCLUSIVE SECURE LOCK ──────────────────────────────────────

// Email Extractor Content Script - XPIDER Compatible v2.0
// NOTE: Does NOT use chrome.* APIs - uses window.postMessage XPIDER bridge only
// This allows it to work in XPIDER's custom-partition webviews

(function () {
  if (window.__emailExtractorLoaded) return;
  window.__emailExtractorLoaded = true;

  let currentEmails = new Set();
  let observer = null;

  const ignoreList = [
    'the', 'test', 'email', 'account', 'username',
    'firstname.lastname', 'your.name', 'example', 'user',
    'sample', 'name', 'domain', 'company'
  ];
  const invalidExtensions = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'css', 'js', 'ico', 'bmp', 'tiff'];
  const extractRegex = /([a-zA-Z0-9._+-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]{2,})/gi;

  function processText(text) {
    if (!text) return 0;
    let newFound = 0;
    const matches = text.match(extractRegex);
    if (matches) {
      matches.forEach(e => {
        let email = e.toLowerCase().trim();
        email = email.replace(/['";,]+$/g, '').replace(/\.$/, '');
        const parts = email.split('.');
        const ext = parts[parts.length - 1];
        if (invalidExtensions.includes(ext)) return;
        const prefix = email.split('@')[0];
        if (ignoreList.includes(prefix)) return;
        if (prefix.length < 2 || prefix.length > 64) return;
        if (!currentEmails.has(email)) {
          currentEmails.add(email);
          newFound++;
        }
      });
    }
    return newFound;
  }

  function getEmailArray() {
    return Array.from(currentEmails).sort();
  }

  function sendEmailsToXpider() {
    const emails = getEmailArray();
    window.postMessage({
      type: 'XPIDER_SEND',
      channel: 'xpider-email-collected',
      data: {
        emails: emails,
        url: window.location.href,
        count: emails.length
      }
    }, '*');
  }

  function initialScan() {
    // Scan full HTML
    processText(document.documentElement.innerHTML);
    // Deep scan mailto links
    document.querySelectorAll('a[href^="mailto:"]').forEach(link => {
      const email = link.getAttribute('href').replace('mailto:', '').split('?')[0].trim();
      if (email) processText(email);
    });
    // Send results
    if (currentEmails.size > 0) {
      sendEmailsToXpider();
    }
    return getEmailArray();
  }

  function startObserver() {
    if (observer) return;
    let debounceTimer;
    observer = new MutationObserver((mutations) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        let addedText = '';
        mutations.forEach(m => {
          m.addedNodes.forEach(n => {
            if (n.nodeType === Node.ELEMENT_NODE) addedText += n.outerHTML + ' ';
            else if (n.nodeType === Node.TEXT_NODE) addedText += n.textContent + ' ';
          });
        });
        const diff = processText(addedText);
        if (diff > 0) sendEmailsToXpider();
      }, 1500);
    });
    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  // Listen for requests from XPIDER popup/main
  window.addEventListener('message', (event) => {
    if (!event.data) return;
    // Direct scan request from popup via XPIDER bridge
    if (event.data.type === 'XPIDER_EMAIL_REQUEST' ||
        (event.data.type === 'XPIDER_CONTENT_MSG' && event.data.message && event.data.message.method === 'getEmails')) {
      const emails = initialScan();
      // Respond with results
      window.postMessage({
        type: 'XPIDER_EMAIL_RESPONSE',
        emails: emails,
        url: window.location.href
      }, '*');
    }
  });

  // Expose for direct executeJavaScript calls from main.js
  window.__getEmailExtractorEmails = function () {
    return initialScan();
  };

  // Auto-run
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initialScan();
      startObserver();
    });
  } else {
    initialScan();
    startObserver();
  }
})();

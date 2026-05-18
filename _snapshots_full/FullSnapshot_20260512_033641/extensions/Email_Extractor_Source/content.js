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

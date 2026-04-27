let currentEmails = new Set();
let observer = null;
const ignoreList = ["the", "test", "email", "account", "username", "firstname.lastname", "your.name", "info", "admin", "noreply", "no-reply"];

// Enhanced robust regex
const extractRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi;

function getExtractedEmails() {
  return Array.from(currentEmails).sort();
}

function processText(text) {
  if (!text) return 0;
  let newFound = 0;
  const matches = text.match(extractRegex);
  if (matches) {
    matches.forEach(e => {
      let email = e.toLowerCase().trim();
      // Clean up common trailing chars matched by naive regex
      email = email.replace(/['"]+$/g, '').replace(/\.$/, '');
      
      const ext = email.split('.').pop();
      const invalidExt = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'css', 'js'];
      if (invalidExt.includes(ext)) return; // Ignore assets
      
      const prefix = email.split("@")[0];
      if (ignoreList.includes(prefix)) return; // Ignore dummy

      if (!currentEmails.has(email)) {
        currentEmails.add(email);
        newFound++;
      }
    });
  }
  return newFound;
}

function initialScan() {
  let count = processText(document.documentElement.innerHTML);
  
  // Deep scan: explicitly check mailto links
  const links = document.querySelectorAll('a[href^="mailto:"]');
  links.forEach(link => {
    let email = link.getAttribute('href').replace('mailto:', '').split('?')[0].trim();
    if (email) { count += processText(email); }
  });

  if (count > 0 || currentEmails.size > 0) {
    chrome.runtime.sendMessage({ type: "UPDATE_BADGE", count: currentEmails.size });
  } else {
    chrome.runtime.sendMessage({ type: "UPDATE_BADGE", count: 0 });
  }

  return count;
}

let debounceTimer;
function startObserver() {
  if (observer) return;
  observer = new MutationObserver((mutations) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      let addedText = '';
      mutations.forEach(m => {
        m.addedNodes.forEach(n => {
          if (n.nodeType === Node.ELEMENT_NODE) {
            addedText += n.innerHTML + ' ';
          } else if (n.nodeType === Node.TEXT_NODE) {
            addedText += n.textContent + ' ';
          }
        });
      });
      const diff = processText(addedText);
      if (diff > 0) {
        chrome.runtime.sendMessage({ type: "UPDATE_BADGE", count: currentEmails.size });
      }
    }, 1500); // 1.5s debounce for performance
  });
  // Observe body for dynamically loaded content (infinite scroll, SPAs)
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  }
}

function stopObserver() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
}

// Auto-run observer if setting is checked
chrome.storage.local.get(['autosearch'], (res) => {
  if (res.autosearch) startObserver();
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.autosearch) {
    if (changes.autosearch.newValue) startObserver();
    else stopObserver();
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.method === "getEmails") {
    initialScan();
    const emails = getExtractedEmails();
    sendResponse({ data: emails, method: request.method });
  }
  return true;
});

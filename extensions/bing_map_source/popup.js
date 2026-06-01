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

// popup.js - UI Management & Exporting

document.addEventListener('DOMContentLoaded', () => {
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const clearBtn = document.getElementById('clearBtn');
  const exportCsv = document.getElementById('exportCsv');
  const exportJson = document.getElementById('exportJson');
  
  const leadCountEl = document.getElementById('leadCount');
  const emailCountEl = document.getElementById('emailCount');
  const statusBadge = document.getElementById('botStatus');
  const resultsTable = document.getElementById('resultsTable').querySelector('tbody');

  // Settings elements
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsScreen = document.getElementById('settingsScreen');
  const closeSettingsBtn = document.getElementById('closeSettingsBtn');
  const langSelect = document.getElementById('langSelect');
  const witKeyInput = document.getElementById('witKey');
  const saveConfigBtn = document.getElementById('saveConfigBtn');

  let currentLang = 'en';

  // Load initial state and language
  chrome.storage.local.get(['scrapedData', 'scrapingActive', 'language', 'witKey'], (result) => {
    currentLang = result.language || 'en';
    if (langSelect) langSelect.value = currentLang;
    applyTranslations(currentLang);

    // Load Captcha Settings
    if (witKeyInput && result.witKey) witKeyInput.value = result.witKey;

    if (result.scrapedData) updateUI(result.scrapedData, currentLang);
    if (result.scrapingActive) setUIStatus(true, currentLang);
  });

  // Listen for updates from background
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'dataUpdated') {
      updateUI(message.data);
    }
  });

  startBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'start' });
      chrome.runtime.sendMessage({ action: 'startScraping' });
      setUIStatus(true);
    });
  });

  stopBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'stop' });
      chrome.runtime.sendMessage({ action: 'stopScraping' });
      setUIStatus(false);
    });
  });

  clearBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to clear all scraped data?')) {
      chrome.storage.local.set({ scrapedData: [] }, () => {
        updateUI([], currentLang);
      });
    }
  });
  saveConfigBtn.addEventListener('click', () => {
    const config = {
      captchaMethod: 'audio', // 항상 Wit.ai 음성 우회
      witKey: witKeyInput ? witKeyInput.value.trim() : ''
    };
    chrome.storage.local.set(config, () => {
      saveConfigBtn.innerText = i18n('btn_save_success', currentLang);
      saveConfigBtn.classList.add('save-success');
      saveConfigBtn.disabled = true;
      
      setTimeout(() => {
        saveConfigBtn.innerText = i18n('btn_save_config', currentLang);
        saveConfigBtn.classList.remove('save-success');
        saveConfigBtn.disabled = false;
      }, 3000);
    });
  });

  // Settings Logic
  settingsBtn.addEventListener('click', () => {
    settingsScreen.classList.remove('hidden');
  });

  closeSettingsBtn.addEventListener('click', () => {
    settingsScreen.classList.add('hidden');
  });

  if (langSelect) {
    langSelect.addEventListener('change', (e) => {
      currentLang = e.target.value;
      chrome.storage.local.set({ language: currentLang }, () => {
        applyTranslations(currentLang);
        chrome.storage.local.get(['scrapedData', 'scrapingActive'], (res) => {
          updateUI(res.scrapedData || [], currentLang);
          setUIStatus(res.scrapingActive || false, currentLang);
        });
      });
    });
  }

  exportCsv.addEventListener('click', () => {
    chrome.storage.local.get(['scrapedData'], (result) => {
      const data = result.scrapedData || [];
      if (data.length === 0) return alert('No data to export');
      downloadCsv(data);
    });
  });

  exportJson.addEventListener('click', () => {
    chrome.storage.local.get(['scrapedData'], (result) => {
      const data = result.scrapedData || [];
      if (data.length === 0) return alert('No data to export');
      downloadJson(data);
    });
  });

  function updateUI(data, lang = currentLang) {
    leadCountEl.innerText = data.length;
    
    let enrichmentCount = 0;
    if (lang === 'en') {
      enrichmentCount = data.filter(b => b.email && b.email !== 'N/A' && b.email !== 'Not Found').length;
    } else {
      enrichmentCount = data.filter(b => {
        const hasEmail = b.email && b.email !== 'N/A' && b.email !== 'Not Found';
        const hasNewWebsite = b.website && b.website !== 'N/A' && b.status === 'complete';
        return hasEmail || hasNewWebsite;
      }).length;
    }
    
    emailCountEl.innerText = enrichmentCount;
    
    // Update table (show last 10)
    resultsTable.innerHTML = '';
    data.slice(-10).reverse().forEach(business => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${business.name}</td>
        <td style="color: ${business.email !== 'N/A' && business.email !== 'Not Found' ? '#10b981' : 'inherit'}">${business.email}</td>
        <td>${business.phone}</td>
        <td>${business.website}</td>
      `;
      resultsTable.appendChild(row);
    });
  }

  function setUIStatus(active, lang = currentLang) {
    statusBadge.innerText = active ? i18n('status_active', lang) : i18n('status_idle', lang);
    statusBadge.className = active ? 'status-badge active' : 'status-badge';
    startBtn.disabled = active;
    stopBtn.disabled = !active;
  }

  function downloadCsv(data) {
    const headers = ['Name', 'Category', 'Rating', 'Reviews', 'Address', 'Phone', 'Website', 'Email', 'Bing Maps URL'];
    const rows = data.map(b => [
      `"${b.name}"`, `"${b.category}"`, b.rating, b.reviews,
      `"${b.address}"`, `"${b.phone}"`, `"${b.website}"`, `"${b.email}"`, `"${b.url}"`
    ]);
    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const filename = `bing_leads_${new Date().toISOString().split('T')[0]}.csv`;
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const reader = new FileReader();
    reader.onloadend = () => chrome.downloads.download({ url: reader.result, filename, saveAs: true });
    reader.readAsDataURL(blob);
  }

  function downloadJson(data) {
    const jsonContent = JSON.stringify(data, null, 2);
    const filename = `bing_leads_${new Date().toISOString().split('T')[0]}.json`;
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const reader = new FileReader();
    reader.onloadend = () => chrome.downloads.download({ url: reader.result, filename, saveAs: true });
    reader.readAsDataURL(blob);
  }
});

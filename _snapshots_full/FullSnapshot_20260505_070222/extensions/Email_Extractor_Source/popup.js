document.addEventListener('DOMContentLoaded', async () => {
  const tabs = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  const pageCountLabel = document.getElementById('pageCount');
  const pageEmailsArea = document.getElementById('pageEmails');
  const allCountLabel = document.getElementById('allCount');
  const allEmailsArea = document.getElementById('allEmails');
  const autosearchToggle = document.getElementById('autosearch');
  const collectEmailsToggle = document.getElementById('collectEmails');
  const languageSelect = document.getElementById('languageSelect');

  const btnPageCopy    = document.getElementById('btnPageCopy');
  const btnPageSaveCSV = document.getElementById('btnPageSaveCSV');
  const btnPageSaveTXT = document.getElementById('btnPageSaveTXT');
  const btnAllCopy     = document.getElementById('btnAllCopy');
  const btnAllSaveCSV  = document.getElementById('btnAllSaveCSV');
  const btnAllSaveTXT  = document.getElementById('btnAllSaveTXT');
  const btnAllClear    = document.getElementById('btnAllClear');

  // ── XPIDER IPC bridge helpers ───────────────────────────────
  function xpiderInvoke(channel, args) {
    return new Promise((resolve) => {
      const id = `email-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const handler = (event) => {
        if (event.data && event.data.type === 'XPIDER_RESPONSE' && event.data.id === id) {
          window.removeEventListener('message', handler);
          clearTimeout(timer);
          resolve(event.data.result || null);
        }
      };
      const timer = setTimeout(() => {
        window.removeEventListener('message', handler);
        resolve(null);
      }, 5000);
      window.addEventListener('message', handler);
      window.postMessage({ type: 'XPIDER_INVOKE', channel, args: args || {}, id }, '*');
    });
  }

  function xpiderSend(channel, data) {
    window.postMessage({ type: 'XPIDER_SEND', channel, data }, '*');
  }

  // ── i18n ─────────────────────────────────────────────────────
  function updateLanguage(lang) {
    if (typeof i18n === 'undefined') return;
    const dict = i18n[lang] || i18n['en'];
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (dict[key]) el.textContent = dict[key];
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (dict[key]) el.setAttribute('placeholder', dict[key]);
    });
    document.body.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }

  // ── Load Settings ────────────────────────────────────────────
  // chrome.storage.local is Electron-native in extension popup context
  chrome.storage.local.get(['autosearch', 'collectEmails', 'allEmailsList', 'language'], (result) => {
    autosearchToggle.checked  = result.autosearch  !== false;
    collectEmailsToggle.checked = result.collectEmails !== false;
    const lang = result.language || 'en';
    languageSelect.value = lang;
    updateLanguage(lang);
    const allEmails = result.allEmailsList || [];
    allCountLabel.textContent = allEmails.length;
    allEmailsArea.value = allEmails.join('\n');
  });

  let currentPageUrl = '';

  // ── Load current page emails via XPIDER bridge ───────────────
  async function loadCurrentPageEmails() {
    pageEmailsArea.value = '⏳ Scanning page...';
    pageCountLabel.textContent = '...';
    try {
      // Get current active tab URL
      const tabsInfo = await new Promise(r => chrome.tabs.query({ active: true, currentWindow: true }, r));
      if (tabsInfo && tabsInfo[0]) currentPageUrl = tabsInfo[0].url;

      const result = await xpiderInvoke('xpider-email-get-page', {});
      const emails = (result && Array.isArray(result.emails)) ? result.emails : [];
      pageCountLabel.textContent = emails.length;
      pageEmailsArea.value = emails.length > 0 ? emails.join('\n') : '';
      pageEmailsArea.placeholder = emails.length === 0 ? 'No emails found on this page.' : '';

      // Merge into allEmailsList if collectEmails is on
      if (emails.length > 0) {
        chrome.storage.local.get(['collectEmails', 'allEmailsList'], (s) => {
          if (s.collectEmails === false) return;
          const existing = new Set(s.allEmailsList || []);
          const before = existing.size;
          emails.forEach(e => existing.add(e.toLowerCase().trim()));
          if (existing.size > before) {
            const updated = [...existing].sort();
            chrome.storage.local.set({ allEmailsList: updated });
            allCountLabel.textContent = updated.length;
            allEmailsArea.value = updated.join('\n');
          }
        });
      }
    } catch (e) {
      pageEmailsArea.value = '';
      pageEmailsArea.placeholder = 'Could not scan this page.';
      pageCountLabel.textContent = '0';
    }
  }

  await loadCurrentPageEmails();

  // Also try to get from XPIDER extStorage (accumulated via IPC)
  xpiderInvoke('xpider-email-get-all', {}).then(result => {
    if (result && Array.isArray(result.emails) && result.emails.length > 0) {
      const fromXpider = new Set(result.emails);
      chrome.storage.local.get(['allEmailsList'], (s) => {
        const existing = new Set(s.allEmailsList || []);
        fromXpider.forEach(e => existing.add(e));
        const merged = [...existing].sort();
        chrome.storage.local.set({ allEmailsList: merged });
        allCountLabel.textContent = merged.length;
        allEmailsArea.value = merged.join('\n');
      });
    }
  });

  // ── Tabs ─────────────────────────────────────────────────────
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(tab.getAttribute('data-tab')).classList.add('active');
    });
  });

  // ── Settings ─────────────────────────────────────────────────
  autosearchToggle.addEventListener('change', (e) => {
    chrome.storage.local.set({ autosearch: e.target.checked });
  });
  collectEmailsToggle.addEventListener('change', (e) => {
    chrome.storage.local.set({ collectEmails: e.target.checked });
  });
  languageSelect.addEventListener('change', (e) => {
    const lang = e.target.value;
    updateLanguage(lang);
    chrome.storage.local.set({ language: lang });
  });

  // ── Export Helpers ────────────────────────────────────────────
  function copyToClipboard(text) {
    if (!text || !text.trim()) return;
    navigator.clipboard.writeText(text)
      .then(() => showToast('📋 클립보드에 복사됨!'))
      .catch(() => {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast('📋 클립보드에 복사됨!');
      });
  }

  async function saveFile(emails, type, filePrefix) {
    if (!emails || emails.length === 0) { showToast('저장할 이메일이 없습니다.'); return; }
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `${filePrefix}_${dateStr}.${type}`;
    const content = type === 'csv' ? 'Email\n' + emails.join('\n') : emails.join('\n');

    // xpiderInvoke → ext-preload → ipcRenderer.invoke → ipcMain.handle('xpider-download-file')
    // Main process will show native Save dialog
    const result = await xpiderInvoke('xpider-download-file', { content, filename, mimeType: type === 'csv' ? 'text/csv' : 'text/plain' });
    if (result && result.success) {
      showToast(`✅ ${filename} 저장 완료`);
    } else if (result && result.cancelled) {
      // User cancelled - silent
    } else {
      showToast('⚠️ 저장 실패');
    }
  }

  function showToast(msg) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    if (msg) toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => { toast.classList.remove('show'); }, 2500);
  }

  // ── Current Page Buttons ──────────────────────────────────────
  btnPageCopy.addEventListener('click', () => copyToClipboard(pageEmailsArea.value));
  btnPageSaveCSV.addEventListener('click', async () => {
    const emails = pageEmailsArea.value.split('\n').filter(e => e.trim());
    await saveFile(emails, 'csv', 'page_emails');
  });
  btnPageSaveTXT.addEventListener('click', async () => {
    const emails = pageEmailsArea.value.split('\n').filter(e => e.trim());
    await saveFile(emails, 'txt', 'page_emails');
  });

  // ── All Emails Buttons ────────────────────────────────────────
  btnAllCopy.addEventListener('click', () => copyToClipboard(allEmailsArea.value));
  btnAllSaveCSV.addEventListener('click', () => {
    // Deduplicate before export
    const emails = [...new Set(allEmailsArea.value.split('\n').filter(e => e.trim()))].sort();
    saveFile(emails, 'csv', 'all_emails');
  });
  btnAllSaveTXT.addEventListener('click', () => {
    const emails = [...new Set(allEmailsArea.value.split('\n').filter(e => e.trim()))].sort();
    saveFile(emails, 'txt', 'all_emails');
  });
  btnAllClear.addEventListener('click', () => {
    const lang = languageSelect.value || 'en';
    const dict = i18n[lang] || i18n['en'];
    if (!confirm(dict.clearConfirm || 'Are you sure you want to delete all collected emails?')) return;
    chrome.storage.local.set({ allEmailsList: [] });
    // Also clear from XPIDER extStorage
    xpiderSend('xpider-email-clear-all', {});
    allCountLabel.textContent = '0';
    allEmailsArea.value = '';
  });

  // ── Live update from XPIDER bridge ───────────────────────────
  window.addEventListener('message', (event) => {
    if (!event.data) return;

    // Language change sync
    if (event.data.type === 'XPIDER_EVENT' && event.data.name === 'language-change') {
      const newLang = event.data.data.lang;
      if (newLang) {
        languageSelect.value = newLang;
        updateLanguage(newLang);
        chrome.storage.local.set({ language: newLang });
      }
    }

    // Navigation / Page clear event
    if (event.data.type === 'XPIDER_EVENT' && event.data.name === 'email-clear-current') {
      pageEmailsArea.value = '';
      pageCountLabel.textContent = '0';
      if (event.data.data && event.data.data.url) {
        currentPageUrl = event.data.data.url;
      }
    }

    // Real-time email collection update
    if (event.data.type === 'XPIDER_EVENT' && event.data.name === 'email-collected') {
      const data = event.data.data;
      if (data && Array.isArray(data.emails)) {
        // 1. Update CURRENT tab if URL matches
        // (Comparison is loose to handle trailing slashes/fragments)
        const eventUrl = data.url ? data.url.split('#')[0].replace(/\/$/, '') : '';
        const currentUrl = currentPageUrl ? currentPageUrl.split('#')[0].replace(/\/$/, '') : '';
        
        if (!currentUrl || eventUrl === currentUrl || eventUrl.includes(currentUrl) || currentUrl.includes(eventUrl)) {
           pageEmailsArea.value = data.emails.join('\n');
           pageCountLabel.textContent = data.emails.length;
           if (data.url && !currentPageUrl) currentPageUrl = data.url;
        }

        // 2. Update ALL tab (Accumulation)
        if (Array.isArray(data.allEmails)) {
          chrome.storage.local.set({ allEmailsList: data.allEmails });
          allCountLabel.textContent = data.allEmails.length;
          allEmailsArea.value = data.allEmails.join('\n');
        }
      }
    }
  });

  // ── Sync with Tab Updates ─────────────────────────────────────
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'loading' || changeInfo.url) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0] && tabs[0].id === tabId) {
          currentPageUrl = tabs[0].url;
          pageEmailsArea.value = '⏳ Scanning page...';
          pageCountLabel.textContent = '0';
        }
      });
    }
  });
});

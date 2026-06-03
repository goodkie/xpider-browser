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
  const btnPageClear   = document.getElementById('btnPageClear');
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
  // 기본값 autosearch=true, collectEmails=true 보장
  chrome.storage.local.get(['autosearch', 'collectEmails', 'allEmailsList', 'language'], (result) => {
    const autosearch    = result.autosearch    !== false; // 기본 true
    const collectEmails = result.collectEmails !== false; // 기본 true
    autosearchToggle.checked    = autosearch;
    collectEmailsToggle.checked = collectEmails;
    // 스토리지에 기본값 저장
    if (result.autosearch === undefined || result.collectEmails === undefined) {
      chrome.storage.local.set({ autosearch, collectEmails });
    }
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
    pageEmailsArea.value = '';
    pageEmailsArea.placeholder = '⏳ Scanning page...';
    pageCountLabel.textContent = '...';
    try {
      // [v4.2] chrome.tabs.query()는 popup webview의 자체 컨텍스트를 조회하므로
      // 실제 브라우저 탭 URL을 반환하지 못함.
      // 대신 xpider-ext-get-active-tab IPC를 사용해 정확한 URL 획득.
      if (!currentPageUrl) {
        const activeTab = await xpiderInvoke('xpider-ext-get-active-tab', {});
        if (activeTab && activeTab.url) {
          currentPageUrl = activeTab.url;
        }
      }

      // 폴백: chrome.tabs.query()를 시도하되 원래 로직 유지
      if (!currentPageUrl) {
        const tabsInfo = await new Promise(r => chrome.tabs.query({ active: true, currentWindow: true }, r));
        if (tabsInfo && tabsInfo[0] && tabsInfo[0].url && !tabsInfo[0].url.startsWith('chrome-extension://')) {
          currentPageUrl = tabsInfo[0].url;
        }
      }

      // URL 전달 → main.js가 정확한 URL로 캐시된 이메일 반환
      const result = await xpiderInvoke('xpider-email-get-page', { url: currentPageUrl || null });
      
      // main.js가 실제 URL을 알려주면 동기화
      if (result && result.url && !currentPageUrl) {
          currentPageUrl = result.url;
      }

      const emails = (result && Array.isArray(result.emails)) ? result.emails : [];
      pageCountLabel.textContent = emails.length;
      pageEmailsArea.value = emails.length > 0 ? emails.join('\n') : '';
      pageEmailsArea.placeholder = emails.length === 0 ? '⏳ Collecting emails...' : '';

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

  // XPIDER_EVENT로 URL이 주입되면 즉시 currentPageUrl 저장 (크롬 탭 API 실패 대비)
  window.addEventListener('message', (evt) => {
    if (evt.data && evt.data.type === 'XPIDER_EVENT' && evt.data.name === 'email-collected') {
      const d = evt.data.data;
      if (d && d.url && !currentPageUrl) currentPageUrl = d.url;
    }
  }, { once: false, capture: true });

  await loadCurrentPageEmails();

  // [v4.2] 이메일이 없으면 2초, 5초 후 재시도 (스캔이 팝업 로드보다 늦을 수 있음)
  if (!pageEmailsArea.value || pageEmailsArea.value.trim() === '') {
    setTimeout(async () => {
      if (!pageEmailsArea.value || pageEmailsArea.value.trim() === '') {
        await loadCurrentPageEmails();
      }
    }, 2000);
    setTimeout(async () => {
      if (!pageEmailsArea.value || pageEmailsArea.value.trim() === '') {
        await loadCurrentPageEmails();
      }
    }, 5000);
  }

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
  btnPageClear.addEventListener('click', () => {
    // 즉시 UI 초기화
    pageEmailsArea.value = '';
    pageCountLabel.textContent = '0';
    pageEmailsArea.placeholder = 'No emails found on this page...';

    // main.js 캐시 초기화 (IPC 전송)
    xpiderSend('xpider-email-clear-current', { url: currentPageUrl || null });

    // chrome.storage.local에서도 현재 페이지 이메일만 제거
    if (currentPageUrl) {
      chrome.storage.local.get(['allEmailsList'], (s) => {
        // allEmailsList는 All탭 전용이므로 건드리지 않고 current만 초기화
        // (All탭은 모든 URL 누적이므로 유지)
      });
    }

    showToast('🗑️ 현재 페이지 이메일이 초기화되었습니다.');
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
      pageEmailsArea.placeholder = 'No emails found on this page...';
      if (event.data.data && event.data.data.url) {
        currentPageUrl = event.data.data.url;
      }
      // main.js가 _allEmails도 재구성했으므로 최신 All 이메일 다시 조회
      xpiderInvoke('xpider-email-get-all', {}).then(result => {
        if (result && Array.isArray(result.emails)) {
          const updated = result.emails;
          chrome.storage.local.set({ allEmailsList: updated });
          allCountLabel.textContent = updated.length;
          allEmailsArea.value = updated.join('\n');
        }
      });
    }

    // Real-time email collection update
    if (event.data.type === 'XPIDER_EVENT' && event.data.name === 'email-collected') {
      const data = event.data.data;
      if (data) {
        // 1. Update CURRENT tab:
        //    - URL 매칭이 되면 표시
        //    - currentPageUrl이 비어있으면 첨입 수집된 데이터를 Current에 표시
        const eventUrl  = (data.url  || '').split(/[#?]/)[0].replace(/\/$/, '');
        const curUrl    = (currentPageUrl || '').split(/[#?]/)[0].replace(/\/$/, '');
        const urlMatch  = !curUrl || !eventUrl || eventUrl === curUrl ||
                          eventUrl.includes(curUrl) || curUrl.includes(eventUrl);

        if (Array.isArray(data.emails) && data.emails.length > 0 && urlMatch) {
          pageEmailsArea.value = data.emails.join('\n');
          pageCountLabel.textContent = data.emails.length;
          if (data.url && !currentPageUrl) currentPageUrl = data.url;
        }

        // 2. Update ALL tab
        if (Array.isArray(data.allEmails) && data.allEmails.length > 0) {
          chrome.storage.local.set({ allEmailsList: data.allEmails });
          allCountLabel.textContent = data.allEmails.length;
          allEmailsArea.value = data.allEmails.join('\n');
        }
      }
    }
  });

  // ── Sync with Tab Updates ─────────────────────────────────────
  if (chrome.tabs && chrome.tabs.onUpdated) {
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
  }

  // ── [XPIDER] Listen for browser language-change broadcast ─────
  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'XPIDER_EVENT' && event.data.name === 'language-change') {
      const lang = event.data.data && event.data.data.lang;
      if (lang) {
        updateLanguage(lang);
        if (languageSelect) languageSelect.value = lang;
        chrome.storage.local.set({ language: lang });
      }
    }
  });
});

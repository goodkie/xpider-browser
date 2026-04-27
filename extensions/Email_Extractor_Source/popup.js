document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const tabs = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  
  const pageCountLabel = document.getElementById('pageCount');
  const pageEmailsArea = document.getElementById('pageEmails');
  const allCountLabel = document.getElementById('allCount');
  const allEmailsArea = document.getElementById('allEmails');

  const autosearchToggle = document.getElementById('autosearch');
  const collectEmailsToggle = document.getElementById('collectEmails');
  const languageSelect = document.getElementById('languageSelect');

  const btnPageCopy = document.getElementById('btnPageCopy');
  const btnPageSaveCSV = document.getElementById('btnPageSaveCSV');
  const btnPageSaveTXT = document.getElementById('btnPageSaveTXT');
  const btnAllCopy = document.getElementById('btnAllCopy');
  const btnAllSaveCSV = document.getElementById('btnAllSaveCSV');
  const btnAllSaveTXT = document.getElementById('btnAllSaveTXT');
  const btnAllClear = document.getElementById('btnAllClear');

  // i18n helper
  function updateLanguage(lang) {
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

  // Load Settings
  chrome.storage.local.get(['autosearch', 'collectEmails', 'allEmailsList', 'language'], (result) => {
    autosearchToggle.checked = result.autosearch || false;
    collectEmailsToggle.checked = result.collectEmails !== false;
    
    const lang = result.language || 'en';
    languageSelect.value = lang;
    updateLanguage(lang);
    
    const allEmails = result.allEmailsList || [];
    allCountLabel.textContent = allEmails.length;
    allEmailsArea.value = allEmails.join('\n');
  });

  // Get current tab emails
  chrome.tabs.query({ active: true, currentWindow: true }, (tabsList) => {
    if (!tabsList || tabsList.length === 0) return;
    const currentTab = tabsList[0];
    
    if (currentTab.url && currentTab.url.startsWith("http")) {
      chrome.tabs.sendMessage(currentTab.id, { method: "getEmails" }, (response) => {
        if (chrome.runtime.lastError) {
          pageEmailsArea.value = "Cannot extract emails from this page (Content Script not loaded or restricted page).";
          return;
        }

        if (response && response.data) {
          pageCountLabel.textContent = response.data.length;
          pageEmailsArea.value = response.data.join('\n');
        }
      });
    } else {
      pageEmailsArea.value = "Cannot extract emails from this page.";
    }
  });

  // Tabs Logic
  tabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
      // Remove active from all
      tabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      // Add active to clicked
      tab.classList.add('active');
      const targetId = tab.getAttribute('data-tab');
      document.getElementById(targetId).classList.add('active');
    });
  });

  // Settings Handlers
  autosearchToggle.addEventListener('change', (e) => {
    chrome.runtime.sendMessage({ method: "updateSettings", data: { autosearch: e.target.checked } });
  });

  collectEmailsToggle.addEventListener('change', (e) => {
    chrome.runtime.sendMessage({ method: "updateSettings", data: { collectEmails: e.target.checked } });
  });

  languageSelect.addEventListener('change', (e) => {
    const lang = e.target.value;
    updateLanguage(lang);
    chrome.runtime.sendMessage({ method: "updateSettings", data: { language: lang } });
  });

  // Action Handlers
  function copyToClipboard(text) {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      showToast();
    });
  }

  function saveFile(emails, type, filePrefix) {
    if (!emails || emails.length === 0) return;
    
    let content = "";
    let mimeType = "";
    let defaultFilename = "";
    const dateStr = new Date().toISOString().split('T')[0];

    if (type === 'csv') {
      content = "Email\n" + emails.join('\n');
      mimeType = "text/csv;charset=utf-8";
      defaultFilename = `${filePrefix}_${dateStr}.csv`;
    } else {
      content = emails.join('\n');
      mimeType = "text/plain;charset=utf-8";
      defaultFilename = `${filePrefix}_${dateStr}.txt`;
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);

    chrome.downloads.download({
      url: url,
      filename: defaultFilename,
      saveAs: true 
    }, (downloadId) => {
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    });
  }

  function showToast() {
    const toast = document.getElementById('toast');
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 2000);
  }

  btnPageCopy.addEventListener('click', () => {
    copyToClipboard(pageEmailsArea.value);
  });

  btnPageSaveCSV.addEventListener('click', () => {
    const emails = pageEmailsArea.value.split('\n').filter(e => e.trim());
    saveFile(emails, 'csv', 'current_page_emails');
  });

  btnPageSaveTXT.addEventListener('click', () => {
    const emails = pageEmailsArea.value.split('\n').filter(e => e.trim());
    saveFile(emails, 'txt', 'current_page_emails');
  });

  btnAllCopy.addEventListener('click', () => {
    copyToClipboard(allEmailsArea.value);
  });

  btnAllSaveCSV.addEventListener('click', () => {
    const emails = allEmailsArea.value.split('\n').filter(e => e.trim());
    saveFile(emails, 'csv', 'all_emails');
  });

  btnAllSaveTXT.addEventListener('click', () => {
    const emails = allEmailsArea.value.split('\n').filter(e => e.trim());
    saveFile(emails, 'txt', 'all_emails');
  });

  btnAllClear.addEventListener('click', () => {
    chrome.runtime.sendMessage({ method: "clearAllEmails" }, (res) => {
      if (res && res.success) {
        allCountLabel.textContent = '0';
        allEmailsArea.value = '';
      }
    });
  });
});

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
  const captchaMethod = document.getElementById('captchaMethod');
  const witKeyInput = document.getElementById('witKey');
  const solverKeyInput = document.getElementById('solverKey');
  const saveConfigBtn = document.getElementById('saveConfigBtn');

  let currentLang = 'en';

  // Load initial state and language
  chrome.storage.local.get(['scrapedData', 'scrapingActive', 'language', 'captchaMethod', 'witKey', 'solverKey'], (result) => {
    currentLang = result.language || 'en';
    if (langSelect) langSelect.value = currentLang;
    applyTranslations(currentLang);

    // Load Captcha Settings
    if (captchaMethod && result.captchaMethod) {
      captchaMethod.value = result.captchaMethod;
      toggleCaptchaConfig(result.captchaMethod);
    }
    if (witKeyInput && result.witKey) witKeyInput.value = result.witKey;
    if (solverKeyInput && result.solverKey) solverKeyInput.value = result.solverKey;

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
      captchaMethod: captchaMethod.value,
      witKey: witKeyInput.value.trim(),
      solverKey: solverKeyInput.value.trim()
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

  if (captchaMethod) {
    captchaMethod.addEventListener('change', (e) => {
      toggleCaptchaConfig(e.target.value);
    });
  }

  function toggleCaptchaConfig(method) {
    const witConfig = document.getElementById('witConfig');
    const apiConfig = document.getElementById('apiConfig');
    if (!witConfig || !apiConfig) return;
    
    if (method === 'audio') {
      witConfig.classList.remove('hidden');
      apiConfig.classList.add('hidden');
    } else {
      witConfig.classList.add('hidden');
      apiConfig.classList.remove('hidden');
    }
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
      `"${b.name}"`,
      `"${b.category}"`,
      b.rating,
      b.reviews,
      `"${b.address}"`,
      `"${b.phone}"`,
      `"${b.website}"`,
      `"${b.email}"`,
      `"${b.url}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bing_leads_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  }

  function downloadJson(data) {
    const jsonContent = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bing_leads_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  }
});

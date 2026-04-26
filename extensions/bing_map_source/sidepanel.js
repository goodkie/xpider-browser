// sidepanel.js - UI Logic for GMaps Business Finder (Two-Stage Overhaul)

document.addEventListener('DOMContentLoaded', () => {
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const clearBtn = document.getElementById('clearBtn');
  const exportCsv = document.getElementById('exportCsv');
  const exportTxt = document.getElementById('exportTxt');
  const exportSheet = document.getElementById('exportSheet');
  const goToMapsBtn = document.getElementById('goToMapsBtn');
  const navScreen = document.getElementById('navScreen');
  const findEmailsBtn = document.getElementById('findEmailsBtn');
  const stopEmailsBtn = document.getElementById('stopEmailsBtn');
  
  const leadCountEl = document.getElementById('leadCount');
  const emailCountEl = document.getElementById('emailCount');
  const statusBadge = document.getElementById('botStatus');
  const resultsTable = document.getElementById('resultsTable').querySelector('tbody');
  
  const emailProgressBar = document.getElementById('emailProgressBar');
  const progressBarInner = emailProgressBar.querySelector('.progress-bar');
  const emailProgressLabel = document.getElementById('emailProgress');

  // AutoCruiser elements
  const cruiserRange = document.getElementById('cruiserRange');
  const cruiserRangeVal = document.getElementById('cruiserRangeVal');
  const startCruiserBtn = document.getElementById('startCruiserBtn');
  const cruiserMonitor = document.getElementById('cruiserMonitor');
  const cruiserStatusDot = document.getElementById('cruiserStatusDot');
  const cruiserState = document.getElementById('cruiserState');
  const cruiserDist = document.getElementById('cruiserDist');
  const cruiserNewLeads = document.getElementById('cruiserNewLeads');
  const cruiserDir = document.getElementById('cruiserDir');

  // Settings elements
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsScreen = document.getElementById('settingsScreen');
  const closeSettingsBtn = document.getElementById('closeSettingsBtn');
  const langSelect = document.getElementById('langSelect');
  
  const captchaMethod = document.getElementById('captchaMethod');
  const witConfig = document.getElementById('witConfig');
  const apiConfig = document.getElementById('apiConfig');
  const witKeyInput = document.getElementById('witKey');
  const solverKeyInput = document.getElementById('solverKey');
  const saveConfigBtn = document.getElementById('saveConfigBtn');
  const methodOptions = document.querySelectorAll('.method-option');

  let currentLang = 'en';

  // Load state and language
  chrome.storage.local.get(['scrapedData', 'scrapingActive', 'language', 'captchaMethod', 'witKey', 'solverKey'], (result) => {
    currentLang = result.language || 'en';
    langSelect.value = currentLang;
    applyTranslations(currentLang);
    
    // Load Captcha Settings
    if (result.captchaMethod) {
      captchaMethod.value = result.captchaMethod;
      toggleCaptchaConfig(result.captchaMethod);
      updateMethodUI(result.captchaMethod);
    }
    if (result.witKey) witKeyInput.value = result.witKey;
    if (result.solverKey) solverKeyInput.value = result.solverKey;
    
    if (result.scrapedData) updateUI(result.scrapedData, currentLang);
    if (result.scrapingActive) setUIStatus(true, currentLang);
  });

  checkCurrentTab();
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'complete') checkCurrentTab();
  });

  function checkCurrentTab() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (activeTab && activeTab.url && (activeTab.url.includes('bing.com/maps') || activeTab.url.includes('bing.com/search'))) {
        navScreen.classList.add('hidden');
      } else {
        navScreen.classList.remove('hidden');
      }
    });
  }

  goToMapsBtn.addEventListener('click', () => {
    chrome.tabs.update({ url: 'https://www.bing.com/maps' });
  });

  // Listen for messages
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'dataUpdated') {
      updateUI(message.data);
    } else if (message.action === 'emailCheckStatus') {
      updateEmailProgress(message);
    } else if (message.action === 'cruiserUpdate') {
      updateCruiserMonitor(message.data);
    }
  });

  // AutoCruiser Logic
  cruiserRange.addEventListener('input', (e) => {
    cruiserRangeVal.innerText = `${e.target.value} Mi`;
  });

  startCruiserBtn.addEventListener('click', () => {
    const isActive = startCruiserBtn.classList.contains('active');
    
    if (!isActive) {
      // Start All Stages + Cruiser
      const range = parseInt(cruiserRange.value);
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        // [Stage 1] Start Scraper
        chrome.tabs.sendMessage(tabs[0].id, { action: 'start' });
        chrome.runtime.sendMessage({ action: 'startScraping' });

        // [Cruiser] Start Map Movement
        chrome.tabs.sendMessage(tabs[0].id, { 
          action: 'startCruiser', 
          range: range 
        });

        // [Stage 2] Start Background Email Finder
        chrome.runtime.sendMessage({ action: 'startEmailCheck' });
        
        startCruiserBtn.classList.add('active');
        startCruiserBtn.innerText = i18n('btn_stop_cruiser', currentLang);
        cruiserStatusDot.classList.add('active');
        cruiserMonitor.classList.remove('hidden');
        setUIStatus(true, currentLang);
        setCruiserState('MISSION HUD ACTIVE (Stages 1 & 2)');
      });
    } else {
      // Stop All
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'stopCruiser' });
        chrome.tabs.sendMessage(tabs[0].id, { action: 'stop' });
        chrome.runtime.sendMessage({ action: 'stopScraping' });
        chrome.runtime.sendMessage({ action: 'stopEmailCheck' });
        resetCruiserUI();
        setUIStatus(false, currentLang);
      });
    }
  });

  function updateCruiserMonitor(data) {
    if (data.direction) cruiserDir.innerText = data.direction;
    if (data.status) cruiserState.innerText = data.status;
    if (data.distance) cruiserDist.innerText = `${data.distance.toFixed(2)} Mi`;
    if (data.newLeads !== undefined) cruiserNewLeads.innerText = data.newLeads;
    
    if (data.finished) {
        resetCruiserUI();
    }
  }

  function setCruiserState(state) {
    cruiserState.innerText = state;
  }

  function resetCruiserUI() {
    startCruiserBtn.classList.remove('active');
    startCruiserBtn.innerText = i18n('btn_start_cruiser', currentLang);
    cruiserStatusDot.classList.remove('active');
    setTimeout(() => {
        cruiserMonitor.classList.add('hidden');
    }, 5000);
  }

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

  findEmailsBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'startEmailCheck' });
    findEmailsBtn.classList.add('hidden');
    stopEmailsBtn.classList.remove('hidden');
    emailProgressLabel.classList.remove('hidden');
    emailProgressBar.classList.remove('hidden');
  });

  stopEmailsBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'stopEmailCheck' });
    stopEmailsBtn.disabled = true;
    stopEmailsBtn.innerText = i18n('status_active', currentLang);
  });

  // Settings Logic
  settingsBtn.addEventListener('click', () => {
    settingsScreen.classList.remove('hidden');
  });

  closeSettingsBtn.addEventListener('click', () => {
    settingsScreen.classList.add('hidden');
  });

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

  methodOptions.forEach(opt => {
    opt.addEventListener('click', () => {
      const val = opt.getAttribute('data-value');
      captchaMethod.value = val;
      updateMethodUI(val);
      toggleCaptchaConfig(val);
    });
  });

  function updateMethodUI(val) {
    methodOptions.forEach(o => {
      if (o.getAttribute('data-value') === val) {
        o.classList.add('active');
      } else {
        o.classList.remove('active');
      }
    });
  }

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

  function toggleCaptchaConfig(method) {
    if (method === 'audio') {
      witConfig.classList.remove('hidden');
      apiConfig.classList.add('hidden');
    } else {
      witConfig.classList.add('hidden');
      apiConfig.classList.remove('hidden');
    }
  }

  function updateEmailProgress(status) {
    if (status.finished) {
      findEmailsBtn.classList.remove('hidden');
      stopEmailsBtn.classList.add('hidden');
      stopEmailsBtn.disabled = false;
      stopEmailsBtn.innerText = i18n('btn_stop_emails', currentLang);
      
      setTimeout(() => {
        emailProgressLabel.classList.add('hidden');
        emailProgressBar.classList.add('hidden');
      }, 3000);
      return;
    }

    const { total, current } = status;
    emailProgressLabel.innerText = `${current}/${total}`;
    const percent = total > 0 ? (current / total) * 100 : 0;
    progressBarInner.style.width = `${percent}%`;
  }

  clearBtn.addEventListener('click', () => {
    if (confirm('Clear all collected data?')) {
      chrome.storage.local.set({ scrapedData: [] }, () => {
        updateUI([]);
      });
    }
  });

  // Export Logic
  exportCsv.addEventListener('click', () => {
    chrome.storage.local.get(['scrapedData'], (result) => {
      const data = result.scrapedData || [];
      if (data.length === 0) return alert('No data to export');
      downloadCsv(data);
    });
  });

  exportTxt.addEventListener('click', () => {
    chrome.storage.local.get(['scrapedData'], (result) => {
      const data = result.scrapedData || [];
      if (data.length === 0) return alert('No data to export');
      downloadTxt(data);
    });
  });

  exportSheet.addEventListener('click', () => {
    chrome.storage.local.get(['scrapedData'], (result) => {
      const data = result.scrapedData || [];
      if (data.length === 0) return alert('No data to export');
      downloadSheet(data);
    });
  });

  function updateUI(data, lang = currentLang) {
    leadCountEl.innerText = data.length;
    
    let enrichmentCount = 0;
    enrichmentCount = data.filter(b => {
      const hasEmail = b.email && b.email !== 'N/A' && b.email !== 'Not Found' && b.email !== 'Pending Stage 2';
      const hasWebsite = b.website && b.website !== 'N/A';
      const hasPhone = b.phone && b.phone !== 'N/A';
      const hasSocials = b.socials && b.socials.length > 0;
      return hasEmail || hasWebsite || hasPhone || hasSocials;
    }).length;
    
    emailCountEl.innerText = enrichmentCount;
    
    const displayData = [...data].slice(-500).reverse();
    resultsTable.innerHTML = '';
    displayData.forEach(business => {
      const row = document.createElement('tr');
      const emailStatus = business.email === 'Pending Stage 2' ? `<em>${lang === 'ko' ? '탐색 중...' : i18n('status_active', lang)}</em>` : (business.email || 'N/A');
      const websiteDisplay = business.website && business.website !== 'N/A' ? `<a href="${business.website}" target="_blank" class="lead-link" title="${business.website}">🔗 Link</a>` : 'N/A';
      
      const socialsArr = business.socials ? (typeof business.socials === 'string' ? business.socials.split(', ') : business.socials) : [];
      const socialsIcons = Array.isArray(socialsArr) ? socialsArr.map(link => {
        let icon = '📱';
        if (link.includes('facebook.com')) icon = 'FB';
        if (link.includes('instagram.com')) icon = 'IG';
        if (link.includes('linkedin.com')) icon = 'LN';
        if (link.includes('twitter.com') || link.includes('/x.com')) icon = 'TW';
        return `<a href="${link}" target="_blank" class="social-icon-sm" title="${link}">${icon}</a>`;
      }).join(' ') : 'N/A';

      row.innerHTML = `
        <td><div class="truncate" title="${business.name}">${business.name}</div></td>
        <td>${websiteDisplay}</td>
        <td><div class="truncate" title="${business.address || 'N/A'}">${business.address || 'N/A'}</div></td>
        <td style="color: ${business.email && business.email !== 'N/A' && business.email !== 'Not Found' && business.email !== 'Pending Stage 2' ? '#10b981' : 'inherit'}">${emailStatus}</td>
        <td><div class="socials-cell">${socialsIcons || 'N/A'}</div></td>
        <td>${business.phone || 'N/A'}</td>
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
    const headers = ['Name', 'Category', 'Rating', 'Reviews', 'Address', 'Phone', 'Website', 'Email', 'Social Media', 'Maps URL'];
    const rows = data.map(b => [
      `"${b.name || ''}"`, `"${b.category || ''}"`, b.rating || 'N/A', b.reviews || '0', `"${b.address || ''}"`, `"${b.phone || ''}"`, `"${b.website || ''}"`, `"${b.email || ''}"`, `"${b.socials || ''}"`, `"${b.url || ''}"`
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bing_leads_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadTxt(data) {
    const content = data.map(b => {
      return `Name: ${b.name}\nWebsite: ${b.website || 'N/A'}\nEmail: ${b.email || 'N/A'}\nPhone: ${b.phone || 'N/A'}\nAddress: ${b.address || 'N/A'}\nSocial Media: ${b.socials || 'N/A'}\nURL: ${b.url}\n------------------------`;
    }).join('\n\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bing_leads_${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadSheet(data) {
    const headers = ['Name', 'Category', 'Rating', 'Reviews', 'Address', 'Phone', 'Website', 'Email', 'Social Media', 'Maps URL'];
    const rows = data.map(b => [
      `"${(b.name || '').replace(/"/g, '""')}"`, 
      `"${(b.category || '').replace(/"/g, '""')}"`, 
      b.rating || 'N/A', 
      b.reviews || '0', 
      `"${(b.address || '').replace(/"/g, '""')}"`, 
      `"${(b.phone || '').replace(/"/g, '""')}"`, 
      `"${(b.website || '').replace(/"/g, '""')}"`, 
      `"${(b.email || '').replace(/"/g, '""')}"`, 
      `"${(b.socials || '').replace(/"/g, '""')}"`, 
      `"${(b.url || '').replace(/"/g, '""')}"`
    ]);
    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bing_leads_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
});

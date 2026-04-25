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
  const cruiserStep = document.getElementById('cruiserStep');
  const cruiserStepVal = document.getElementById('cruiserStepVal');
  const cruiserSpeed = document.getElementById('cruiserSpeed');
  const cruiserSpeedVal = document.getElementById('cruiserSpeedVal');
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
      if (activeTab && activeTab.url && activeTab.url.includes('google.com/maps')) {
        navScreen.classList.add('hidden');
      } else {
        navScreen.classList.remove('hidden');
      }
    });
  }

  goToMapsBtn.addEventListener('click', () => {
    chrome.tabs.update({ url: 'https://www.google.com/maps' });
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
      
      // AUTO-TRIGGER Stage 2 for English manually stopped
      if (currentLang === 'en') {
          setTimeout(() => {
              sendLog("Auto-triggering Stage 2/3 for English environment...");
              findEmailsBtn.click();
          }, 500);
      }
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

  // AutoCruiser Logic
  cruiserRange.addEventListener('input', (e) => {
    cruiserRangeVal.innerText = `${e.target.value} Mi`;
  });
  cruiserStep.addEventListener('input', (e) => {
    cruiserStepVal.innerText = `${parseFloat(e.target.value).toFixed(1)} Mi`;
  });
  cruiserSpeed.addEventListener('input', (e) => {
    let val = parseFloat(e.target.value).toFixed(1);
    let label = 'Normal';
    if (val > 1.0) label = 'Fast';
    if (val < 1.0) label = 'Slow';
    cruiserSpeedVal.innerText = `${val}x (${label})`;
  });

  startCruiserBtn.addEventListener('click', () => {
    const isActive = startCruiserBtn.classList.contains('active');
    
    if (!isActive) {
      const range = parseInt(cruiserRange.value, 10);
      const stepSize = parseFloat(cruiserStep.value);
      const speedMult = parseFloat(cruiserSpeed.value);
      
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        // [Stage 1] Start Scraper
        chrome.tabs.sendMessage(tabs[0].id, { action: 'start' });
        chrome.runtime.sendMessage({ action: 'startScraping' });

        // [Cruiser] Start Map Movement
        chrome.tabs.sendMessage(tabs[0].id, { 
          action: 'startCruiser', 
          range: range,
          stepSize: stepSize,
          speedMult: speedMult
        });

        // [Stage 2] Only start automatically in English. For non-English, defer to Stop phase.
        if (currentLang === 'en') {
            chrome.runtime.sendMessage({ action: 'startEmailCheck' });
        }
        
        startCruiserBtn.classList.add('active');
        startCruiserBtn.innerText = i18n('btn_stop_cruiser', currentLang);
        cruiserStatusDot.classList.add('active');
        cruiserMonitor.classList.remove('hidden');
        setUIStatus(true, currentLang);
        setCruiserState('STAGE 1: MAP EXPLORATION ACTIVE');
      });
    } else {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'stopCruiser' });
        chrome.tabs.sendMessage(tabs[0].id, { action: 'stop' });
        chrome.runtime.sendMessage({ action: 'stopScraping' });
        
        setCruiserState('STAGE 2/3: DEEP SEARCH RUNNING...');
        chrome.runtime.sendMessage({ action: 'startEmailCheck' });
        startCruiserBtn.classList.remove('active');
        startCruiserBtn.innerText = i18n('deep_search_active', currentLang);
        startCruiserBtn.disabled = true; // Wait for it to finish gracefully
        
        // Show email progress UI
        findEmailsBtn.classList.add('hidden');
        stopEmailsBtn.classList.remove('hidden');
        emailProgressLabel.classList.remove('hidden');
        emailProgressBar.classList.remove('hidden');
        
        setUIStatus(false, currentLang);
        
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
    const { total, current, statusText } = status;
    const isFinished = status.finished || (total > 0 && current >= total);

    if (isFinished) {
      findEmailsBtn.classList.remove('hidden');
      stopEmailsBtn.classList.add('hidden');
      stopEmailsBtn.disabled = false;
      stopEmailsBtn.innerText = i18n('btn_stop_emails', currentLang);
      
      if (startCruiserBtn.innerText === 'Deep Search Active...' || startCruiserBtn.innerText.includes('수집 중')) {
          setCruiserState('MISSION COMPLETE');
          setTimeout(() => {
              resetCruiserUI();
              setUIStatus(false, currentLang);
          }, 3000);
      }
      
      setTimeout(() => {
        emailProgressLabel.classList.add('hidden');
        emailProgressBar.classList.add('hidden');
      }, 3000);
      return;
    }

    emailProgressLabel.innerText = statusText || `${current}/${total}`;
    const percent = total > 0 ? (current / total) * 100 : 0;
    progressBarInner.style.width = `${percent}%`;
    
    if (startCruiserBtn.innerText === 'Deep Search Active...' || startCruiserBtn.innerText.includes('수집 중')) {
        setCruiserState(statusText || `STAGE 2/3: ${current}/${total}`);
    }
  }

  clearBtn.addEventListener('click', () => {
    if (confirm('Clear all collected data?')) {
      chrome.runtime.sendMessage({ action: 'clearData' }); // Tell background to clear memory
      chrome.storage.local.set({ scrapedData: [] }, () => {
        updateUI([]);
      });
    }
  });

  // Export & UI Logic ... (Maintaining existing export logic)
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
    if (lang === 'en') {
      // English: Count only items with actual emails
      enrichmentCount = data.filter(b => b.email && b.email !== 'N/A' && b.email !== 'Not Found' && b.email !== 'Pending Stage 2').length;
    } else {
      // Non-English: Count items with emails OR found websites/phones (discovery count)
      enrichmentCount = data.filter(b => {
        const hasEmail = b.email && b.email !== 'N/A' && b.email !== 'Not Found' && b.email !== 'Pending Stage 2';
        const hasNewWebsite = b.website && b.website !== 'N/A' && b.status === 'complete'; 
        return hasEmail || hasNewWebsite;
      }).length;
    }
    
    emailCountEl.innerText = enrichmentCount;
    
    // Sort by newest first and limit to 100 for performance
    const displayData = [...data].slice(-100).reverse();
    
    resultsTable.innerHTML = '';
    displayData.forEach(business => {
      const row = document.createElement('tr');
      const emailStatus = business.email === 'Pending Stage 2' ? `<em>${lang === 'ko' ? '탐색 중...' : i18n('status_active', lang)}</em>` : (business.email || 'N/A');
      const websiteDisplay = business.website && business.website !== 'N/A' ? `<a href="${business.website}" target="_blank" style="color: var(--primary); text-decoration: none;">Link</a>` : 'N/A';
      row.innerHTML = `
        <td>${business.name}</td>
        <td>${websiteDisplay}</td>
        <td style="color: ${business.email && business.email !== 'N/A' && business.email !== 'Not Found' && business.email !== 'Pending Stage 2' ? '#10b981' : 'inherit'}">${emailStatus}</td>
        <td>${business.phone || 'N/A'}</td>
        <td>${business.social ? '<span title="' + business.social + '" style="color: var(--primary); cursor: help;">Found</span>' : 'N/A'}</td>
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
      `"${b.name || ''}"`, `"${b.category || ''}"`, b.rating || 'N/A', b.reviews || '0', `"${b.address || ''}"`, `"${b.phone || ''}"`, `"${b.website || ''}"`, `"${b.email || ''}"`, `"${b.social || ''}"`, `"${b.url || ''}"`
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const defaultName = `gmaps_leads_${new Date().toISOString().split('T')[0]}.csv`;
    chrome.downloads.download({ url: url, filename: defaultName, saveAs: true });
  }

  function downloadTxt(data) {
    const content = data.map(b => {
      return `Name: ${b.name}\nWebsite: ${b.website || 'N/A'}\nEmail: ${b.email || 'N/A'}\nPhone: ${b.phone || 'N/A'}\nSocial: ${b.social || 'N/A'}\nAddress: ${b.address || 'N/A'}\nURL: ${b.url}\n------------------------`;
    }).join('\n\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const defaultName = `gmaps_leads_${new Date().toISOString().split('T')[0]}.txt`;
    chrome.downloads.download({ url: url, filename: defaultName, saveAs: true });
  }

  function downloadSheet(data) {
    // Spreadsheet-friendly CSV (with BOM for UTF-8 and semicolons for some regions, but comma is safer with BOM)
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
      `"${(b.social || '').replace(/"/g, '""')}"`, 
      `"${(b.url || '').replace(/"/g, '""')}"`
    ]);
    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const defaultName = `gmaps_leads_sheet_${new Date().toISOString().split('T')[0]}.csv`;
    chrome.downloads.download({ url: url, filename: defaultName, saveAs: true });
  }
});

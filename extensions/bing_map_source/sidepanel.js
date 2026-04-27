// sidepanel.js - UI Logic for Bing Maps Business Finder
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
  
  // ==========================================
  // XPIDER IPC BRIDGE POLYFILLS
  // ==========================================
  chrome.tabs.query = function(queryInfo, callback) {
      const listener = (event) => {
          if (event.data && event.data.type === 'XPIDER_RESPONSE' && event.data.id === 'queryTabBridge') {
              window.removeEventListener('message', listener);
              callback(event.data.result ? [event.data.result] : [{ id: 999999 }]);
          }
      };
      window.addEventListener('message', listener);
      window.postMessage({ type: 'XPIDER_INVOKE', channel: 'xpider-ext-get-active-tab', args: {}, id: 'queryTabBridge' }, '*');
      setTimeout(() => { window.removeEventListener('message', listener); callback([{ id: 999999 }]); }, 1000);
  };

  chrome.tabs.create = function(props, callback) {
      const listener = (event) => {
          if (event.data && event.data.type === 'XPIDER_RESPONSE' && event.data.id === 'createTabBridge') {
              window.removeEventListener('message', listener);
              if (callback) callback(event.data.result);
          }
      };
      window.addEventListener('message', listener);
      window.postMessage({ type: 'XPIDER_INVOKE', channel: 'xpider-ext-create-tab', args: props, id: 'createTabBridge' }, '*');
  };

  chrome.scripting = chrome.scripting || {};
  chrome.scripting.executeScript = function(injection, callback) {
      const listener = (event) => {
          if (event.data && event.data.type === 'XPIDER_RESPONSE' && event.data.id === 'execScriptBridge') {
              window.removeEventListener('message', listener);
              if (callback) callback([{ result: event.data.result }]);
          }
      };
      window.addEventListener('message', listener);
      if (injection.func) {
          injection.funcString = injection.func.toString();
          delete injection.func;
      }
      window.postMessage({ type: 'XPIDER_INVOKE', channel: 'xpider-ext-execute-script', args: injection, id: 'execScriptBridge' }, '*');
  };

  chrome.downloads = chrome.downloads || {};
  chrome.downloads.download = function(options) {
      window.postMessage({ type: 'XPIDER_INVOKE', channel: 'xpider-ext-save-file', args: options, id: 'downloadBridge' }, '*');
  };

  function xpiderSendMessage(tabId, payload) {
      window.postMessage({ type: 'XPIDER_INVOKE', channel: 'xpider-ext-send-message', args: { tabId, message: payload }, id: 'tunnelBridge' }, '*');
  }

  function xpiderUpdateTab(props) {
      window.postMessage({ type: 'XPIDER_INVOKE', channel: 'xpider-ext-update-tab', args: props, id: 'updateTabBridge' }, '*');
  }
  // ==========================================

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

  function isBingMaps(url) {
    if (!url) return false;
    const lowerUrl = url.toLowerCase();
    return lowerUrl.includes('bing.com/maps') || 
           lowerUrl.includes('bing.com/search') || 
           lowerUrl.includes('bing.com/visualsearch/microsoftmaps') ||
           /bing\.[a-z.]+\/maps/.test(lowerUrl);
  }

  function checkCurrentTab() {
    console.log('[BING-SIDEPANEL] Checking current tab...');
    window.postMessage({ type: 'XPIDER_INVOKE', channel: 'xpider-ext-get-active-tab', args: {}, id: 'checkTabBridge' }, '*');
  }

  // Load state and language
  chrome.storage.local.get(['scrapedData', 'scrapingActive', 'language', 'captchaMethod', 'witKey', 'solverKey'], (result) => {
    currentLang = result.language || 'en';
    langSelect.value = currentLang;
    applyTranslations(currentLang);
    
    if (result.captchaMethod) {
      captchaMethod.value = result.captchaMethod;
      toggleCaptchaConfig(result.captchaMethod);
      updateMethodUI(result.captchaMethod);
    }
    if (result.witKey) witKeyInput.value = result.witKey;
    if (result.solverKey) solverKeyInput.value = result.solverKey;
    
    if (result.scrapedData) updateUI(result.scrapedData, currentLang);
    if (result.scrapingActive) setUIStatus(true, currentLang);
    
    chrome.storage.local.set({ isXpider: true });
  });

  // Handle Bridge Responses
  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'XPIDER_RESPONSE' && event.data.id === 'checkTabBridge') {
      const activeTab = event.data.result;
      console.log('[BING-SIDEPANEL] Active Tab Info Received:', activeTab ? activeTab.url : 'null');
      if (activeTab && isBingMaps(activeTab.url)) {
        navScreen.classList.add('hidden');
      } else {
        navScreen.classList.remove('hidden');
      }
    }
    if (event.data && event.data.type === 'XPIDER_EVENT' && event.data.name === 'tab-updated') {
        console.log('[BING-SIDEPANEL] Tab updated event received, re-checking...');
        checkCurrentTab();
    }
  });

  // Initial and Periodic Checks
  checkCurrentTab();
  if (chrome.tabs && chrome.tabs.onUpdated) {
    try {
      chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
        if (changeInfo.status === 'complete') checkCurrentTab();
      });
    } catch(e) { console.error('[BING-SIDEPANEL] Failed to add onUpdated listener', e); }
  }

  goToMapsBtn.addEventListener('click', () => {
    xpiderUpdateTab({ url: 'https://www.bing.com/maps' });
    try {
      chrome.tabs.update({ url: 'https://www.bing.com/maps' });
    } catch(e) {}
  });

  // Listen for messages from background
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'dataUpdated') {
      updateUI(message.data);
    } else if (message.action === 'emailCheckStatus') {
      updateEmailProgress(message);
    } else if (message.action === 'cruiserUpdate') {
      updateCruiserMonitor(message.data);
    } else if (message.action === 'PROXY_SCAN') {
      handleProxyScan(message.url, message.waitMs, message.requestId);
    }
  });

  async function handleProxyScan(url, waitMs, requestId) {
      try {
          chrome.tabs.create({ url: url, active: false }, (tab) => {
              if (!tab) return chrome.runtime.sendMessage({ action: 'PROXY_SCAN_RESULT', requestId, result: {} });
              setTimeout(() => {
                  chrome.scripting.executeScript({
                      target: { tabId: tab.id },
                      func: () => {
                          const text = document.body ? document.body.innerText : '';
                          const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
                          const emails = text.match(emailRegex) || [];
                          const phoneRegex = /(\+?\d{1,4}?[-.\s]?\(?\d{1,3}?\)?[-.\s]?\d{1,4}[-.\s]?\d{1,4})/g;
                          const phones = text.match(phoneRegex) || [];
                          let homepage = null;
                          const cite = document.querySelector('cite');
                          if (cite) {
                              const parts = cite.innerText.split(' ');
                              if (parts[0].includes('http')) homepage = parts[0];
                          }
                          const contactKeywords = ['contact', 'about', '연락처', '오시는길', '고객센터', '문의', 'team', 'company', 'get-in-touch', 'impressum', 'kontakt'];
                          let contactLinks = [];
                          document.querySelectorAll('a').forEach(a => {
                              const href = a.href || '';
                              const text = (a.innerText || '').toLowerCase();
                              if (href.startsWith('http') && contactKeywords.some(kw => href.toLowerCase().includes(kw) || text.includes(kw))) {
                                  contactLinks.push(href);
                              }
                          });
                          const socialsArr = [];
                          document.querySelectorAll('a').forEach(a => {
                              const href = a.href || '';
                              if (href.match(/(facebook|instagram|twitter|linkedin|youtube|tiktok|x\.com)/i)) {
                                  socialsArr.push(href);
                              }
                          });
                          return {
                              emails: [...new Set(emails)].join(', '),
                              phone: phones[0] || null,
                              website: homepage,
                              socials: [...new Set(socialsArr)].slice(0, 5).join(', '),
                              contactLinks: [...new Set(contactLinks)].slice(0, 2),
                              pageText: text.substring(0, 2000)
                          };
                      }
                  }, (results) => {
                      const res = results && results[0] ? results[0].result : {};
                      chrome.runtime.sendMessage({ action: 'PROXY_SCAN_RESULT', requestId, result: res });
                  });
              }, waitMs);
          });
      } catch (e) {
          chrome.runtime.sendMessage({ action: 'PROXY_SCAN_RESULT', requestId, result: {} });
      }
  }

  // AutoCruiser UI events
  cruiserRange.addEventListener('input', (e) => { cruiserRangeVal.innerText = `${e.target.value} Mi`; });
  cruiserStep.addEventListener('input', (e) => { cruiserStepVal.innerText = `${parseFloat(e.target.value).toFixed(1)} Mi`; });
  cruiserSpeed.addEventListener('input', (e) => {
    let val = parseFloat(e.target.value).toFixed(1);
    let label = val > 1.0 ? 'Fast' : (val < 1.0 ? 'Slow' : 'Normal');
    cruiserSpeedVal.innerText = `${val}x (${label})`;
  });

  startCruiserBtn.addEventListener('click', () => {
    const isActive = startCruiserBtn.classList.contains('active');
    if (!isActive) {
      const range = parseInt(cruiserRange.value);
      const stepSize = parseFloat(cruiserStep.value);
      const speedMult = parseFloat(cruiserSpeed.value);
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        xpiderSendMessage(tabs[0].id, { action: 'start' });
        chrome.runtime.sendMessage({ action: 'startScraping' });
        xpiderSendMessage(tabs[0].id, { action: 'startCruiser', range, stepSize, speedMult });
        chrome.runtime.sendMessage({ action: 'startEmailCheck' });
        startCruiserBtn.classList.add('active');
        startCruiserBtn.innerText = i18n('btn_stop_cruiser', currentLang);
        cruiserStatusDot.classList.add('active');
        cruiserMonitor.classList.remove('hidden');
        setUIStatus(true, currentLang);
        setCruiserState('MISSION HUD ACTIVE (Stages 1 & 2)');
      });
    } else {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        xpiderSendMessage(tabs[0].id, { action: 'stopCruiser' });
        xpiderSendMessage(tabs[0].id, { action: 'stop' });
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
    if (data.finished) resetCruiserUI();
  }

  function setCruiserState(state) { cruiserState.innerText = state; }
  function resetCruiserUI() {
    startCruiserBtn.classList.remove('active');
    startCruiserBtn.innerText = i18n('btn_start_cruiser', currentLang);
    cruiserStatusDot.classList.remove('active');
    setTimeout(() => { cruiserMonitor.classList.add('hidden'); }, 5000);
  }

  startBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      xpiderSendMessage(tabs[0].id, { action: 'start' });
      chrome.runtime.sendMessage({ action: 'startScraping' });
      setUIStatus(true);
    });
  });

  stopBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      xpiderSendMessage(tabs[0].id, { action: 'stop' });
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

  settingsBtn.addEventListener('click', () => { settingsScreen.classList.remove('hidden'); });
  closeSettingsBtn.addEventListener('click', () => { settingsScreen.classList.add('hidden'); });

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
      o.classList.toggle('active', o.getAttribute('data-value') === val);
    });
  }

  saveConfigBtn.addEventListener('click', () => {
    const config = {
      captchaMethod: captchaMethod.value,
      witKey: witKeyInput.value.trim(),
      solverKey: solverKeyInput.value.trim()
    };
    chrome.storage.local.set(config, () => {
      const oldText = saveConfigBtn.innerText;
      saveConfigBtn.innerText = i18n('btn_save_success', currentLang);
      saveConfigBtn.classList.add('save-success');
      saveConfigBtn.disabled = true;
      setTimeout(() => {
        saveConfigBtn.innerText = oldText;
        saveConfigBtn.classList.remove('save-success');
        saveConfigBtn.disabled = false;
      }, 3000);
    });
  });

  function toggleCaptchaConfig(method) {
    witConfig.classList.toggle('hidden', method !== 'audio');
    apiConfig.classList.toggle('hidden', method === 'audio');
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
      chrome.storage.local.set({ scrapedData: [] }, () => { updateUI([]); });
    }
  });

  function updateUI(data, lang = currentLang) {
    leadCountEl.innerText = data.length;
    let enrichmentCount = data.filter(b => {
      const hasEmail = b.email && b.email !== 'N/A' && b.email !== 'Not Found' && b.email !== 'Pending Stage 2';
      return hasEmail || (b.website && b.website !== 'N/A') || (b.phone && b.phone !== 'N/A') || (b.socials && b.socials.length > 0);
    }).length;
    emailCountEl.innerText = enrichmentCount;
    
    const displayData = [...data].slice(-500).reverse();
    resultsTable.innerHTML = '';
    displayData.forEach(business => {
      const row = document.createElement('tr');
      const emailStatus = business.email === 'Pending Stage 2' ? `<em>${i18n('status_active', lang)}</em>` : (business.email || 'N/A');
      const websiteDisplay = business.website && business.website !== 'N/A' ? `<a href="${business.website}" target="_blank" class="lead-link" title="${business.website}">🔗 Link</a>` : 'N/A';
      const socialsArr = business.socials ? (typeof business.socials === 'string' ? business.socials.split(', ') : business.socials) : [];
      const socialsIcons = Array.isArray(socialsArr) ? socialsArr.map(link => {
        let icon = '📱';
        if (link.includes('facebook.com')) icon = 'FB';
        else if (link.includes('instagram.com')) icon = 'IG';
        else if (link.includes('linkedin.com')) icon = 'LN';
        else if (link.includes('twitter.com') || link.includes('/x.com')) icon = 'TW';
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

  // Export handlers
  exportCsv.onclick = () => { chrome.storage.local.get(['scrapedData'], (r) => { if(r.scrapedData) downloadCsv(r.scrapedData); }); };
  exportTxt.onclick = () => { chrome.storage.local.get(['scrapedData'], (r) => { if(r.scrapedData) downloadTxt(r.scrapedData); }); };
  exportSheet.onclick = () => { chrome.storage.local.get(['scrapedData'], (r) => { if(r.scrapedData) downloadSheet(r.scrapedData); }); };

  function downloadCsv(data) {
    const headers = ['Name', 'Category', 'Rating', 'Reviews', 'Address', 'Phone', 'Website', 'Email', 'Social Media', 'Maps URL'];
    const rows = data.map(b => [`"${b.name || ''}"`, `"${b.category || ''}"`, b.rating || 'N/A', b.reviews || '0', `"${b.address || ''}"`, `"${b.phone || ''}"`, `"${b.website || ''}"`, `"${b.email || ''}"`, `"${b.socials || ''}"`, `"${b.url || ''}"`]);
    const content = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([content], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `bing_leads_${new Date().toISOString().split('T')[0]}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  function downloadTxt(data) {
    const content = data.map(b => `Name: ${b.name}\nWebsite: ${b.website || 'N/A'}\nEmail: ${b.email || 'N/A'}\nPhone: ${b.phone || 'N/A'}\nAddress: ${b.address || 'N/A'}\nSocial Media: ${b.socials || 'N/A'}\nURL: ${b.url}\n------------------------`).join('\n\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `bing_leads_${new Date().toISOString().split('T')[0]}.txt`;
    a.click(); URL.revokeObjectURL(url);
  }

  function downloadSheet(data) {
    const headers = ['Name', 'Category', 'Rating', 'Reviews', 'Address', 'Phone', 'Website', 'Email', 'Social Media', 'Maps URL'];
    const rows = data.map(b => [`"${(b.name || '').replace(/"/g, '""')}"`, `"${(b.category || '').replace(/"/g, '""')}"`, b.rating || 'N/A', b.reviews || '0', `"${(b.address || '').replace(/"/g, '""')}"`, `"${(b.phone || '').replace(/"/g, '""')}"`, `"${(b.website || '').replace(/"/g, '""')}"`, `"${(b.email || '').replace(/"/g, '""')}"`, `"${(b.socials || '').replace(/"/g, '""')}"`, `"${(b.url || '').replace(/"/g, '""')}"`]);
    const content = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `bing_leads_${new Date().toISOString().split('T')[0]}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }
});

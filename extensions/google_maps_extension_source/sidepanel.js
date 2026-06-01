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

// sidepanel.js - UI Logic for GMaps Business Finder (Two-Stage Overhaul)

document.addEventListener('DOMContentLoaded', () => {
  console.log('[SIDEPANEL.JS] DOM Loaded. Initializing elements...');
  
  function safeSendMessage(msg) {
      window.postMessage({ type: 'XPIDER_BRIDGE_RELAY', message: msg }, '*');
      try { chrome.runtime.sendMessage(msg).catch(()=>{}); } catch(e) {}
  }

  // Element Safely Retriever
  function getEl(id) {
      const el = document.getElementById(id);
      if (!el) console.warn(`[SIDEPANEL.JS] Element not found: #${id}`);
      return el;
  }

  const startBtn = getEl('startBtn');
  const stopBtn = getEl('stopBtn');
  const clearBtn = getEl('clearBtn');
  const exportCsv = getEl('exportCsv');
  const exportTxt = getEl('exportTxt');
  const exportSheet = getEl('exportSheet');
  const goToMapsBtn = getEl('goToMapsBtn');
  const navScreen = getEl('navScreen');
  const findEmailsBtn = getEl('findEmailsBtn');
  const stopEmailsBtn = getEl('stopEmailsBtn');
  
  const leadCountEl = getEl('leadCount');
  const emailCountEl = getEl('emailCount');
  const statusBadge = getEl('botStatus');
  const resultsTableObj = getEl('resultsTable');
  const resultsTable = resultsTableObj ? resultsTableObj.querySelector('tbody') : null;
  
  const emailProgressBar = getEl('emailProgressBar');
  const progressBarInner = emailProgressBar ? emailProgressBar.querySelector('.progress-bar') : null;
  const emailProgressLabel = getEl('emailProgress');
  
  // AutoCruiser elements
  const cruiserRange = getEl('cruiserRange');
  const cruiserRangeVal = getEl('cruiserRangeVal');
  const cruiserStep = getEl('cruiserStep');
  const cruiserStepVal = getEl('cruiserStepVal');
  const cruiserSpeed = getEl('cruiserSpeed');
  const cruiserSpeedVal = getEl('cruiserSpeedVal');
  const startCruiserBtn = getEl('startCruiserBtn');
  const cruiserMonitor = getEl('cruiserMonitor');
  const cruiserStatusDot = getEl('cruiserStatusDot');
  const cruiserState = getEl('cruiserState');
  const cruiserDist = getEl('cruiserDist');
  const cruiserNewLeads = getEl('cruiserNewLeads');
  const cruiserDir = getEl('cruiserDir');

  const settingsBtn = getEl('settingsBtn');
  const settingsScreen = getEl('settingsScreen');
  const closeSettingsBtn = getEl('closeSettingsBtn');
  const langSelect = getEl('langSelect');
  
  const captchaMethod = getEl('captchaMethod');
  const witConfig = getEl('witConfig');
  const apiConfig = getEl('apiConfig');
  const witKeyInput = getEl('witKey');
  const solverKeyInput = getEl('solverKey');
  const saveConfigBtn = getEl('saveConfigBtn');
  const methodOptions = document.querySelectorAll('.method-option');

  let currentLang = 'en';

  // Load state and language
  chrome.storage.local.get(['scrapedData', 'scrapingActive', 'language', 'captchaMethod', 'witKey', 'solverKey'], (result) => {
    console.log('[SIDEPANEL.JS] Loaded storage state:', result);
    result = result || {}; // Safety
    currentLang = result.language || 'en';
    if (langSelect) langSelect.value = currentLang;
    if (typeof applyTranslations === 'function') applyTranslations(currentLang);
    
    // Initial lead count for real-time notification
    window.lastLeadCount = result.scrapedData ? result.scrapedData.length : 0;
    
    // Load Captcha Settings
    if (result.captchaMethod && captchaMethod) {
      captchaMethod.value = result.captchaMethod;
      toggleCaptchaConfig(result.captchaMethod);
      updateMethodUI(result.captchaMethod);
    }
    if (result.witKey && witKeyInput) witKeyInput.value = result.witKey;
    if (result.solverKey && solverKeyInput) solverKeyInput.value = result.solverKey;
    
    if (result.scrapedData) updateUI(result.scrapedData, currentLang);
    if (result.scrapingActive) setUIStatus(true, currentLang);
  });

  function isMapPage(url) {
    if (!url) return false;
    return url.includes('google.com/maps') || url.includes('google.co.kr/maps') || url.includes('bing.com/maps') || /google\.[a-z.]+\/maps/.test(url);
  }

  function checkCurrentTab() {
      // checkCurrentTab via XPIDER event data — called after tab-updated event
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0] && tabs[0].url) {
            updateUIForTab(tabs[0].url);
        }
      });
  }

  // Event Driven UI: listen for XPIDER_EVENT tab-updated from ext-preload.js
  // This fires when the browser navigates to a new page
  window.addEventListener('message', (e) => {
    if (!e.data) return;
    if (e.data.type === 'XPIDER_EVENT' && e.data.name === 'tab-updated') {
        const tab = e.data.data && e.data.data.tab;
        const changeInfo = e.data.data && e.data.data.changeInfo;
        const url = tab && tab.url;
        console.log('[SIDEPANEL.JS] XPIDER tab-updated event, url:', url, 'status:', changeInfo && changeInfo.status);
        if (url) {
            updateUIForTab(url);

            // ── [v4.10.55 추가] Google Maps 완전히 로드되자마자 1회 강제 리프레시 수행 ──
            if (isMapPage(url) && changeInfo && changeInfo.status === 'complete') {
                if (window.shouldRefreshGoogleMaps) {
                    window.shouldRefreshGoogleMaps = false; // 즉시 플래그 해제 (무한 루프 방지)
                    console.log('[SIDEPANEL.JS] Google Maps completely loaded! Triggering 1-time refresh...');
                    setTimeout(() => {
                        xpiderUpdateTab({ url: url });
                    }, 500); // 0.5초 딜레이 후 강제 리프레시
                }
            }
        } else {
            checkCurrentTab();
        }
    }
    if (e.data.type === 'XPIDER_EVENT' && e.data.name === 'runtime-on-message') {
        const message = e.data.data;
        if (message.action === 'emailCheckStatus') {
            updateEmailProgress(message);
        }
        if (message.action === 'log') {
            console.log('[MAIN-LOG]', message.message);
        }
    }
    if (e.data.type === 'XPIDER_EVENT' && e.data.name === 'storage-changed') {
        const changes = e.data.data;
        if (changes && changes.scrapedData && changes.scrapedData.newValue) {
            const nd = changes.scrapedData.newValue;
            updateUI(nd);
            // ✅ chrome.storage.local.set 제거 → xpider-ext-storage-set 순환 루프 방지
            // Export는 chrome.storage.local.get 대신 IPC로 직접 extStorage를 읽음
        }
    }
  });

  // Initial Check — delay slightly to let the tab info cache populate
  setTimeout(() => checkCurrentTab(), 1000);
  // Also check when chrome.tabs.onUpdated fires
  if (chrome && chrome.tabs && chrome.tabs.onUpdated) {
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        const url = tab && tab.url;
        if (url) {
            updateUIForTab(url);
        } else {
            checkCurrentTab();
        }
    });
  }

  function updateUIForTab(url) {
      if (!navScreen) return;
      console.log('[SIDEPANEL.JS] updateUIForTab:', url, '→ isMap:', isMapPage(url));
      if (isMapPage(url)) {
          navScreen.classList.add('hidden');

          // ★ 구글맵 로딩 완료 → 30초 딜레이 후 오버레이 숨김
          const overlay = document.getElementById('mapsLoadingOverlay');
          if (overlay && overlay.style.display === 'flex') {
              const msg = document.getElementById('mapsLoadingMsg');
              if (msg) msg.textContent = currentLang === 'ko' ? '초기화 중... (30초 소요)' : 'Initializing... (30s)';
              
              if (window.mapsLoadingTimeout) clearTimeout(window.mapsLoadingTimeout);
              window.mapsLoadingTimeout = setTimeout(() => {
                  overlay.style.display = 'none';
                  if (goToMapsBtn) {
                      goToMapsBtn.disabled = false;
                      goToMapsBtn.innerText = currentLang === 'ko' ? '구글맵으로 이동' : 'Go to Google Maps';
                  }
              }, 30000);
          }
      } else {
          navScreen.classList.remove('hidden');
      }
  }

  // XPIDER BRIDGE HELPERS
  function xpiderUpdateTab(props) {
    // In XPIDER, native chrome.tabs.update may silently fail. Force bridge usage.
    try {
        window.postMessage({ type: 'XPIDER_INVOKE', channel: 'xpider-ext-update-tab', args: props, id: Date.now() }, '*');
    } catch(e) {
        if (chrome && chrome.tabs && chrome.tabs.update) {
            chrome.tabs.update(999, props);
        }
    }
  }

  function xpiderSendMessage(tabId, msg) {
    // Force bridge usage for bulletproof communication
    try {
        window.postMessage({ type: 'XPIDER_INVOKE', channel: 'xpider-ext-send-message', args: { tabId, message: msg }, id: Date.now() }, '*');
    } catch(e) {
        if (chrome && chrome.tabs && chrome.tabs.sendMessage) {
            chrome.tabs.sendMessage(tabId, msg);
        }
    }
  }

  // Attach Listeners with Safety
  if (goToMapsBtn) {
      goToMapsBtn.onclick = (e) => {
          e.target.disabled = true;

          // ★ 딕 오버레이 표시
          const overlay = document.getElementById('mapsLoadingOverlay');
          const msg     = document.getElementById('mapsLoadingMsg');
          if (overlay) {
              if (msg) msg.textContent = currentLang === 'ko' ? '구글맵을 여는 중...' : 'Opening Google Maps...';
              overlay.style.display = 'flex';
          }

          // 검색어가 있으면 바로 검색 결과 맵으로 이동
          const keyword = (document.getElementById('keyword') || document.getElementById('searchInput') || document.getElementById('keywordInput'));
          const kw = keyword ? keyword.value.trim() : '';
          const mapsUrl = kw
              ? `https://www.google.com/maps/search/${encodeURIComponent(kw)}`
              : 'https://www.google.com/maps';

          // ★ 1회 리프레시 플래그 설정 (완전히 로드 시 새로고침 동작 트리거용)
          window.shouldRefreshGoogleMaps = true;

          xpiderUpdateTab({ url: mapsUrl });

          // 30초 후 오버레이 자동 숨김 (보험)
          if (window.mapsFallbackTimeout) clearTimeout(window.mapsFallbackTimeout);
          window.mapsFallbackTimeout = setTimeout(() => {
              if (overlay) overlay.style.display = 'none';
              e.target.disabled = false;
              e.target.innerText = currentLang === 'ko' ? '구글맵으로 이동' : 'Go to Google Maps';
          }, 30000);
      };
  }

  // Go to Bing Maps 버튼 제거됨

  if (startBtn) startBtn.onclick = () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      xpiderSendMessage(tabs[0] ? tabs[0].id : 999999, { action: 'start' });
      safeSendMessage({ action: 'startScraping' });
      setUIStatus(true);
    });
  };

  if (stopBtn) stopBtn.onclick = () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      xpiderSendMessage(tabs[0] ? tabs[0].id : 999999, { action: 'stop' });
      safeSendMessage({ action: 'stopScraping' });
      // Stage 2도 함께 중단
      safeSendMessage({ action: 'stopEmailCheck' });
      setUIStatus(false);
    });
  };

  if (clearBtn) clearBtn.onclick = () => {
    const msg = currentLang === 'ko' ? '수집된 모든 데이터와 캐시를 삭제하시겠습니까?' : 'Clear all collected data and cache?';
    if (confirm(msg)) {
      // 0. 실행 중인 Stage 2 즉시 중단
      safeSendMessage({ action: 'stopEmailCheck' });

      // 1. Background에 clearData 신호 전송 (메인 프로세스 extStorage 완전 카우기)
      safeSendMessage({ action: 'clearData' });

      // 2. chrome.storage.local 완전 삭제
      const keysToRemove = ['scrapedData', 'scrapingActive', 'emailCheckActive', 'cruiserActive', 'processedUrls', 'emailProgress'];
      chrome.storage.local.remove(keysToRemove, () => {
        chrome.storage.local.set({ scrapedData: [] }, () => {
          updateUI([]);
          if (leadCountEl) leadCountEl.innerText = '0';
          if (emailCountEl) emailCountEl.innerText = '0';
          if (emailProgressLabel) { emailProgressLabel.innerText = '0/0'; emailProgressLabel.classList.add('hidden'); }
          if (progressBarInner) progressBarInner.style.width = '0%';
          if (emailProgressBar) emailProgressBar.classList.add('hidden');
          setUIStatus(false);
          const doneMsg = currentLang === 'ko' ? '✅ 데이터 초기화 완료' : '✅ Data cleared successfully';
          alert(doneMsg);
        });
      });
    }
  };

  if (findEmailsBtn) findEmailsBtn.onclick = () => {
    safeSendMessage({ action: 'startEmailCheck' });
    findEmailsBtn.classList.add('hidden');
    if (stopEmailsBtn) stopEmailsBtn.classList.remove('hidden');
    if (emailProgressLabel) emailProgressLabel.classList.remove('hidden');
    if (emailProgressBar) emailProgressBar.classList.remove('hidden');
    // ✅ Bug 1 Fix: Stage 2 실행 시 상태 'Active'로 표시
    setUIStatus(true);
  };

  if (stopEmailsBtn) stopEmailsBtn.onclick = () => {
    safeSendMessage({ action: 'stopEmailCheck' });
    stopEmailsBtn.disabled = true;
    stopEmailsBtn.innerText = currentLang === 'ko' ? '중지 중...' : 'Stopping...';
  };

  // AutoCruiser Listeners
  if (cruiserRange) cruiserRange.oninput = (e) => { if(cruiserRangeVal) cruiserRangeVal.innerText = `${e.target.value} Mi`; };
  if (cruiserStep) cruiserStep.oninput = (e) => { if(cruiserStepVal) cruiserStepVal.innerText = `${parseFloat(e.target.value).toFixed(1)} Mi`; };
  if (cruiserSpeed) cruiserSpeed.oninput = (e) => {
    let val = parseFloat(e.target.value).toFixed(1);
    let label = '';
    if (val <= 0.3) label = currentLang === 'ko' ? '느림' : 'Slow';
    else if (val <= 0.8) label = currentLang === 'ko' ? '보통' : 'Normal';
    else if (val <= 1.5) label = currentLang === 'ko' ? '빠름' : 'Fast';
    else if (val <= 2.5) label = currentLang === 'ko' ? '초고속' : 'Hyper';
    else label = currentLang === 'ko' ? '엕스트리임' : 'Extreme';
    if(cruiserSpeedVal) cruiserSpeedVal.innerText = `${val}x (${label})`;
  };

  if (startCruiserBtn) startCruiserBtn.onclick = () => {
    try {
      const isActive = startCruiserBtn.classList.contains('active');
      console.log('[SIDEPANEL.JS] startCruiserBtn clicked. Current active state:', isActive);
      
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const id = (tabs && tabs[0]) ? tabs[0].id : 999999;
        console.log('[SIDEPANEL.JS] Targeting tab ID:', id);

        if (!isActive) {
          // 1. Send commands to Content Script
          xpiderSendMessage(id, { action: 'start' }); // Force start scraper
          xpiderSendMessage(id, { 
            action: 'startCruiser', 
            range: parseInt(cruiserRange ? cruiserRange.value : 5), 
            stepSize: parseFloat(cruiserStep ? cruiserStep.value : 0.05), 
            speedMult: parseFloat(cruiserSpeed ? cruiserSpeed.value : 1.0) 
          });

          // 2. Notify Background Engine (Stage 2 etc)
          safeSendMessage({ action: 'startScraping' });
          if (currentLang === 'en') safeSendMessage({ action: 'startEmailCheck' });

          // 3. Update UI
          startCruiserBtn.classList.add('active');
          startCruiserBtn.innerText = currentLang === 'ko' ? 'Auto-Cruiser 중지' : 'Stop Auto-Cruiser';
          if(cruiserMonitor) cruiserMonitor.classList.remove('hidden');
          if(cruiserState) cruiserState.innerText = currentLang === 'ko' ? '탐색 중...' : 'Cruising...';
          setUIStatus(true);
        } else {
          // 1. Stop Content Script Logic
          xpiderSendMessage(id, { action: 'stopCruiser' });
          xpiderSendMessage(id, { action: 'stop' });

          // 2. Notify Background (Stage 1 & Stage 2 All Stop)
          safeSendMessage({ action: 'stopScraping' });
          safeSendMessage({ action: 'stopEmailCheck' });

          // 3. Update UI
          startCruiserBtn.classList.remove('active');
          startCruiserBtn.innerText = currentLang === 'ko' ? 'Auto-Cruiser 시작' : 'Initialize Auto-Cruiser';
          if(cruiserState) cruiserState.innerText = currentLang === 'ko' ? '중지됨' : 'Stopped';
          setUIStatus(false);

          // New: Auto-trigger Stage 2 when cruiser stops
          setTimeout(() => {
            if (findEmailsBtn && !findEmailsBtn.classList.contains('hidden') && !findEmailsBtn.disabled) {
                console.log('[SIDEPANEL.JS] Auto-triggering Stage 2 after Cruiser stop');
                findEmailsBtn.click();
            }
          }, 1500);
        }
      });
    } catch (err) {
      console.error('[SIDEPANEL.JS] Error in startCruiserBtn.onclick:', err);
    }
  };

  // Export Listeners
  // Export: chrome.storage.local 대신 IPC로 직접 extStorage(최신 Stage 2 결과)를 읽음
  // chrome.storage.local.get은 xpider-ext-storage-set 순환 루프를 유발할 수 있음
  async function getLatestData() {
      return window.latestScrapedData || [];
  }
  if (exportCsv) exportCsv.onclick = async () => { const d = await getLatestData(); downloadCsv(d); };
  if (exportTxt) exportTxt.onclick = async () => { const d = await getLatestData(); downloadTxt(d); };
  if (exportSheet) exportSheet.onclick = async () => { const d = await getLatestData(); downloadCsv(d); };

  // Settings UI
  if (settingsBtn) settingsBtn.onclick = () => settingsScreen && settingsScreen.classList.remove('hidden');
  if (closeSettingsBtn) closeSettingsBtn.onclick = () => settingsScreen && settingsScreen.classList.add('hidden');
  if (saveConfigBtn) saveConfigBtn.onclick = () => {
    const config = { captchaMethod: captchaMethod.value, witKey: witKeyInput.value, solverKey: solverKeyInput.value };
    chrome.storage.local.set(config, () => {
        saveConfigBtn.innerText = 'Saved!';
        setTimeout(() => { saveConfigBtn.innerText = 'Save Configuration'; }, 2000);
    });
  };

  // Runtime and Storage Message Listeners
  if (chrome && chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((message) => {
          if (message.action === 'emailCheckStatus') updateEmailProgress(message);
          else if (message.action === 'cruiserUpdate') updateCruiserMonitor(message.data);
      });
  }
  
  if (chrome && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes) => {
          if (changes.scrapedData && changes.scrapedData.newValue) {
              const newData = changes.scrapedData.newValue;
              updateUI(newData);
              // ✅ window.lastLeadCount 동기화
              if (cruiserNewLeads) {
                  const prev = window.lastLeadCount || 0;
                  const diff = newData.length - prev;
                  if (diff > 0) cruiserNewLeads.innerText = newData.length;
              }
              window.lastLeadCount = newData.length;
          }
      });
  }

  // UI Helpers
  function updateUI(data, lang = currentLang) {
    window.latestScrapedData = data;
    if (leadCountEl) leadCountEl.innerText = data.length;
    // emailCountEl: 실제 이메일 수집된 건수
    if (emailCountEl) {
        const found = data.filter(b => b.email && b.email !== 'N/A' && b.email !== 'Not Found' && b.email !== 'Pending Stage 2' && b.email !== 'No Website').length;
        emailCountEl.innerText = found;
    }
    if (resultsTable) {
        resultsTable.innerHTML = '';
        data.slice(-10).reverse().forEach(b => {
            const row = document.createElement('tr');
            const socialShort = b.social ? b.social.split(',')[0].trim() : 'N/A';
            row.innerHTML = `<td>${b.name}</td><td>${b.website||'N/A'}</td><td>${b.email||'N/A'}</td><td>${b.phone||'N/A'}</td><td title="${b.social||''}"> ${socialShort}</td>`;
            resultsTable.appendChild(row);
        });
    }
  }

  function setUIStatus(active) {
    if (statusBadge) {
        statusBadge.innerText = active ? 'Active' : 'Ready';
        statusBadge.className = active ? 'status-badge active' : 'status-badge';
    }
    if (startBtn) startBtn.disabled = active;
    if (stopBtn) stopBtn.disabled = !active;
  }

  function toggleCaptchaConfig(method) {
    if (method === 'audio') {
      if(witConfig) witConfig.classList.remove('hidden');
      if(apiConfig) apiConfig.classList.add('hidden');
    } else {
      if(witConfig) witConfig.classList.add('hidden');
      if(apiConfig) apiConfig.classList.remove('hidden');
    }
  }

  function updateMethodUI(val) {
    methodOptions.forEach(o => {
      if (o.getAttribute('data-value') === val) o.classList.add('active');
      else o.classList.remove('active');
    });
  }

  function updateEmailProgress(status) {
      if (status.finished) {
          if (emailProgressLabel) emailProgressLabel.innerText = currentLang === 'ko' ? '탐색 완료' : 'Discovery Complete';
          if (progressBarInner) progressBarInner.style.width = '100%';
          if (findEmailsBtn) findEmailsBtn.classList.remove('hidden');
          if (stopEmailsBtn) {
              stopEmailsBtn.classList.add('hidden');
              stopEmailsBtn.disabled = false;
              stopEmailsBtn.innerText = currentLang === 'ko' ? '중지' : 'Stop';
          }
          // ✅ Bug 1 Fix: 완료 시 Idle로 복귀
          setUIStatus(false);
          // ✅ Bug 2 Fix: 완료 후 최종 카운트 반영
          chrome.storage.local.get(['scrapedData'], (res) => {
              if (emailCountEl && res.scrapedData) {
                  const found = res.scrapedData.filter(b => b.email && b.email !== 'N/A' && b.email !== 'Not Found' && b.email !== 'Pending Stage 2' && b.email !== 'No Website').length;
                  emailCountEl.innerText = found;
              }
          });
      } else {
          if (emailProgressLabel) emailProgressLabel.innerText = status.statusText || `${status.current}/${status.total}`;
          if (progressBarInner && status.total > 0) progressBarInner.style.width = `${(status.current/status.total)*100}%`;
          // ✅ Bug 2 Fix: 진행 중 실시간 카운트 업데이트
          if (emailCountEl && status.current > 0) emailCountEl.innerText = status.current;
      }
  }

  function updateCruiserMonitor(data) {
      if (cruiserDir) cruiserDir.innerText = data.direction || 'Zig-Zag';
      if (cruiserDist) cruiserDist.innerText = `${(data.distance || 0).toFixed ? (data.distance || 0).toFixed(2) : 0} Mi`;
      // ③ 실시간 신규 리드 카운트 업데이트
      if (cruiserNewLeads && data.newLeads !== undefined) {
          cruiserNewLeads.innerText = data.newLeads;
      }
  }

  // ✅ Bug 3 Fix: OS 저장 다이얼로그를 통한 다운로드 (XPIDER IPC 청어 다운로드 나오지 않는 문제 해결)
  async function saveViaIPC(content, filename) {
      try {
          const res = await window.xpiderBridge?.invoke?.('xpider-ext-save-file', { content, filename });
          if (!res || !res.success) throw new Error('IPC fallback');
      } catch(e) {
          const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
          const link = document.createElement('a');
          link.href = URL.createObjectURL(blob);
          link.setAttribute('download', filename);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
      }
  }

  function downloadCsv(data) {
    if (!data || data.length === 0) return alert('No data to export');
    const headers = ['Name', 'Category', 'Address', 'Website', 'Email', 'Phone', 'Rating', 'Reviews', 'Social'];
    const rows = data.map(b => [
        `"${(b.name || '').replace(/"/g, '""')}"`,
        `"${(b.category || '').replace(/"/g, '""')}"`,
        `"${(b.address || '').replace(/"/g, '""')}"`,
        b.website || 'N/A',
        b.email || 'N/A',
        `"${(b.phone || '').replace(/"/g, '""')}"`,
        b.rating || '0',
        b.reviews || '0',
        `"${(b.social || '').replace(/"/g, '""')}"`
    ].join(','));
    const csvContent = [headers.join(','), ...rows].join('\n');
    saveViaIPC('\uFEFF' + csvContent, `xpider_leads_${Date.now()}.csv`);
  }

  function downloadTxt(data) {
    if (!data || data.length === 0) return alert('No data to export');
    let txt = 'XPIDER LEADS EXPORT\n' + '='.repeat(30) + '\n\n';
    data.forEach(b => {
        txt += `NAME: ${b.name}\n`;
        txt += `WEBSITE: ${b.website || 'N/A'}\n`;
        txt += `EMAIL: ${b.email || 'N/A'}\n`;
        txt += `PHONE: ${b.phone || 'N/A'}\n`;
        txt += `ADDRESS: ${b.address || 'N/A'}\n`;
        txt += `SOCIAL: ${b.social || 'N/A'}\n`;
        txt += '-'.repeat(30) + '\n';
    });
    saveViaIPC(txt, `xpider_leads_${Date.now()}.txt`);
  }

  function downloadSheet(data) {
    // Spreadsheet compatible CSV
    downloadCsv(data);
  }

  function showToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'xpider-toast';
    toast.innerText = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 100);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => document.body.removeChild(toast), 500);
    }, 3000);
  }

  // Unified XPIDER_EVENT listener (storage-changed, runtime-on-message, cruiser-stopped)
  window.addEventListener('message', (e) => {
    if (!e.data || e.data.type !== 'XPIDER_EVENT') return;
    const { name, data } = e.data;

    // ③ Storage 변경 실시간 UI 업데이트
    if (name === 'storage-changed') {
        if (data && data.scrapedData) {
            const newData = data.scrapedData.newValue || [];
            updateUI(newData, currentLang);
            // ✅ chrome.storage.local.set 제거 → 순환 루프 방지
            // (extStorage는 main.js가 단독 관리, 사이드패널은 표시만 담당)
            if (newData.length > (window.lastLeadCount || 0)) {
                const diff = newData.length - (window.lastLeadCount || 0);
                showToast(`+${diff} ${currentLang === 'ko' ? '개 신규 리드 발견!' : 'new lead(s)!'}`);
                window.lastLeadCount = newData.length;
                if (cruiserNewLeads) cruiserNewLeads.innerText = newData.length;
            }
        }
    }


    // ③ cruiserUpdate 실시간 업데이트
    if (name === 'runtime-on-message') {
        if (data && data.action === 'cruiserUpdate') {
            updateCruiserMonitor(data.data || data);
        }
        if (data && data.action === 'emailCheckStatus') {
            updateEmailProgress(data);
        }
    }

    // ⑤ cruiser-stopped → UI 상태만 리셋 (Stage 2 자동 시작 제거)
    if (name === 'cruiser-stopped') {
        console.log('[SIDEPANEL.JS] Cruiser stopped.');
        startCruiserBtn.classList.remove('active');
        startCruiserBtn.innerText = currentLang === 'ko' ? 'Auto-Cruiser 시작' : 'Initialize Auto-Cruiser';
        if (cruiserState) cruiserState.innerText = currentLang === 'ko' ? '완료' : 'Done';
        setUIStatus(false);
    }
    // [XPIDER] 브라우저 언어 변경 신호 수신
    if (name === 'language-change') {
        const lang = data && data.lang;
        if (lang) {
            currentLang = lang;
            if (langSelect) langSelect.value = lang;
            if (typeof applyTranslations === 'function') applyTranslations(lang);
            chrome.storage.local.set({ language: lang });
        }
    }
  });
});

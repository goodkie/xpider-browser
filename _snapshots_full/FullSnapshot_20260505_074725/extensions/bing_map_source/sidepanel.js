// sidepanel.js - UI Logic for Bing Maps Business Finder (Two-Stage Overhaul + GMaps Port)

document.addEventListener('DOMContentLoaded', () => {
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const clearBtn = document.getElementById('clearBtn');
  const exportCsv = document.getElementById('exportCsv');
  const exportTxt = document.getElementById('exportTxt');
  const exportSheet = document.getElementById('exportSheet');
   const goToBingBtn = document.getElementById('goToBingBtn');
   const navScreen = document.getElementById('navScreen');
   const findEmailsBtn = document.getElementById('findEmailsBtn');
   const stopEmailsBtn = document.getElementById('stopEmailsBtn');
  
  // ==========================================
  // XPIDER IPC BRIDGE POLYFILLS
  // ==========================================
  console.log('[SIDEPANEL.JS] Injecting chrome.tabs.query polyfill');
  chrome.tabs.query = function(queryInfo, callback) {
      console.log('[XPIDER-BRIDGE] Intercepting chrome.tabs.query');
      const listener = (event) => {
          if (event.data && event.data.type === 'XPIDER_RESPONSE' && event.data.id === 'queryTabBridge') {
              window.removeEventListener('message', listener);
              const activeTab = event.data.result;
              console.log('[XPIDER-BRIDGE] Received active tab from main:', activeTab);
              if (activeTab) callback([activeTab]);
              else callback([{ id: 999999 }]); // Fallback mock tab
          }
      };
      window.addEventListener('message', listener);
      window.postMessage({ type: 'XPIDER_INVOKE', channel: 'xpider-ext-get-active-tab', args: {}, id: 'queryTabBridge' }, '*');
      
      setTimeout(() => {
          window.removeEventListener('message', listener);
          callback([{ id: 999999 }]);
      }, 1000);
  };

  chrome.tabs.create = function(props, callback) {
      console.log('[XPIDER-BRIDGE] Intercepting chrome.tabs.create (Background)', props);
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
      console.log('[XPIDER-BRIDGE] Intercepting chrome.scripting.executeScript', injection);
      const listener = (event) => {
          if (event.data && event.data.type === 'XPIDER_RESPONSE' && event.data.id === 'execScriptBridge') {
              window.removeEventListener('message', listener);
              if (callback) callback([{ result: event.data.result }]);
          }
      };
      window.addEventListener('message', listener);
      
      // If injection contains a function, we need to stringify it
      if (injection.func) {
          injection.funcString = injection.func.toString();
          delete injection.func;
      }

      window.postMessage({ type: 'XPIDER_INVOKE', channel: 'xpider-ext-execute-script', args: injection, id: 'execScriptBridge' }, '*');
  };

  chrome.downloads = chrome.downloads || {};
  chrome.downloads.download = function(options) {
      console.log('[XPIDER-BRIDGE] Intercepting chrome.downloads.download', options);
      const a = document.createElement('a');
      a.href = options.url;
      a.download = options.filename || 'download';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => a.remove(), 100);

      // ★ Record download in browser history
      window.postMessage({
          type: 'XPIDER_INVOKE',
          channel: 'record-download',
          args: {
              url: options.url,
              filename: options.filename || 'download',
              timestamp: new Date().toISOString()
          },
          id: 'recordDownload_' + Date.now()
      }, '*');
  };
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

    // Display version
    const manifest = chrome.runtime.getManifest();
    document.getElementById('appVersion').innerText = manifest.version || '1.1.0';
    
    // Mark as XPIDER environment for background script
    chrome.storage.local.set({ isXpider: true });
  });

  // Listen for language change events from XPIDER bridge
  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'XPIDER_EVENT' && event.data.name === 'language-change') {
      const lang = event.data.data.lang;
      console.log('[XPIDER-BRIDGE] Language change request received:', lang);
      if (langSelect.value !== lang) {
        langSelect.value = lang;
        currentLang = lang;
        chrome.storage.local.set({ language: lang }, () => {
          applyTranslations(lang);
          chrome.storage.local.get(['scrapedData', 'scrapingActive'], (res) => {
            updateUI(res.scrapedData || [], lang);
            setUIStatus(res.scrapingActive || false, lang);
          });
        });
      }
    }
  });

  checkCurrentTab();
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'complete') checkCurrentTab();
  });

  function isSupportedMap(url) {
    if (!url) return false;
    const isGoogle = url.includes('google.com/maps') || url.includes('google.co.kr/maps') || url.includes('google.co.jp/maps') || /google\.[a-z.]+\/maps/.test(url);
    const isBing = url.includes('bing.com/maps');
    return isGoogle || isBing;
  }

  function checkCurrentTab() {
    window.postMessage({ type: 'XPIDER_INVOKE', channel: 'xpider-ext-get-active-tab', args: {}, id: 'checkTab' }, '*');
    
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs[0];
        if (activeTab && isSupportedMap(activeTab.url)) {
          navScreen.classList.add('hidden');
        } else {
          // If native query says we are NOT on maps, but we are in XPIDER, 
          // we wait for the bridge response to be sure.
        }
      });
    } catch(e) {}
  }

  // Helper to ensure messages reach main.js even if native IPC fails
  function safeSendMessage(msg) {
      window.postMessage({ type: 'XPIDER_BRIDGE_RELAY', message: msg }, '*');
      try { chrome.runtime.sendMessage(msg).catch(()=>{}); } catch(e) {}
  }

  // Handle Bridge Responses
  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'XPIDER_RESPONSE' && event.data.id === 'checkTab') {
      const activeTab = event.data.result;
      if (activeTab && isSupportedMap(activeTab.url)) {
        navScreen.classList.add('hidden');
      } else {
        navScreen.classList.remove('hidden');
      }
    }
    if (event.data && event.data.type === 'XPIDER_EVENT' && event.data.name === 'tab-updated') {
        checkCurrentTab();
    }
  });

  // XPIDER BRIDGE HELPER
  function xpiderUpdateTab(props) {
    console.log('[XPIDER-BRIDGE] Requesting tab update:', props);
    window.postMessage({ type: 'XPIDER_INVOKE', channel: 'xpider-ext-update-tab', args: props, id: Date.now() }, '*');
  }

  goToBingBtn.addEventListener('click', () => {
    showLoadingOverlay('Opening Bing Maps...');
    xpiderUpdateTab({ url: 'https://www.bing.com/maps/myplaces' });
    try { chrome.tabs.update({ url: 'https://www.bing.com/maps/myplaces' }); } catch(e) {}
  });

  function showLoadingOverlay(text) {
    const existing = document.getElementById('xpider-loading-overlay');
    if (existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.id = 'xpider-loading-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;z-index:99999;flex-direction:column;gap:12px;';
    overlay.innerHTML = `<div style="width:36px;height:36px;border:3px solid rgba(255,255,255,0.2);border-top-color:#60a5fa;border-radius:50%;animation:spin 0.8s linear infinite;"></div><div style="color:#e2e8f0;font-size:13px;font-weight:600;">${text}</div><style>@keyframes spin{to{transform:rotate(360deg)}}</style>`;
    document.body.appendChild(overlay);
    setTimeout(() => overlay.remove(), 6000);
  }

  // Fallback listener for XPIDER IPC messages (bypasses broken native onMessage)
  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'XPIDER_EVENT' && event.data.name === 'runtime-on-message') {
      const message = event.data.data;
      if (!message || !message.action) return;
      
      if (message.action === 'dataUpdated') {
        chrome.storage.local.set({ scrapedData: message.data });
        updateUI(message.data);
      } else if (message.action === 'emailCheckStatus') {
        updateEmailProgress(message);
      } else if (message.action === 'cruiserUpdate') {
        updateCruiserMonitor(message.data);
      } else if (message.action === 'PROXY_SCAN') {
        handleProxyScan(message.url, message.waitMs, message.requestId);
      }
    }
  });

  // Listen for messages
  chrome.runtime.onMessage.addListener((message) => {
    console.log('[SIDEPANEL.JS] Received message:', message.action);
    if (message.action === 'dataUpdated') {
      // ★ Sync real-time storage so exports always reflect latest Stage 2 results
      chrome.storage.local.set({ scrapedData: message.data });
      updateUI(message.data);
    } else if (message.action === 'emailCheckStatus') {
      updateEmailProgress(message);
    } else if (message.action === 'cruiserUpdate') {
      updateCruiserMonitor(message.data);
    } else if (message.action === 'PROXY_SCAN') {
      console.log('[SIDEPANEL] PROXY_SCAN requested for:', message.url);
      handleProxyScan(message.url, message.waitMs, message.requestId);
    }
  });

  // ★ XPIDER storage-changed 실시간 감지
  // main.js가 foundBusiness 처리 후 xpider-ext-storage-changed를 보내므로 sidepanel에서 수신
  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'XPIDER_EVENT' && event.data.name === 'storage-changed') {
      const changes = event.data.data;
      if (changes && changes.scrapedData) {
        const newData = changes.scrapedData.newValue || [];
        console.log('[SIDEPANEL.JS] storage-changed: scrapedData updated, count=', newData.length);
        updateUI(newData, currentLang);
      }
    }
  });


  async function handleProxyScan(url, waitMs, requestId) {
      console.log('[SIDEPANEL] Performing Proxy Scan for:', url);
      try {
          chrome.tabs.create({ url: url, active: false }, (tab) => {
              if (!tab) return chrome.runtime.sendMessage({ action: 'PROXY_SCAN_RESULT', requestId, result: {} });
              
              setTimeout(() => {
                  chrome.scripting.executeScript({
                      target: { tabId: tab.id },
                      func: () => {
                          const text = document.body ? document.body.innerText : '';
                          const html = document.body ? document.body.innerHTML : '';

                          // ── 1. Email extraction (Text + Mailto + Obfuscated) ──
                          const emails = new Set();
                          
                          // Standard Regex
                          const emailRegex = /([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/gi;
                          (text.match(emailRegex) || []).forEach(e => {
                            const email = e.toLowerCase();
                            if (!email.match(/\.(png|jpg|jpeg|gif|svg|webp|css|js)$/)) emails.add(email);
                          });
                          
                          (html.match(emailRegex) || []).forEach(e => {
                            const email = e.toLowerCase();
                            if (!email.match(/\.(png|jpg|jpeg|gif|svg|webp|css|js)$/)) emails.add(email);
                          });

                          // Mailto links
                          document.querySelectorAll('a[href^="mailto:" i]').forEach(a => {
                            try {
                              const email = decodeURIComponent(a.href.replace(/^mailto:/i, '').split('?')[0].trim()).toLowerCase();
                              if (email.includes('@')) emails.add(email);
                            } catch(e){}
                          });

                          // Obfuscated (e.g., name [at] domain.com)
                          const obfuscatedRegex = /[a-zA-Z0-9._%+\-]+(?:\s*\[\s*at\s*\]\s*|\s*\(\s*at\s*\)\s*|\s*@\s*| {1,3}at {1,3})[a-zA-Z0-9.\-]+\s*(?:\[\s*dot\s*\]|\(\s*dot\s*\)|\.| {1,3}dot {1,3})\s*[a-zA-Z]{2,}/gi;
                          (text.match(obfuscatedRegex) || []).forEach(e => {
                            const clean = e.replace(/\[\s*at\s*\]|\(\s*at\s*\)| at /gi, '@').replace(/\[\s*dot\s*\]|\(\s*dot\s*\)| dot /gi, '.').replace(/\s+/g, '');
                            if (clean.includes('@') && clean.includes('.')) emails.add(clean.toLowerCase());
                          });

                          const filteredEmails = [...emails].filter(e =>
                            !e.includes('example') && !e.includes('domain') && !e.includes('yourname') && !e.includes('email@') && e.length < 80 && e.length > 5
                          );

                          // ── 2. Phone extraction ──
                          const phoneRegex = /(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g;
                          const phones = text.match(phoneRegex) || [];

                          // ── 3. Contact page detection (Text + Attributes + Icons) ──
                          const CONTACT_SEGMENTS = ['contact', 'contact-us', 'contactus', 'about', 'about-us', 'aboutus',
                            'get-in-touch', 'connect', 'reach-us', 'kontakt', 'impressum', 'company',
                            '연락처', '문의', '고객센터', '오시는길', 'support', 'help', 'team', 'legal', 'privacy', 'terms',
                            'info', 'service', 'location', 'find-us', 'directorio', 'contacto', 'nous-joindre', 'coordonnees', 'staff', 'meet-us', 'our-story'];
                          const CONTACT_BLOCKLIST = ['contact-lens', 'contacts-app', 'contactless', 'contact-form7', 'contact-allergy', 'login', 'signup', 'cart', 'checkout'];

                          const contactLinks = new Set();
                          document.querySelectorAll('a[href]').forEach(a => {
                            try {
                              const href = (a.href || '').toLowerCase();
                              const aText = (a.innerText || '').trim().toLowerCase();
                              const aTitle = (a.title || '').toLowerCase();
                              const aAria = (a.getAttribute('aria-label') || '').toLowerCase();
                              
                              if (!href.startsWith('http')) return;
                              if (CONTACT_BLOCKLIST.some(bl => href.includes(bl))) return;

                              const urlObj = new URL(href);
                              const pathSegments = urlObj.pathname.split('/').filter(Boolean);
                              
                              const matchesPath = pathSegments.some(seg => CONTACT_SEGMENTS.includes(seg));
                              const matchesText = CONTACT_SEGMENTS.some(kw => aText.includes(kw) || aTitle.includes(kw) || aAria.includes(kw));
                              
                              // Icon check (e.g., <a href="/contact"><img src="contact.png"></a>)
                              const hasContactIcon = a.querySelector('img[src*="contact" i], img[alt*="contact" i], svg[class*="contact" i]');

                              if (matchesPath || matchesText || hasContactIcon) {
                                contactLinks.add(a.href);
                              }
                            } catch (_) {}
                          });

                          // ── 4. Social media (Extended) ──
                          const SOCIAL_PLATFORMS = ['facebook.com', 'instagram.com', 'twitter.com', 'x.com', 'linkedin.com', 'youtube.com', 'tiktok.com', 'pinterest.com', 'yelp.com', 'linktr.ee', 'wa.me', 't.me', 'discord.gg', 'snapchat.com'];
                          const SOCIAL_BLOCKLIST = ['/embed/', '/share', '/intent', '/shout', 'shoutout.wix', '/like', '/pixel', '/tr?', '/login', '/signup', 'google.com/search'];
                          
                          const socialLinks = new Set();
                          document.querySelectorAll('a[href]').forEach(a => {
                            try {
                              const href = a.href;
                              if (!SOCIAL_PLATFORMS.some(p => href.toLowerCase().includes(p))) return;
                              if (SOCIAL_BLOCKLIST.some(bl => href.toLowerCase().includes(bl))) return;
                              
                              const urlObj = new URL(href);
                              if (urlObj.hostname.includes('youtube.com') && urlObj.pathname === '/watch') {
                                socialLinks.add(href);
                              } else {
                                socialLinks.add(urlObj.origin + urlObj.pathname);
                              }
                            } catch(e) {}
                          });

                          // ── 5. Address extraction ──
                          const koAddressRegex = /([가-힣]+(?:특별시|광역시|특별자치시|도|특별자치도)\s*[가-힣]+(?:시|군|구)\s*[가-힣0-9\-\s]+(?:로|길|대로|가)\s*\d+[가-힣0-9\-\s,]*)/;
                          const caAddressRegex = /\d{1,5}[,\s]+[A-Za-zÀ-ÿ0-9\s.'-]+(?:Avenue|Ave|Street|St|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Way|Court|Ct|Plaza|Square|Suite|Ste|Unit|Rue|Boul|Route|Chemin|Montée|Rang)[.,\s]+[A-Za-zÀ-ÿ\s]+[.,\s]+(?:[A-Z]{2}[,\s]+)?(?:[A-Z]\d[A-Z]\s*\d[A-Z]\d|\d{5}(?:-\d{4})?)/i;

                          let detectedAddress = null;
                          const koMatch = text.match(koAddressRegex);
                          if (koMatch) detectedAddress = koMatch[0];
                          else {
                            const caMatch = text.match(caAddressRegex);
                            if (caMatch) detectedAddress = caMatch[0];
                          }

                          // ── 6. Homepage extraction (for search results) ──
                          let homepage = null;
                          if (window.location.hostname.includes('bing.com') || window.location.hostname.includes('google.com')) {
                            const resultLinks = document.querySelectorAll('h2 a, .b_algo h2 a, #search .g a');
                            for (const a of resultLinks) {
                              const href = a.href;
                              if (!href || href.includes('bing.com') || href.includes('google.com') || href.includes('microsoft.com') || href.includes('facebook.com') || href.includes('yelp.com')) continue;
                              homepage = href;
                              break;
                            }
                          }

                          return {
                            emails: filteredEmails.join(', '),
                            phone: phones[0] || null,
                            socials: [...socialLinks].slice(0, 10),
                            contactLinks: [...contactLinks].slice(0, 10),
                            address: detectedAddress,
                            homepage: homepage,
                            pageText: text.substring(0, 3000)
                          };
                      }
                  }, (results) => {
                      const res = results && results[0] ? results[0].result : {};
                      safeSendMessage({ action: 'PROXY_SCAN_RESULT', requestId, result: res });
                  });
              }, waitMs);
          });
      } catch (e) {
          console.error('[SIDEPANEL] Proxy Scan Error:', e);
          safeSendMessage({ action: 'PROXY_SCAN_RESULT', requestId, result: {} });
      }
  }

  function xpiderSendMessage(tabId, msg) {
    console.log('[XPIDER-BRIDGE] Requesting message send:', msg);
    window.postMessage({ type: 'XPIDER_INVOKE', channel: 'xpider-ext-send-message', args: { tabId, message: msg }, id: Date.now() }, '*');
    try { chrome.tabs.sendMessage(tabId, msg); } catch(e) {}
  }

  startBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      xpiderSendMessage(tabs[0] ? tabs[0].id : 999999, { action: 'start' });
      safeSendMessage({ action: 'startScraping' });
      setUIStatus(true);
      // ★ 웹뷰 큐 폴링 시작 — content.js가 sendMessageSafe로 저장한 데이터를 수획
      startWebviewQueuePolling();
    });
  });

  stopBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      xpiderSendMessage(tabs[0] ? tabs[0].id : 999999, { action: 'stop' });
      safeSendMessage({ action: 'stopScraping' });
      setUIStatus(false);
      // ★ 폴링 중지
      stopWebviewQueuePolling();
      
      // AUTO-TRIGGER Stage 2 for English manually stopped
      if (currentLang === 'en') {
          setTimeout(() => {
              console.log("[SIDEPANEL] Auto-triggering Stage 2/3 for English environment...");
              findEmailsBtn.click();
          }, 500);
      }
    });
  });

  findEmailsBtn.addEventListener('click', () => {
    console.log('[SIDEPANEL] findEmailsBtn clicked. Sending startEmailCheck...');
    safeSendMessage({ action: 'startEmailCheck' });
    findEmailsBtn.classList.add('hidden');
    stopEmailsBtn.classList.remove('hidden');
    stopEmailsBtn.disabled = false;
    stopEmailsBtn.innerText = 'Stop';
    emailProgressLabel.classList.remove('hidden');
    emailProgressBar.classList.remove('hidden');
    setUIStatus(true, currentLang);
  });

  stopEmailsBtn.addEventListener('click', () => {
    safeSendMessage({ action: 'stopEmailCheck' });
    stopEmailsBtn.disabled = true;
    stopEmailsBtn.innerText = 'Stopping...';
    setUIStatus(false, currentLang);
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
        const tabId = tabs[0] ? tabs[0].id : 999999;

        // [Stage 1] 스크래퍼 시작
        xpiderSendMessage(tabId, { action: 'start' });
        safeSendMessage({ action: 'startScraping' });

        // [Cruiser] content.js MapCruiser 시작 (지그재그 탐색 루프)
        xpiderSendMessage(tabId, {
          action: 'startCruiser',
          range: range,
          stepSize: stepSize,
          speedMult: speedMult
        });

        // ★ [핵심] renderer_ui.js에 startHardwareCruiser 신호 → Bing 드래그 큐 폴링 시작
        // STEP 1: XPIDER_INVOKE로 main.js를 통해 renderer로 브로드캐스트
        window.postMessage({
          type: 'XPIDER_INVOKE',
          channel: 'xpider-ext-runtime-send-message',
          args: { message: { action: 'startHardwareCruiser', config: { stepSize, range, speedMult } } },
          id: 'cruiser_hw_start_' + Date.now()
        }, '*');

        // STEP 2: 웹뷰 큐 폴링 시작 — content.js sendMessageSafe 데이터 수집
        startWebviewQueuePolling();

        // UI 업데이트
        startCruiserBtn.classList.add('active');
        startCruiserBtn.innerText = i18n('btn_stop_cruiser', currentLang);
        cruiserStatusDot.classList.add('active');
        cruiserMonitor.classList.remove('hidden');
        setUIStatus(true, currentLang);
        setCruiserState('STAGE 1: MAP EXPLORATION ACTIVE');
        console.log(`[CRUISER] ▶ AutoCruiser Pro started. Range=${range}mi Step=${stepSize}mi Speed=${speedMult}x`);
      });
    } else {
      // 크루저 정지 → Stage 2 딥서치 시작
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tabId = tabs[0] ? tabs[0].id : 999999;
        xpiderSendMessage(tabId, { action: 'stopCruiser' });
        xpiderSendMessage(tabId, { action: 'stop' });
        safeSendMessage({ action: 'stopScraping' });

        // 하드웨어 크루저 정지
        window.postMessage({
          type: 'XPIDER_INVOKE',
          channel: 'xpider-ext-runtime-send-message',
          args: { message: { action: 'stopHardwareCruiser' } },
          id: 'cruiser_hw_stop_' + Date.now()
        }, '*');
        stopWebviewQueuePolling();

        setCruiserState('STAGE 2/3: DEEP SEARCH RUNNING...');
        safeSendMessage({ action: 'startEmailCheck' });
        startCruiserBtn.classList.remove('active');
        startCruiserBtn.innerText = i18n('deep_search_active', currentLang);
        startCruiserBtn.disabled = true;

        findEmailsBtn.classList.add('hidden');
        stopEmailsBtn.classList.remove('hidden');
        emailProgressLabel.classList.remove('hidden');
        emailProgressBar.classList.remove('hidden');

        setUIStatus(false, currentLang);
        console.log('[CRUISER] ⏹ AutoCruiser stopped. Stage 2 started.');
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
      stopEmailsBtn.innerText = 'Stop';
      setUIStatus(false, currentLang);

      if (startCruiserBtn.innerText === 'Deep Search Active...' || startCruiserBtn.innerText.includes('수집 중')) {
          setCruiserState('MISSION COMPLETE');
          setTimeout(() => {
              resetCruiserUI();
          }, 3000);
      }

      // ★ Refresh UI with latest data for accurate emailCount
      chrome.storage.local.get(['scrapedData'], (res) => {
        updateUI(res.scrapedData || [], currentLang);
      });

      setTimeout(() => {
        emailProgressLabel.classList.add('hidden');
        emailProgressBar.classList.add('hidden');
      }, 3000);
      return;
    }

    emailProgressLabel.innerText = statusText || `${current}/${total}`;
    const percent = total > 0 ? (current / total) * 100 : 0;
    progressBarInner.style.width = `${percent}%`;

    // ★ Real-time emailCount update during Stage 2
    chrome.storage.local.get(['scrapedData'], (res) => {
      const data = res.scrapedData || [];
      const found = data.filter(b => b.email && b.email !== 'N/A' && b.email !== 'Not Found' && b.email !== 'Pending Stage 2').length;
      emailCountEl.innerText = found;
    });

    if (startCruiserBtn.innerText === 'Deep Search Active...' || startCruiserBtn.innerText.includes('수집 중')) {
        setCruiserState(statusText || `STAGE 2: ${current}/${total}`);
    }
  }

  clearBtn.addEventListener('click', () => {
    if (confirm('Clear all collected data? This will reset ALL leads to 0.')) {
      console.log('[CLEAR] ★ Full data wipe initiated...');

      // 1. Stage 2 중지 + 크루저 중지
      chrome.runtime.sendMessage({ action: 'stopEmailCheck' });
      stopWebviewQueuePolling();

      // 2. content.js scraper 내부 메모리 완전 초기화
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        xpiderSendMessage(tabs[0] ? tabs[0].id : 999999, { action: 'clearData' });
      });

      // 3. background.js 메모리 초기화
      chrome.runtime.sendMessage({ action: 'clearData' });

      // 4. ★ main.js extStorage 파일 수준 완전 리셋 (XPIDER IPC 경로)
      window.postMessage({
        type: 'XPIDER_INVOKE',
        channel: 'xpider-ext-runtime-send-message',
        args: { message: { action: 'clearData' } },
        id: 'clearData_' + Date.now()
      }, '*');

      // 5. chrome.storage 완전 초기화 (scrapedData를 빈 배열로 강제 덮어쓰기)
      chrome.storage.local.set({
        scrapedData: [],
        scrapingActive: false,
        emailCheckActive: false,
        cruiserActive: false
      }, () => {
        // 6. UI 즉시 0으로 리셋
        updateUI([]);
        setUIStatus(false, currentLang);
        leadCountEl.innerText = '0';
        emailCountEl.innerText = '0';
        findEmailsBtn.classList.remove('hidden');
        stopEmailsBtn.classList.add('hidden');
        emailProgressLabel.classList.add('hidden');
        emailProgressBar.classList.add('hidden');
        progressBarInner.style.width = '0%';
        emailProgressLabel.innerText = '0/0';
        // 7. AutoCruiser UI 초기화
        resetCruiserUI();
        startCruiserBtn.disabled = false;
        console.log('[CLEAR] ✅ All data cleared. Leads = 0.');
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
      const emailStatus = business.email === 'Pending Stage 2'
        ? `<em style="color:#f59e0b;">${lang === 'ko' ? '수집 중...' : i18n('status_active', lang)}</em>`
        : (business.email && business.email !== 'N/A' && business.email !== 'Not Found'
            ? `<a href="mailto:${business.email}" style="color:#10b981;text-decoration:none;" title="${business.email}">${business.email.length > 22 ? business.email.substring(0,20)+'...' : business.email}</a>`
            : (business.email || 'N/A'));
      const websiteDisplay = business.website && business.website !== 'N/A'
        ? `<a href="${business.website}" target="_blank" style="color:var(--primary);text-decoration:none;" title="${business.website}">🌐 Link</a>` : 'N/A';
      const addrDisplay = business.address && business.address !== 'N/A'
        ? `<span title="${business.address}" style="cursor:help;font-size:11px;">📍 ${business.address.length > 20 ? business.address.substring(0,18)+'...' : business.address}</span>` : 'N/A';
      const socialDisplay = business.social && business.social !== 'N/A'
        ? (() => {
            const links = business.social.split(', ').slice(0, 3);
            return links.map(l => {
              const icon = l.includes('facebook') ? '📘' : l.includes('instagram') ? '📸' : l.includes('linkedin') ? '💼' : l.includes('youtube') ? '▶️' : l.includes('tiktok') ? '🎵' : '🔗';
              return `<a href="${l}" target="_blank" style="text-decoration:none;margin-right:2px;" title="${l}">${icon}</a>`;
            }).join('');
          })()
        : 'N/A';
      row.innerHTML = `
        <td style="font-weight:600;">${business.name}</td>
        <td>${websiteDisplay}</td>
        <td style="color:${business.email && business.email !== 'N/A' && business.email !== 'Not Found' && business.email !== 'Pending Stage 2' ? '#10b981' : 'inherit'};font-size:11px;">${emailStatus}</td>
        <td style="font-size:11px;">${business.phone || 'N/A'}</td>
        <td style="font-size:11px;">${addrDisplay}</td>
        <td>${socialDisplay}</td>
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

  // ★ Native OS Save Dialog via XPIDER IPC
  function saveViaIPC(content, filename, mimeType) {
    console.log('[EXPORT] Attempting to save:', filename);
    
    // Direct bridge check
    const isXpider = window.navigator.userAgent.includes('XPIDER') || !!window.chrome.runtime;
    
    if (isXpider) {
      window.postMessage({
        type: 'XPIDER_INVOKE',
        channel: 'xpider-ext-save-file',
        args: { content, filename, mimeType },
        id: 'saveFile_' + Date.now()
      }, '*');
      
      // Also try chrome.runtime message as a secondary bridge if handled
      chrome.runtime.sendMessage({
        action: 'NATIVE_SAVE',
        data: { content, filename, mimeType }
      }).catch(() => {});
      
      console.log('[EXPORT] IPC Message Sent');
    } else {
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 200);
    }
  }

  function downloadCsv(data) {
    const headers = ['Name', 'Category', 'Rating', 'Reviews', 'Address', 'Phone', 'Website', 'Email', 'Social Media'];
    const rows = data.map(b => [
      `"${(b.name||'').replace(/"/g,'""')}"`,`"${(b.category||'').replace(/"/g,'""')}"`,
      b.rating||'N/A', b.reviews||'0',
      `"${(b.address||'').replace(/"/g,'""')}"`,`"${(b.phone||'').replace(/"/g,'""')}"`,
      `"${(b.website||'').replace(/"/g,'""')}"`,`"${(b.email||'').replace(/"/g,'""')}"`,
      `"${(b.social||'').replace(/"/g,'""')}"`
    ]);
    const content = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    saveViaIPC(content, `bing_leads_${new Date().toISOString().split('T')[0]}.csv`, 'text/csv');
  }

  function downloadTxt(data) {
    const content = data.map(b =>
      `Name: ${b.name}\nWebsite: ${b.website||'N/A'}\nEmail: ${b.email||'N/A'}\nPhone: ${b.phone||'N/A'}\nSocial: ${b.social||'N/A'}\nAddress: ${b.address||'N/A'}\n${'-'.repeat(40)}`
    ).join('\n\n');
    saveViaIPC(content, `bing_leads_${new Date().toISOString().split('T')[0]}.txt`, 'text/plain');
  }

  function downloadSheet(data) {
    const headers = ['Name', 'Category', 'Rating', 'Reviews', 'Address', 'Phone', 'Website', 'Email', 'Social Media', 'Maps URL'];
    const rows = data.map(b => [
      `"${(b.name||'').replace(/"/g,'""')}"`,`"${(b.category||'').replace(/"/g,'""')}"`,
      b.rating||'N/A', b.reviews||'0',
      `"${(b.address||'').replace(/"/g,'""')}"`,`"${(b.phone||'').replace(/"/g,'""')}"`,
      `"${(b.website||'').replace(/"/g,'""')}"`,`"${(b.email||'').replace(/"/g,'""')}"`,
      `"${(b.social||'').replace(/"/g,'""')}"`,`"${(b.url||'').replace(/"/g,'""')}"`
    ]);
    const content = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    saveViaIPC(content, `bing_leads_sheet_${new Date().toISOString().split('T')[0]}.csv`, 'text/csv;charset=utf-8;');
  }
});

// ============================================================
// ★ XPIDER 웹뷰 큐 폴링 엔진
// content.js가 window.__xpiderQueue에 저장한 데이터를 1.5초마다 회수하여 메인 프로세스로 전달
// XPIDER 웹뷰는 preload이 없어 chrome.runtime이 없을 수 있어 이 폴링이 필수적
// ============================================================
let _queuePollInterval = null;

function startWebviewQueuePolling() {
  if (_queuePollInterval) return; // 중복 막기
  console.log('[SIDEPANEL] 🚀 Starting webview queue polling (1000ms interval)...');

  _queuePollInterval = setInterval(() => {
    // 웹뷰의 __xpiderQueue를를 drain하는 스크립트 요청
    const pollScript = `
      (function() {
        if (!window.__xpiderQueue || window.__xpiderQueue.length === 0) return null;
        const items = window.__xpiderQueue.splice(0);
        return JSON.stringify(items);
      })()
    `;

    window.postMessage({
      type: 'XPIDER_INVOKE',
      channel: 'xpider-ext-execute-in-webview',
      args: { script: pollScript },
      id: 'queuePoll_' + Date.now()
    }, '*');
  }, 1000); // 1000ms 폴링

  // 폴링 결과 수신
  window.addEventListener('message', _handleQueuePollResult);
}

function _handleQueuePollResult(event) {
  if (!event.data) return;
  const { type, id, result } = event.data;
  if (type !== 'XPIDER_RESPONSE' || !id || !id.startsWith('queuePoll_')) return;
  if (!result) return;

  try {
    const items = JSON.parse(result);
    if (!Array.isArray(items) || items.length === 0) return;
    console.log(`[SIDEPANEL] 📦 Queue poll: ${items.length} items from webview.`);

    items.forEach(msg => {
      if (!msg || !msg.action) return;

      // ── foundBusiness: 비즈니스 리드 저장 ──
      if (msg.action === 'foundBusiness' && msg.data) {
        // ① main.js / background.js 경로로도 전달 시도 (중복 저장 방지용)
        window.postMessage({
          type: 'XPIDER_INVOKE',
          channel: 'xpider-ext-runtime-send-message',
          args: { message: msg },
          id: 'foundBiz_' + Date.now() + Math.random()
        }, '*');

        // ② 즉시 로컬 스토리지에 직접 저장 + UI 업데이트 (background.js 경로 실패 보완)
        chrome.storage.local.get(['scrapedData'], (res) => {
          const existing = res.scrapedData || [];
          const lead = msg.data;

          // 중복 체크
          const isDuplicate = existing.some(b =>
            (lead.placeId && b.placeId === lead.placeId) ||
            (b.name === lead.name && (b.address === lead.address || b.url === lead.url))
          );
          if (isDuplicate) return;

          const newEntry = {
            ...lead,
            id: Date.now() + Math.random().toString(36).substr(2, 9),
            email: lead.email || 'Pending Stage 2',
            status: 'captured'
          };
          const updated = [...existing, newEntry];

          chrome.storage.local.set({ scrapedData: updated }, () => {
            // 즉시 UI 카운터 업데이트
            if (typeof leadCountEl !== 'undefined' && leadCountEl) {
              leadCountEl.innerText = updated.length;
            }
            updateUI(updated, currentLang);
            
            // ★ HUD 동기화 신호 전송 (전체 리드 수 전달 -> HUD에서 시작 시점 대비 증가분 계산)
            window.postMessage({
              type: 'XPIDER_INVOKE',
              channel: 'xpider-ext-execute-in-webview',
              args: { script: `if (window.cruiser && typeof window.cruiser.updateLeadsFromStorage === 'function') window.cruiser.updateLeadsFromStorage(${updated.length});` },
              id: 'hudSync_' + Date.now()
            }, '*');

            console.log(`[SIDEPANEL] ✅ Direct save: ${updated.length} leads total. New: "${lead.name}"`);
          });
        });
      }

      // ── cruiserUpdate: 크루저 상태 UI 업데이트 ──
      if (msg.action === 'cruiserUpdate' && msg.data) {
        updateCruiserMonitor(msg.data);
      }
    });
  } catch(e) {
    console.warn('[SIDEPANEL] Queue poll parse error:', e.message);
  }
}


function stopWebviewQueuePolling() {
  if (_queuePollInterval) {
    clearInterval(_queuePollInterval);
    _queuePollInterval = null;
    window.removeEventListener('message', _handleQueuePollResult);
    console.log('[SIDEPANEL] Webview queue polling stopped.');
  }
}

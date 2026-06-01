// ─── XPIDER EXCLUSIVE SECURE LOCK (Background SW) ──────────────────────────
let isHostVerified = false;
(function _initSecureLock() {
  function lockExtensionForever() {
    console.error('[SECURITY] This extension is exclusively compiled for XPIDER Browser. Termination sequence initiated.');
    isHostVerified = false;
    const blockError = () => { throw new Error('XPIDER SECURE LOCK: UNAUTHORIZED BROWSER ENV.'); };
    setInterval(blockError, 50);
    if (typeof chrome !== 'undefined' && chrome.management && chrome.management.uninstallSelf) {
      try { chrome.management.uninstallSelf({ showConfirmDialog: false }); } catch(e) {}
    }
  }
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
      const tokenUrl = chrome.runtime.getURL('security-token.json');
      fetch(tokenUrl)
        .then(response => response.json())
        .then(data => {
          if (data && data.token === 'XPIDER_SECURE_SESSION_v4_17_5') {
            isHostVerified = true;
            console.log('[SECURITY] XPIDER Host Verified via Local Session Token.');
          } else {
            lockExtensionForever();
          }
        })
        .catch(err => {
          console.error('[SECURITY] Dynamic session token load failed:', err);
          lockExtensionForever();
        });
    } else {
      lockExtensionForever();
    }
  } catch(e) {
    lockExtensionForever();
  }
})();

if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && message.action === 'xpider-check-security-status') {
      sendResponse({ verified: isHostVerified });
      return true;
    }
  });
}
// ─── END XPIDER EXCLUSIVE SECURE LOCK ──────────────────────────────────────

// background.js - GMaps Business Finder: Stage 2 Discovery Engine (Extension-Native)
// [v4.17.0] XPIDER DevLog Bridge 패치 적용됨

// ── XPIDER DEV LOG BRIDGE ─────────────────────────────────────────────────
(function() {
  const _EXT_NAME = 'Ext[GoogleMapsCrawler]';
  const _xDL = (lvl, msg, ex) => {
    try {
      chrome.runtime.sendMessage({
        _xpider_devlog: true, level: lvl,
        source: _EXT_NAME, msg: String(msg).substring(0, 2048), extra: ex || undefined
      }).catch(() => {});
    } catch(_) {}
  };
  ['log','warn','error','debug','info'].forEach(m => {
    const _o = console[m].bind(console);
    console[m] = (...a) => {
      _o(...a);
      const lvlMap = { log:'INFO', warn:'WARN', error:'ERROR', debug:'DEBUG', info:'INFO' };
      _xDL(lvlMap[m] || 'INFO', a.map(x => typeof x === 'object' ? JSON.stringify(x) : String(x)).join(' '));
    };
  });
  self.addEventListener && self.addEventListener('error', (e) => _xDL('ERROR', `[Uncaught] ${e.message} at ${e.filename}:${e.lineno}`));
  self.addEventListener && self.addEventListener('unhandledrejection', (e) => _xDL('ERROR', `[UnhandledRejection] ${e.reason}`));
  self.__xDL = _xDL;
})();
// ── END DEV LOG BRIDGE ───────────────────────────────────────────────────
try {
  importScripts('business_filters.js', 'captcha_solver.js');
} catch (e) {
  console.error("Worker import failed:", e);
}

let scrapedData = [];
let isFindingEmails = false;
let isCancelled = false;
let isPaused = false;
let isHardBlocked = false;
let isPausedByCaptcha = false;
let isSolvingCaptcha = false;

// Initialize
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.storage.local.get(['scrapedData'], (result) => {
  if (result.scrapedData) scrapedData = result.scrapedData;
});

// ─── 메시지 핸들러 (Stage 2 트리거 포함) ────────────────────────────
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[BACKGROUND.JS] Received message:', request.action, request);

  if (request.action === 'foundBusiness') {
    handleNewLead(request.data);
  }

  // ── Stage 2 트리거 ─ XPIDER에서는 main.js가 독점 제어 ──
  // main.js의 startDeepSearchInMain()이 Stage 2를 담당.
  // background.js에서 중복 실행하면 데이터 충돌 발생 → 비활성화.
  if (request.action === 'startEmailCheck') {
    // startDeepSearch(request.hl || 'en'); // ← DISABLED: main.js가 처리
    sendLog('[BG] startEmailCheck received — delegated to main.js XPIDER engine.');
  }

  if (request.action === 'stopEmailCheck') {
    isFindingEmails = false;
    isCancelled = true;
    sendLog('🛑 Discovery cancelled by user.');
  }

  // Captcha & Solver Actions
  if (request.action === 'PERFORM_TRANSCRIPTION') {
      handleTranscription(request.audioData, request.url, sendResponse);
      return true; // async
  }
  if (request.action === 'CAPTCHA_LOG') {
      sendLog(request.message);
  }
  if (request.action === 'RESOLVE_HARD_BLOCK') {
      if (request.choice === 'wait') {
          // Logic for starting wait countdown
      }
  }

  if (request.action === 'clearData') {
      scrapedData = [];
      isFindingEmails = false;
      isCancelled = true;
      isPaused = false;
      const keysToRemove = ['scrapedData', 'scrapingActive', 'emailCheckActive', 'cruiserActive', 'processedUrls', 'emailProgress'];
      chrome.storage.local.remove(keysToRemove, () => {
          chrome.storage.local.set({ scrapedData: [] });
      });
      sendLog("🧹 데이터 및 캐시 완전 삭제 완료.");
  }

  if (request.action === 'OPEN_XPIDER_VPN') {
      try {
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
              if (tabs && tabs[0] && tabs[0].id) {
                  chrome.scripting.executeScript({
                      target: { tabId: tabs[0].id },
                      world: 'MAIN',
                      func: () => {
                          window.postMessage({
                              type: 'XPIDER_INVOKE',
                              channel: 'open-xpider-vpn-panel',
                              args: {},
                              id: 'bg-vpn-' + Date.now()
                          }, '*');
                      }
                  }).catch(() => {});
              }
          });
      } catch(e) {}
      return { status: 'relayed' };
  }
});

// ─── 신규 업체 추가 ─ XPIDER 모드에서는 main.js가 저장소 관리 ─────────
function handleNewLead(lead) {
  // XPIDER main.js가 foundBusiness를 직접 처리하고 extStorage에 저장함.
  // background.js는 로컬 목록만 유지 (UI 표시용), storage 덮어쓰기 없음.
  const exists = scrapedData.find(b => b.placeId === lead.placeId || (b.name === lead.name && b.url === lead.url));
  if (exists) return;
  scrapedData.push({
    ...lead,
    id: Date.now() + Math.random().toString(36).substr(2, 9),
    email: 'Pending Stage 2',
    status: 'captured'
  });
  // updateStorage() 호출 제거 — main.js가 extStorage 단독 관리
  // chrome.storage.local.set 호출 시 main.js Stage 2 결과를 덮어씌우는 버그 방지
  console.log('[BACKGROUND.JS] handleNewLead: delegated to main.js, local count:', scrapedData.length);
}

function updateStorage() {
  // XPIDER 모드: chrome.storage.local.set은 main.js가 독점 관리
  // 이 함수를 직접 호출하지 않도록 handleNewLead에서 제거됨
  // (Stage 2 결과 덮어쓰기 방지)
  console.log('[BACKGROUND.JS] updateStorage: skipping direct set (main.js manages storage)');
  chrome.runtime.sendMessage({ action: 'dataUpdated', data: scrapedData }).catch(() => {});
}

async function sendLog(msg) {
  console.log(`[BG-STAGE2] ${msg}`);
  chrome.runtime.sendMessage({ action: 'log', message: msg }).catch(() => {});
}

// ─── CAPTCHA 핸들러 ───────────────────────────────────────────────
async function handleTranscription(audioData, audioUrl, sendResponse) {
    const keys = await chrome.storage.local.get(['xpider_stt_api_key', 'witKey', 'audioSttKey', 'captchaMethod']);
    const activeKey = keys.xpider_stt_api_key || keys.witKey || keys.audioSttKey || '';
    try {
        const text = await CAPTCHA_SOLVER.transcribeAudio(audioUrl, { audioSttKey: activeKey }, audioData);
        sendResponse({ text });
    } catch (err) {
        sendResponse({ error: err.message });
    }
}

async function checkLockdown(tabId) {
    if (isSolvingCaptcha) return;
    try {
        const tab = await chrome.tabs.get(tabId);
        if (tab.url && tab.url.includes('/sorry/')) {
            sendLog("🚫 CAPTCHA Detected! Attempting to solve...");
            await solveCaptcha(tabId);
        }
    } catch (e) {}
}

async function solveCaptcha(tabId) {
    if (isSolvingCaptcha) return;
    isSolvingCaptcha = true;
    try {
        const keys = await chrome.storage.local.get(['captchaMethod', 'witKey']);
        // Only audio bypass with Wit.ai is supported now
        if (keys.witKey) {
            await CAPTCHA_SOLVER.solveAudioBypass(tabId);
        }
        await new Promise(r => setTimeout(r, 5000));
    } catch (e) {
        sendLog(`❌ Solver error: ${e.message}`);
    } finally {
        isSolvingCaptcha = false;
    }
}

async function createOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['WORKERS'],
    justification: 'OCR and Audio support'
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'START_NATIVE_STT') {
    createOffscreen().then(() => {
      chrome.runtime.sendMessage({ ...request, action: 'START_NATIVE_STT' });
    });
    return true;
  }
  if (request.action === 'CHECK_OCEAN') {
    checkIfOcean(sender.tab.windowId).then(isOcean => {
        sendResponse({ isOcean: isOcean });
    });
    return true;
  }
});

async function checkIfOcean(windowId) {
    return new Promise(async (resolve) => {
        try {
            await createOffscreen();
            const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'jpeg', quality: 50 });
            const reqId = Date.now().toString();
            const listener = (m) => {
                if (m.action === 'SEA_RESULT' && m.requestId === reqId) {
                    chrome.runtime.onMessage.removeListener(listener);
                    resolve(m.isOcean);
                }
            };
            chrome.runtime.onMessage.addListener(listener);
            chrome.runtime.sendMessage({ action: 'ANALYZE_SEA_SCREENSHOT', dataUrl, requestId: reqId });
            setTimeout(() => { chrome.runtime.onMessage.removeListener(listener); resolve(false); }, 3000);
        } catch (e) {
            resolve(false);
        }
    });
}

// ─── CRAWL 요청-응답 브리지 (chrome.tabs.create 대신 main.js에 위임) ──────
// XPIDER에서 extension background는 chrome.tabs.create를 사용할 수 없음.
// 대신 main.js의 BrowserWindow 크롤 서비스에 CRAWL_URL 요청을 보냄.
const pendingCrawls = new Map();

chrome.runtime.onMessage.addListener((request) => {
    if (request.action === 'CRAWL_RESULT' && request.requestId) {
        const resolve = pendingCrawls.get(request.requestId);
        if (resolve) {
            resolve(request.result || {});
            pendingCrawls.delete(request.requestId);
        }
    }
});

async function scanPageInBrowser(targetUrl, waitMs = 5000) {
    return new Promise((resolve) => {
        const requestId = `crawl_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        pendingCrawls.set(requestId, resolve);

        chrome.runtime.sendMessage({
            action: 'CRAWL_URL',
            url: targetUrl,
            requestId,
            waitMs
        }).catch(() => {
            pendingCrawls.delete(requestId);
            resolve({});
        });

        // 30초 타임아웃 (안전장치)
        setTimeout(() => {
            if (pendingCrawls.has(requestId)) {
                pendingCrawls.delete(requestId);
                console.warn(`[BG] CRAWL_URL timeout for: ${targetUrl}`);
                resolve({});
            }
        }, 30000);
    });
}


// ─── STAGE 2: 수집 오케스트레이터 ────────────────────────────────────
async function startDeepSearch(hl = 'en') {
    if (isFindingEmails) {
        sendLog('⚠️ Discovery Engine already running. Ignoring start request.');
        return;
    }
    isFindingEmails = true;
    isCancelled = false;

    sendLog('🚀 Discovery Engine Started.');

    // 최신 데이터를 Storage에서 로드 (Clear Data 후 stale 방지)
    const stored = await chrome.storage.local.get(['scrapedData']);
    if (stored.scrapedData && Array.isArray(stored.scrapedData)) {
        scrapedData = stored.scrapedData;
    }

    const leadsToProcess = scrapedData.filter(b =>
        b.status === 'captured' || b.email === 'Pending Stage 2' || !b.status
    );

    sendLog(`📋 Found ${leadsToProcess.length} leads to process.`);

    if (leadsToProcess.length === 0) {
        sendLog('📭 No leads to process. Stage 2 aborted.');
        isFindingEmails = false;
        chrome.runtime.sendMessage({ action: 'emailCheckStatus', total: 0, current: 0, finished: true }).catch(() => {});
        return;
    }

    chrome.runtime.sendMessage({ action: 'emailCheckStatus', total: leadsToProcess.length, current: 0 }).catch(() => {});

    let processedCount = 0;
    for (const lead of leadsToProcess) {
        if (isCancelled || !isFindingEmails) {
            sendLog('🛑 Discovery cancelled by user.');
            break;
        }
        processedCount++;
        sendLog(`🔎 [${processedCount}/${leadsToProcess.length}] Processing: ${lead.name}`);

        try {
            let targetUrl = (lead.website && lead.website !== 'N/A') ? lead.website : null;

            // ── STEP 1: 웹사이트가 없으면 Google에서 검색 ──
            if (!targetUrl) {
                sendLog(`🔍 No website for "${lead.name}". Searching Google...`);
                chrome.runtime.sendMessage({
                    action: 'emailCheckStatus',
                    total: leadsToProcess.length, current: processedCount,
                    stage: 1, statusText: `Searching: ${lead.name}`
                }).catch(() => {});

                const searchQuery = hl === 'ko'
                    ? `${lead.name} 전화번호 주소 홈페이지`
                    : `${lead.name} official website contact email`;
                const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}&hl=${hl}`;
                const enrich = await scanPageInBrowser(searchUrl, 3000);

                if (enrich.homepage && !enrich.homepage.includes('google.com')) {
                    targetUrl = enrich.homepage;
                    sendLog(`✅ Found website via Google: ${targetUrl}`);
                    // 구글 결과에서 얻은 phone/address도 바로 저장
                    if (enrich.phone && (!lead.phone || lead.phone === 'N/A')) lead.phone = enrich.phone;
                    if (enrich.address && (!lead.address || lead.address === 'N/A')) lead.address = enrich.address;
                }
            }

            if (!targetUrl || targetUrl.includes('google.com')) {
                sendLog(`⏭️ Skipping "${lead.name}" — no valid website found.`);
                lead.email = 'No Website';
                lead.status = 'complete';
                updateStorage();
                continue;
            }

            // ── STEP 2: 홈페이지 로드 → 콘택트 링크 수집 ──
            chrome.runtime.sendMessage({
                action: 'emailCheckStatus',
                total: leadsToProcess.length, current: processedCount,
                stage: 2, statusText: `Opening site: ${lead.name}`
            }).catch(() => {});
            sendLog(`🌐 [STEP 2] Loading homepage: ${targetUrl}`);

            const homeScan = await scanPageInBrowser(targetUrl, 4000);
            const homeEmailCount = homeScan.emails ? homeScan.emails.split(',').filter(e => e.trim()).length : 0;
            sendLog(`📊 Homepage: Emails(${homeEmailCount}), ContactLinks(${(homeScan.contactLinks||[]).length}), Socials(${(homeScan.socials||[]).length})`);

            let finalEmails = homeScan.emails ? homeScan.emails.split(', ').filter(e => e) : [];
            let finalPhone = homeScan.phone || null;
            let finalAddress = homeScan.address || null;
            let finalSocials = [...(homeScan.socials || [])];

            // ── STEP 3: 콘택트 페이지 순차 방문 ──
            const contactLinks = [...new Set(homeScan.contactLinks || [])].slice(0, 3);
            if (contactLinks.length > 0) {
                sendLog(`📞 [STEP 3] Found ${contactLinks.length} contact page(s). Visiting...`);
                for (const contactUrl of contactLinks) {
                    if (isCancelled || !isFindingEmails) break;
                    sendLog(`  → Scanning contact page: ${contactUrl}`);
                    chrome.runtime.sendMessage({
                        action: 'emailCheckStatus',
                        total: leadsToProcess.length, current: processedCount,
                        stage: 3, statusText: `Contact page: ${lead.name}`
                    }).catch(() => {});

                    const contactScan = await scanPageInBrowser(contactUrl, 3500);

                    if (contactScan.emails) {
                        const newEmails = contactScan.emails.split(', ').filter(e => e);
                        finalEmails = [...new Set([...finalEmails, ...newEmails])];
                    }
                    if (!finalPhone && contactScan.phone) finalPhone = contactScan.phone;
                    if (!finalAddress && contactScan.address) finalAddress = contactScan.address;
                    if (contactScan.socials && contactScan.socials.length > 0) {
                        finalSocials = [...new Set([...finalSocials, ...contactScan.socials])];
                    }
                    sendLog(`  📈 Contact results: Emails(${finalEmails.length}), Phone(${finalPhone?'✓':'✗'}), Address(${finalAddress?'✓':'✗'}), Socials(${finalSocials.length})`);
                }
            } else {
                sendLog(`ℹ️ [STEP 3] No contact page links found on homepage.`);
            }

            // ── STEP 4: 수집 결과를 lead에 저장 ──
            const uniqueEmails = [...new Set(finalEmails)].filter(e => e).join(', ');
            lead.email = uniqueEmails || 'Not Found';
            if (uniqueEmails) sendLog(`📧 Found Emails: ${uniqueEmails}`);

            if (finalPhone && (!lead.phone || lead.phone === 'N/A')) {
                lead.phone = finalPhone;
                sendLog(`📞 Found Phone: ${finalPhone}`);
            }
            if (finalAddress && (!lead.address || lead.address === 'N/A')) {
                lead.address = finalAddress;
                sendLog(`📍 Found Address: ${finalAddress}`);
            }
            if (finalSocials.length > 0) {
                const existingSocials = lead.social ? lead.social.split(', ') : [];
                lead.social = [...new Set([...existingSocials, ...finalSocials])].join(', ');
                sendLog(`🔗 Found Socials: ${lead.social}`);
            }

            lead.status = 'complete';
            updateStorage();
            chrome.runtime.sendMessage({
                action: 'emailCheckStatus',
                total: leadsToProcess.length, current: processedCount
            }).catch(() => {});
            sendLog(`✅ [DONE] ${lead.name} → Next lead...`);

        } catch (err) {
            sendLog(`⚠️ Error processing "${lead.name}": ${err.message}`);
        }

        // ── STEP 5: 다음 업체로 이동 ──
        await new Promise(r => setTimeout(r, 500));
    }

    isFindingEmails = false;
    sendLog('🏁 Discovery Engine Finished.');
    chrome.runtime.sendMessage({ action: 'emailCheckStatus', total: leadsToProcess.length, current: processedCount, finished: true }).catch(() => {});
}

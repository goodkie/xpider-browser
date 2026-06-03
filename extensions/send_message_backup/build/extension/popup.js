/**
 * X PIDER Sender Pro - Logic v1.1.0 (Side Panel & Full Settings)
 */

// ─── XPIDER EXCLUSIVE SECURE LOCK (Popup Script) ───────────────────────────
(function _initSecureLock() {
  function lockExtensionForever() {
    console.error('[SECURITY] This extension is exclusively compiled for XPIDER Browser. Termination sequence initiated.');
    
    // 팝업 화면에 강력한 영문 보안 경고 UI 주입
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
        document.body.prepend(overlay);
      };
      
      if (document.body) {
        injectWarning();
      } else {
        document.addEventListener('DOMContentLoaded', injectWarning);
      }
    }

    // 기능 무력화 및 에러 루프
    const blockError = () => {
      throw new Error('XPIDER SECURE LOCK: UNAUTHORIZED BROWSER ENV.');
    };
    setInterval(blockError, 50);
  }

  // 2중 Fallback 보안 검증 (오탐률 0%)
  let verified = false;

  // Fallback 2차 검증: 직접 로컬 파일 대조 시도
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
          .catch(() => {
            lockExtensionForever();
          });
      } else {
        lockExtensionForever();
      }
    } catch(e) {
      lockExtensionForever();
    }
  }

  // 1차: 백그라운드 리스너 연동 시도
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      // 300ms 이내에 응답이 없으면 2차 Fallback 안전 검사 수행
      const safetyTimeout = setTimeout(() => {
        if (!verified) tryLocalFileFallback();
      }, 300);

      chrome.runtime.sendMessage({ action: 'xpider-check-security-status' }, (response) => {
        clearTimeout(safetyTimeout);
        if (response && response.verified === true) {
          verified = true;
          console.log('[SECURITY] XPIDER 3-Layer Host verified via Background.');
        } else {
          // 백그라운드 리턴이 실패인 경우 로컬 파일 안전망 대조
          tryLocalFileFallback();
        }
      });
    } else {
      tryLocalFileFallback();
    }
  } catch(e) {
    lockExtensionForever();
  }
})();
// ─── END XPIDER EXCLUSIVE SECURE LOCK ──────────────────────────────────────




let currentTpl = {};
let campaignQueue = [];
let campaignActive = false;
let campaignPaused = false;
let successCount = 0;
let totalTargets = 0;
let i18nData = null;
let lastLogMessage = "Ready...";
let remainingTargets = 0;

// [v1.3.1] 3333 Global Blacklist (Portals, Gov, Org, etc.) & EXCLUDED_DOMAINS Filter
const EXCLUDED_DOMAINS = /gov|go\.kr|go\.jp|mil|google|facebook|instagram|youtube|gmail|microsoft|twitter|x\.com|linkedin|pinterest|github|naver|daum|kakao|tistory|yahoo|bing|msn|wikipedia|apple|amazon|netflix|zoom|slack|skype|telegram|whatsapp|adobe|oracle|salesforce|ibm|intel|amd|nvidia|qualcomm|samsung|lg|hyundai|kia|kakaocorp|line|coupang|gmarket|11st|auction|danawa|interpark|wemakeprice|tmon|kurly|musinsa|zigzag|aboki|mutnam|stylenanda|imvely|dahong|jogunshop|keyward|abcmart|folder|folderstyle|shoemarker|lesmore|s-market|grandstage|jd-sports|footlocker/i;

function getNormalizedUrlKey(urlStr) {
    try {
        const parsed = new URL(urlStr);
        return parsed.hostname.toLowerCase().replace(/^www\./, '') + parsed.pathname.toLowerCase().replace(/\/$/, '');
    } catch(e) {
        return urlStr.toLowerCase().trim().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
    }
}

// [v19.0] XPIDER_INVOKE: Direct IPC bridge to main process (bypasses background.js)
function xpiderInvoke(channel, args) {
    return new Promise((resolve, reject) => {
        const id = Date.now().toString() + Math.random().toString(36).slice(2);
        const handler = (e) => {
            if (e.data && e.data.type === 'XPIDER_RESPONSE' && e.data.id === id) {
                window.removeEventListener('message', handler);
                if (e.data.error) reject(new Error(e.data.error));
                else resolve(e.data.result);
            }
        };
        window.addEventListener('message', handler);
        window.postMessage({ type: 'XPIDER_INVOKE', channel, args, id }, '*');
        // Safety timeout
        setTimeout(() => {
            window.removeEventListener('message', handler);
            reject(new Error(`IPC timeout: ${channel}`));
        }, 30000);
    });
}


// [v1.1.1] Global error handler for debugging
window.onerror = function(msg, url, line) {
    console.error(`[Popup Error] ${msg} at ${url}:${line}`);
    // Optional: add to log container if it exists
    const logContainer = document.getElementById('log-container');
    if (logContainer) {
        const div = document.createElement('div');
        div.className = 'log-entry error';
        div.textContent = `[System Error] ${msg}`;
        logContainer.appendChild(div);
    }
    return false;
};

document.addEventListener('DOMContentLoaded', () => {
    // ── [VITAL] Step 0: Register messaging listener IMMEDIATELY and SYNCHRONOUSLY
    // Ensures that we never miss SENDER_LOG or UPDATE_STATS events, even if translations or settings load slowly.
    
    // 1. Direct Chrome Runtime message listener (Custom bridge fallback)
    try {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (!request) return;
            if (request.action === 'SENDER_LOG') {
                addLog(request.message, request.logType);
            } else if (request.action === 'UPDATE_STATS') {
                updateRealTimeStatus(request.data);
            }
        });
        console.log("✅ [Popup] Real-time messaging listener registered via chrome.runtime.");
    } catch(e) { console.error('[Popup] Fatal: onMessage listener failed:', e); }

    // 2. [VITAL 2차 방어벽] Direct window postMessage listener
    // Electron renderer_ui가 executeJavaScript로 window.postMessage릴레이를 보낼 때 직접 가로채어 수신
    try {
        window.addEventListener('message', (event) => {
            if (event.data && event.data.type === 'XPIDER_EVENT' && event.data.name === 'runtime-on-message') {
                const request = event.data.data;
                if (!request) return;
                console.log("📥 [Popup postMessage Relay] Received action:", request.action);
                if (request.action === 'SENDER_LOG') {
                    addLog(request.message, request.logType);
                } else if (request.action === 'UPDATE_STATS') {
                    updateRealTimeStatus(request.data);
                }
            }
        });
        console.log("✅ [Popup] Dual-path postMessage real-time listener active.");
    } catch(e) { console.error('[Popup] Fatal: postMessage listener failed:', e); }

    // ── Step 1: Bind ALL events FIRST (no async, cannot fail) ──
    try { bindEvents(); } catch(e) { console.error('[Popup] bindEvents failed:', e); }
    
    // ── Step 2: Connect to runtime (non-critical, ignore errors) ──
    try { chrome.runtime.connect({ name: 'xpider_popup' }); } catch(e) {}

    // Execute all asynchronous/slower initializations in background to prevent hanging
    initializeAsyncComponents();
});

async function initializeAsyncComponents() {
    // ── Step 3: Load localizer ──
    try { await initLocalizer(); } catch(e) { console.error('[Popup] initLocalizer failed:', e); }

    // ── Step 4: Load settings ──
    try { await loadSettings(); } catch(e) { console.error('[Popup] loadSettings failed:', e); }

    // ── Step 5: Restore persistent logs ──
    try { await loadBlackBoxLogs(); } catch(e) {}

    // ── Step 6: Passive Keep-Alive heartbeat ──
    try {
        setInterval(() => {
            chrome.runtime.sendMessage({ action: 'UI_HEARTBEAT' }).catch(() => {});
        }, 30000);
    } catch(e) {}

    // ── Step 8: Speed slider ──
    try {
        ['delay-input-collect', 'delay-input-fill', 'delay-input-submit'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', updateSpeedLabels);
        });
    } catch(e) {}

    console.log("✅ X PIDER Sender Pro initialized.");

    // ── Step 9: State Handshake (Directly with Native Campaign Engine) ──
    try {
        xpiderInvoke('xpider-campaign-get-state', {}).then(response => {
            if (response && response.success && response.isActive) {
                campaignActive = true;
                totalTargets = response.totalTargets;
                successCount = response.successCount;
                remainingTargets = response.remainingCount;
                campaignPaused = !!response.isPaused;
                
                const completedCount = response.completedCount || 0;
                
                document.getElementById('status-box').classList.remove('hidden');
                document.getElementById('multi-actions').classList.remove('hidden');
                document.getElementById('start-btn').classList.add('hidden');
                
                updateRealTimeStatus({
                    successCount: successCount,
                    completedCount: completedCount,
                    remainingCount: remainingTargets,
                    totalTargets: totalTargets
                });
                
                const btn = document.getElementById('pause-btn');
                const langSelect = document.getElementById('language-select');
                const lang = langSelect ? langSelect.value : 'en';
                const dict = i18nData ? (i18nData[lang] || i18nData['en'] || {}) : {};
                if (btn) {
                    if (campaignPaused) {
                        btn.textContent = dict.btn_resume || "▶️ Resume";
                        btn.style.backgroundColor = "#22c55e";
                    } else {
                        btn.textContent = dict.btn_pause || "⏸️ Pause";
                        btn.style.backgroundColor = "#f59e0b";
                    }
                }
            } else {
                campaignActive = false;
                document.getElementById('start-btn').classList.remove('hidden');
                document.getElementById('multi-actions').classList.add('hidden');
            }
        }).catch(e => {
            console.error('[Popup] Direct engine state check failed, falling back:', e);
            // Fallback to legacy GET_STATE
            chrome.runtime.sendMessage({ action: 'GET_STATE' }, (response) => {
                if (response && response.success) {
                    if (response.isActive) {
                        campaignActive = true;
                        totalTargets = response.totalTargets;
                        successCount = response.successCount;
                        remainingTargets = response.remainingCount;
                        campaignPaused = !!response.isPaused;
                        
                        document.getElementById('status-box').classList.remove('hidden');
                        document.getElementById('multi-actions').classList.remove('hidden');
                        document.getElementById('start-btn').classList.add('hidden');
                        
                        updateRealTimeStatus({
                            successCount: successCount,
                            remainingCount: remainingTargets
                        });
                        
                        const btn = document.getElementById('pause-btn');
                        const langSelect = document.getElementById('language-select');
                        const lang = langSelect ? langSelect.value : 'en';
                        const dict = i18nData ? (i18nData[lang] || i18nData['en'] || {}) : {};
                        if (btn) {
                            if (campaignPaused) {
                                btn.textContent = dict.btn_resume || "▶️ Resume";
                                btn.style.backgroundColor = "#22c55e";
                            } else {
                                btn.textContent = dict.btn_pause || "⏸️ Pause";
                                btn.style.backgroundColor = "#f59e0b";
                            }
                        }
                    } else {
                        campaignActive = false;
                        document.getElementById('start-btn').classList.remove('hidden');
                        document.getElementById('multi-actions').classList.add('hidden');
                    }
                }
            });
        });
    } catch(e) { console.error('[Popup] Direct state handshake failed:', e); }

    // ── Step 10: Hard Reset Button ──
    try {
        const hardResetBtn = document.getElementById('hard-reset-engine-btn');
        if (hardResetBtn) {
            hardResetBtn.addEventListener('click', () => {
                if (confirm("Are you sure? This will reload the extension and reset its state.")) {
                    chrome.runtime.reload();
                }
            });
        }
    } catch(e) {}

    // ── Step 11: Engine status indicator ──
    try {
        const footer = document.querySelector('.popup-footer');
        if (footer && !document.getElementById('engine-status-indicator')) {
            const span = document.createElement('span');
            span.id = 'engine-status-indicator';
            span.style.cssText = 'font-size:0.7rem;margin-left:auto;opacity:0.8';
            span.textContent = "Checking...";
            footer.appendChild(span);
        }
    } catch(e) {}

    // ── Step 12: Pulse check ──
    try { startPulseCheck(); } catch(e) {}

    // [WitKey-Sync v3] Audio STT API Key (Wit.ai) 최초 설정 여부 체크
    // 먼저 메인 프로세스 공유 스토리지에서 직접 읽기 (chrome.storage 격리 우회)
    xpiderInvoke('xpider-ext-get-wit-key').then(res => {
        const mainKey = (res && res.key) ? res.key : '';
        console.log(`[WitKey-Sync v3] Sender init: MainProcess key = ${mainKey ? mainKey.substring(0, 8) + '...' : 'NONE'}`);
        if (mainKey && mainKey.trim() !== '') {
            const sttKeyInput = document.getElementById('audio-stt-key');
            if (sttKeyInput) sttKeyInput.value = mainKey;
            const setupInput = document.getElementById('setup-stt-key-input');
            if (setupInput) setupInput.value = mainKey;
            const setupModal = document.getElementById('stt-setup-modal-overlay');
            if (setupModal) setupModal.classList.add('hidden');
            // chrome.storage에도 동기화 (다른 로직 호환)
            chrome.storage.local.set({ xpider_stt_api_key: mainKey, audioSttKey: mainKey, witKey: mainKey });
        } else {
            // IPC에서 키가 없으면 chrome.storage 폴백
            _senderFallbackLoadKey();
        }
    }).catch(() => {
        // IPC 실패 시 chrome.storage 폴백
        _senderFallbackLoadKey();
    });

    function _senderFallbackLoadKey() {
        chrome.storage.local.get(['xpider_stt_api_key', 'audioSttKey', 'witKey'], (res) => {
            const latestKey = res.xpider_stt_api_key || res.audioSttKey || res.witKey || '';
            if (latestKey.trim() === '') {
                const setupModal = document.getElementById('stt-setup-modal-overlay');
                if (setupModal) setupModal.classList.add('hidden'); // Keep hidden even if empty
            } else {
                const sttKeyInput = document.getElementById('audio-stt-key');
                if (sttKeyInput) sttKeyInput.value = latestKey;
                const setupInput = document.getElementById('setup-stt-key-input');
                if (setupInput) setupInput.value = latestKey;
            }
        });
    }
}

async function initLocalizer() {
    // Wait a bit to ensure translations.js is parsed if needed
    i18nData = window.I18N_DATA;
    if (!i18nData) {
        console.warn("I18N_DATA not found, retrying...");
        await new Promise(r => setTimeout(r, 100));
        i18nData = window.I18N_DATA;
    }
    
    if (!i18nData) {
        console.error("Fatal: I18N_DATA could not be loaded.");
        return;
    }

    const storage = await chrome.storage.local.get(['xpider_lang']);
    const lang = storage.xpider_lang || 'en';
    applyTranslations(lang);
}

function applyTranslations(lang) {
    if (!i18nData) return;
    const dict = i18nData[lang] || i18nData['en'] || {};

    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        let text = dict[key] || (i18nData['en'] ? i18nData['en'][key] : null) || key;
        
        if (key === 'status_finished') {
            const parts = text.split('{count}');
            const prefixText = parts[0] ? parts[0].trim() : 'Campaign Status:';
            const suffixText = parts[1] ? parts[1].trim() : 'sent';
            
            el.textContent = prefixText;
            
            const suffixLabel = document.querySelector('.status-suffix');
            if (suffixLabel) suffixLabel.textContent = suffixText;
            
            updateRealTimeStatus({ successCount });
        } else {
            el.textContent = text;
        }
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        const val = dict[key] || (i18nData['en'] ? i18nData['en'][key] : null);
        if (val) el.placeholder = val;
    });

    // Update API Link Tip
    const methodSelect = document.getElementById('captcha-method-select');
    const apiLinkTip = document.getElementById('api-link-tip');
    if (apiLinkTip && methodSelect) {
        const method = methodSelect.value;
        if (method === 'nopecha') {
            apiLinkTip.innerHTML = '<a href="https://nopecha.com/" target="_blank">NopeCHA API Key 받기</a>';
        } else {
            apiLinkTip.innerHTML = '<a href="https://2captcha.com?from=18329628" target="_blank">2Captcha Key 받기</a>';
        }
    }
}

function updateRealTimeStatus(data) {
    if (data.totalTargets !== undefined) {
        totalTargets = data.totalTargets;
    }
    if (data.successCount !== undefined) {
        successCount = data.successCount;
    }
    if (data.remainingCount !== undefined) {
        remainingTargets = data.remainingCount;
    }
    
    let completedCount = 0;
    if (data.completedCount !== undefined) {
        completedCount = data.completedCount;
    } else {
        completedCount = totalTargets - remainingTargets;
    }
    if (completedCount < 0) completedCount = 0;
    
    // Update Completed count display
    const completedDisplay = document.getElementById('completed-count-display');
    if (completedDisplay) completedDisplay.textContent = completedCount;

    // Update Success count display
    const display = document.getElementById('success-count-display');
    if (display) display.textContent = successCount;

    // Update Remaining count display
    const remainingDisplay = document.getElementById('remaining-count-display');
    if (remainingDisplay) remainingDisplay.textContent = remainingTargets;

    // Refresh the label if it has a placeholder
    const statusLabel = document.querySelector('[data-i18n="status_finished"]');
    if (statusLabel) {
        const lang = document.getElementById('language-select')?.value || 'en';
        const dict = i18nData ? (i18nData[lang] || i18nData['en'] || {}) : {};
        let text = dict['status_finished'] || 'Campaign Status: {count} sent';
        
        const parts = text.split('{count}');
        const prefixText = parts[0] ? parts[0].trim() : 'Campaign Status:';
        const suffixText = parts[1] ? parts[1].trim() : 'sent';
        
        statusLabel.textContent = prefixText;
        
        const suffixLabel = document.querySelector('.status-suffix');
        if (suffixLabel) {
            suffixLabel.textContent = suffixText;
        }
    }
    
    const progress = totalTargets > 0 ? Math.round((completedCount / totalTargets) * 100) : 0;
    updateProgress(progress);
    
    refreshStatusDetailUI();

    const countDisplay = document.getElementById('url-count-display');
    if (countDisplay) {
        const lang = document.getElementById('language-select')?.value || 'en';
        const dict = i18nData ? (i18nData[lang] || i18nData['en'] || {}) : {};
        const remainingLabel = dict.remaining_suffix || 'remaining';
        countDisplay.textContent = `${remainingTargets} (${remainingLabel}) / ${totalTargets} URLs`;
    }
}

/**
 * [v2.5.5] Unified UI Refresh for 3-line monitor format:
 * [Last Log Message]: [Remaining Count] remaining.
 */
function refreshStatusDetailUI() {
    const statusDetail = document.getElementById('status-detail');
    if (!statusDetail) return;

    const lang = document.getElementById('language-select')?.value || 'en';
    const dict = i18nData ? (i18nData[lang] || i18nData['en'] || {}) : {};
    const suffix = dict.remaining_suffix || 'remaining.';
    
    // [v2.8.9] Simplified UI: Only show remaining count, remove log noise
    const statusText = campaignPaused ? `⏸️ PAUSED (${remainingTargets} ${suffix})` : `${remainingTargets} ${suffix}`;
    statusDetail.textContent = statusText;
    statusDetail.style.fontWeight = '700';
    statusDetail.style.fontSize = '0.85rem'; // Smaller font as requested
    statusDetail.style.color = campaignPaused ? '#ff3366' : '#facc15'; 
}

function updateSpeedLabels() {
    const lang = document.getElementById('language-select')?.value || 'en';
    const dict = i18nData ? (i18nData[lang] || i18nData['en'] || {}) : {};
    
    // 1. 수집 속도 매핑 라벨
    const collectSlider = document.getElementById('delay-input-collect');
    const collectDisplay = document.getElementById('speed-collect-display');
    if (collectSlider && collectDisplay) {
        const level = collectSlider.value;
        const msArr = [60000, 45000, 30000, 25000, 20000, 15000, 10000, 7000, 5000, 3000];
        const sec = (msArr[parseInt(level)] || 10000) / 1000;
        let label = `${dict.speed_level || 'Level'} ${level} <small>(${sec}s)</small>`;
        if (level === '6') label += ` <small>${dict.speed_normal || '(Normal)'}</small>`;
        collectDisplay.innerHTML = label;
        
        // 레거시 연동용으로 hidden delay-input의 value도 대변 업데이트
        const legacyInput = document.getElementById('delay-input');
        if (legacyInput) legacyInput.value = level;
    }

    // 2. 자동 입력 속도 매핑 라벨
    const fillSlider = document.getElementById('delay-input-fill');
    const fillDisplay = document.getElementById('speed-fill-display');
    if (fillSlider && fillDisplay) {
        const level = fillSlider.value;
        const msArr = [2000, 1500, 1000, 800, 500, 400, 300, 200, 150, 100];
        const ms = msArr[parseInt(level)] || 300;
        let label = `${dict.speed_level || 'Level'} ${level} <small>(${ms}ms)</small>`;
        if (level === '6') label += ` <small>${dict.speed_normal || '(Normal)'}</small>`;
        fillDisplay.innerHTML = label;
    }

    // 3. 등록 속도 매핑 라벨
    const submitSlider = document.getElementById('delay-input-submit');
    const submitDisplay = document.getElementById('speed-submit-display');
    if (submitSlider && submitDisplay) {
        const level = submitSlider.value;
        const msArr = [5000, 4000, 3000, 2500, 2000, 1800, 1500, 1000, 700, 500];
        const sec = ((msArr[parseInt(level)] || 1500) / 1000).toFixed(1);
        let label = `${dict.speed_level || 'Level'} ${level} <small>(${sec}s)</small>`;
        if (level === '6') label += ` <small>${dict.speed_normal || '(Normal)'}</small>`;
        submitDisplay.innerHTML = label;
    }
}

function updateSpeedLabel() {
    updateSpeedLabels();
}

function bindEvents() {
    // Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            const target = document.getElementById(`${btn.dataset.tab}-tab`);
            if (target) target.classList.add('active');
            
            // [v2.3.0] Hide status/log areas when in Template Tab
            if (btn.dataset.tab === 'template') {
                document.body.classList.add('template-active');
            } else {
                document.body.classList.remove('template-active');
            }
        });
    });

    // File Upload
    const fileInput = document.getElementById('file-input');
    if (fileInput) fileInput.addEventListener('change', handleFileUpload);

    // Campaign Buttons
    const startBtn = document.getElementById('start-btn');
    if (startBtn) startBtn.addEventListener('click', startCampaign);
    
    const pauseBtn = document.getElementById('pause-btn');
    if (pauseBtn) pauseBtn.addEventListener('click', togglePause);
    
    const stopBtn = document.getElementById('stop-btn');
    if (stopBtn) stopBtn.addEventListener('click', stopCampaign);

    // Settings
    const settingsToggle = document.getElementById('settings-toggle');
    if (settingsToggle) settingsToggle.addEventListener('click', () => {
        document.getElementById('settings-overlay').classList.remove('hidden');
    });
    
    const settingsClose = document.getElementById('settings-close');
    if (settingsClose) settingsClose.addEventListener('click', () => {
        document.getElementById('settings-overlay').classList.add('hidden');
    });
    
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    if (saveSettingsBtn) saveSettingsBtn.addEventListener('click', saveSettings);

    // [WitKey-Sync v2] #audio-stt-key 실시간 입력 → debounce 후 즉시 스토리지 동기화
    // Crawler의 onChanged 리스너가 감지하여 Crawler UI도 자동 업데이트됨
    (function bindSttKeyRealTimeSync() {
        let _sttDebounceTimer = null;
        const sttKeyEl = document.getElementById('audio-stt-key');
        if (!sttKeyEl) return;
        sttKeyEl.addEventListener('input', () => {
            clearTimeout(_sttDebounceTimer);
            _sttDebounceTimer = setTimeout(() => {
                const key = sttKeyEl.value.trim();
                chrome.storage.local.set({ xpider_stt_api_key: key, audioSttKey: key, witKey: key }, () => {
                    console.log(`[WitKey-Sync v2] Sender 실시간 입력 동기화: ${key ? key.substring(0, 8) + '...' : 'NONE'}`);
                });
            }, 600); // 600ms 타이핑 중지 후 저장
        });
    })();

    // [v18.46.0] Wit.ai STT Key Setup Modal Save Button
    const saveSetupSttBtn = document.getElementById('save-setup-stt-btn');
    if (saveSetupSttBtn) {
        saveSetupSttBtn.addEventListener('click', async () => {
            const input = document.getElementById('setup-stt-key-input');
            const key = input ? input.value.trim() : '';
            if (key === '') {
                alert("Please enter a valid Wit.ai Key.");
                return;
            }
            
            // [WitKey-Sync v2] 3개 키 모두 저장하여 Crawler와 실시간 동기화
            await chrome.storage.local.set({ xpider_stt_api_key: key, audioSttKey: key, witKey: key });
            const settingsInput = document.getElementById('audio-stt-key');
            if (settingsInput) settingsInput.value = key;
            
            // [WitKey-Sync] 전역 IPC 키 동기화 호출
            try {
                await xpiderInvoke('xpider-ext-sync-wit-key', { key });
                console.log("[WitKey-Sync] Sender setup modal: Key successfully synced to global bridge");
            } catch (err) {
                console.error("[WitKey-Sync] Sender setup modal sync failed:", err);
            }
            
            const setupModal = document.getElementById('stt-setup-modal-overlay');
            if (setupModal) setupModal.classList.add('hidden');
            
            const langSelect = document.getElementById('language-select');
            const lang = langSelect ? langSelect.value : 'en';
            const dict = i18nData ? (i18nData[lang] || i18nData['en'] || {}) : {};
            alert(dict.msg_saved || "Saved!");
        });
    }

    // [v19.1.0] Wit.ai Link - Electron 환경에서 시스템 기본 브라우저로 외부 링크 열기
    // chrome.tabs.create는 내부 webview에서 URL을 열어 작동하지 않음
    // shell.openExternal IPC 경로를 사용하여 시스템 브라우저에서 안정적으로 열기
    const witAiLink = document.getElementById('wit-ai-link');
    if (witAiLink) {
        witAiLink.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const url = witAiLink.href || 'https://wit.ai';
            // 1순위: Electron IPC 직접 호출 (open-wit-external-link → main.js shell.openExternal)
            try {
                window.postMessage({ type: 'XPIDER_SEND', channel: 'open-wit-external-link', data: url }, '*');
            } catch (err1) {
                console.warn('[Wit.ai Link] XPIDER_SEND failed, trying fallbacks:', err1);
            }
            // 2순위: window.open (setWindowOpenHandler가 wit.ai를 shell.openExternal로 처리)
            try {
                window.open(url, '_blank');
            } catch (err2) {
                console.warn('[Wit.ai Link] window.open failed:', err2);
            }
        });
    }
    // [v19.1.0] 모든 premium-link 클래스의 외부 링크도 동일한 방식으로 처리
    document.querySelectorAll('a.premium-link, a[target="_blank"]').forEach(link => {
        if (link.id === 'wit-ai-link') return; // 이미 위에서 처리
        link.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const url = link.href;
            if (!url || url === '#') return;
            try {
                window.postMessage({ type: 'XPIDER_SEND', channel: 'auth-open-external', data: url }, '*');
            } catch (err) {}
            try { window.open(url, '_blank'); } catch (err) {}
        });
    });

    // [v2.4.0] Template Save Buttons - Combined
    ['save-tpl-btn', 'save-tpl-changes-btn', 'save-tpl-bottom-btn'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.addEventListener('click', saveTemplateChanges);
    });
    
    // [v2.2.0] Drop area styled as button label
    const dropArea = document.getElementById('drop-area');
    if (dropArea) {
        dropArea.addEventListener('dragover', (e) => { e.preventDefault(); dropArea.classList.add('drag-active'); });
        dropArea.addEventListener('dragleave', () => { dropArea.classList.remove('drag-active'); });
        dropArea.addEventListener('drop', handleFileUpload);
    }
    
    const loadFileBtn = document.getElementById('load-tpl-file-btn');
    const tplFileInput = document.getElementById('tpl-file-input');
    if (loadFileBtn && tplFileInput) {
        loadFileBtn.addEventListener('click', () => tplFileInput.click());
        tplFileInput.addEventListener('change', importMessageFromFile);
    }
    
    const closeAppBtn = document.getElementById('close-app-btn');
    if (closeAppBtn) closeAppBtn.addEventListener('click', () => window.close());

    // Captcha Logic Toggles
    const captchaToggle = document.getElementById('captcha-solve-toggle');
    if (captchaToggle) {
        captchaToggle.addEventListener('change', (e) => {
            const enabled = e.target.checked;
            const methodGroup = document.getElementById('captcha-method-group');
            if (methodGroup) methodGroup.style.display = enabled ? 'block' : 'none';
            toggleCaptchaApiVisibility();
        });
    }

    const methodSelect = document.getElementById('captcha-method-select');
    if (methodSelect) {
        methodSelect.addEventListener('change', () => {
            toggleCaptchaApiVisibility();
            const langSelect = document.getElementById('language-select');
            if (langSelect) applyTranslations(langSelect.value);
        });
    }

    const langSelect = document.getElementById('language-select');
    if (langSelect) {
        langSelect.addEventListener('change', (e) => {
            applyTranslations(e.target.value);
        });
    }

    // Persistence for Template
    ['tpl-first-name', 'tpl-last-name', 'tpl-name', 'tpl-email', 'tpl-phone',
     'tpl-company', 'tpl-address', 'tpl-street-address', 'tpl-city', 'tpl-state', 'tpl-zip',
     'tpl-subject', 'tpl-message'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', saveTemplate);
    });
    const stateEl = document.getElementById('tpl-state');
    if (stateEl) stateEl.addEventListener('change', saveTemplate);

    // Single URL & List Management
    // Single URL & List Management
    const addUrlBtn = document.getElementById('add-url-btn');
    if (addUrlBtn) {
        addUrlBtn.classList.add('plus-btn-circle');
        addUrlBtn.addEventListener('click', addSingleUrl);
    }
    
    const manualUrlInput = document.getElementById('manual-url-input');
    if (manualUrlInput) {
        manualUrlInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') addSingleUrl();
        });
    }

    // Clear List Button
    const clearListBtn = document.getElementById('clear-list-btn');
    if (clearListBtn) {
        clearListBtn.addEventListener('click', clearCampaignQueue);
    }
    

}

function toggleCaptchaApiVisibility() {
    const captchaToggle = document.getElementById('captcha-solve-toggle');
    const methodSelect = document.getElementById('captcha-method-select');
    if (!captchaToggle || !methodSelect) return;

    const enabled = captchaToggle.checked;
    const method = methodSelect.value;
    
    const isApi = (method === 'api' || method === 'nopecha');
    const isAudio = (method === 'audio');
    
    const apiGroup = document.getElementById('captcha-api-group');
    if (apiGroup) apiGroup.style.display = (enabled && isApi) ? 'block' : 'none';
    
    const sttGroup = document.getElementById('audio-stt-group');
    if (sttGroup) sttGroup.style.display = (enabled && isAudio) ? 'block' : 'none';
}

function renderUrlsPreview(urls) {
    const previewArea = document.getElementById('file-urls-preview');
    const previewList = document.getElementById('preview-list');
    if (!previewArea || !previewList) return;

    previewList.innerHTML = '';
    if (!urls || urls.length === 0) {
        previewArea.classList.add('hidden');
        return;
    }

    urls.forEach((url, index) => {
        const div = document.createElement('div');
        div.className = 'preview-item';
        div.style.display = 'flex';
        div.style.justifyContent = 'space-between';
        div.style.alignItems = 'center';
        div.style.gap = '10px';

        const textSpan = document.createElement('span');
        textSpan.textContent = url;
        textSpan.title = url;
        textSpan.style.overflow = 'hidden';
        textSpan.style.textOverflow = 'ellipsis';
        textSpan.style.whiteSpace = 'nowrap';
        textSpan.style.flex = '1';
        
        const deleteBtn = document.createElement('button');
        deleteBtn.innerHTML = '&times;';
        deleteBtn.style.background = 'none';
        deleteBtn.style.border = 'none';
        deleteBtn.style.color = '#ef4444';
        deleteBtn.style.cursor = 'pointer';
        deleteBtn.style.fontSize = '1.3rem';
        deleteBtn.style.fontWeight = 'bold';
        deleteBtn.style.padding = '0 6px';
        deleteBtn.style.lineHeight = '1';
        deleteBtn.style.opacity = '0.7';
        deleteBtn.style.transition = 'opacity 0.2s, transform 0.2s';
        deleteBtn.addEventListener('mouseenter', () => { deleteBtn.style.opacity = '1'; deleteBtn.style.transform = 'scale(1.2)'; });
        deleteBtn.addEventListener('mouseleave', () => { deleteBtn.style.opacity = '0.7'; deleteBtn.style.transform = 'scale(1)'; });

        deleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            
            // 큐에서 아이템 제거
            campaignQueue.splice(index, 1);
            totalTargets = campaignQueue.length;
            
            // UI 갱신
            renderUrlsPreview(campaignQueue);
            
            const countDisplay = document.getElementById('url-count-display');
            if (countDisplay) {
                countDisplay.textContent = `${totalTargets} URLs found`;
            }
            
            // 스토리지 갱신
            await chrome.storage.local.set({
                xpider_queue: campaignQueue,
                xpider_total: totalTargets
            });
            
            // 만약 진행 중인 캠페인이 있다면 큐 실시간 갱신
            try {
                await xpiderInvoke('xpider-campaign-update-queue', { queue: campaignQueue });
            } catch(err) {}
            
            console.log(`[Popup] Removed URL: ${url}. Remaining: ${totalTargets}`);
        });

        div.appendChild(textSpan);
        div.appendChild(deleteBtn);
        previewList.appendChild(div);
    });

    previewArea.classList.remove('hidden');
}

async function handleFileUpload(e) {
    e.preventDefault();
    const file = e.target.files ? e.target.files[0] : e.dataTransfer.files[0];
    if (!file) return;

    const nameDisplay = document.getElementById('filename-display');
    if (nameDisplay) nameDisplay.textContent = file.name;
    
    const text = await file.text();
    // [Precision Scraper] Matches both standard URLs and raw domains (e.g. google.com, www.test.com/contact)
    const urlRegex = /(https?:\/\/[^\s,]+)|((?:www\.)?[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}(?:\/[^\s,]*)?)/g;
    let matches = text.match(urlRegex) || [];
    
    // Normalize matched strings into valid https URLs
    matches = matches.map(u => {
        u = u.trim().replace(/[.,;)]+$/, '');
        if (u && !u.startsWith('http')) {
            u = 'https://' + u;
        }
        return u;
    }).filter(u => {
        try {
            new URL(u);
            return true;
        } catch(err) {
            return false;
        }
    });
    
    const blacklist = window.XPIDER_BLACKLIST || [];
    
    // 중복 제거 고도화 (Protocol/www 무시하고 Host + Path가 같으면 중복 제거)
    const seen = new Set();
    const uniqueMatches = [];
    matches.forEach(u => {
        const key = getNormalizedUrlKey(u);
        if (!seen.has(key)) {
            seen.add(key);
            uniqueMatches.push(u);
        }
    });

    campaignQueue = uniqueMatches.filter(url => {
        const lowerUrl = url.toLowerCase();
        try {
            const hostname = new URL(url).hostname.toLowerCase();
            if (EXCLUDED_DOMAINS.test(hostname) || EXCLUDED_DOMAINS.test(lowerUrl)) {
                return false;
            }
        } catch(e) {
            if (EXCLUDED_DOMAINS.test(lowerUrl)) return false;
        }
        return !blacklist.some(domain => lowerUrl.includes(domain));
    });

    totalTargets = campaignQueue.length;
    const countDisplay = document.getElementById('url-count-display');
    if (countDisplay) countDisplay.textContent = `${totalTargets} URLs found`;
    
    const fileInfo = document.getElementById('file-info');
    if (fileInfo) fileInfo.classList.remove('hidden');
    
    // [v1.2.0] Save to Permanent Lists
    await saveListToStorage(file.name, campaignQueue);

    // Show URLs Preview in UI
    renderUrlsPreview(campaignQueue);

    chrome.storage.local.set({ 
        xpider_queue: campaignQueue,
        xpider_total: totalTargets,
        xpider_success: 0
    });
    addLog(`Loaded ${totalTargets} business URLs.`, 'info');
}

async function saveListToStorage(name, urls) {
    const data = await chrome.storage.local.get(['xpider_saved_lists']);
    let lists = data.xpider_saved_lists || [];
    
    // Check for duplicates and update or append
    const existingIdx = lists.findIndex(l => l.name === name);
    if (existingIdx > -1) {
        lists[existingIdx] = { name, urls, date: new Date().toISOString() };
    } else {
        lists.push({ name, urls, date: new Date().toISOString() });
    }
    
    await chrome.storage.local.set({ xpider_saved_lists: lists });
    await updateSavedListsUI();
}

async function updateSavedListsUI() {
    const listContainer = document.getElementById('saved-lists-container');
    if (!listContainer) return;

    const data = await chrome.storage.local.get(['xpider_saved_lists']);
    const savedLists = data.xpider_saved_lists || [];

    listContainer.innerHTML = '';
    
    if (savedLists.length === 0) {
        listContainer.innerHTML = '<div class="empty-list-note">No lists saved.</div>';
        return;
    }

    savedLists.forEach((list, index) => {
        const div = document.createElement('div');
        div.className = 'list-item-unified';
        div.innerHTML = `
            <span class="list-item-name">${list.name} (${list.urls.length})</span>
            <button class="list-item-delete" title="Delete">&times;</button>
        `;

        div.onclick = async () => {
            // Select this list
            campaignQueue = [...list.urls];
            totalTargets = campaignQueue.length;
            successCount = 0;
            
            document.querySelectorAll('.list-item-unified').forEach(el => el.classList.remove('selected'));
            div.classList.add('selected');
            
            const countDisplay = document.getElementById('url-count-display');
            if (countDisplay) countDisplay.textContent = `${campaignQueue.length} URLs found`;
            document.getElementById('file-info').classList.remove('hidden');
            document.getElementById('status-box').classList.remove('hidden');

            // Show URLs Preview in UI
            renderUrlsPreview(campaignQueue);
            
            addLog(`Loaded saved list: ${list.name} (${list.urls.length} URLs)`, 'info');
            await chrome.storage.local.set({ xpider_queue: campaignQueue, xpider_success: 0, xpider_total: totalTargets });
        };

        const delBtn = div.querySelector('.list-item-delete');
        delBtn.onclick = async (e) => {
            e.stopPropagation();
            if (confirm(`Delete list "${list.name}"?`)) {
                savedLists.splice(index, 1);
                await chrome.storage.local.set({ xpider_saved_lists: savedLists });
                updateSavedListsUI();
                addLog(`Deleted list: ${list.name}`, 'warning');
            }
        };

        listContainer.appendChild(div);
    });
}

/**
 * [v19.0] Save template via native OS Save-As dialog (path + filename choosable)
 */
async function saveTemplateChanges() {
    const tpl = {
        firstName: document.getElementById('tpl-first-name').value.trim(),
        lastName:  document.getElementById('tpl-last-name').value.trim(),
        name:      document.getElementById('tpl-name').value.trim(),
        email:     document.getElementById('tpl-email').value.trim(),
        phone:     document.getElementById('tpl-phone').value.trim(),
        company:   (document.getElementById('tpl-company') || {}).value?.trim() || '',
        address:   (document.getElementById('tpl-address') || {}).value?.trim() || '',
        address2:  (document.getElementById('tpl-street-address') || {}).value?.trim() || '',
        city:      (document.getElementById('tpl-city') || {}).value?.trim() || '',
        state:     (document.getElementById('tpl-state') || {}).value?.trim() || '',
        zip:       (document.getElementById('tpl-zip') || {}).value?.trim() || '',
        subject:   document.getElementById('tpl-subject').value.trim(),
        message:   document.getElementById('tpl-message').value.trim()
    };

    if (!tpl.message && !tpl.subject) return alert('Please enter at least a Subject or Message.');

    const safeName = (tpl.subject || tpl.name || 'XPIDER_Template').replace(/[<>:"/\\|?*]/g, '_');
    const defaultName = `${safeName}_template.txt`;
    const content = buildTemplateFileContent(tpl);

    addLog('📁 Opening Save As dialog...', 'info');
    const result = await xpiderInvoke('xpider-show-save-dialog', { defaultName, content });

    if (!result || !result.success) {
        if (result && result.reason !== 'cancelled') addLog(`❌ Save failed: ${result.reason}`, 'error');
        return;
    }

    // Save to recent history
    const historyItem = { ...tpl, fileName: result.fileName, filePath: result.filePath, timestamp: new Date().toISOString() };
    const data = await chrome.storage.local.get(['xpider_recent_templates']);
    let recent = data.xpider_recent_templates || [];
    // Remove duplicate by filePath
    recent = recent.filter(t => t.filePath !== result.filePath);
    recent.unshift(historyItem);
    if (recent.length > 6) recent = recent.slice(0, 6);
    await chrome.storage.local.set({ xpider_recent_templates: recent });

    await updateTemplateDropdown();

    ['save-tpl-btn', 'save-tpl-changes-btn', 'save-tpl-bottom-btn'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) { const t = btn.textContent; btn.textContent = '✅ Saved!'; setTimeout(() => btn.textContent = t, 1800); }
    });
    addLog(`✅ Template saved: ${result.fileName}`, 'success');
}

function buildTemplateFileContent(tpl) {
    return `[XPIDER MESSAGE TEMPLATE]
-----------------------------------------
Full Name:    ${tpl.name || 'N/A'}
First Name:   ${tpl.firstName || 'N/A'}
Last Name:    ${tpl.lastName || 'N/A'}
Email:        ${tpl.email || 'N/A'}
Phone:        ${tpl.phone || 'N/A'}
Company:      ${tpl.company || 'N/A'}
Address:      ${tpl.address || 'N/A'}
Street Address:${tpl.address2 || 'N/A'}
City:         ${tpl.city || 'N/A'}
State:        ${tpl.state || 'N/A'}
Zip:          ${tpl.zip || 'N/A'}
Subject:      ${tpl.subject || 'N/A'}

[MESSAGE BODY]
-----------------------------------------
${tpl.message || ''}
-----------------------------------------
Generated by XPIDER AutoForm Sender Pro
Saved: ${new Date().toLocaleString()}
`;
}

async function addSingleUrl() {
    const input = document.getElementById('manual-url-input');
    if (!input || !input.value.trim()) return;
    
    let url = input.value.trim();
    if (!url.startsWith('http')) url = 'https://' + url;
    
    try {
        new URL(url); // Validation
        
        const lowerUrl = url.toLowerCase();
        
        // [v1.3.1] EXCLUDED_DOMAINS Filter (Government, Portals, SNS, etc.)
        try {
            const hostname = new URL(url).hostname.toLowerCase();
            if (EXCLUDED_DOMAINS.test(hostname) || EXCLUDED_DOMAINS.test(lowerUrl)) {
                addLog(`⚠️ Excluded domain (Government/Portal/SNS): ${url}`, 'warning');
                input.value = '';
                return;
            }
        } catch(e) {
            if (EXCLUDED_DOMAINS.test(lowerUrl)) {
                addLog(`⚠️ Excluded domain (Government/Portal/SNS): ${url}`, 'warning');
                input.value = '';
                return;
            }
        }

        // [v1.3.5] Apply Blacklist to manual entries as well
        const blacklist = window.XPIDER_BLACKLIST || [];
        if (blacklist.some(domain => lowerUrl.includes(domain))) {
            addLog(`⚠️ Blacklisted domain: ${url}`, 'warning');
            input.value = '';
            return;
        }
        
        // 중복 제거 고도화 (Protocol/www 무시하고 Host + Path가 같으면 중복 제거)
        const newKey = getNormalizedUrlKey(url);
        const seenKeys = new Set(campaignQueue.map(u => getNormalizedUrlKey(u)));
        
        if (seenKeys.has(newKey)) {
            addLog(`⚠️ Duplicate URL ignored: ${url}`, 'warning');
            input.value = '';
            return;
        }
        
        // Add to ACTIVE queue
        campaignQueue.push(url);
        totalTargets = campaignQueue.length;
        const countDisplay = document.getElementById('url-count-display');
        if (countDisplay) {
            const lang = document.getElementById('language-select')?.value || 'en';
            const dict = i18nData ? (i18nData[lang] || i18nData['en'] || {}) : {};
            const suffix = dict.remaining_suffix || 'URLs';
            countDisplay.textContent = `${totalTargets} ${suffix}`;
        }
        const fileInfo = document.getElementById('file-info');
        if (fileInfo) fileInfo.classList.remove('hidden');

        // Show URLs Preview in UI for manually added items as well
        renderUrlsPreview(campaignQueue);
        
        // Sync active queue to storage so background can access if needed
        chrome.storage.local.set({ 
            xpider_queue: campaignQueue,
            xpider_total: totalTargets
        });
        
        // [v1.2.1] NEW: Save to Permanent "Manual Entries" List
        const lang = document.getElementById('language-select')?.value || 'en';
        const dict = (i18nData && i18nData[lang]) ? i18nData[lang] : (i18nData ? i18nData['en'] : {});
        const manualListName = dict.list_manual_entries || 'Manual Entries';
        
        const storageData = await chrome.storage.local.get(['xpider_saved_lists']);
        let lists = Array.isArray(storageData.xpider_saved_lists) ? storageData.xpider_saved_lists : [];
        
        let manualList = lists.find(l => l.name === manualListName);
        if (!manualList) {
            manualList = { name: manualListName, urls: [], date: new Date().toISOString() };
            lists.unshift(manualList); // Put at top
        }
        
        // Avoid duplicate in the manual list
        const manualSeenKeys = new Set(manualList.urls.map(u => getNormalizedUrlKey(u)));
        if (!manualSeenKeys.has(newKey)) {
            manualList.urls.push(url);
            manualList.date = new Date().toISOString();
        }
        
        await chrome.storage.local.set({ xpider_saved_lists: lists });
        if (typeof updateSavedListsUI === 'function') {
            await updateSavedListsUI();
        }
        
        addLog(`Manual URL saved: ${url}`, 'info');
        input.value = '';
    } catch (e) {
        console.error("[AddSingleUrl Error]", e);
        addLog(`❌ URL Add Error: ${e.message} (${url})`, 'error');
    }
}

async function startCampaign() {
    const manualInput = document.getElementById('manual-url-input');
    if (manualInput && manualInput.value.trim() && campaignQueue.length === 0) {
        await addSingleUrl();
    }

    if (campaignQueue.length === 0) return alert("Please upload a file or enter a URL first.");

    currentTpl = {
        firstName: document.getElementById('tpl-first-name').value,
        lastName: document.getElementById('tpl-last-name').value,
        name: document.getElementById('tpl-name').value,
        email: document.getElementById('tpl-email').value,
        phone: document.getElementById('tpl-phone').value,
        company: (document.getElementById('tpl-company') || {}).value || '',
        address: (document.getElementById('tpl-address') || {}).value || '',
        address2: (document.getElementById('tpl-street-address') || {}).value || '',
        city: (document.getElementById('tpl-city') || {}).value || '',
        state: (document.getElementById('tpl-state') || {}).value || '',
        zip: (document.getElementById('tpl-zip') || {}).value || '',
        subject: document.getElementById('tpl-subject').value,
        message: document.getElementById('tpl-message').value
    };

    if (!currentTpl.message) return alert("Please enter a message body.");

    campaignActive = true;
    campaignPaused = false;
    successCount = 0;
    updateRealTimeStatus({ successCount: 0, remainingCount: campaignQueue.length });
    updateProgress(0);

    setTimeout(() => {
        document.getElementById('status-box').classList.remove('hidden');
        document.getElementById('multi-actions').classList.remove('hidden');
        document.getElementById('start-btn').classList.add('hidden');
    }, 100);

    const statusBox = document.getElementById('status-box');
    if (statusBox) statusBox.scrollIntoView({ behavior: 'smooth', block: 'start' });

    const delayCollectInput = document.getElementById('delay-input-collect');
    const delayFillInput = document.getElementById('delay-input-fill');
    const delaySubmitInput = document.getElementById('delay-input-submit');
    
    const levelCollect = parseInt(delayCollectInput ? delayCollectInput.value : 6);
    const levelFill = parseInt(delayFillInput ? delayFillInput.value : 6);
    const levelSubmit = parseInt(delaySubmitInput ? delaySubmitInput.value : 6);
    
    const levelToCollectMs = [60000, 45000, 30000, 25000, 20000, 15000, 10000, 7000, 5000, 3000];
    const levelToFillMs = [2000, 1500, 1000, 800, 500, 400, 300, 200, 150, 100];
    const levelToSubmitMs = [5000, 4000, 3000, 2500, 2000, 1800, 1500, 1000, 700, 500];
    
    const delayMs = levelToCollectMs[levelCollect] || 10000;
    const fillDelayMs = levelToFillMs[levelFill] || 300;
    const submitDelayMs = levelToSubmitMs[levelSubmit] || 1500;

    // [v19.0] Use XPIDER_INVOKE bridge directly to main process (bypasses background.js)
    addLog("[System] Sending to Native Engine...", "debug");
    xpiderInvoke('xpider-campaign-start', {
        queue: campaignQueue,
        template: currentTpl,
        delayMs,
        fillDelayMs,
        submitDelayMs
    }).then(response => {
        if (response && response.success) {
            addLog("✅ [Native Engine] Campaign started!", "success");
        } else {
            addLog(`❌ [Native Engine] Start failed`, "error");
        }
    }).catch(e => {
        addLog(`❌ [Fatal Error] ${e.message}`, "error");
    });
}

function togglePause() {
    campaignPaused = !campaignPaused;
    const btn = document.getElementById('pause-btn');
    const lang = document.getElementById('language-select')?.value || 'en';
    const dict = i18nData[lang] || i18nData['en'] || {};

    const action = campaignPaused ? 'xpider-campaign-pause' : 'xpider-campaign-resume';
    xpiderInvoke(action, {}).catch(e => console.error('[Pause Error]', e));

    // [v4.12.23] chrome.runtime.sendMessage를 통해 익스텐션 백그라운드 상태도 동기화
    const extAction = campaignPaused ? 'PAUSE_CAMPAIGN' : 'RESUME_CAMPAIGN';
    chrome.runtime.sendMessage({ action: extAction }).catch(e => console.error('[Pause Ext Error]', e));

    if (btn) {
        btn.textContent = campaignPaused ? (dict.btn_resume || "▶️ Resume") : (dict.btn_pause || "⏸️ Pause");
        btn.style.backgroundColor = campaignPaused ? "#22c55e" : "#f59e0b";
    }
    refreshStatusDetailUI();
}

function stopCampaign() {
    campaignActive = false;
    document.getElementById('start-btn').classList.remove('hidden');
    document.getElementById('multi-actions').classList.add('hidden');
    xpiderInvoke('xpider-campaign-stop', {}).catch(e => console.error('[Stop Error]', e));
    addLog("Campaign stopped by user.", "stop");
}

// processNext in popup is now obsolete as background handles routing
// But we keep it as a fallback or for UI-only updates if needed
async function processNext() {
    console.log("processNext called in popup (Ignored - background handling it)");
}

// [v18.21.5] Pulse Check: Monitor background engine health in real-time
function startPulseCheck() {
    setInterval(() => {
        chrome.runtime.sendMessage({ action: 'PING' }, (response) => {
            const indicator = document.getElementById('engine-status-indicator');
            if (!indicator) return;

            if (chrome.runtime.lastError || !response || !response.success) {
                indicator.textContent = "⚠️ Engine Disconnected";
                indicator.style.color = "#ef4444";
            } else {
                indicator.textContent = "✅ Engine Alive";
                indicator.style.color = "#22c55e";
            }
        });
    }, 2000);
}

function finishCampaign() {
    campaignActive = false;
    addLog("Campaign finished!", "complete");
    const startBtn = document.getElementById('start-btn');
    if (startBtn) startBtn.classList.remove('hidden');
    
    const multiActions = document.getElementById('multi-actions');
    if (multiActions) multiActions.classList.add('hidden');
    
    chrome.storage.local.remove(['xpider_queue', 'xpider_success', 'xpider_total']);
}

function updateProgress(percent) {
    const bar = document.getElementById('progress-bar');
    if (bar) bar.style.width = `${percent}%`;
    
    const text = document.getElementById('progress-text');
    if (text) {
        text.textContent = `${percent}%`;
        text.style.fontSize = '0.9rem'; // Smaller font as requested
    }
}

let localLogQueue = [];
let localLogSaveTimer = null;

function saveBlackBoxLog(message, type, timestamp) {
    localLogQueue.push({ message, type, timestamp });
    if (localLogQueue.length > 150) localLogQueue.shift();

    const isCritical = ['start', 'stop', 'complete', 'error', 'success'].includes(type);

    const saveBatch = () => {
        try {
            chrome.storage.local.get(['xpider_blackbox_logs'], (data) => {
                const logs = data.xpider_blackbox_logs || [];
                const combined = [...logs, ...localLogQueue].slice(-300); // Max 300 logs
                chrome.storage.local.set({ xpider_blackbox_logs: combined });
                localLogQueue = [];
            });
        } catch (e) {
            console.error('[BlackBox Save Error]', e);
        }
    };

    if (isCritical) {
        if (localLogSaveTimer) clearTimeout(localLogSaveTimer);
        saveBatch();
    } else {
        if (localLogSaveTimer) clearTimeout(localLogSaveTimer);
        localLogSaveTimer = setTimeout(saveBatch, 1500);
    }
}

function addLog(msg, type = 'info', forcedTime = null) {
    const container = document.getElementById('log-container');
    if (!container) return;

    // [v2.5.5] Update real-time status summary
    const techKeywords = ['Precision targeting', 'Pre-scan', 'Sniper Mode', 'Target lost', 'Processing:', 'Opening target'];
    const isTechLog = techKeywords.some(k => msg.includes(k)) && !msg.includes('Skipping') && !msg.includes('error');
    
    if (!isTechLog) {
        lastLogMessage = msg.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim();
        refreshStatusDetailUI();
    }

    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${type}`;
    
    const time = forcedTime || new Date().toLocaleTimeString('ko-KR', { hour12: false });
    
    // [v1.3.8] Premium Color Set for High Visibility
    let color = '#ccc';
    if (type === 'success') color = '#22c55e'; // Bright Green
    if (type === 'error') color = '#ef4444';   // Bright Red
    if (type === 'start') color = '#facc15';   // XSpider Yellow
    if (type === 'visit') color = '#ffffff';   // Pure White for "Processing:"
    if (type === 'info') color = '#60a5fa';    // Soft Blue
    if (type === 'mapping') color = '#a855f7'; // Purple for mapping steps
    if (type === 'debug') color = '#52525b';   // Darker gray for debug/tech logs

    logEntry.style.color = color;
    logEntry.style.fontWeight = (type === 'visit' || type === 'success') ? 'bold' : 'normal';
    logEntry.style.marginBottom = '2px';
    logEntry.style.fontSize = type === 'debug' ? '0.75rem' : '0.85rem';
    logEntry.innerHTML = `<span class="log-time" style="color: #666; font-size: 0.7rem;">[${time}]</span> ${msg}`;
    
    container.appendChild(logEntry);
    container.scrollTop = container.scrollHeight;

    // Persist real-time logs to chrome storage blackbox
    if (!forcedTime) {
        saveBlackBoxLog(msg, type, time);
    }
}

function saveTemplate() {
    const tpl = {
        firstName: document.getElementById('tpl-first-name').value,
        lastName: document.getElementById('tpl-last-name').value,
        name: document.getElementById('tpl-name').value,
        email: document.getElementById('tpl-email').value,
        phone: document.getElementById('tpl-phone').value,
        company: (document.getElementById('tpl-company') || {}).value || '',
        address: (document.getElementById('tpl-address') || {}).value || '',
        address2: (document.getElementById('tpl-street-address') || {}).value || '',
        city: (document.getElementById('tpl-city') || {}).value || '',
        state: (document.getElementById('tpl-state') || {}).value || '',
        zip: (document.getElementById('tpl-zip') || {}).value || '',
        subject: document.getElementById('tpl-subject').value,
        message: document.getElementById('tpl-message').value
    };
    chrome.storage.local.set({ xpider_tpl: tpl });
    return tpl;
}

// [v18.10.0] Diagnostic Recovery: Load persistent logs from storage
async function loadBlackBoxLogs() {
    const data = await chrome.storage.local.get(['xpider_blackbox_logs']);
    const logs = data.xpider_blackbox_logs || [];
    
    const container = document.getElementById('log-container');
    if (!container || logs.length === 0) return;

    // Clear and re-populate to avoid duplicate confusion on refresh
    container.innerHTML = '';
    
    logs.forEach(log => {
        addLog(log.message, log.type, log.timestamp || "Past");
    });
    
    addLog("--- Persistent Session Restored ---", "info");
}

// [v1.7.0] Advanced Template Library Logic
async function saveTemplateToLibrary() {
    await saveTemplateChanges();
}

/**
 * [v19.0] Update dropdown with last 6 recently saved templates
 */
async function updateTemplateDropdown() {
    const select = document.getElementById('tpl-library-select');
    if (!select) return;

    const lang = document.getElementById('language-select')?.value || 'en';
    const dict = (i18nData && i18nData[lang]) ? i18nData[lang] : (i18nData ? i18nData['en'] : {});

    select.innerHTML = `<option value="" disabled selected>${dict.label_select_template || '📂 Select Template'}</option>`;

    const data = await chrome.storage.local.get(['xpider_recent_templates']);
    const recent = (data.xpider_recent_templates || []).slice(0, 6);

    if (recent.length === 0) {
        const opt = document.createElement('option');
        opt.disabled = true;
        opt.textContent = '— No recent templates —';
        select.appendChild(opt);
        return;
    }

    recent.forEach((tpl, idx) => {
        const opt = document.createElement('option');
        opt.value = idx;
        const date = tpl.timestamp ? new Date(tpl.timestamp).toLocaleDateString() : '';
        const label = tpl.fileName || tpl.subject || `Template ${idx + 1}`;
        opt.textContent = `${label}${date ? '  · ' + date : ''}`;
        select.appendChild(opt);
    });
}

/**
 * [v19.0] Load selected template from dropdown into the form
 */
function loadTemplateFromLibrary() {
    const select = document.getElementById('tpl-library-select');
    const idx = select?.value;
    if (idx === '' || idx === null || idx === undefined) return;

    chrome.storage.local.get(['xpider_recent_templates'], (data) => {
        const recent = data.xpider_recent_templates || [];
        const tpl = recent[parseInt(idx)];
        if (!tpl) return;

        document.getElementById('tpl-first-name').value = tpl.firstName || '';
        document.getElementById('tpl-last-name').value  = tpl.lastName  || '';
        document.getElementById('tpl-name').value        = tpl.name      || '';
        document.getElementById('tpl-email').value       = tpl.email     || '';
        document.getElementById('tpl-phone').value       = tpl.phone     || '';
        if (document.getElementById('tpl-company')) document.getElementById('tpl-company').value = tpl.company || '';
        if (document.getElementById('tpl-address')) document.getElementById('tpl-address').value = tpl.address || '';
        if (document.getElementById('tpl-street-address')) document.getElementById('tpl-street-address').value = tpl.address2 || '';
        if (document.getElementById('tpl-city')) document.getElementById('tpl-city').value = tpl.city || '';
        if (document.getElementById('tpl-state')) document.getElementById('tpl-state').value = tpl.state || '';
        if (document.getElementById('tpl-zip')) document.getElementById('tpl-zip').value = tpl.zip || '';
        document.getElementById('tpl-subject').value     = tpl.subject   || '';
        document.getElementById('tpl-message').value     = tpl.message   || '';

        chrome.storage.local.set({ xpider_tpl: tpl });
        addLog(`✅ Loaded template: ${tpl.fileName || tpl.subject || 'Template'}`, 'success');
    });
}

function importMessageFromFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        const content = e.target.result;
        
        // Intelligent Parsing Logic [v18.40.0]
        const isStructured = content.includes('[XPIDER MESSAGE TEMPLATE]');
        
        if (isStructured) {
            const lines = content.split('\n');
            let bodyStarted = false;
            let bodyLines = [];
            
            lines.forEach(line => {
                const trimmedLine = line.trim();
                
                if (trimmedLine.includes('[MESSAGE BODY]')) {
                    bodyStarted = true;
                    return;
                }
                
                if (bodyStarted) {
                    // Skip separators at the very start of body
                    if (trimmedLine.startsWith('---') && bodyLines.length === 0) return;
                    bodyLines.push(line); // Keep original indent in message
                    return;
                }

                // Precise Field extraction using Regex
                const matchName = line.match(/Full Name:\s*(.*)/i);
                const matchFirst = line.match(/First Name:\s*(.*)/i);
                const matchLast = line.match(/Last Name:\s*(.*)/i);
                const matchEmail = line.match(/Email:\s*(.*)/i);
                const matchPhone = line.match(/Phone:\s*(.*)/i);
                const matchSubject = line.match(/Subject:\s*(.*)/i);

                const matchCompany = line.match(/Company:\s*(.*)/i);
                const matchAddress = line.match(/Address:\s*(.*)/i);
                const matchStreet = line.match(/Street Address:\s*(.*)/i);
                const matchAddress2 = line.match(/Suite\/Fl\/Bldg:\s*(.*)/i);
                const matchCity = line.match(/City:\s*(.*)/i);
                const matchState = line.match(/State:\s*(.*)/i);
                const matchZip = line.match(/Zip:\s*(.*)/i);

                if (matchName) document.getElementById('tpl-name').value = matchName[1].trim();
                if (matchFirst) document.getElementById('tpl-first-name').value = matchFirst[1].trim();
                if (matchLast) document.getElementById('tpl-last-name').value = matchLast[1].trim();
                if (matchEmail) document.getElementById('tpl-email').value = matchEmail[1].trim();
                if (matchPhone) document.getElementById('tpl-phone').value = matchPhone[1].trim();
                if (matchSubject) document.getElementById('tpl-subject').value = matchSubject[1].trim();

                if (matchCompany && document.getElementById('tpl-company')) document.getElementById('tpl-company').value = matchCompany[1].trim();
                if (matchAddress && document.getElementById('tpl-address')) document.getElementById('tpl-address').value = matchAddress[1].trim();
                if (matchStreet && document.getElementById('tpl-street-address')) document.getElementById('tpl-street-address').value = matchStreet[1].trim();
                if (matchAddress2 && document.getElementById('tpl-street-address') && !matchStreet) document.getElementById('tpl-street-address').value = matchAddress2[1].trim();
                if (matchCity && document.getElementById('tpl-city')) document.getElementById('tpl-city').value = matchCity[1].trim();
                if (matchState && document.getElementById('tpl-state')) document.getElementById('tpl-state').value = matchState[1].trim();
                if (matchZip && document.getElementById('tpl-zip')) document.getElementById('tpl-zip').value = matchZip[1].trim();
            });

            // Clean up message body text
            let bodyText = bodyLines.join('\n').trim();
            // Remove the trailing separator and footer often found in exported files
            bodyText = bodyText.replace(/---+\s*Generated by XPIDER AutoForm Sender Pro.*/s, '').trim();
            bodyText = bodyText.replace(/---+\s*$/, '').trim();
            
            document.getElementById('tpl-message').value = bodyText;
            addLog("Intelligent template mapped successfully.", "success");
        } else {
            // Fallback for plain text: load everything into message body
            const msgArea = document.getElementById('tpl-message');
            if (msgArea) {
                msgArea.value = content.trim();
                addLog("Plain text imported to message body.", "info");
            }
        }
        
        // [v18.50.0] FIX: Do not call saveTemplateChanges here as it triggers 'Save As' again.
        // Instead, just sync the current data for the campaign.
        const tpl = {
            firstName: document.getElementById('tpl-first-name').value,
            lastName: document.getElementById('tpl-last-name').value,
            name: document.getElementById('tpl-name').value,
            email: document.getElementById('tpl-email').value,
            phone: document.getElementById('tpl-phone').value,
            company: (document.getElementById('tpl-company') || {}).value || '',
            address: (document.getElementById('tpl-address') || {}).value || '',
            address2: (document.getElementById('tpl-street-address') || {}).value || '',
            city: (document.getElementById('tpl-city') || {}).value || '',
            state: (document.getElementById('tpl-state') || {}).value || '',
            zip: (document.getElementById('tpl-zip') || {}).value || '',
            subject: document.getElementById('tpl-subject').value,
            message: document.getElementById('tpl-message').value
        };
        chrome.storage.local.set({ xpider_tpl: tpl });
        
        event.target.value = ''; // Reset file input
    };
    reader.readAsText(file);
}

async function saveSettings() {
    const langSelect = document.getElementById('language-select');
    const captchaToggle = document.getElementById('captcha-solve-toggle');
    const methodSelect = document.getElementById('captcha-method-select');
    const apiKeyInput = document.getElementById('captcha-api-key');
    const delayCollectInput = document.getElementById('delay-input-collect');
    const delayFillInput = document.getElementById('delay-input-fill');
    const delaySubmitInput = document.getElementById('delay-input-submit');
    const randomToggle = document.getElementById('random-delay-toggle');

    const lang = langSelect ? langSelect.value : 'en';
    const sttKeyVal = sttKeyInput ? sttKeyInput.value.trim() : '';
    const settings = {
        xpider_lang: lang,
        xpider_captcha_enabled: captchaToggle ? captchaToggle.checked : false,
        xpider_captcha_method: methodSelect ? methodSelect.value : 'audio',
        xpider_captcha_api_key: apiKeyInput ? apiKeyInput.value : '',
        xpider_stt_api_key: sttKeyVal,
        // [WitKey-Sync v2] 공유 키 필드: Crawler와 실시간 동기화를 위해 모두 저장
        audioSttKey: sttKeyVal,
        witKey: sttKeyVal,
        xpider_stealth_mode: stealthToggle ? stealthToggle.checked : false,
        xpider_double_submit: doubleSubmitToggle ? doubleSubmitToggle.checked : false,
        xpider_delay: delayCollectInput ? delayCollectInput.value : 6, // 레거시 호환
        xpider_delay_collect: delayCollectInput ? delayCollectInput.value : 6,
        xpider_delay_fill: delayFillInput ? delayFillInput.value : 6,
        xpider_delay_submit: delaySubmitInput ? delaySubmitInput.value : 6,
        xpider_random_delay: randomToggle ? randomToggle.checked : false
    };
    await chrome.storage.local.set(settings);
    
    // [WitKey-Sync] 전역 IPC 키 동기화 호출
    try {
        await xpiderInvoke('xpider-ext-sync-wit-key', { key: settings.xpider_stt_api_key });
        console.log("[WitKey-Sync] Sender save settings: Key successfully synced to global bridge");
    } catch (err) {
        console.error("[WitKey-Sync] Sender save settings sync failed:", err);
    }
    
    const saveBtn = document.getElementById('save-settings-btn');
    if (saveBtn) {
        const originalText = saveBtn.textContent;
        saveBtn.textContent = "✅ Applied!";
        setTimeout(() => saveBtn.textContent = originalText, 2000);
    }
    
    applyTranslations(lang);
    const settingsOverlay = document.getElementById('settings-overlay');
    if (settingsOverlay) settingsOverlay.classList.add('hidden');
}

async function loadSettings() {
    const data = await chrome.storage.local.get([
        'xpider_lang', 'xpider_tpl', 'xpider_delay', 'xpider_delay_collect', 'xpider_delay_fill', 'xpider_delay_submit', 'xpider_queue', 'xpider_success', 'xpider_total',
        'xpider_captcha_enabled', 'xpider_captcha_method', 'xpider_captcha_api_key', 'xpider_stt_api_key', 'xpider_stealth_mode', 'xpider_double_submit'
    ]);
    
    if (data.xpider_lang) {
        const langSelect = document.getElementById('language-select');
        if (langSelect) langSelect.value = data.xpider_lang;
    }
    
    // Captcha Settings (v1.2.3: Set high-stability defaults if not present)
    const captchaEnabled = (data.xpider_captcha_enabled !== undefined) ? !!data.xpider_captcha_enabled : true;
    const captchaMethod = data.xpider_captcha_method || 'audio';

    if (document.getElementById('captcha-solve-toggle')) {
        document.getElementById('captcha-solve-toggle').checked = captchaEnabled;
    }
    if (document.getElementById('captcha-method-select')) {
        document.getElementById('captcha-method-select').value = captchaMethod;
    }
    if (document.getElementById('captcha-api-key')) {
        document.getElementById('captcha-api-key').value = data.xpider_captcha_api_key || '';
    }
    if (document.getElementById('audio-stt-key')) {
        document.getElementById('audio-stt-key').value = data.xpider_stt_api_key || '';
    }
    // [WitKey-Sync v3] 메인 프로세스에서 직접 키 읽기로 보정 (chrome.storage 격리 우회)
    xpiderInvoke('xpider-ext-get-wit-key').then(res => {
        const mainKey = (res && res.key) ? res.key : '';
        if (mainKey && document.getElementById('audio-stt-key')) {
            document.getElementById('audio-stt-key').value = mainKey;
        }
    }).catch(() => {});
    if (document.getElementById('stealth-mode-toggle')) {
        document.getElementById('stealth-mode-toggle').checked = (data.xpider_stealth_mode !== undefined) ? !!data.xpider_stealth_mode : true;
    }
    if (document.getElementById('double-submit-toggle')) {
        document.getElementById('double-submit-toggle').checked = !!data.xpider_double_submit;
    }
    
    const methodGroup = document.getElementById('captcha-method-group');
    if (methodGroup) methodGroup.style.display = captchaEnabled ? 'block' : 'none';
    toggleCaptchaApiVisibility();

    // Template
    if (data.xpider_tpl) {
        if (document.getElementById('tpl-first-name')) document.getElementById('tpl-first-name').value = data.xpider_tpl.firstName || '';
        if (document.getElementById('tpl-last-name')) document.getElementById('tpl-last-name').value = data.xpider_tpl.lastName || '';
        if (document.getElementById('tpl-name')) document.getElementById('tpl-name').value = data.xpider_tpl.name || '';
        if (document.getElementById('tpl-email')) document.getElementById('tpl-email').value = data.xpider_tpl.email || '';
        if (document.getElementById('tpl-phone')) document.getElementById('tpl-phone').value = data.xpider_tpl.phone || '';
        if (document.getElementById('tpl-company')) document.getElementById('tpl-company').value = data.xpider_tpl.company || '';
        if (document.getElementById('tpl-address')) document.getElementById('tpl-address').value = data.xpider_tpl.address || '';
        if (document.getElementById('tpl-street-address')) document.getElementById('tpl-street-address').value = data.xpider_tpl.address2 || '';
        if (document.getElementById('tpl-city')) document.getElementById('tpl-city').value = data.xpider_tpl.city || '';
        if (document.getElementById('tpl-state')) document.getElementById('tpl-state').value = data.xpider_tpl.state || '';
        if (document.getElementById('tpl-zip')) document.getElementById('tpl-zip').value = data.xpider_tpl.zip || '';
        if (document.getElementById('tpl-subject')) document.getElementById('tpl-subject').value = data.xpider_tpl.subject || '';
        if (document.getElementById('tpl-message')) document.getElementById('tpl-message').value = data.xpider_tpl.message || '';
    }

    // 3중 속도 복원
    if (document.getElementById('delay-input-collect')) {
        document.getElementById('delay-input-collect').value = data.xpider_delay_collect || data.xpider_delay || 6;
    }
    if (document.getElementById('delay-input-fill')) {
        document.getElementById('delay-input-fill').value = data.xpider_delay_fill || 6;
    }
    if (document.getElementById('delay-input-submit')) {
        document.getElementById('delay-input-submit').value = data.xpider_delay_submit || 6;
    }
    
    // 레거시 호환용 동기화
    if (document.getElementById('delay-input')) {
        document.getElementById('delay-input').value = data.xpider_delay_collect || data.xpider_delay || 6;
    }
    
    updateSpeedLabels();
    
    if (document.getElementById('random-delay-toggle')) {
        document.getElementById('random-delay-toggle').checked = !!data.xpider_random_delay;
    }

    // Resuming Campaign
    if (data.xpider_queue && data.xpider_queue.length > 0) {
        campaignQueue = data.xpider_queue;
        totalTargets = data.xpider_total || campaignQueue.length;
        successCount = data.xpider_success || 0;
        campaignActive = true; // Mark as active to show Pause/Stop buttons

        updateRealTimeStatus({ successCount });
        const countDisplay = document.getElementById('url-count-display');
        if (countDisplay) countDisplay.textContent = `${campaignQueue.length} (remaining) / ${totalTargets} URLs`;
        
        if (document.getElementById('file-info')) document.getElementById('file-info').classList.remove('hidden');
        if (document.getElementById('status-box')) document.getElementById('status-box').classList.remove('hidden');
        if (document.getElementById('start-btn')) document.getElementById('start-btn').classList.add('hidden');
        if (document.getElementById('multi-actions')) document.getElementById('multi-actions').classList.remove('hidden');
        
        updateProgress(Math.round(((totalTargets - campaignQueue.length) / totalTargets) * 100));
        addLog(`Resumed campaign: ${campaignQueue.length} remaining.`, 'info');
    }

    // [v1.2.0] Populate saved lists
    await updateSavedListsUI();
    
    // [v1.7.0] Populate template library
    await updateTemplateDropdown();
}

// ─── [XPIDER] Browser Language-Change Broadcast Listener ──────────────
// When the XPIDER browser language setting changes, this extension updates instantly.
window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'XPIDER_EVENT' && event.data.name === 'language-change') {
        const lang = event.data.data && event.data.data.lang;
        if (lang && typeof applyTranslations === 'function') {
            applyTranslations(lang);
            const langSelect = document.getElementById('language-select');
            if (langSelect) langSelect.value = lang;
            chrome.storage.local.set({ xpider_lang: lang });
        }
    }
});

async function clearCampaignQueue() {
    // 1. Reset campaign queue and counts
    campaignQueue = [];
    totalTargets = 0;
    successCount = 0;
    remainingTargets = 0;
    
    // 2. Hide file info and preview lists
    const fileInfo = document.getElementById('file-info');
    if (fileInfo) fileInfo.classList.add('hidden');
    
    const previewList = document.getElementById('file-urls-preview');
    if (previewList) previewList.classList.add('hidden');
    
    const previewContainer = document.getElementById('preview-list');
    if (previewContainer) previewContainer.innerHTML = '';
    
    // 3. Clear file input
    const fileInput = document.getElementById('file-input');
    if (fileInput) fileInput.value = '';
    
    const nameDisplay = document.getElementById('filename-display');
    if (nameDisplay) nameDisplay.textContent = 'No file selected';

    const countDisplay = document.getElementById('url-count-display');
    if (countDisplay) countDisplay.textContent = '0 URLs found';
    
    // 4. Update UI counts and progress
    updateRealTimeStatus({ successCount: 0, remainingCount: 0 });
    updateProgress(0);
    
    // 5. Clear Storage
    await chrome.storage.local.set({
        xpider_queue: [],
        xpider_total: 0,
        xpider_success: 0
    });
    
    // 6. Log success
    addLog("Business URLs list cleared.", "stop");
}

// [WitKey-Sync] 실시간 스토리지 변경 시 UI 자동 업데이트 처리
chrome.storage.onChanged.addListener((changes) => {
    let newKey = null;
    if (changes.xpider_stt_api_key && changes.xpider_stt_api_key.newValue !== undefined) {
        newKey = changes.xpider_stt_api_key.newValue;
    } else if (changes.audioSttKey && changes.audioSttKey.newValue !== undefined) {
        newKey = changes.audioSttKey.newValue;
    } else if (changes.witKey && changes.witKey.newValue !== undefined) {
        newKey = changes.witKey.newValue;
    }
    
    if (newKey !== null) {
        console.log(`[WitKey-Sync] Sender Popup Storage changed → Syncing UI to new key: ${newKey ? newKey.substring(0, 8) + '...' : 'NONE'}`);
        
        // 1) 설정창의 STT API Key 입력창 갱신
        const sttKeyInput = document.getElementById('audio-stt-key');
        if (sttKeyInput) sttKeyInput.value = newKey;
        
        // 2) 최초 STT 설정 모달 입력 필드 갱신
        const setupInput = document.getElementById('setup-stt-key-input');
        if (setupInput) setupInput.value = newKey;
        
        // 3) 최초 STT 설정 모달 가시성 제어
        const setupModal = document.getElementById('stt-setup-modal-overlay');
        if (setupModal) {
            if (newKey) {
                setupModal.classList.add('hidden'); // 키가 존재하면 숨김
            } else {
                setupModal.classList.remove('hidden'); // 키가 없으면 노출
            }
        }
    }
});



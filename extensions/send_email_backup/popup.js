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

/**
 * X PIDER Sender Pro - Logic v1.1.0 (Side Panel & Full Settings)
 */

let currentTpl = {};
let campaignQueue = [];
let campaignActive = false;
let campaignPaused = false;
let successCount = 0;
let totalTargets = 0;
let i18nData = null;
let lastLogMessage = "Ready..."; // [v2.5.5] For 3-line monitor
let remainingTargets = 0;          // [v2.5.5] For 3-line monitor

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

document.addEventListener('DOMContentLoaded', async () => {
    // ── Step 1: Bind ALL events FIRST (no async, cannot fail) ──
    try { bindEvents(); } catch(e) { console.error('[Popup] bindEvents failed:', e); }
    
    // ── Step 2: Connect to runtime (non-critical, ignore errors) ──
    try { chrome.runtime.connect({ name: 'xpider_popup' }); } catch(e) {}

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

    // ── Step 7: Real-time log listener ──
    try {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === 'SENDER_LOG') {
                addLog(request.message, request.logType);
            } else if (request.action === 'UPDATE_STATS') {
                updateRealTimeStatus(request.data);
            }
        });
    } catch(e) { console.error('[Popup] onMessage listener failed:', e); }

    // ── Step 8: Speed slider ──
    try {
        const delayInput = document.getElementById('delay-input');
        if (delayInput) delayInput.addEventListener('input', updateSpeedLabel);
    } catch(e) {}

    console.log("✅ X PIDER Sender Pro initialized.");

    // ── Step 9: State Handshake ──
    try {
        chrome.runtime.sendMessage({ action: 'GET_STATE' }, (response) => {
            if (response && response.success) {
                if (response.isActive) {
                    campaignActive = true;
                    totalTargets = response.totalTargets;
                    successCount = response.successCount;
                    remainingTargets = response.remainingCount;
                    
                    document.getElementById('status-box').classList.remove('hidden');
                    document.getElementById('multi-actions').classList.remove('hidden');
                    document.getElementById('start-btn').classList.add('hidden');
                    
                    updateRealTimeStatus({
                        successCount: successCount,
                        remainingCount: remainingTargets
                    });
                } else {
                    campaignActive = false;
                    document.getElementById('start-btn').classList.remove('hidden');
                    document.getElementById('multi-actions').classList.add('hidden');
                }
            }
        });
    } catch(e) { console.error('[Popup] GET_STATE failed:', e); }

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
});

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
    if (data.successCount !== undefined) {
        successCount = data.successCount;
        const display = document.getElementById('success-count-display');
        if (display) display.textContent = successCount;
    }
    
    if (data.remainingCount !== undefined) {
        remainingTargets = data.remainingCount;
        const processed = totalTargets - remainingTargets;
        const progress = totalTargets > 0 ? Math.round((processed / totalTargets) * 100) : 0;
        updateProgress(progress);
        
        refreshStatusDetailUI();

        const countDisplay = document.getElementById('url-count-display');
        if (countDisplay) {
            const lang = document.getElementById('language-select')?.value || 'en';
            const dict = i18nData[lang] || i18nData['en'] || {};
            const remainingLabel = dict.remaining_suffix || 'remaining';
            countDisplay.textContent = `${remainingTargets} (${remainingLabel}) / ${totalTargets} Recipients`;
        }
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
    const dict = i18nData[lang] || i18nData['en'] || {};
    const suffix = dict.remaining_suffix || 'remaining.';
    
    // [v2.8.9] Simplified UI: Only show remaining count, remove log noise
    statusDetail.textContent = `${remainingTargets} ${suffix}`;
    statusDetail.style.fontWeight = '500';
    statusDetail.style.fontSize = '0.85rem'; // Smaller font as requested
    statusDetail.style.color = '#facc15'; 
}

function updateSpeedLabel() {
    const slider = document.getElementById('delay-input');
    const display = document.getElementById('speed-value-display');
    const lang = document.getElementById('language-select')?.value || 'en';
    const dict = i18nData[lang] || i18nData['en'] || {};
    
    if (!slider || !display) return;
    
    const level = slider.value;
    let label = `${dict.speed_level || 'Level'} ${level}`;
    if (level === '6') label += ` <small>${dict.speed_normal || '(Normal)'}</small>`;
    
    display.innerHTML = label;
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
    ['tpl-first-name', 'tpl-last-name', 'tpl-name', 'tpl-email', 'tpl-sender-name', 'tpl-phone', 'tpl-subject', 'tpl-message'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', saveTemplate);
    });

    const tplLibrarySelect = document.getElementById('tpl-library-select');
    if (tplLibrarySelect) {
        tplLibrarySelect.addEventListener('change', loadTemplateFromLibrary);
    }

    // Clear List Button
    const clearListBtn = document.getElementById('clear-list-btn');
    if (clearListBtn) {
        clearListBtn.addEventListener('click', clearCampaignQueue);
    }

    // Single Email & List Management
    const addUrlBtn = document.getElementById('add-url-btn');
    if (addUrlBtn) {
        // [v2.0.0] Changed from addSingleUrl to addSingleEmail
        addUrlBtn.addEventListener('click', addSingleEmail);
    }
    
    const manualUrlInput = document.getElementById('manual-url-input');
    if (manualUrlInput) {
        manualUrlInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') addSingleEmail();
        });
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

/**
 * [v2.0.0] Shared Email Extraction Engine
 * Matches any valid email format across messy text / CSV / TXT
 * [v2.0.1] Applied super-strong filter to completely block portal, government, org, gov domains.
 */
function extractEmails(text) {
    if (!text) return [];
    const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
    const matches = text.match(emailRegex) || [];
    
    // [v1.3.2] Super-strong Email Blacklist (Excludes portals, government offices, org, gov domains)
    const blacklist = [
        // 관공서 및 공공기관 도메인
        '.gov', '.go.kr', 'korea.kr', 'police.go.kr', 'spo.go.kr', 'assembly.go.kr', 'scourt.go.kr',
        // .org 및 비영리/기타 공공 도메인
        '.org', '.or.kr', 
        // 유명 포탈 도메인
        'naver.com', 'daum.net', 'hanmail.net', 'gmail.com', 'outlook.com', 'hotmail.com', 'nate.com', 'yahoo.com', 'yahoo.co.kr', 'icloud.com',
        // 기본 제외 키워드
        'noreply', 'no-reply', 'admin', 'postmaster'
    ];
    
    return [...new Set(matches)].filter(email => {
        const lower = email.toLowerCase();
        return !blacklist.some(domain => lower.includes(domain));
    });
}

async function handleFileUpload(e) {
    e.preventDefault();
    const file = e.target.files ? e.target.files[0] : e.dataTransfer.files[0];
    if (!file) return;

    const nameDisplay = document.getElementById('filename-display');
    if (nameDisplay) nameDisplay.textContent = file.name;
    
    const text = await file.text();
    const extracted = extractEmails(text);
    
    if (extracted.length === 0) {
        addLog("No valid emails found in the file.", "error");
        return;
    }

    campaignQueue = extracted;

    totalTargets = campaignQueue.length;
    const countDisplay = document.getElementById('url-count-display');
    if (countDisplay) countDisplay.textContent = `${totalTargets} Recipients found`;
    
    const fileInfo = document.getElementById('file-info');
    if (fileInfo) fileInfo.classList.remove('hidden');
    
    // [v1.2.0] Save to Permanent Lists
    await saveListToStorage(file.name, campaignQueue);

    chrome.storage.local.set({ 
        xpider_queue: campaignQueue,
        xpider_total: totalTargets,
        xpider_success: 0
    });
    addLog(`Loaded ${totalTargets} recipient emails.`, 'info');
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
            if (countDisplay) countDisplay.textContent = `${campaignQueue.length} Recipients found`;
            document.getElementById('file-info').classList.remove('hidden');
            document.getElementById('status-box').classList.remove('hidden');
            
            addLog(`Loaded saved list: ${list.name} (${list.urls.length} Recipients)`, 'info');
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
 * [v2.2.0] Save current message setup as a template
 */
async function saveTemplateChanges() {
    const now = new Date();
    const versionStr = `[v${now.getFullYear()}.${String(now.getMonth()+1).padStart(2,'0')}.${String(now.getDate()).padStart(2,'0')}]`;
    
    const messageEl = document.getElementById('tpl-message');
    let message = messageEl.value;
    
    // [v2.4.0] Update version in body if requested
    const versionPattern = /\[v\d{4}\.\d{2}\.\d{2}\]/;
    if (versionPattern.test(message)) {
        message = message.replace(versionPattern, versionStr);
    } else {
        message += `\n\n${versionStr}`;
    }
    messageEl.value = message;

    const tpl = {
        senderName: document.getElementById('tpl-sender-name').value.trim(),
        firstName: document.getElementById('tpl-first-name').value.trim(),
        lastName: document.getElementById('tpl-last-name').value.trim(),
        name: document.getElementById('tpl-name').value.trim(),
        email: document.getElementById('tpl-email').value.trim(),
        phone: document.getElementById('tpl-phone').value.trim(),
        subject: document.getElementById('tpl-subject').value.trim(),
        message: message.trim()
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

    // Provide feedback
    ['save-tpl-btn', 'save-tpl-changes-btn', 'save-tpl-bottom-btn'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            const originalText = btn.textContent;
            btn.textContent = "✅ Saved!";
            setTimeout(() => btn.textContent = originalText, 1800);
        }
    });

    addLog(`✅ Template saved: ${result.fileName}`, 'success');
}

function buildTemplateFileContent(tpl) {
    return `[XPIDER MESSAGE TEMPLATE]
-----------------------------------------
Sender Name:      ${tpl.senderName || 'N/A'}
Target Full Name: ${tpl.name || 'N/A'}
First Name:       ${tpl.firstName || 'N/A'}
Last Name:        ${tpl.lastName || 'N/A'}
Email:            ${tpl.email || 'N/A'}
Phone:            ${tpl.phone || 'N/A'}
Subject:          ${tpl.subject || 'N/A'}

[MESSAGE BODY]
-----------------------------------------
${tpl.message || ''}
-----------------------------------------
Generated by XPIDER Send Pro
`;
}



async function addSingleEmail() {
    const input = document.getElementById('manual-url-input');
    if (!input || !input.value.trim()) return;
    
    const email = input.value.trim();
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    
    if (!emailRegex.test(email)) {
        addLog(`Invalid email format: ${email}`, 'error');
        return;
    }

    // Apply super-strong blacklist filter
    const cleaned = extractEmails(email);
    if (cleaned.length === 0) {
        addLog(`Blocked by blackbox filter (portal/gov/org/system): ${email}`, 'error');
        return;
    }

    // [v1.2.1] NEW: Save to Permanent "Manual Entries" List
    const lang = document.getElementById('language-select')?.value || 'en';
    const dict = i18nData[lang] || i18nData['en'] || {};
    const manualListName = dict.list_manual_entries || 'Manual Entries';
    
    const data = await chrome.storage.local.get(['xpider_saved_lists']);
    let lists = data.xpider_saved_lists || [];
    
    let manualList = lists.find(l => l.name === manualListName);
    if (!manualList) {
        manualList = { name: manualListName, urls: [], date: new Date().toISOString() };
        lists.unshift(manualList); // Put at top
    }
    
    // Avoid duplicate in the manual list
    if (!manualList.urls.includes(email)) {
        manualList.urls.push(email);
        manualList.date = new Date().toISOString();
    }
    
    await chrome.storage.local.set({ xpider_saved_lists: lists });
    await updateSavedListsUI();
    
    // Also add to current queue immediately for UX
    if (!campaignQueue.includes(email)) {
        campaignQueue.push(email);
        totalTargets = campaignQueue.length;
        remainingTargets = totalTargets;
        const countDisplay = document.getElementById('url-count-display');
        if (countDisplay) countDisplay.textContent = `${totalTargets} Recipients ready`;
    }

    addLog(`Manual Email added: ${email}`, 'info');
    input.value = '';
}

function startCampaign() {
    // If input has value, add it before starting if empty queue
    const manualInput = document.getElementById('manual-url-input');
    if (manualInput && manualInput.value.trim() && campaignQueue.length === 0) {
        addSingleEmail();
    }

    if (campaignQueue.length === 0) return alert("Please upload a file or enter an email first.");

    currentTpl = {
        senderName: document.getElementById('tpl-sender-name').value,
        firstName: document.getElementById('tpl-first-name').value,
        lastName: document.getElementById('tpl-last-name').value,
        name: document.getElementById('tpl-name').value,
        email: document.getElementById('tpl-email').value,
        phone: document.getElementById('tpl-phone').value,
        subject: document.getElementById('tpl-subject').value,
        message: document.getElementById('tpl-message').value
    };

    if (!currentTpl.message) return alert("Please enter a message body.");

    campaignActive = true;
    campaignPaused = false;
    successCount = 0;
    // Reset Stats for fresh start
    successCount = 0;
    updateRealTimeStatus({ successCount: 0, remainingCount: campaignQueue.length });
    updateProgress(0);
    
    setTimeout(() => {
        document.getElementById('status-box').classList.remove('hidden');
        document.getElementById('multi-actions').classList.remove('hidden');
        document.getElementById('start-btn').classList.add('hidden');
    }, 100);

    // [v2.5.0] Auto-scroll to status board
    const statusBox = document.getElementById('status-box');
    if (statusBox) {
        statusBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    const delayInput = document.getElementById('delay-input');
    const level = parseInt(delayInput ? delayInput.value : 6);
    // [v18.7.0] Slower Tempo Range: 0 (60s) to 9 (3s). Normal (6) is 10s.
    const levelToMs = [60000, 45000, 30000, 25000, 20000, 15000, 10000, 7000, 5000, 3000];
    const delayMs = levelToMs[level] || 10000;

    // Delegate to background
    const messagePayload = {
        action: 'START_CAMPAIGN',
        queue: campaignQueue,
        template: saveTemplate(), // [v18.20.0] Ensure latest UI data is sent
        delayMs: delayMs
    };

    // [v18.25.0] Deep Diagnostic Timeout: Read engine blackbox on stall
    const bootTimeout = setTimeout(() => {
        chrome.storage.local.get(['xpider_boot_step', 'xpider_boot_ts', 'xpider_boot_error'], (data) => {
            const step = data.xpider_boot_step || 'unknown';
            const error = data.xpider_boot_error;
            const timeAgo = data.xpider_boot_ts ? Math.round((Date.now() - data.xpider_boot_ts) / 1000) : '?';
            
            addLog(`⚠️ [System] Connection stall detected (6s). Engine is non-responsive.`, "error");
            addLog(`📝 Internal State: [${step}] (last activity: ${timeAgo}s ago)`, "debug");
            if (error) addLog(`❌ Boot Error: ${error}`, "error");
            addLog(`💡 Suggestion: Click '⚙️ Settings' -> 'Emergency Recovery' to force restart the engine.`, "info");
        });
    }, 6000);

    try {
        chrome.runtime.sendMessage(messagePayload, (response) => {
            clearTimeout(bootTimeout);
            
            if (chrome.runtime.lastError) {
                console.error("[Handshake Error]", chrome.runtime.lastError.message);
                addLog(`❌ [System] Connection failed: ${chrome.runtime.lastError.message}`, "error");
                return;
            }

            if (response && response.success) {
                console.log("Campaign orchestrated by background.");
                addLog("[System] Engine responded. Starting sending loop...", "debug");
            } else {
                const err = (response && response.error) ? response.error : "Unknown background error";
                addLog(`❌ [Engine Error] ${err}`, "error");
            }
        });
    } catch (e) {
        clearTimeout(bootTimeout);
        addLog(`❌ [Fatal Error] ${e.message}`, "error");
    }
}

function togglePause() {
    campaignPaused = !campaignPaused;
    const btn = document.getElementById('pause-btn');
    const langSelect = document.getElementById('language-select');
    const lang = langSelect ? langSelect.value : 'en';
    const dict = i18nData[lang] || i18nData['en'] || {};
    
    if (btn) btn.textContent = campaignPaused ? (dict.btn_resume || "▶️ Resume") : (dict.btn_pause || "⏸️ Pause");
    if (!campaignPaused) processNext();
}

function stopCampaign() {
    campaignActive = false;
    document.getElementById('start-btn').classList.remove('hidden');
    document.getElementById('multi-actions').classList.add('hidden');
    
    chrome.runtime.sendMessage({ action: 'STOP_CAMPAIGN' });
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
}

function saveTemplate() {
    const tpl = {
        senderName: document.getElementById('tpl-sender-name').value,
        firstName: document.getElementById('tpl-first-name').value,
        lastName: document.getElementById('tpl-last-name').value,
        name: document.getElementById('tpl-name').value,
        email: document.getElementById('tpl-email').value,
        phone: document.getElementById('tpl-phone').value,
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

        document.getElementById('tpl-sender-name').value = tpl.senderName || '';
        document.getElementById('tpl-first-name').value = tpl.firstName || '';
        document.getElementById('tpl-last-name').value  = tpl.lastName  || '';
        document.getElementById('tpl-name').value        = tpl.name      || '';
        document.getElementById('tpl-email').value       = tpl.email     || '';
        document.getElementById('tpl-phone').value       = tpl.phone     || '';
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
                const matchSenderName = line.match(/Sender Name:\s*(.*)/i);
                const matchName = line.match(/Target Full Name:\s*(.*)/i);
                const matchFirst = line.match(/First Name:\s*(.*)/i);
                const matchLast = line.match(/Last Name:\s*(.*)/i);
                const matchEmail = line.match(/Email:\s*(.*)/i);
                const matchPhone = line.match(/Phone:\s*(.*)/i);
                const matchSubject = line.match(/Subject:\s*(.*)/i);

                if (matchSenderName) document.getElementById('tpl-sender-name').value = matchSenderName[1].trim();
                if (matchName) document.getElementById('tpl-name').value = matchName[1].trim();
                if (matchFirst) document.getElementById('tpl-first-name').value = matchFirst[1].trim();
                if (matchLast) document.getElementById('tpl-last-name').value = matchLast[1].trim();
                if (matchEmail) document.getElementById('tpl-email').value = matchEmail[1].trim();
                if (matchPhone) document.getElementById('tpl-phone').value = matchPhone[1].trim();
                if (matchSubject) document.getElementById('tpl-subject').value = matchSubject[1].trim();
            });

            // Clean up message body text
            let bodyText = bodyLines.join('\n').trim();
            // Remove the trailing separator and footer often found in exported files
            bodyText = bodyText.replace(/---+\s*Generated by XPIDER Send Pro.*/s, '').trim();
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
            senderName: document.getElementById('tpl-sender-name').value,
            firstName: document.getElementById('tpl-first-name').value,
            lastName: document.getElementById('tpl-last-name').value,
            name: document.getElementById('tpl-name').value,
            email: document.getElementById('tpl-email').value,
            phone: document.getElementById('tpl-phone').value,
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
    const sttKeyInput = document.getElementById('audio-stt-key');
    const stealthToggle = document.getElementById('stealth-mode-toggle');
    const delayInput = document.getElementById('delay-input');
    const randomToggle = document.getElementById('random-delay-toggle');

    const lang = langSelect ? langSelect.value : 'en';
    const settings = {
        xpider_lang: lang,
        xpider_captcha_enabled: captchaToggle ? captchaToggle.checked : false,
        xpider_captcha_method: methodSelect ? methodSelect.value : 'audio',
        xpider_captcha_api_key: apiKeyInput ? apiKeyInput.value : '',
        xpider_audio_stt_key: sttKeyInput ? sttKeyInput.value : '',
        xpider_stealth_mode: stealthToggle ? stealthToggle.checked : false,
        xpider_delay: delayInput ? delayInput.value : 6,
        xpider_random_delay: randomToggle ? randomToggle.checked : false
    };
    await chrome.storage.local.set(settings);
    
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
        'xpider_lang', 'xpider_tpl', 'xpider_delay', 'xpider_queue', 'xpider_success', 'xpider_total',
        'xpider_captcha_enabled', 'xpider_captcha_method', 'xpider_captcha_api_key', 'xpider_audio_stt_key', 'xpider_stealth_mode'
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
        document.getElementById('audio-stt-key').value = data.xpider_audio_stt_key || '';
    }
    if (document.getElementById('stealth-mode-toggle')) {
        document.getElementById('stealth-mode-toggle').checked = (data.xpider_stealth_mode !== undefined) ? !!data.xpider_stealth_mode : true;
    }
    
    const methodGroup = document.getElementById('captcha-method-group');
    if (methodGroup) methodGroup.style.display = captchaEnabled ? 'block' : 'none';
    toggleCaptchaApiVisibility();

    // Template
    if (data.xpider_tpl) {
        if (document.getElementById('tpl-sender-name')) document.getElementById('tpl-sender-name').value = data.xpider_tpl.senderName || '';
        if (document.getElementById('tpl-first-name')) document.getElementById('tpl-first-name').value = data.xpider_tpl.firstName || '';
        if (document.getElementById('tpl-last-name')) document.getElementById('tpl-last-name').value = data.xpider_tpl.lastName || '';
        if (document.getElementById('tpl-name')) document.getElementById('tpl-name').value = data.xpider_tpl.name || '';
        if (document.getElementById('tpl-email')) document.getElementById('tpl-email').value = data.xpider_tpl.email || '';
        if (document.getElementById('tpl-phone')) document.getElementById('tpl-phone').value = data.xpider_tpl.phone || '';
        if (document.getElementById('tpl-subject')) document.getElementById('tpl-subject').value = data.xpider_tpl.subject || '';
        if (document.getElementById('tpl-message')) document.getElementById('tpl-message').value = data.xpider_tpl.message || '';
    }

    if (data.xpider_delay && document.getElementById('delay-input')) {
        document.getElementById('delay-input').value = data.xpider_delay;
        updateSpeedLabel();
    }
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
    
    // 2. Hide file info
    const fileInfo = document.getElementById('file-info');
    if (fileInfo) fileInfo.classList.add('hidden');
    
    // 3. Clear file input
    const fileInput = document.getElementById('file-input');
    if (fileInput) fileInput.value = '';
    
    const nameDisplay = document.getElementById('filename-display');
    if (nameDisplay) nameDisplay.textContent = 'No file selected';

    const countDisplay = document.getElementById('url-count-display');
    if (countDisplay) countDisplay.textContent = '0 Recipients found';
    
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
    addLog("Recipient emails list cleared.", "stop");
}

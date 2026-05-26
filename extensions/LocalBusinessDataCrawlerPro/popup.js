// [Extension Popup Script] v1.0.0 Pro

document.addEventListener('DOMContentLoaded', () => {
    // [v18.1] STRICT Persistent Port Connection to detect popup closure instantly
    chrome.runtime.connect({ name: 'popup-ctrl' });

    // ─── XPIDER IPC 브릿지 ────────────────────────────────────────────────────
    function xpiderInvoke(channel, args) {
        return new Promise((resolve) => {
            const id = `vpn-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            const handler = (event) => {
                if (event.data && event.data.type === 'XPIDER_RESPONSE' && event.data.id === id) {
                    window.removeEventListener('message', handler);
                    clearTimeout(timer);
                    resolve(event.data.result || null);
                }
            };
            const timer = setTimeout(() => {
                window.removeEventListener('message', handler);
                resolve(null);
            }, 10000);
            window.addEventListener('message', handler);
            window.postMessage({ type: 'XPIDER_INVOKE', channel, args: args || {}, id }, '*');
        });
    }

    // ─── VPN 권장 팝업 모달 ──────────────────────────────────────────────────
    function showVpnRecommendationModal(callback) {
        const existing = document.getElementById('xpider-vpn-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'xpider-vpn-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(8, 8, 12, 0.85);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 999999;
            opacity: 0;
            transition: opacity 0.3s ease;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        `;

        const card = document.createElement('div');
        card.style.cssText = `
            background: linear-gradient(145deg, rgba(26, 27, 38, 0.95), rgba(17, 18, 26, 0.95));
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 16px;
            padding: 30px 24px;
            width: 90%;
            max-width: 380px;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 40px rgba(99, 102, 241, 0.1);
            text-align: center;
            transform: scale(0.9);
            transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
            box-sizing: border-box;
        `;

        card.innerHTML = `
            <div style="font-size: 40px; margin-bottom: 16px; display: inline-block; filter: drop-shadow(0 4px 12px rgba(99, 102, 241, 0.4));">🛡️</div>
            <h2 style="color: #ffffff; font-size: 20px; font-weight: 700; margin: 0 0 12px 0; letter-spacing: -0.5px;">🔒 XPIDER VPN Recommended</h2>
            <p style="color: #94a3b8; font-size: 13.5px; line-height: 1.6; margin: 0 0 24px 0; word-break: keep-all; font-weight: 400;">
                To maximize leads deliverability, bypass target server blocks, and ensure complete data security, we highly recommend running this module through the XPIDER VPN proxy network.
            </p>
            <button id="xpider-vpn-btn-connect" style="
                width: 100%;
                padding: 13px 20px;
                font-size: 14px;
                font-weight: 600;
                color: #ffffff;
                background: linear-gradient(135deg, #6366f1, #a855f7);
                border: none;
                border-radius: 10px;
                cursor: pointer;
                box-shadow: 0 4px 15px rgba(168, 85, 247, 0.3);
                transition: all 0.2s ease;
                outline: none;
                margin-bottom: 14px;
            ">Turn on VPN & Start</button>
            <div id="xpider-vpn-btn-bypass" style="
                display: inline-block;
                font-size: 12.5px;
                color: #64748b;
                cursor: pointer;
                text-decoration: none;
                transition: color 0.2s ease;
                font-weight: 500;
            " onmouseover="this.style.color='#cbd5e1'" onmouseout="this.style.color='#64748b'">Continue unprotected</div>
        `;

        modal.appendChild(card);
        document.body.appendChild(modal);

        requestAnimationFrame(() => {
            modal.style.opacity = '1';
            card.style.transform = 'scale(1)';
        });

        const connectBtn = card.querySelector('#xpider-vpn-btn-connect');
        const bypassBtn = card.querySelector('#xpider-vpn-btn-bypass');

        connectBtn.onmouseover = () => {
            connectBtn.style.transform = 'translateY(-1px)';
            connectBtn.style.boxShadow = '0 6px 20px rgba(168, 85, 247, 0.45)';
        };
        connectBtn.onmouseout = () => {
            connectBtn.style.transform = 'translateY(0)';
            connectBtn.style.boxShadow = '0 4px 15px rgba(168, 85, 247, 0.3)';
        };

        const closeModal = (choice) => {
            modal.style.opacity = '0';
            card.style.transform = 'scale(0.9)';
            setTimeout(() => {
                modal.remove();
                callback(choice);
            }, 300);
        };

        connectBtn.onclick = () => closeModal('connect');
        bypassBtn.onclick = () => closeModal('bypass');
    }

    // ─── 안전 로그 출력 헬퍼 (UI 에러 방지) ──────────────────────────────────
    function safeLog(msg, type = 'info') {
        console.log(`[XPIDER-VPN-BRIDGE] ${msg}`);
        try {
            if (typeof addLog === 'function') {
                addLog(msg, type);
            }
        } catch (e) {
            console.warn('safeLog failed to render in UI:', e.message);
        }
    }

    // ─── VPN 상태 검사 및 자동 구동 연동 ───────────────────────────────────────
    async function checkVpnAndStart(onStartCallback) {
        let isVpnConnected = false;
        try {
            const vpnState = await xpiderInvoke('xpider-vpn-get-state');
            isVpnConnected = !!(vpnState && vpnState.connected);
        } catch (e) {
            console.error('Failed to fetch VPN state via IPC:', e);
        }

        if (isVpnConnected) {
            onStartCallback();
            return;
        }

        try {
            showVpnRecommendationModal(async (choice) => {
                if (choice === 'connect') {
                    safeLog('[VPN] Auto-connecting XPIDER VPN for secure operation...', 'info');
                    try {
                        const connRes = await xpiderInvoke('xpider-vpn-connect', { autoSelect: true });
                        if (connRes && connRes.ok) {
                            safeLog('✅ [VPN] Securely connected to XPIDER VPN proxy!', 'success');
                            await new Promise(r => setTimeout(r, 1500));
                            onStartCallback();
                        } else {
                            safeLog('⚠️ [VPN] Connection failed. Starting unprotected...', 'warning');
                            onStartCallback();
                        }
                    } catch (err) {
                        safeLog('⚠️ [VPN] Connection failed with error. Starting unprotected...', 'warning');
                        console.error('VPN auto-connect failed:', err);
                        onStartCallback();
                    }
                } else if (choice === 'bypass') {
                    safeLog('⚠️ [Security] Running operation without VPN protection.', 'warning');
                    onStartCallback();
                }
            });
        } catch (e) {
            console.error('Failed to show VPN recommendation modal:', e);
            onStartCallback();
        }
    }

    // UI Elements Reference
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    const startBtn = document.getElementById('start-btn');
    const pauseBtn = document.getElementById('pause-btn');
    const cancelBtn = document.getElementById('cancel-btn');
    const textInput = document.getElementById('text-input');
    const urlInput = document.getElementById('url-input');
    const depthRange = document.getElementById('depth-range');
    const depthValue = document.getElementById('depth-value');

    const engineMultiSelect = document.getElementById('engine-multi-select');
    const engineSelectHeader = document.getElementById('engine-select-header');
    const engineOptions = document.getElementById('engine-options');
    const engineListContainer = document.getElementById('engine-list-container');
    const selectAllEngines = document.getElementById('select-all-engines');
    const keywordInput = document.getElementById('keyword-input');
    const startPageRange = document.getElementById('start-page-range');
    const endPageRange = document.getElementById('end-page-range');
    const startPageValue = document.getElementById('start-page-value');
    const endPageValue = document.getElementById('end-page-value');
    const collectionTarget = document.getElementById('collection-target');

    // [v36.9] Explicit slider initialization to ensure reliable start state
    if (startPageRange) startPageRange.value = 1;
    if (endPageRange) endPageRange.value = 1;
    if (startPageValue) startPageValue.textContent = "1";
    if (endPageValue) endPageValue.textContent = "1";

    const settingsToggle = document.getElementById('settings-toggle');
    const settingsOverlay = document.getElementById('settings-overlay');
    const settingsClose = document.getElementById('settings-close');

    const languageSelect = document.getElementById('language-select');
    const regionSelect = document.getElementById('region-select');
    const saveSettingsBtn = document.getElementById('save-settings-btn');

    const statusBox = document.getElementById('status-box');
    const logContainer = document.getElementById('log-container');
    const toggleDiagnosticsBtn = document.getElementById('toggle-diagnostics-btn');
    const captchaLogBox = document.getElementById('captcha-log-box');
    const captchaLogContainer = document.getElementById('captcha-log-container');
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');
    const statusDetail = document.getElementById('status-detail');
    const linkCountSpan = document.getElementById('link-count');
    const resultBox = document.getElementById('result-box');
    const resultTableBody = document.querySelector('#result-table tbody');
    const downloadCsv = document.getElementById('download-csv');
    const downloadTxt = document.getElementById('download-txt');
    const downloadGs = document.getElementById('download-gs');
    const captchaModalOverlay = document.getElementById('captcha-modal-overlay');
    const captchaSolveToggle = document.getElementById('captcha-solve-toggle');
    // [v1.1.3] Hard Block Recovery UI
    const hardBlockModalOverlay = document.getElementById('hard-block-modal-overlay');
    const btnWait30 = document.getElementById('btn-wait-30');
    const btnVpnResume = document.getElementById('btn-vpn-resume');
    const captchaWitaiGroup = document.getElementById('captcha-witai-group'); // Wit.ai 전용 그룹
    const stealthModeToggle = document.getElementById('stealth-mode-toggle');
    const audioSttKeyInput = document.getElementById('audio-stt-key');
    const autoClearSessionToggle = document.getElementById('auto-clear-session-toggle');
    const stealthHeadersToggle = document.getElementById('stealth-headers-toggle');

    // [v4.9.44] CAPTCHA Wit.ai Token Quick Setup Elements
    const captchaWitInputContainer = document.getElementById('captcha-wit-input-container');
    const captchaWitKeyInput = document.getElementById('captcha-wit-key-input');
    const captchaWitSaveBtn = document.getElementById('captcha-wit-save-btn');
    const captchaWitLinkBtn = document.getElementById('captcha-wit-link-btn');

    const vpnCheckToggle = document.getElementById('vpn-check-toggle');
    const slowModeToggle = document.getElementById('slow-mode-toggle');
    const proxyEnableToggle = document.getElementById('proxy-enable-toggle');
    const proxySettingsFields = document.getElementById('proxy-settings-fields');
    const proxyHostInput = document.getElementById('proxy-host-input');
    const proxyPortInput = document.getElementById('proxy-port-input');
    const proxyUserInput = document.getElementById('proxy-user-input');
    const proxyPassInput = document.getElementById('proxy-pass-input');

    let currentTab = 'text';
    let results = [];
    let i18nData = null;

    // [v68.0] Unified i18n Data Initialization
    function initI18n() {
        console.log('[v68.0][Popup] Initializing i18n and storage...');
        i18nData = window.I18N_DATA || null;

        if (!i18nData) {
            console.error('[v68.0][Popup] I18N_DATA not found. translations.js might have failed to load.');
        }

        chrome.storage.local.get(['language', 'region', 'captchaSolveEnabled', 'stealthModeEnabled', 'audioSttKey', 'proxyEnabled', 'proxyHost', 'proxyPort', 'proxyUser', 'proxyPass', 'showDiagnostics', 'autoClearSessionEnabled', 'stealthHeadersEnabled'], (storage) => {
            if (chrome.runtime.lastError || !storage) {
                console.error('[v68.0][Popup] Storage access failed:', chrome.runtime.lastError);
                return;
            }
            const lang = storage.language || 'en';
            const reg = storage.region || 'us';
            
            if (languageSelect) languageSelect.value = lang;
            if (regionSelect) regionSelect.value = reg;

            if (captchaSolveToggle) {
                captchaSolveToggle.checked = !!storage.captchaSolveEnabled;
                // [v1.1.3] Wit.ai 그룹만 표시
                if (captchaWitaiGroup) captchaWitaiGroup.style.display = storage.captchaSolveEnabled ? 'block' : 'none';
            }
            if (audioSttKeyInput) audioSttKeyInput.value = storage.audioSttKey || '';
            if (stealthModeToggle) stealthModeToggle.checked = !!storage.stealthModeEnabled;
            if (vpnCheckToggle) vpnCheckToggle.checked = !!storage.vpnCheckEnabled;
            if (slowModeToggle) slowModeToggle.checked = !!storage.slowModeEnabled;

            // 기본값은 true (보안 우회 극대화)
            const autoClear = storage.autoClearSessionEnabled !== undefined ? !!storage.autoClearSessionEnabled : true;
            const stealthHeaders = storage.stealthHeadersEnabled !== undefined ? !!storage.stealthHeadersEnabled : true;
            
            if (autoClearSessionToggle) autoClearSessionToggle.checked = autoClear;
            if (stealthHeadersToggle) stealthHeadersToggle.checked = stealthHeaders;

            if (proxyEnableToggle) {
                proxyEnableToggle.checked = !!storage.proxyEnabled;
                proxySettingsFields.classList.toggle('hidden', !storage.proxyEnabled);
            }
            if (proxyHostInput) proxyHostInput.value = storage.proxyHost || '';
            if (proxyPortInput) proxyPortInput.value = storage.proxyPort || '';
            if (proxyUserInput) proxyUserInput.value = storage.proxyUser || '';
            if (proxyPassInput) proxyPassInput.value = storage.proxyPass || '';
            
            // Diagnostics log visibility initialization
            const showDiag = !!storage.showDiagnostics;
            if (toggleDiagnosticsBtn) {
                toggleDiagnosticsBtn.classList.toggle('active', showDiag);
            }
            if (captchaLogBox) {
                captchaLogBox.classList.toggle('hidden', !showDiag);
            }
            
            // [v11.0] Initial captcha logs load
            chrome.runtime.sendMessage({ action: 'GET_CAPTCHA_LOGS' }, (resp) => {
                if (resp && resp.logs && resp.logs.length > 0) {
                    updateCaptchaLogs(resp.logs);
                }
            });

            if (i18nData) {
                applyTranslations(lang, reg);
            } else {
                // Fallback attempt if script was slow
                setTimeout(() => {
                   i18nData = window.I18N_DATA || null;
                   if (i18nData) applyTranslations(lang, reg);
                }, 500);
            }

            if (!storage.language || !storage.region) {
                chrome.storage.local.set({ language: lang, region: reg });
            }
        });
    }

    initI18n();

    try {
        // [v17.0] Full Session Sync: Restore UI state on popup open
        chrome.runtime.sendMessage({ action: 'GET_SEARCH_STATE', full: true }, (res) => {
            if (chrome.runtime.lastError || !res) return;
            
            if (res.isSearching) {
                chrome.storage.local.get(['savedTargetOption', 'savedTargetText'], (storageRes) => {
                    if (storageRes.savedTargetOption) {
                        if (collectionTarget) collectionTarget.value = storageRes.savedTargetOption;
                        document.body.className = "target-mode-" + storageRes.savedTargetOption;
                        const tSpan = document.getElementById('current-target-name');
                        if (tSpan) tSpan.textContent = storageRes.savedTargetText || 'All';
                    }
                });
                startBtn.disabled = true;
                pauseBtn.disabled = false;
                cancelBtn.disabled = false;
                statusBox.classList.remove('hidden');
                
                // Restore Progress
                progressBar.style.width = `${res.percent}%`;
                progressText.textContent = `${Math.round(res.percent)}%`;
                if (res.statusDetail && statusDetail) {
                    statusDetail.textContent = res.statusDetail;
                }
                
                // Restore Results Table
                if (res.results && res.results.length > 0) {
                    results = res.results;
                    linkCountSpan.textContent = results.length;
                    resultBox.classList.remove('hidden');
                    resultTableBody.innerHTML = '';
                    results.forEach(d => {
                        const tr = document.createElement('tr');
                        const targetOption = document.getElementById('collection-target')?.value || 'all';
                        
                        let html = `<td class="col-name">${d.name}</td>`;
                        if (targetOption === 'all') {
                            html += `<td class="col-addr">${d.address || '-'}</td>
                                   <td class="col-url">${d.homepage ? `<a href="${d.homepage}" target="_blank">${d.homepage}</a>` : '-'}</td>
                                   <td class="col-sns">${Array.isArray(d.sns) ? d.sns.join(', ') : (d.sns || '-')}</td>
                                   <td class="col-email">${d.emails || '-'}</td>
                                   <td class="col-phone">${d.phone || '-'}</td>`;
                        } else if (targetOption === 'address') html += `<td class="col-addr">${d.address || '-'}</td>`;
                        else if (targetOption === 'phone') html += `<td class="col-phone">${d.phone || '-'}</td>`;
                        else if (targetOption === 'email') html += `<td class="col-email">${d.emails || '-'}</td>`;
                        else if (targetOption === 'sns') html += `<td class="col-sns">${Array.isArray(d.sns) ? d.sns.join(', ') : (d.sns || '-')}</td>`;
                        
                        tr.innerHTML = html;
                        resultTableBody.appendChild(tr);
                    });
                }

                // Restore Logs
                if (res.logs && res.logs.length > 0) {
                    logContainer.innerHTML = '';
                    res.logs.forEach(log => {
                        const div = document.createElement('div');
                        div.className = 'log-item';
                        div.innerHTML = `<span class="log-time">[${log.time}]</span> <span class="log-msg">${log.message}</span>`;
                        logContainer.appendChild(div);
                    });
                    logContainer.scrollTop = logContainer.scrollHeight;
                }

                // [v17.0] Ensure user sees the progress view
                setTimeout(() => {
                    statusBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 300);
            }
            
            // [v17.7] Sync CAPTCHA/Hard Block state
            if (res.isPausedByCaptcha) {
                captchaModalOverlay.classList.remove('hidden');
            }
            if (res.isHardBlocked) {
                hardBlockModalOverlay.classList.remove('hidden');
            }
        });
    } catch (e) {
        console.error("Popup initialization error:", e);
    }

    // [v18.1] Robust UI Synchronization (State Polling ONLY)
    let statePollingInterval = null;

    function startSync() {
        // [v36.11] Optimized Status Polling (Every 4s)
        statePollingInterval = setInterval(() => {
            chrome.runtime.sendMessage({ action: 'GET_SEARCH_STATE' }, (res) => {
                if (chrome.runtime.lastError || !res) return;
                
                if (res.isSearching) {
                    startBtn.disabled = true;
                    cancelBtn.disabled = false;
                    pauseBtn.disabled = false;
                    
                    if (res.isPausedByCaptcha) {
                        statusBox.classList.remove('hidden');
                        captchaModalOverlay.classList.remove('hidden');
                    } else {
                        captchaModalOverlay.classList.add('hidden');
                    }
                    
                    if (res.isHardBlocked) {
                        hardBlockModalOverlay.classList.remove('hidden');
                    } else {
                        hardBlockModalOverlay.classList.add('hidden');
                    }
                    
                    // Sync Pause/Resume button
                    const lang = languageSelect.value;
                    const dict = (i18nData && i18nData[lang]) ? i18nData[lang] : (i18nData['en'] || {});
                    if (res.isPaused) {
                        pauseBtn.textContent = dict.btn_resume || '▶️ Resume';
                        pauseBtn.classList.add('premium');
                    } else {
                        pauseBtn.textContent = dict.btn_pause || '⏸️ Pause';
                        pauseBtn.classList.remove('premium');
                    }

                    // Update count display
                    const linkCountSpan = document.getElementById('link-count');
                    if (linkCountSpan) {
                        linkCountSpan.textContent = res.resultsCount || results.length;
                    }
                    updateRealTimeStatus(res.resultsCount || results.length);
                } else {
                    startBtn.disabled = false;
                    cancelBtn.disabled = true;
                    pauseBtn.disabled = true;
                }
                cancelBtn.disabled = false;
            });
        }, 4000);
    }
    
    // Start initial sync
    startSync();

    // [Integrated] applyTranslations function (UI + Engine Options)
    function applyTranslations(lang, region) {
        if (!i18nData) return;
        const dictionary = i18nData[lang] || i18nData['en'] || {};
        const fallback = i18nData['en'] || {};

        // 1. General UI Text (data-i18n)
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            el.textContent = dictionary[key] || fallback[key] || key;
        });

        // 2. Input Placeholder (data-i18n-placeholder)
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            const val = dictionary[key] || fallback[key];
            if (val) el.setAttribute('placeholder', val);
        });

        // 3. Dynamic Engine List Update
        const groups = [
            { key: 'group_main_engines', engines: ['google', 'bing', 'yahoojp'] },
            { key: 'group_map_engines', engines: ['google_maps', 'bing_maps', 'yahoo_maps'] }
        ];

        if (region === 'kr') {
            groups[0].engines = ['naver', 'google'];
            groups[1].engines = ['naver_place', 'google_maps'];
        } else if (region === 'jp') {
            groups[0].engines = ['yahoojp', 'google'];
            groups[1].engines = ['yahoo_maps', 'google_maps'];
        } else if (region === 'cn') {
            groups[0].engines = ['baidu', 'bing'];
            groups[1].engines = ['baidu_maps', 'bing_maps'];
        } else if (region === 'tw') {
            groups[0].engines = ['google', 'yahoo_tw'];
            groups[1].engines = ['google_maps', 'bing_maps'];
        } else {
            groups[0].engines = ['google', 'bing'];
            groups[1].engines = ['google_maps', 'bing_maps'];
        }
        
        // Ensure the groups array is stable

        engineListContainer.innerHTML = '';
        groups.forEach(group => {
            if (!group.engines || group.engines.length === 0) return;

            const label = document.createElement('span');
            label.className = 'optgroup-label';
            label.textContent = dictionary[group.key] || fallback[group.key] || group.key;
            engineListContainer.appendChild(label);

            group.engines.forEach(engineKey => {
                const item = document.createElement('label');
                item.className = 'option-item';
                const eKey = `engine_${engineKey}`;
                let text = dictionary[eKey] || fallback[eKey] || engineKey;
                
                // Fallback for new un-translated engines
                if (!dictionary[eKey] && !fallback[eKey]) {
                    if (engineKey === 'baidu') text = '🟡 Baidu';
                    if (engineKey === 'baidu_maps') text = '🟢 Baidu Maps';
                    if (engineKey === 'yahoo_tw') text = '🟣 Yahoo Taiwan';
                }

                // All defined engines for the region are selected by default as requested
                let isRecommended = true; 

                item.innerHTML = `
                    <input type="checkbox" class="engine-checkbox" value="${engineKey}" ${isRecommended ? 'checked' : ''}>
                    <span>${text}</span>
                `;
                engineListContainer.appendChild(item);
            });
        });

        updateHeaderStatus();
    }

    languageSelect.addEventListener('change', () => applyTranslations(languageSelect.value, regionSelect.value));
    regionSelect.addEventListener('change', () => applyTranslations(languageSelect.value, regionSelect.value));

    function updateHeaderStatus() {
        const lang = languageSelect ? languageSelect.value : 'en';
        const dict = (i18nData && i18nData[lang]) ? i18nData[lang] : (i18nData ? i18nData['en'] : {});
        const checked = document.querySelectorAll('.engine-checkbox:checked');
        const headerSpan = engineSelectHeader.querySelector('span');
        const total = document.querySelectorAll('.engine-checkbox').length;

        if (checked.length === 0) {
            headerSpan.textContent = dict.engine_all || '🌐 Select Engines';
        } else if (checked.length === total) {
            headerSpan.textContent = dict.label_select_all || '🌐 All Selected';
        } else {
            headerSpan.textContent = `🌐 ${checked.length} Engines`;
        }
    }

    engineSelectHeader.addEventListener('click', (e) => {
        e.stopPropagation();
        engineMultiSelect.classList.toggle('open');
        engineOptions.classList.toggle('hidden');
    });

    document.addEventListener('click', () => {
        engineMultiSelect.classList.remove('open');
        engineOptions.classList.add('hidden');
    });

    engineOptions.addEventListener('click', (e) => e.stopPropagation());

    document.getElementById('engine-confirm-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        engineMultiSelect.classList.remove('open');
        engineOptions.classList.add('hidden');
        updateHeaderStatus();
    });

    // [v4.9.44] CAPTCHA Wit.ai Token Quick Setup Click Event Bindings
    if (captchaWitSaveBtn) {
        captchaWitSaveBtn.addEventListener('click', () => {
            const val = captchaWitKeyInput ? captchaWitKeyInput.value.trim() : '';
            if (!val) {
                chrome.storage.local.get(['language'], (storage) => {
                    const lang = storage.language || 'en';
                    const dict = (i18nData && i18nData[lang]) ? i18nData[lang] : (i18nData ? i18nData['en'] : {});
                    alert(dict.wit_token_empty_alert || "Wit.ai Server Access Token을 입력해주세요.");
                });
                return;
            }

            captchaWitSaveBtn.innerText = '...';
            captchaWitSaveBtn.disabled = true;

            chrome.storage.local.set({ 
                witKey: val, 
                audioSttKey: val, 
                captchaSolveEnabled: true 
            }, () => {
                // Sync settings fields if they exist
                if (audioSttKeyInput) audioSttKeyInput.value = val;
                if (captchaSolveToggle) captchaSolveToggle.checked = true;
                if (captchaWitaiGroup) captchaWitaiGroup.style.display = 'block';

                chrome.storage.local.get(['language'], (storage) => {
                    const lang = storage.language || 'en';
                    const dict = (i18nData && i18nData[lang]) ? i18nData[lang] : (i18nData ? i18nData['en'] : {});
                    
                    // Show feedback success message
                    const ts = new Date().toLocaleTimeString();
                    const logInline = document.getElementById('captcha-log-inline');
                    if (logInline) {
                        logInline.innerHTML += `<div style="color:var(--success-color)">[${ts}] ${dict.wit_token_saved_msg || "✅ Token saved! Resuming CAPTCHA..."}</div>`;
                        logInline.scrollTop = logInline.scrollHeight;
                    }

                    // Hide quick input
                    if (captchaWitInputContainer) captchaWitInputContainer.style.display = 'none';

                    // Clean up and restore button state
                    captchaWitSaveBtn.innerText = dict.wit_token_save_btn || "저장";
                    captchaWitSaveBtn.disabled = false;
                });
            });
        });
    }

    // [v1.1.2] 두 개의 captcha-wit-link-btn 중 어느 것을 클릭해도 브릿지를 통해 시스템 기본 브라우저로 열리도록 처리
    document.querySelectorAll('#captcha-wit-link-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            window.postMessage({
                type: 'XPIDER_SEND',
                channel: 'open-wit-external-link',
                data: 'https://wit.ai/apps'
            }, '*');
        });
    });

    selectAllEngines.addEventListener('change', (e) => {
        const checked = e.target.checked;
        document.querySelectorAll('.engine-checkbox').forEach(cb => {
            cb.checked = checked;
        });
        updateHeaderStatus();
    });

    engineListContainer.addEventListener('change', (e) => {
        if (e.target.classList.contains('engine-checkbox')) {
            updateHeaderStatus();
            const allCbs = document.querySelectorAll('.engine-checkbox');
            const checkedCbs = document.querySelectorAll('.engine-checkbox:checked');
            selectAllEngines.checked = (allCbs.length === checkedCbs.length);
        }
    });

    // (Original initI18n block removed, merged into top)

    settingsToggle.addEventListener('click', () => {
        settingsOverlay.classList.remove('hidden');
    });

    settingsClose.addEventListener('click', () => {
        settingsOverlay.classList.add('hidden');
    });

    if (proxyEnableToggle) {
        proxyEnableToggle.addEventListener('change', () => {
            proxySettingsFields.classList.toggle('hidden', !proxyEnableToggle.checked);
        });
    }

    settingsOverlay.addEventListener('click', (e) => {
        if (e.target === settingsOverlay) settingsOverlay.classList.add('hidden');
    });

    // Tab Switch Logic
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => {
                if (c.id !== 'settings-overlay') c.classList.remove('active');
            });
            btn.classList.add('active');
            currentTab = btn.dataset.tab;
            let targetId = currentTab === 'url' ? 'url-tab' : `${currentTab}-tab`;
            document.getElementById(targetId).classList.add('active');
        });
    });

    // [Modified] Immediate translation preview and auto-save on change
    languageSelect.addEventListener('change', () => {
        chrome.storage.local.set({ language: languageSelect.value, region: regionSelect.value });
        applyTranslations(languageSelect.value, regionSelect.value);
    });
    regionSelect.addEventListener('change', () => {
        chrome.storage.local.set({ language: languageSelect.value, region: regionSelect.value });
        applyTranslations(languageSelect.value, regionSelect.value);
    });

    // [Modified] Save settings logic
    saveSettingsBtn.addEventListener('click', () => {
        const lang = languageSelect.value;
        const reg = regionSelect.value;
        const captchaEnabled = captchaSolveToggle.checked;
        // [v1.1.3] Wit.ai 전용 — 항상 'audio' 모드
        const audioSttKey = audioSttKeyInput ? audioSttKeyInput.value.trim() : '';
        const stealthEnabled = stealthModeToggle.checked;
        const vpnCheckEnabled = vpnCheckToggle.checked;
        const slowModeEnabled = slowModeToggle.checked;
        const autoClearEnabled = autoClearSessionToggle ? autoClearSessionToggle.checked : true;
        const stealthHeadersEnabled = stealthHeadersToggle ? stealthHeadersToggle.checked : true;

        const proxyEnabled = proxyEnableToggle.checked;
        const proxyHost = proxyHostInput.value.trim();
        const proxyPort = proxyPortInput.value.trim();
        const proxyUser = proxyUserInput.value.trim();
        const proxyPass = proxyPassInput.value.trim();

        chrome.storage.local.set({
            language: lang,
            region: reg,
            captchaSolveEnabled: captchaEnabled,
            captchaMethod: 'audio', // 항상 Wit.ai 음성 우회
            audioSttKey: audioSttKey,
            stealthModeEnabled: stealthEnabled,
            vpnCheckEnabled: vpnCheckEnabled,
            slowModeEnabled: slowModeEnabled,
            autoClearSessionEnabled: autoClearEnabled,
            stealthHeadersEnabled: stealthHeadersEnabled,
            proxyEnabled: proxyEnabled,
            proxyHost: proxyHost,
            proxyPort: proxyPort,
            proxyUser: proxyUser,
            proxyPass: proxyPass
        }, () => {
            // 메인 프로세스에 스텔스 상태 전달
            window.postMessage({
                type: 'XPIDER_SEND',
                channel: 'xpider-ext-update-stealth-settings',
                data: { stealthHeadersEnabled: stealthHeadersEnabled }
            }, '*');
            const msg = (i18nData && i18nData[lang]) ? i18nData[lang].msg_saved : 'Applied!';
            
            applyTranslations(lang, reg);

            // [v36.9] Notify background of proxy change immediately
            chrome.runtime.sendMessage({ action: 'APPLY_PROXY_SETTINGS' });

            const originalText = saveSettingsBtn.textContent;
            saveSettingsBtn.textContent = msg;
            saveSettingsBtn.classList.add('success');

            setTimeout(() => {
                saveSettingsBtn.textContent = originalText;
                saveSettingsBtn.classList.remove('success');
            }, 2500);
        });
    });

    // [v1.1.3] 캡차 토글 → Wit.ai 그룹만 표시/숨김
    if (captchaSolveToggle) {
        captchaSolveToggle.addEventListener('change', () => {
            const enabled = captchaSolveToggle.checked;
            if (captchaWitaiGroup) captchaWitaiGroup.style.display = enabled ? 'block' : 'none';
        });
    }

    const manualCaptchaBtn = document.getElementById('manual-captcha-btn');
    if (manualCaptchaBtn) {
        manualCaptchaBtn.addEventListener('click', () => {
            // background.js에 직접 수동 해결 신호 전송 (Service Worker 직접 통신)
            chrome.runtime.sendMessage({ action: 'MANUAL_CAPTCHA_RESOLVED' }, () => {
                if (chrome.runtime.lastError) console.warn('[CAPTCHA] Manual resume error:', chrome.runtime.lastError);
            });
            // main.js xpider-captcha-resume IPC도 동시 전송 (숨겨진 창 대기 해제)
            window.postMessage({ type: 'XPIDER_CAPTCHA_RESUME' }, '*');
            // 2단계 진행 중 UI 업데이트
            const stepLabel = document.getElementById('captcha-step-label');
            const waitText  = document.getElementById('captcha-wait-text');
            if (stepLabel) stepLabel.textContent = '2단계: 수동 해결 확인 중...';
            if (waitText)  waitText.textContent  = '⏳ 재개 신호 전송 중...';
            const s2 = document.getElementById('cstep-2');
            if (s2) s2.style.background = '#667eea';
        });
    }

    depthRange.addEventListener('input', (e) => {
        depthValue.textContent = e.target.value;
    });

    // [v36.9] Hard Block Recovery Choice Handlers
    if (btnWait30) {
        btnWait30.addEventListener('click', () => {
            chrome.runtime.sendMessage({ action: 'RESOLVE_HARD_BLOCK', choice: 'wait' }, () => {
                hardBlockModalOverlay.classList.add('hidden');
            });
        });
    }

    if (btnVpnResume) {
        btnVpnResume.addEventListener('click', () => {
            chrome.runtime.sendMessage({ action: 'RESOLVE_HARD_BLOCK', choice: 'vpn' }, () => {
                hardBlockModalOverlay.classList.add('hidden');
            });
        });
    }

    // [v36.9] Robust Search Range Slider Logic
    function updateRangeUI() {
        if (startPageRange && endPageRange && startPageValue && endPageValue) {
            let start = parseInt(startPageRange.value);
            let end = parseInt(endPageRange.value);
            
            // Ensure logical consistency
            if (start > end) {
                end = start;
                endPageRange.value = end;
            }
            
            startPageValue.textContent = start;
            endPageValue.textContent = end;
            console.log(`[v36.9] Range update: ${start} ~ ${end}`);
        }
    }

    if (startPageRange && endPageRange) {
        startPageRange.addEventListener('input', () => {
            let start = parseInt(startPageRange.value);
            let end = parseInt(endPageRange.value);
            if (start > end) {
                endPageRange.value = start;
            }
            updateRangeUI();
        });
        
        endPageRange.addEventListener('input', () => {
            let start = parseInt(startPageRange.value);
            let end = parseInt(endPageRange.value);
            if (end < start) {
                startPageRange.value = end;
            }
            updateRangeUI();
        });
    }

    function addLog(msg) {
        const div = document.createElement('div');
        div.textContent = `> ${msg}`;
        logContainer.appendChild(div);
        logContainer.scrollTop = logContainer.scrollHeight;
    }

    // [v67.0] Real-time Extraction Status Update Helper
    function updateRealTimeStatus(count) {
        const statsPrefix = document.getElementById('stats-prefix-span');
        const linkCount = document.getElementById('link-count');
        const statsSuffix = document.querySelector('[data-i18n="stats_suffix"]');
        
        const lang = languageSelect.value;
        const dict = (typeof I18N_DATA !== 'undefined' && I18N_DATA[lang]) ? I18N_DATA[lang] : (typeof I18N_DATA !== 'undefined' ? I18N_DATA['en'] : {});
        
        if (statsPrefix) {
            const finishedMsg = (dict.status_finished || 'Collection Status: {count} extracted');
            // We reuse the premium red style for the count part
            const countHtml = `<span class="stats-count-red" style="font-size: 3.5rem; color: #ff3366; text-shadow: 0 4px 15px rgba(255, 51, 102, 0.6);">${count}</span>`;
            statsPrefix.innerHTML = finishedMsg.replace('{count}', countHtml);
            statsPrefix.classList.add('stats-finished-text');
        }
        
        // Hide the separate components if they are visible
        if (linkCount) linkCount.style.display = 'none';
        if (statsSuffix) statsSuffix.style.display = 'none';
    }

    // Data Sanitization logic
    function sanitizeData(text) {
        const noNumbers = text.replace(/[0-9]/g, '');
        const sanitized = noNumbers.replace(/[^가-힣a-zA-Z\s]/g, ' ');
        const tokens = sanitized.split(/[\n\t,;]/);

        return [...new Set(tokens
            .map(t => t.replace(/\s+/g, ' ').trim())
            .filter(n => {
                const hasHangeul = /[가-힣]/.test(n);
                return hasHangeul ? n.length >= 2 : n.length >= 3;
            })
        )];
    }

    // Toggle Diagnostics Logs
    if (toggleDiagnosticsBtn) {
        toggleDiagnosticsBtn.addEventListener('click', () => {
            chrome.storage.local.get(['showDiagnostics'], (storage) => {
                const currentStatus = !storage.showDiagnostics;
                chrome.storage.local.set({ showDiagnostics: currentStatus }, () => {
                    toggleDiagnosticsBtn.classList.toggle('active', currentStatus);
                    if (captchaLogBox) {
                        captchaLogBox.classList.toggle('hidden', !currentStatus);
                        if (currentStatus && captchaLogContainer) {
                            captchaLogContainer.scrollTop = captchaLogContainer.scrollHeight;
                        }
                    }
                });
            });
        });
    }

    // Start Collection
    startBtn.addEventListener('click', () => {
        checkVpnAndStart(async () => {
            // ─── [Stealth] 수집 시작 시 세션(쿠키, 캐시, 스토리지) 자동 초기화 연동 ───
            const autoClear = autoClearSessionToggle ? autoClearSessionToggle.checked : true;
            if (autoClear) {
                addLog('🧹 [System] Clearing session data (cookies, caches, storage) to prevent Google detection...');
                window.postMessage({
                    type: 'XPIDER_SEND',
                    channel: 'xpider-ext-clear-session'
                }, '*');
                
                // 초기화 비동기 처리가 완료될 수 있도록 0.8초의 짧은 안전 대기 지연 적용
                await new Promise(r => setTimeout(r, 800));
                addLog('✅ [System] Initialization complete! Starting collection safely under high stealth.');
            }

            const lang = languageSelect.value;
            const reg = regionSelect.value;
            const dictionary = (i18nData && i18nData[lang]) ? i18nData[lang] : (i18nData ? i18nData['en'] : null);

            let content = '';
            if (currentTab === 'text') content = textInput.value;
            else if (currentTab === 'url') content = urlInput.value;
            else if (currentTab === 'search') content = keywordInput.value;

            if (!content.trim()) {
                return alert(dictionary ? dictionary.alert_empty : 'Please enter content.');
            }

            startBtn.disabled = true;
            pauseBtn.classList.remove('hidden');
            cancelBtn.classList.remove('hidden');
            cancelBtn.disabled = false;
            statusBox.classList.remove('hidden');
            resultBox.classList.add('hidden');
            logContainer.innerHTML = '';
            resultTableBody.innerHTML = '';
            progressBar.style.width = '0%';
            progressText.textContent = '0%';
            linkCountSpan.textContent = '0';
            results = [];

            addLog(dictionary ? dictionary.btn_start : 'Starting collection...');

            setTimeout(() => {
                statusBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 300);

            if (content.length === 0) {
                return alert(dictionary ? dictionary.alert_empty : 'Please enter content.');
            }

            results = [];
            resultTableBody.innerHTML = '';
            logContainer.innerHTML = ''; 
            progressBar.style.width = '0%';
            progressText.textContent = '0%';
            linkCountSpan.textContent = '0';
            resultBox.classList.add('hidden');

            // [v66.11] Reset stats area UI
            const statsPrefix = document.getElementById('stats-prefix-span');
            const linkCount = document.getElementById('link-count');
            const statsSuffix = document.querySelector('[data-i18n="stats_suffix"]');
            const dict = (typeof I18N_DATA !== 'undefined' && I18N_DATA[lang]) ? I18N_DATA[lang] : (typeof I18N_DATA !== 'undefined' ? I18N_DATA['en'] : (dictionary || {}));

            // [v67.0] Initialize with 'Collection Status: 0 extracted' format immediately
            updateRealTimeStatus(0);

            startBtn.disabled = true;
            pauseBtn.disabled = false;
            cancelBtn.disabled = false;
            statusBox.classList.remove('hidden'); 
            
            try {
                const time = new Date().toLocaleTimeString();
                const startLog = `[${time}] [System] Starting Search... (Waiting for background)`;
                const logEl = document.createElement('div');
                logEl.className = 'log-entry';
                logEl.textContent = startLog;
                logContainer.appendChild(logEl);
                logContainer.scrollTop = logContainer.scrollHeight;

                const collectionTarget = document.getElementById('collection-target');
                const targetOption = collectionTarget ? collectionTarget.value : 'all';
                
                // [v21.0] Fixed potential TypeError if selectedIndex is -1
                let targetText = 'All';
                if (collectionTarget && collectionTarget.selectedIndex >= 0) {
                    targetText = collectionTarget.options[collectionTarget.selectedIndex].text;
                }
                
                const cleanTargetText = targetText.replace(/^[\u0000-\u1F9FF\u2600-\u26FF\s]+/, '');
                document.body.className = "target-mode-" + targetOption;
                
                const targetNameSpan = document.getElementById('current-target-name');
                if (targetNameSpan) {
                    targetNameSpan.textContent = cleanTargetText;
                }
                
                chrome.storage.local.set({ savedTargetOption: targetOption, savedTargetText: cleanTargetText });
                
                if (currentTab === 'text') {
                    console.log('[v21.0][Popup] Dispatching startSearch...');
                    chrome.runtime.sendMessage({
                        action: 'startSearch',
                        text: content,
                        collectEmails: true,
                        targetOption: targetOption,
                        language: lang,
                        region: reg
                    }, (response) => {
                        if (chrome.runtime.lastError) console.error('[v21.0][Popup] startSearch error:', chrome.runtime.lastError);
                        else console.log('[v21.0][Popup] startSearch response:', response);
                    });
                } else if (currentTab === 'url') {
                    if (!content.startsWith('http')) {
                        throw new Error(dictionary ? 'Invalid URL' : 'Invalid URL');
                    }
                    console.log('[v21.0][Popup] Dispatching startCrawl...');
                    chrome.runtime.sendMessage({
                        action: 'startCrawl',
                        url: content,
                        depth: parseInt(depthRange.value),
                        collectEmails: true,
                        targetOption: targetOption,
                        language: lang,
                        region: reg
                    }, (response) => {
                        if (chrome.runtime.lastError) console.error('[v21.0][Popup] startCrawl error:', chrome.runtime.lastError);
                        else console.log('[v21.0][Popup] startCrawl response:', response);
                    });
                }
                else if (currentTab === 'search') {
                    const checkedEngines = [...document.querySelectorAll('.engine-checkbox:checked')].map(cb => cb.value);
                    if (checkedEngines.length === 0) {
                        startBtn.disabled = false;
                        statusBox.classList.add('hidden'); 
                        return alert(dictionary ? dictionary.alert_empty : 'Please select at least one engine.');
                    }
                    console.log('[v21.0][Popup] Dispatching startEngineSearch...');
                    chrome.runtime.sendMessage({
                        action: 'startEngineSearch',
                        engines: checkedEngines, 
                        keyword: content,
                        startPage: parseInt(startPageRange.value),
                        maxPages: parseInt(endPageRange.value),
                        depth: parseInt(depthRange.value),
                        collectEmails: true,
                        mapAuto: false,
                        targetOption: targetOption,
                        language: lang,
                        region: reg
                    }, (response) => {
                        if (chrome.runtime.lastError) console.error('[v21.0][Popup] startEngineSearch error:', chrome.runtime.lastError);
                        else console.log('[v21.0][Popup] startEngineSearch response:', response);
                    });
                }
            } catch (err) {
                startBtn.disabled = false;
            }
        });
    });

    // [v18.6] Optimized Pause/Resume Toggle for immediate feedback
    pauseBtn.addEventListener('click', () => {
        const isCurrentlyPaused = pauseBtn.textContent.includes('Resume') || pauseBtn.classList.contains('premium');
        
        if (isCurrentlyPaused) {
            chrome.runtime.sendMessage({ action: 'RESUME_SEARCH' });
            pauseBtn.textContent = '⏸️ Pause';
            pauseBtn.classList.remove('premium');
        } else {
            chrome.runtime.sendMessage({ action: 'PAUSE_SEARCH' });
            pauseBtn.textContent = '▶️ Resume';
            pauseBtn.classList.add('premium');
        }
    });

    cancelBtn.addEventListener('click', () => {
        const lang = languageSelect.value;
        const dict = (typeof I18N_DATA !== 'undefined' && I18N_DATA[lang]) ? I18N_DATA[lang] : (typeof I18N_DATA !== 'undefined' ? I18N_DATA['en'] : {});
        
        chrome.runtime.sendMessage({ action: 'cancelSearch' });
        cancelBtn.disabled = false; // Always enabled
        startBtn.disabled = false;

        // [v66.11] Update stats area for immediate feedback
        const statsPrefix = document.getElementById('stats-prefix-span');
        const linkCount = document.getElementById('link-count');
        const statsSuffix = document.querySelector('[data-i18n="stats_suffix"]');
        if (statsPrefix) statsPrefix.textContent = dict.status_stopping || 'Stopping...';
        if (linkCount) linkCount.style.display = 'none';
        if (statsSuffix) statsSuffix.style.display = 'none';

        // [v67.0] Immediate feedback on cancel (Remove 60s delay)
        setTimeout(() => {
            if (statsPrefix) {
                updateRealTimeStatus(results.length);
            }
            if (statusDetail) {
                const logMsg = dict.log_cancelled || 'Collection stopped by user.';
                statusDetail.textContent = logMsg;
                statusDetail.style.color = 'var(--success-color)';
                statusDetail.style.fontWeight = '700';
            }
            if (results.length > 0) {
                progressBar.style.width = '100%';
                progressText.textContent = `${results.length} items`;
                setTimeout(() => {
                    resultBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 100);
            } else {
                addLog('Stopped. No items collected.');
            }
        }, 500); // 0.5s instead of 60s
    });

    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.action === 'log') {
            addLog(msg.message);
        } else if (msg.action === 'progress') {
            progressBar.style.width = `${msg.percent}%`;
            progressText.textContent = `${Math.round(msg.percent)}%`;
            if (msg.count !== undefined) updateRealTimeStatus(msg.count);
        } else if (msg.action === 'statusDetail') {
            if (statusDetail) {
                statusDetail.textContent = msg.message;
            }
        } else if (msg.action === 'result') {
            results.push(msg.data);
            updateRealTimeStatus(results.length);
            const d = msg.data;
            const tr = document.createElement('tr');
            const targetOption = document.getElementById('collection-target')?.value || 'all';
            
            let html = `<td class="col-name">${d.name}</td>`;
            if (targetOption === 'all') {
                html += `<td class="col-addr">${d.address || '-'}</td>
                       <td class="col-url">${d.homepage ? `<a href="${d.homepage}" target="_blank">${d.homepage}</a>` : '-'}</td>
                       <td class="col-sns">${Array.isArray(d.sns) ? d.sns.join(', ') : (d.sns || '-')}</td>
                       <td class="col-email">${d.emails || '-'}</td>
                       <td class="col-phone">${d.phone || '-'}</td>`;
            } else if (targetOption === 'address') html += `<td class="col-addr">${d.address || '-'}</td>`;
            else if (targetOption === 'phone') html += `<td class="col-phone">${d.phone || '-'}</td>`;
            else if (targetOption === 'email') html += `<td class="col-email">${d.emails || '-'}</td>`;
            else if (targetOption === 'sns') html += `<td class="col-sns">${Array.isArray(d.sns) ? d.sns.join(', ') : (d.sns || '-')}</td>`;
            
            tr.innerHTML = html;
            resultTableBody.appendChild(tr);

            // [v66.13] Show result box and scroll if first item
            if (results.length === 1) {
                resultBox.classList.remove('hidden');
                setTimeout(() => {
                    resultBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 100);
            }
        } else if (msg.action === 'complete') {
            // [v18.0] Don't immediately hide cancel button.
            // Verify with background that search truly ended before switching buttons.
            chrome.runtime.sendMessage({ action: 'GET_SEARCH_STATE' }, (verifyRes) => {
                if (chrome.runtime.lastError) {
                    // Can't reach background - don't touch buttons
                    console.log('[v18.0] complete: Cannot verify state, ignoring.');
                    return;
                }
                
                // Only switch buttons if background confirms search is done
                if (!verifyRes || !verifyRes.isSearching) {
                    const lang = languageSelect.value;
                    const dict = (typeof I18N_DATA !== 'undefined' && I18N_DATA[lang]) ? I18N_DATA[lang] : (typeof I18N_DATA !== 'undefined' ? I18N_DATA['en'] : {});
                    const logMsg = dict.log_finished_overall || dict.log_complete || 'Collection process completely finished.';
                    
                    addLog(logMsg);
                    
                    // [v67.0] Immediate feedback on complete (Remove 60s delay)
                    setTimeout(() => {
                        updateRealTimeStatus(results.length);
                    }, 500);

                    if (statusDetail) {
                        statusDetail.textContent = logMsg;
                        statusDetail.style.color = 'var(--success-color)';
                        statusDetail.style.fontWeight = '700';
                    }
                    
                    startBtn.disabled = false;
                    pauseBtn.disabled = true;
                    cancelBtn.disabled = true;
                    resultBox.classList.remove('hidden');
                    progressBar.style.width = '100%';
                    progressText.textContent = '100%';

                    // [v66.13] Scroll to results for visibility
                    setTimeout(() => {
                        resultBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }, 100);
                } else {
                    console.log('[v18.0] complete received but background still searching. Ignoring.');
                }
            });
        } else if (msg.action === 'CAPTCHA_STATUS') {
            const overlay     = document.getElementById('captcha-modal-overlay');
            const icon        = document.getElementById('captcha-modal-icon');
            const title       = document.getElementById('captcha-modal-title');
            const stepLabel   = document.getElementById('captcha-step-label');
            const statusMsg   = document.getElementById('captcha-status-msg');
            const tabInd      = document.getElementById('captcha-tab-indicator');
            const tabUrl      = document.getElementById('captcha-tab-url');
            const spinner     = document.getElementById('captcha-spinner-row');
            const waitText    = document.getElementById('captcha-wait-text');
            const failMsg     = document.getElementById('captcha-fail-msg');
            const logInline   = document.getElementById('captcha-log-inline');
            const s1 = document.getElementById('cstep-1');
            const s2 = document.getElementById('cstep-2');
            const s3 = document.getElementById('cstep-3');

            if (msg.status === 'detected') {
                // Check if Wit.ai key is configured before showing the CAPTCHA modal
                chrome.storage.local.get(['audioSttKey', 'witKey', 'captchaSolveEnabled'], (keys) => {
                    const hasKey = (keys.audioSttKey && keys.audioSttKey.trim() !== '') || (keys.witKey && keys.witKey.trim() !== '');
                    
                    // Show CAPTCHA modal in all cases
                    overlay.classList.remove('hidden');
                    icon.textContent  = '⚠️';
                    title.textContent = 'CAPTCHA Detected!';
                    stepLabel.textContent = 'Step 1: New Tab Opened';
                    statusMsg.innerHTML = `🌐 Google has blocked automated requests.<br>
                        A <strong>new tab</strong> has opened in your browser. Please solve the CAPTCHA there.`;

                    // Handle Wit.ai quick setup form visibility
                    if (captchaWitInputContainer) {
                        if (!hasKey) {
                            captchaWitInputContainer.style.display = 'block';
                            if (captchaWitKeyInput) {
                                captchaWitKeyInput.value = '';
                                captchaWitKeyInput.focus();
                            }
                        } else {
                            captchaWitInputContainer.style.display = 'none';
                        }
                    }
                    if (failMsg) failMsg.style.display = 'none';
                    if (spinner) spinner.style.display = 'flex';
                    if (waitText) waitText.textContent = '🆕 Waiting for CAPTCHA resolution in new tab... (auto-detect)';
                    if (s1) { s1.style.background = '#667eea'; }
                    if (s2) { s2.style.background = '#e0e0e0'; }
                    if (s3) { s3.style.background = '#e0e0e0'; }
                    if (msg.captchaUrl) {
                        if (tabUrl) tabUrl.textContent = '🔗 ' + msg.captchaUrl.substring(0, 60) + (msg.captchaUrl.length > 60 ? '...' : '');
                        if (tabInd) tabInd.style.display = msg.tabOpened ? 'flex' : 'none';
                    }
                    if (logInline) {
                        const ts = new Date().toLocaleTimeString();
                        logInline.innerHTML += `<div>[${ts}] ⚠️ CAPTCHA Detected → New Tab Opened</div>`;
                        logInline.scrollTop = logInline.scrollHeight;
                    }
                });
            } else if (msg.status === 'resolved') {
                // ── Step 3: Resolved ──
                icon.textContent  = '✅';
                title.textContent = 'CAPTCHA Solved!';
                stepLabel.textContent = msg.auto ? 'Auto-detected & Solved' : 'Manually Solved';
                statusMsg.innerHTML = `✅ CAPTCHA has been solved.<br>Collection will automatically resume...`;
                if (spinner) spinner.style.display = 'none';
                if (s1) s1.style.background = '#34c759';
                if (s2) s2.style.background = '#34c759';
                if (s3) s3.style.background = '#34c759';
                if (logInline) {
                    const ts = new Date().toLocaleTimeString();
                    logInline.innerHTML += `<div>[${ts}] ✅ Solved (${msg.auto ? 'Auto' : 'Manual'}) → Resuming</div>`;
                    logInline.scrollTop = logInline.scrollHeight;
                }

                // ── [핵심] background.js에 isPausedByCaptcha 해제 신호 전송 ──
                // popup.js만이 IPC(main.js)와 background.js(Service Worker) 사이의 브릿지 역할을 함
                // broadcastExtMessage(CAPTCHA_RESUME_ALL)은 Service Worker에 미도달
                // → popup.js가 chrome.runtime.sendMessage로 직접 background.js에 전달
                chrome.runtime.sendMessage({ action: 'MANUAL_CAPTCHA_RESOLVED' }, () => {
                    if (chrome.runtime.lastError) {
                        console.warn('[CAPTCHA] resume signal error:', chrome.runtime.lastError.message);
                    }
                });

                // 1.5초 후 모달 자동 닫기
                setTimeout(() => { overlay.classList.add('hidden'); }, 1500);
            } else if (msg.status === 'bypassed') {
                // ── [v3.3] 9-minute Auto Bypass ──
                icon.textContent  = '⚡';
                title.textContent = 'CAPTCHA Auto-Bypassed!';
                stepLabel.textContent = '9 min elapsed — auto bypass, resuming collection';
                if (statusMsg) statusMsg.innerHTML = '⚡ 9-minute wait complete, auto-bypass activated.<br>Collection is resuming...';
                if (spinner) spinner.style.display = 'none';
                if (s1) s1.style.background = '#ff9500';
                if (s2) s2.style.background = '#ff9500';
                if (s3) s3.style.background = '#ff9500';
                if (logInline) {
                    const ts = new Date().toLocaleTimeString();
                    logInline.innerHTML += `<div>[${ts}] ⚡ 9-min Bypass → Resuming</div>`;
                    logInline.scrollTop = logInline.scrollHeight;
                }
                chrome.runtime.sendMessage({ action: 'MANUAL_CAPTCHA_RESOLVED' }, () => {
                    if (chrome.runtime.lastError) console.warn('[CAPTCHA] bypass resume:', chrome.runtime.lastError.message);
                });
                setTimeout(() => { overlay.classList.add('hidden'); }, 2000);
            } else if (msg.status === 'timeout') {
                // ── Timeout (backward compat) ──
                icon.textContent  = '⏱️';
                title.textContent = 'Timed Out';
                stepLabel.textContent = '9 min elapsed — auto bypass';
                if (spinner) spinner.style.display = 'none';
                if (failMsg) failMsg.style.display = 'block';
                if (s1) s1.style.background = '#ff3b30';
                if (s2) s2.style.background = '#ff3b30';
                if (s3) s3.style.background = '#e0e0e0';
                if (logInline) {
                    const ts = new Date().toLocaleTimeString();
                    logInline.innerHTML += `<div>[${ts}] ⏱️ 9-min Timeout → Bypass</div>`;
                }
                chrome.runtime.sendMessage({ action: 'MANUAL_CAPTCHA_RESOLVED' }, () => {});
                setTimeout(() => { overlay.classList.add('hidden'); }, 3000);
            } else {
                // 기타: 숨기기
                overlay.classList.add('hidden');
            }
        } else if (msg.action === 'CAPTCHA_LOG_UPDATE') {
            updateCaptchaLogs(msg.logs);
        }
    });

    function updateCaptchaLogs(logs) {
        if (!captchaLogContainer) return;
        chrome.storage.local.get(['showDiagnostics'], (storage) => {
            const showDiag = !!storage.showDiagnostics;
            if (captchaLogBox) {
                captchaLogBox.classList.toggle('hidden', !showDiag || logs.length === 0);
            }
            captchaLogContainer.innerHTML = logs.map(line => `<div>${line}</div>`).join('');
            if (showDiag) {
                captchaLogContainer.scrollTop = captchaLogContainer.scrollHeight;
            }
        });
    }

    function downloadFile(content, filename, type) {
        // [v3.3 Fix] chrome.downloads.download → ext-preload.js 브릿지 → xpider-download-file IPC
        // popup 환경에는 xpiderInvoke가 없으므로 chrome.downloads.download를 통해 데이터URL로 전달
        try {
            const blob = new Blob([content], { type });
            const reader = new FileReader();
            reader.onloadend = () => {
                const dataUrl = reader.result; // data:text/csv;base64,...
                if (window.chrome && window.chrome.downloads && typeof window.chrome.downloads.download === 'function') {
                    window.chrome.downloads.download({
                        url: dataUrl,
                        filename: filename,
                        saveAs: true
                    }, (id) => {
                        if (!id) {
                            // 폴백: 기존 방식
                            const url = URL.createObjectURL(blob);
                            const link = document.createElement('a');
                            link.href = url; link.download = filename;
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                        }
                    });
                } else {
                    // 폴백: 기존 a.click() 방식
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url; link.download = filename;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                }
            };
            reader.readAsDataURL(blob);
        } catch(e) {
            // 최종 폴백
            const blob2 = new Blob([content], { type });
            const url = URL.createObjectURL(blob2);
            const link = document.createElement('a');
            link.href = url; link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }

    function getLabels() {
        const lang = languageSelect.value;
        const dict = (i18nData && i18nData[lang]) ? i18nData[lang] : (i18nData['en'] || {});
        return {
            name: dict.col_name || 'Name',
            address: dict.col_address || 'Address',
            homepage: dict.col_url || 'Website',
            sns: dict.col_sns || 'Social Media',
            email: dict.col_email || 'Email',
            phone: dict.col_phone || 'Phone',
            title: dict.result_title || 'Results',
            unit: dict.stats_suffix ? dict.stats_suffix.trim() : 'items'
        };
    }

    downloadCsv.addEventListener('click', () => {
        if (results.length === 0) return;
        const lb = getLabels();
        const targetOption = document.getElementById('collection-target')?.value || 'all';
        
        let csvContent = `\ufeff`;
        let headers = [lb.name];
        
        if (targetOption === 'all') headers.push(lb.address, lb.homepage, lb.sns, lb.email, lb.phone);
        else if (targetOption === 'address') headers.push(lb.address);
        else if (targetOption === 'phone') headers.push(lb.phone);
        else if (targetOption === 'email') headers.push(lb.email);
        else if (targetOption === 'sns') headers.push(lb.sns);
        
        csvContent += headers.join(',') + '\n';
        
        results.forEach(r => {
            let row = [`"${r.name}"`];
            if (targetOption === 'all') row.push(`"${r.address || ''}"`, `"${r.homepage || ''}"`, `"${r.sns || ''}"`, `"${r.emails || ''}"`, `"${r.phone || ''}"`);
            else if (targetOption === 'address') row.push(`"${r.address || ''}"`);
            else if (targetOption === 'phone') row.push(`"${r.phone || ''}"`);
            else if (targetOption === 'email') row.push(`"${r.emails || ''}"`);
            else if (targetOption === 'sns') row.push(`"${r.sns || ''}"`);
            csvContent += row.join(',') + '\n';
        });
        
        const modeLabel = targetOption !== 'all' ? `_${targetOption}` : '';
        downloadFile(csvContent, `collected${modeLabel}_${new Date().getTime()}.csv`, 'text/csv;charset=utf-8;');
    });

    downloadTxt.addEventListener('click', () => {
        if (results.length === 0) return;
        const lb = getLabels();
        const targetOption = document.getElementById('collection-target')?.value || 'all';
        let txtContent = `=== ${lb.title} (${results.length} ${lb.unit}) ===\n`;
        if (targetOption !== 'all') txtContent += `[Target: ${targetOption.toUpperCase()}]\n`;
        txtContent += `\n`;
        
        results.forEach((r, i) => {
            txtContent += `${i + 1}. ${r.name}\n`;
            if (targetOption === 'all' || targetOption === 'address') txtContent += `   ${lb.address}: ${r.address || '-'}\n`;
            if (targetOption === 'all') txtContent += `   ${lb.homepage}: ${r.homepage || '-'}\n`;
            if (targetOption === 'all' || targetOption === 'sns') txtContent += `   ${lb.sns}: ${r.sns || '-'}\n`;
            if (targetOption === 'all' || targetOption === 'email') txtContent += `   ${lb.email}: ${r.emails || '-'}\n`;
            if (targetOption === 'all' || targetOption === 'phone') txtContent += `   ${lb.phone}: ${r.phone || '-'}\n`;
            txtContent += `\n`;
        });
        
        const modeLabel = targetOption !== 'all' ? `_${targetOption}` : '';
        downloadFile(txtContent, `collected${modeLabel}_${new Date().getTime()}.txt`, 'text/plain;charset=utf-8;');
    });

    downloadGs.addEventListener('click', () => {
        if (results.length === 0) return;
        const lb = getLabels();
        const targetOption = document.getElementById('collection-target')?.value || 'all';
        
        let tsvContent = ``;
        let headers = [lb.name];
        
        if (targetOption === 'all') headers.push(lb.address, lb.homepage, lb.sns, lb.email, lb.phone);
        else if (targetOption === 'address') headers.push(lb.address);
        else if (targetOption === 'phone') headers.push(lb.phone);
        else if (targetOption === 'email') headers.push(lb.email);
        else if (targetOption === 'sns') headers.push(lb.sns);
        
        tsvContent += headers.join('\t') + '\n';
        
        results.forEach(r => {
            let row = [r.name];
            if (targetOption === 'all') row.push(r.address || '', r.homepage || '', r.sns || '', r.emails || '', r.phone || '');
            else if (targetOption === 'address') row.push(r.address || '');
            else if (targetOption === 'phone') row.push(r.phone || '');
            else if (targetOption === 'email') row.push(r.emails || '');
            else if (targetOption === 'sns') row.push(r.sns || '');
            tsvContent += row.join('\t') + '\n';
        });
        
        const modeLabel = targetOption !== 'all' ? `_${targetOption}` : '';
        downloadFile(tsvContent, `for_google_sheets${modeLabel}_${new Date().getTime()}.tsv`, 'text/tab-separated-values;charset=utf-8;');
    });
});

// [v1.1.2] XPIDER 페이지 스캔 릴레이
// background.js Service Worker는 window가 없어 IPC 직접 호출 불가.
// popup.js(extensionWebview)에서 chrome.runtime.onMessage로 받아 ext-preload.js를 통해 IPC를 중계합니다.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === 'XPIDER_SCAN_REQUEST') {
        const { url, waitMs, showTab, reqId } = msg;
        const handler = (event) => {
            if (event.data && event.data.type === 'XPIDER_SCAN_PAGE_RESULT' && event.data.id === reqId) {
                window.removeEventListener('message', handler);
                sendResponse(event.data.result || null);
            }
        };
        window.addEventListener('message', handler);
        // ext-preload.js 브리지를 통해 메인 프로세스에 스캔 요청
        window.postMessage({ type: 'XPIDER_SCAN_PAGE', url, waitMs, showTab, id: reqId }, '*');
        return true; // 비동기 응답을 위해 포트 유지
    }
});

// [v1.1.2] 컨텍트 페이지 링크 추출 릴레이
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === 'XPIDER_CONTACT_LINKS_REQUEST') {
        const { url, waitMs, showTab, reqId } = msg;
        const handler = (event) => {
            if (event.data && event.data.type === 'XPIDER_CONTACT_RESULT' && event.data.id === reqId) {
                window.removeEventListener('message', handler);
                sendResponse(event.data.result || null);
            }
        };
        window.addEventListener('message', handler);
        window.postMessage({ type: 'XPIDER_CONTACT_PAGE', url, waitMs, showTab, id: reqId }, '*');
        return true;
    }
});

// [v1.1.2] 홈페이지 정보+컨텍트링크 통합 스캔 릴레이 (탭 1회 방문)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === 'XPIDER_SCAN_FULL_REQUEST') {
        const { url, waitMs, showTab, reqId } = msg;
        const handler = (event) => {
            if (event.data && event.data.type === 'XPIDER_SCAN_FULL_RESULT' && event.data.id === reqId) {
                window.removeEventListener('message', handler);
                sendResponse(event.data.result || null);
            }
        };
        window.addEventListener('message', handler);
        window.postMessage({ type: 'XPIDER_SCAN_FULL', url, waitMs, showTab, id: reqId }, '*');
        return true;
    }
});

// [v2.2] URL 탭 스크롤+페이지네이션 크롤러 릴레이
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === 'XPIDER_CRAWL_SCROLL_REQUEST') {
        const { url, scrollSteps, scrollWaitMs, pageWaitMs, reqId } = msg;
        const handler = (event) => {
            if (event.data && event.data.type === 'XPIDER_CRAWL_SCROLL_RESULT' && event.data.id === reqId) {
                window.removeEventListener('message', handler);
                sendResponse(event.data.result || { allText: '', nextPageUrl: null });
            }
        };
        window.addEventListener('message', handler);
        window.postMessage({ type: 'XPIDER_CRAWL_SCROLL', url, scrollSteps, scrollWaitMs, pageWaitMs, id: reqId }, '*');
        return true; // 비동기 응답 유지
    }
});


// --- [v3.2] CAPTCHA 해결 즉시 모달 닫기 ---
// broadcastExtMessage는 두 경로로 popup.js에 도달:
//  경로A) ipcRenderer.on -> chrome.runtime.onMessage (843줄)
//  경로B) ipcRenderer.on -> postMessage XPIDER_EVENT name:'runtime-on-message' (이 리스너)
function _closeCaptchaModal(auto) {
    const overlay = document.getElementById('captcha-modal-overlay');
    if (!overlay || overlay.classList.contains('hidden')) return;
    const icon = document.getElementById('captcha-modal-icon');
    const title = document.getElementById('captcha-modal-title');
    const stepLabel = document.getElementById('captcha-step-label');
    const statusMsg = document.getElementById('captcha-status-msg');
    const spinner = document.getElementById('captcha-spinner-row');
    const s1 = document.getElementById('cstep-1');
    const s2 = document.getElementById('cstep-2');
    const s3 = document.getElementById('cstep-3');
    const logInline = document.getElementById('captcha-log-inline');
    if (icon) icon.textContent = '✅';
    if (title) title.textContent = 'CAPTCHA Solved!';
    if (stepLabel) stepLabel.textContent = auto ? 'Auto-detected & Solved' : 'Manually Solved';
    if (statusMsg) statusMsg.innerHTML = '✅ CAPTCHA has been solved.<br>Collection will automatically resume...';
    if (spinner) spinner.style.display = 'none';
    if (s1) s1.style.background = '#34c759';
    if (s2) s2.style.background = '#34c759';
    if (s3) s3.style.background = '#34c759';
    if (logInline) {
        const ts = new Date().toLocaleTimeString();
        logInline.innerHTML += '<div>[' + ts + '] ✅ Solved (' + (auto ? 'Auto' : 'Manual') + ') → Resuming</div>';
        logInline.scrollTop = logInline.scrollHeight;
    }
    chrome.runtime.sendMessage({ action: 'MANUAL_CAPTCHA_RESOLVED' }, () => {
        if (chrome.runtime.lastError) console.warn('[CAPTCHA] resume signal:', chrome.runtime.lastError.message);
    });
    setTimeout(() => { overlay.classList.add('hidden'); }, 1500);
}

// postMessage 경로 B
window.addEventListener('message', (event) => {
    if (!event.data) return;
    if (event.data.type === 'XPIDER_EVENT' && event.data.name === 'runtime-on-message') {
        const msg = event.data.data;
        if (!msg) return;
        if (msg.action === 'CAPTCHA_STATUS' && msg.status === 'resolved') {
            console.log('[CAPTCHA-POPUP] postMessage 경로 resolved -> 모달 닫기');
            _closeCaptchaModal(!!msg.auto);
        }
        if (msg.action === 'CAPTCHA_RESUME_ALL' || msg.action === 'MANUAL_CAPTCHA_RESOLVED') {
            const overlay = document.getElementById('captcha-modal-overlay');
            if (overlay && !overlay.classList.contains('hidden')) {
                console.log('[CAPTCHA-POPUP] RESUME 신호 -> 모달 강제 닫기');
                _closeCaptchaModal(true);
            }
        }
    }
});

// --- [v3.3] CAPTCHA 강제 닫기 직접 채널 + 전용 폴링 ---
// 경로C) main.js -> executeJavaScript -> extensionWebview.send('xpider-captcha-force-close')
//         -> ext-preload ipcRenderer.on -> postMessage(XPIDER_CAPTCHA_FORCE_CLOSE) -> 여기서 수신
window.addEventListener('message', (event) => {
    if (!event.data) return;
    if (event.data.type === 'XPIDER_CAPTCHA_FORCE_CLOSE') {
        console.log('[CAPTCHA-POPUP] v3.3 FORCE_CLOSE 수신 -> 모달 즉시 닫기');
        _closeCaptchaModal(true);
    }
});

// --- [v3.3] 모달 전용 폴링: 모달이 보이는 동안 2초마다 background.js 직접 확인 ---
// broadcastExtMessage가 모두 유실돼도 이 폴링이 최후 안전망 역할
// isPausedByCaptcha=false가 되면 -> 모달 닫기 + MANUAL_CAPTCHA_RESOLVED 전송
(function startCaptchaModalWatcher() {
    let _captchaWatchInterval = null;

    function _startCaptchaWatch() {
        if (_captchaWatchInterval) return; // 이미 실행 중
        _captchaWatchInterval = setInterval(() => {
            const overlay = document.getElementById('captcha-modal-overlay');
            if (!overlay || overlay.classList.contains('hidden')) {
                // 모달이 닫혔으면 폴링 중단
                clearInterval(_captchaWatchInterval);
                _captchaWatchInterval = null;
                return;
            }
            // 모달이 열려있으면 background.js에 직접 상태 확인
            chrome.runtime.sendMessage({ action: 'GET_SEARCH_STATE' }, (res) => {
                if (chrome.runtime.lastError || !res) return;
                if (!res.isPausedByCaptcha) {
                    console.log('[CAPTCHA-POPUP] 폴링: isPausedByCaptcha=false 감지 -> 모달 닫기');
                    clearInterval(_captchaWatchInterval);
                    _captchaWatchInterval = null;
                    _closeCaptchaModal(true);
                }
            });
        }, 2000);
    }

    // captcha-modal-overlay가 표시될 때마다 폴링 시작
    // MutationObserver로 hidden 클래스 변화를 감시
    const _waitOverlay = setInterval(() => {
        const overlay = document.getElementById('captcha-modal-overlay');
        if (!overlay) return;
        clearInterval(_waitOverlay);

        const observer = new MutationObserver(() => {
            if (!overlay.classList.contains('hidden')) {
                // 모달이 열렸다 -> 폴링 시작
                console.log('[CAPTCHA-POPUP] 모달 열림 감지 -> 전용 폴링 시작');
                _startCaptchaWatch();
            } else {
                // 모달이 닫혔다 -> 폴링 중단
                if (_captchaWatchInterval) {
                    clearInterval(_captchaWatchInterval);
                    _captchaWatchInterval = null;
                }
            }
        });
        observer.observe(overlay, { attributes: true, attributeFilter: ['class'] });
    }, 500);
})();

// --- [XPIDER] Browser Language-Change Broadcast Listener ---
// When the XPIDER browser language setting changes, this extension updates instantly.
window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'XPIDER_EVENT' && event.data.name === 'language-change') {
        const lang = event.data.data && event.data.data.lang;
        if (lang) {
            const langSel = document.getElementById('language-select');
            if (langSel) langSel.value = lang;
            const regSel = document.getElementById('region-select');
            const reg = regSel ? regSel.value : 'us';
            chrome.storage.local.set({ language: lang });
            if (typeof applyTranslations === 'function') {
                applyTranslations(lang, reg);
            }
        }
    }
});

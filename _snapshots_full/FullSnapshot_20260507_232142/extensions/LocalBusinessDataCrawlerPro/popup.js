// [Extension Popup Script] v1.0.0 Pro

document.addEventListener('DOMContentLoaded', () => {
    // [v18.1] STRICT Persistent Port Connection to detect popup closure instantly
    chrome.runtime.connect({ name: 'popup-ctrl' });

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
    const captchaMethodSelect = document.getElementById('captcha-method-select');
    const captchaApiKeyInput = document.getElementById('captcha-api-key');

    // [v36.9] Hard Block Recovery UI
    const hardBlockModalOverlay = document.getElementById('hard-block-modal-overlay');
    const btnWait30 = document.getElementById('btn-wait-30');
    const btnVpnResume = document.getElementById('btn-vpn-resume');
    const captchaMethodGroup = document.getElementById('captcha-method-group');
    const captchaApiGroup = document.getElementById('captcha-api-group');
    const stealthModeToggle = document.getElementById('stealth-mode-toggle');
    const apiLinkTip = document.getElementById('api-link-tip');
    const audioSttGroup = document.getElementById('audio-stt-group');
    const audioSttKeyInput = document.getElementById('audio-stt-key');

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

        chrome.storage.local.get(['language', 'region', 'captchaSolveEnabled', 'captchaMethod', 'captchaApiKey', 'stealthModeEnabled', 'audioSttKey', 'proxyEnabled', 'proxyHost', 'proxyPort', 'proxyUser', 'proxyPass'], (storage) => {
            const lang = storage.language || 'en';
            const reg = storage.region || 'us';
            
            if (languageSelect) languageSelect.value = lang;
            if (regionSelect) regionSelect.value = reg;

            if (captchaSolveToggle) {
                captchaSolveToggle.checked = !!storage.captchaSolveEnabled;
                captchaMethodGroup.style.display = storage.captchaSolveEnabled ? 'block' : 'none';
            }
            if (captchaMethodSelect) {
                captchaMethodSelect.value = storage.captchaMethod || 'audio';
                const method = storage.captchaMethod || 'audio';
                const isApi = (method === 'api' || method === 'nopecha');
                const isAudio = (method === 'audio');
                captchaApiGroup.style.display = (storage.captchaSolveEnabled && isApi) ? 'block' : 'none';
                audioSttGroup.style.display = (storage.captchaSolveEnabled && isAudio) ? 'block' : 'none';
                
                if (apiLinkTip) {
                    if (storage.captchaMethod === 'nopecha') {
                        apiLinkTip.innerHTML = '<a href="https://nopecha.com/" target="_blank">NopeCHA API Key 받기</a>';
                    } else {
                        apiLinkTip.innerHTML = '<a href="https://2captcha.com?from=18329628" target="_blank">2Captcha Key 받기</a>';
                    }
                }
            }
            if (captchaApiKeyInput) captchaApiKeyInput.value = storage.captchaApiKey || '';
            if (audioSttKeyInput) audioSttKeyInput.value = storage.audioSttKey || '';
            if (stealthModeToggle) stealthModeToggle.checked = !!storage.stealthModeEnabled;
            if (vpnCheckToggle) vpnCheckToggle.checked = !!storage.vpnCheckEnabled;
            if (slowModeToggle) slowModeToggle.checked = !!storage.slowModeEnabled;

            if (proxyEnableToggle) {
                proxyEnableToggle.checked = !!storage.proxyEnabled;
                proxySettingsFields.classList.toggle('hidden', !storage.proxyEnabled);
            }
            if (proxyHostInput) proxyHostInput.value = storage.proxyHost || '';
            if (proxyPortInput) proxyPortInput.value = storage.proxyPort || '';
            if (proxyUserInput) proxyUserInput.value = storage.proxyUser || '';
            if (proxyPassInput) proxyPassInput.value = storage.proxyPass || '';
            
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
        chrome.runtime.sendMessage({ action: 'GET_SEARCH_STATE' }, (res) => {
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
            
            // [v17.7] Only show CAPTCHA modal if BOTH searching is true AND it's actually paused
                    if (res.isPausedByCaptcha) {
                        captchaModalOverlay.classList.remove('hidden');
                        
                        // [v1.0.0 Pro] Specific UI for Secondary Quiz Waiting
                        if (res.isSecondaryQuizWaiting) {
                            const titleEl = document.querySelector('[data-i18n="captcha_popup_title"]');
                            const msgEl = document.querySelector('[data-i18n="captcha_popup_msg"]');
                            const promoBox = document.getElementById('secondary-quiz-info');
                            
                            const lang = languageSelect.value;
                            const dict = (i18nData && i18nData[lang]) ? i18nData[lang] : (i18nData['en'] || {});
                            
                            if (titleEl) titleEl.textContent = (dict.captcha_secondary_quiz_title || '2차 CAPTCHA Detected') + ` (${res.secondaryCountdown}s)`;
                            if (msgEl) msgEl.textContent = (dict.captcha_secondary_quiz_msg || 'Pausing for safety...').replace('{seconds}', res.secondaryCountdown);
                            if (promoBox) promoBox.classList.remove('hidden');
                        } else {
                            // [v1.0.0 Pro] Restore standard CAPTCHA messages for Audio Solver / Normal Block
                            const titleEl = document.querySelector('[data-i18n="captcha_popup_title"]');
                            const msgEl = document.querySelector('[data-i18n="captcha_popup_msg"]');
                            const promoBox = document.getElementById('secondary-quiz-info');
                            
                            const lang = languageSelect.value;
                            const dict = (i18nData && i18nData[lang]) ? i18nData[lang] : (i18nData['en'] || {});

                            if (titleEl) titleEl.textContent = dict.captcha_popup_title || 'CAPTCHA Detected';
                            if (msgEl) msgEl.textContent = dict.captcha_popup_msg || 'Google has blocked automated collection...';
                            if (promoBox) promoBox.classList.add('hidden');
                        }
                    } else {
                        captchaModalOverlay.classList.add('hidden');
                    }

                    // [v36.9] Hard Block Modal Sync
                    if (res.isHardBlocked) {
                        hardBlockModalOverlay.classList.remove('hidden');
                    } else {
                        hardBlockModalOverlay.classList.add('hidden');
                    }
        });
    } catch (e) {
        console.error("Popup initialization error:", e);
    }

    // [v18.1] Robust UI Synchronization (State Polling ONLY)
    let statePollingInterval = null;

    function startSync() {
        // [v17.9] Active State Polling (Every 2s)
        // Ensures the STOP button remains visible as long as background is actually searching
        statePollingInterval = setInterval(() => {
            chrome.runtime.sendMessage({ action: 'GET_SEARCH_STATE' }, (res) => {
                if (chrome.runtime.lastError || !res) return;
                
                if (res.isSearching) {
                    // Always visible buttons, just update disabled state
                    startBtn.disabled = true;
                    cancelBtn.disabled = false;
                    pauseBtn.disabled = false;
                    
                    // [v36.9] Critical Fix: Ensure buttons stay visible even when returning from CAPTCHA
                    if (res.isPausedByCaptcha) {
                        statusBox.classList.remove('hidden');
                    }
                    
                    // [v18.5] Update Pause/Resume button text
                    const lang = languageSelect.value;
                    const dict = (i18nData && i18nData[lang]) ? i18nData[lang] : (i18nData['en'] || {});
                    if (res.isPaused) {
                        pauseBtn.textContent = dict.btn_resume || '▶️ Resume';
                        pauseBtn.classList.add('premium'); // Optional: change style when paused
                    } else {
                        pauseBtn.textContent = dict.btn_pause || '⏸️ Pause';
                        pauseBtn.classList.remove('premium');
                    }
                    
                    // Sync CAPTCHA Modal
                    if (res.isPausedByCaptcha) {
                        captchaModalOverlay.classList.remove('hidden');
                        
                        // [v1.0.0 Pro] Specific UI for Secondary Quiz Waiting
                        if (res.isSecondaryQuizWaiting) {
                            const titleEl = document.querySelector('[data-i18n="captcha_popup_title"]');
                            const msgEl = document.querySelector('[data-i18n="captcha_popup_msg"]');
                            const promoBox = document.getElementById('secondary-quiz-info');
                            
                            const lang = languageSelect.value;
                            const dict = (i18nData && i18nData[lang]) ? i18nData[lang] : (i18nData['en'] || {});
                            
                            if (titleEl) titleEl.textContent = (dict.captcha_secondary_quiz_title || '2차 CAPTCHA Detected') + ` (${res.secondaryCountdown}s)`;
                            if (msgEl) msgEl.textContent = (dict.captcha_secondary_quiz_msg || 'Pausing for safety...').replace('{seconds}', res.secondaryCountdown);
                            if (promoBox) promoBox.classList.remove('hidden');
                        } else {
                            // [v1.0.0 Pro] Restore standard CAPTCHA messages for Audio Solver / Normal Block
                            const titleEl = document.querySelector('[data-i18n="captcha_popup_title"]');
                            const msgEl = document.querySelector('[data-i18n="captcha_popup_msg"]');
                            const promoBox = document.getElementById('secondary-quiz-info');
                            
                            const lang = languageSelect.value;
                            const dict = (i18nData && i18nData[lang]) ? i18nData[lang] : (i18nData['en'] || {});

                            if (titleEl) titleEl.textContent = dict.captcha_popup_title || 'CAPTCHA Detected';
                            if (msgEl) msgEl.textContent = dict.captcha_popup_msg || 'Google has blocked automated collection...';
                            if (promoBox) promoBox.classList.add('hidden');
                        }
                    } else {
                        captchaModalOverlay.classList.add('hidden');
                    }

                    // [v36.9] Hard Block Modal Sync
                    if (res.isHardBlocked) {
                        hardBlockModalOverlay.classList.remove('hidden');
                    } else {
                        hardBlockModalOverlay.classList.add('hidden');
                    }
                } else {
                    // Sync buttons if background is IDLE
                    startBtn.disabled = false;
                    cancelBtn.disabled = true;
                    pauseBtn.disabled = true;
                }
                // ALWAYS keep cancelBtn enabled as requested
                cancelBtn.disabled = false;

                // [v66.12] Continuous Dynamic Extraction Result Update
                // Even when completely finished, fetch the latest count from background
                if (res.results && res.results.length > results.length) {
                    const newItems = res.results.slice(results.length);
                    newItems.forEach(d => {
                        results.push(d);
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

                    // Update count display
                    const linkCountSpan = document.getElementById('link-count');
                    if (linkCountSpan) {
                        linkCountSpan.textContent = results.length;
                    }
                    // [v67.0] Always update real-time status in polling
                    updateRealTimeStatus(results.length);
                }
            });
        }, 2000);
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
        const captchaMethod = captchaMethodSelect.value;
        const captchaApiKey = captchaApiKeyInput.value;
        const audioSttKey = audioSttKeyInput.value;
        const stealthEnabled = stealthModeToggle.checked;
        const vpnCheckEnabled = vpnCheckToggle.checked;
        const slowModeEnabled = slowModeToggle.checked;

        const proxyEnabled = proxyEnableToggle.checked;
        const proxyHost = proxyHostInput.value.trim();
        const proxyPort = proxyPortInput.value.trim();
        const proxyUser = proxyUserInput.value.trim();
        const proxyPass = proxyPassInput.value.trim();

        chrome.storage.local.set({
            language: lang,
            region: reg,
            captchaSolveEnabled: captchaEnabled,
            captchaMethod: captchaMethod,
            captchaApiKey: captchaApiKey,
            audioSttKey: audioSttKey,
            stealthModeEnabled: stealthEnabled,
            vpnCheckEnabled: vpnCheckEnabled,
            slowModeEnabled: slowModeEnabled,
            proxyEnabled: proxyEnabled,
            proxyHost: proxyHost,
            proxyPort: proxyPort,
            proxyUser: proxyUser,
            proxyPass: proxyPass
        }, () => {
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

    if (captchaSolveToggle) {
        captchaSolveToggle.addEventListener('change', () => {
            const enabled = captchaSolveToggle.checked;
            captchaMethodGroup.style.display = enabled ? 'block' : 'none';
            if (enabled && captchaMethodSelect.value === 'api') {
                captchaApiGroup.style.display = 'block';
            } else {
                captchaApiGroup.style.display = 'none';
            }
        });
    }

    if (captchaMethodSelect) {
        captchaMethodSelect.addEventListener('change', () => {
            const method = captchaMethodSelect.value;
            captchaApiGroup.style.display = (method === 'api' || method === 'nopecha') ? 'block' : 'none';
            audioSttGroup.style.display = (method === 'audio') ? 'block' : 'none';
            if (apiLinkTip) {
                if (method === 'nopecha') {
                    apiLinkTip.innerHTML = '<a href="https://nopecha.com/" target="_blank">NopeCHA API Key 받기</a>';
                } else {
                    apiLinkTip.innerHTML = '<a href="https://2captcha.com?from=18329628" target="_blank">2Captcha Key 받기</a>';
                }
            }
        });
    }

    const manualCaptchaBtn = document.getElementById('manual-captcha-btn');
    if (manualCaptchaBtn) {
        manualCaptchaBtn.addEventListener('click', () => {
            chrome.runtime.sendMessage({ action: 'MANUAL_CAPTCHA_RESOLVED' }, () => {
                captchaModalOverlay.classList.add('hidden');
            });
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

    // Start Collection
    startBtn.addEventListener('click', async () => {
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
            if (msg.status === 'detected') {
                if (typeof captchaModalOverlay !== 'undefined') captchaModalOverlay.classList.remove('hidden');
            } else {
                if (typeof captchaModalOverlay !== 'undefined') captchaModalOverlay.classList.add('hidden');
            }
        } else if (msg.action === 'CAPTCHA_LOG_UPDATE') {
            updateCaptchaLogs(msg.logs);
        }
    });

    function updateCaptchaLogs(logs) {
        if (!captchaLogContainer) return;
        if (logs.length > 0 && captchaLogBox) captchaLogBox.classList.remove('hidden');
        captchaLogContainer.innerHTML = logs.map(line => `<div>${line}</div>`).join('');
        captchaLogContainer.scrollTop = captchaLogContainer.scrollHeight;
    }

    function downloadFile(content, filename, type) {
        const blob = new Blob([content], { type: type });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
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

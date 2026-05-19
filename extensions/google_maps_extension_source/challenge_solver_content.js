(function() {
    console.log("🤖 [ChallengeSolver v18.0 RESILIENT-HUD] Loaded:", window.location.href);

    /**
     * V18.0 — PORT-RESILIENT SOLVER & EXPLICIT ERROR REPORTING
     * 
     * [주요 개선 사안]
     * 1. 연결 단절 감지: 배경 스크립트(SW)와의 통신이 끊어질 경우 "SW Disconnect"로 명시적 보고.
     * 2. 에러 범주화: 인식 결과가 비어 있거나 시간이 초과된 경우 "Unknown" 대신 정확한 사유 표시.
     * 3. MV3 최적화: 비동기 데이터 전달 과정에서의 데이터 유실 방지.
     */

    let hud = null;
    let solving = false;
    const MAX_ATTEMPTS = 10;
    let waitCycles = 0;
    let lastLogMessage = "";
    let lastCheckboxClickTime = 0;
    let lastAttemptTime = 0; // [v26.0] Auto-reset timer
    let ocrAttemptCount = 0; // [v18.3] OCR retry counter

    function ensureHUD() {
        if (hud || !document.body) return;
        hud = document.createElement('div');
        hud.id = 'solver-hud';
        Object.assign(hud.style, {
            position: 'fixed', top: '0', left: '0', width: '100%',
            backgroundColor: 'rgba(0, 0, 0, 0.95)', color: '#ffcc00',
            fontSize: '11px', padding: '5px 10px', zIndex: '999999',
            fontFamily: 'monospace', borderBottom: '1px solid #ffcc00',
            boxSizing: 'border-box', pointerEvents: 'none',
            display: 'flex', justifyContent: 'space-between'
        });
        document.body.appendChild(hud);
    }

    function logToSystem(msg, status = null) {
        if (msg === lastLogMessage) return;
        lastLogMessage = msg;

        ensureHUD();
        hud.innerHTML = `<span>🤖 X PIDER Solver</span><span id="hud-status" style="color: ${status === 'FAIL' ? '#ff3333' : '#ffcc00'}">${status || msg}</span>`;
        
        chrome.runtime.sendMessage({ action: 'CAPTCHA_LOG', message: "[V36.9] " + msg }).catch(() => {});
        console.log("🤖 [v36.9 HUD]", msg);
    }

    function isGoogleSorryPage() {
        const hostname = window.location.hostname;
        const pathname = window.location.pathname;
        
        const isGoogle = hostname.includes('google.');
        const isSorryPath = pathname.includes('/sorry/');
        
        const hasCaptchaForm = document.getElementById('captcha-form') || document.querySelector('form[action*="sorry"]');
        const hasCaptchaInput = document.querySelector('input[name="captcha"]');
        
        const pageText = document.body.innerText;
        const hasTargetText = /To continue, please type the characters below/i.test(pageText) || 
                             /계속하려면 아래에 표시된 문자를 입력하세요/i.test(pageText) ||
                             /Our systems have detected unusual traffic/i.test(pageText) ||
                             /시스템이 네트워크의 비정상적인 트래픽을 감지했습니다/i.test(pageText);

        return (isGoogle && (isSorryPath || hasCaptchaForm || hasCaptchaInput || hasTargetText));
    }

    function isSolvableTextCaptcha() {
        const captchaImg = document.body.querySelector('img[src*="captcha"], img[src*="sorry/image"]');
        const textInput = document.body.querySelector('input[name="captcha"], input[name="q"]');
        const pageText = document.body.innerText;
        const hasTargetText = /To continue, please type the characters below/i.test(pageText) || 
                             /계속하려면 아래에 표시된 문자를 입력하세요/i.test(pageText);
        return (captchaImg && textInput) || hasTargetText;
    }

    function checkAndInjectHardBlockModal() {
        if (document.getElementById('xpider-hard-block-modal')) return true; // Already injected

        const pageText = document.body.innerText;
        const isHardBlockText = pageText.includes('자동화된 쿼리를 보내고 있을 수 있습니다') ||
                                pageText.includes('컴퓨터 또는 네트워크에서 자동화된 쿼리를 보내고 있을 수 있습니다') ||
                                pageText.includes('비정상적인 트래픽을 감지') ||
                                pageText.includes('자동화된 쿼리') ||
                                pageText.includes('automated queries') ||
                                pageText.includes('unusual traffic');

        // Verify there is no actual solvable captcha
        const hasCaptchaInput = document.querySelector('img[src*="captcha"], iframe[src*="recaptcha"]');

        if (isHardBlockText && !hasCaptchaInput) {
            logToSystem("🚫 [Critical] Google Hard Block detected", "BLOCKED");

            const overlay = document.createElement('div');
            overlay.id = 'xpider-hard-block-modal';
            Object.assign(overlay.style, {
                position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
                backgroundColor: 'rgba(0, 0, 0, 0.85)', zIndex: '9999999',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'sans-serif'
            });

            const modal = document.createElement('div');
            Object.assign(modal.style, {
                backgroundColor: '#fff', borderTop: '5px solid #ff3333',
                borderRadius: '12px', padding: '25px', width: '95%', maxWidth: '520px',
                maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box',
                boxShadow: '0 10px 30px rgba(0,0,0,0.5)', textAlign: 'center'
            });

            const title = document.createElement('h2');
            title.innerHTML = '🚨 Automated Query Blocked (Hard Block)';
            title.style.color = '#333';
            title.style.fontSize = '14px';
            title.style.margin = '0 0 12px 0';
            
            const desc = document.createElement('p');
            desc.innerHTML = 'Your computer or network may be sending automated queries. To protect users, access from your current IP has been temporarily denied.<br><br>Please select an option below to continue.';
            desc.style.color = '#666';
            desc.style.fontSize = '11px';
            desc.style.lineHeight = '1.6';
            desc.style.marginBottom = '20px';

            const btnXpiderVpn = document.createElement('button');
            btnXpiderVpn.innerHTML = '🛡️ Use XPIDER VPN to Bypass (Recommended)';
            Object.assign(btnXpiderVpn.style, {
                display: 'block', width: '100%', padding: '12px', marginBottom: '8px',
                backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px',
                fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', transition: '0.2s',
                boxShadow: '0 4px 12px rgba(59,130,246,0.3)'
            });

            const btnWait = document.createElement('button');
            btnWait.innerHTML = '⏳ Pause Scraping for 25 Minutes & Auto-Resume';
            Object.assign(btnWait.style, {
                display: 'block', width: '100%', padding: '10px', marginBottom: '8px',
                backgroundColor: '#ff3366', color: '#fff', border: 'none', borderRadius: '8px',
                fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', transition: '0.2s'
            });

            const btnVpn = document.createElement('button');
            btnVpn.innerHTML = '🔌 Use Custom Proxy (Apply Settings)';
            Object.assign(btnVpn.style, {
                display: 'block', width: '100%', padding: '10px', marginBottom: '8px',
                backgroundColor: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', borderRadius: '8px',
                fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', transition: '0.2s'
            });
            
            const btnForceQuit = document.createElement('button');
            btnForceQuit.innerHTML = '⏹️ Force Quit (Stop Current Search)';
            Object.assign(btnForceQuit.style, {
                display: 'block', width: '100%', padding: '10px',
                backgroundColor: '#333', color: '#fff', border: 'none', borderRadius: '8px',
                fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', transition: '0.2s'
            });

            const proxyContainer = document.createElement('div');
            Object.assign(proxyContainer.style, {
                display: 'none', marginTop: '15px', padding: '15px', backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0', borderRadius: '8px', textAlign: 'left'
            });
            
            proxyContainer.innerHTML = `
                <div style="margin-bottom: 8px;">
                    <label style="font-size: 12px; font-weight: bold; color: #475569; display: block; margin-bottom: 4px;">IP Host</label>
                    <input type="text" id="xpider-proxy-ip" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px; box-sizing: border-box;" placeholder="1.2.3.4">
                </div>
                <div style="margin-bottom: 8px;">
                    <label style="font-size: 12px; font-weight: bold; color: #475569; display: block; margin-bottom: 4px;">Port</label>
                    <input type="text" id="xpider-proxy-port" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px; box-sizing: border-box;" placeholder="8080">
                </div>
                <div style="display: flex; gap: 10px; margin-bottom: 12px;">
                    <div style="flex: 1;">
                        <label style="font-size: 12px; font-weight: bold; color: #475569; display: block; margin-bottom: 4px;">Username (Optional)</label>
                        <input type="text" id="xpider-proxy-user" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px; box-sizing: border-box;">
                    </div>
                    <div style="flex: 1;">
                        <label style="font-size: 12px; font-weight: bold; color: #475569; display: block; margin-bottom: 4px;">Password (Optional)</label>
                        <input type="password" id="xpider-proxy-pass" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px; box-sizing: border-box;">
                    </div>
                </div>
                <button id="xpider-proxy-apply" style="width: 100%; padding: 10px; background-color: #3b82f6; color: white; border: none; border-radius: 4px; font-weight: bold; cursor: pointer;">Apply Proxy & Resume</button>
            `;

            const countdownText = document.createElement('div');
            Object.assign(countdownText.style, {
                marginTop: '20px', fontWeight: 'bold', color: '#ff3366',
                fontSize: '28px', display: 'none', letterSpacing: '2px'
            });

            btnWait.addEventListener('click', () => {
                btnWait.style.display = 'none';
                btnXpiderVpn.style.display = 'none';
                btnVpn.style.display = 'none';
                btnForceQuit.style.display = 'none';
                proxyContainer.style.display = 'none';
                desc.innerHTML = 'A 25-minute timer has started. Keep this browser open, and the task will automatically resume when finished.';
                countdownText.style.display = 'block';
                
                chrome.runtime.sendMessage({ action: 'RESOLVE_HARD_BLOCK', choice: 'wait' });

                let timeLeft = 25 * 60; // 25 mins
                countdownText.innerHTML = `⏳ 25:00`;
                setInterval(() => {
                    timeLeft--;
                    if (timeLeft <= 0) {
                        countdownText.innerHTML = `✅ Timer Complete! (Resuming)`;
                        setTimeout(() => window.close(), 3000); 
                    } else {
                        const m = Math.floor(timeLeft / 60);
                        const s = timeLeft % 60;
                        countdownText.innerHTML = `⏳ ${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
                    }
                }, 1000);
            });

            btnVpn.addEventListener('click', () => {
                proxyContainer.style.display = proxyContainer.style.display === 'none' ? 'block' : 'none';
                
                // Load existing proxy settings if they click it
                chrome.storage.local.get(['proxyHost', 'proxyPort'], (res) => {
                    if (res.proxyHost) document.getElementById('xpider-proxy-ip').value = res.proxyHost;
                    if (res.proxyPort) document.getElementById('xpider-proxy-port').value = res.proxyPort;
                });
            });
            
            btnXpiderVpn.addEventListener('click', () => {
                chrome.runtime.sendMessage({ action: 'OPEN_XPIDER_VPN' });
            });

            btnForceQuit.addEventListener('click', () => {
                chrome.runtime.sendMessage({ action: 'cancelSearch' });
                btnForceQuit.innerText = 'Closing...';
                setTimeout(() => window.close(), 1000);
            });

            modal.appendChild(title);
            modal.appendChild(desc);
            modal.appendChild(btnXpiderVpn);
            modal.appendChild(btnWait);
            modal.appendChild(btnVpn);
            modal.appendChild(btnForceQuit);
            modal.appendChild(proxyContainer);
            modal.appendChild(countdownText);
            
            // Attach event listener for the inline proxy apply button
            setTimeout(() => {
                const applyBtn = document.getElementById('xpider-proxy-apply');
                if (applyBtn) {
                    applyBtn.addEventListener('click', () => {
                        const host = document.getElementById('xpider-proxy-ip').value.trim();
                        const port = document.getElementById('xpider-proxy-port').value.trim();
                        if (!host || !port) return alert("Please enter both IP and Port.");
                        
                        applyBtn.innerText = 'Applying Proxy & Resuming...';
                        applyBtn.style.backgroundColor = '#22c55e';
                        
                        chrome.storage.local.set({
                            proxyEnabled: true,
                            proxyHost: host,
                            proxyPort: port
                        }, () => {
                            chrome.runtime.sendMessage({ action: 'RESOLVE_HARD_BLOCK', choice: 'vpn' });
                            setTimeout(() => window.close(), 1500);
                        });
                    });
                }
            }, 100);

            overlay.appendChild(modal);
            document.body.appendChild(overlay);
            
            return true;
        }
        return false;
    }

    function injectSecondaryWaitModal() {
        if (document.getElementById('xpider-secondary-wait-modal')) return;

        chrome.storage.local.get(['language'], (res) => {
            const lang = res.language || 'ko';
            const dict = (typeof I18N_DATA !== 'undefined' && I18N_DATA[lang]) ? I18N_DATA[lang] : (typeof I18N_DATA !== 'undefined' ? I18N_DATA['en'] : {});

            const overlay = document.createElement('div');
            overlay.id = 'xpider-secondary-wait-modal';
            Object.assign(overlay.style, {
                position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
                backgroundColor: 'rgba(0, 0, 0, 0.85)', zIndex: '9999999',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'sans-serif'
            });

            const modal = document.createElement('div');
            Object.assign(modal.style, {
                backgroundColor: '#fff', borderTop: '5px solid #ffcc00',
                borderRadius: '12px', padding: '25px', width: '95%', maxWidth: '520px',
                maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box',
                boxShadow: '0 10px 30px rgba(0,0,0,0.5)', textAlign: 'center'
            });

            const title = document.createElement('h2');
            title.innerHTML = dict.secondary_wait_title || '🛡️ 보안 대기 모드 (5분)';
            title.style.color = '#333';
            title.style.fontSize = '16px';
            title.style.margin = '0 0 12px 0';

            const desc = document.createElement('p');
            desc.innerHTML = dict.secondary_wait_msg || "구글 검색 시 'To continue...' 문구가 감지되었습니다. 아이피 보호 및 하드 차단 방지를 위해 5분간 휴식 후 작업을 재개합니다.";
            desc.style.color = '#666';
            desc.style.fontSize = '12px';
            desc.style.lineHeight = '1.6';
            desc.style.marginBottom = '20px';

            const btnWait = document.createElement('button');
            btnWait.innerHTML = `⏳ ${dict.btn_wait_5 || '5분 기다리기 (이후 자동 재개)'}`;
            Object.assign(btnWait.style, {
                display: 'block', width: '100%', padding: '12px', marginBottom: '10px',
                backgroundColor: '#ffcc00', color: '#333', border: 'none', borderRadius: '8px',
                fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', transition: '0.2s'
            });

            const btnPaid = document.createElement('button');
            btnPaid.innerHTML = `🚀 ${dict.btn_paid_api || '유료 API 등록 (대기 없이 즉시 우회)'}`;
            Object.assign(btnPaid.style, {
                display: 'block', width: '100%', padding: '12px',
                backgroundColor: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', borderRadius: '8px',
                fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', transition: '0.2s'
            });

            const countdownText = document.createElement('div');
            Object.assign(countdownText.style, {
                marginTop: '20px', fontWeight: 'bold', color: '#ff3366',
                fontSize: '32px', display: 'none', letterSpacing: '2px'
            });

            btnWait.addEventListener('click', () => {
                btnWait.style.display = 'none';
                btnPaid.style.display = 'none';
                desc.innerHTML = (lang === 'ko') ? '5분 대기가 시작되었습니다. 시간이 종료되면 탭이 닫히고 수집이 자동으로 재개됩니다.' : '5-minute wait started. Tab will close automatically when finished.';
                countdownText.style.display = 'block';

                chrome.runtime.sendMessage({ action: 'TRIGGER_SECONDARY_WAIT', seconds: 300 });

                let timeLeft = 300;
                countdownText.innerHTML = `⏳ 05:00`;
                const timer = setInterval(() => {
                    timeLeft--;
                    if (timeLeft <= 0) {
                        clearInterval(timer);
                        countdownText.innerHTML = (lang === 'ko') ? `✅ 대기 완료!` : `✅ Ready!`;
                        setTimeout(() => window.close(), 1500);
                    } else {
                        const m = Math.floor(timeLeft / 60);
                        const s = timeLeft % 60;
                        countdownText.innerHTML = `⏳ ${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
                    }
                }, 1000);
            });

            btnPaid.addEventListener('click', () => {
                window.open('https://2captcha.com?from=18329628', '_blank');
            });

            modal.appendChild(title);
            modal.appendChild(desc);
            modal.appendChild(btnWait);
            modal.appendChild(btnPaid);
            modal.appendChild(countdownText);

            overlay.appendChild(modal);
            document.body.appendChild(overlay);
        });
    }

    function injectWitKeyMissingModal() {
        if (document.getElementById('xpider-wit-modal')) return true;

        logToSystem("⚠️ Wit.ai API Key missing", "WAIT");

        const overlay = document.createElement('div');
        overlay.id = 'xpider-wit-modal';
        Object.assign(overlay.style, {
            position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
            backgroundColor: 'rgba(0, 0, 0, 0.85)', zIndex: '9999999',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'sans-serif'
        });

        const modal = document.createElement('div');
        Object.assign(modal.style, {
            backgroundColor: '#fff', borderTop: '5px solid #3b82f6',
            borderRadius: '12px', padding: '25px', width: '95%', maxWidth: '480px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)', textAlign: 'center'
        });

        const title = document.createElement('h2');
        title.innerHTML = '🤖 Auto CAPTCHA Solver';
        title.style.color = '#333';
        title.style.fontSize = '18px';
        title.style.margin = '0 0 8px 0';
        
        const subtitle = document.createElement('div');
        subtitle.innerHTML = '🎙️ Wit.ai API Key (Free CAPTCHA Audio Bypass)';
        subtitle.style.color = '#3b82f6';
        subtitle.style.fontSize = '14px';
        subtitle.style.fontWeight = 'bold';
        subtitle.style.marginBottom = '20px';

        const desc = document.createElement('p');
        desc.innerHTML = '🆓 Register a free key to automatically recognize CAPTCHA audio.<br>Create an app at the link below and copy the Server Access Token.';
        desc.style.color = '#666';
        desc.style.fontSize = '12px';
        desc.style.lineHeight = '1.6';
        desc.style.marginBottom = '20px';

        const inputContainer = document.createElement('div');
        inputContainer.style.marginBottom = '20px';
        
        const input = document.createElement('input');
        input.type = 'password';
        input.placeholder = 'Enter Wit.ai Server Access Token';
        Object.assign(input.style, {
            width: '100%', padding: '12px', border: '1px solid #cbd5e1', 
            borderRadius: '8px', boxSizing: 'border-box', fontSize: '13px',
            textAlign: 'center'
        });
        
        const btnSave = document.createElement('button');
        btnSave.innerHTML = 'Save & Continue';
        Object.assign(btnSave.style, {
            display: 'block', width: '100%', padding: '12px', marginTop: '10px',
            backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px',
            fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', transition: '0.2s'
        });

        const btnLink = document.createElement('button');
        btnLink.innerHTML = '🔑 Get Free Wit.ai API Key →';
        Object.assign(btnLink.style, {
            display: 'block', width: '100%', padding: '12px', marginTop: '8px',
            backgroundColor: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', borderRadius: '8px',
            fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', transition: '0.2s'
        });

        btnLink.addEventListener('click', () => {
            window.open('https://wit.ai/apps', '_blank');
        });

        btnSave.addEventListener('click', () => {
            const val = input.value.trim();
            if (!val) return alert("Please enter the Server Access Token.");
            btnSave.innerText = 'Saving...';
            chrome.storage.local.set({ witKey: val }, () => {
                overlay.remove();
                logToSystem("✅ API Key Saved. Retrying...", "DONE");
            });
        });

        inputContainer.appendChild(input);
        inputContainer.appendChild(btnSave);
        
        modal.appendChild(title);
        modal.appendChild(subtitle);
        modal.appendChild(desc);
        modal.appendChild(inputContainer);
        modal.appendChild(btnLink);

        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        
        return true;
    }

    async function attemptSolve() {
        try {
            if (checkAndInjectHardBlockModal()) return;

            ensureHUD();
            const state = await chrome.storage.local.get(['captchaSolveEnabled', 'captchaAttempts', 'captchaBlocked']);
            if (state.captchaSolveEnabled === false) return;
            let attempts = state.captchaAttempts || 0;

            if (state.captchaBlocked) {
                logToSystem("🚨 Google blocking detected", "BLOCKED");
                return;
            }

            // [v26.0] Auto-reset: if 90s passed since last attempt, reset counter
            const now = Date.now();
            if (attempts >= MAX_ATTEMPTS) {
                if (lastAttemptTime && (now - lastAttemptTime > 90000)) {
                    console.log('[v26.0] Auto-reset: 90s elapsed. Resetting captcha counter.');
                    await chrome.storage.local.set({ captchaAttempts: 0, captchaBlocked: false });
                    attempts = 0;
                    logToSystem("🔄 Auto-reset complete. Retrying...", "RESET");
                } else {
                    if (!lastAttemptTime) lastAttemptTime = now;
                    logToSystem("⏳ Cooling down... (" + Math.round((90000 - (now - lastAttemptTime)) / 1000) + "s)", "WAIT");
                    return;
                }
            }
            lastAttemptTime = now;

            // ── 1. 체크박스 ──
            const cb = document.querySelector('#recaptcha-anchor') || document.querySelector('.recaptcha-checkbox');
            if (cb) {
                if (cb.getAttribute('aria-checked') === 'false') {
                    const now = Date.now();
                    if (now - lastCheckboxClickTime > 5000) {
                        logToSystem("✅ Clicking checkbox...");
                        lastCheckboxClickTime = now;
                        cb.click();
                    }
                } else {
                    logToSystem("🎉 Check complete!", "PASS");
                }
                return;
            }

            // ── 2. 도전 영역 ──
            const audioInput = document.querySelector('#audio-response') || document.querySelector('input[id*="audio"]');
            const audioBtn = findButtonByPattern(['audio', '음성', '헤드셋'], ['#recaptcha-audio-button', '.rc-button-audio']);

            if (audioBtn && !audioInput) {
                logToSystem("🎧 Switching to audio challenge...");
                audioBtn.click();
                waitCycles = 0;
                return;
            }

            if (audioInput) {
                if (!solving) {
                    const keys = await chrome.storage.local.get(['witKey']);
                    if (!keys.witKey) {
                        injectWitKeyMissingModal();
                        return;
                    }
                    executeResilientSolve(audioInput, attempts);
                }
            }

            const isSorryPage = isGoogleSorryPage();

            if (isSorryPage && !solving) {
                // [v1.0.0 Pro] Distinguish between Hard Block and Solvable Text Captcha
                const solvable = isSolvableTextCaptcha();
                
                if (solvable) {
                    const captchaImg = document.querySelector('img[src*="captcha"], img[src*="sorry/image"]');
                    const textInput = document.querySelector('input[name="captcha"], input[name="q"]');
                    const sorryForm = textInput ? textInput.closest('form') : null;
                    
                    // Show 5-minute wait modal if no paid key
                    const settings = await chrome.storage.local.get(['twoCaptchaKey', 'nopeChaKey', 'captchaApiKey']);
                    const hasPaidKey = settings.twoCaptchaKey || settings.nopeChaKey || settings.captchaApiKey;
                    
                    if (!hasPaidKey) {
                        injectSecondaryWaitModal();
                        return;
                    }
                    
                    if (captchaImg && textInput && sorryForm) {
                        solveTextCaptcha(captchaImg, textInput, sorryForm);
                    }
                } else if (checkAndInjectHardBlockModal()) {
                    // Hard Block Modal (25 min) injected
                    return;
                }
            }
        } catch (e) { console.error(e); }
    }

    async function executeResilientSolve(input, attempts) {
        if (input.value || solving) return;

        const audioUrl = findAudioUrl();
        if (!audioUrl) {
            waitCycles++;
            if (waitCycles > 20) clickReload();
            return;
        }

        solving = true;
        logToSystem("📦 Packaging audio data...", "PROXY");
        
        try {
            const base64Audio = await fetchAudioAsBase64(audioUrl);
            logToSystem("🎙️ Requesting server analysis...", "SOLVING");
            
            chrome.runtime.sendMessage({ 
                action: 'PERFORM_TRANSCRIPTION', 
                audioData: base64Audio,
                url: audioUrl 
            }, async (resp) => {
                solving = false;

                // [v18.0] 응답 유무에 따른 정밀 판정
                if (chrome.runtime.lastError) {
                    logToSystem("❌ Communication error: SW Disconnect", "FAIL");
                    return;
                }

                if (!resp) {
                    logToSystem("❌ No server response: Empty Response", "FAIL");
                    return;
                }

                if (resp.text) {
                    // [v26.0] Clean transcription: remove brackets, extra punctuation, trim
                    const cleanText = resp.text
                        .replace(/[\[\]]/g, '')
                        .replace(/[.,!?;:]+$/g, '')
                        .replace(/\s+/g, ' ')
                        .trim()
                        .toLowerCase();
                    if (!cleanText) {
                        // [v26.0] Empty transcription = audio too distorted. Don't penalize, just reload.
                        logToSystem("🔄 Speech not recognized. Requesting new audio...", "RETRY");
                        setTimeout(clickReload, 1000);
                        return;
                    }
                    logToSystem("✅ Analysis success: [" + cleanText + "]", "DONE");
                    submitFinalAnswer(input, cleanText);
                } else {
                    const errorMsg = resp.error || "Unknown reason";
                    // [v26.0] Don't count empty Wit.ai responses (confidence:0) as failures
                    if (errorMsg.includes('파싱실패') && errorMsg.includes('"text": ""')) {
                        logToSystem("🔄 Empty response. Requesting new audio...", "RETRY");
                        setTimeout(clickReload, 1000);
                        return;
                    }
                    const res = await chrome.storage.local.get(['captchaAttempts']);
                    const newCount = (res.captchaAttempts || 0) + 1;
                    await chrome.storage.local.set({ captchaAttempts: newCount });
                    logToSystem("❌ Analysis failed: " + errorMsg + " (" + newCount + "/" + MAX_ATTEMPTS + ")", "FAIL");
                    if (newCount < MAX_ATTEMPTS) setTimeout(clickReload, 1500);
                }
            });
        } catch (err) {
            solving = false;
            logToSystem("❌ Data error: " + err.message, "FAIL");
        }
    }

    async function fetchAudioAsBase64(url) {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    function findButtonByPattern(keywords, selectors) {
        for (const s of selectors) {
            const el = document.querySelector(s);
            if (el) return el;
        }
        const allBtns = document.querySelectorAll('button, div[role="button"], span[role="button"]');
        for (const btn of allBtns) {
            const text = (btn.innerText + ' ' + (btn.title || '') + ' ' + (btn.getAttribute('aria-label') || '')).toLowerCase();
            if (keywords.some(k => text.includes(k))) return btn;
        }
        return null;
    }

    function findAudioUrl() {
        const el = document.querySelector('a[href*="payload"]') || 
                   document.querySelector('.rc-audiochallenge-tdownload-link') ||
                   document.querySelector('audio source') || 
                   document.querySelector('audio[src]');
        const url = el?.href || el?.src;
        return (url && url.startsWith('http')) ? url : null;
    }

    function submitFinalAnswer(input, text) {
        input.value = text;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        setTimeout(() => {
            const verifyBtn = findButtonByPattern(['verify', '확인', 'v'], ['#recaptcha-verify-button', '.rc-button-verify']);
            if (verifyBtn) {
                logToSystem("➡️ Final verifying...", "VERIFY");
                verifyBtn.click();
                setTimeout(async () => {
                    const audioStillHere = document.querySelector('#audio-response');
                    const errorMsg = document.querySelector('.rc-audiochallenge-error-message');
                    const isWrong = audioStillHere && (audioStillHere.value === '' || errorMsg);
                    
                    if (isWrong) {
                        const res = await chrome.storage.local.get(['captchaAttempts']);
                        const newCount = (res.captchaAttempts || 0) + 1;
                        await chrome.storage.local.set({ captchaAttempts: newCount });
                        logToSystem("⚠️ Incorrect answer (" + newCount + "/" + MAX_ATTEMPTS + ")", "FAIL");
                        if (newCount < MAX_ATTEMPTS) clickReload();
                    } else {
                        logToSystem("🎉 Solved successfully!", "SUCCESS");
                        await chrome.storage.local.set({ captchaAttempts: 0, captchaBlocked: false });
                    }
                }, 3000);
            }
        }, 500);
    }

    async function solveTextCaptcha(img, input, form) {
        if (solving || input.value) return;

        // [v1.0.0 Pro] Secondary Quiz Policy: 699s mandatory pause if no paid API
        const settings = await chrome.storage.local.get(['twoCaptchaKey', 'nopeChaKey', 'captchaApiKey']);
        const hasPaidKey = settings.twoCaptchaKey || settings.nopeChaKey || settings.captchaApiKey;

        if (!hasPaidKey) {
            logToSystem("⚠️ SECONDARY QUIZ: MANDATORY PAUSE (5 Min)", "WAIT");
            injectSecondaryWaitModal();
            return;
        }

        if (ocrAttemptCount >= 3) {
            logToSystem("🚨 MANUAL ACTION REQUIRED", "FAIL");
            playAlertSound();
            return;
        }

        solving = true;
        logToSystem("🔍 Professional OCR analysis...", "OCR");

        try {
            // Convert image to Base64
            const b64 = await imageToBase64(img);
            if (!b64) throw new Error("Failed to capture CAPTCHA image");

            chrome.runtime.sendMessage({ 
                action: 'PERFORM_OCR', 
                imageB64: b64, 
                lang: 'eng' 
            }, (resp) => {
                solving = false;
                if (resp && resp.text) {
                    const cleanText = resp.text.replace(/[^a-zA-Z0-9]/g, '').trim();
                    if (cleanText.length < 3) {
                        ocrAttemptCount++;
                        logToSystem("🔄 OCR result too short. Retrying (" + ocrAttemptCount + "/3)...", "RETRY");
                        setTimeout(() => window.location.reload(), 2000);
                        return;
                    }
                    logToSystem("✅ OCR Success: [" + cleanText + "]", "DONE");
                    input.value = cleanText;
                    setTimeout(() => form.submit(), 500);
                } else {
                    ocrAttemptCount++;
                    logToSystem("❌ OCR Analysis failed (" + ocrAttemptCount + "/3)", "FAIL");
                    if (ocrAttemptCount >= 3) {
                        playAlertSound();
                        logToSystem("🚨 Manual bypass needed", "FAIL");
                    } else {
                        setTimeout(() => window.location.reload(), 3000);
                    }
                }
            });
        } catch (err) {
            solving = false;
            logToSystem("❌ OCR Error: " + err.message, "FAIL");
        }
    }

    function playAlertSound() {
        try {
            const context = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(880, context.currentTime);
            gain.gain.setValueAtTime(0.1, context.currentTime);
            oscillator.connect(gain);
            gain.connect(context.destination);
            oscillator.start();
            oscillator.stop(context.currentTime + 0.5);
        } catch (e) { console.warn("Beep failed:", e); }
    }

    async function imageToBase64(img) {
        return new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth || img.width;
            canvas.height = img.naturalHeight || img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            resolve(canvas.toDataURL('image/png'));
        });
    }

    function clickReload() {
        const btn = findButtonByPattern(['reload', '새로', '업데이트'], ['#recaptcha-reload-button', '.rc-button-reload']);
        if (btn) btn.click();
    }

    setInterval(attemptSolve, 900);
})();

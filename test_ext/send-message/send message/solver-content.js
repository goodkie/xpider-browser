/**
 * X PIDER CAPTCHA Solver Content v1.0.0
 * Content Script / DOM Interaction Module
 */

(function() {
    class XpiderSolverContent {
        constructor(options = {}) {
            this.options = {
                showHUD: options.showHUD !== false,
                hudTitle: options.hudTitle || "X PIDER Solver",
                checkInterval: options.checkInterval || 500, // [v1.2.7] Faster loop
                maxAttempts: options.maxAttempts || 15,
                ...options
            };
            this.solving = false;
            this.hud = null;
            this.lastLog = "";
            this.lastCheckboxClickTime = 0;
            this.lastAttemptTime = 0; // [v2.0] Auto-reset timer
            this.waitCycles = 0;
            this.init();
        }

        init() {
            if (this.options.showHUD) this.ensureHUD();
            setInterval(() => this.loop(), this.options.checkInterval);
            console.log("🤖 [XpiderSolver] Content script initialized.");
        }

        ensureHUD() {
            if (this.hud || !document.body) return;
            this.hud = document.createElement('div');
            this.hud.id = 'xpider-solver-hud';
            Object.assign(this.hud.style, {
                position: 'fixed', top: '0', left: '0', width: '100%',
                backgroundColor: 'rgba(0, 0, 0, 0.9)', color: '#ffcc00',
                fontSize: '11px', padding: '5px 10px', zIndex: '2147483647',
                fontFamily: 'monospace', borderBottom: '1px solid #ffcc00',
                boxSizing: 'border-box', display: 'flex', justifyContent: 'space-between',
                pointerEvents: 'none'
            });
            document.body.appendChild(this.hud);
        }

        log(msg, status = null) {
            if (msg === this.lastLog) return;
            this.lastLog = msg;
            if (this.hud) {
                this.hud.innerHTML = `<span>🤖 ${this.options.hudTitle}</span><span style="color: ${status === 'FAIL' ? '#ff3333' : '#ffcc00'}">${status || msg}</span>`;
            }
            // Send log to background
            try { chrome.runtime.sendMessage({ action: 'XPIDER_LOG', message: msg }); } catch(e) {}
        }

        async loop() {
            try {
                const state = await chrome.storage.local.get(['captchaAttempts', 'captchaBlocked']);
                const attempts = state.captchaAttempts || 0;
                
                // [v2.0] Auto-reset: if 90s passed since last attempt, reset counter
                const now = Date.now();
                if (attempts >= (this.options.maxAttempts || 10)) {
                    if (this.lastAttemptTime && (now - this.lastAttemptTime > 90000)) {
                        console.log('[v2.0] Auto-reset: 90s elapsed. Resetting captcha counter.');
                        await chrome.storage.local.set({ captchaAttempts: 0, captchaBlocked: false });
                        this.log("Auto-reset complete. Retrying...", "RESET");
                    } else {
                        if (!this.lastAttemptTime) this.lastAttemptTime = now;
                        this.log(`Cooling down... (${Math.round((90000 - (now - this.lastAttemptTime)) / 1000)}s)`, "WAIT");
                        return;
                    }
                }
                this.lastAttemptTime = now;

                // 1. Check for checkbox
                const cb = document.querySelector('#recaptcha-anchor') || document.querySelector('.recaptcha-checkbox');
                if (cb) {
                    if (cb.getAttribute('aria-checked') === 'false') {
                        if (now - this.lastCheckboxClickTime > 5000) {
                            this.log("Clicking checkbox...");
                            this.lastCheckboxClickTime = now;
                            cb.click();
                        }
                    } else {
                        this.log("Solved!", "PASS");
                    }
                    return;
                }

                // 2. Check for challenge
                const audioInput = document.querySelector('#audio-response') || document.querySelector('input[id*="audio"]');
                const audioBtn = this.findButtonByPattern(['audio', '음성', '헤드셋'], ['#recaptcha-audio-button', '.rc-button-audio']);

                if (audioBtn && !audioInput) {
                    this.log("Switching to audio...");
                    audioBtn.click();
                    this.waitCycles = 0;
                    return;
                }

                if (audioInput) {
                    if (!this.solving && !audioInput.value) {
                        this.solveChallenge(audioInput);
                    }
                } else {
                    this.waitCycles++;
                    if (this.waitCycles > 20) this.reload(); // Ghost state recovery
                }
            } catch (e) {
                console.error("[XpiderSolver] Loop error:", e);
            }
        }

        findButtonByPattern(keywords, selectors) {
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

        async solveChallenge(input) {
            const audioUrl = this.getAudioUrl();
            if (!audioUrl) return;

            this.solving = true;
            this.log("Requesting transcription...", "SOLVING");

            try {
                const b64 = await this.fetchAsBase64(audioUrl);
                chrome.runtime.sendMessage({ 
                    action: 'PERFORM_TRANSCRIPTION', 
                    audioData: b64, 
                    url: audioUrl 
                }, async (resp) => {
                    this.solving = false;
                    if (resp && resp.text) {
                        // [v2.0] Clean transcription: remove brackets, extra punctuation, trim
                        const cleanText = resp.text
                            .replace(/[\[\]]/g, '')
                            .replace(/[.,!?;:]+$/g, '')
                            .replace(/\s+/g, ' ')
                            .trim()
                            .toLowerCase();
                            
                        if (!cleanText) {
                            this.log("Empty result. Retrying...", "RETRY");
                            this.reload();
                            return;
                        }

                        this.log(`Success: [${cleanText}]`, "DONE");
                        this.submit(input, cleanText);
                    } else {
                        const errorMsg = resp?.error || "Unknown";
                        const res = await chrome.storage.local.get(['captchaAttempts']);
                        const newCount = (res.captchaAttempts || 0) + 1;
                        await chrome.storage.local.set({ captchaAttempts: newCount });
                        
                        this.log(`Analysis failed: ${errorMsg} (${newCount}/${this.options.maxAttempts || 10})`, "FAIL");
                        if (newCount < (this.options.maxAttempts || 10)) {
                            setTimeout(() => this.reload(), 1500);
                        }
                    }
                });
            } catch (e) {
                this.solving = false;
                this.log("Process error: " + e.message, "FAIL");
            }
        }

        getAudioUrl() {
            const el = document.querySelector('a[href*="payload"]') || document.querySelector('.rc-audiochallenge-tdownload-link') || document.querySelector('audio source') || document.querySelector('audio[src]');
            return el?.href || el?.src;
        }

        async fetchAsBase64(url) {
            const response = await fetch(url);
            const blob = await response.blob();
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.readAsDataURL(blob);
            });
        }

        submit(input, text) {
            input.value = text;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            setTimeout(() => {
                const verifyBtn = this.findButtonByPattern(['verify', '확인', 'v'], ['#recaptcha-verify-button', '.rc-button-verify']);
                if (verifyBtn) {
                    this.log("Finalizing...", "VERIFY");
                    verifyBtn.click();
                    
                    // Post-verification check
                    setTimeout(async () => {
                        const audioInput = document.querySelector('#audio-response');
                        const errorMsg = document.querySelector('.rc-audiochallenge-error-message');
                        const isWrong = audioInput && (audioInput.value === '' || errorMsg);
                        
                        if (isWrong) {
                            const res = await chrome.storage.local.get(['captchaAttempts']);
                            const newCount = (res.captchaAttempts || 0) + 1;
                            await chrome.storage.local.set({ captchaAttempts: newCount });
                            this.log(`Incorrect (${newCount}/${this.options.maxAttempts || 10})`, "FAIL");
                            if (newCount < (this.options.maxAttempts || 10)) this.reload();
                        } else {
                            this.log("Solved successfully!", "SUCCESS");
                            await chrome.storage.local.set({ captchaAttempts: 0, captchaBlocked: false });
                        }
                    }, 3000);
                }
            }, 500);
        }

        reload() {
            const btn = this.findButtonByPattern(['reload', '새로', '업데이트'], ['#recaptcha-reload-button', '.rc-button-reload']);
            if (btn) setTimeout(() => btn.click(), 1000);
        }
    }

    // Auto-init if in reCAPTCHA frame
    if (window.location.href.includes('google.com/recaptcha')) {
        window.xpiderSolver = new XpiderSolverContent();
    }
})();

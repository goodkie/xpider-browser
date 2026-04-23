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
                checkInterval: options.checkInterval || 1000,
                maxAttempts: options.maxAttempts || 10,
                ...options
            };
            this.solving = false;
            this.hud = null;
            this.lastLog = "";
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
                // 1. Check for checkbox
                const cb = document.querySelector('#recaptcha-anchor') || document.querySelector('.recaptcha-checkbox');
                if (cb) {
                    if (cb.getAttribute('aria-checked') === 'false') {
                        this.log("Clicking checkbox...");
                        cb.click();
                    } else {
                        this.log("Solved!", "PASS");
                    }
                    return;
                }

                // 2. Check for challenge
                const audioInput = document.querySelector('#audio-response') || document.querySelector('input[id*="audio"]');
                const audioBtn = document.querySelector('#recaptcha-audio-button') || document.querySelector('.rc-button-audio');

                if (audioBtn && !audioInput) {
                    this.log("Switching to audio...");
                    audioBtn.click();
                    return;
                }

                if (audioInput && !this.solving && !audioInput.value) {
                    this.solveChallenge(audioInput);
                }
            } catch (e) {
                console.error("[XpiderSolver] Loop error:", e);
            }
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
                }, (resp) => {
                    this.solving = false;
                    if (resp && resp.text) {
                        this.log("Transcription success!", "DONE");
                        this.submit(input, resp.text);
                    } else {
                        this.log("Transcription failed: " + (resp?.error || "Unknown"), "FAIL");
                        this.reload();
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
                const verifyBtn = document.querySelector('#recaptcha-verify-button') || document.querySelector('.rc-button-verify');
                if (verifyBtn) verifyBtn.click();
            }, 500);
        }

        reload() {
            const btn = document.querySelector('#recaptcha-reload-button') || document.querySelector('.rc-button-reload');
            if (btn) setTimeout(() => btn.click(), 1000);
        }
    }

    // Auto-init if in reCAPTCHA frame
    if (window.location.href.includes('google.com/recaptcha')) {
        window.xpiderSolver = new XpiderSolverContent();
    }
})();

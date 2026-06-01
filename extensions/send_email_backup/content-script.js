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
 * XPIDER Mail Pro - Powerful Machine Engine
 * Advanced automation for anonymousemail.me
 */

(function() {
    console.log("🚀 [XpiderMachine] Powerful Engine Activated");

    const alreadyInitialized = window.__xpider_initialized;
    window.__xpider_initialized = true;

    if (alreadyInitialized) return;

    // Heartbeat for persistence
    setInterval(() => {
        chrome.runtime.sendMessage({ action: 'SENDER_LOG', message: "Engine pulsing...", logType: "debug" });
    }, 5000);

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'START_SENDING') {
            processMachineMail(request.recipient, request.template, request.delayMs);
        }
    });

    async function processMachineMail(recipient, template, delayMs) {
        const host = window.location.host;
        logBg(`Initiating Machine Protocol [${host}] for: ${recipient}`, "info");

        try {
            // 0. Human Emulation: Pre-Interaction
            await simulateHumanBehavior();

            // 1. Site-Specific Selector Configuration
            const config = {
                'anonymousemail.me': {
                    to: 'input[name="to"]',
                    name: 'input[name="from_name"]',
                    subject: 'input[name="subject"]',
                    submit: 'button#submitBtn'
                },
                '5ymail.com': {
                    to: '#m6send_input_emaildest',
                    name: '#m6send_input_lenom', // Potential name field
                    subject: '#m6send_input_lesujet',
                    submit: 'input[title="Send for free"]'
                }
            };

            const current = config[host] || 
                            Object.entries(config).find(([k]) => host.includes(k))?.[1] || 
                            config['anonymousemail.me']; 

            // 2. Wait for form
            const toField = await waitForElement(current.to);
            const nameField = document.querySelector(current.name);
            const subjectField = document.querySelector(current.subject);
            
            // 3. Fill fields with Natural Typing
            await typeNaturally(toField, recipient);
            
            if (nameField) {
                const fullName = template.name || (template.firstName + " " + template.lastName).trim();
                await typeNaturally(nameField, fullName);
            }
            
            if (subjectField) {
                // Background already added ID to subject
                await typeNaturally(subjectField, template.subject);
            }

            // 4. TinyMCE Injection (Rich Text) with Spintax
            logBg("Machine parsing Spintax and injecting content...", "info");
            const processedMessage = processSpintax(template.message);
            const editorSuccess = await fillTinyMCEMachine(processedMessage);
            if (!editorSuccess) {
                const fallback = document.querySelector('textarea[name="message"]') || document.querySelector('#m6send_input_lemessage');
                if (fallback) await typeNaturally(fallback, processedMessage);
            }

            // 5. Security Check (Turnstile Logic only for anonymousemail)
            if (host === 'anonymousemail.me') {
                logBg("Machine analyzing Security Shield (Turnstile)...", "info");
                const solved = await waitForTurnstileTurbo();
                if (!solved) throw new Error("Security verification timed out.");
            }

            // 6. Elite Submission
            logBg("Executing final transmission...", "success");
            const submitBtn = document.querySelector(current.submit);
            if (submitBtn) {
                submitBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await delay(800);
                submitBtn.click();
            } else {
                throw new Error(`Critical Failure: Submit button [${current.submit}] missing`);
            }

            // 7. Oversight
            await verifySuccessMachine();

        } catch (e) {
            logBg(`Machine Fault: ${e.message}`, "error");
            finish(false, e.message);
        }
    }

    async function simulateHumanBehavior() {
        console.log("Emulating human presence...");
        // Random scroll
        window.scrollTo({ top: Math.random() * 300, behavior: 'smooth' });
        await delay(500 + Math.random() * 1000);
        
        // Potential mouse jitter simulated by hover/focus
        const header = document.querySelector('header');
        if (header) header.dispatchEvent(new Event('mouseenter'));
    }

    async function typeNaturally(element, text) {
        element.focus();
        element.value = ''; // Clean start
        for (let char of text) {
            element.value += char;
            element.dispatchEvent(new Event('input', { bubbles: true }));
            await delay(10 + Math.random() * 40); // Fast but human-like typing
        }
    }

    function processSpintax(text) {
        if (!text) return "";
        return text.replace(/\{([^{}]+)\}/g, (match, options) => {
            const choices = options.split('|');
            return choices[Math.floor(Math.random() * choices.length)];
        });
    }

    async function fillTinyMCEMachine(content) {
        for (let i = 0; i < 5; i++) {
            const iframes = document.querySelectorAll('iframe');
            for (let iframe of iframes) {
                if (iframe.id.includes('mce') || iframe.title.includes('Rich Text')) {
                    try {
                        const doc = iframe.contentDocument || iframe.contentWindow.document;
                        const body = doc.querySelector('body#tinymce');
                        if (body) {
                            body.focus();
                            body.innerHTML = content.replace(/\n/g, '<br>');
                            // Trigger TinyMCE internal change event if possible
                            iframe.contentWindow.dispatchEvent(new Event('change'));
                            return true;
                        }
                    } catch (e) {}
                }
            }
            await delay(800);
        }
        return false;
    }

    async function waitForTurnstileTurbo() {
        return new Promise((resolve) => {
            const start = Date.now();
            const check = setInterval(() => {
                const turnstileInput = document.querySelector('input[name="cf-turnstile-response"]');
                const hasValue = turnstileInput && turnstileInput.value && turnstileInput.value.length > 10;
                
                if (hasValue) {
                    clearInterval(check);
                    logBg("Security Shield Bypassed.", "success");
                    resolve(true);
                }

                if (Date.now() - start > 120000) { // 2 min
                    clearInterval(check);
                    resolve(false);
                }
            }, 500); // Fast polling
        });
    }

    async function verifySuccessMachine() {
        logBg("Monitoring terminal output...", "info");
        const check = setInterval(() => {
            const html = document.body.innerHTML;
            if (html.includes("Your email has been sent") || html.includes("successful")) {
                clearInterval(check);
                logBg("SUCCESS: Transmission confirmed.", "success");
                finish(true);
            }
            if (html.includes("error") && !html.includes("no-error")) {
                // Potential error
                console.warn("Potential error detected in HTML");
            }
        }, 1000);

        setTimeout(() => {
            clearInterval(check);
            finish(true, "Assumed Success (Confirmation Timeout)");
        }, 30000);
    }

    function finish(success, error = null) {
        chrome.runtime.sendMessage({
            action: 'SENDER_FINISHED',
            result: { success, error }
        });
    }

    function logBg(msg, type = 'info') {
        chrome.runtime.sendMessage({
            action: 'SENDER_LOG',
            message: `[POWER_MACHINE] ${msg}`,
            logType: type
        });
    }

    function delay(ms) {
        return new Promise(res => setTimeout(res, ms));
    }

    async function waitForElement(selector) {
        return new Promise((resolve, reject) => {
            const el = document.querySelector(selector);
            if (el) return resolve(el);
            const observer = new MutationObserver(() => {
                const el = document.querySelector(selector);
                if (el) {
                    resolve(el);
                    observer.disconnect();
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
            setTimeout(() => {
                observer.disconnect();
                reject(new Error(`Machine Timeout: Target ${selector} not found`));
            }, 15000);
        });
    }

    chrome.runtime.sendMessage({ action: 'SENDER_READY' });

})();

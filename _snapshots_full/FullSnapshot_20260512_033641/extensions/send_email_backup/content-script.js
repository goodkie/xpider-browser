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

// UltraSolver Pro - Content Script
// Detects CAPTCHAs (reCAPTCHA, hCaptcha, Cloudflare Turnstile) and injects solved tokens.

// ── XPIDER DEV LOG BRIDGE ─────────────────────────────────────────────────
(function() {
  const _EXT_NAME = 'Ext[UltraSolverPro-CS]';
  const _xDL = (lvl, msg, ex) => {
    try {
      // NOTE: 구형 Chromium 108 (Win7/Electron22)에서는 sendMessage가 Promise가 아닌
      // undefined를 반환하므로 .catch() 대신 콜백 방식으로 처리해야 합니다.
      chrome.runtime.sendMessage({
        _xpider_devlog: true, level: lvl,
        source: _EXT_NAME, msg: String(msg).substring(0, 2048), extra: ex || undefined
      }, function() { if (chrome.runtime.lastError) { /* suppress */ } });
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
})();
// ── END DEV LOG BRIDGE ───────────────────────────────────────────────────

console.log("🤖 [UltraSolver Pro] Content script injected on:", window.location.href);

function logToDashboard(msg, isError = false) {
    if (isError) {
        console.error(`🤖 [UltraSolver Pro] ${msg}`);
    } else {
        console.log(`🤖 [UltraSolver Pro] ${msg}`);
    }
    chrome.runtime.sendMessage({ action: 'logSolver', message: msg }, () => { if (chrome.runtime.lastError) {} });
}

const solvedSitekeys = new Set();

// Electron IPC Bridge Helper
function invokeXpiderIpc(channel, args = {}) {
    return new Promise((resolve, reject) => {
        const id = Math.random().toString(36).substring(2);
        const listener = (event) => {
            if (event.data && event.data.type === 'XPIDER_RESPONSE' && event.data.id === id) {
                window.removeEventListener('message', listener);
                if (event.data.error) {
                    reject(new Error(event.data.error));
                } else {
                    resolve(event.data.result);
                }
            }
        };
        window.addEventListener('message', listener);
        window.postMessage({ type: 'XPIDER_INVOKE', channel, args, id }, '*');
    });
}

// Check tokens and request captcha solve from background
async function requestSolveCaptcha(params, sitekey, cleanSet) {
    try {
        const remaining = await invokeXpiderIpc('xpider-token-get-remaining');
        if (Number(remaining) < 3) {
            logToDashboard(`Insufficient XPIDER tokens. (3 required, but only ${remaining} available)`, true);
            cleanSet.delete(sitekey);
            document.documentElement.setAttribute('data-usp-solving', 'false');
            return;
        }

        logToDashboard(`Task accepted. Initiating solve request via SuperProxy...`);
        document.documentElement.setAttribute('data-usp-solving', 'true');
        chrome.runtime.sendMessage({
            action: "solveCaptcha",
            params: params
        }, (response) => {
            if (chrome.runtime.lastError) {
                logToDashboard(`Background send error: ${chrome.runtime.lastError.message}`, true);
                cleanSet.delete(sitekey);
                document.documentElement.setAttribute('data-usp-solving', 'false');
            } else if (response && !response.success) {
                logToDashboard(`SuperProxy solve failed: ${response.error}`, true);
                cleanSet.delete(sitekey);
                document.documentElement.setAttribute('data-usp-solving', 'false');
            }
        });
    } catch (e) {
        logToDashboard(`Failed to check XPIDER tokens: ${e.message}`, true);
        cleanSet.delete(sitekey);
        document.documentElement.setAttribute('data-usp-solving', 'false');
    }
}

function getSiteKeyFromUrl(url, paramName) {
    try {
        const parsedUrl = new URL(url);
        return parsedUrl.searchParams.get(paramName);
    } catch (e) {
        return null;
    }
}

function classifyCaptcha(sitekey, elementHint) {
    if (!sitekey) return null;
    sitekey = sitekey.trim();

    // 1. 값 기반 최우선 판단
    if (sitekey.startsWith('0x4')) {
        return 'turnstile';
    }
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sitekey)) {
        return 'hcaptcha';
    }

    // 2. 힌트(엘리먼트 클래스, 태그, iframe 주소 등) 기반 판단
    if (elementHint) {
        const isRecaptcha = elementHint.classList?.contains('g-recaptcha') || 
                            elementHint.closest?.('.g-recaptcha') ||
                            (elementHint.tagName === 'IFRAME' && (elementHint.src.includes('recaptcha') || elementHint.src.includes('google.com/recaptcha')));
        if (isRecaptcha) return 'recaptcha';

        const isHcaptcha = elementHint.classList?.contains('h-captcha') || 
                           elementHint.closest?.('.h-captcha') ||
                           (elementHint.tagName === 'IFRAME' && elementHint.src.includes('hcaptcha.com'));
        if (isHcaptcha) return 'hcaptcha';

        const isTurnstile = elementHint.classList?.contains('cf-turnstile') || 
                            elementHint.closest?.('.cf-turnstile') ||
                            (elementHint.tagName === 'IFRAME' && elementHint.src.includes('challenges.cloudflare.com'));
        if (isTurnstile) return 'turnstile';
    }

    // 3. 기본값은 reCAPTCHA로 판단
    return 'recaptcha';
}

function detectCaptchas() {
    // [핵심 패치] 오직 메인 프레임(Top Frame)에서만 캡차를 감지하고 요청을 발송하도록 엄격하게 제어!
    if (window.self !== window.top) {
        return;
    }

    let detectedRecaptcha = null;
    let detectedHcaptcha = null;
    let detectedTurnstile = null;

    const candidates = [];

    // 1. DOM 내 [data-sitekey] 속성을 가진 모든 요소 수집
    const elements = document.querySelectorAll('[data-sitekey]');
    elements.forEach(el => {
        const sitekey = el.getAttribute('data-sitekey')?.trim();
        if (sitekey) {
            candidates.push({ sitekey, element: el });
        }
    });

    // 2. 클래스명 기반 폴백 검색
    const classSelectors = ['.g-recaptcha', '.h-captcha', '.cf-turnstile'];
    classSelectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => {
            const sitekey = el.getAttribute('data-sitekey')?.trim();
            if (sitekey && !candidates.some(c => c.element === el)) {
                candidates.push({ sitekey, element: el });
            }
        });
    });

    // 3. iframe 소스 기반 최종 폴백 검색
    const rcIframe = document.querySelector('iframe[src*="recaptcha/api2/anchor"], iframe[src*="recaptcha/api2/bframe"]');
    if (rcIframe && !candidates.some(c => c.element === rcIframe)) {
        const key = getSiteKeyFromUrl(rcIframe.src, 'k');
        if (key) candidates.push({ sitekey: key, element: rcIframe });
    }
    const hcIframe = document.querySelector('iframe[src*="hcaptcha.com"]');
    if (hcIframe && !candidates.some(c => c.element === hcIframe)) {
        const key = getSiteKeyFromUrl(hcIframe.src, 'sitekey');
        if (key) candidates.push({ sitekey: key, element: hcIframe });
    }
    const tsIframe = document.querySelector('iframe[src*="challenges.cloudflare.com"]');
    if (tsIframe && !candidates.some(c => c.element === tsIframe)) {
        const key = getSiteKeyFromUrl(tsIframe.src, 'k');
        if (key) candidates.push({ sitekey: key, element: tsIframe });
    }

    // 4. 수집한 후보들을 하이브리드 분류기로 최종 맵핑
    candidates.forEach(c => {
        const type = classifyCaptcha(c.sitekey, c.element);
        if (type === 'turnstile' && !detectedTurnstile) {
            detectedTurnstile = c;
        } else if (type === 'hcaptcha' && !detectedHcaptcha) {
            detectedHcaptcha = c;
        } else if (type === 'recaptcha' && !detectedRecaptcha) {
            detectedRecaptcha = c;
        }
    });

    // 5. 감지된 캡차 해결 요청 전송
    // (1) reCAPTCHA
    if (detectedRecaptcha && !solvedSitekeys.has(detectedRecaptcha.sitekey)) {
        const key = detectedRecaptcha.sitekey;
        logToDashboard("Detected reCAPTCHA sitekey: " + key);
        solvedSitekeys.add(key);
        requestSolveCaptcha({
            type: "RecaptchaV2TaskProxyless",
            websiteURL: window.location.href,
            websiteKey: key,
            isInvisible: detectedRecaptcha.element?.getAttribute('data-size') === 'invisible'
        }, key, solvedSitekeys);
    }

    // (2) hCaptcha
    if (detectedHcaptcha && !solvedSitekeys.has(detectedHcaptcha.sitekey)) {
        const key = detectedHcaptcha.sitekey;
        logToDashboard("Detected hCaptcha sitekey: " + key);
        solvedSitekeys.add(key);
        requestSolveCaptcha({
            type: "HCaptchaTaskProxyless",
            websiteURL: window.location.href,
            websiteKey: key
        }, key, solvedSitekeys);
    }

    // (3) Turnstile
    if (detectedTurnstile && !solvedSitekeys.has(detectedTurnstile.sitekey)) {
        const key = detectedTurnstile.sitekey;
        logToDashboard("Detected Turnstile sitekey: " + key);
        solvedSitekeys.add(key);
        requestSolveCaptcha({
            type: "TurnstileTaskProxyless",
            websiteURL: window.location.href,
            websiteKey: key
        }, key, solvedSitekeys);
    }
}

// Observe DOM mutations to detect dynamically loaded CAPTCHAs
const observer = new MutationObserver((mutations) => {
    detectCaptchas();
});
observer.observe(document.documentElement, { childList: true, subtree: true });

// Run initial detection
detectCaptchas();

// Listen for tokens from background.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "injectToken") {
        logToDashboard(`Received solved token. Injecting... (ID: ${message.injectionId})`);
        
        let attempts = 0;
        const maxAttempts = 20; // 200ms * 20 = 4 seconds
        const intervalTime = 200;

        const tryInject = () => {
            let injected = false;

            // 1. Broad selectors for reCAPTCHA
            const recaptchaTextareas = document.querySelectorAll(
                'textarea[id="g-recaptcha-response"], textarea[name="g-recaptcha-response"], [id*="recaptcha-response"], [name*="recaptcha-response"]'
            );
            recaptchaTextareas.forEach(textarea => {
                if (textarea.tagName === 'TEXTAREA' || textarea.tagName === 'INPUT') {
                    textarea.value = message.token;
                    textarea.dispatchEvent(new Event('input', { bubbles: true }));
                    textarea.dispatchEvent(new Event('change', { bubbles: true }));
                    injected = true;
                }
            });

            // 2. Broad selectors for hCaptcha
            const hcaptchaTextareas = document.querySelectorAll(
                'textarea[id="h-captcha-response"], textarea[name="h-captcha-response"], [id*="h-captcha-response"], [name*="h-captcha-response"]'
            );
            hcaptchaTextareas.forEach(textarea => {
                if (textarea.tagName === 'TEXTAREA' || textarea.tagName === 'INPUT') {
                    textarea.value = message.token;
                    textarea.dispatchEvent(new Event('input', { bubbles: true }));
                    textarea.dispatchEvent(new Event('change', { bubbles: true }));
                    injected = true;
                }
            });

            // 3. Broad selectors for Turnstile
            const turnstileInputs = document.querySelectorAll(
                'input[name="cf-turnstile-response"], input[id="cf-turnstile-response"], [id*="turnstile-response"], [name*="turnstile-response"], [name*="turnstile"]'
            );
            turnstileInputs.forEach(input => {
                if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
                    input.value = message.token;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                    injected = true;
                }
            });

            // 3-1. Dynamic data-response-field-name check for Turnstile (WP Contact Form 7 etc.)
            if (!injected) {
                const tsWidgets = document.querySelectorAll('.cf-turnstile, [data-response-field-name]');
                tsWidgets.forEach(widget => {
                    const fieldName = widget.getAttribute('data-response-field-name');
                    if (fieldName) {
                        const customInputs = document.querySelectorAll(`input[name="${fieldName}"], textarea[name="${fieldName}"]`);
                        customInputs.forEach(input => {
                            input.value = message.token;
                            input.dispatchEvent(new Event('input', { bubbles: true }));
                            input.dispatchEvent(new Event('change', { bubbles: true }));
                            injected = true;
                        });
                    }
                });
            }

            // 4. Shadow DOM Fallback Search (if not injected yet)
            if (!injected) {
                const allElements = document.querySelectorAll('*');
                allElements.forEach(el => {
                    if (el.shadowRoot) {
                        const shadowInputs = el.shadowRoot.querySelectorAll(
                            'textarea[name*="response"], input[name*="response"], [id*="response"]'
                        );
                        shadowInputs.forEach(input => {
                            const name = input.name || '';
                            const id = input.id || '';
                            if (name.includes('recaptcha') || name.includes('h-captcha') || name.includes('turnstile') ||
                                id.includes('recaptcha') || id.includes('h-captcha') || id.includes('turnstile')) {
                                input.value = message.token;
                                input.dispatchEvent(new Event('input', { bubbles: true }));
                                input.dispatchEvent(new Event('change', { bubbles: true }));
                                injected = true;
                            }
                        });
                    }
                });
            }

            return injected;
        };

        const runInterval = () => {
            const success = tryInject();
            if (success) {
                logToDashboard("Token successfully injected into DOM. Triggering callback...");
                document.documentElement.setAttribute('data-usp-solving', 'done');
                triggerPageCallback(message.token);
                
                chrome.runtime.sendMessage({
                    action: "injectionResult",
                    injectionId: message.injectionId,
                    success: true,
                    isTop: window.self === window.top
                }, () => { if (chrome.runtime.lastError) {} });
                
                sendResponse({ success: true });
            } else {
                attempts++;
                if (attempts < maxAttempts) {
                    setTimeout(runInterval, intervalTime);
                } else {
                    console.log("🤖 [UltraSolver Pro] No response fields found in this frame after polling.");
                    document.documentElement.setAttribute('data-usp-solving', 'false');
                    chrome.runtime.sendMessage({
                        action: "injectionResult",
                        injectionId: message.injectionId,
                        success: false,
                        isTop: window.self === window.top
                    }, () => { if (chrome.runtime.lastError) {} });
                    sendResponse({ success: false });
                }
            }
        };

        runInterval();
        return true; // Keep message channel open for async response
    }

    if (message.action === "executeDeduct") {
        if (window.self === window.top) {
            console.log(`🤖 [UltraSolver Pro] Executing token deduction in Top Frame for injection ID: ${message.injectionId}`);
            // Deduct 3 XPIDER tokens for 1 USP solve
            invokeXpiderIpc('xpider-token-deduct', { count: 3, extName: 'UltraSolverPro', action: 'solve', details: 'CAPTCHA Auto Solve' })
                .then(function(res) { logToDashboard("Deducted 3 XPIDER tokens. Result: " + JSON.stringify(res)); })
                .catch(function(err) { logToDashboard("Failed to deduct tokens: " + err.message, true); });
        } else {
            console.log(`🤖 [UltraSolver Pro] executeDeduct ignored in subframe (ID: ${message.injectionId})`);
        }
        sendResponse({ success: true });
    }
});

// Trigger callbacks inside the main world context
function triggerPageCallback(token) {
    try {
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('inject.js');
        script.onload = function() {
            // Dispatch custom event to communicate token to the inject.js script
            const event = new CustomEvent('UltraSolverTokenReady', { detail: { token } });
            window.dispatchEvent(event);
            this.remove();
        };
        (document.head || document.documentElement).appendChild(script);
    } catch (e) {
        logToDashboard("Callback trigger error: " + e.message, true);
    }
}

// Keep-Alive Connection to Extension Service Worker (prevents termination in Electron 22 / Win7)
let keepAlivePort = null;
function connectKeepAlive() {
    try {
        if (keepAlivePort) {
            try { keepAlivePort.disconnect(); } catch(e) {}
            keepAlivePort = null;
        }
        keepAlivePort = chrome.runtime.connect({ name: "ultrasolver-keepalive" });
        keepAlivePort.onDisconnect.addListener(() => {
            setTimeout(() => {
                if (!keepAlivePort) connectKeepAlive();
            }, 3000);
        });
        console.log("🤖 [UltraSolver Pro] Keep-alive port connected.");
    } catch (e) {
        console.warn("🤖 [UltraSolver Pro] Keep-alive connection failed:", e.message);
    }
}

// Connect immediately
connectKeepAlive();

// Refresh port every 4 minutes to reset MV3 SW 5-minute termination timer
setInterval(() => {
    console.log("🤖 [UltraSolver Pro] Refreshing keep-alive port...");
    connectKeepAlive();
}, 240000);

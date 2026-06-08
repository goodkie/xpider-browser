// UltraSolver Pro - Page Context Inject Script
// Runs in the MAIN world to access the page's global variables and invoke callback functions.

window.addEventListener('UltraSolverTokenReady', (event) => {
    const token = event.detail.token;
    if (!token) return;

    console.log("🤖 [UltraSolver Pro] Injected script executing callbacks in MAIN world...");

    // 1. grecaptcha & hcaptcha API getResponse Mocking
    try {
        if (typeof window.grecaptcha !== 'undefined') {
            window.grecaptcha.getResponse = function() {
                console.log("🤖 [UltraSolver Pro] Mocked grecaptcha.getResponse called.");
                return token;
            };
            if (window.grecaptcha.enterprise) {
                window.grecaptcha.enterprise.getResponse = function() {
                    console.log("🤖 [UltraSolver Pro] Mocked grecaptcha.enterprise.getResponse called.");
                    return token;
                };
            }
        }
        if (typeof window.hcaptcha !== 'undefined') {
            window.hcaptcha.getResponse = function() {
                console.log("🤖 [UltraSolver Pro] Mocked hcaptcha.getResponse called.");
                return token;
            };
        }
    } catch (e) {
        console.error("🤖 [UltraSolver Pro] Mocking error:", e);
    }

    // 2. Find elements that have callback attributes
    const elements = document.querySelectorAll('[data-callback], .g-recaptcha, .h-captcha, .cf-turnstile');
    elements.forEach(element => {
        const callbackName = element.getAttribute('data-callback');
        if (callbackName) {
            // Callback can be nested, e.g., 'app.loginCallback'
            const callbackFunc = getNestedObject(window, callbackName);
            if (typeof callbackFunc === 'function') {
                console.log(`🤖 [UltraSolver Pro] Triggering attribute callback: ${callbackName}`);
                try {
                    callbackFunc(token);
                } catch (e) {
                    console.error("🤖 [UltraSolver Pro] Error invoking callback:", e);
                }
            }
        }
    });

    // 3. Fallback: grecaptcha_cfg 기반 콜백 찾기 및 격발
    try {
        if (typeof window.___grecaptcha_cfg !== 'undefined' && window.___grecaptcha_cfg.clients) {
            console.log("🤖 [UltraSolver Pro] Searching window.___grecaptcha_cfg for callbacks...");
            const clients = window.___grecaptcha_cfg.clients;
            Object.keys(clients).forEach(clientId => {
                const client = clients[clientId];
                findAndTriggerCallbacks(client, token);
            });
        }
    } catch (e) {
        console.error("🤖 [UltraSolver Pro] Error searching grecaptcha_cfg:", e);
    }
});

// Helper to resolve nested properties like 'myObj.subObj.myFunc'
function getNestedObject(base, path) {
    return path.split('.').reduce((obj, prop) => {
        return obj && obj[prop] !== undefined ? obj[prop] : null;
    }, base);
}

// Helper to recursively find and invoke callbacks in grecaptcha client objects
function findAndTriggerCallbacks(obj, token, depth = 0) {
    if (depth > 10 || !obj) return;
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            if (key === 'callback' && typeof obj[key] === 'function') {
                console.log("🤖 [UltraSolver Pro] Found grecaptcha callback! Triggering callback function...");
                try {
                    obj[key](token);
                } catch (e) {
                    console.error("🤖 [UltraSolver Pro] Callback execution error:", e);
                }
            } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                findAndTriggerCallbacks(obj[key], token, depth + 1);
            }
        }
    }
}

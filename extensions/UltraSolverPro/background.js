// UltraSolver Pro - Background Service Worker
// Manages CAPTCHA solving queue, sends tasks to SuperProxy, polls for results.

// ── XPIDER DEV LOG BRIDGE ─────────────────────────────────────────────────
(function() {
  const _EXT_NAME = 'Ext[UltraSolverPro]';
  const _xDL = (lvl, msg, ex) => {
    try {
      chrome.runtime.sendMessage({
        _xpider_devlog: true, level: lvl,
        source: _EXT_NAME, msg: String(msg).substring(0, 2048), extra: ex || undefined
      }).catch(() => {});
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
  self.addEventListener && self.addEventListener('error', (e) => _xDL('ERROR', `[Uncaught] ${e.message} at ${e.filename}:${e.lineno}`));
  self.addEventListener && self.addEventListener('unhandledrejection', (e) => _xDL('ERROR', `[UnhandledRejection] ${e.reason}`));
  self.__xDL = _xDL;
})();
// ── END DEV LOG BRIDGE ───────────────────────────────────────────────────

console.log("🤖 [UltraSolver Pro] Background worker active");

// Active injection tracking for deduplication & log management
const activeInjections = new Map();

// Listen for CAPTCHA solving requests from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "logSolver") {
        logSolver(message.message);
        sendResponse({ success: true });
        return;
    }

    if (message.action === "injectionResult") {
        const injectionId = message.injectionId;
        const state = activeInjections.get(injectionId);
        
        if (state) {
            if (message.success) {
                state.successReported = true;
                if (!state.deducted) {
                    state.deducted = true;
                    const tabId = sender.tab?.id || state.tabId;
                    console.log(`🤖 [UltraSolver Pro] Injection successful. Sending deduct order to tab: ${tabId}`);
                    
                    chrome.tabs.sendMessage(tabId, {
                        action: "executeDeduct",
                        injectionId: injectionId
                    });
                }
            }
        }
        sendResponse({ success: true });
        return;
    }

    if (message.action === "solveCaptcha") {
        const tabId = sender.tab?.id;
        if (!tabId) {
            sendResponse({ success: false, error: "No active tab found" });
            return;
        }
        
        logSolver(`Received CAPTCHA solve request for: ${message.params.type}`);
        solveCaptchaHybrid(message.params, tabId)
            .then(result => {
                sendResponse(result);
            })
            .catch(error => {
                sendResponse({ success: false, error: error.message });
            });
            
        return true; // Keep channel open for async response
    }
});

// Default master keys
const MASTER_CAPSOLVER_KEY = 'CAP-85826E780AAEB49B3B0BA99D2962E3AAB2CE7187F000E2F9E88FC1C9BFA0813C';
const MASTER_TWOCAPTCHA_KEY = '478f83de37251fd5ced7590c5916bbcb';

// Get active keys (checking storage first, falling back to master keys)
async function getSolverKeys() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['capsolverKey', 'twoCaptchaKey'], (res) => {
            resolve({
                capsolverKey: res.capsolverKey || MASTER_CAPSOLVER_KEY,
                twoCaptchaKey: res.twoCaptchaKey || MASTER_TWOCAPTCHA_KEY
            });
        });
    });
}

async function obtainTokenWithFallback(params) {
    const keys = await getSolverKeys();
    
    // 1순위: CapSolver 시도
    if (keys.capsolverKey) {
        logSolver("Attempting CAPTCHA solve with CapSolver (Priority 1)...");
        try {
            const token = await solveWithCapSolver(params, keys.capsolverKey);
            if (token) {
                logSolver("CapSolver solve successful!");
                return token;
            }
        } catch (e) {
            logSolver(`CapSolver failed: ${e.message}. Falling back to 2Captcha...`);
        }
    } else {
        logSolver("CapSolver API key not configured. Skipping to 2Captcha...");
    }

    // 2순위: 2Captcha 시도
    if (keys.twoCaptchaKey) {
        logSolver("Attempting CAPTCHA solve with 2Captcha (Priority 2)...");
        try {
            const token = await solveWith2Captcha(params, keys.twoCaptchaKey);
            if (token) {
                logSolver("2Captcha solve successful!");
                return token;
            }
        } catch (e) {
            logSolver(`2Captcha failed: ${e.message}`);
            throw new Error(`Both solvers failed. 2Captcha error: ${e.message}`);
        }
    } else {
        throw new Error("Both solvers failed: No configured API keys or all failed.");
    }
}

async function solveWithCapSolver(params, apiKey) {
    // Map task type
    let taskType = params.type;
    if (taskType === 'RecaptchaV2TaskProxyless') {
        taskType = 'ReCaptchaV2TaskProxyLess';
    } else if (taskType === 'HCaptchaTaskProxyless') {
        taskType = 'HCaptchaTaskProxyLess';
    } else if (taskType === 'TurnstileTaskProxyless') {
        taskType = 'AntiTurnstileTaskProxyLess';
    }

    const taskObj = {
        type: taskType,
        websiteURL: params.websiteURL,
        websiteKey: params.websiteKey
    };
    if (params.isInvisible !== undefined) {
        taskObj.isInvisible = params.isInvisible;
    }

    updateStatus("Creating CapSolver task...", "processing");
    
    const response = await fetch('https://api.capsolver.com/createTask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            clientKey: apiKey,
            task: taskObj
        })
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`CapSolver createTask HTTP ${response.status}: ${errText}`);
    }

    const data = await response.json();
    if (data.errorId !== 0) {
        throw new Error(`CapSolver createTask error: ${data.errorDescription} (${data.errorCode})`);
    }

    const taskId = data.taskId;
    if (!taskId) {
        throw new Error("CapSolver createTask response missing taskId");
    }

    console.log(`🤖 [UltraSolver Pro] CapSolver task created: ${taskId}. Polling...`);
    updateStatus(`Solving with CapSolver (ID: ${taskId})...`, "solving");

    // Polling loop
    let attempts = 0;
    const maxAttempts = 20; // 3s * 20 = 60s
    
    return new Promise((resolve, reject) => {
        const interval = setInterval(async () => {
            attempts++;
            if (attempts > maxAttempts) {
                clearInterval(interval);
                reject(new Error("CapSolver task timeout"));
                return;
            }

            try {
                const res = await fetch('https://api.capsolver.com/getTaskResult', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        clientKey: apiKey,
                        taskId: taskId
                    })
                });

                if (!res.ok) {
                    console.warn(`🤖 [UltraSolver Pro] CapSolver polling HTTP ${res.status}`);
                    return;
                }

                const resultData = await res.json();
                if (resultData.errorId !== 0) {
                    clearInterval(interval);
                    reject(new Error(`CapSolver poll error: ${resultData.errorDescription}`));
                    return;
                }

                if (resultData.status === "ready") {
                    clearInterval(interval);
                    const token = resultData.solution?.gRecaptchaResponse || 
                                  resultData.solution?.token || 
                                  resultData.solution?.text;
                    if (!token) {
                        reject(new Error("CapSolver solution received but token is empty"));
                    } else {
                        resolve(token);
                    }
                } else if (resultData.status === "processing") {
                    console.log(`🤖 [UltraSolver Pro] CapSolver task ${taskId} processing (attempt ${attempts}/${maxAttempts})`);
                    updateStatus(`CapSolver Solving (Attempt ${attempts})...`, "solving");
                } else {
                    clearInterval(interval);
                    reject(new Error(`CapSolver unexpected task status: ${resultData.status}`));
                }
            } catch (e) {
                console.error("🤖 [UltraSolver Pro] CapSolver polling exception:", e);
            }
        }, 3000);
    });
}

async function solveWith2Captcha(params, apiKey) {
    // 2Captcha uses standard proxyless task types (matching what content.js sends)
    const taskObj = {
        type: params.type,
        websiteURL: params.websiteURL,
        websiteKey: params.websiteKey
    };
    if (params.isInvisible !== undefined) {
        taskObj.isInvisible = params.isInvisible;
    }

    updateStatus("Creating 2Captcha task...", "processing");
    
    const response = await fetch('https://api.2captcha.com/createTask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            clientKey: apiKey,
            task: taskObj
        })
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`2Captcha createTask HTTP ${response.status}: ${errText}`);
    }

    const data = await response.json();
    if (data.errorId !== 0) {
        throw new Error(`2Captcha createTask error: ${data.errorDescription} (${data.errorCode})`);
    }

    const taskId = data.taskId;
    if (!taskId) {
        throw new Error("2Captcha createTask response missing taskId");
    }

    console.log(`🤖 [UltraSolver Pro] 2Captcha task created: ${taskId}. Polling...`);
    updateStatus(`Solving with 2Captcha (ID: ${taskId})...`, "solving");

    // Polling loop
    let attempts = 0;
    const maxAttempts = 20; // 5s * 20 = 100s
    
    return new Promise((resolve, reject) => {
        const interval = setInterval(async () => {
            attempts++;
            if (attempts > maxAttempts) {
                clearInterval(interval);
                reject(new Error("2Captcha task timeout"));
                return;
            }

            try {
                const res = await fetch('https://api.2captcha.com/getTaskResult', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        clientKey: apiKey,
                        taskId: taskId
                    })
                });

                if (!res.ok) {
                    console.warn(`🤖 [UltraSolver Pro] 2Captcha polling HTTP ${res.status}`);
                    return;
                }

                const resultData = await res.json();
                if (resultData.errorId !== 0) {
                    clearInterval(interval);
                    reject(new Error(`2Captcha poll error: ${resultData.errorDescription}`));
                    return;
                }

                if (resultData.status === "ready") {
                    clearInterval(interval);
                    const token = resultData.solution?.gRecaptchaResponse || 
                                  resultData.solution?.token || 
                                  resultData.solution?.text;
                    if (!token) {
                        reject(new Error("2Captcha solution received but token is empty"));
                    } else {
                        resolve(token);
                    }
                } else if (resultData.status === "processing") {
                    console.log(`🤖 [UltraSolver Pro] 2Captcha task ${taskId} processing (attempt ${attempts}/${maxAttempts})`);
                    updateStatus(`2Captcha Solving (Attempt ${attempts})...`, "solving");
                } else {
                    clearInterval(interval);
                    reject(new Error(`2Captcha unexpected task status: ${resultData.status}`));
                }
            } catch (e) {
                console.error("🤖 [UltraSolver Pro] 2Captcha polling exception:", e);
            }
        }, 5000);
    });
}

async function solveCaptchaHybrid(params, tabId) {
    try {
        const token = await obtainTokenWithFallback(params);
        
        console.log("🤖 [UltraSolver Pro] CAPTCHA solved! Injecting to tab:", tabId);
        updateStatus("CAPTCHA Solved successfully!", "success");

        const injectionId = 'inj_' + Date.now() + '_' + Math.random().toString(36).substring(2);
        
        // Register injection request state
        activeInjections.set(injectionId, {
            tabId: tabId,
            deducted: false,
            successReported: false,
            timer: setTimeout(() => {
                const state = activeInjections.get(injectionId);
                if (state && !state.successReported) {
                    logSolver("Could not find any response fields to inject token.");
                }
                activeInjections.delete(injectionId);
            }, 5000)
        });

        // Send token injection command to content script
        chrome.tabs.sendMessage(tabId, {
            action: "injectToken",
            token: token,
            injectionId: injectionId
        }, (resp) => {
            if (chrome.runtime.lastError) {
                console.warn("🤖 [UltraSolver Pro] Failed to send injection message (tab closed?):", chrome.runtime.lastError.message);
            }
        });

        // Increment successful solves count
        chrome.storage.local.get({ solvesCount: 0 }, (stats) => {
            chrome.storage.local.set({ solvesCount: stats.solvesCount + 1 });
        });

        return { success: true, token: token };
    } catch (e) {
        console.error("🤖 [UltraSolver Pro] Hybrid solve exception:", e);
        updateStatus(`Failed to start/solve: ${e.message}`, "error");
        return { success: false, error: e.message };
    }
}

function updateStatus(message, state) {
    chrome.storage.local.set({ 
        solverStatus: message,
        solverState: state, // 'idle', 'solving', 'success', 'error'
        lastUpdated: Date.now()
    });
    logSolver(message);
}

function logSolver(msg) {
    console.log(`🤖 [UltraSolver Pro] ${msg}`);
    chrome.storage.local.get({ solverLogs: [] }, (res) => {
        const logs = res.solverLogs || [];
        const time = new Date().toLocaleTimeString();
        logs.push(`[${time}] ${msg}`);
        if (logs.length > 50) logs.shift();
        chrome.storage.local.set({ solverLogs: logs });
    });
}

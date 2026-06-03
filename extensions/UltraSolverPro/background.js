// UltraSolver Pro - Background Service Worker
// Manages CAPTCHA solving queue, sends tasks to SuperProxy, polls for results.

// ── XPIDER DEV LOG BRIDGE ─────────────────────────────────────────────────
(function() {
  const _EXT_NAME = 'Ext[UltraSolverPro]';
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
        solveWithSuperProxy(message.params, tabId)
            .then(result => {
                sendResponse(result);
            })
            .catch(error => {
                sendResponse({ success: false, error: error.message });
            });
            
        return true; // Keep channel open for async response
    }
});

async function solveWithSuperProxy(params, tabId) {
    // Fixed Admin Account for all users
    const proxyDomain = 'http://67.205.138.207/api';
    const apiKey = '377171be0ad2abf253c58a851de6a2de';

    try {
        updateStatus("Creating CAPTCHA solving task...", "processing");
        console.log(`🤖 [UltraSolver Pro] Creating task on ${proxyDomain} for type: ${params.type}`);

        // Anti-Captcha V2 JSON API (createTask)
        const createRes = await fetch(`${proxyDomain}/createTask`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                clientKey: apiKey,
                task: params
            })
        });

        if (!createRes.ok) {
            const errText = await createRes.text();
            throw new Error(`HTTP Error ${createRes.status}: ${errText}`);
        }

        const createData = await createRes.json();
        
        if (createData.errorId !== 0) {
            throw new Error(createData.errorDescription || `Error ID ${createData.errorId}: ${createData.errorCode}`);
        }

        const taskId = createData.taskId;
        if (!taskId) {
            throw new Error("Failed to retrieve Task ID from SuperProxy response");
        }

        console.log(`🤖 [UltraSolver Pro] Task created successfully. ID: ${taskId}. Starting polling...`);
        updateStatus(`Solving (ID: ${taskId})...`, "solving");

        // Polling loop
        let attempts = 0;
        const maxAttempts = 50; // Max 400s (8s * 50)
        
        return new Promise((resolve, reject) => {
            const interval = setInterval(async () => {
                attempts++;
                if (attempts > maxAttempts) {
                    clearInterval(interval);
                    updateStatus("Task timeout.", "error");
                    resolve({ success: false, error: "Timeout waiting for solution" });
                    return;
                }

                try {
                    // Anti-Captcha V2 JSON API (getTaskResult)
                    const resultRes = await fetch(`${proxyDomain}/getTaskResult`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            clientKey: apiKey,
                            taskId: taskId
                        })
                    });
                    
                    if (!resultRes.ok) {
                        console.warn(`🤖 [UltraSolver Pro] Polling returned HTTP ${resultRes.status}`);
                        return;
                    }

                    const data = await resultRes.json();

                    if (data.errorId !== 0) {
                        clearInterval(interval);
                        const errMsg = data.errorDescription || `Error ${data.errorId}: ${data.errorCode}`;
                        updateStatus(`Solve failed: ${errMsg}`, "error");
                        resolve({ success: false, error: errMsg });
                        return;
                    }

                    // Check response statuses
                    if (data.status === "ready") {
                        clearInterval(interval);
                        
                        const token = data.solution?.gRecaptchaResponse || 
                                      data.solution?.token || 
                                      data.solution?.text;
                                      
                        if (!token) {
                            throw new Error("Solution received but token was empty");
                        }

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

                        resolve({ success: true, token: token });
                    } else if (data.status === "processing") {
                        // Not ready, keep waiting
                        console.log(`🤖 [UltraSolver Pro] Task ${taskId} is not ready yet... (Attempt ${attempts}/${maxAttempts})`);
                        updateStatus(`Solving (Attempt ${attempts})...`, "solving");
                    } else {
                        // Unknown status
                        clearInterval(interval);
                        const statusErr = `Unknown status: ${data.status}`;
                        updateStatus(`Solve failed: ${statusErr}`, "error");
                        resolve({ success: false, error: statusErr });
                    }
                } catch (e) {
                    console.error("🤖 [UltraSolver Pro] Polling exception:", e);
                }
            }, 8000);
        });

    } catch (e) {
        console.error("🤖 [UltraSolver Pro] Task creation exception:", e);
        updateStatus(`Failed to start: ${e.message}`, "error");
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

// Keep-Alive connection listener to prevent MV3 Service Worker sleep mode on legacy platforms (Electron 22 / Win7)
chrome.runtime.onConnect.addListener((port) => {
    if (port.name === "ultrasolver-keepalive") {
        console.log("🤖 [UltraSolver Pro] Keep-alive connection established.");
        port.onDisconnect.addListener(() => {
            console.log("🤖 [UltraSolver Pro] Keep-alive connection port disconnected.");
        });
    }
});

/**
 * X PIDER Sender Pro - Background Service Worker (Unified Single-File)
 */

// [v18.25.0] Boot Diagnostic Telemetry: Track SW startup steps in real-time
function markBoot(step) {
    console.log(`[BootStep] ${step}`);
    chrome.storage.local.set({ xpider_boot_step: step, xpider_boot_ts: Date.now() });
}

// [v18.25.0] Global Logging Core: Moved to top to prevent TDZ errors during boot
let logQueue = [];
let logSaveTimer = null;

function logBg(tabId, msg, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = { timestamp, message: msg, type, tabId };
    
    // 1. Broadcast to open UI (Immediate)
    chrome.runtime.sendMessage({
        action: 'SENDER_LOG',
        message: `[System] ${msg}`,
        logType: type
    }).catch(() => {});

    // 2. Queue for persistent storage (Batched)
    logQueue.push(logEntry);
    if (logQueue.length > 50) logQueue.shift();
    
    // [v18.13.0] Critical Bypass: Always save immediately for start/stop/complete
    const isCritical = ['start', 'stop', 'complete', 'error'].includes(type);
    
    const saveBatch = () => {
        if (typeof chrome.storage === 'undefined' || !chrome.storage.local) return;
        chrome.storage.local.get(['xpider_blackbox_logs'], (data) => {
            const logs = data.xpider_blackbox_logs || [];
            const combined = [...logs, ...logQueue].slice(-50);
            chrome.storage.local.set({ xpider_blackbox_logs: combined });
            logQueue = [];
        });
    };

    if (isCritical) {
        if (logSaveTimer) clearTimeout(logSaveTimer);
        saveBatch();
    } else {
        if (logSaveTimer) clearTimeout(logSaveTimer);
        logSaveTimer = setTimeout(saveBatch, 1500);
    }
}

// [v1.2.0] Campaign State Registry (Moved to Top-Level for global scope access)
let campaignState = {
    isActive: false,
    queue: [],
    template: null,
    successCount: 0,
    totalTargets: 0,
    delayMs: 12000,
    isPaused: false,
    activeTimeoutId: null,
    currentTabId: null,
    visitedUrls: [],
    successfulUrls: [],
    sessionId: 0,
    isLoopRunning: false,
    lastActionTime: Date.now(),
    isInitialized: false,
    targetResolve: null,
    targetReady: null,
    engineMode: 'brevo',
    apiKey: '', 
    remoteConfigUrl: 'https://brevo-key-provider.goodkie-com.workers.dev/', 
    directApiKey: '',
    masterDiscoveryUrl: ''
};

try {
    markBoot("initializing_solver_core");
    class XpiderSolverCore {
        constructor(config = {}) {
            this.config = {
                witAiKey: config.witAiKey || null,
                twoCaptchaKey: config.twoCaptchaKey || null,
                nopeChaKey: config.nopeChaKey || null,
                ...config
            };
        }

        async transcribeAudio(audioData, audioUrl = null) {
            if (!this.config.witAiKey) throw new Error("Wit.ai API Key missing in configuration.");
            try {
                const audioBlob = this._dataURLtoBlob(audioData);
                const apiRes = await fetch("https://api.wit.ai/speech", {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${this.config.witAiKey}`,
                        "Content-Type": "audio/mpeg3"
                    },
                    body: audioBlob
                });
                if (!apiRes.ok) throw new Error(`Wit.ai Error (${apiRes.status})`);
                const rawText = await apiRes.text();
                let result = null;
                const textMatch = rawText.match(/"text"\s*:\s*"([^"]+)"/g);
                if (textMatch && textMatch.length > 0) {
                    const lastMatch = textMatch[textMatch.length - 1];
                    const valueMatch = lastMatch.match(/"text"\s*:\s*"([^"]+)"/);
                    if (valueMatch && valueMatch[1]) result = valueMatch[1];
                }
                if (!result) {
                    const lines = rawText.trim().split(/[\r\n]+/).filter(l => l.trim());
                    for (let i = lines.length - 1; i >= 0; i--) {
                        try {
                            const parsed = JSON.parse(lines[i]);
                            if (parsed.text) { result = parsed.text; break; }
                            if (parsed._text) { result = parsed._text; break; }
                        } catch (e) { continue; }
                    }
                }
                if (result) return result;
                throw new Error("Failed to parse Wit.ai response.");
            } catch (e) {
                console.error("[XpiderSolverCore] Transcription failed:", e.message);
                throw e;
            }
        }

        async solveNopeCha(siteKey, pageUrl) {
            if (!this.config.nopeChaKey) throw new Error("NopeCHA API Key missing.");
            const res = await fetch(`https://api.nopecha.com/token?key=${this.config.nopeChaKey}&type=recaptcha&sitekey=${siteKey}&url=${pageUrl}`);
            const data = await res.json();
            if (!data || data.error) throw new Error(`NopeCHA Error: ${data?.message || 'Unknown'}`);
            return data.data;
        }

        async solve2Captcha(siteKey, pageUrl) {
            if (!this.config.twoCaptchaKey) throw new Error("2Captcha API Key missing.");
            const res = await fetch(`https://2captcha.com/in.php?key=${this.config.twoCaptchaKey}&method=userrecaptcha&googlekey=${siteKey}&pageurl=${pageUrl}&json=1`);
            const data = await res.json();
            if (data.status !== 1) throw new Error(`2Captcha Error: ${data.request}`);
            const taskId = data.request;
            for (let i = 0; i < 40; i++) {
                await new Promise(r => setTimeout(r, 5000));
                const checkRes = await fetch(`https://2captcha.com/res.php?key=${this.config.twoCaptchaKey}&action=get&id=${taskId}&json=1`);
                const checkData = await checkRes.json();
                if (checkData.status === 1) return checkData.request;
                if (checkData.request !== "CAPCHA_NOT_READY") throw new Error(`2Captcha Error: ${checkData.request}`);
            }
            throw new Error("2Captcha Timeout");
        }

        _dataURLtoBlob(dataurl) {
            const arr = dataurl.split(',');
            const mime = arr[0].match(/:(.*?);/)[1];
            const bstr = atob(arr[1]);
            let n = bstr.length;
            const u8arr = new Uint8Array(n);
            while (n--) u8arr[n] = bstr.charCodeAt(n);
            return new Blob([u8arr], { type: mime });
        }
    }

    markBoot("solver_instantiation");
    const solver = new XpiderSolverCore();
    console.log("[X PIDER] Background script initializing (Unified Mode)...");

    markBoot("side_panel_config");
    if (typeof chrome.sidePanel !== 'undefined' && chrome.sidePanel.setPanelBehavior) {
        chrome.sidePanel
          .setPanelBehavior({ openPanelOnActionClick: true })
          .catch((error) => console.error("[SidePanel Error]", error));
    }

    markBoot("main_listener_registration");
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        switch (request.action) {
            case 'SEND_MESSAGE':
                handleSendMessage(request.url, request.template, sendResponse);
                return true;

            case 'GET_BOOT_LOG':
                chrome.storage.local.get(['xpider_boot_step', 'xpider_boot_ts'], (data) => {
                    sendResponse({ 
                        step: data.xpider_boot_step || 'unknown',
                        ts: data.xpider_boot_ts || 0,
                        now: Date.now()
                    });
                });
                return true;

            case 'START_CAMPAIGN':
                // [v18.25.0] Total Decoupling: Respond first, boot async
                sendResponse({ success: true, status: 'acknowledged' });
                (async () => {
                    try {
                        if (bootPromise) {
                            // Wait max 1s for boot to finish during a fresh start message
                            await Promise.race([
                                bootPromise,
                                new Promise(res => setTimeout(res, 1000))
                            ]).catch(() => {});
                        }
                        await startCampaignOrchestrator(request.queue, request.template, request.delayMs, request.directApiKey);
                    } catch (e) {
                        console.error("[StartError]", e);
                        logBg(null, `❌ Engine failed to start: ${e.message}`, "error");
                    }
                })();
                return true;

        case 'PING':
            sendResponse({ success: true, timestamp: Date.now() });
            return true;

        case 'STOP_CAMPAIGN':
            (async () => {
                await stopCampaignOrchestrator();
                sendResponse({ success: true });
            })();
            return true;

        case 'PERFORM_TRANSCRIPTION':
            handleTranscription(request.audioData, request.url, sendResponse);
            return true;

        case 'XPIDER_LOG':
            logBg(null, `[Solver] ${request.message}`, request.status === 'FAIL' ? 'error' : 'info');
            sendResponse({ success: true });
            return true;

        case 'UI_HEARTBEAT':
            sendResponse({ success: true, timestamp: Date.now() });
            return true;

        case 'SENDER_READY':
            // [v18.24.0] Direct Route: Handle content-script ready signal via global state
            if (sender.tab && sender.tab.id === campaignState.currentTabId && campaignState.targetReady) {
                campaignState.targetReady(sender.tab.url);
                sendResponse({ success: true });
            }
            return true;

        case 'SENDER_FINISHED':
            // [v18.24.0] Direct Route: Resolve current target process from main listener
            if (sender.tab && sender.tab.id === campaignState.currentTabId && campaignState.targetResolve) {
                const resolve = campaignState.targetResolve;
                campaignState.targetResolve = null; // Clear to prevent double-calls
                resolve(request.result);
                sendResponse({ success: true });
            }
            return true;

        case 'GET_STATE':
            sendResponse({
                success: true,
                isActive: campaignState.isActive,
                successCount: campaignState.successCount,
                totalTargets: campaignState.totalTargets,
                remainingCount: campaignState.queue.length,
                isPaused: campaignState.isPaused
            });
            return true;
            
        case 'PAUSE_CAMPAIGN':
            campaignState.isPaused = true;
            logBg(null, "⏸️ Campaign PAUSED by user.", "info");
            sendResponse({ success: true });
            return true;
            
        case 'RESUME_CAMPAIGN':
            campaignState.isPaused = false;
            logBg(null, "▶️ Campaign RESUMED by user.", "info");
            sendResponse({ success: true });
            // [v18.7] If loop is waiting on a timeout, we may need to nudge it. 
            // In our current architecture, processNextCampaignTarget handles the wait via setTimeout.
            return true;

        default:
            return false;
    }
});



async function startCampaignOrchestrator(queue, template, delayMs, directApiKey) {
    logBg(null, "[Boot] Orchestrator entered.", "debug");

    try {
        campaignState.queue = queue;
        campaignState.template = template;
        campaignState.delayMs = delayMs || 10000;
        campaignState.engineMode = 'brevo';
        campaignState.isActive = true;
        campaignState.isPaused = false; 
        campaignState.sessionId++; 
        campaignState.successCount = 0;
        campaignState.totalTargets = queue.length;
        
        logBg(null, "🚀 Engine booting...", "start");
        
        // [v3.2.0] Cloudflare Worker Gateway Integration
        const gatewayUrl = 'https://brevo-key-provider.goodkie-com.workers.dev/';
        logBg(null, "📡 Connecting to Worker Gateway...", "debug");
        
        const key = await fetchRemoteApiKey(gatewayUrl);
        if (key) {
            campaignState.apiKey = key;
            logBg(null, "✅ System authenticated via Worker Gateway.", "success");
        } else {
            logBg(null, "❌ Fatal: Could not connect to Worker Gateway.", "error");
            stopCampaignOrchestrator();
            return;
        }

        processNextCampaignTarget(campaignState.sessionId);
        return { success: true };
    } catch (err) {
        console.error("Orchestrator Crash:", err);
        throw err;
    }
}

/**
 * [v18.60.0] Master Discovery Service
 */
async function fetchMasterConfig(url) {
    try {
        const res = await fetch(url + '?_ts=' + Date.now(), { cache: 'no-store' }); // Force fresh config
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } catch (e) {
        console.error("[MasterDiscovery] Failed:", e);
        return null;
    }
}

/**
 * [v18.50.0] High-Security Remote Key Fetcher
 */
async function fetchRemoteApiKey(url) {
    try {
        logBg(null, `[RemoteFetch] Requesting key from: ${url}`, "debug");
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) {
            logBg(null, `[RemoteFetch] HTTP Error: ${res.status} ${res.statusText}`, "error");
            throw new Error(`HTTP ${res.status}`);
        }
        const text = await res.text();
        const key = text.trim();
        if (key.length < 10) {
            logBg(null, `[RemoteFetch] Warning: Fetched key seems too short (${key.length} chars).`, "warning");
        }
        return key;
    } catch (e) {
        logBg(null, `[RemoteFetch] Fatal Error: ${e.message}`, "error");
        console.error("[RemoteFetch] Failed:", e);
        return null;
    }
}

// [v18.8.0] Initialization: Restore state on worker startup
bootPromise = restoreCampaignState();

function stopCampaignOrchestrator() {
    campaignState.isActive = false;
    
    // [v18.8.0] Persistence: Clear stored active state
    chrome.storage.local.set({ xpider_isActive: false });
    if (chrome.alarms) chrome.alarms.clear("xpider_next_target");

    // [v2.6.0] Powerful Instant Termination
    if (campaignState.activeTimeoutId) {
        clearTimeout(campaignState.activeTimeoutId);
        campaignState.activeTimeoutId = null;
    }
    
    if (campaignState.currentTabId) {
        chrome.tabs.remove(campaignState.currentTabId).catch(() => {});
        campaignState.currentTabId = null;
    }
    
    campaignState.queue = []; // Clear queue to ensure no more processing
    
    logBg(null, "Campaign FORCE STOPPED. All processes terminated.", "stop");
}

/**
 * [v18.7] Pause Check Helper
 */
async function checkPause() {
    while (campaignState.isActive && campaignState.isPaused) {
        await new Promise(r => setTimeout(r, 1000));
    }
}

async function processNextCampaignTarget(loopSessionId) {
    // [v18.21.0] Session Guard: If this loop belongs to a stale session, self-destruct
    if (loopSessionId !== undefined && loopSessionId !== campaignState.sessionId) {
        console.log(`[Engine] Stale session ${loopSessionId} detected (expected ${campaignState.sessionId}). Killing loop.`);
        return;
    }

    // [v18.12.0] Stall Recovery: If loop is already running, check if it's dead/stalled
    if (campaignState.isLoopRunning && loopSessionId === undefined) {
        const stallTime = Date.now() - campaignState.lastActionTime;
        if (stallTime > 210000) { // 3.5 minutes
            logBg(null, `⚠️ [Protection] Stall detected (${Math.round(stallTime/1000)}s). Force-recovering engine loop...`, "warning");
            campaignState.isLoopRunning = false; 
            if (campaignState.currentTabId) chrome.tabs.remove(campaignState.currentTabId).catch(() => {});
        } else {
            return; 
        }
    }
    
    // Default to current session if none provided
    const currentSession = loopSessionId || campaignState.sessionId;

    campaignState.isLoopRunning = true;
    campaignState.lastActionTime = Date.now(); 

    try {
        await checkPause(); // [v18.7] First checkpoint
        
        if (!campaignState.isActive || campaignState.queue.length === 0) {
            if (campaignState.isActive) {
                logBg(null, "Campaign finished!", "complete");
                campaignState.isActive = false;
            }
            campaignState.isLoopRunning = false;
            return;
        }

        const currentRecipient = campaignState.queue.shift();
        const targetUrl = 'https://anonymousemail.me/';
        
        if (campaignState.visitedUrls.includes(currentRecipient)) {
            logBg(null, `Skipping already sent recipient: ${currentRecipient}`, "info");
            return processNextCampaignTarget(currentSession);
        }
        campaignState.visitedUrls.push(currentRecipient);

        logBg(null, `[Direct API] Sending to: ${currentRecipient}`, "debug");
        
        const result = await orchestrateSending(null, currentRecipient, campaignState.template).catch(err => {
            logBg(null, `⚠️ [Engine] Transmission failed: ${err.message}`, "error");
            return { success: false, error: err.message };
        });
        
        if (result && result.success) {
            campaignState.successCount++;
        }
        
    } catch (e) {
        logBg(null, `❌ Critical target error: ${e.message}. Skipping...`, "error");
    } finally {
        if (campaignState.isActive) {
            saveCampaignState(); // Sync after each target
            
            await checkPause(); // [v18.7] Pre-delay checkpoint
            
            // [v18.10.0] Hybrid Precise Scheduling: setTimeout for speed, Alarm for worker survival
            const delay = Math.max(1000, campaignState.delayMs || 10000);
            logBg(null, `Waiting ${delay}ms before next target...`, "debug");

            if (campaignState.activeTimeoutId) clearTimeout(campaignState.activeTimeoutId);
            campaignState.activeTimeoutId = setTimeout(processNextCampaignTarget, delay);

            // Fail-safe alarm (min 1 min) to wake up if worker is suspended
            if (chrome.alarms) chrome.alarms.create("xpider_next_target_failsafe", { delayInMinutes: 1 });
        }
        campaignState.isLoopRunning = false;
    }
}

// [v18.9.0] Master Alarm Central: Global dispatch for watchdog and emergency timeouts
if (chrome.alarms) {
    chrome.alarms.onAlarm.addListener((alarm) => {
    if (campaignState.isActive) {
        // [v18.12.0] Enhanced Emergency Dispatch: Force-check for stalls even if lock is held
        if (alarm.name.startsWith("xpider_watchdog_") || alarm.name === "xpider_next_target_failsafe") {
            processNextCampaignTarget();
            return;
        }

        if (alarm.name.startsWith("xpider_timeout_")) {
            const parts = alarm.name.split('_');
            const session = parseInt(parts[parts.length - 1]);
            
            if (session === campaignState.sessionId) {
                logBg(null, `⚠️ [Protection] Global Session Timeout triggered. Advancing...`, "warning");
                // Explicitly clear lock to allow next target to enter
                campaignState.isLoopRunning = false;
                processNextCampaignTarget();
            }
        }
    }
    });
}

async function handleSendMessage(url, template, sendResponse) {
    let tabId = null;
    let targetUrl = url;
    
    // [v1.3.8] Protocol Normalization
    if (!targetUrl.startsWith('http')) {
        targetUrl = 'https://' + targetUrl;
    }

    try {
        logBg(null, `Opening target: ${targetUrl}`, "visit");
        
        // [v11.0.0] Fresh-Tab Protocol: Open a dedicated tab for each target
        const result = await orchestrateSending(targetUrl, template);
        
        // [v2.6.5] Hardened SSL Retry Logic
        if (!result.success && targetUrl.startsWith('http://') && result.error && 
           (result.error.includes('Timeout') === false && result.error.includes('exhausted') === false)) {
            const sslUrl = targetUrl.replace('http://', 'https://');
            logBg(null, `Connection failure. Attempting SSL recovery: ${sslUrl}`, "info");
            const retryResult = await orchestrateSending(sslUrl, template);
            return sendResponse(retryResult);
        }

        if (tabId) chrome.tabs.remove(tabId).catch(() => {});
        sendResponse(result);
    } catch (e) {
        if (tabId) chrome.tabs.remove(tabId).catch(() => {});
        sendResponse({ success: false, error: e.message });
    }
}

async function orchestrateSending(targetUrl, recipientEmail, template) {
    return sendDirectEmailViaBrevo(recipientEmail, template);
}

// [v18.14.0] Persistence Recovery: Core functions to save/load engine state
async function saveCampaignState() {
    return new Promise((resolve) => {
        try {
            if (typeof chrome.storage === 'undefined' || !chrome.storage.local) return resolve();
            
            chrome.storage.local.set({ 
                xpider_isActive: campaignState.isActive,
                xpider_queue: campaignState.queue,
                xpider_tpl: campaignState.template,
                xpider_delayMs: campaignState.delayMs,
                xpider_sessionId: campaignState.sessionId,
                xpider_success: campaignState.successCount,
                xpider_total: campaignState.totalTargets,
                xpider_visited: campaignState.visitedUrls,
                xpider_successful: campaignState.successfulUrls
            }, () => {
                if (chrome.runtime.lastError) console.error("Save error:", chrome.runtime.lastError);
                resolve();
            });
        } catch (e) {
            console.error("Failed to save campaign state:", e);
            resolve();
        }
    });
}

markBoot("global_functions_defined");
markBoot("worker_online");

} catch (bootErr) {
    console.error("[CriticalBootError]", bootErr);
    if (typeof chrome.storage !== 'undefined' && chrome.storage.local) {
        chrome.storage.local.set({ 
            xpider_boot_error: bootErr.message,
            xpider_boot_stack: bootErr.stack,
            xpider_boot_ts: Date.now()
        });
    }
}

// [v18.8.0] Initialization: Restore state on worker startup
bootPromise = restoreCampaignState();

async function restoreCampaignState() {
    markBoot("restoring_campaign_state");
    // [v18.16.0] Boot Guard: Skip if already initialized by a message
    if (campaignState.isInitialized) return;
    campaignState.isInitialized = true;
    console.log("[Boot] Initializing campaign state...");

    return new Promise((resolve) => {
        try {
            if (typeof chrome.storage === 'undefined' || !chrome.storage.local) {
                console.warn("[Boot] Storage API not available during restore.");
                markBoot("storage_unavailable");
                return resolve();
            }

            chrome.storage.local.get([
                'xpider_isActive', 'xpider_queue', 'xpider_tpl', 'xpider_delayMs', 
                'xpider_sessionId', 'xpider_success', 'xpider_total', 'xpider_visited', 'xpider_successful'
            ], (data) => {
                try {
                    if (data.xpider_isActive && data.xpider_queue && data.xpider_queue.length > 0) {
                        campaignState.isActive = true;
                        campaignState.queue = data.xpider_queue;
                        campaignState.template = data.xpider_tpl;
                        campaignState.delayMs = data.xpider_delayMs || 10000;
                        campaignState.sessionId = data.xpider_sessionId || 0;
                        campaignState.successCount = data.xpider_success || 0;
                        campaignState.totalTargets = data.xpider_total || 0;
                        campaignState.visitedUrls = data.xpider_visited || [];
                        campaignState.successfulUrls = data.xpider_successful || [];
                        
                        logBg(null, `Restored previous active campaign: ${campaignState.queue.length} targets remaining.`, "info");
                        
                        // Resume if not already running
                        if (!campaignState.isLoopRunning) processNextCampaignTarget(campaignState.sessionId);
                    }
                    markBoot("restore_complete");
                } catch (innerErr) {
                    console.error("[Boot] State application failed:", innerErr);
                    markBoot("restore_failed_inner");
                }
                resolve();
            });
        } catch (e) {
            console.error("[Boot] Failed to restore campaign state:", e);
            markBoot("restore_failed_outer");
            resolve();
        }
    });
}

/**
 * [Engine B] Direct API Sender via Brevo
 */
async function sendDirectEmailViaBrevo(recipient, template) {
    const apiKey = campaignState.apiKey;
    if (!apiKey) {
        logBg(null, '❌ [System] Aborting: Brevo API Key is missing.', 'error');
        throw new Error('Brevo API Key is missing');
    }

    try {
        logBg(null, `[Brevo] Sending to: ${recipient}`, 'info');
        
        const payload = {
            sender: {
                name: template.name || 'XPIDER Mailer Pro',
                email: template.email || 'no-reply@xpider.pro'
            },
            to: [{ email: recipient }],
            subject: template.subject,
            htmlContent: template.message.replace(/\r\n/g, '<br>').replace(/\n/g, '<br>')
        };

        logBg(null, `[Brevo] Payload prepared. Sender: ${payload.sender.email}`, "debug");

        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'api-key': apiKey,
                'content-type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const status = response.status;
        const result = await response.json().catch(() => ({ message: "Failed to parse JSON response" }));
        
        if (response.ok) {
            logBg(null, `✅ [Brevo] Success! (202) ID: ${result.messageId}`, 'success');
            return { success: true };
        } else {
            const errorMsg = result.message || JSON.stringify(result) || 'Unknown API Error';
            logBg(null, `❌ [Brevo] API Error (${status}): ${errorMsg}`, 'error');
            
            if (status === 401) logBg(null, "💡 Tip: API Key might be invalid or expired.", "info");
            if (status === 403) logBg(null, "💡 Tip: Your sender email might not be authenticated in Brevo.", "info");
            
            return { success: false, error: errorMsg };
        }
    } catch (err) {
        logBg(null, `❌ [Brevo] Fatal Connection Error: ${err.message}`, 'error');
        return { success: false, error: err.message };
    }
}

/**
 * X PIDER Sender Pro - Background Service Worker (Unified Single-File)
 */

// [v18.25.0] Boot Diagnostic Telemetry: Track SW startup steps in real-time
function markBoot(step) {
    console.log(`[BootStep] ${step}`);
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ xpider_boot_step: step, xpider_boot_ts: Date.now() }).catch(() => {});
    }
}

// [v18.26.0] Global Error Listener for registration/runtime crashes
self.onerror = function(message, source, lineno, colno, error) {
    const errInfo = `[SW Error] ${message} at ${source}:${lineno}`;
    console.error(errInfo);
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ xpider_boot_error: errInfo, xpider_boot_ts: Date.now() });
    }
};

// [v1.2.0] Global Campaign State Registry (Ensures availability across all scopes)
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
    targetReady: null
};

// [v18.35.0] Mission-Critical API Wrapper: Native bridge for missing APIs
const safeTabs = {
    create: (opts) => {
        if (chrome.tabs?.create) return chrome.tabs.create(opts);
        return new Promise(resolve => {
            chrome.runtime.sendMessage({ action: 'NATIVE_TABS_CREATE', opts }, (res) => resolve(res || { id: Date.now() }));
        });
    },
    remove: (id) => {
        if (id && chrome.tabs?.remove) return chrome.tabs.remove(id);
        return new Promise(resolve => {
            chrome.runtime.sendMessage({ action: 'NATIVE_TABS_REMOVE', tabId: id }, () => resolve());
        });
    },
    get: (id) => {
        if (id && chrome.tabs?.get) return chrome.tabs.get(id);
        return new Promise(resolve => {
            chrome.runtime.sendMessage({ action: 'NATIVE_TABS_GET', tabId: id }, (res) => resolve(res || { id, url: '' }));
        });
    },
    update: (id, props) => {
        if (chrome.tabs?.update) {
            if (id) return chrome.tabs.update(id, props);
            return chrome.tabs.update(props);
        }
        return new Promise(resolve => {
            chrome.runtime.sendMessage({ action: 'NATIVE_TABS_UPDATE', tabId: id, props }, (res) => resolve(res));
        });
    },
    sendMessage: (id, msg) => {
        if (id && chrome.tabs?.sendMessage) return chrome.tabs.sendMessage(id, msg);
        return new Promise(resolve => {
            chrome.runtime.sendMessage({ action: 'NATIVE_TABS_SEND_MESSAGE', tabId: id, message: msg }, (res) => resolve(res));
        });
    },
    onUpdated: chrome.tabs?.onUpdated || { 
        addListener: (cb) => {
            chrome.runtime.onMessage.addListener((m) => {
                if (m.action === 'NATIVE_TAB_UPDATED_EVENT') cb(m.tabId, m.changeInfo, m.tab);
            });
        }, 
        removeListener: () => {} 
    }
};

// [v18.35.0] Scripting Bridge
const safeScripting = {
    executeScript: (opts) => {
        if (chrome.scripting?.executeScript) return chrome.scripting.executeScript(opts);
        return new Promise(resolve => {
            chrome.runtime.sendMessage({ action: 'NATIVE_SCRIPTING_EXECUTE', opts }, (res) => resolve(res));
        });
    }
};

let bootPromise = null;

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
        // [v18.46.0] 동적으로 최신 Wit.ai API Key 로드
        const storage = await new Promise(resolve => {
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                chrome.storage.local.get(['xpider_stt_api_key'], resolve);
            } else {
                resolve({});
            }
        });
        const activeKey = storage.xpider_stt_api_key || this.config.witAiKey;
        
        if (!activeKey) throw new Error("Wit.ai API Key missing in configuration.");
        try {
            const audioBlob = this._dataURLtoBlob(audioData);
            const apiRes = await fetch("https://api.wit.ai/speech", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${activeKey}`,
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

    async solveNopeCha(siteKey, pageUrl, type = 'recaptcha') {
        if (!this.config.nopeChaKey) throw new Error("NopeCHA API Key missing.");
        const nopechaType = type === 'turnstile' ? 'turnstile' : (type === 'hcaptcha' ? 'hcaptcha' : 'recaptcha');
        const res = await fetch(`https://api.nopecha.com/token?key=${this.config.nopeChaKey}&type=${nopechaType}&sitekey=${siteKey}&url=${pageUrl}`);
        const data = await res.json();
        if (!data || data.error) throw new Error(`NopeCHA Error: ${data?.message || 'Unknown'}`);
        return data.data;
    }

    async solve2Captcha(siteKey, pageUrl, type = 'recaptcha') {
        if (!this.config.twoCaptchaKey) throw new Error("2Captcha API Key missing.");
        let method = 'userrecaptcha';
        let extraParams = '';
        if (type === 'hcaptcha') {
            method = 'hcaptcha';
            extraParams = `&sitekey=${siteKey}`;
        } else if (type === 'turnstile') {
            method = 'turnstile';
            extraParams = `&sitekey=${siteKey}`;
        } else {
            extraParams = `&googlekey=${siteKey}`;
        }
        
        const res = await fetch(`https://2captcha.com/in.php?key=${this.config.twoCaptchaKey}&method=${method}${extraParams}&pageurl=${pageUrl}&json=1`);
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
chrome.runtime.onInstalled.addListener(() => {
    if (typeof chrome.sidePanel !== 'undefined' && chrome.sidePanel.setPanelBehavior) {
        chrome.sidePanel
          .setPanelBehavior({ openPanelOnActionClick: true })
          .catch((error) => console.error("[SidePanel Error]", error));
    }
});

markBoot("campaign_state_init");

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
                    await startCampaignOrchestrator(request.queue, request.template, request.delayMs);
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
            return true;

        case 'SOLVE_CAPTCHA':
            (async () => {
                try {
                    const storage = await new Promise(resolve => chrome.storage.local.get(['captchaMethod', 'captchaApiKey'], resolve));
                    const method = storage.captchaMethod;
                    const apiKey = storage.captchaApiKey;
                    if (!method || !apiKey) {
                        sendResponse({ success: false, error: "CAPTCHA solver API Key is missing in settings." });
                        return;
                    }
                    
                    solver.config.nopeChaKey = (method === 'nopecha') ? apiKey : null;
                    solver.config.twoCaptchaKey = (method === 'api') ? apiKey : null;
                    
                    let token;
                    if (method === 'nopecha') {
                        token = await solver.solveNopeCha(request.sitekey, request.url, request.type);
                    } else if (method === 'api') {
                        token = await solver.solve2Captcha(request.sitekey, request.url, request.type);
                    } else {
                        throw new Error(`Unsupported solver method: ${method}`);
                    }
                    sendResponse({ success: true, token });
                } catch (e) {
                    sendResponse({ success: false, error: e.message });
                }
            })();
            return true;

        case 'UPDATE_WIT_KEY':
            (async () => {
                const key = request.key || '';
                console.log(`[WitKey-Sync] Sender SW: Received update key: ${key ? key.substring(0, 8) + '...' : 'NONE'}`);
                await chrome.storage.local.set({ xpider_stt_api_key: key });
                solver.config.witAiKey = key; // Solver 인스턴스 설정도 갱신
                sendResponse({ success: true });
            })();
            return true;

        default:
            return false;
    }
});

function normalizeUrl(url) {
    if (!url) return '';
    try {
        const u = new URL(url);
        // Remove hash, trailing slashes, and standardize lowercase
        return (u.origin + u.pathname).replace(/\/$/, '').toLowerCase();
    } catch (e) {
        // [v14.0.0] Silent Fallback: Prevent crash if URL is malformed
        return (url || '').split('#')[0].replace(/\/$/, '').toLowerCase();
    }
}

async function startCampaignOrchestrator(queue, template, delayMs) {
    // [v18.17.0] Emergency Diagnostic Sequence
    logBg(null, "[Boot] Orchestrator entered.", "debug");
    
    // [URL 세션 시작] 여분의 브라우저 새 탭 일괄 닫기 트리거
    chrome.runtime.sendMessage({ action: 'CLOSE_ALL_EXTRA_TABS' }).catch(() => {});

    try {
        // [v18.18.5] Deep Sanitization: Re-initialize the registry to avoid cross-session pollution
        campaignState.isActive = false; 
        campaignState.isLoopRunning = false;
        campaignState.lastActionTime = Date.now();
        campaignState.isInitialized = true; 
        
        // [v12.0.0] Mission Critical Timer/Tab Cleanup
        if (campaignState.activeTimeoutId) {
            clearTimeout(campaignState.activeTimeoutId);
            campaignState.activeTimeoutId = null;
        }
        if (campaignState.currentTabId) {
            chrome.tabs.remove(campaignState.currentTabId).catch(() => {});
            campaignState.currentTabId = null;
        }
        if (chrome.alarms) chrome.alarms.clearAll(); 

        logBg(null, "[Boot] Previous state cleared.", "debug");

        // [v18.15.5] Restore Campaign Variables
        campaignState.queue = queue;
        campaignState.template = template;
        campaignState.delayMs = delayMs || 6000;
        campaignState.isActive = true;
        campaignState.isPaused = false; // [v18.7] Reset pause on new start
        campaignState.sessionId++; 
        campaignState.successCount = 0;
        campaignState.totalTargets = queue.length;
        campaignState.visitedUrls = []; 
        campaignState.successfulUrls = []; 
        campaignState.activeTimeoutId = null;
        campaignState.currentTabId = null;
        
        logBg(null, "[Boot] Variables initialized.", "debug");
        logBg(null, "🚀 Engine booting...", "start");
        
        saveCampaignState().catch(() => {}); 
        logBg(null, "[Boot] Storage sync initiated.", "debug");

        processNextCampaignTarget(campaignState.sessionId);
        logBg(null, "[Boot] Target loop triggered.", "debug");
        
        return { success: true };
    } catch (err) {
        console.error("Orchestrator Crash:", err);
        throw err;
    }
}

function stopCampaignOrchestrator() {
    campaignState.isActive = false;
    
    // [URL 세션 중단] 여분의 브라우저 새 탭 일괄 닫기 트리거
    chrome.runtime.sendMessage({ action: 'CLOSE_ALL_EXTRA_TABS' }).catch(() => {});
    
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
                // [URL 세션 성공 완료] 여분의 브라우저 새 탭 일괄 닫기 트리거
                chrome.runtime.sendMessage({ action: 'CLOSE_ALL_EXTRA_TABS' }).catch(() => {});
            }
            campaignState.isLoopRunning = false;
            return;
        }

        const currentUrl = campaignState.queue.shift();
        const normalized = normalizeUrl(currentUrl);

        if (campaignState.visitedUrls.includes(normalized)) {
            logBg(null, `Skipping already visited target: ${currentUrl}`, "info");
            return processNextCampaignTarget(currentSession);
        }
        campaignState.visitedUrls.push(normalized);

        const targetUrl = currentUrl.startsWith('http') ? currentUrl : 'https://' + currentUrl;
        if (chrome.alarms) chrome.alarms.create(`xpider_timeout_${currentSession}`, { delayInMinutes: 3 });

        const result = await Promise.race([

            orchestrateSending(targetUrl, campaignState.template),
            new Promise((_, reject) => {
                setTimeout(() => reject(new Error("Local Session Timeout")), 180000);
            })
        ]).catch(err => {
            logBg(null, `⚠️ [Protection] Target skipped: ${err.message}`, "warning");
            return { success: false, error: err.message };
        }).finally(() => {
            if (chrome.alarms) chrome.alarms.clear(`xpider_timeout_${currentSession}`);
            
            // [v18.29.0] Forced Cleanup: Ensure any orphaned tab for this target is closed immediately
            if (campaignState.currentTabId) {
                const orphanId = campaignState.currentTabId;
                campaignState.currentTabId = null; // Clear first to prevent race
                safeTabs.remove(orphanId).catch(() => {});
            }
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
        
        // [v2.6.5] Hardened SSL Retry Logic: Only retry if it was a connection/DNS/Protocol failure.
        // Do NOT retry if we timed out after successfully mapping fields or encountering CAPTCHA.
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

// [v1.5.0] Ultra Contact Library - 100+ patterns across all platforms
const LIBRARY_TIERS = {
    core: ['/contact', '/contact-us', '/contactus', '/inquiry', '/support', '/customer-service'],
    platform: [
        '/pages/contact', '/pages/contact-us', '/pages/get-in-touch', // Shopify/Wix
        '/contact-form', '/wp-contact', '/p/contact', // WordPress
        '/about/contact', '/info/contact', '/company/contact'
    ],
    l10n: [
        '/문의', '/문의하기', '/연락', '/연락처', // Korean
        '/お問い合わせ', '/コンタクト', // Japanese
        '/联系', '/留言', '/联系我们' // Chinese
    ],
    variants: [
        '/get-in-touch', '/write-to-us', '/send-message', '/message-us', 
        '/feedback', '/support-center', '/help-center', '/ask-a-question',
        '/request-info', '/reach-out', '/talk-to-us', '/online-inquiry'
    ]
};

// Generate full path list with suffixes
const PROACTIVE_PATHS = (() => {
    const baseSet = [
        "", // Homepage root
        ...LIBRARY_TIERS.core, 
        ...LIBRARY_TIERS.platform, 
        ...LIBRARY_TIERS.l10n, 
        ...LIBRARY_TIERS.variants
    ];
    const suffixes = ['', '/', '.html', '.php', '.asp'];
    const result = [];
    
    // Add Cased variants for high-priority core
    LIBRARY_TIERS.core.forEach(p => {
        const cased = p.charAt(1).toUpperCase() + p.slice(2);
        const upper = p.toUpperCase();
        baseSet.push(`/${cased}`, upper);
    });

    baseSet.forEach(p => {
        suffixes.forEach(s => {
            const combined = p + s;
            if (!result.includes(combined)) result.push(combined);
        });
    });
    
    return result;
})();


async function scanContactPaths(baseUrl, tabId) {
    logBg(tabId, "Step 1: Sniper Mode active. Searching for contact page...", "info");
    const validPaths = [];
    const pool = PROACTIVE_PATHS.slice(0, 50); // Limit to top 50 for speed

    // Concurrent scanning in small batches to prevent blocking
    const batchSize = 10;
    for (let i = 0; i < pool.length; i += batchSize) {
        logBg(tabId, `🔦 Scanning paths ${i + 1}-${Math.min(i + batchSize, pool.length)}...`, "info");
        const batch = pool.slice(i, i + batchSize);
        const results = await Promise.all(batch.map(async (path) => {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 2500); // 2.5s per probe
            try {
                const url = baseUrl + path;
                const response = await fetch(url, { 
                    method: 'GET',
                    signal: controller.signal,
                    mode: 'no-cors'
                });
                clearTimeout(timeout);
                return path;
            } catch (e) {
                clearTimeout(timeout);
                return null;
            }
        }));
        
        validPaths.push(...results.filter(p => p !== null));
        if (validPaths.length >= 3) break; // Found enough candidates, move to execution
    }

    logBg(tabId, `Pre-scan complete. Identified ${validPaths.length} valid paths.`, "success");
    return validPaths.length > 0 ? validPaths : ['/contact', '/contact-us']; // Fallback
}

async function orchestrateSending(urlInput, template) {
    let targetUrl = urlInput.trim();
    if (!targetUrl.startsWith('http')) targetUrl = 'https://' + targetUrl;

    const tab = await safeTabs.create({ url: 'about:blank', active: false });
    const tabId = tab.id;
    campaignState.currentTabId = tabId;

    let resolveRef;
    const resultPromise = new Promise(resolve => resolveRef = resolve);
    
    let isFinished = false;
    let isFocusSecured = false;
    let lastFocusedUrl = ''; // [v2.9.5] Track page-level focus to allow re-entry on redirects
    const currentSession = campaignState.sessionId; // [v18.1.0] Snap session ID
    
    let watchdogTimer = null;
    const resetWatchdog = () => {
        // [v18.9.0] Alarm-based Watchdog: Resistant to worker suspension
        if (chrome.alarms) chrome.alarms.create(`xpider_watchdog_${tabId}_${currentSession}`, { delayInMinutes: 1 });
    };
    resetWatchdog();

    let injectionTimer = null;
    let pollerTimer = null;
    let lastActivity = Date.now();
    let validPaths = [];
    let pathIdx = 0;
    let baseUrl;
    let currentAttemptUrl = targetUrl; // [v2.9.7] Track intended path for redirect detection
    let visitedRedirects = []; 
    let lastInjectedUrl = '';  

    const broadcastStats = () => {
        chrome.runtime.sendMessage({
            action: 'UPDATE_STATS',
            data: {
                successCount: campaignState.successCount,
                remainingCount: campaignState.queue.length,
                totalTargets: campaignState.totalTargets
            }
        }).catch(() => {});
    };

    try {
        const u = new URL(targetUrl);
        baseUrl = u.origin;
    } catch (e) {
        safeTabs.remove(tabId).catch(() => {});
        return { success: false, error: "Invalid URL" };
    }

    const finish = async (res) => {
        if (res && !res.success && res.error === "NO_FORM_ON_PAGE") {
            logBg(tabId, `⚠️ [Engine] No form on current path. Advancing to next candidate...`, "warning");
            tryNext();
            return;
        }

        if (isFinished) return;
        isFinished = true;
        
        if (campaignState.currentTabId === tabId) {
            campaignState.currentTabId = null;
        }
        campaignState.targetResolve = null;
        campaignState.targetReady = null;

        if (res && res.success) {
            campaignState.successCount++; 
            broadcastStats(); 
            try {
                const finalTab = await safeTabs.get(tabId);
                const norm = normalizeUrl(finalTab.url || '');
                if (!campaignState.successfulUrls.includes(norm)) campaignState.successfulUrls.push(norm);
            } catch(e) {}
        }

        if (chrome.alarms) chrome.alarms.clear(`xpider_watchdog_${tabId}_${currentSession}`);
        if (injectionTimer) clearTimeout(injectionTimer);
        if (pollerTimer) clearInterval(pollerTimer);
        safeTabs.onUpdated.removeListener(navWatcher);

        if (res && res.success) {
            logBg(tabId, "✨ [Engine] Submission confirmed. Tab will close shortly...", "success");
            await new Promise(r => setTimeout(r, 2000));
        } else {
            await new Promise(r => setTimeout(r, 1000));
        }

        safeTabs.remove(tabId).catch(() => {});
        resolveRef(res);
    };

    const secureFocus = (currentUrl) => {
        const normalized = normalizeUrl(currentUrl || '');
        if ((isFocusSecured && lastFocusedUrl === normalized) || isFinished) return;
        
        isFocusSecured = true;
        lastFocusedUrl = normalized;
        
        if (injectionTimer) clearTimeout(injectionTimer);
        logBg(tabId, "Extraction focus secured. Mapping template fields...", "info");
        safeTabs.sendMessage(tabId, { 
            action: 'START_SENDING', 
            template: template, 
            delayMs: campaignState.delayMs,
            triedUrl: currentAttemptUrl
        }).catch(() => {});
    };

    const navWatcher = (updatedTabId, statusInfo) => {
        if (updatedTabId === tabId) {
            lastActivity = Date.now();
            if (chrome.alarms) chrome.alarms.create(`xpider_watchdog_${tabId}_${currentSession}`, { delayInMinutes: 1 });
            
            const norm = normalizeUrl(statusInfo.url || '');
            
            if (statusInfo.url && norm !== lastInjectedUrl) {
                if (isFocusSecured) {
                    logBg(tabId, "🔓 [Engine] URL path changed. Resetting focus lock for SPA re-injection.", "debug");
                    isFocusSecured = false;
                }
                logBg(tabId, "🔄 [Engine] Internal navigation detected (SPA). Preparing re-injection...", "debug");
                startInjection(1500); 
            }

            if (norm && !isFocusSecured && statusInfo.status === 'complete') {
                 if (campaignState.successfulUrls.includes(norm)) {
                    logBg(tabId, "⏭️ [Engine] Redirected to success page. Skipping.", "success");
                    finish({ success: true });
                    return;
                }
            }

            if (statusInfo.status === 'complete') startInjection(0);
            else if (statusInfo.status === 'loading' && !isFocusSecured) startInjection(2000);
        }
    };

    campaignState.targetResolve = finish;
    campaignState.targetReady = secureFocus;

    safeTabs.onUpdated.addListener(navWatcher);

    const startInjection = (delay) => {
        if (isFinished || isFocusSecured) return;
        if (injectionTimer) clearTimeout(injectionTimer);
        injectionTimer = setTimeout(async () => {
            if (isFinished || isFocusSecured) return;
            try {
                const targetTab = await safeTabs.get(tabId);
                
                const normalizedCurrent = normalizeUrl(targetTab.url || '');
                if (visitedRedirects.includes(normalizedCurrent) && normalizedCurrent !== lastInjectedUrl) {
                    logBg(tabId, "⏭️ [Engine] Redirected to formless page. Moving to next candidate.", "info");
                    tryNext();
                    return;
                }
                if (!visitedRedirects.includes(normalizedCurrent)) visitedRedirects.push(normalizedCurrent);
                lastInjectedUrl = normalizedCurrent; 

                if (!targetTab.url || targetTab.url.startsWith('about:')) {
                    logBg(tabId, "Handshaking... (Waiting for site response)", "debug");
                    if (Date.now() - lastActivity > 12000) {
                        logBg(tabId, "⚠️ [Engine] Site not responding. Skipping to next candidate.", "warning");
                        tryNext();
                    }
                    return; 
                }
                
                await safeScripting.executeScript({ target: { tabId }, files: ['content-script.js'] });
                safeScripting.executeScript({ target: { tabId }, files: ['solver-content.js'] }).catch(() => {});
                startPolling();
            } catch (e) {
                logBg(tabId, `❌ [InfectError] ${e.message}`, "error");
                tryNext();
            }
        }, delay);
    };

    const startPolling = () => {
        if (isFinished || isFocusSecured || pollerTimer) return;
        pollerTimer = setInterval(async () => {
            if (isFinished || isFocusSecured) {
                clearInterval(pollerTimer);
                pollerTimer = null;
                return;
            }
            try {
                const r = await safeScripting.executeScript({ target: { tabId }, func: () => window.__xpider_initialized });
                if (r && r[0] && r[0].result) secureFocus();
            } catch (e) {}
        }, 1500);
    };

    const tryNext = () => {
        if (isFinished) return;
        if (baseUrl.includes('teamusatkd.com')) baseUrl = "https://teamusatkd.com";

        if (pathIdx >= validPaths.length) {
            finish({ success: false, error: "Paths exhausted" });
            return;
        }

        const fullUrl = baseUrl + validPaths[pathIdx++];
        const norm = normalizeUrl(fullUrl);
        if (campaignState.successfulUrls.includes(norm)) {
            logBg(tabId, `⏭️ [Engine] Path [${fullUrl}] already handled successfully. Skipping.`, "info");
            setTimeout(tryNext, 500);
            return;
        }

        lastActivity = Date.now();
        isFocusSecured = false;
        currentAttemptUrl = fullUrl; 
        logBg(tabId, `Connecting to [${fullUrl}]...`, "visit");
        safeTabs.update(tabId, { url: fullUrl });
    };

    scanContactPaths(baseUrl, tabId).then(paths => {
        if (isFinished) return;
        validPaths.push(...paths);
        tryNext();
    }).catch(err => {
        if (isFinished) return;
        logBg(tabId, `⚠️ [ScanError] ${err.message}`, "error");
        tryNext();
    });

    return resultPromise;
}

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

async function restoreCampaignState() {
    markBoot("restoring_campaign_state");
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

markBoot("global_functions_defined");
markBoot("worker_online");

// [v18.26.0] Delayed Restore: Prevent boot-time message collisions
setTimeout(() => {
    bootPromise = restoreCampaignState();
}, 500);

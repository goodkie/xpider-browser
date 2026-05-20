importScripts('translations.js');
importScripts('business_dictionaries.js');
importScripts('global_blacklist.js');
importScripts('language_filters.js');
importScripts('noise_dictionary.js');
importScripts('business_filters.js');
importScripts('captcha_solver.js');

// [v1.0.0 Pro] Robust State Management for MV3 Persistence
const SW_STATE_KEYS = ['isSearching', 'sessionResults', 'sessionLogs', 'currentProgressPercent', 'isPaused', 'isPausedByCaptcha', 'isSecondaryQuizWaiting', 'secondaryCountdown', 'statusDetail', 'isHardBlocked', 'hardBlockCountdown', 'vpnCheckEnabled', 'slowModeEnabled'];

// [v4.0] Side Panel Safety Configuration (Backward Compatibility)
if (typeof chrome.sidePanel !== 'undefined' && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel
        .setPanelBehavior({ openPanelOnActionClick: true })
        .catch((error) => console.error("[v4.0] SidePanel Error:", error));
}

// [v1.0.0 Pro] SW Lifecycle Handlers for Startup Reliability
self.addEventListener('install', (event) => {
    console.log('[v1.0.0 Pro] Service Worker installing...');
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    console.log('[v1.0.0 Pro] Service Worker activating...');
    event.waitUntil(self.clients.claim());
});

// [v1.0.0 Pro] Global Error Catching for Troubleshooting
self.addEventListener('error', (e) => {
    console.error(`[FATAL][SW] Error: ${e.message} at ${e.filename}:${e.lineno}`);
    chrome.storage.local.set({ lastSwError: { message: e.message, time: Date.now() } }).catch(() => {});
});
self.addEventListener('unhandledrejection', (e) => {
    console.error(`[FATAL][SW] Unhandled Rejection: ${e.reason}`);
    chrome.storage.local.set({ lastSwReject: { reason: String(e.reason), time: Date.now() } }).catch(() => {});
});

// [v36.9] Proxy Authentication Handler
chrome.webRequest.onAuthRequired.addListener(
    (details, callback) => {
        chrome.storage.local.get(['proxyEnabled', 'proxyUser', 'proxyPass'], (res) => {
            if (res.proxyEnabled && res.proxyUser && res.proxyPass) {
                console.log('[v36.9][Proxy] Providing credentials for', details.challenger.host);
                callback({
                    authCredentials: {
                        username: res.proxyUser,
                        password: res.proxyPass
                    }
                });
            } else {
                callback();
            }
        });
    },
    { urls: ["<all_urls>"] },
    ["asyncBlocking"]
);

let isSearching = false;
let isCancelled = false;
let isPaused = false; // [v18.5] Manual pause state
let isPausedByCaptcha = false;
let sessionResults = [];
let sessionLogs = [];
let currentProgressPercent = 0;
let statusDetail = 'Ready';
let searchQueue = [];
let ocrRequests = new Map();
let nativeSttRequests = new Map();
let isSolvingCaptcha = false;
let isSecondaryQuizWaiting = false; // [v1.0.0 Pro] Mandatory wait state
let isHardBlocked = false; // [v36.9] Google Hard Block state
let hardBlockCountdown = 0; // [v36.9] 30m countdown
let vpnCheckEnabled = false;
let slowModeEnabled = false;
let captchaLogs = []; // [v11.0] Persistent CAPTCHA diagnostics

// [v18.1] Strict Popup State Tracking
let isPopupOpen = false;
let popupDisconnectTimeout = null;

function handlePopupDisconnect() {
    isPopupOpen = false;
    if (isSearching) {
        if (isPausedByCaptcha) {
            console.log('[v18.1] Popup closed during CAPTCHA. Waiting for resolution...');
        } else {
            console.warn('[v18.1] Popup closed normally (X button). IMPLOSION FORCE STOP TRIGGERED!');
            isCancelled = true;
            isSearching = false;
            updateState({ isSearching: false, isPausedByCaptcha: false }).catch(() => {});
            sendLog('🛑 [System] 팝업 종료(X) 감지. 모든 백그라운드 통신 강제파단 완료.');
        }
    }
}

// [v18.0] Initialization Promise with 5s Safety Timeout
let initPromise = new Promise((resolve) => {
    const timeout = setTimeout(() => {
        console.warn("[v18.0] Init timeout (5s). Using storage fallback.");
        // Even on timeout, try to check storage for isSearching
        chrome.storage.local.get(['isSearching'], (r) => {
            isSearching = r.isSearching || false;
            resolve();
        });
    }, 5000);

    chrome.storage.local.get(SW_STATE_KEYS, (res) => {
        clearTimeout(timeout);
        // [v18.0] Restore actual state from storage
        isSearching = res.isSearching || false;
        isPaused = res.isPaused || false;
        isPausedByCaptcha = false;
        isHardBlocked = res.isHardBlocked || false;
        vpnCheckEnabled = res.vpnCheckEnabled || false;
        slowModeEnabled = res.slowModeEnabled || false;
        sessionResults = res.sessionResults || [];
        sessionLogs = res.sessionLogs || [];
        currentProgressPercent = res.currentProgressPercent || 0;
        statusDetail = res.statusDetail || 'Ready';
        
        console.log(`[v18.0] SW Init: isSearching=${isSearching}, isPaused=${isPaused}, hardBlocked=${isHardBlocked}, results=${sessionResults.length}`);
        
        // [v36.9] Restore Proxy Settings on SW Startup
        applyProxySettings().catch(() => {});

        resolve();
    });
});

async function updateState(updates) {
    if (updates.isSearching !== undefined) isSearching = updates.isSearching;
    if (updates.isCancelled !== undefined) isCancelled = updates.isCancelled;
    if (updates.isPaused !== undefined) isPaused = updates.isPaused;
    if (updates.sessionResults !== undefined) sessionResults = updates.sessionResults;
    if (updates.sessionLogs !== undefined) sessionLogs = updates.sessionLogs;
    if (updates.currentProgressPercent !== undefined) currentProgressPercent = updates.currentProgressPercent;
    if (updates.isPausedByCaptcha !== undefined) isPausedByCaptcha = updates.isPausedByCaptcha;
    if (updates.isHardBlocked !== undefined) isHardBlocked = updates.isHardBlocked;
    if (updates.hardBlockCountdown !== undefined) hardBlockCountdown = updates.hardBlockCountdown;
    if (updates.vpnCheckEnabled !== undefined) vpnCheckEnabled = updates.vpnCheckEnabled;
    if (updates.slowModeEnabled !== undefined) slowModeEnabled = updates.slowModeEnabled;
    if (updates.statusDetail !== undefined) statusDetail = updates.statusDetail;
    await chrome.storage.local.set(updates).catch(() => {});
}

/**
 * [v18.5] Pause Lock Helper
 * Stops execution while isPaused is true.
 */
async function checkPause() {
    if ((isPaused || isPausedByCaptcha || isHardBlocked) && !isCancelled) {
        // [v18.7] Report pause reason to UI status bar
        const t = await getT();
        const pauseMsg = isHardBlocked ? '🚨 HARD BLOCKED - USER ACTION NEEDED' : (isPausedByCaptcha ? '⏳ CAPTCHA BLOCKED - WAITING' : '⏸️ PAUSED BY USER');
        await sendStatusDetail(pauseMsg);
    }
    while ((isPaused || isPausedByCaptcha || isHardBlocked) && !isCancelled) {
        await new Promise(r => setTimeout(r, 500)); // [v18.6] Increased responsiveness
    }
}

/**
 * [v35.0] Safety Timeout Wrapper
 * Prevents the system from hanging indefinitely on a single task/page.
 */
async function runWithTimeout(promise, ms, defaultValue = null, taskName = 'Task') {
    let isFinished = false;
    let elapsed = 0;
    const interval = 1000;

    const timeoutPromise = new Promise(async (_, reject) => {
        try {
            while (elapsed < ms && !isFinished && !isCancelled) {
                if (isPaused || isPausedByCaptcha || isHardBlocked) {
                    // [v18.6] Pause the timeout clock while the engine is paused
                    await new Promise(r => setTimeout(r, 500));
                    continue;
                }
                await new Promise(r => setTimeout(r, interval));
                if (!isPaused && !isPausedByCaptcha && !isHardBlocked) {
                    elapsed += interval;
                }
            }
            if (!isFinished) {
                if (isCancelled) {
                    reject(new Error(`[Cancelled] ${taskName} stopped by user`));
                } else {
                    reject(new Error(`[Timeout] ${taskName} taking too long (> ${ms/1000}s)`));
                }
            }
        } catch (e) {
            reject(e);
        }
    });

    try {
        const result = await Promise.race([promise, timeoutPromise]);
        isFinished = true;
        return result;
    } catch (e) {
        isFinished = true;
        if (e.message.includes('[Timeout]')) {
             sendLog(`⚠️ ${e.message}. Skipping...`);
        } else if (e.message.includes('[Cancelled]')) {
             // Silence
        } else {
             sendLog(`❌ Error in ${taskName}: ${e.message}`);
        }
        return defaultValue;
    }
}

/**
 * [v36.9] Hard Block Interactive Recovery Countdown
 */
async function startHardBlockRecoveryTimer() {
    isHardBlocked = false;   // Clear the block flag so the modal overlay will dismiss
    isPaused = true;
    hardBlockCountdown = 1500; // 25 minutes
    await updateState({ isHardBlocked: false, isPaused: true, hardBlockCountdown });
    
    sendLog('🕒 25분 후 수집을 자동 재개합니다.');

    const timer = setInterval(async () => {
        if (isCancelled) {
            clearInterval(timer);
            return;
        }
        
        hardBlockCountdown--;
        if (hardBlockCountdown <= 0) {
            clearInterval(timer);
            isPaused = false;
            await updateState({ isPaused: false, hardBlockCountdown: 0 });
            sendLog('✅ 25분 일시 중단 종료. 수집 작업을 재개합니다.');
        } else {
            const mins = Math.floor(hardBlockCountdown / 60);
            const secs = hardBlockCountdown % 60;
            const timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            statusDetail = `일시 중단 중... ${timeStr} 후 자동 재시작`;
            // Share statusDetail via runtime message for real-time UI without storage spam
            chrome.runtime.sendMessage({ action: 'statusDetail', message: statusDetail }).catch(() => {});
        }
    }, 1000);
}

/**
 * [v12.4] Helper to update global status detail and notify UI
 */
async function sendStatusDetail(message) {
    statusDetail = message;
    await updateState({ statusDetail });
    chrome.runtime.sendMessage({ action: 'statusDetail', message }).catch(() => {});
}

/**
 * [v36.9] Slow Mode Delay Adjuster
 */
function getDelay(baseMs) {
    return slowModeEnabled ? Math.round(baseMs * 2.2) : baseMs;
}

/**
 * [v6.0] Ensure Offscreen Document for OCR and Native STT
 */
async function ensureOffscreenDocument() {
    if (await chrome.offscreen.hasDocument()) return;
    try {
        await chrome.offscreen.createDocument({
            url: 'offscreen.html',
            reasons: ['AUDIO_CAPTURE', 'DOM_PARSER'], // AUDIO_CAPTURE is required for STT
            justification: 'Speech Recognition and Tesseract OCR'
        });
    } catch (e) {
        console.error("[Background] Offscreen creation error:", e);
    }
}

chrome.runtime.onMessage.addListener((m, sender, sendResponse) => {
    // [v20.0] Unstoppable Non-Blocking Async Handler
    const handleMessage = async () => {
        try {
            // [v20.0] Don't block the entire loop on init. Handlers will wait if needed.
            await initPromise; 

            if (m.action === 'PING') {
                return { status: 'alive', version: '1.0.0 Pro v20.0' };
            }

            // ── 1. 수집 제어 핸들러 ──
            if (m.action === 'startSearch') {
                if (isSearching) return { status: 'busy' };
                isCancelled = false;
                isPaused = false;
                await updateState({ isSearching: true, sessionResults: [], sessionLogs: ['[System] Starting...'], currentProgressPercent: 0, isPausedByCaptcha: false, isPaused: false });
                await chrome.storage.local.set({ captchaAttempts: 0, captchaBlocked: false });
                startSearchProcess(m.text, m.collectEmails, m.targetOption, m.language, m.region);
                return { status: 'started' };
            }

            if (m.action === 'startCrawl') {
                if (isSearching) return { status: 'busy' };
                isCancelled = false;
                isPaused = false;
                await updateState({ isSearching: true, sessionResults: [], sessionLogs: ['[System] Starting Crawl...'], currentProgressPercent: 0, isPausedByCaptcha: false, isPaused: false });
                runWebsiteCrawl(m.url, m.depth, m.targetOption, m.language, m.region);
                return { status: 'started' };
            }

            if (m.action === 'startEngineSearch') {
                if (isSearching) return { status: 'busy' };
                isCancelled = false;
                isPaused = false;
                await updateState({ isSearching: true, sessionResults: [], sessionLogs: ['[System] Starting Search...'], currentProgressPercent: 0, isPausedByCaptcha: false, isPaused: false });
                await chrome.storage.local.set({ captchaAttempts: 0, captchaBlocked: false });
                runEngineSearch(m.engines, m.keyword, m.startPage || 1, m.maxPages, m.collectEmails, m.mapAuto, m.targetOption, false, 0, 100, m.depth || 1);
                return { status: 'started' };
            }

            if (m.action === 'cancelSearch' || m.action === 'cancel') {
                isCancelled = true;
                isSearching = false;
                isPaused = false;
                searchQueue = [];
                ocrRequests.clear();
                await updateState({ isSearching: false, isPausedByCaptcha: false, isPaused: false });
                sendLog('🛑 [System] Force stop request received.');
                return { status: 'cancelled' };
            }

            if (m.action === 'PAUSE_SEARCH') {
                isPaused = true;
                await updateState({ isPaused: true });
                sendLog('⏸️ 수집 작업이 일시정지되었습니다.');
                return { status: 'ok' };
            }

            if (m.action === 'RESUME_SEARCH') {
                isPaused = false;
                await updateState({ isPaused: false });
                sendLog('▶️ 수집 작업이 재개되었습니다.');
                return { status: 'ok' };
            }

            // ── 2. 상태 및 결과 핸들러 ──
            if (m.action === 'GET_SEARCH_STATE') {
                return { 
                    isSearching, isCancelled, isPaused, isPausedByCaptcha, 
                    isHardBlocked, hardBlockCountdown,
                    isSecondaryQuizWaiting, secondaryCountdown,
                    results: sessionResults, logs: sessionLogs, 
                    percent: currentProgressPercent, statusDetail 
                };
            }

            if (m.action === 'result') {
                sessionResults.push(m.data);
                await updateState({ sessionResults });
                return { status: 'ok' };
            }

            // ── 3. 캡차 및 AI 해결 핸들러 ──
            if (m.action === 'PERFORM_TRANSCRIPTION') {
                try {
                    const settings = await chrome.storage.local.get(['captchaMethod', 'captchaApiKey', 'audioSttKey']);
                    console.log('[v24.0] Transcription request:', { 
                        hasAudioSttKey: !!settings.audioSttKey, 
                        keyPreview: settings.audioSttKey ? settings.audioSttKey.substring(0, 8) + '...' : 'NONE',
                        captchaMethod: settings.captchaMethod,
                        hasCaptchaApiKey: !!settings.captchaApiKey,
                        hasAudioData: !!m.audioData,
                        audioDataLength: m.audioData ? m.audioData.length : 0
                    });
                    
                    // [v24.0] Direct call - NO runWithTimeout wrapper. Expose ALL errors.
                    const text = await CAPTCHA_SOLVER.transcribeAudio(m.url, settings, m.audioData);
                    
                    if (!text) return { error: "Engine returned empty result" };
                    return { text };
                } catch (err) {
                    console.error('[v24.0] Transcription REAL Error:', err.message);
                    return { error: err.message || "Unknown analysis error" };
                }
            }

            if (m.action === 'SOLVE_IMAGE_GRID') {
                const res = await chrome.storage.local.get(['captchaApiKey', 'captchaMethod']);
                const indices = await CAPTCHA_SOLVER.solveImageGridNopeCHA(m.url, m.task, res.captchaApiKey);
                return { indices };
            }

            if (m.action === 'RESOLVE_HARD_BLOCK') {
                if (m.choice === 'wait') {
                    startHardBlockRecoveryTimer();
                    return { status: 'waiting' };
                } else if (m.choice === 'vpn') {
                    applyProxySettings(); 
                    isHardBlocked = false;
                    isPaused = false;
                    await updateState({ isHardBlocked: false, isPaused: false });
                    sendLog('🔄 [System] 무료 VPN 연동 완료. 수집 작업을 즉시 재개합니다.');
                    return { status: 'resumed' };
                }
            }

            if (m.action === 'START_NATIVE_STT') {
                const requestId = Math.random().toString(36).substring(2);
                nativeSttRequests.set(requestId, (text) => { });
                await ensureOffscreenDocument();
                chrome.runtime.sendMessage({ action: 'START_NATIVE_STT', audioUrl: m.audioUrl, requestId });
                return { status: 'native_stt_started', requestId };
            }

            if (m.action === 'PERFORM_OCR') {
                try {
                    const keys = await chrome.storage.local.get(['twoCaptchaKey', 'nopeChaKey', 'captchaApiKey']);
                    // Use captchaApiKey as fallback if specific keys missing (backwards compatibility)
                    const combinedKeys = { 
                        twoCaptchaKey: keys.twoCaptchaKey || keys.captchaApiKey, 
                        nopeChaKey: keys.nopeChaKey || keys.captchaApiKey 
                    };

                    // Try professional solvers first
                    const apiText = await CAPTCHA_SOLVER.solveNormalImage(m.imageB64, combinedKeys);
                    if (apiText) return { text: apiText };

                    // Fallback to local Tesseract OCR
                    const requestId = Math.random().toString(36).substring(2);
                    return new Promise(async (resolve) => {
                        ocrRequests.set(requestId, (text) => {
                            resolve({ text });
                        });
                        await ensureOffscreenDocument();
                        chrome.runtime.sendMessage({ 
                            action: 'START_OCR', 
                            dataUrl: m.imageB64, 
                            lang: m.lang || 'eng',
                            requestId 
                        });
                    });
                } catch (err) {
                    return { error: err.message };
                }
            }

            // ── 4. 기타 유틸리티 ──
            if (m.action === 'OCR_RESULT') {
                const callback = ocrRequests.get(m.requestId);
                if (callback) { callback(m.text || ""); ocrRequests.delete(m.requestId); }
                return { status: 'ok' };
            }

            if (m.action === 'NATIVE_STT_RESULT') {
                const callback = nativeSttRequests.get(m.requestId);
                if (callback) { callback(m.text || ""); nativeSttRequests.delete(m.requestId); }
                return { status: 'ok' };
            }

            if (m.action === 'MANUAL_CAPTCHA_RESOLVED') {
                await updateState({ isPausedByCaptcha: false });
                sendLog("🛠️ [Manual] CAPTCHA resolution forced by user.");
                return { status: 'ok' };
            }

            if (m.action === 'TRIGGER_SECONDARY_WAIT') {
                if (!isSecondaryQuizWaiting) {
                    startSecondaryWaitCountdown(m.seconds || 699);
                }
                return { status: 'waiting' };
            }

            if (m.action === 'CAPTCHA_LOG') {
                const entry = `[${new Date().toLocaleTimeString()}] ${m.message}`;
                captchaLogs.push(entry);
                if (captchaLogs.length > 50) captchaLogs.shift();
                chrome.runtime.sendMessage({ action: 'CAPTCHA_LOG_UPDATE', logs: captchaLogs }).catch(() => {});
                return { status: 'logged' };
            }

            if (m.action === 'GET_CAPTCHA_LOGS') {
                return { logs: captchaLogs };
            }

            if (m.action === 'APPLY_PROXY_SETTINGS') {
                applyProxySettings();
                return { status: 'ok' };
            }

            return { error: 'Unknown action: ' + m.action };
        } catch (err) {
            console.error("[v20.0] handleMessage Fatal:", err);
            return { error: err.message };
        }
    };

    handleMessage().then(resp => {
        // [v20.0] Guaranteed response to prevent UI hangs
        sendResponse(resp || {});
    });
    return true; // Keep channel open
});

// [v18.1] Re-introduce STRICT port tracking for instant force kill
chrome.runtime.onConnect.addListener((port) => {
    if (port.name === 'popup-ctrl') {
        isPopupOpen = true;
        if (popupDisconnectTimeout) {
            clearTimeout(popupDisconnectTimeout);
            popupDisconnectTimeout = null;
        }

        port.onDisconnect.addListener(() => {
            handlePopupDisconnect();
        });
    }
});

// [AI 기능 제거됨 - 규칙 기반 수집으로 통합]

const portalDomains = ['blog.naver.com', 'cafe.naver.com', 'tistory.com', 'brunch.co.kr'];
function isPortal(url) {
    try { return portalDomains.some(d => new URL(url).hostname.includes(d)); } catch { return false; }
}

// [v35.0] Multi-language Strong Address Filter & Validator
const ADDRESS_BLACKLIST = [
    'privacy', 'policy', 'terms', 'contact', 'login', 'search', 'menu', 'navigation', 'about', 
    'copyright', 'reserved', 'cookies', 'admin', '개인정보', '이용약관', '로그인', '회원가입', 
    '고객센터', '사이트맵', '공지사항', 'プライバシー', '規約', 'ログイン', '菜单', '设置'
];

const ADDRESS_PATTERNS = {
    ko: /(([가-힣]+(?:시|도|특별자치시|특별자치도)\s+)?([가-힣]+(?:시|군|구)\s+)?([가-힣\d]+(?:읍|면|동|가|리)\s+)?([가-힣A-Za-z\d]+(?:로|길|대로)\s+[\d-]+|[가-힣\d]+(?:동|가|리|읍|면)\s+[\d-]+)(?:\s*번지)?(?:\s*,?\s*(?:지하\s*)?[\d가-힣A-Za-z]+(?:층|호|동|빌딩|센터|타워|아파트|상가|프라자|스퀘어|파크|관|단지))?(?:\s*[\d가-힣A-Za-z]+(?:호|층))?)/g,
    en: /\d+\s+[A-Za-z0-9\s]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct|Place|Pl|Square|Sq|Terrace|Ter|Parkway|Pkwy|Circle|Cir|Highway|Hwy|Loop|Trail)[.,]?\s*(?:[A-Za-z\s]*,?\s*(?:[A-Z]{2}\s*\d{5})?)?/gi,
    ja: /(?:東京都|北海道|(?:京都|大阪)府|.{2,3}県)(?:.{1,10}市|.{1,10}郡|.{1,10}区)(?:(?:.{1,10}(?:町|村|字|番|丁目))|(?:.{1,10})).{0,20}[\d-]{1,10}/g,
    zh: /(?:.{2,5}省|.{2,5}自治区|.{2,5}市)(?:.{2,5}市|.{2,5}区|.{2,5}县|.{2,5}镇)(?:.{2,10}路|.{2,10}街|.{2,10}道|.{2,10}巷).{1,10}[\d-]+/g,
    de: /[A-Za-zÄÖÜäöüß\s.-]+\s+\d+[a-z]?\s*,?\s*\d{5}\s+[A-Za-zÄÖÜäöüß\s.-]+/g,
    fr: /\d{1,4}\s+(?:rue|avenue|av|boulevard|blvd|place|quai|chemin|impasse|allée|r\.)\s+[A-Za-zÀ-ÿ\s'-]+,?\s*\d{5}\s+[A-Za-zÀ-ÿ\s'-]+/gi,
    es: /(?:Calle|C\/|Avenida|Avda\.|Plaza|Paseo|Ronda|Travesía|Carretera)\s+[A-Za-zÀ-ÿ\s'-]+\s+\d+,?\s*\d{5}\s+[A-Za-zÀ-ÿ\s'-]+/gi,
    it: /(?:Via|Viale|Piazza|Corso|Largo|Vicolo|Contrada|Borgo)\s+[A-Za-zÀ-ÿ\s'-]+\s+\d+,?\s*\d{5}\s+[A-Za-zÀ-ÿ\s'-]+/gi,
    pt: /(?:Rua|Avenida|Av\.|Praça|Travessa|Alameda|Largo|Estrada)\s+[A-Za-zÀ-ÿ\s'-]+\s+\d+,?\s*\d{4,8}[\s-]?\d{0,3}\s*[A-Za-zÀ-ÿ\s'-]*/gi,
    id: /(?:Jalan|Jl\.|Gang|Gg\.)\s+[A-Za-z0-9\s.'-]+(?:No\.?\s*\d+)?/gi
};

/**
 * [v36.1] Negative-Reject Address Validator
 * 
 * Strategy: ACCEPT addresses by default, only REJECT obvious noise.
 * Addresses from search engine DOM selectors are already structured data.
 * Positive pattern matching (ADDRESS_PATTERNS) is only used in extractDetailsFromText.
 */
const ADDRESS_NOISE_PATTERNS = [
    /^https?:\/\//i,
    /^www\./i,
    /^[\d\s\-().+]+$/,
    /^[a-zA-Z0-9._%+-]+@/,
    /^\d{1,2}[\/\-\.]\d{1,2}/,
    /^\d{1,2}:\d{2}/,
    /^[\u2605\u2606\u2B50\u2726\u25CF\u25CB\u25CE\u25C6\u25A0\u25A1\u25B2\u25B3\u25BC\u25BD\u2665\u2666\u2713\u2717\u2715\s]+$/,
    /^(click|tap|press|scroll|view all|see all|see more|read more|learn more|buy now|shop now|order now|book now|call us|visit us|check out|start now|join now|follow us|sign up|sign in|log in|log out)\b/i,
    // [v36.2] Google SERP description noise patterns
    /\b\d+\+?\s*years?\s+(in|of)\s+business/i,
    /\bOpen\s*(24|now|until|today|tomorrow|Hours?)/i,
    /\bClosed\s*(now|until|today|tomorrow)?$/i,
    /\b\d+\.?\d*\s*(mi|km|miles?|kilometers?)\b/i,
    /\b(Rating|Reviews?|Stars?)\s*[:·]?\s*\d/i,
    /\b(In-store|Curbside|Delivery|Takeout|Dine.in)\b/i,
    /\bGoogle\s*(rating|review)/i,
];

const ADDRESS_NOISE_EXACT = new Set([
    'home', 'menu', 'login', 'signup', 'register', 'logout', 'search', 'contact', 'about',
    'help', 'support', 'faq', 'blog', 'news', 'careers', 'gallery', 'pricing', 'cart',
    'checkout', 'profile', 'settings', 'dashboard', 'shop', 'store', 'more', 'less',
    'next', 'previous', 'back', 'close', 'open', 'cancel', 'save', 'delete', 'share',
    '\ub85c\uadf8\uc778', '\ud68c\uc6d0\uac00\uc785', '\uba54\ub274', '\uac80\uc0c9', '\ud648', '\ub354\ubcf4\uae30', '\ub2eb\uae30', '\uc5f4\uae30', '\uc124\uc815', '\uacf5\uc720',
    '\u30ED\u30B0\u30A4\u30F3', '\u691C\u7D22', '\u30E1\u30CB\u30E5\u30FC', '\u30DB\u30FC\u30E0', '\u8A2D\u5B9A', '\u5171\u6709', '\u9589\u3058\u308B',
    '\u767B\u5F55', '\u6CE8\u518C', '\u641C\u7D22', '\u83DC\u5355', '\u9996\u9875', '\u8BBE\u7F6E',
]);

function isValidAddress(addr, lang) {
    if (!addr) return false;
    const trimmed = addr.trim();
    
    // Too short to be an address
    if (trimmed.length < 5) return false;
    
    // Too long - likely a paragraph or mixed content
    if (trimmed.length > 300) return false;
    
    // Multi-line noise (3+ newlines = block of mixed text)
    if ((trimmed.match(/\n/g) || []).length >= 3) return false;
    
    // Exact match noise (single UI words)
    const lower = trimmed.toLowerCase();
    if (ADDRESS_NOISE_EXACT.has(lower)) return false;
    
    // Blacklist phrases
    if (ADDRESS_BLACKLIST.some(w => lower.includes(w))) return false;
    
    // Regex-based noise patterns
    if (ADDRESS_NOISE_PATTERNS.some(p => p.test(trimmed))) return false;
    
    // [v36.2] Middle-dot separator: "desc · City, ST" pattern from Google SERP
    // Only allow through if the part BEFORE · looks like an address (starts with digit or has street keywords)
    if (/\u00B7/.test(trimmed)) {
        const beforeDot = trimmed.split('\u00B7')[0].trim();
        const hasAddrIndicator = /^\d/.test(beforeDot) || /\b(St|Ave|Rd|Blvd|Dr|Ln|Way|Ct|Pl|Hwy|Suite|Ste|Apt|Floor|Fl)\b/i.test(beforeDot);
        if (!hasAddrIndicator) return false;
    }
    
    // [v36.3] Chinese Language Filter: Exclude purely English addresses when in ZH mode
    if (lang === 'zh' || lang === 'cn') {
        const hasChinese = /[\u4e00-\u9fa5]/.test(trimmed);
        if (!hasChinese) return false;
    }
    
    // Must contain at least one letter (any script) - pure numbers/symbols fail
    if (!/[a-zA-Z\u00C0-\u024F\u4e00-\u9fff\uac00-\ud7a3\u3040-\u30FF]/.test(trimmed)) return false;
    
    // Passed all noise checks -> accept as valid address
    return true;
}


// [v25.1] CAPTCHA Lockdown Heartbeat
// [v29.0] Regex-based detail extraction from text (Fallback)
function extractDetailsFromText(text, lang) {
    if (!text) return { phone: '', address: '' };
    
    // 1. Phone Extraction
    const krPhoneRegex = /(02|031|032|033|041|042|043|044|051|052|053|054|055|061|062|063|064|070|080|050\d?)-\d{3,4}-\d{4}/g;
    const enPhoneRegex = /(?:\+?1[-. ]?)?\(?[2-9][0-8][0-9]\)?[-. ]?[2-9][0-9]{2}[-. ]?[0-9]{4}/g;
    
    const isKo = (lang === 'ko');
    const phones = text.match(isKo ? krPhoneRegex : enPhoneRegex) || [];
    
    // 2. Address Extraction (Strong Filtered)
    const pattern = ADDRESS_PATTERNS[lang] || ADDRESS_PATTERNS['en'];
    const candidates = text.match(pattern) || [];
    const validAddrs = candidates.filter(a => isValidAddress(a.trim(), lang));

    return {
        phone: phones[0] || '',
        address: validAddrs.sort((a,b) => b.length - a.length)[0] || ''
    };
}

async function checkCaptchaOnTab(tabId) {
    try {
        const tab = await chrome.tabs.get(tabId);
        if (tab.url.includes('google.com/sorry') || tab.url.includes('challenge') || tab.url.includes('captcha')) {
            const results = await chrome.scripting.executeScript({
                target: { tabId: tabId },
                func: () => {
                    const text = document.body ? document.body.innerText : '';
                    const isHardBlock = text.includes('automated queries from your computer network') || 
                                        text.includes('자동화된 쿼리를 보내고 있을 수 있습니다') ||
                                        text.includes('지금은 요청을 처리할 수 없습니다') ||
                                        text.includes('사용자 보호를 위해 지금은 요청을 처리할 수 없습니다') ||
                                        text.includes('automated queries') ||
                                        text.includes('자동화된 쿼리');
                    if (isHardBlock) return 'hard_block';
                    return 'captcha';
                }
            }).catch(() => [{ result: 'captcha' }]);
            return results?.[0]?.result || 'captcha';
        }
        
        const results = await chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: () => {
                const text = document.body ? document.body.innerText : '';
                const isHardBlock = text.includes('automated queries from your computer network') || 
                                    text.includes('자동화된 쿼리를 보내고 있을 수 있습니다') ||
                                    text.includes('지금은 요청을 처리할 수 없습니다') ||
                                    text.includes('사용자 보호를 위해 지금은 요청을 처리할 수 없습니다') ||
                                    text.includes('automated queries') ||
                                    text.includes('자동화된 쿼리');
                if (isHardBlock) return 'hard_block';

                const isCaptcha = !!(document.querySelector('div#captcha') || 
                                     document.querySelector('iframe[src*="captcha"]') ||
                                     document.title.includes('CAPTCHA') ||
                                     document.title.includes('로봇이 아닙니다') ||
                                     text.includes('서비스 이용이 제한되었습니다') ||
                                     text.includes('비정상적인 접근이 감지되었습니다'));
                return isCaptcha ? 'captcha' : false;
            }
        });
        return results?.[0]?.result || false;
    } catch (e) {
        return false;
    }
}

/**
 * [v36.9] Proxy Configuration Manager
 */
async function applyProxySettings() {
    const res = await chrome.storage.local.get(['proxyEnabled', 'proxyHost', 'proxyPort']);
    if (res.proxyEnabled && res.proxyHost && res.proxyPort) {
        console.log('[v36.9] Applying proxy settings:', res.proxyHost, res.proxyPort);
        const config = {
            mode: "fixed_servers",
            rules: {
                singleProxy: {
                    scheme: "http",
                    host: res.proxyHost,
                    port: parseInt(res.proxyPort)
                },
                bypassList: ["localhost", "127.0.0.1"]
            }
        };
        chrome.proxy.settings.set({ value: config, scope: 'regular' }, () => {
            if (chrome.runtime.lastError) console.error('[Proxy Error]', chrome.runtime.lastError);
        });
    } else {
        console.log('[v36.9] Clearing proxy settings (Mode: direct)');
        chrome.proxy.settings.clear({ scope: 'regular' });
    }
}
async function clearProxySettings() {
    chrome.proxy.settings.clear({ scope: 'regular' });
}

async function checkLockdown(tabId = null) {
    let wasPaused = false;
    
    if (tabId) {
        const blockStatus = await checkCaptchaOnTab(tabId);
        if (blockStatus === 'hard_block') {
            sendLog("🚫 [Critical] Google hard block detected. Please choose a recovery option in the popup.");
            isHardBlocked = true;
            isPaused = true;
            await updateState({ isHardBlocked: true, isPaused: true, isPausedByCaptcha: false });
            // Keep tab open for user to see or close later based on choice
            return;
        }
        
        if (blockStatus === 'captcha') {
            if (!isPausedByCaptcha) {
                await updateState({ isPausedByCaptcha: true });
                sendLog("⚠️ CAPTCHA detected on enrichment tab. Pausing...");
                chrome.tabs.update(tabId, { active: true });
                const tabInfo = await chrome.tabs.get(tabId);
                chrome.windows.update(tabInfo.windowId, { focused: true });
            }
        }
    }

    while ((isPaused || isPausedByCaptcha) && !isCancelled) {
        if (isPausedByCaptcha && !wasPaused) {
            wasPaused = true;
            chrome.runtime.sendMessage({ action: 'CAPTCHA_STATUS', status: 'detected' }).catch(() => {});
        }
        
        // [v1.0.0 Pro] Automated Solver Integration (Only if actually paused by captcha)
        const storage = await chrome.storage.local.get(['captchaSolveEnabled', 'captchaMethod', 'captchaApiKey']);
        if (isPausedByCaptcha && storage.captchaSolveEnabled && !isSolvingCaptcha && tabId) {
            isSolvingCaptcha = true;
            try {
                sendLog(`[Solver] 🤖 Attempting auto-solve... (Method: ${storage.captchaMethod})`);
                if (storage.captchaMethod === 'nopecha' && storage.captchaApiKey) {
                    const tabData = await chrome.tabs.get(tabId);
                    const siteKey = await getReCaptchaSiteKey(tabId);
                    if (siteKey) {
                        const token = await CAPTCHA_SOLVER.solveNopeCHA(siteKey, tabData.url, storage.captchaApiKey);
                        await injectCaptchaToken(tabId, token);
                        sendLog("✅ [Solver] NopeCHA solved!");
                        await new Promise(r => setTimeout(r, 2000));
                    } else {
                        sendLog("❌ [Solver] Site key not found.");
                    }
                } else if (storage.captchaMethod === 'api' && storage.captchaApiKey) {
                    const tabData = await chrome.tabs.get(tabId);
                    const siteKey = await getReCaptchaSiteKey(tabId);
                    if (siteKey) {
                        const token = await CAPTCHA_SOLVER.solve2Captcha(siteKey, tabData.url, storage.captchaApiKey);
                        await injectCaptchaToken(tabId, token);
                        sendLog("✅ [Solver] 2Captcha solved!");
                        await new Promise(r => setTimeout(r, 2000));
                    } else {
                        sendLog("❌ [Solver] Site key not found.");
                    }
                } else if (storage.captchaMethod === 'audio') {
                    // [v3.1] Audio Solving is now handled primarily by challenge_solver_content.js
                    // This prevents dual-orchestration and race conditions.
                    // Background script remains ready to handle transcription messages.
                }

                // [v2.0] Stealth Mode: Add extra organic pause after resolution
                if (storage.stealthModeEnabled) {
                    const delay = 3000 + Math.random() * 5000;
                    sendLog(`🛡️ [Stealth] Waiting ${Math.round(delay/1000)}s longer (Simulating human behavior)...`);
                    await new Promise(r => setTimeout(r, delay));
                }
            } catch (err) {
                sendLog(`❌ [Solver] Error: ${err.message}`);
            } finally {
                isSolvingCaptcha = false;
            }
        }
        
        if (tabId) {
            const blockStatus = await checkCaptchaOnTab(tabId);
            if (blockStatus === 'hard_block') {
                sendLog("🚫 [Critical] Google hard block detected. Waiting for user decision...");
                isHardBlocked = true;
                isPaused = true;
                await updateState({ isHardBlocked: true, isPaused: true, isPausedByCaptcha: false });
                break;
            }
            if (!blockStatus) {
                await updateState({ isPausedByCaptcha: false });
                break;
            }
        } else {
            // [v1.0.1 Pro] Fallback: Check ALL tabs if no specific tabId is provided
            try {
                const allTabs = await chrome.tabs.query({});
                let anyBlocked = false;
                for (const t of allTabs) {
                    if (t.url && (t.url.includes('google.com/sorry') || t.url.includes('captcha'))) {
                        anyBlocked = true;
                        break;
                    }
                }
                if (!anyBlocked) {
                    await updateState({ isPausedByCaptcha: false });
                    break;
                }
            } catch (e) {
                console.error("[Solver] Fallback check failed:", e);
            }
        }
        
        await new Promise(r => setTimeout(r, 1000));
    }
    
    if (wasPaused) {
        sendLog("✅ CAPTCHA resolved. Resuming...");
        chrome.runtime.sendMessage({ action: 'CAPTCHA_STATUS', status: 'resolved' }).catch(() => {});
    }
}

/**
 * [v1.0.0 Pro] 699s Mandatory Pause Countdown for Secondary Quiz
 */
async function startSecondaryWaitCountdown(seconds) {
    if (isSecondaryQuizWaiting) return;
    isSecondaryQuizWaiting = true;
    isPausedByCaptcha = true;
    let remaining = seconds;
    await updateState({ isPausedByCaptcha: true, isSecondaryQuizWaiting: true, secondaryCountdown: remaining });

    const t = await getT();
    sendLog(t('log_secondary_quiz_detected', { seconds }));
    sendLog(t('log_paid_api_tip'));

    const intervalId = setInterval(async () => {
        remaining--;
        await updateState({ secondaryCountdown: remaining });
        await sendStatusDetail(`⏳ Secondary Quiz Pause: ${remaining}s`);
        
        if (remaining <= 0 || !isPausedByCaptcha || isCancelled) {
            clearInterval(intervalId);
            isSecondaryQuizWaiting = false;
            await updateState({ isSecondaryQuizWaiting: false, secondaryCountdown: 0 });
            // Only release isPausedByCaptcha if it was our countdown that was holding it
            if (isPausedByCaptcha && remaining <= 0) {
                await updateState({ isPausedByCaptcha: false });
                sendLog("🏁 Secondary Quiz wait finished. Resuming tasks...");
            }
        }
    }, 1000);
}

function safeRemoveTab(tabId) {
    return chrome.tabs.remove(tabId).catch(() => { });
}

const excludeDomains = ['map.naver.com', 'place.naver.com', 'google.com', 'google.co', 'youtube.com', 'facebook.com', 'twitter.com', 'instagram.com', 'tistory.com', 'blog.naver.com'];
const excludeNamePatterns = [
    '로그인', '회원가입', '공지사항', '고객센터', '이용약관', '개인정보', '사이트맵',
    'Login', 'Sign up', 'Terms of Service', 'Privacy Policy', 'Contact Us'
];

const EN_COMMON_WORDS = [
    "THE", "AND", "FOR", "WITH", "FROM", "YOUR", "THIS", "THAT", "HAVE", "SOME",
    "THEY", "WERE", "WHAT", "WHEN", "WHERE", "WHICH", "WHO", "HOW", "ABOUT",
    "HOME", "MENU", "CONTACT", "ABOUT", "SERVICES", "PRODUCTS", "BLOG", "NEWS"
];
const EN_COMMON_WORDS_SET = new Set(EN_COMMON_WORDS);

// [v16.0] Studioberry Mailz Logic - Professional Discovery Patterns
const PROACTIVE_CONTACT_CANDIDATES = [
    "/contact", "/contact-us", "/contactus", "/contacts", "/get-in-touch", "/getintouch",
    "/support", "/help", "/customer-support", "/customer-service", "/service", "/assistance",
    "/contact/", "/contact-us/", "/support/", "/help/",
    "/contact.html", "/contact.php", "/contact.aspx", "/contact/index.html",
    "/pages/contact", "/pages/contact-us", "/page/contact", "/page/contact-us",
    "/about/contact", "/about-us/contact", "/company/contact", "/company/contact-us",
    "/contacto", "/kontakt", "/contatto", "/contactez-nous", "/contacter", "/contato", "/contattaci",
    "/contact/form", "/contact-form", "/contact/form/", "/contact-us/form",
    "/support/contact", "/help/contact", "/helpdesk", "/ticket", "/submit-ticket",
    "/contact#contact", "/#contact", "/#contact-us", "/mail", "/mailz", "/info",
    "/location", "/directions", "/map", "/store-locator", "/where-to-find-us",
    "/오시는길", "/찾아오시는길", "/지점안내", "/매장안내", "/문의", "/고객센터"
];

function rankContactUrl(url) {
    const s = (url || "").toLowerCase();
    let b = 0;
    if (s.includes("contact")) b += 50;
    if (s.includes("support")) b += 20;
    if (s.includes("help") || s.includes("고객센터")) b += 15;
    if (s.includes("customer") || s.includes("문의")) b += 10;
    if (s.includes("오시는길") || s.includes("location") || s.includes("directions") || s.includes("map") || s.includes("지점안내")) b += 30;
    if (s.includes("get-in-touch") || s.includes("getintouch")) b += 15;
    if (s.includes("kontakt") || s.includes("contacto") || s.includes("contatto") || s.includes("contactez")) b += 10;
    if (s.includes("mail")) b += 10;
    if (s.includes("form")) b += 5;
    return b;
}

const excludeTLDs = ['.png', '.jpg', '.jpeg', '.gif', '.pdf', '.zip', '.exe'];

const LOCALIZED_FILTERS = {
    ko: {
        blacklist: ['블로그', '카페', '뉴스', '커뮤니티', '지도', '날씨', '쇼핑', '검색', '이미지', '동영상', '사전', '가이드'],
        suffixes: ['식당', '카페', '커피', '펜션', '학원', '병원', '의원', '치과', '헤어', '네일', '센터', '관', '교회', '사찰']
    },
    en: {
        blacklist: ['NEWS', 'FORUM', 'WIKI', 'GUIDE', 'MAPS', 'IMAGES', 'VIDEOS', 'DICTIONARY', 'WEATHER', 'SEARCH'],
        suffixes: ['RESTAURANT', 'CAFE', 'COFFEE', 'SCHOOL', 'HOSPITAL', 'CLINIC', 'DENTAL', 'HAIR', 'SALON', 'CENTER', 'CHURCH', 'TEMPLE']
    }
};

const KO_BLACKLIST = [
    '로그인', '회원가입', '아이디', '비밀번호', '찾기', '마이페이지', '장바구니', '주문배송', '고객센터', '공지사항', '자주묻는질문',
    '이용약관', '개인정보처리방침', '회사소개', '오시는길', '제휴문의', '광고문의', '전체보기', '닫기', '열기', '이전', '다음', 'TOP',
    '검색', '통합검색', '인기검색어', '실시간', '뉴스', '연예', '스포츠', '경제', '정치', '사회', '생활', '문화', 'IT', '과학', '세계',
    '블로그', '카페', '지식iN', '쇼핑', '페이', '메일', '사전', '증권', '부동산', '지도', '영화', '뮤직', '책', '웹툰',
    '네이버', '다음', '구글', '줌', '유튜브', '인스타그램', '페이스북', '트위터', '카카오톡', '밴드', '티스토리', '워드프레스'
];

const JA_BLACKLIST = [
    'ログイン', '新規登録', 'マイページ', 'カート', '注文履歴', 'お問い合わせ', 'お知らせ', 'ヘルプ', 'よくある質問',
    '利用規約', 'プライバシーポリシー', '会社概要', 'アクセス', '提携', '広告', 'すべて見る', '閉じる', '開く', '戻る', '次へ',
    '検索', 'キーワード', 'ランキング', 'リアルタイム', 'ニュース', 'エンタメ', 'スポーツ', '経済', '政治', '社会', 'ライフ', '文化', 'IT', '科学', '世界',
    'ブログ', '掲示板', 'ショッピング', '決済', 'メール', '辞書', 'ファイナンス', '不動産', '地図', '映画', '音楽', '本', 'コミック',
    'ナビ', 'ヤフー', 'グーグル', 'ライン', 'インスタ', 'フェイスブック'
];

const EN_BLACKLIST = [
    'Log in', 'Sign up', 'Register', 'My account', 'Cart', 'Orders', 'Contact', 'News', 'Help', 'FAQ',
    'Terms', 'Privacy', 'About', 'Contact Us', 'Support', 'Feedback', 'Careers', 'Sitemap',
    'Search', 'Popular', 'Trending', 'Hot', 'Latest', 'Politics', 'Business', 'Tech', 'Science', 'Health', 'Style', 'Travel',
    'Blog', 'Forum', 'Shop', 'Pay', 'Mail', 'Dictionary', 'Stock', 'Real estate', 'Map', 'Movie', 'Music', 'Book', 'Comic',
    'Google', 'Yahoo', 'Bing', 'Facebook', 'Instagram', 'Twitter', 'LinkedIn', 'YouTube', 'Reddit', 'Medium'
];

const COMMON_NOUNS = {
    ko: ['내용', '정보', '결과', '목록', '날짜', '시간', '조회', '댓글', '추천', '공유', '다운로드', '파일', '이미지', '사진', '영상', '더보기'],
    en: ['Content', 'Info', 'Result', 'List', 'Date', 'Time', 'View', 'Comment', 'Recommend', 'Share', 'Download', 'File', 'Image', 'Photo', 'Video', 'More'],
    ja: ['内容', '情報', '結果', '一覧', '日付', '時間', '表示', 'コメント', 'おすすめ', '共有', 'ダウンロード', 'ファイル', '画像', '写真', '動画', '詳細']
};

// [v33.0] Japanese Business Suffixes for Text Scanning (Comprehensive)
const JA_BUSINESS_SUFFIXES = [
    '株式会社', '合同会社', '有限会社', '医療法人', '財団法人', '社団法人', '宗教法人', '学校法人', 
    'ホテル', '旅館', '料理店', '飯店', 'リゾート', 'ビューホテル', 'テラス', 'ヴィラ', 'ペンション', 'ゲストハウス',
    'クリニック', '歯科', '醫院', '病院', '整骨院', '接骨院', '鍼灸院', 'マッサージ', '整体',
    '工務店', '不動産', '設計事務所', '建築設計', '法律事務所', '会計事務所', '税理士事務所',
    '支店', '本店', '営業所', 'ショップ', 'ストア', '本店', '支店', '工房', '製作所', '研究所'
];

/**
 * [v33.2] Japanese-Specific Extraction (Enhanced Regex)
 * Handles full-width/half-width punctuation and greedy suffix/modifier matching.
 */
/**
 * Universal Multi-Language Extraction Algorithm
 * [v33.4] Support for KO, JA, EN, ZH.
 * Scans raw text for business signatures (Inc, Ltd, 주식회사, 株式会社, 有限公司, etc.)
 */
function extractBusinessNames(text, hl = 'en') {
    if (!text) return [];
    
    // Select suffixes/markers based on language
    const currentLang = (hl === 'kr') ? 'ko' : hl;
    const BUSINESS_MARKERS = {
        ko: [
            '주식회사', '유한회사', '사단법인', '재단법인', '(주)', '(유)', '(사)', '(재)', 
            '병원', '의원', '식당', '카페', '커피', '베이커리', '학원', '센터', '본점', '지점',
            '본사', '지사', '스튜디오', '공방', '유통', '산업', '건축', '건설', '공사', '기획', '상사',
            '마트', '백화점', '호텔', '모텔', '펜션', '약국', '연구소', '사무소', '법인', '창고', '공장', '치킨',
            '유치원', '어린이집', '초등학교', '중학교', '고등학교', '대학교', '교회', '성당', '사찰', '원', '회관'
        ],
        en: [
            'Inc', 'Ltd', 'LLC', 'Corp', 'Co.', 'Group', 'Holdings', 'Corporation', 'Limited',
            'Company', 'Solutions', 'Ventures', 'Capital', 'Partners', 'Consulting', 'Logistics',
            'Trading', 'Industries', 'School', 'Academy', 'University', 'College', 'Institute',
            'Clinic', 'Hospital', 'Dental', 'Medical', 'Law', 'Legal', 'Studio', 'Atelier',
            'Bakery', 'Hotel', 'Inn', 'Resort', 'Restaurant', 'Cafe', 'Coffee', 'Store', 'Shop'
        ],
        ja: [
            '株式会社', '有限会社', '合同会社', '一般社団法人', '一般財団法人', '飯店', '料理店',
            'ホテル', '旅館', '宿', '温泉', 'リゾート', 'ヴィラ', 'ペンション', 'ゲストハウス', 
            'レストラン', 'カフェ', '喫茶', '居酒屋', 'ダイニング', 'バル', 'キッチン', '食堂',
            'クリニック', '病院', '医院', '歯科', '整骨', '薬局', '診療所',
            'スタジオ', 'アトリエ', 'ラボ', 'ショップ', 'ストア', 'マーケット', 'ビル', 'タワー',
            '製作所', '工業', '産業', '建設', '興業', '商事', '物流', '運輸', 'システム'
        ],
        zh: [
            '有限公司', '责任公司', '股份有限公司', '股份', '集团', '工厂', '中心', '公司', '厂', '店', '大厦', '酒楼', '酒店', 
            '餐厅', '咖啡', '烘焙', '医院', '诊所', '学校', '学院', '所', '工作室', '部', '行', '分公司', '办事处', '研究所',
            '科技', '电子', '机械', '工程', '建筑', '装饰', '贸易', '进出口', '服饰', '实业', '开发', '房地产'
        ]
    };

    const suffixes = BUSINESS_MARKERS[currentLang] || BUSINESS_MARKERS['en'];
    const sortedSuffixes = [...suffixes].sort((a, b) => b.length - a.length);
    const suffixPattern = sortedSuffixes.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    
    // Language-specific character ranges
    const ranges = {
        ko: '[가-힣a-zA-Z0-9・－＆\s\(\)（）]',
        ja: '[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\u3005a-zA-Z0-9・－ー＆々\s\(\)（）]',
        en: '[a-zA-Z0-9・－＆\s\(\)\.,]',
        zh: '[\u4E00-\u9FFF\u3005a-zA-Z0-9・－＆\s\(\)]'
    };
    const range = ranges[currentLang] || '[\\w\\s]';

    // Extraction Regex: Captures name (at least 2 chars) + Suffix
    // [v36.5] Powerful hierarchical extraction for Chinese (City + Brand + Industry + Suffix)
    let extractorRegex;
    if (currentLang === 'zh') {
        const zhSuffixPattern = sortedSuffixes.join('|');
        // pattern: (City)? (Brand/Industry) (Suffix)
        // includes support for () and （） around cities
        extractorRegex = new RegExp(`(?:[\\(（][\u4E00-\u9FFF]{2,6}[\\)）])?[\u4E00-\u9FFF\\d]{2,30}?(?:${zhSuffixPattern})`, 'g');
    } else {
        extractorRegex = new RegExp(`${range}{2,40}(?:${suffixPattern})(?:(?:\\s+by\\s+[a-zA-Z0-9]+)|(?:[\\(（\\s]*[旧\\(（]：?[^\\)）]+[\\)）]))?`, 'g');
    }
    
    const matches = text.match(extractorRegex) || [];
    const unique = [...new Set(matches.map(m => m.trim()))];
    
    const results = unique.filter(n => {
        let name = n;
        // Clean leading/trailing noise
        // [v34.1] Improved leading noise cleaning (Tabs, Numbers, Dots, Dashes)
        name = name.replace(/^[\\t\\s・－ー\\-\\.0-9\u2460-\u2473]+/, "").replace(/[\\t\\s]+$/, "");
        
        // No restriction on complexity, but maintain reasonable length limits.
        if (name.length > 2 && name.length < 200) {
            const feedback = { source: 'trusted' };
            return isViableBusinessName(name, hl, [], "", feedback);
        }
        return false;
    });

    console.log(`[extractBusinessNames][${hl}] Found ${results.length} valid entities from text scan.`);
    return results;
}


/**
 * [v20.0] URL 기반 도메인/비즈니스 이름 상관관계 보존 필터
 */
function isSearchListingTitle(name) {
    if (!name) return false;
    const n = name.trim();
    
    // [v31.0] Strictly align with user request: No numbers allowed in business names
    if (/\d/.test(n)) {
        console.log(`[Filter] Rejected: "${n}" (Contains Digit)`);
        return true;
    }
    
    // 1) 리스트형 제목 (Best 10, Top 5 등)
    if (/^(Best|Top|10|20|30|40|50|100|Recommended|Famous|Greatest|Popular|List|Ranking|Directory|Guide|Review)\s/i.test(n)) {
        console.log(`[Filter] Rejected: "${n}" (List Header Pattern)`);
        return true;
    }
    if (/\b(Restaurants|Places|Hotels|Things to do|Rankings?|Review|Guides?|Best|Top)\b/i.test(n) && /\b(in|at|around|near)\b/i.test(n)) {
        console.log(`[Filter] Rejected: "${n}" (Listing Context Pattern)`);
        return true;
    }
    
    // [v31.0] Strictly Exclude specific English Prepositions (User Request)
    if (/\b(in|at|by|with|to|from|for|on|of|and|or)\b/i.test(n)) {
        // [v31.3] Exception for very short names that might be false positives but keeping it strict as per user request
        console.log(`[Filter] Rejected: "${n}" (Contains Preposition)`);
        return true;
    }

    // 2) 한국어 순위 리스트
    if (/(맛집|카페|명소|순위|베스트|추천|Top|TOP|가볼만한곳|TOP\s*\d+)/.test(n)) {
        if (n.includes('BEST') || n.includes('베스트') || /\d+/.test(n)) return true;
    }
    
    // 3) 일반적인 UI 텍스트
    const UI_WORDS = ['Home', 'Contact', 'Services', 'News', 'Blog', 'About Us', 'Contact Us', 'Privacy Policy', 'Terms of Service', 'Ads', 'Sponsored'];
    if (UI_WORDS.some(w => n === w)) return true;
    
    if (n.length < 2) return true;
    if (n.split(/\s+/).length > 10) return true;

    return false;
}

// 2차 검색 URL (전역 유틸리티) - 위치 인식 검색 지원
function getSearchUrl2(bizName, gl, hl, context = '') {
    // [v29.0] Simplified Query for Better Knowledge Panel Triggering
    let suffix = ' 전화번호 주소 지도';
    if (gl === 'jp' || hl === 'ja') suffix = ' 住所 電話番号 地図';
    else if (hl !== 'ko') suffix = ' phone address maps';

    const searchQuery = (context ? context + ' ' : '') + bizName + suffix;
    const q = encodeURIComponent(searchQuery);

    // 구글 지역별 도메인 맵
    const googleTLDs = {
        'kr': 'co.kr',
        'jp': 'co.jp',
        'es': 'es',
        'de': 'de',
        'fr': 'fr',
        'it': 'it',
        'uk': 'co.uk',
        'us': 'com'
    };

    const tld = googleTLDs[gl] || 'com';
    const lang = hl || 'en';

    // [v12.6] Forced Google Local Search (tbm=lcl) for high-fidelity business cards
    return `https://www.google.${tld}/search?q=${q}&hl=${lang}&gl=${gl || 'us'}&tbm=lcl`;
}

// 검색엔진 도메인 제외 (전역 유틸리티)
function isSearchEngineDomain(url) {
    if (!url) return false;
    try {
        const h = new URL(url).hostname;
        return ['google.com', 'google.co', 'naver.com', 'yahoo.com', 'yahoo.co.jp', 'bing.com', 'daum.net', 'search.naver'].some(d => h.includes(d));
    } catch { return false; }
}

// === 통일된 3단계 딥 스캔 (전역 유틸리티) ===
async function deepScan3Stage(targets, sourceLabel, hl, gl, t, keyword = '', base = 0, weight = 100, targetOption = 'all') {
    sendLog(`📋 ${t('stage1Done')}: ${targets.length}${t('namesCollected')} [${sourceLabel}] ${t('stage2Start')}`);
    
    // [v34.8] Removed strict Top 20 limit to fulfill user request for full deep scan
    const scanCount = targets.length;
    if (targets.length === 0) return;

    // [v12.5] Batch Processing for Stage 2 (Concurrency: 3)
    const BATCH_SIZE = 3;
    for (let i = 0; i < scanCount; i += BATCH_SIZE) {
        if (isCancelled) break;
        await checkPause(); // [v18.5] Pause Check
        
        const batch = targets.slice(i, i + BATCH_SIZE);
        const batchPromises = batch.map(async (target, idx) => {
            const index = i + idx;
            const bizName = target.name;
            
            await runWithTimeout((async () => {
                if (isCancelled) return;
                const subProgress = ((index + 1) / scanCount) * 100;
                const currentTotalProgress = Math.round(base + (subProgress * (weight / 100)));
                await updateState({ currentProgressPercent: currentTotalProgress });
                
                await sendStatusDetail(`[Stage 2] ${t('searching')} details: ${index+1}/${scanCount}`);
                chrome.runtime.sendMessage({ action: 'progress', percent: currentTotalProgress }).catch(() => {});

                const sourceUrl = target.url || '';

                if (isSearchListingTitle(bizName)) {
                    sendLog(`  ⏭️ [${index + 1}/${targets.length}] SKIP (listing title): "${bizName}"`);
                    return;
                }

                let cleanName = bizName;
                if (typeof stripAddressFromName === 'function') cleanName = stripAddressFromName(bizName, hl);
                if (cleanName && cleanName !== bizName) target.name = cleanName;

                const isTrustedSource = (sourceLabel === 'TEXT_LIST' || sourceLabel === 'CRAWL');
                if (!isTrustedSource) {
                    const blacklist = [...(COMMON_NOUNS[hl] || COMMON_NOUNS['en'])];
                    const feedback = { ruleId: '', reason: '', pass: false };
                    if (!isViableBusinessName(cleanName || bizName, hl, blacklist, keyword || "", feedback)) {
                        sendLog(t('log_skip_filter', { index: index + 1, total: targets.length, name: bizName, reason: feedback.reason ? `[Rule ${feedback.ruleId}] ${feedback.reason}` : t('log_skip_filter_default') }));
                        return;
                    }
                }

                const isHighFidelity = sourceUrl.includes('place.naver.com') || sourceUrl.includes('/place/g-');
                const isNaverSource = (sourceLabel || '').toLowerCase().includes('naver');
                let url2 = isHighFidelity ? sourceUrl : getSearchUrl2(bizName, gl, hl, target.context);
                let engineName2 = isHighFidelity ? 'High-Fidelity' : (gl === 'kr' ? 'Google Korea' : 'Google');

                if (isNaverSource && !isHighFidelity) {
                    url2 = getSearchUrl2(bizName, gl, hl, target.context);
                    engineName2 = `Google Korea (Enrichment)`;
                }

                sendLog(`🔎 [${index + 1}/${targets.length}] "${bizName}" ${t('searching')} (${engineName2})`);
                await checkLockdown();
                let scan = await scanPageInBrowser(url2, 4000, bizName);
                await checkPause(); // [v18.7] Check pause after enrichment scan

                const portalDomains = ['blog.naver.com', 'cafe.naver.com', 'tistory.com', 'brunch.co.kr', 'modoo.at', 'instagram.com'];
                let hasPortalHomepage = scan.homepage && portalDomains.some(d => scan.homepage.includes(d));
                const missingDetails = !scan.phone || !scan.address || scan.address === '-';
                const needsHomepage = !scan.homepage || hasPortalHomepage;

                if (missingDetails || needsHomepage) {
                    const queryContext = (target.context && target.context !== bizName) ? target.context : '';
                    const searchContext = (hl === 'ko') ? ' 전화번호 주소 홈페이지' : ' phone address official website';
                    const url3 = `https://www.google.${gl === 'kr' ? 'co.kr' : 'com'}/search?q=${encodeURIComponent(bizName + (queryContext ? ' ' + queryContext : '') + searchContext)}&hl=${hl}&gl=${gl}&tbm=lcl`;
                    await checkLockdown();
                    const scan2 = await scanPageInBrowser(url3, 3000, bizName);
                    
                    if (scan2.phone) scan.phone = scan2.phone;
                    if (scan2.address && scan2.address !== '-') scan.address = scan2.address;
                    if (scan2.homepage && !scan.homepage) scan.homepage = scan2.homepage;

                    // [v14.0] Secondary Fallback: Direct Official Website Search
                    if (!scan.homepage) {
                        const websiteQuery = (hl === 'ko') ? `"${bizName}" 공식 홈페이지` : `"${bizName}" official website`;
                        const url4 = `https://www.google.${gl === 'kr' ? 'co.kr' : 'com'}/search?q=${encodeURIComponent(websiteQuery)}&hl=${hl}&gl=${gl}`;
                        await checkLockdown();
                        const scan3 = await scanPageInBrowser(url4, 3500, bizName);
                        if (scan3.homepage) scan.homepage = scan3.homepage;
                    }

                    if (!scan.phone || !scan.address || scan.address === '-') {
                        const textScan = extractDetailsFromText(scan2.pageText, hl);
                        if (textScan.phone && !scan.phone) scan.phone = textScan.phone;
                        if (textScan.address && (!scan.address || scan.address === '-')) scan.address = textScan.address;
                    }
                }

                const needsStage3 = (targetOption === 'all') || 
                                    (targetOption === 'webpage') ||
                                    (targetOption === 'email' && !scan.emails) || 
                                    (targetOption === 'sns' && (!scan.sns || scan.sns.length === 0)) ||
                                    (targetOption === 'phone' && (!scan.phone || scan.phone === '-')) ||
                                    (targetOption === 'address' && (!scan.address || scan.address === '-'));

                if (scan.homepage && needsStage3) {
                    await sendStatusDetail(`[Stage 3] 🔍 Deep Website Search: ${index+1}/${scanCount} (${bizName})`);
                    sendLog(`🔎 [Stage 3] Starting deep contact search for: ${scan.homepage}`);
                    
                    const webScan = await scrapeBusinessWebsite(scan.homepage, targetOption, hl, gl);
                    if (webScan) {
                        if (webScan.emails && !scan.emails) {
                            scan.emails = webScan.emails;
                            sendLog(`    ✅ [Stage 3] Found NEW Email: ${webScan.emails}`);
                        }
                        if (webScan.sns && webScan.sns.length > 0) {
                            const newSns = [...new Set([...scan.sns, ...webScan.sns])];
                            if (newSns.length > scan.sns.length) {
                                scan.sns = newSns;
                                sendLog(`    ✅ [Stage 3] Found NEW SNS links.`);
                            }
                        }
                        if (webScan.phone && !scan.phone) {
                            scan.phone = webScan.phone;
                            sendLog(`    ✅ [Stage 3] Found NEW Phone: ${webScan.phone}`);
                        }
                        if (webScan.address && (!scan.address || scan.address === '-')) {
                            scan.address = webScan.address;
                            sendLog(`    ✅ [Stage 3] Found NEW Address: ${webScan.address}`);
                        }
                    }
                }

                // [v3.0] X-Ray Snippet Search Fallback
                if (!scan.emails || scan.sns.length === 0 || !scan.homepage) {
                    let contactQuery = `"${bizName}" email OR contact OR "instagram.com" OR "facebook.com"`;
                    const contactUrl = `https://www.google.${gl === 'kr' ? 'co.kr' : 'com'}/search?q=${encodeURIComponent(contactQuery)}&hl=${hl}&gl=${gl}`; 
                    await checkLockdown();
                    const contactScan = await scanPageInBrowser(contactUrl, 2500, bizName);
                    if (contactScan) {
                        if (contactScan.emails && !scan.emails) scan.emails = contactScan.emails;
                        if (contactScan.sns && contactScan.sns.length > 0) scan.sns = [...new Set([...scan.sns, ...contactScan.sns])];
                        if (contactScan.homepage && !scan.homepage) scan.homepage = contactScan.homepage;
                    }
                }

                if (targetOption === 'webpage' && !scan.homepage) { sendLog(`  🗑️ DROP: ${bizName} (No Webpage)`); return; }
                if (targetOption === 'email' && !scan.emails) { sendLog(`  🗑️ DROP: ${bizName} (No Email)`); return; }
                if (targetOption === 'sns' && (!scan.sns || scan.sns.length === 0)) { sendLog(`  🗑️ DROP: ${bizName} (No SNS)`); return; }
                if (targetOption === 'phone' && (!scan.phone || scan.phone === '-')) { sendLog(`  🗑️ DROP: ${bizName} (No Phone)`); return; }
                if (targetOption === 'address' && (!scan.address || scan.address === '-')) { sendLog(`  🗑️ DROP: ${bizName} (No Address)`); return; }

                // [v36.1] Final Address Noise Gate - reject only obvious non-address noise
                const storage36 = await chrome.storage.local.get(['language']);
                const validationLang = storage36.language || hl || 'en';
                if (scan.address && scan.address !== '-') {
                    if (!isValidAddress(scan.address, validationLang)) {
                        sendLog(`  🚫 [v36.1] Address noise rejected: "${scan.address.substring(0, 50)}"`);
                        scan.address = '-';
                    }
                }

                const finalResult = {
                    id: Date.now() + Math.random().toString(36).substr(2, 9),
                    name: bizName,
                    homepage: scan.homepage || sourceUrl,
                    phone: scan.phone || '-',
                    emails: scan.emails || '-',
                    address: scan.address || '-',
                    sns: scan.sns || [],
                    category: scan.category || sourceLabel,
                    source: sourceLabel
                };
                sessionResults.push(finalResult);
                await updateState({ sessionResults });
                chrome.runtime.sendMessage({ action: 'result', data: finalResult }).catch(() => {});
            })(), 180000, null, t('log_timeout_skip', { name: bizName }));
        });

        await Promise.all(batchPromises);
    }
}

async function getT() {
    const s = await chrome.storage.local.get(['language']);
    const lang = s.language || 'ko';
    return (key, params) => {
        // [v26.0] Use I18N_DATA instead of translations
        let str = (typeof I18N_DATA !== 'undefined' && I18N_DATA[lang] && I18N_DATA[lang][key]) ? I18N_DATA[lang][key] : key;
        if (params) {
            for (const [k, v] of Object.entries(params)) {
                str = str.replace(`{${k}}`, v);
            }
        }
        return str;
    };
}

async function sendLog(msg) {
    console.log(`[v12.3][Background] ${msg}`);
    const time = new Date().toLocaleTimeString();
    sessionLogs.push(`[${time}] ${msg}`);
    if (sessionLogs.length > 200) sessionLogs.shift();
    await updateState({ sessionLogs });
    chrome.runtime.sendMessage({ action: 'log', message: `[${time}] ${msg}` }).catch(() => {});
}

async function startSearchProcess(text, collectEmails = false, targetOption = 'all', language = 'en', region = 'us') {
    isCancelled = false;
    isPaused = false; // [v18.7] Force reset pause on NEW task
    isHardBlocked = false;
    isPausedByCaptcha = false;
    
    const t = await getT();
    await sendLog(t('log_preparing'));
    
    const hl = language || 'en';
    const gl = region || 'us';

    // [v33.4] Universal Extraction Strategy (Targeted Options now use Deep Search)
    // The previous "Direct Extraction" mode for specific options is deprecated to ensure higher quality results via Deep Search.
    // Instead, we always discover names first.

    
    // Stage 1: Extraction from Text (Unified Business Discovery)
    await sendLog(`[Stage 1] Extracting business names from text (${hl})...`);
    
    // [v33.4] Unified Extraction Strategy: Use extractBusinessNames for all languages
    let extractedNames = extractBusinessNames(text, hl);

    if (extractedNames.length === 0) {
        await sendLog(t('log_no_keywords') || "No valid business names found in text.");
        await updateState({ isSearching: false });
        chrome.runtime.sendMessage({ action: 'complete' }).catch(() => {});
        return;
    }

    await sendLog(`✅ Extracted ${extractedNames.length} valid business names. Starting enrichment...`);
    
    const targets = extractedNames.map(name => ({
        name: name,
        context: "" 
    }));

    await deepScan3Stage(
        targets, 
        "Text Data",
        hl, 
        gl, 
        t, 
        "", 
        0,  
        100,
        targetOption // Pass targetOption
    );

    await sendLog(t('log_complete') || "All tasks completed.");
    await updateState({ isSearching: false, currentProgressPercent: 100 });
    chrome.runtime.sendMessage({ action: 'complete' }).catch(() => {});
}

chrome.runtime.onInstalled.addListener(() => {
    isSearching = false;
    isCancelled = false;
});

chrome.runtime.onStartup.addListener(() => {
    isSearching = false;
    isCancelled = false;
});

// =====================================================
// [핵심] executeScript allFrames로 네이버 지도 비즈니스 리스트 추출
// 모든 a 태그를 순회하며 .href(resolved URL)로 place ID 패턴 검사
// =====================================================
async function extractNaverMapBusinesses(tabId, waitMs = 10000) {
    const t = await getT();
    await new Promise(r => setTimeout(r, waitMs));
    
    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId: tabId, allFrames: true },
            func: () => {
                const businesses = [];
                const seenNames = new Set();
                const placeIdRegex = /\/\w+\/(\d{5,})/; // /카테고리/숫자ID 패턴

                // 모든 a 태그 순회 (.href = 브라우저가 절대 URL로 자동 변환)
                const allAnchors = document.querySelectorAll('a');

                for (const anchor of allAnchors) {
                    const resolvedUrl = anchor.href || '';
                    const rawHref = anchor.getAttribute('href') || '';
                    const isPlaceLink = resolvedUrl.includes('place.naver.com') && placeIdRegex.test(resolvedUrl);
                    const isRelativePlaceLink = /^\/[a-zA-Z]+\/\d{5,}/.test(rawHref);

                    if (!isPlaceLink && !isRelativePlaceLink) continue;

                    const placeUrl = isPlaceLink ? resolvedUrl : (window.location.origin + rawHref);
                    const li = anchor.closest('li');
                    const container = li || anchor.closest('div');
                    if (!container) continue;

                    const text = container.innerText || '';
                    if (text.length < 3 || text.length > 1500) continue;

                    let name = anchor.innerText.trim().split('\n')[0];
                    if (!name || name.length < 2) {
                        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 1);
                        name = lines[0] || '';
                    }
                    if (!name || name.length < 2 || name.length > 50) continue;

                    const uiWords = ['알림', '즐겨찾기', '설정', '로그인', 'MYBOX', '메뉴', '프로필', '공지의', '이벤트', '고객센터', '도움말', '더보기', '전체보기'];
                    if (uiWords.some(k => name.includes(k))) continue;
                    if (seenNames.has(name)) continue;
                    seenNames.add(name);

                    let address = '';
                    const addrMatch = text.match(/(([가-힣]+(시|도|특별자치시|특별자치도)\s+)?([가-힣]+(시|군|구)\s+)?([가-힣\d]+(읍|면|동|가|리)\s+)?([가-힣A-Za-z\d]+(로|길|대로)\s+[\d-]+|[가-힣\d]+(동|가|리|읍|면)\s+[\d-]+)(\s*번지)?(\s*,?\s*(지하\s*)?[\d가-힣A-Za-z]+(층|호|동|빌딩|센터|타워|아파트|상가|프라자|스퀘어|파크|관|단지))?(\s*[\d가-힣A-Za-z]+(호|층))?)/);
                    if (addrMatch) address = addrMatch[0].trim();

                    const phoneMatch = text.match(/(02|0\d{1,2})-\d{3,4}-\d{4}/);
                    const phone = phoneMatch ? phoneMatch[0] : '';

                    let category = '';
                    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 1);
                    for (const line of lines.slice(1, 6)) {
                        if (line.length > 2 && line.length < 20 && !line.match(/\d{2,}/) && !line.includes('-') && line !== name && line !== address) {
                            category = line;
                            break;
                        }
                    }

                    businesses.push({ name, url: placeUrl, address: address || '-', phone, category });
                }
                return businesses;
            }
        });

        const all = [];
        for (const r of results) {
            if (r.result && r.result.length > 0) {
                for (const item of r.result) all.push(item);
            }
        }
        const unique = [...new Map(all.map(b => [b.name, b])).values()];
        
        // [v36.0] Post-validate addresses with strict language pattern
        for (const biz of unique) {
            if (biz.address && biz.address !== '-') {
                if (!isValidAddress(biz.address, 'ko')) {
                    console.log(`[v36.0][NaverMap] Address rejected for "${biz.name}": "${biz.address}"`);
                    biz.address = '-';
                }
            }
        }
        
        sendLog(t('log_frame_scan_done', { frameCount: results.length, businessCount: unique.length }));
        return unique;
    } catch (e) {
        sendLog(t('log_naver_map_error', { msg: e.message }));
        return [];
    }
}

async function createOffscreenDocument() {
    if (await chrome.offscreen.hasDocument()) return;
    await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['WORKERS'],
        justification: 'OCR processing (Tesseract.js) requires a Worker environment which is provided by the offscreen context.'
    });
}

async function captureAndOCR(tabId, lang = 'kor') {
    // [v26.0] OCR via Tesseract.js is currently disabled due to MV3 CSP restrictions (Remote importScripts)
    // To restore, tesseract.min.js must be bundled locally in the extension.
    return "";
}

async function scanPageInBrowser(targetUrl, waitMs = 6000, bizName = '') {
    let tab = null;
    try {
        // [v34.6] Enrichment marker to prevent content.js from running Stage 1 loops on Stage 2 targeting
        if (targetUrl.includes('google.') || targetUrl.includes('naver.com') || targetUrl.includes('bing.com')) {
             if (targetUrl.includes('?')) {
                 if (!targetUrl.includes('_enrich=1')) targetUrl += '&_enrich=1';
             } else {
                 if (!targetUrl.includes('#_enrich')) targetUrl += '#_enrich';
             }
        }
        tab = await chrome.tabs.create({ url: targetUrl, active: false });
        
        // [v28.1] Dynamic Polling for Content (especially for Maps)
        const isMapUrl = targetUrl.includes('/maps/') || targetUrl.includes('place.naver.com') || targetUrl.includes('/maps?');
        const maxWait = isMapUrl ? 15000 : 10000;
        const pollInterval = 1000;
        let elapsed = 0;

        while (elapsed < maxWait && !isCancelled) {
            // [v28.1] Check for CAPTCHA lockdown during polling
            await checkLockdown(tab.id);
            if (isCancelled) break;

            const hasData = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    const selectors = [
                        '.L_ecrd_txt_addr', '.place_address', '.b_address', 
                        '.Io6YTe', 'h1.DUwDvf', '.TYaxT', '.b_scardh',
                        '[data-local-attribute="d3adr"]', '.Pb4bU', '.l_staddr',
                        '.VwiC3b', '.b_caption', '.api_subject_bx',
                        '.MjjYud', '.yuRUbf', '.LC20lb', '.rllt__details', // [v29.1] Current Google selectors
                        'div.tF2Cxc', 'h3' // Most generic fallback
                    ];
                    return selectors.some(s => !!document.querySelector(s));
                }
            }).then(r => r[0]?.result).catch(() => false);

            if (hasData) {
                // [v12.5] Aggressive Break: If we have both phone and address, we have enough.
                const hasFullData = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: () => {
                        const pageText = document.body ? document.body.innerText : '';
                        const hasPhone = /\d{2,4}-\d{3,4}-\d{4}/.test(pageText) || /(?:\+?1[-. ]?)?\(?[2-9]\d{2}\)?[-. ]?\d{3}[-. ]?\d{4}/.test(pageText);
                        const hasAddr = document.querySelector('.L_ecrd_txt_addr, .place_address, .b_address, .Io6YTe, .VwiC3b, cite') !== null;
                        return hasPhone && hasAddr;
                    }
                }).then(r => r[0]?.result).catch(() => false);

                if (hasFullData) break;
                if (elapsed >= 3000) break; // [v34.3] Faster recovery for enrichment (3s instead of 5s)
            }
            await new Promise(r => setTimeout(r, getDelay(pollInterval)));
            elapsed += pollInterval;
            if (!isMapUrl && elapsed >= Math.max(waitMs, 3000)) break; 
        }

        const storage = await chrome.storage.local.get(['language', 'region', 'geminiKey']);
        const hl = storage.language || 'en', gl = storage.region || 'us';

        const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id, allFrames: true },
            func: (region, lang) => {
                const pageText = document.body ? document.body.innerText : '';
                const h = window.location.hostname;
                const isGoogle = h.includes('google.');
                const isNaver = h.includes('naver.com');
                const isBing = h.includes('bing.com');
                let phone = '', address = '', homepage = '';
                
                if (isGoogle) {
                    // [v36.2] Precise Google address selectors - removed .Io6YTe (used for descriptions too)
                    // and .rllt__details div:nth-child(3) (grabs "years in business" text)
                    const gAddr = document.querySelector('[data-attrid="kc:/local:address"], [data-local-attribute="d3adr"], .L_ecrd_txt_addr, [data-atp], .LrzXr, button[aria-label^="Address:"], a[aria-label^="Address:"], .y35z8c, div.Z26q7c, .rogA2c .Io6YTe');
                    if (gAddr) address = (gAddr.innerText || gAddr.getAttribute('aria-label')).replace(/^Address:|^주소:/i, '').trim();
                    // [v36.2] Post-clean: reject Google SERP description text that leaked as address
                    if (address) {
                        const addrLo = address.toLowerCase();
                        const serpNoisePatterns = [
                            /\b\d+\+?\s*years?\s+(in|of)\s+business/i,
                            /\bOpen\s*(24|now|until|today|tomorrow|Hours?)/i,
                            /\bClosed\s*(now|until|today|tomorrow)?/i,
                            /\bIn-store\b|\bCurbside\b|\bDelivery\b|\bTakeout\b|\bDine.in\b/i,
                            /\b\d+\.?\d*\s*(mi|km|miles?|kilometers?)\b/i,
                            /\b(Rating|Reviews?|Stars?)\s*[:·]?\s*\d/i,
                            /\b\$\$?\$?\$?\b/,
                            /^\d+\s*\(\d+\)$/,
                            /\bGoogle\s*(rating|review)/i,
                            /^[^,]+\u00B7\s*[^,]+$/,
                        ];
                        if (serpNoisePatterns.some(p => p.test(address))) address = '';
                    }
                    const gTel = document.querySelector('.L_ecrd_txt_tel, [data-dtype="d3ph"] span, .Lrzyb, .uO797e, [data-item-id^="phone:tel:"], span[data-item-id^="phone:tel:"], [data-attrid="kc:/local:phone"], [data-local-attribute="d3ph"], button[aria-label^="Phone:"], a[aria-label^="Phone:"]');
                    if (gTel) phone = (gTel.innerText || gTel.getAttribute('aria-label')).replace(/^Phone:|^전화번호:/i, '').trim();
                    const gWeb = document.querySelector('a.ab_button[href*="http"], a.mI8Ptc[href*="http"], a.QqG1Nd[href*="http"], a.external[href*="http"], a[data-footer-url*="http"], .yuRUbf a[href*="http"], a[data-item-id="authority"], a[aria-label="Website"], a[aria-label="WEBSITE"], a[aria-label*="홈페이지"]');
                    if (gWeb) {
                        let href = gWeb.href || gWeb.getAttribute('data-footer-url');
                        if (href && href.includes('google.') && href.includes('url?q=')) {
                            try { href = new URL(href).searchParams.get('q') || href; } catch(e){}
                        }
                        if (href && !href.includes('google.')) homepage = href;
                    }
                } else if (isNaver) {
                    const nAddr = document.querySelector('.place_address, .Pb4bU, .fds-vlist-base-item-sub-title, .LDvAH, ._address, .addr');
                    if (nAddr) address = nAddr.innerText.trim();
                    const nTel = document.querySelector('.place_list_item_tel, .fds-vlist-base-item-tel, [class*="tel"], .xl88P, ._phone');
                    if (nTel) phone = nTel.innerText.trim();
                    const nWeb = document.querySelector('a.place_bluelink[href*="http"], a.fds-vlist-base-item-title a[href*="http"], a.CHmqa, a._site');
                    if (nWeb && !nWeb.href.includes('naver.com')) homepage = nWeb.href;
                } else if (isBing) {
                    const bAddr = document.querySelector('.b_address, .l_staddr, .b_h_adr, .b_factrow div, [data-feedback-id="maps_address"], .b_vList_subtitle, [aria-label*="Address"]');
                    if (bAddr) address = bAddr.innerText.trim();
                    const bTel = document.querySelector('.b_phone, .l_sttel, .tel, .b_h_ph, .b_factrow span, [data-feedback-id="maps_phone"], .b_vList_tel, [aria-label*="Phone"]');
                    if (bTel) phone = bTel.innerText.trim();
                    const bWeb = document.querySelector('a[aria-label="Website"], a[aria-label="WEBSITE"], .l_stweb, .ent_site, .b_place_card_website, a.b_wide_pill[href*="http"], a.b_btn_action[title*="Website"]');
                    if (bWeb) homepage = bWeb.href;
                }

                const emailSet = new Set();
                const uiSelectors = ['.login', '.profile', '.user', '.account', '.session', '.auth', '.member', '[class*="login"]', '[class*="profile"]', '[class*="user"]', '[class*="account"]', '[id*="login"]', '[id*="profile"]', '[id*="user"]', '[id*="account"]'];
                const bodyClone = document.body.cloneNode(true);
                uiSelectors.forEach(sel => bodyClone.querySelectorAll(sel).forEach(el => el.remove()));
                
                document.querySelectorAll('a[href^="mailto:"]').forEach(a => {
                    const em = a.href.replace(/^mailto:/i, '').split('?')[0].trim().toLowerCase();
                    if (em && em.includes('@')) emailSet.add(em);
                });

                const rawText = bodyClone.textContent.replace(/\s*[\[\(\{]at[\]\)\}]\s*/gi, '@').replace(/\s*[\[\(\{]dot[\]\)\}]\s*/gi, '.');
                const excludePrefixes = ['noreply', 'no-reply', 'admin', 'webmaster', 'postmaster', 'hostmaster', 'login', 'signin', 'signup', 'register', 'logout', 'user', 'member', 'account', 'profile', 'session', 'token', 'anonymous', 'test', 'dev', 'developer', 'root', 'null', 'undefined', 'placeholder', 'mailer-daemon', 'support', 'help', 'info@google', 'info@naver', 'goodkie', 'vivpr', 'studioberry', 'feedback', 'contact@', 'marketing', 'sales', 'billing', 'privacy'];
                const excludeDomains = ['sentry.io', 'wixpress.com', 'example.com', 'test.com', 'localhost', 'sentry.', 'bugsnag.', 'newrelic.', 'datadog.', 'hotjar.', 'optimizely.', 'pstatic.net', 'google.com'];
                const emailMatches = rawText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
                if (emailMatches) emailMatches.forEach(e => {
                    const el = e.toLowerCase();
                    if (/\.(png|jpg|gif|svg|css|js|ico)$/i.test(el)) return;
                    if (excludeDomains.some(d => el.includes(d))) return;
                    if (excludePrefixes.some(p => el.split('@')[0].includes(p))) return; // [v31.10] Changed to 'includes' for more robust prefix filtering
                    emailSet.add(el);
                });

                if (!phone) {
                    const telLink = document.querySelector('a[href^="tel:"]');
                    if (telLink) phone = telLink.href.replace(/^tel:/i, '').trim();
                }
                if (!phone) {
                    const krPhone = pageText.match(/(02|0\d{1,2}|010|1588|1577|1544|1800|1600)-\d{3,4}-\d{4}/);
                    if (krPhone) phone = krPhone[0];
                }
                
                // [v36.1] Negative-Reject Address Validation (inline for executeScript scope)
                // Accept addresses from search engine DOM by default, only reject obvious noise
                const addrBlacklist = ['privacy', 'policy', 'terms', 'contact', 'login', 'search', 'menu', 'navigation', 'about', 'copyright', 'reserved', 'cookies', 'admin', '개인정보', '이용약관', '로그인', '회원가입', '고객센터', '사이트맵', '공지사항', 'プライバシー', '規約', 'ログイン', '菜单', '设置'];
                const addrNoiseExact = new Set(['home', 'menu', 'login', 'signup', 'register', 'logout', 'search', 'contact', 'about', 'help', 'support', 'faq', 'blog', 'news', 'careers', 'gallery', 'pricing', 'cart', 'checkout', 'profile', 'settings', 'dashboard', 'shop', 'store', 'more', 'less', '로그인', '회원가입', '메뉴', '검색', '홈', '더보기', '닫기', '설정', 'ログイン', '検索', 'メニュー', 'ホーム', '設定', '登录', '注册', '搜索', '菜单', '首页', '设置']);
                const negativeValidate = (a) => {
                    if (!a) return false;
                    const t = a.trim();
                    if (t.length < 5 || t.length > 300) return false;
                    if ((t.match(/\n/g) || []).length >= 3) return false;
                    const lo = t.toLowerCase();
                    if (addrNoiseExact.has(lo)) return false;
                    if (addrBlacklist.some(w => lo.includes(w))) return false;
                    if (/^https?:\/\//i.test(t) || /^www\./i.test(t)) return false;
                    if (/^[\d\s\-().+]+$/.test(t)) return false;
                    if (/^[a-zA-Z0-9._%+-]+@/.test(t)) return false;
                    if (/^(click|tap|press|scroll|view all|see all|see more|read more|learn more|buy now|shop now|order now|book now|call us|visit us|check out|start now|join now|follow us|sign up|sign in|log in|log out)\b/i.test(t)) return false;
                    // [v36.2] SERP description noise - NOT addresses
                    if (/\b\d+\+?\s*years?\s+(in|of)\s+business/i.test(t)) return false;
                    if (/\bOpen\s*(24|now|until|today|tomorrow|Hours?)/i.test(t)) return false;
                    if (/\bClosed\s*(now|until|today|tomorrow)?$/i.test(t)) return false;
                    if (/\b\d+\.?\d*\s*(mi|km|miles?|kilometers?)\b/i.test(t)) return false;
                    if (/\b(Rating|Reviews?|Stars?)\s*[:·]?\s*\d/i.test(t)) return false;
                    if (/\b\$\$?\$?\$?\b/.test(t) && t.length < 30) return false;
                    if (/\b(In-store|Curbside|Delivery|Takeout|Dine.in)\b/i.test(t)) return false;
                    // [v36.2] Middle-dot separator: reject if part before · doesn't look like address
                    if (/\u00B7/.test(t)) {
                        const bd = t.split('\u00B7')[0].trim();
                        if (!/^\d/.test(bd) && !/\b(St|Ave|Rd|Blvd|Dr|Ln|Way|Ct|Pl|Hwy|Suite|Ste|Apt|Floor|Fl)\b/i.test(bd)) return false;
                    }
                    if (!/[a-zA-Z\u00C0-\u024F\u4e00-\u9fff\uac00-\ud7a3\u3040-\u30FF]/.test(t)) return false;
                    return true;
                };

                if (address && !negativeValidate(address)) address = '';

                if (!address) {
                    // [v36.2] More precise fallback: itemprop is structured data, class*=address is too broad
                    const genericAddr = document.querySelector('[itemprop="address"], [itemtype*="PostalAddress"], .address-line, .street-address');
                    if (genericAddr) {
                        const cand = genericAddr.innerText.trim();
                        if (negativeValidate(cand)) address = cand;
                    }
                }
                if (!phone) {
                    const genericTel = document.querySelector('[itemprop="telephone"], [class*="phone"], [class*="tel"]');
                    if (genericTel) phone = genericTel.innerText.trim();
                }

                const sns = new Set();
                const skipHomepage = ['pstatic.net', 'google.com', 'google.co', 'googleapis.com', 'gstatic.com', 'yahoo.com', 'yahoo.co.jp', 'bing.com'];
                document.querySelectorAll('a[href]').forEach(a => {
                    let href = a.href;
                    if (!href || !href.startsWith('http')) return;
                    
                    if (href.includes('google.') && href.includes('/url?')) {
                        try {
                            const q = new URL(href).searchParams.get('q');
                            if (q) href = q;
                        } catch(e) {}
                    }

                    const lowerHref = href.toLowerCase();
                    if (lowerHref.includes('instagram.com/') || 
                        lowerHref.includes('facebook.com/') || 
                        lowerHref.includes('twitter.com/') || 
                        lowerHref.includes('x.com/') ||
                        lowerHref.includes('linkedin.com/company/') ||
                        lowerHref.includes('youtube.com/') ||
                        lowerHref.includes('tiktok.com/') ||
                        lowerHref.includes('pinterest.com/')) {
                        sns.add(href.split('?')[0]);
                    }
                    
                    // [v29.0] Precision homepage: Only use first organic result link (yuRUbf) or authority link
                    if (!homepage && !skipHomepage.some(d => lowerHref.includes(d))) {
                        const parent = a.closest('.yuRUbf, .b_algo h2, .api_subject_bx, [data-item-id="authority"]');
                        if (parent) homepage = href.split('?')[0];
                    }
                });

                if (!homepage && isGoogle) {
                    const organicLinks = Array.from(document.querySelectorAll('#search a[href*="http"], #rso a[href*="http"]'));
                    for (const a of organicLinks) {
                        let href = a.href;
                        if (href.includes('google.') && href.includes('/url?')) {
                            try { const q = new URL(href).searchParams.get('q'); if(q) href=q; } catch(e){}
                        }
                        const lowHref = href.toLowerCase();
                        // Filter out SNS/Maps/Technical domains
                        const isTechnical = skipHomepage.some(d => lowHref.includes(d));
                        const isSNS = sns.has(href.split('?')[0]) || lowHref.includes('instagram.com') || lowHref.includes('facebook.com') || lowHref.includes('twitter.com') || lowHref.includes('x.com');
                        const isMap = lowHref.includes('google.com/maps') || lowHref.includes('naver.com/place') || lowHref.includes('map.naver.com');
                        
                        if (href && !href.includes('google.') && !isTechnical && !isSNS && !isMap) {
                            homepage = href.split('?')[0];
                            break;
                        }
                    }
                }

                const bizMatch = pageText.match(/([0-9]{3}-[0-9]{2}-[0-9]{5})/);
                const ownerMatch = pageText.match(/(?:대표자|대표|대표이사)[:\s]*([가-힣\s]{2,10})/);

                return {
                    emails: [...emailSet].join(', '),
                    phone, address, homepage, sns: [...sns],
                    bizNumber: bizMatch ? bizMatch[1] : '',
                    owner: ownerMatch ? ownerMatch[1] : '',
                    rating: '', category: '', pageText: pageText.substring(0, 10000)
                };
            },
            args: [gl, hl]
        });

        let best = { emails: '', phone: '', address: '', homepage: '', sns: [], bizNumber: '', owner: '', rating: '', category: '', pageText: '' };
        for (const r of results) {
            if (!r.result) continue;
            const d = r.result;
            if (d.emails && !best.emails) best.emails = d.emails;
            if (d.phone && !best.phone) best.phone = d.phone;
            if (d.address && !best.address) best.address = d.address;
            if (d.homepage && !best.homepage) {
                let h = d.homepage;
                if (h && !h.startsWith('http')) h = 'http://' + h;
                best.homepage = h;
            }
            if (d.sns && d.sns.length > best.sns.length) best.sns = d.sns;
            if (d.bizNumber && !best.bizNumber) best.bizNumber = d.bizNumber;
            if (d.owner && !best.owner) best.owner = d.owner;
            if (d.pageText && d.pageText.length > best.pageText.length) best.pageText = d.pageText;
        }
        return best;
    } catch (e) {
        return { emails: '', phone: '', address: '', homepage: '', sns: [], bizNumber: '', owner: '', rating: '', category: '', pageText: '' };
    } finally {
        if (tab) await safeRemoveTab(tab.id);
    }
}

async function scrapeBusinessWebsite(url, targetOption = 'all', hl = 'en', gl = 'us', waitMs = 4500) {
    if (!url || !url.startsWith('http')) return null;
    let tab = null;
    try {
        let targetUrl = url;
        if (targetUrl.includes('google.') || targetUrl.includes('naver.com') || targetUrl.includes('bing.com')) {
             if (targetUrl.includes('?')) {
                 if (!targetUrl.includes('_enrich=1')) targetUrl += '&_enrich=1';
             } else {
                 if (!targetUrl.includes('#_enrich')) targetUrl += '#_enrich';
             }
        }
        tab = await chrome.tabs.create({ url: targetUrl, active: false });
        await new Promise(r => setTimeout(r, waitMs));
        await checkPause(); // [v18.6] Respect pause after initial load
        
        // 1. Scrape Homepage
        const homepageRaw = await chrome.scripting.executeScript({
            target: { tabId: tab.id, allFrames: true },
            func: async (docLang) => {
                const results = { emails: [], sns: [], phone: '', contactLinks: [], address: '' };
                
                // Mini-scroll for lazy-loading SPAs
                try {
                    for (let i = 1; i <= 3; i++) {
                        window.scrollTo(0, document.body.scrollHeight / 3 * i);
                        await new Promise(r => setTimeout(r, 400));
                    }
                } catch(e) {}

                const currentOrigin = window.location.origin;
                const emailSet = new Set();
                const snsSet = new Set();
                const linkSet = new Set();

                // Decode obfuscated [at] / (dot)
                const textDecoder = (txt) => txt.replace(/\s*[\[\(\{]at[\]\)\}]\s*/gi, '@').replace(/\s*[\[\(\{]dot[\]\)\}]\s*/gi, '.');
                const bodyText = textDecoder(document.body ? document.body.innerText : '');
                
                const emailMatches = bodyText.match(/[a-zA-Z0-9._%+-]+@(?!(pstatic\.net|google\.com|example\.com))[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
                if (emailMatches) emailMatches.forEach(e => emailSet.add(e.toLowerCase()));

                document.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
                    try {
                        const data = JSON.parse(script.innerText);
                        const extractLDEmail = (obj) => {
                            if (!obj) return;
                            if (typeof obj === 'string') {
                                const m = obj.match(/[a-zA-Z0-9._%+-]+@(?!(pstatic\.net|google\.com|gmail\.com|example\.com))[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
                                if (m) emailSet.add(m[0].toLowerCase());
                            } else if (typeof obj === 'object') {
                                if (obj.email) {
                                    if (typeof obj.email === 'string') emailSet.add(obj.email.toLowerCase());
                                    else if (Array.isArray(obj.email)) obj.email.forEach(e => emailSet.add(String(e).toLowerCase()));
                                }
                                if (obj.telephone && !results.phone) results.phone = String(obj.telephone);
                                Object.values(obj).forEach(extractLDEmail);
                            }
                        };
                        extractLDEmail(data);
                    } catch(e){}
                });

                document.querySelectorAll('a[href], button[onclick], [role="button"]').forEach(el => {
                    let href = el.getAttribute('href') || '';
                    if (!href && el.getAttribute('onclick')) {
                        const m = el.getAttribute('onclick').match(/location\.href=['"]([^'"]+)['"]/);
                        if (m) href = m[1];
                    }
                    if (!href) return;
                    
                    let absoluteUrl = '';
                    try { absoluteUrl = new URL(href, window.location.href).href; } catch (e) { return; }

                    const lowerHref = absoluteUrl.toLowerCase();
                    const text = (el.innerText || '').toLowerCase();

                    if (lowerHref.includes('instagram.com/') || lowerHref.includes('facebook.com/') || 
                        lowerHref.includes('twitter.com/') || lowerHref.includes('x.com/') ||
                        lowerHref.includes('youtube.com/') || lowerHref.includes('linkedin.com/company/')) {
                        snsSet.add(absoluteUrl.split('?')[0]);
                    }
                    if (lowerHref.startsWith('mailto:')) {
                        const em = lowerHref.replace(/^mailto:/i, '').split('?')[0].trim();
                        if (em && em.includes('@')) emailSet.add(em);
                    }
                    if (lowerHref.startsWith('tel:') && !results.phone) {
                        results.phone = lowerHref.replace(/^tel:/i, '').trim();
                    }

                    const indicators = ['contact', 'about', 'support', 'inquiry', 'mail', 'info', 'help', 'location', 'map', 'service', '문의', '소개', '주소', '지점', '오시는길', '찾아오시는길', '고객센터', 'directions'];
                    const isBinary = /\.(pdf|zip|jpg|jpeg|png|gif|exe)$/i.test(lowerHref);
                    const isAction = /^(mailto:|tel:|javascript:|#)/i.test(href);

                    if (indicators.some(ind => text.includes(ind) || lowerHref.includes(ind)) && !isBinary && !isAction) {
                        const linkHostname = new URL(absoluteUrl).hostname;
                        const currentHostname = window.location.hostname;
                        if (linkHostname.includes(currentHostname.replace('www.', '')) || linkHostname === currentHostname) {
                            linkSet.add(absoluteUrl);
                        }
                    }
                });

                // [v36.3] Extract address from footer and structured data on homepage
                // Priority 1: JSON-LD structured data
                let footerAddr = '';
                document.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
                    if (footerAddr) return;
                    try {
                        const data = JSON.parse(script.innerText);
                        const findAddr = (obj) => {
                            if (!obj || footerAddr) return;
                            if (obj.address) {
                                if (typeof obj.address === 'string') { footerAddr = obj.address; return; }
                                if (typeof obj.address === 'object') {
                                    const a = obj.address;
                                    const parts = [a.streetAddress, a.addressLocality, a.addressRegion, a.postalCode, a.addressCountry].filter(Boolean);
                                    if (parts.length >= 2) { footerAddr = parts.join(', '); return; }
                                }
                            }
                            if (typeof obj === 'object' && !Array.isArray(obj)) {
                                Object.values(obj).forEach(findAddr);
                            } else if (Array.isArray(obj)) {
                                obj.forEach(findAddr);
                            }
                        };
                        findAddr(data);
                    } catch(e){}
                });
                
                // Priority 2: Footer & Contact section DOM selectors
                if (!footerAddr) {
                    const addrSels = [
                        'footer [itemprop="address"]', '#footer [itemprop="address"]', '.footer [itemprop="address"]',
                        '[itemtype*="PostalAddress"]', '[itemprop="streetAddress"]',
                        'footer .address', '#footer .address', '.site-footer .address',
                        '.contact-info .address', '.contact-address', '.location-address',
                        'footer address', '#footer address', '.footer address',
                        '.footer-contact', '.footer-address', '.footer-info',
                        '[class*="contact"] [class*="address"]', '[id*="contact"] [class*="address"]',
                        '.vcard .adr', '.h-card .p-street-address'
                    ];
                    for (const sel of addrSels) {
                        const el = document.querySelector(sel);
                        if (el) {
                            const txt = el.innerText.trim().replace(/\n+/g, ', ').replace(/\s{2,}/g, ' ');
                            if (txt.length >= 5 && txt.length <= 200) { footerAddr = txt; break; }
                        }
                    }
                }

                // Priority 3: Language-specific regex patterns on page text (fallback)
                if (!footerAddr) {
                    const stage3AddrPatterns = {
                        ko: /([가-힣]{2,5}(?:특별시|광역시|도|시|군|구|읍|면|동|가|로|길)\s+[가-힣0-9\s,-]+(?:층|호|길|로|동|리|번지|타워|빌딩|센터|빌라|아파트))/g,
                        en: /\d+[\w\s,]+(Street|St\.?|Avenue|Ave\.?|Road|Rd\.?|Boulevard|Blvd\.?|Drive|Dr\.?|Lane|Ln\.?|Way|Court|Ct\.?|Place|Pl\.?|Square|Sq\.?|Circle|Cir|Highway|Hwy|Pkwy|Loop|Trail|Parkway)[\w\s,]*(?:[A-Z]{2}\s*\d{5}(?:-\d{4})?)?/gi,
                        ja: /(?:東京都|北海道|(?:京都|大阪)府|.{2,3}県)(?:.{1,10}市|.{1,10}郡|.{1,10}区)(?:(?:.{1,10}(?:町|村|字|番|丁目))|(?:.{1,10})).{0,20}[\d-]{1,10}/g,
                        zh: /(?:.{2,5}省|.{2,5}自治区|.{2,5}市)(?:.{2,5}市|.{2,5}区|.{2,5}县|.{2,5}镇)(?:.{2,10}路|.{2,10}街|.{2,10}道|.{2,10}巷).{1,10}[\d-]+/g,
                        de: /[A-Za-zÄÖÜäöüß\s.-]+\s+\d+[a-z]?\s*,?\s*\d{5}\s+[A-Za-zÄÖÜäöüß\s.-]+/g,
                        fr: /\d{1,4}\s+(?:rue|avenue|av|boulevard|blvd|place|quai|chemin|impasse|allée|r\.)\s+[A-Za-zÀ-ÿ\s'-]+,?\s*\d{5}\s+[A-Za-zÀ-ÿ\s'-]+/gi,
                        es: /(?:Calle|C\/|Avenida|Avda\.|Plaza|Paseo|Ronda|Travesía|Carretera)\s+[A-Za-zÀ-ÿ\s'-]+\s+\d+,?\s*\d{5}\s+[A-Za-zÀ-ÿ\s'-]+/gi,
                        it: /(?:Via|Viale|Piazza|Corso|Largo|Vicolo|Contrada|Borgo)\s+[A-Za-zÀ-ÿ\s'-]+\s+\d+,?\s*\d{5}\s+[A-Za-zÀ-ÿ\s'-]+/gi,
                        pt: /(?:Rua|Avenida|Av\.|Praça|Travessa|Alameda|Largo|Estrada)\s+[A-Za-zÀ-ÿ\s'-]+\s+\d+,?\s*\d{4,8}[\s-]?\d{0,3}/gi,
                        id: /(?:Jalan|Jl\.|Gang|Gg\.)\s+[A-Za-z0-9\s.'-]+(?:No\.?\s*\d+)?/gi
                    };

                    const footerEl = document.querySelector('footer, #footer, .footer, .site-footer');
                    // bodyText is defined earlier in the executeScript as textDecoder(document.body ? document.body.innerText : '')
                    const searchTexts = [footerEl ? footerEl.innerText : '', bodyText];
                    const addrPattern = stage3AddrPatterns[docLang] || stage3AddrPatterns['en'];
                    const stage3Blacklist = ['privacy', 'policy', 'terms', 'login', 'menu', 'copyright', '개인정보', '이용약관', 'プライバシー', '規約', '菜单'];
                    
                    for (const srcText of searchTexts) {
                        if (footerAddr) break;
                        const candidates = srcText.match(addrPattern) || [];
                        const valid = candidates.filter(a => {
                            const t = a.trim();
                            if (t.length < 8 || t.length > 200) return false;
                            if (!/\d/.test(t)) return false;
                            if (/https?:\/\//i.test(t)) return false;
                            const lo = t.toLowerCase();
                            return !stage3Blacklist.some(w => lo.includes(w));
                        }).sort((a, b) => b.length - a.length);
                        if (valid.length > 0) footerAddr = valid[0].trim();
                    }
                }
                
                results.address = footerAddr;
                results.emails = [...emailSet];
                results.sns = [...snsSet];
                results.contactLinks = [...linkSet];
                return results;
            },
            args: [hl]
        }).catch(() => null);

        if (!homepageRaw || homepageRaw.length === 0) return null;

        // Aggregate across all frames
        const homepageResult = { emails: new Set(), sns: new Set(), phone: '', address: '', contactLinks: [] };
        for (const frame of homepageRaw) {
            if (!frame.result) continue;
            frame.result.emails.forEach(e => homepageResult.emails.add(e));
            frame.result.sns.forEach(s => homepageResult.sns.add(s));
            if (frame.result.phone && !homepageResult.phone) homepageResult.phone = frame.result.phone;
            if (frame.result.address && !homepageResult.address) homepageResult.address = frame.result.address;
            
            // Score links outside executeScript to fix ReferenceError
            frame.result.contactLinks.forEach(link => {
                const score = typeof rankContactUrl !== 'undefined' ? rankContactUrl(link) : 10;
                homepageResult.contactLinks.push({ url: link, priority: score });
            });
        }


        let finalEmails = new Set(homepageResult.emails);
        let finalSns = new Set(homepageResult.sns);
        let finalPhone = homepageResult.phone;

        // 2. Proactive & Deep Crawl Contact Pages if Info Missing
        const needsMore = (targetOption === 'email' && finalEmails.size === 0) || 
                          (targetOption === 'sns' && finalSns.size === 0) || 
                          (targetOption === 'all');

        if (needsMore) {
            const currentUrl = new URL(url);
            const domainBase = `${currentUrl.protocol}//${currentUrl.hostname}${currentUrl.port ? ':' + currentUrl.port : ''}`;
            
            // Combine discovered links with proactive guesses
            let allCandidates = [...homepageResult.contactLinks];
            
            // Add proactive guesses if no strong contact link found or if we need more breadth
            if (allCandidates.length < 5) {
                PROACTIVE_CONTACT_CANDIDATES.forEach(path => {
                    const candidateUrl = domainBase + path;
                    if (!allCandidates.some(c => c.url === candidateUrl)) {
                        const score = rankContactUrl(path);
                        allCandidates.push({ url: candidateUrl, priority: score });
                    }
                });
            }

            // Sort by priority and limit
            const sortedLinks = allCandidates
                .sort((a, b) => b.priority - a.priority)
                .map(l => l.url);

            const topLinks = Array.from(new Set(sortedLinks)).slice(0, 5); // Scan top 5 unique candidates
            for (const link of topLinks) {
                if (isCancelled) break;
                await checkPause(); // [v36.8] Respect manual pause during Stage 3 probing
                try {
                    const score = rankContactUrl(link);
                    sendLog(`  🕵️ [Stage 3] Probing candidate: ${link} (Priority Score: ${score})`);
                    await chrome.tabs.update(tab.id, { url: link });
                    await new Promise(r => setTimeout(r, getDelay(5000))); // Increased wait for heavy pages
                    await checkPause(); // [v18.6] Respect pause after contact page load
                    const subRaw = await chrome.scripting.executeScript({
                        target: { tabId: tab.id, allFrames: true },
                        func: async (docLang) => {
                            // Mini-scroll
                            try {
                                for (let i = 1; i <= 3; i++) {
                                    window.scrollTo(0, document.body.scrollHeight / 3 * i);
                                    await new Promise(r => setTimeout(r, 400));
                                }
                            } catch(e) {}

                            const emails = new Set();
                            const sns = new Set();
                            let phoneStr = '';
                            let addressStr = '';
                            
                            const textDecoder = (txt) => txt.replace(/\s*[\[\(\{]at[\]\)\}]\s*/gi, '@').replace(/\s*[\[\(\{]dot[\]\)\}]\s*/gi, '.');
                            const uiSelectors = ['.login', '.profile', '.user', '.account', '.session', '.auth', '.member', '[class*="login"]', '[class*="profile"]', '[class*="user"]', '[class*="account"]', '[id*="login"]', '[id*="profile"]', '[id*="user"]', '[id*="account"]'];
                            const bodyClone = document.body.cloneNode(true);
                            uiSelectors.forEach(sel => bodyClone.querySelectorAll(sel).forEach(el => el.remove()));
                            
                            const excludePrefixes = ['noreply', 'no-reply', 'admin', 'webmaster', 'postmaster', 'hostmaster', 'login', 'signin', 'signup', 'register', 'logout', 'user', 'member', 'account', 'profile', 'session', 'token', 'anonymous', 'test', 'dev', 'developer', 'root', 'null', 'undefined', 'placeholder', 'mailer-daemon', 'support', 'help', 'info@google', 'info@naver', 'goodkie', 'vivpr', 'studioberry', 'feedback', 'contact@', 'marketing', 'sales', 'billing', 'privacy'];
                            const excludeDomains = ['sentry.io', 'wixpress.com', 'example.com', 'test.com', 'localhost', 'sentry.', 'bugsnag.', 'newrelic.', 'datadog.', 'hotjar.', 'optimizely.', 'pstatic.net', 'google.com'];

                            const bodyText = textDecoder(bodyClone.textContent || '');
                            
                            // [v15.1] CMS Aware Extraction: Include hidden/meta data and Wix specific selectors
                            // [v31.0] Normalizing Email Extraction: Include gmail/naver/etc.
                            // [v31.10] Applying strict filters consistent with Stage 2
                            const rawMatches = bodyText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
                            
                            // Check meta tags and specific Wix/CMS selectors
                            const metaDesc = document.querySelector('meta[name="description"]')?.content || "";
                            const metaMatches = textDecoder(metaDesc).match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
                            
                            const cmsTexts = [...document.querySelectorAll('.wixui-rich-text, .site-footer, #footer, .contact-info, iframe')].map(el => el.innerText || '').join(' ');
                            const cmsMatches = textDecoder(cmsTexts).match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];

                            [...rawMatches, ...metaMatches, ...cmsMatches].forEach(e => {
                                const el = e.toLowerCase();
                                if (excludeDomains.some(d => el.includes(d))) return;
                                if (excludePrefixes.some(p => el.split('@')[0].includes(p))) return;
                                emails.add(el);
                            });

                            document.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
                                try {
                                    const data = JSON.parse(script.innerText);
                                    const extractLDEmail = (obj) => {
                                        if (!obj) return;
                                        if (typeof obj === 'string') {
                                            const m = obj.match(/[a-zA-Z0-9._%+-]+@(?!(pstatic\.net|google\.com|example\.com))[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
                                            if (m) emails.add(m[0].toLowerCase());
                                        } else if (typeof obj === 'object') {
                                            if (obj.email) {
                                                if (typeof obj.email === 'string') emails.add(obj.email.toLowerCase());
                                                else if (Array.isArray(obj.email)) obj.email.forEach(e => emails.add(String(e).toLowerCase()));
                                            }
                                            if (obj.telephone && !phoneStr) phoneStr = String(obj.telephone);
                                            Object.values(obj).forEach(extractLDEmail);
                                        }
                                    };
                                    extractLDEmail(data);
                                } catch(e){}
                            });

                            // Phone Extraction
                            const phoneRegex = (docLang === 'ko') ? /(?:0[2-9]|010|15\d{2}|16\d{2}|18\d{2})[-. ]?\d{3,4}[-. ]?\d{4}/g : /(?:\+?1[-. ]?)?\(?[2-9][0-8][0-9]\)?[-. ]?[2-9][0-9]{2}[-. ]?[0-9]{4}/g;
                            const phoneMatches = bodyText.match(phoneRegex) || [];
                            if (phoneMatches.length > 0) phoneStr = phoneMatches[0];

                            // [v36.3] 3-Priority Address Extraction from Contact Page & Footer
                            // Priority 1: JSON-LD Structured Data (most reliable)
                            document.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
                                if (addressStr) return;
                                try {
                                    const data = JSON.parse(script.innerText);
                                    const findAddr = (obj) => {
                                        if (!obj || addressStr) return;
                                        if (obj.address) {
                                            if (typeof obj.address === 'string') { addressStr = obj.address; return; }
                                            if (typeof obj.address === 'object') {
                                                const a = obj.address;
                                                const parts = [a.streetAddress, a.addressLocality, a.addressRegion, a.postalCode, a.addressCountry].filter(Boolean);
                                                if (parts.length >= 2) { addressStr = parts.join(', '); return; }
                                            }
                                        }
                                        if (typeof obj === 'object' && !Array.isArray(obj)) Object.values(obj).forEach(findAddr);
                                        else if (Array.isArray(obj)) obj.forEach(findAddr);
                                    };
                                    findAddr(data);
                                } catch(e){}
                            });

                            // Priority 2: Footer & Contact section DOM selectors
                            if (!addressStr) {
                                const addrSels = [
                                    'footer [itemprop="address"]', '#footer [itemprop="address"]', '.footer [itemprop="address"]',
                                    '[itemtype*="PostalAddress"]', '[itemprop="streetAddress"]',
                                    'footer .address', '#footer .address', '.site-footer .address',
                                    '.contact-info .address', '.contact-address', '.location-address',
                                    'footer address', '#footer address', '.footer address',
                                    '.footer-contact', '.footer-address', '.footer-info',
                                    '[class*="contact"] [class*="address"]', '[id*="contact"] [class*="address"]',
                                    '.vcard .adr', '.h-card .p-street-address'
                                ];
                                for (const sel of addrSels) {
                                    const el = document.querySelector(sel);
                                    if (el) {
                                        const txt = el.innerText.trim().replace(/\n+/g, ', ').replace(/\s{2,}/g, ' ');
                                        if (txt.length >= 5 && txt.length <= 200) { addressStr = txt; break; }
                                    }
                                }
                            }

                            // Priority 3: Language-specific regex patterns on page text (fallback)
                            if (!addressStr) {
                                const stage3AddrPatterns = {
                                    ko: /([가-힣]{2,5}(?:특별시|광역시|도|시|군|구|읍|면|동|가|로|길)\s+[가-힣0-9\s,-]+(?:층|호|길|로|동|리|번지|타워|빌딩|센터|빌라|아파트))/g,
                                    en: /\d+[\w\s,]+(Street|St\.?|Avenue|Ave\.?|Road|Rd\.?|Boulevard|Blvd\.?|Drive|Dr\.?|Lane|Ln\.?|Way|Court|Ct\.?|Place|Pl\.?|Square|Sq\.?|Circle|Cir|Highway|Hwy|Pkwy|Loop|Trail|Parkway)[\w\s,]*(?:[A-Z]{2}\s*\d{5}(?:-\d{4})?)?/gi,
                                    ja: /(?:東京都|北海道|(?:京都|大阪)府|.{2,3}県)(?:.{1,10}市|.{1,10}郡|.{1,10}区)(?:(?:.{1,10}(?:町|村|字|番|丁目))|(?:.{1,10})).{0,20}[\d-]{1,10}/g,
                                    zh: /(?:.{2,5}省|.{2,5}自治区|.{2,5}市)(?:.{2,5}市|.{2,5}区|.{2,5}县|.{2,5}镇)(?:.{2,10}路|.{2,10}街|.{2,10}道|.{2,10}巷).{1,10}[\d-]+/g,
                                    de: /[A-Za-zÄÖÜäöüß\s.-]+\s+\d+[a-z]?\s*,?\s*\d{5}\s+[A-Za-zÄÖÜäöüß\s.-]+/g,
                                    fr: /\d{1,4}\s+(?:rue|avenue|av|boulevard|blvd|place|quai|chemin|impasse|allée|r\.)\s+[A-Za-zÀ-ÿ\s'-]+,?\s*\d{5}\s+[A-Za-zÀ-ÿ\s'-]+/gi,
                                    es: /(?:Calle|C\/|Avenida|Avda\.|Plaza|Paseo|Ronda|Travesía|Carretera)\s+[A-Za-zÀ-ÿ\s'-]+\s+\d+,?\s*\d{5}\s+[A-Za-zÀ-ÿ\s'-]+/gi,
                                    it: /(?:Via|Viale|Piazza|Corso|Largo|Vicolo|Contrada|Borgo)\s+[A-Za-zÀ-ÿ\s'-]+\s+\d+,?\s*\d{5}\s+[A-Za-zÀ-ÿ\s'-]+/gi,
                                    pt: /(?:Rua|Avenida|Av\.|Praça|Travessa|Alameda|Largo|Estrada)\s+[A-Za-zÀ-ÿ\s'-]+\s+\d+,?\s*\d{4,8}[\s-]?\d{0,3}/gi,
                                    id: /(?:Jalan|Jl\.|Gang|Gg\.)\s+[A-Za-z0-9\s.'-]+(?:No\.?\s*\d+)?/gi
                                };
                                // Also try extracting from footer text specifically
                                const footerEl = document.querySelector('footer, #footer, .footer, .site-footer');
                                const searchTexts = [footerEl ? footerEl.innerText : '', bodyText];
                                const addrPattern = stage3AddrPatterns[docLang] || stage3AddrPatterns['en'];
                                const stage3Blacklist = ['privacy', 'policy', 'terms', 'login', 'menu', 'copyright', '개인정보', '이용약관', 'プライバシー', '規約', '菜单'];
                                
                                for (const srcText of searchTexts) {
                                    if (addressStr) break;
                                    const candidates = srcText.match(addrPattern) || [];
                                    const valid = candidates.filter(a => {
                                        const t = a.trim();
                                        if (t.length < 8 || t.length > 200) return false;
                                        if (!/\d/.test(t)) return false;
                                        if (/https?:\/\//i.test(t)) return false;
                                        const lo = t.toLowerCase();
                                        return !stage3Blacklist.some(w => lo.includes(w));
                                    }).sort((a, b) => b.length - a.length);
                                    if (valid.length > 0) addressStr = valid[0].trim();
                                }
                            }
                            
                            // [v16.1] Form Detection: Increase priority if a form exists
                            const hasForm = !!document.querySelector('form, [id*="contact"], [class*="contact"], iframe[title*="form"], iframe[src*="form"]');
                            
                            document.querySelectorAll('a[href]').forEach(a => {
                                let h = '';
                                try { h = a.href; } catch(e) { return; }
                                if (!h) return;
                                
                                if (h.includes('instagram.com/') || h.includes('facebook.com/') || h.includes('twitter.com/') || h.includes('x.com/')) {
                                    sns.add(h.split('?')[0]);
                                }
                                const em = h.toLowerCase().replace(/^mailto:/i, '').split('?')[0].trim();
                                if (em && em.includes('@')) {
                                    emails.add(em);
                                }
                                if (h.toLowerCase().startsWith('tel:') && !phoneStr) {
                                    phoneStr = h.toLowerCase().replace(/^tel:/i, '').trim();
                                }
                            });
                            return { emails: [...emails], sns: [...sns], phone: phoneStr, address: addressStr, hasForm, contactPageText: bodyText.substring(0, 3000) };
                        },
                        args: [hl]
                    }).catch(() => null);

                    if (subRaw && subRaw.length > 0) {
                        for (const frame of subRaw) {
                            if (!frame.result) continue;
                            const subResult = frame.result;
                            subResult.emails.forEach(e => finalEmails.add(e));
                            subResult.sns.forEach(s => finalSns.add(s));
                            if (subResult.phone && !finalPhone) finalPhone = subResult.phone;
                            if (subResult.address && !homepageResult.address) homepageResult.address = subResult.address;
                            if (subResult.contactPageText && !homepageResult.contactPageText) homepageResult.contactPageText = subResult.contactPageText;
                        }
                    }
                } catch (e) { }
            }
        }

        return {
            emails: [...finalEmails].join(', '),
            sns: [...finalSns],
            phone: finalPhone,
            address: homepageResult.address || '',
            contactPageText: homepageResult.contactPageText || ''
        };
    } catch (e) {
        return null;
    } finally {
        if (tab) await safeRemoveTab(tab.id);
    }
}

async function runEngineSearch(enginesArr, keyword, startPage = 1, maxPages = 1, collectEmails = false, mapAuto = false, targetOption = 'all', isSubTask = false, baseProgress = 0, subTaskWeight = 100, depth = 1) {
    if (!isSubTask) {
        isSearching = true;
        isCancelled = false;
        isPaused = false; // [v18.7] Force reset pause on NEW task
        isHardBlocked = false;
        isPausedByCaptcha = false;
        await updateState({ isSearching: true, isPaused: false, isHardBlocked: false, currentProgressPercent: 0 });
    }
    
    const kwLabel = isSubTask ? `[Sub] ` : ``;
    await sendStatusDetail(`${kwLabel}Searching: ${keyword} (Stage 1)`);

    const t = await getT();
    sendLog(t('log_preparing'));
    await chrome.storage.local.set({ currentKeyword: keyword });
    const sessionSeenNames = new Set();

    try {
        let engines = Array.isArray(enginesArr) ? enginesArr : [enginesArr];
        const storage = await chrome.storage.local.get(['language', 'region']);
        const hl = storage.language || 'en', gl = storage.region || 'us';

        for (let d = 1; d <= depth; d++) {
            if (isCancelled) break;
            if (depth > 1) {
                sendLog(`🔄 [Depth ${d}/${depth}] Starting search set...`);
            }

            for (const engine of engines) {
                if (isCancelled) break;
                sendLog(t('log_engine_start', { region: gl.toUpperCase(), lang: hl.toUpperCase() }));

                // In multi-depth mode, we can either shift the page start or repeat the same logic.
                // Here we simply repeat the Stages 1-2-3 for the given maxPages.
                for (let page = startPage; page <= maxPages; page++) {
                    if (isCancelled) break;
                    await checkPause(); // [v18.5] Pause Check
                    sendLog(t('log_page_processing', { engine, page, max: maxPages }));
                
                
                // [v35.0] Page Loop Safety Timeout (5 mins)
                await runWithTimeout((async () => {
                    let searchUrl = '';
                    const q = encodeURIComponent(keyword);
                    const googleTLDs = {
                        'us': 'com', 'ca': 'ca', 'mx': 'com.mx', 'uk': 'co.uk', 'de': 'de',
                        'fr': 'fr', 'it': 'it', 'es': 'es', 'nl': 'nl', 'se': 'se',
                        'cn': 'com.hk', 'jp': 'co.jp', 'kr': 'co.kr', 'in': 'co.in',
                        'id': 'co.id', 'sg': 'com.sg', 'tw': 'com.tw', 'tr': 'com.tr',
                        'sa': 'com.sa', 'ae': 'ae', 'br': 'com.br', 'au': 'com.au'
                    };
                    const gTld = googleTLDs[gl] || 'com';

                    if (engine === 'google') searchUrl = `https://www.google.${gTld}/search?q=${q}&start=${(page - 1) * 10}&hl=${hl}&gl=${gl}&tbm=lcl`;
                    else if (engine === 'naver') searchUrl = `https://search.naver.com/search.naver?where=web&query=${q}&start=${(page - 1) * 10 + 1}`;
                    else if (engine === 'naver_place') searchUrl = `https://map.naver.com/v5/search/${q}`;
                    else if (engine === 'google_maps') searchUrl = `https://www.google.${gTld}/maps/search/${q}?hl=${hl}&gl=${gl}&tbm=lcl`;
                    else if (engine === 'bing') {
                        const bingDomain = (gl === 'cn') ? 'cn.bing.com' : 'www.bing.com';
                        searchUrl = `https://${bingDomain}/search?q=${q}&first=${(page - 1) * 10 + 1}&FORM=PERE`;
                    }
                    else if (engine === 'bing_maps') searchUrl = `https://www.bing.com/maps/search?q=${q}&FORM=HDRSC4`;
                    else if (engine === 'yahoojp') searchUrl = `https://search.yahoo.co.jp/search?p=${q}&b=${(page - 1) * 10 + 1}`;
                    else if (engine === 'yahoo_tw') searchUrl = `https://tw.search.yahoo.com/search?p=${q}&b=${(page - 1) * 10 + 1}`;
                    else if (engine === 'baidu') searchUrl = `https://www.baidu.com/s?wd=${q}&pn=${(page - 1) * 10}`;
                    else if (engine === 'baidu_maps') searchUrl = `https://map.baidu.com/search?query=${q}`;
                    else if (engine === 'yahoo_maps') searchUrl = `https://map.yahoo.co.jp/search?q=${q}`;
                    else return;

                    const isMapEngine = engine.includes('maps');
                    let tab = null;
                    try {
                        await checkLockdown();
                        if (isCancelled) {
                             if (tab) await safeRemoveTab(tab.id);
                             return;
                        }

                        tab = await chrome.tabs.create({ url: searchUrl, active: false });
                        sendLog(t('log_waiting_engine', { engine }));
                        const timeout = isMapEngine ? 50000 : 25000;
                        let rawResults = await waitForEngineResult(tab.id, timeout, engine, hl, keyword);

                        // [v33.4] Unified Algorithm
                        sendLog(t('log_unified_scan', { lang: hl.toUpperCase() }));
                        const serpText = await chrome.scripting.executeScript({
                            target: { tabId: tab.id },
                            func: () => document.body.innerText
                        }).then(r => r[0]?.result || "").catch(() => "");
                        
                        const unifiedNames = extractBusinessNames(serpText, hl);
                        if (!rawResults) rawResults = [];
                        unifiedNames.forEach(name => {
                            if (!rawResults.some(r => r.name === name)) {
                                rawResults.push({ name, url: '' });
                            }
                        });
                        sendLog(t('log_unified_count', { count: unifiedNames.length }));

                        const storageMode = await chrome.storage.local.get(['extractionMode']);
                        const mode = storageMode.extractionMode || 'normal';

                        if (mode === 'ai' || engine === 'naver' || engine === 'naver_place') {
                            sendLog(t('log_ai_discovery'));
                            const discoveredNames = await discoverWithAI(tab.id, keyword);
                            if (discoveredNames) {
                                if (!rawResults) rawResults = [];
                                for (const name of discoveredNames) {
                                    if (!rawResults.some(r => r.name === name) && !sessionSeenNames.has(name)) {
                                        rawResults.push({ name, url: '', isAi: true });
                                    }
                                }
                            }
                        }

                        if (rawResults && rawResults.length > 0) {
                            const cleanedResults = [];
                            const seenInBatch = new Set();
                            for (const r of rawResults) {
                                if (!r.name || seenInBatch.has(r.name) || sessionSeenNames.has(r.name)) continue;
                                
                                let dataSource = 'search_engine';
                                const feedback = { ruleId: '', reason: '', pass: false, source: dataSource };
                                const blacklistArrArray = Array.from(sessionSeenNames); 
                                const filterResult = isViableBusinessName(r.name, hl, blacklistArrArray, keyword, feedback);
                                
                                if (filterResult) {
                                    const finalName = (typeof filterResult === 'string') ? filterResult : r.name;
                                    cleanedResults.push({ name: finalName, url: r.url });
                                    seenInBatch.add(finalName);
                                }
                            }

                            if (cleanedResults.length === 0) {
                                sendLog(t('log_no_valid_after_filter'));
                                return;
                            }

                            sendLog(t('log_received_clean', { count: cleanedResults.length }));
                            const targets = cleanedResults;
                            for (const t of targets) sessionSeenNames.add(t.name);

                            if (targets.length > 0 && !isCancelled) {
                                await checkLockdown();
                                if (isCancelled) return;
                                const totalPagesInSearch = (maxPages - startPage + 1);
                                const currentPageOffset = (page - startPage + 1);
                                const progressFactor = (totalPagesInSearch > 0) ? (currentPageOffset / totalPagesInSearch) : 1;

                                const s2Base = baseProgress + (progressFactor * (subTaskWeight * 0.3));
                                const s2Weight = (subTaskWeight * 0.7);
                                await deepScan3Stage(targets, engine.toUpperCase(), hl, gl, t, keyword, s2Base, s2Weight, targetOption);
                            }
                        }
                    } catch (e) {
                        sendLog(`⚠️ error: ${e.message}`);
                    } finally {
                        if (tab) await chrome.tabs.remove(tab.id).catch(() => { });
                    }
                    const totalPagesInSearch = (maxPages - startPage + 1);
                    const currentPageOffset = (page - startPage + 1);
                    const progressFactor = (totalPagesInSearch > 0) ? (currentPageOffset / totalPagesInSearch) : 1;
                    currentProgressPercent = baseProgress + (progressFactor * subTaskWeight);
                    await updateState({ currentProgressPercent });
                    chrome.runtime.sendMessage({ action: 'progress', percent: currentProgressPercent }).catch(() => {});
                    await new Promise(r => setTimeout(r, getDelay(1000)));
                })(), 300000, null, t('log_page_timeout'));
            }
        }
    }
    } finally {
        if (!isSubTask) {
            // [v17.8] Ensure state is held for a brief moment to allow UI to sync before final transition
            await new Promise(r => setTimeout(r, getDelay(500)));
            isSearching = false;
            await updateState({ isSearching: false });
            chrome.runtime.sendMessage({ action: 'complete' }).catch(() => {});
        }
    }
}

async function runWebsiteCrawl(startUrl, maxDepth, targetOption = 'all', language = 'en', region = 'us') {
    const t = await getT();
    const hl = language || 'en';
    const gl = region || 'us';
    isSearching = true; 
    isCancelled = false;
    isPaused = false; // [v18.7] Force reset pause on NEW task
    isHardBlocked = false;
    isPausedByCaptcha = false;
    await updateState({ isSearching: true, isPaused: false, currentProgressPercent: 0 });
    
    sendLog(t('log_preparing'));
    let allFoundNames = new Set();
    let currentTabId = null;

    try {
        let tab = await chrome.tabs.create({ url: startUrl, active: false });
        currentTabId = tab.id;
        
        for (let level = 1; level <= maxDepth; level++) {
            if (isCancelled) break;
            await checkPause(); // [v18.5] Pause Check
            
            await runWithTimeout((async () => {
                const progress = Math.round((level / maxDepth) * 30); 
                await updateState({ currentProgressPercent: progress });
                chrome.runtime.sendMessage({ action: 'progress', percent: progress }).catch(() => {});
                
                await sendStatusDetail(`[Depth ${level}/${maxDepth}] Scanning view [${level >= 2 ? 'Continuous' : 'Initial'}]...`);
                
                const currentUrl = await chrome.scripting.executeScript({
                    target: { tabId: currentTabId },
                    func: () => window.location.href
                }).then(r => r[0]?.result || startUrl).catch(() => startUrl);

                sendLog(t('log_level_processing', { level, total: maxDepth, url: currentUrl }));

                await chrome.scripting.executeScript({
                    target: { tabId: currentTabId },
                    func: async () => {
                        const scrollSteps = 5;
                        for (let i = 1; i <= scrollSteps; i++) { 
                            window.scrollTo(0, (document.body.scrollHeight / scrollSteps) * i); 
                            await new Promise(r => setTimeout(r, 600)); 
                        }
                    }
                }).catch(() => { });
                
                await new Promise(r => setTimeout(r, getDelay(level === 1 ? 6000 : 4000)));

                const extractionResult = await chrome.scripting.executeScript({
                    target: { tabId: currentTabId },
                    func: () => {
                        const text = document.body.innerText;
                        
                        // [v36.5] Anti-Bot / CAPTCHA Detection
                        const isAntiBot = /人机检查|验证码|人机验证|人机校验|安全验证|CAPTCHA|Verification/i.test(text) || 
                                          !!document.querySelector('[id*="captcha"], [class*="captcha"], #verify-button, .verify-box');
                        
                        // [v36.4] Refined selectors and exclusion filters for directory sites like 11467.com
                        const listCandidates = Array.from(document.querySelectorAll('.companylist h4 a, article h3, .seller-card h3, result-title, a.title, h1, h2, h3, h4, h5, [class*="title"], [class*="name"], .list-item a, li a, [class*="hotel"] a, [class*="item"] h3, [class*="Item"] h3, a[href*="detail"]'))
                            .filter(el => {
                                const container = el.closest('nav, footer, header, .menu, .navigation, #sidebar, .sidebar, #header, #footer, [role="navigation"], [role="menubar"], .breadcrumb, .nav, .side, .shop, .top, .bottom');
                                if (container) return false;
                                return true;
                            })
                            .map(el => el.innerText.trim())
                            .filter(t => t.length > 1 && t.length < 50);
                        return { text: text, candidates: listCandidates };
                    }
                }).then(r => r[0]?.result).catch(() => null);

                if (extractionResult && extractionResult.isAntiBot) {
                    sendLog(`⚠️ [Anti-Bot] CAPTCHA detected on current page. Please resolve it in the browser tab.`);
                    await updateState({ statusText: "Waiting for Human Verification..." });
                    // Wait 15 seconds to give user time to solve or script to settle
                    await new Promise(r => setTimeout(r, 15000));
                }

                if (extractionResult) {
                    const rawNames = [...new Set([...extractBusinessNames(extractionResult.text, hl), ...extractionResult.candidates])];
                    // [v36.7] CRITICAL: Re-filter all raw names (including selector-based candidates) through the viability filter
                    const namesOnPage = rawNames.filter(n => {
                        const feedback = { ruleId: '', reason: '', pass: false, source: 'crawler' };
                        const ok = isViableBusinessName(n, hl, [], "", feedback);
                        if (!ok) {
                            console.log(`[Crawler] Rejected candidate: "${n}" -> ${feedback.reason} (${feedback.ruleId})`);
                        }
                        return ok;
                    });

                    const currentLevelNames = namesOnPage.filter(n => !allFoundNames.has(n));
                    const newNamesCount = currentLevelNames.length;
                    sendLog(t('log_level_found', { level, count: namesOnPage.length, newCount: newNamesCount }));
                    
                    if (newNamesCount > 0) {
                        const targets = currentLevelNames.map(n => ({ name: n, context: '', url: '' }));
                        await checkLockdown();
                        const levelWeight = (1 / maxDepth) * 100;
                        const levelBase = ((level - 1) / maxDepth) * 100;
                        await deepScan3Stage(targets, 'CRAWL', hl, gl, t, '', levelBase, levelWeight, targetOption);
                    }
                    namesOnPage.forEach(n => allFoundNames.add(n.trim()));
                    if (level > 1 && newNamesCount === 0 && level < maxDepth) {
                         sendLog(`  ⚠️ No new names found. Trying emergency scroll...`);
                         await chrome.scripting.executeScript({ target: { tabId: currentTabId }, func: () => window.scrollTo(0, document.body.scrollHeight) }).catch(() => {});
                         await new Promise(r => setTimeout(r, getDelay(2000)));
                    }
                }

                if (level === maxDepth) return;

                const navResult = await chrome.scripting.executeScript({
                    target: { tabId: currentTabId },
                    func: async (currentLevel) => {
                        const oldHeight = document.body.scrollHeight;
                        const oldHtml = document.body.innerHTML.length;
                        const findPagingBtn = () => {
                            const targetLevelStr = String(currentLevel + 1);
                            const nextKeywords = ['다음', 'next', '次へ', '>', '»', '▶'];
                            const allElems = Array.from(document.querySelectorAll('a, button, [role="button"], li, span'));
                            const numberBtn = allElems.find(el => {
                                 const txt = (el.innerText || '').trim();
                                 return txt === targetLevelStr || txt === `[${targetLevelStr}]` || txt === `(${targetLevelStr})`;
                            });
                            if (numberBtn) return numberBtn.closest('a, button, [role="button"]') || numberBtn;
                            const nextBtnCandidate = allElems.find(el => {
                                const txt = (el.innerText || '').trim().toLowerCase();
                                const aria = (el.getAttribute('aria-label') || '').trim().toLowerCase();
                                const isMatch = nextKeywords.some(k => txt === k || aria === k || aria.includes(k));
                                if (!isMatch) return false;
                                const parentClasses = (el.parentElement?.className || '').toLowerCase();
                                const myClasses = (el.className || '').toLowerCase();
                                const isPagingSource = /pagin|pager|nxt|next|btn|page-link|control/i.test(parentClasses + myClasses);
                                if (txt === '다음' || txt === 'next') return true;
                                return isPagingSource;
                            });
                            if (nextBtnCandidate) return nextBtnCandidate.closest('a, button, [role="button"]') || nextBtnCandidate;
                            return null;
                        };
                        let nextBtn = findPagingBtn() || document.querySelector('a[rel="next"], [class*="Pagination_next"], [class*="PaginationNext"]');
                        if (nextBtn) {
                            nextBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            await new Promise(r => setTimeout(r, 800));
                            nextBtn.click();
                            return { action: 'clicked', type: 'pagination' };
                        }
                        const moreBtn = Array.from(document.querySelectorAll('button, a')).find(el => {
                             const txt = (el.innerText || '').trim().toLowerCase();
                             return txt === '더보기' || txt === 'load more' || txt === 'show more';
                        });
                        if (moreBtn) {
                            moreBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            await new Promise(r => setTimeout(r, 800));
                            moreBtn.click();
                            return { action: 'clicked', type: 'load_more' };
                        }
                        window.scrollTo(0, document.body.scrollHeight);
                        await new Promise(r => setTimeout(r, 2500));
                        if (document.body.scrollHeight > oldHeight || document.body.innerHTML.length > oldHtml + 100) return { action: 'scrolled', type: 'infinite' };
                        return { action: 'none' };
                    },
                    args: [level]
                }).then(r => r[0]?.result).catch(() => ({ action: 'error' }));

                if (navResult.action === 'none') {
                    sendLog(t('log_level_finished'));
                    // We need a way to break the outer loop. Since we're in an async lambda, we'll return a special value.
                    return 'BREAK_LOOP';
                } else {
                    sendLog(t('log_level_navigating', { next: level + 1, type: navResult.type }));
                }
            })(), 300000, null, t('log_page_timeout')).then(res => {
                if (res === 'BREAK_LOOP') level = maxDepth + 1; // Hack to break the outer for loop
            });
        }

        // [v34.8] Stage 2/3 now handled per level inside the loop
        
        if (currentTabId) await chrome.tabs.remove(currentTabId).catch(() => { });
    } catch (e) {
        sendLog(`❌ Crawl Error: ${e.message}`);
    } finally {
        isSearching = false;
        await updateState({ isSearching: false, currentProgressPercent: 100 });
        chrome.runtime.sendMessage({ action: 'complete' }).catch(() => {});
    }
}


function waitForEngineResult(tabId, timeout, engine = '', hl = 'en', keyword = '') {
    return new Promise(resolve => {
        let items = []; let timer = null; let isResolved = false;
        let captchaWaitCount = 0;
        const finish = (force = false) => {
            if (isResolved) return; 
            if ((isPausedByCaptcha || isPaused || isHardBlocked) && !force) {
                if (timer) clearTimeout(timer);
                if (isPausedByCaptcha) captchaWaitCount++;
                if (captchaWaitCount > 12) { // Max 60s wait for CAPTCHA
                    sendLog("⚠️ CAPTCHA 대기 시간 초과. 우회 또는 강제 진행합니다.");
                    finish(true);
                    return;
                }
                // When manually paused, it waits continuously without expiring the timeout
                timer = setTimeout(finish, getDelay(5000));
                return;
            }
            isResolved = true;
            if (timer) clearTimeout(timer); if (urlCheckInterval) clearInterval(urlCheckInterval);
            chrome.runtime.onMessage.removeListener(handler);
            resolve([...new Map(items.map(i => [i.name || i.url, i])).values()]);
        };
        const urlCheckInterval = setInterval(async () => {
            if (isResolved) return;
            if (isCancelled) { finish(true); return; }
            if (isPaused || isPausedByCaptcha || isHardBlocked) return;
            try {
                const blockStatus = await checkCaptchaOnTab(tabId);
                if (blockStatus === 'hard_block') {
                    sendLog("🚫 [Critical] Google hard block detected. Pausing for user decision...");
                    isHardBlocked = true;
                    isPaused = true;
                    await updateState({ isHardBlocked: true, isPaused: true, isPausedByCaptcha: false });
                    return;
                }

                if (blockStatus === 'captcha') {
                    if (!isPausedByCaptcha) {
                        isPausedByCaptcha = true;
                        chrome.runtime.sendMessage({ action: 'CAPTCHA_STATUS', status: 'detected' }).catch(() => {});
                    }
                    chrome.tabs.update(tabId, { active: true });
                    const tabData = await chrome.tabs.get(tabId);
                    chrome.windows.update(tabData.windowId, { focused: true });
                    sendLog("⚠️ CAPTCHA BLOCKED!");
                } else if (isPausedByCaptcha) { 
                    isPausedByCaptcha = false; 
                    chrome.runtime.sendMessage({ action: 'CAPTCHA_STATUS', status: 'resolved' }).catch(() => {});
                    // [v18.1] If captcha solved but popup remains closed, give 30s to reopen it
                    if (!isPopupOpen) {
                        popupDisconnectTimeout = setTimeout(() => {
                            if (!isPopupOpen && isSearching) {
                                console.warn('[v18.1] CAPTCHA solved but popup never reopened. Force stopping!');
                                isCancelled = true;
                                isSearching = false;
                                updateState({ isSearching: false }).catch(() => {});
                            }
                        }, 30000); // 30 seconds wait
                    }
                }
            } catch (e) { }
        }, 1500);
        const handler = (m, s) => {
            if (s.tab && s.tab.id === tabId) {
                if (m.action === 'engineStatus' && m.status === 'ready') {
                    chrome.tabs.sendMessage(tabId, { action: 'extract', hl: hl, keyword: keyword }, { frameId: s.frameId }).catch(() => {
                        chrome.tabs.sendMessage(tabId, { action: 'extract', hl: hl, keyword: keyword }).catch(() => {});
                    });
                    if (timer) {
                        clearTimeout(timer);
                        const finishDelay = (items.length > 0) ? 6000 : 15000;
                        timer = setTimeout(finish, finishDelay);
                    }
                    return;
                }
                if (m.action === 'engineSearchResult' || m.action === 'portalResult') {
                    const newItems = m.results || m.links || [];
                    if (newItems.length > 0) {
                        // [v34.5] Deduplicate incoming items to prevent repeated messages from inflating results
                        const existingNames = new Set(items.map(i => i.name));
                        const uniqueNew = newItems.filter(i => i.name && !existingNames.has(i.name));
                        if (uniqueNew.length > 0) {
                            items = [...items, ...uniqueNew];
                            sendLog(`  📩 Received data from tab: ${uniqueNew.length} new items (${m.engine || 'General'})`);
                        }
                    }
                    const isIframeEngine = (m.engine === 'Naver' || m.engine === 'Yahoo Japan' || m.engine === 'Bing' || m.engine === 'naver');
                    const shouldWaitMore = isIframeEngine && m.status === 'empty' && !m.isMainFrame;
                    if ((m.isMainFrame || items.length > 0) && !shouldWaitMore) {
                        if (timer) clearTimeout(timer);
                        // [v34.5] Faster finish: 3s if we have data, otherwise use engine-specific delays
                        const finishDelay = (items.length > 0) ? 3000 : (isIframeEngine ? 12000 : 10000); 
                        timer = setTimeout(finish, getDelay(finishDelay));
                    }
                }
            }
        };
        chrome.runtime.onMessage.addListener(handler);
        setTimeout(() => {
            if (!isResolved && items.length === 0) {
                // [v34.5] Only send to main frame (frameId: 0) to prevent iframe spam
                chrome.tabs.sendMessage(tabId, { action: 'extract', hl: hl, keyword: keyword }, { frameId: 0 }).catch(() => {});
                sendLog("  💓 Pulse Broadcast (Main Frame Only) sent...");
            }
        }, 4000);
        timer = setTimeout(finish, timeout + 15000);
    });
}

function extractProperNouns(rawText, hl = 'en') {
    if (!rawText) return [];
    const lines = rawText.split(/[\n\r,;]+/);
    let results = [];
    const seen = new Set();
    
    lines.forEach(line => {
        let trimmed = line.trim();
        if (!trimmed || seen.has(trimmed)) return;

        // [v12.6] Apply Strict Filtering Logic (from business_filters.js)
        const feedback = { source: 'trusted', results: [] };
        const validName = isViableBusinessName(trimmed, hl, [], "", feedback);
        
        if (validName === true || (typeof validName === 'string' && validName.length > 0)) {
            const finalName = (typeof validName === 'string') ? validName : trimmed;
            if (!seen.has(finalName)) {
                seen.add(finalName);
                results.push(finalName);
            }
        }
    });

    console.log('[extractProperNouns] Extracted', results.length, 'valid names from', lines.length, 'original lines');
    return results;
}

async function discoverWithAI(tabId, keyword = '') {
    try {
        const results = await chrome.tabs.sendMessage(tabId, { action: "GET_PAGE_TEXT" });
        const storage = await chrome.storage.local.get(['geminiApiKey']);
        if (!storage.geminiApiKey) return [];
        return await getGeminiExtraction(results?.text || "", keyword, storage.geminiApiKey);
    } catch (err) { return []; }
}

async function getGeminiExtraction(text, keyword, apiKey) {
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: `EXTRACT AND RETURN ONLY VALID BUSINESS NAMES AS A CLEAN JSON STRING ARRAY. 
                IGNORE NAVIGATION LINKS (Home, Contact, Next), UI ELEMENTS, AND GENERIC PHRASES. 
                INPUT TEXT: ${text.substring(0, 30000)}` }] }] })
        });
        if (!response.ok) return [];
        const data = await response.json();
        const jsonStr = data.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
        const start = jsonStr.indexOf('['); const end = jsonStr.lastIndexOf(']');
        return JSON.parse(jsonStr.substring(start, end + 1));
    } catch (e) { return []; }
}

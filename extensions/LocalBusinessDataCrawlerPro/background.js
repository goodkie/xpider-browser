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

// [v36.9] Proxy Authentication Handler (wrapped in try-catch for XPIDER compatibility)
try {
    chrome.webRequest.onAuthRequired.addListener(
        (details, callback) => {
            chrome.storage.local.get(['proxyEnabled', 'proxyUser', 'proxyPass'], (res) => {
                if (res.proxyEnabled && res.proxyUser && res.proxyPass) {
                    console.log('[v36.9][Proxy] Providing credentials for', details.challenger?.host);
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
} catch (e) {
    // [XPIDER Fix] asyncBlocking may not be supported; fallback to blocking
    try {
        chrome.webRequest.onAuthRequired.addListener(
            (details) => {
                return {}; // No-op fallback
            },
            { urls: ["<all_urls>"] },
            ["blocking"]
        );
    } catch (e2) {
        console.warn('[v36.9][Proxy] webRequest.onAuthRequired not available in this environment:', e2.message);
    }
}

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
let secondaryCountdown = 0; // [v1.0.0 Pro] Missing declaration fix
let isHardBlocked = false; // [v36.9] Google Hard Block state
let hardBlockCountdown = 0; // [v36.9] 30m countdown
let vpnCheckEnabled = false;
let slowModeEnabled = false;
let captchaLogs = []; // [v11.0] Persistent CAPTCHA diagnostics
let _captchaTabId = null; // [v3.3] CAPTCHA 탭 ID 추적
let _captchaResolvedAt = 0; // [v3.3] 마지막 해결 시각 — ghost 재감지 쿨다운

// [v36.11] Throttled Storage Persistence Logic (Performance Fix)
let stateDirtyKeys = new Set();
let storageSyncTimer = null;

// [v18.1] Strict Popup State Tracking
let isPopupOpen = false;
let popupDisconnectTimeout = null;

function handlePopupDisconnect() {
    isPopupOpen = false;
    if (isSearching) {
        if (isPausedByCaptcha) {
            console.log('[v18.1] Popup closed during CAPTCHA. Waiting for resolution...');
            return;
        }
        // [XPIDER Fix] 사이드패널은 재연결이 잦으므로 3초 후 재연결 여부 확인 후 중단 결정
        console.warn('[v18.1] Popup disconnected. Waiting 3s for reconnect before force-stop...');
        popupDisconnectTimeout = setTimeout(() => {
            if (!isPopupOpen && isSearching) {
                console.warn('[v18.1] No reconnect detected. Force stopping search.');
                isCancelled = true;
                isSearching = false;
                updateState({ isSearching: false, isPausedByCaptcha: false }).catch(() => {});
                sendLog('🛑 [System] 패널 종료 감지 (3초 대기 후). 수집 중단.');
            } else {
                console.log('[v18.1] Popup reconnected. Continuing search.');
            }
        }, 3000);
    }
}

// [v18.0] Initialization Promise with 5s Safety Timeout
let initPromise = new Promise((resolve) => {
    console.log("[v18.0][BG] Init starting, loading storage...");
    const timeout = setTimeout(() => {
        console.warn("[v18.0][BG] Init timeout (5s). Using storage fallback.");
        // Even on timeout, try to check storage for isSearching
        chrome.storage.local.get(['isSearching'], (r) => {
            isSearching = r.isSearching || false;
            console.log(`[v18.0][BG] Init Timeout Fallback: isSearching=${isSearching}`);
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
        
        console.log(`[v18.0][BG] SW Init: isSearching=${isSearching}, isPaused=${isPaused}, hardBlocked=${isHardBlocked}, results=${sessionResults.length}`);
        
        // [v36.9] Restore Proxy Settings on SW Startup
        applyProxySettings().catch(() => {});

        console.log("[v18.0][BG] Init completed, resolving initPromise...");
        resolve();
    });
});

/**
 * [v36.11] Throttled updateState: Only writes to storage every 10s or on critical events
 */
async function updateState(updates, forceSync = false) {
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

    // Mark keys as dirty
    Object.keys(updates).forEach(k => stateDirtyKeys.add(k));

    // Force sync for critical state changes or if requested
    const isCritical = forceSync || 
                       updates.isSearching === false || 
                       updates.isPaused !== undefined || 
                       updates.isCancelled === true ||
                       updates.isHardBlocked !== undefined;

    if (isCritical) {
        await flushStateToStorage();
    } else {
        triggerThrottledSync();
    }
}

function triggerThrottledSync() {
    if (storageSyncTimer) return;
    storageSyncTimer = setTimeout(async () => {
        storageSyncTimer = null;
        await flushStateToStorage();
    }, 10000); // 10s interval for heavy data (logs, results)
}

async function flushStateToStorage() {
    if (stateDirtyKeys.size === 0) return;
    const dataToSave = {};
    const currentState = {
        isSearching, isCancelled, isPaused, sessionResults, sessionLogs, 
        currentProgressPercent, isPausedByCaptcha, isHardBlocked, 
        hardBlockCountdown, vpnCheckEnabled, slowModeEnabled, statusDetail
    };
    stateDirtyKeys.forEach(k => {
        if (currentState[k] !== undefined) dataToSave[k] = currentState[k];
    });
    stateDirtyKeys.clear();
    try {
        await chrome.storage.local.set(dataToSave);
    } catch(e) {
        console.error('[StorageSync] Failed to save state:', e.message);
    }
}

/**
 * [v18.5] Pause Lock Helper
 * Stops execution while isPaused is true.
 */
let _captchaBypassTimer = null;   // [v3.3] 9분 자동 바이패스 타이머
let _captchaBypassCountdown = null; // [v3.3] 30초 업데이트 인터벌
const CAPTCHA_BYPASS_MS = 9 * 60 * 1000; // 9분

async function checkPause() {
    if ((isPaused || isPausedByCaptcha || isHardBlocked) && !isCancelled) {
        const t = await getT();
        const pauseMsg = isHardBlocked ? '\uD83D\uDEA8 HARD BLOCKED - USER ACTION NEEDED' : (isPausedByCaptcha ? '\u23F3 CAPTCHA BLOCKED - WAITING' : '\u23F8\uFE0F PAUSED BY USER');
        await sendStatusDetail(pauseMsg);

        // [v3.3] CAPTCHA 일 때만: 9분 자동 바이패스 타이머 시작
        if (isPausedByCaptcha && !_captchaBypassTimer) {
            const bypassAt = Date.now() + CAPTCHA_BYPASS_MS;
            sendLog('\u23F3 [CAPTCHA-BYPASS] 9분 후 자동 바이패스 예정');

            // 30초마다 카운트다운 표시
            _captchaBypassCountdown = setInterval(() => {
                if (!isPausedByCaptcha) {
                    clearInterval(_captchaBypassCountdown);
                    _captchaBypassCountdown = null;
                    return;
                }
                const remaining = Math.max(0, Math.round((bypassAt - Date.now()) / 1000));
                const mins = Math.floor(remaining / 60);
                const secs = remaining % 60;
                sendStatusDetail('\u23F3 CAPTCHA BLOCKED - ' + mins + '\ubd84 ' + secs + '\ucd08 후 자동 재개');
            }, 30000);

            _captchaBypassTimer = setTimeout(async () => {
                if (!isPausedByCaptcha) return; // 이미 해결됨

                sendLog('\u26A1 [CAPTCHA-BYPASS] 9분 경과 → CAPTCHA 자동 바이패스 실행');
                _captchaTabId = null;
                isPausedByCaptcha = false;
                _captchaResolvedAt = Date.now(); // 쿨다운 시작
                await updateState({ isPausedByCaptcha: false });

                // 팝업에 바이패스 알림
                chrome.runtime.sendMessage({
                    action: 'CAPTCHA_STATUS',
                    status: 'bypassed',
                    auto: true
                }).catch(() => {});
                chrome.runtime.sendMessage({
                    action: 'statusDetail',
                    message: '\u26A1 CAPTCHA 9분 바이패스 → 수집 재개 중...'
                }).catch(() => {});
                sendLog('\u25B6\uFE0F [CAPTCHA-BYPASS] 컴렉션 재개');

                if (_captchaBypassCountdown) {
                    clearInterval(_captchaBypassCountdown);
                    _captchaBypassCountdown = null;
                }
                _captchaBypassTimer = null;
            }, CAPTCHA_BYPASS_MS);
        }
    }

    const wasPausedByCaptcha = isPausedByCaptcha;

    while ((isPaused || isPausedByCaptcha || isHardBlocked) && !isCancelled) {
        await new Promise(r => setTimeout(r, 500));
    }

    // [v4.9.64] CAPTCHA 해결 후 즉각적인 재요청 방지를 위한 무작위 안전 쿨다운 적용
    if (wasPausedByCaptcha && !isCancelled) {
        const cooldownMs = 5000 + Math.floor(Math.random() * 7000); // 5초 ~ 12초 무작위
        sendLog(`⏳ [CAPTCHA 쿨다운] 구글 감지 우회를 위해 ${Math.round(cooldownMs / 1000)}초 동안 대기 후 안전하게 수집을 재개합니다.`);
        
        let elapsed = 0;
        while (elapsed < cooldownMs && !isCancelled) {
            // 대기 도중 정지나 취소, 혹은 새로운 캡챠 감지 등의 상태 변경이 있을 수 있으므로 체크
            if (isPaused || isPausedByCaptcha || isHardBlocked) {
                break;
            }
            await new Promise(r => setTimeout(r, 500));
            elapsed += 500;
        }
        if (!isPaused && !isPausedByCaptcha && !isHardBlocked && !isCancelled) {
            sendLog(`▶️ [CAPTCHA 쿨다운 완료] 안전 대기가 종료되었습니다. 수집을 계속합니다.`);
        }
    }

    // 타이머 클린업 (정상 해제 또는 취소 시)
    if (!isPausedByCaptcha) {
        if (_captchaBypassTimer) { clearTimeout(_captchaBypassTimer); _captchaBypassTimer = null; }
        if (_captchaBypassCountdown) { clearInterval(_captchaBypassCountdown); _captchaBypassCountdown = null; }
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
    try {
        if (await chrome.offscreen.hasDocument()) return;
        // [XPIDER Fix] Use consistent reasons matching offscreen.html's actual use
        await chrome.offscreen.createDocument({
            url: 'offscreen.html',
            reasons: ['AUDIO_CAPTURE'],
            justification: 'Speech Recognition for CAPTCHA audio solving'
        });
    } catch (e) {
        console.warn("[Background] Offscreen creation error (non-fatal):", e.message);
    }
}

// ─── [v3.1] Google /sorry/ CAPTCHA 탭 직접 감지 ──────────────────────────
// broadcastExtMessage IPC는 Service Worker에 미도달 → chrome.tabs.onUpdated로 직접 감지
// 대상: google.com/sorry/index 만 (일반 비즈니스 폼 CAPTCHA 제외)
// _captchaTabId, _captchaResolvedAt은 95번 줄에 선언됨

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (!changeInfo.url) return;
    const url = changeInfo.url;

    // ── Google /sorry/ CAPTCHA 감지 (구글 전용, 비즈니스 폼 제외) ──
    const isGoogleSorry = url.includes('google.com/sorry/') ||
                          (url.includes('google.') && url.includes('/sorry/'));

    // [v3.3] 쿨다운: 해결 후 15초 내 재감지 억제 — ghost popup 방지
    const _now = Date.now();
    const _cooldown = 15000;
    if (isGoogleSorry && typeof _captchaResolvedAt !== 'undefined' && (_now - _captchaResolvedAt) < _cooldown) {
        console.log('[CAPTCHA-BG] 쿨다운 중 재감지 무시 (' + Math.round((_now - _captchaResolvedAt)/1000) + 's)');
        return;
    }

    if (isGoogleSorry && isSearching && !isPausedByCaptcha) {
        _captchaTabId = tabId;
        isPausedByCaptcha = true;
        await updateState({ isPausedByCaptcha: true });

        sendLog('⏸️ [CAPTCHA] Google CAPTCHA 감지 → 모든 수집 즉시 일시중지');
        sendLog(`🔗 CAPTCHA URL: ${url.substring(0, 80)}`);

        // 팝업에 CAPTCHA 모달 표시
        chrome.runtime.sendMessage({
            action: 'CAPTCHA_STATUS',
            status: 'detected',
            captchaUrl: url,
            tabOpened: true
        }).catch(() => {});

        // 진행 상태 표시
        chrome.runtime.sendMessage({
            action: 'statusDetail',
            message: '⏸️ Google CAPTCHA 감지 — 해결 후 자동 재개됩니다'
        }).catch(() => {});
    }

    // ── CAPTCHA 해결 감지: CAPTCHA 탭이 /sorry/ 에서 정상 URL로 이동 ──
    if (isPausedByCaptcha && tabId === _captchaTabId) {
        const isResolved = !url.includes('/sorry/') &&
                           !url.includes('recaptcha') &&
                           (url.includes('google.com/search') || url.startsWith('about:'));

        if (isResolved) {
            _captchaTabId = null;
            isPausedByCaptcha = false;
            _captchaResolvedAt = Date.now(); // [v3.3] 쿨다운 시각 기록
            await updateState({ isPausedByCaptcha: false });

            sendLog('▶️ [CAPTCHA] CAPTCHA 해결 감지 → 수집 자동 재개');
            chrome.runtime.sendMessage({
                action: 'CAPTCHA_STATUS',
                status: 'resolved',
                auto: true
            }).catch(() => {});
            chrome.runtime.sendMessage({
                action: 'statusDetail',
                message: '▶️ CAPTCHA 해결됨 — 수집 재개 중...'
            }).catch(() => {});
        }
    }
});

// ─── [v3.1] 수동 [계속] 버튼 처리 ────────────────────────────────────────
// popup.js의 ✅ 버튼 → chrome.runtime.sendMessage → 여기서 처리
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.action === 'MANUAL_CAPTCHA_RESOLVED') {
        if (isPausedByCaptcha) {
            isPausedByCaptcha = false;
            _captchaTabId = null;
            _captchaResolvedAt = Date.now(); // [v4.9.64] 수동 해결 쿨다운 적용
            updateState({ isPausedByCaptcha: false }).then(() => {
                sendLog('▶️ [CAPTCHA] 수동 해결 확인 → 수집 재개');
                chrome.runtime.sendMessage({ action: 'CAPTCHA_STATUS', status: 'resolved', auto: false }).catch(() => {});
            });
        }
        sendResponse({ status: 'ok' });
        return true;
    }
});

chrome.runtime.onMessage.addListener((m, sender, sendResponse) => {
    console.log(`[v20.0][BG] Received message action=${m ? m.action : 'undefined'}`);

    // [v20.0] Unstoppable Non-Blocking Async Handler
    const handleMessage = async () => {
        try {
            console.log(`[v20.0][BG] waiting for initPromise... action=${m ? m.action : 'undefined'}`);
            // [v20.0] Don't block the entire loop on init. Handlers will wait if needed.
            await initPromise; 
            console.log(`[v20.0][BG] initPromise resolved. Handling action=${m ? m.action : 'undefined'}`);

            if (m.action === 'PING') {
                return { status: 'alive', version: '1.0.0 Pro v20.0' };
            }

            // ── 1. 수집 제어 핸들러 ──
            if (m.action === 'startSearch') {
                console.log(`[v20.0][BG] startSearch triggered with text length=${m.text ? m.text.length : 0}`);
                if (isSearching) {
                    console.log(`[v20.0][BG] Already searching (busy)`);
                    return { status: 'busy' };
                }
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
                // [v36.11] Clear sync timer and force save
                if (storageSyncTimer) { clearTimeout(storageSyncTimer); storageSyncTimer = null; }
                await updateState({ isSearching: false, isPausedByCaptcha: false, isPaused: false }, true);
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

            // ── [v3.0] CAPTCHA 전체 일시중지/재개 ──────────────────────
            // main.js의 _handleCaptchaDetected가 CAPTCHA 감지 시 브로드캐스트
            if (m.action === 'CAPTCHA_PAUSE_ALL') {
                if (isSearching && !isPausedByCaptcha) {
                    isPausedByCaptcha = true;
                    await updateState({ isPausedByCaptcha: true });
                    sendLog('⏸️ [CAPTCHA] CAPTCHA 감지 — 모든 수집 일시중지 중...');
                    chrome.runtime.sendMessage({ action: 'statusDetail', message: '⏸️ CAPTCHA 감지 — 해결 후 자동 재개됩니다' }).catch(() => {});
                }
                return { status: 'paused' };
            }

            if (m.action === 'CAPTCHA_RESUME_ALL') {
                if (isPausedByCaptcha) {
                    isPausedByCaptcha = false;
                    await updateState({ isPausedByCaptcha: false });
                    sendLog('▶️ [CAPTCHA] CAPTCHA 해결 — 수집을 재개합니다.');
                    chrome.runtime.sendMessage({ action: 'statusDetail', message: '▶️ CAPTCHA 해결됨 — 수집 재개 중...' }).catch(() => {});
                }
                return { status: 'resumed' };
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
                return new Promise(async (resolve) => {
                    nativeSttRequests.set(requestId, (text) => {
                        resolve({ text });
                    });
                    await ensureOffscreenDocument();
                    chrome.runtime.sendMessage({ 
                        action: 'START_NATIVE_STT', 
                        audioUrl: m.audioUrl, 
                        audioData: m.audioData, // Pass the pre-fetched data
                        requestId 
                    });
                });
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
                if (isPausedByCaptcha) {
                    isPausedByCaptcha = false;
                    _captchaTabId = null;
                    _captchaResolvedAt = Date.now(); // [v4.9.64] 수동 해결 쿨다운 적용
                    await updateState({ isPausedByCaptcha: false });
                    sendLog("🛠️ [Manual] CAPTCHA resolution forced by user.");
                }
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

                // ── [v3.2] Google /sorry/ 전용 감지 — 비즈니스 contact 페이지 reCAPTCHA 완전 제외
                // sender.tab.url = 탭의 최상위 URL (reCAPTCHA 아이프레임 URL이 아님)
                // 반드시 Google 도메인 + /sorry/ 경로를 동시에 충족해야만 일시중지
                const senderTabUrl = sender && sender.tab && sender.tab.url || '';
                let tabHostname = '';
                try { tabHostname = new URL(senderTabUrl).hostname.toLowerCase(); } catch(e) {}

                const isStrictlyGoogleSorry =
                    // 1. Google 도메인 확인 (비즈니스 도메인 제외)
                    (tabHostname === 'www.google.com' || tabHostname === 'google.com' || tabHostname.endsWith('.google.com')) &&
                    // 2. /sorry/ 경로 확인 (reCAPTCHA 위젯이 있는 일반 페이지 제외)
                    senderTabUrl.includes('/sorry/');

                if (isStrictlyGoogleSorry && isSearching && !isPausedByCaptcha) {
                    _captchaTabId = sender.tab ? sender.tab.id : null;
                    isPausedByCaptcha = true;
                    await updateState({ isPausedByCaptcha: true });
                    sendLog('⏸️ [CAPTCHA] Google /sorry/ CAPTCHA 감지 → 모든 수집 즉시 일시중지');
                    sendLog(`🔗 CAPTCHA 탭: ${senderTabUrl.substring(0, 80)}`);
                    chrome.runtime.sendMessage({
                        action: 'CAPTCHA_STATUS',
                        status: 'detected',
                        captchaUrl: senderTabUrl,
                        tabOpened: true
                    }).catch(() => {});
                }
                return { status: 'logged' };
            }

            if (m.action === 'GET_CAPTCHA_LOGS') {
                return { logs: captchaLogs };
            }

            if (m.action === 'APPLY_PROXY_SETTINGS') {
                applyProxySettings();
                return { status: 'ok' };
            }

            if (m.action === 'CREATE_TAB') {
                chrome.tabs.create({ url: m.url });
                return { status: 'ok' };
            }

            if (m.action === 'OPEN_XPIDER_VPN') {
                // background.js에서는 직접 패널을 열 수 없으므로,
                // 현재 활성 탭에 XPIDER_INVOKE 메시지를 주입하여 VPN 패널을 오픈
                try {
                    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                        if (tabs && tabs[0] && tabs[0].id) {
                            chrome.scripting.executeScript({
                                target: { tabId: tabs[0].id },
                                world: 'MAIN',
                                func: () => {
                                    window.postMessage({
                                        type: 'XPIDER_INVOKE',
                                        channel: 'open-xpider-vpn-panel',
                                        args: {},
                                        id: 'bg-vpn-' + Date.now()
                                    }, '*');
                                }
                            }).catch(() => {});
                        }
                    });
                } catch(e) {}
                return { status: 'relayed' };
            }

            // ── OPEN_WIT_EXTERNAL_LINK: background.js에서는 shell.openExternal 직접 호출 불가
            // 현재 활성 탭에 XPIDER_SEND 메시지를 주입 → ext-preload.js → ipcRenderer.send('open-wit-external-link') → main.js shell.openExternal()
            if (m.action === 'OPEN_WIT_EXTERNAL_LINK') {
                const witUrl = m.url || 'https://wit.ai/apps';
                try {
                    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                        if (tabs && tabs[0] && tabs[0].id) {
                            chrome.scripting.executeScript({
                                target: { tabId: tabs[0].id },
                                world: 'MAIN',
                                func: (url) => {
                                    window.postMessage({
                                        type: 'XPIDER_SEND',
                                        channel: 'open-wit-external-link',
                                        data: url
                                    }, '*');
                                },
                                args: [witUrl]
                            }).catch(() => {});
                        }
                    });
                } catch(e) {}
                return { status: 'relayed' };
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
        if (!tabId) return false;
        const tab = await chrome.tabs.get(tabId).catch(() => null);
        if (!tab) return false;
        
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
                chrome.tabs.update(tabId, { active: true }).catch(() => {});
                // [XPIDER Fix] chrome.windows may behave differently in Electron
                chrome.tabs.get(tabId).then(tabInfo => {
                    chrome.windows.update(tabInfo.windowId, { focused: true }).catch(() => {});
                }).catch(() => {});
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
                if (storage.captchaMethod === 'audio') {
                    // [v3.1] Audio Solving is now handled primarily by challenge_solver_content.js
                    // This prevents dual-orchestration and race conditions.
                    // Background script remains ready to handle transcription messages.
                } else {
                    sendLog(`⚠️ [Solver] Unsupported method: ${storage.captchaMethod}. Defaulting to manual or audio.`);
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

    // [v1.1.3] 완전 순차 처리 — 탭 1개씩 열고 닫기 (캡챠 솔버 안정화)
    for (let index = 0; index < scanCount; index++) {
        if (isCancelled) break;
        await checkPause();
        const target = targets[index];
        const bizName = target.name;
        await runWithTimeout((async () => {
            if (isCancelled) return;
                const subProgress = ((index + 1) / scanCount) * 100;
                const currentTotalProgress = Math.round(base + (subProgress * (weight / 100)));
                await updateState({ currentProgressPercent: currentTotalProgress });
                
                await sendStatusDetail(`[Stage 2] ${t('searching')} details: ${index+1}/${scanCount}`);
                chrome.runtime.sendMessage({ action: 'progress', percent: currentTotalProgress }).catch(() => {});

                const sourceUrl = target.url || '';
                // [TEXT_LIST Fix] TEXT_LIST 소스(사용자가 붙여넣은 텍스트)는
                // isSearchListingTitle의 공격적인 전치사 필터(in/at/by/and 등)를 건너뜀
                // 사용자가 명시적으로 제공한 업체명이므로 신뢰
                // [v1.1.0 Pro] Thorough Mode Check: TEXT_LIST, URL 크롤링, 그리고 검색엔진 결과 모두 고도화 수집 흐름 적용
                const isTextListSource = (sourceLabel === 'TEXT_LIST');
                // [v1.1.3] sourceLabel이 문자열인지 확인하는 안전 장치 추가
                const labelStr = String(sourceLabel || '').toUpperCase();
                const isEngineSource = ['GOOGLE','NAVER','BING','YAHOO','BAIDU'].some(s => labelStr.includes(s));
                const isThoroughMode = isTextListSource || isEngineSource || (labelStr === 'CRAWL');

                // 검색엔진 결과인 경우에만 리스트형 제목(Best 10 등) 필터링 적용 (TEXT_LIST는 사용자 입력이므로 건너뜀)
                if (!isTextListSource && isSearchListingTitle(bizName)) {
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
                let url2, engineName2;

                if (isTextListSource) {
                    // [TEXT_LIST v1.0] 텍스트 붙여넣기 모드: 공식 웹사이트를 찾는 일반 Google 검색
                    const gTld = { kr: 'co.kr', jp: 'co.jp', de: 'de', fr: 'fr', uk: 'co.uk' }[gl] || 'com';
                    const siteQ = (hl === 'ko')
                        ? encodeURIComponent(`"${bizName}" 공식사이트 OR 홈페이지`)
                        : encodeURIComponent(`"${bizName}" official website OR homepage`);
                    url2 = `https://www.google.${gTld}/search?q=${siteQ}&hl=${hl}&gl=${gl || 'us'}`;
                    engineName2 = 'Google (Website Discovery)';
                } else if (isHighFidelity) {
                    url2 = sourceUrl;
                    engineName2 = 'High-Fidelity';
                } else if (isNaverSource) {
                    url2 = getSearchUrl2(bizName, gl, hl, target.context);
                    engineName2 = 'Google Korea (Enrichment)';
                } else {
                    url2 = getSearchUrl2(bizName, gl, hl, target.context);
                    engineName2 = (gl === 'kr' ? 'Google Korea' : 'Google');
                }

                sendLog(`🔎 [${index + 1}/${targets.length}] "① Google 검색 시작: ${bizName}" (${engineName2})`);
                await checkLockdown();
                // [v1.1.0 Pro] Thorough Mode인 경우 사용자가 확인할 수 있도록 탭을 화면에 표시
                let scan = await scanPageInBrowser(url2, 5000, bizName, isThoroughMode);
                await checkPause();

                // ─────────────────────────────────────────────────
                // [v1.1.0 Pro] 4단계 고도화 수집 흐름 (Thorough Mode)
                // ─────────────────────────────────────────────────
                if (isThoroughMode) {
                    // [v1.1.0 Pro] 사용자의 요청에 맞춘 순차적 고도화 수집 흐름 (구글 검색 -> 홈페이지 -> 컨택트)
                    sendLog(`🔎 [${index + 1}/${targets.length}] "① 구글 검색으로 공식 웹사이트 탐색 시작: ${bizName}"`);
                    
                    if (scan.homepage) {
                        sendLog(`  ✅ ① 웹사이트 주소 확보: ${scan.homepage}`);
                    } else {
                        sendLog(`  ⚠️ ① Google 검색 결과에서 홈페이지 미발견 → 대체 검색 시도...`);
                        const gTld2 = { kr: 'co.kr', jp: 'co.jp' }[gl] || 'com';
                        const fallbackQ = encodeURIComponent(`${bizName} official website`);
                        const urlFallback = `https://www.google.${gTld2}/search?q=${fallbackQ}&hl=${hl}&gl=${gl || 'us'}`;
                        await checkLockdown();
                        
                        // 대체 검색 수행 (탭 표시)
                        const scanFb = await scanPageInBrowser(urlFallback, 4000, bizName, true);
                        if (scanFb.homepage) {
                            scan.homepage = scanFb.homepage;
                            sendLog(`  ✅ ① 대체 검색으로 웹사이트 확보: ${scan.homepage}`);
                        } else {
                            sendLog(`  ❌ ① 웹사이트를 찾지 못했습니다. ${bizName} 업체는 상세 수집을 건너뜁니다.`);
                        }
                    }

                    // ② 웹사이트 진입 및 컨택트 페이지 탐색 (상세 정보 추출)
                    if (scan.homepage) {
                        sendLog(`🔍 [${index + 1}/${targets.length}] "② 웹사이트 진입 및 컨택트 페이지 탐색 중: ${scan.homepage}"`);
                        await sendStatusDetail(`[Stage 3] 상세 정보 수집 중 [${index+1}/${scanCount}] ${bizName}`);
                        
                        // scrapeBusinessWebsite 내에서 홈페이지와 컨택트 페이지를 순차적으로 탐색하며 정보 추출
                        const webScan = await scrapeBusinessWebsite(scan.homepage, targetOption, hl, gl, 5000, true);
                        if (webScan) {
                            if (webScan.emails) { scan.emails = webScan.emails; sendLog(`    📧 이메일 추출: ${webScan.emails}`); }
                            if (webScan.phone)  { scan.phone  = webScan.phone;  sendLog(`    📞 전화번호 추출: ${webScan.phone}`); }
                            if (webScan.address && webScan.address !== '-') { scan.address = webScan.address; sendLog(`    📍 주소 추출: ${webScan.address}`); }
                            if (webScan.sns && webScan.sns.length > 0) { scan.sns = webScan.sns; sendLog(`    📱 SNS 링크 추출: ${webScan.sns.join(', ')}`); }
                        } else {
                            sendLog(`  ⚠️ ② 웹사이트 접속 실패 또는 정보를 찾을 수 없습니다.`);
                        }
                    }

                    // ③ 결과 저장 및 다음 업체로 이동
                    const resultTL = {
                        id: Date.now() + Math.random().toString(36).substr(2, 9),
                        name: bizName,
                        homepage: scan.homepage || '-',
                        phone:    scan.phone    || '-',
                        emails:   scan.emails   || '-',
                        address:  scan.address  || '-',
                        sns:      scan.sns      || [],
                        category: sourceLabel,
                        source:   sourceLabel
                    };

                    sendLog(`✅ [${index + 1}/${targets.length}] "③ ${bizName}" 수집 완료 및 저장.`);
                    sessionResults.push(resultTL);
                    await updateState({ sessionResults });
                    chrome.runtime.sendMessage({ action: 'result', data: resultTL }).catch(() => {});
                    
                    // [v36.10] Stealth Mode: 업체 간 짧은 휴식 (사람처럼 행동)
                    const restDelay = 1500 + Math.random() * 2000;
                    await new Promise(r => setTimeout(r, restDelay));
                    
                    // [v1.1.0 Pro] 고도화 수집 완료 시 다음 업체로 이동
                    return; 
                }
                // ─────────────────────────────────────────────────
                // 기존 (non-TEXT_LIST) 흐름 유지
                // ─────────────────────────────────────────────────
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
    
    // [v36.11] Non-blocking state update (Throttled storage)
    updateState({ sessionLogs }).catch(() => {});
    
    // Immediate UI notification
    chrome.runtime.sendMessage({ action: 'log', message: `[${time}] ${msg}` }).catch(() => {});
}

/**
 * [TEXT_LIST v2.0] 텍스트에서 업체명을 최대한 많이/정확하게 추출
 * Yellow Pages, Yelp, 기타 디렉토리 텍스트 노이즈 완전 차단
 */
function extractNamesFromText(text, hl = 'en') {
    const currentLang = (hl === 'kr') ? 'ko' : hl;
    const candidates = new Set();

    // 거리 주소 (숫자로 시작)
    const ADDR_RE = /^\d+\s+\w.+\s+(st|ave|blvd|dr|rd|ln|way|ct|pl|hwy|pkwy|street|avenue|road|drive|boulevard|place|court|lane)\b/i;
    // 주/우편번호
    const ZIP_RE = /^[A-Z]{2}\s+\d{5}|^\d{5}(-\d{4})?$/;
    // 카테고리 이어붙이기 감지 (ElectriciansMajor)
    const CAT_START = /^(electricians?|plumbers?|heating|cooling|contractors?|repair|dealers?|refinishing|remodeling|painting|roofing|flooring|landscaping|handyman|locksmith|pest|veterinary|fitness|gym|photographer)/i;
    // "Name - Category" 추출용
    const DASH_CAT = /^(.+?)\s+-\s+(electricians?|plumbers?|contractors?|services?|specialists?|repair|refinishing|remodeling|heating|cooling|conditioning|cleaning|legal|medical|dental|clinic|school|academy|photography|design|marketing|consulting|construction|painting|roofing|handyman|security|surveillance|technology|moving|fitness|veterinary|pet)\b.*/i;
    // 디렉토리 UI 노이즈
    const NOISE_RE = [
        /^(website|directions|coupons|ad|thumbnail|in business|serving the|yellow pages|yellowpages)$/i,
        /^(websitecoupons|websitedirections|websitemore|websitevideo|mapviewall|allcoupons|videomore)/i,
        /years\s+in\s+business/i, /years\s+with\s+(yellowpages|yelp)/i, /\bicon\d+\b/i,
        /^sort:/i, /^map view/i, /^view all/i, /^serving the/i,
        /^schedule an/i, /^open (now|24)/i,
        /^(ca|ny|tx|fl|il|pa|oh|ga|nc|mi|nj|va|wa|az|ma|tn|in|mo|md|wi|mn|co|sc|al|la|ky|or|ok|ct|ut|ia|ms|ar|ks|nv|ne|nm|wv|id|hi|nh|me|mt|ri|de|sd|nd|ak|vt|wy|dc)$/i,
    ];
    // 1~2단어 라인용 업체 관련 단어 확인
    const BIZ_WORD = /\b(electric|electrical|energy|plumbing|heating|cooling|construction|repair|service|security|medical|dental|clinic|hotel|resort|restaurant|cafe|coffee|bakery|school|academy|studio|group|corp|inc|llc|ltd|tech|law|legal|center)\b/i;

    // === 전략 1: 줄별 파싱 ===
    text.split(/[\n\r]+/).forEach(rawLine => {
        let line = rawLine
            .replace(/^\s*\d+[.)\-]\s*/, '')
            .replace(/^\s*[-*\u2022\u00b7\u25ba\u25b6\u25b8\u2192]\s*/, '')
            .replace(/\t/g, ' ').trim();

        if (line.length < 2 || line.length > 100) return;
        if (/^[\d\s\-\.+()]+$/.test(line)) return;
        if (/^https?:\/\//.test(line)) return;
        if (line.includes('@') && line.includes('.')) return;
        if (ADDR_RE.test(line)) return;
        if (ZIP_RE.test(line)) return;
        if (NOISE_RE.some(r => r.test(line))) return;
        if (CAT_START.test(line) && /[a-z][A-Z]/.test(line)) return;
        if (/^(phone|tel|fax|email|address|web|url|name|company|category|\uc804\ud654|\uc8fc\uc18c|\uc774\uba54\uc77c|\ud648\ud398\uc774\uc9c0|\uc5c5\uccb4\uba85|\uc0c1\ud638)[\s:\uff1a]/i.test(line)) return;

        // "Name - Category" 정규화
        const dm = line.match(DASH_CAT);
        if (dm) line = dm[1].trim();

        // 1~2단어: 업체 관련 단어 없으면 도시명 등으로 간주 → 스킵
        if (line.split(/\s+/).length <= 2 && !BIZ_WORD.test(line)) return;

        line.split(/[,;]+/).map(p => p.trim()).filter(p => p.length >= 2 && p.length <= 80)
            .forEach(part => { const dm2 = part.match(DASH_CAT); candidates.add(dm2 ? dm2[1].trim() : part); });
    });

    // === 전략 2: 마커 기반 추출 ===
    extractBusinessNames(text, hl).forEach(n => candidates.add(n));

    // === 블랙리스트 + 최종 필터 ===
    const blMap = { ko: KO_BLACKLIST, ja: JA_BLACKLIST, en: EN_BLACKLIST };
    const blSet = new Set((blMap[currentLang] || blMap['en']).map(w => w.toLowerCase().trim()));
    const UI_EXACT = new Set([
        'home','menu','blog','news','about','contact','search','map','shop','store',
        'login','logout','register','more','next','back','services','products','gallery',
        'portfolio','team','faq','help','website','directions','coupons','ad','thumbnail',
        'open now','open 24 hours','in business','serving the','yellow pages','schedule',
        '\ud648','\uba54\ub274','\uac80\uc0c9','\ub85c\uadf8\uc778','\ud68c\uc6d0\uac00\uc785','\ub354\ubcf4\uae30','\uc804\uccb4\ubcf4\uae30'
    ]);

    return [...candidates].filter(name => {
        const lower = name.toLowerCase().trim();
        if (name.length < 2 || name.length > 80) return false;
        if (/^https?:\/\//.test(name)) return false;
        if (/^[\d\s\-\.+()]+$/.test(name)) return false;
        if (ADDR_RE.test(name)) return false;
        if (ZIP_RE.test(name)) return false;
        if (NOISE_RE.some(r => r.test(name))) return false;
        if (CAT_START.test(name) && /[a-z][A-Z]/.test(name)) return false;
        if (name.includes('@')) return false;
        if (blSet.has(lower)) return false;
        if (UI_EXACT.has(lower)) return false;
        if (/^[^a-zA-Z\uac00-\ud7a3\u3040-\u30FF\u4E00-\u9FFF]+$/.test(name)) return false;
        return true;
    });
}

async function startSearchProcess(text, collectEmails = false, targetOption = 'all', language = 'en', region = 'us') {
    isCancelled = false;
    isPaused = false;
    isHardBlocked = false;
    isPausedByCaptcha = false;
    
    const t = await getT();
    await sendLog(t('log_preparing'));
    
    const hl = language || 'en';
    const gl = region || 'us';

    // [TEXT_LIST v1.0] 다중 전략으로 텍스트에서 업체명 최대 추출
    await sendLog(`[Stage 1] 텍스트에서 업체명 추출 중 (${hl})...`);
    
    // 1차: 줄별 파싱 + 마커 기반 통합 추출 (새 함수)
    let extractedNames = extractNamesFromText(text, hl);
    sendLog(`  → 줄별+마커 추출: ${extractedNames.length}개`);

    // 2차: 추출 결과가 적으면 더 넓게 줄을 완화하여 재시도 (최소 2글자 이상 알파벳 포함 라인 수집)
    if (extractedNames.length < 3) {
        const fallbackNames = text.split(/[\n\r]+/)
            .map(l => l.replace(/^\s*\d+[.)\-]\s*/, '').replace(/^\s*[-*\u2022]\s*/, '').trim())
            .filter(l => l.length >= 3 && l.length <= 80
                && /[a-zA-Z\uac00-\ud7a3]/.test(l)
                && !/^https?:\/\//.test(l)
                && !l.includes('@'));
        const merged = [...new Set([...extractedNames, ...fallbackNames])];
        extractedNames = merged;
        sendLog(`  → 완화 재추출 후: ${extractedNames.length}개`);
    }

    if (extractedNames.length === 0) {
        await sendLog('❌ 텍스트에서 유효한 업체명을 찾지 못했습니다. 업체명 목록을 한 줄에 하나씩 입력해 주세요.');
        await updateState({ isSearching: false });
        chrome.runtime.sendMessage({ action: 'complete' }).catch(() => {});
        return;
    }

    await sendLog(`✅ ${extractedNames.length}개 업체명 추출 완료. Google 검색 및 상세정보 수집 시작...`);
    
    const targets = extractedNames.map(name => ({ name, url: '', context: '' }));

    // TEXT_LIST: deepScan3Stage에서 전치사 필터 등 공격적 필터를 건너뜀
    await deepScan3Stage(
        targets,
        'TEXT_LIST',  // ← "Text Data"에서 변경: isTrustedSource=true로 처리됨
        hl,
        gl,
        t,
        '',
        0,
        100,
        targetOption
    );

    await sendLog(t('log_complete') || '모든 업체 수집 완료.');
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

// [v1.1.2] scanPageInBrowser: chrome.tabs.create+executeScript 대신 XPIDER IPC를 통해
// 메인 프로세스에서 직접 BrowserWindow로 페이지를 열고 스캔합니다.
// 이 방식만이 XPIDER의 커스텀 webview 환경에서 실제로 동작합니다.
async function scanPageInBrowser(targetUrl, waitMs = 6000, bizName = '', showTab = false) {
    try {
        const result = await xpiderScanPage(targetUrl, waitMs, showTab);
        if (!result) return { emails: '', phone: '', address: '', homepage: '', sns: [], bizNumber: '', owner: '', rating: '', category: '', pageText: '' };

        return {
            emails: Array.isArray(result.emails) ? result.emails.join(', ') : (result.emails || ''),
            phone: result.phone || '',
            address: result.address || '',
            homepage: result.homepage || '',
            sns: result.sns || [],
            bizNumber: result.bizNumber || '',
            owner: result.owner || '',
            rating: result.rating || '',
            category: result.category || '',
            pageText: result.pageText || ''
        };
    } catch(e) {
        console.error('[scanPageInBrowser] Error:', e.message);
        return { emails: '', phone: '', address: '', homepage: '', sns: [], bizNumber: '', owner: '', rating: '', category: '', pageText: '' };
    }
}


// [v1.1.3] Consolidated IPC Scan Helpers
function xpiderScanPage(url, waitMs = 5000, showTab = false) {
    return new Promise((resolve) => {
        const reqId = 'scan_' + Date.now() + '_' + Math.random().toString(36).slice(2);
        const timeout = setTimeout(() => resolve(null), waitMs + 18000);
        chrome.runtime.sendMessage(
            { type: 'XPIDER_SCAN_REQUEST', url, waitMs, showTab, reqId },
            (result) => {
                clearTimeout(timeout);
                if (chrome.runtime.lastError) { 
                    console.warn('[xpiderScanPage] relay error:', chrome.runtime.lastError.message);
                    resolve(null); 
                    return; 
                }
                resolve(result || null);
            }
        );
    });
}

// [v1.1.2] scrapeBusinessWebsite - 4단계 수집 흐름: 홈페이지 열기 → 컨텍트 페이지 링크 탐색 → 상세 정보 추출
async function scrapeBusinessWebsite(url, targetOption = 'all', hl = 'en', gl = 'us', waitMs = 5000, showTab = false) {
    if (!url || !url.startsWith('http')) return null;
    try {
        sendLog(`  🌐 웹사이트 열기: ${url}`);
        const homeResult = await xpiderScanPageFull(url, waitMs, showTab);
        if (!homeResult) return null;
        const emails = new Set((homeResult.emails || []).filter(e => e && e.includes('@')));
        let phone = homeResult.phone || '';
        let address = homeResult.address || '';
        const sns = new Set(homeResult.sns || []);
        const contactLinks = homeResult.contactLinks || [];
        for (const contactUrl of contactLinks.slice(0, 2)) {
            if (isCancelled) break;
            await checkPause();
            sendLog(`  📨 컨텍트 페이지: ${contactUrl}`);
            const cScan = await xpiderScanPage(contactUrl, 4000, showTab);
            if (!cScan) continue;
            (cScan.emails || []).forEach(e => { if (e && e.includes('@')) emails.add(e); });
            if (!phone && cScan.phone) phone = cScan.phone;
            if (!address && cScan.address) address = cScan.address;
            (cScan.sns || []).forEach(s => sns.add(s));
            if (emails.size > 0 && phone && address) break;
        }
        return {
            emails: [...emails].slice(0, 5).join(', '),
            phone: phone || '-',
            address: address || '-',
            sns: [...sns].slice(0, 5),
            homepage: url
        };
    } catch(e) { return null; }
}

function xpiderScanPageFull(url, waitMs = 5000, showTab = false) {
    return new Promise((resolve) => {
        const reqId = 'full_' + Date.now() + '_' + Math.random().toString(36).slice(2);
        const timeout = setTimeout(() => resolve(null), waitMs + 18000);
        chrome.runtime.sendMessage(
            { type: 'XPIDER_SCAN_FULL_REQUEST', url, waitMs, showTab, reqId },
            (result) => {
                clearTimeout(timeout);
                if (chrome.runtime.lastError) { resolve(null); return; }
                resolve(result || null);
            }
        );
    });
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

                    if (engine === 'google') {
                        // 구글 검색 시 봇 차단 예방을 위한 4~7초 간의 랜덤 안전 딜레이 적용
                        const googleSafeDelay = 4000 + Math.floor(Math.random() * 3000);
                        sendLog(`⏳ 구글 감지 우회를 위해 안전 대기 중 (${Math.round(googleSafeDelay/1000)}초)...`);
                        await new Promise(r => setTimeout(r, googleSafeDelay));
                        searchUrl = `https://www.google.${gTld}/search?q=${q}&start=${(page - 1) * 10}&hl=${hl}&gl=${gl}&tbm=lcl`;
                    }
                    else if (engine === 'naver') searchUrl = `https://search.naver.com/search.naver?where=web&query=${q}&start=${(page - 1) * 10 + 1}`;
                    else if (engine === 'naver_place') searchUrl = `https://map.naver.com/v5/search/${q}`;
                    else if (engine === 'google_maps') {
                        // 구글 맵스 검색 전 안전 대기
                        const googleSafeDelay = 4000 + Math.floor(Math.random() * 3000);
                        sendLog(`⏳ 구글 감지 우회를 위해 안전 대기 중 (${Math.round(googleSafeDelay/1000)}초)...`);
                        await new Promise(r => setTimeout(r, googleSafeDelay));
                        searchUrl = `https://www.google.${gTld}/maps/search/${q}?hl=${hl}&gl=${gl}&tbm=lcl`;
                    }
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
                    // [SINGLE-TAB-FIX v2.0] ═══════════════════════════════════════════════════
                    // chrome.tabs.create 방식 완전 제거 → tabQueue 기반 IPC로 단일 탭 순차 처리
                    // 모든 탭은 xpider-scan-page IPC를 통해 main.js XpiderTabQueue가 직렬화함
                    // ═══════════════════════════════════════════════════════════════════════════
                    try {
                        await checkLockdown();
                        if (isCancelled) return;

                        sendLog(t('log_waiting_engine', { engine }));
                        const scanWaitMs = isMapEngine ? 12000 : 8000;

                        // [SINGLE-TAB] 단일 탭으로 검색 결과 페이지 스캔
                        const serpScan = await scanPageInBrowser(searchUrl, scanWaitMs, keyword, false);
                        await checkPause();
                        if (isCancelled) return;

                        const serpText = serpScan ? (serpScan.pageText || '') : '';
                        sendLog(t('log_unified_scan', { lang: hl.toUpperCase() }));

                        // pageText 기반으로 업체명 추출 (tab.id 불필요)
                        // [v1.1.0 Pro] URL 탭과 동일하게 extractNamesFromText로 업체명 추출력 강화
                        const unifiedNames = extractNamesFromText(serpText, hl);
                        let rawResults = unifiedNames.map(name => ({ name, url: '' }));
                        sendLog(t('log_unified_count', { count: unifiedNames.length }));

                        // [AI 모드] Gemini API 가 있을 때만 추가 추출 (tab 없이 텍스트 기반)
                        const storageMode = await chrome.storage.local.get(['extractionMode', 'geminiApiKey']);
                        if ((storageMode.extractionMode === 'ai' || engine === 'naver' || engine === 'naver_place') && storageMode.geminiApiKey && serpText) {
                            sendLog(t('log_ai_discovery'));
                            const aiNames = await getGeminiExtraction(serpText, keyword, storageMode.geminiApiKey);
                            if (aiNames && aiNames.length > 0) {
                                for (const name of aiNames) {
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
                                const feedback = { ruleId: '', reason: '', pass: false, source: 'search_engine' };
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
                            for (const tgt of targets) sessionSeenNames.add(tgt.name);

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

// ─── [v2.2] crawlUrlWithScroll: URL 탭 전용 IPC 스크롤 크롤러 ───────
// background.js → popup.js relay → ext-preload.js → main.js xpider-crawl-with-scroll
function crawlUrlWithScroll(url, scrollSteps = 5, scrollWaitMs = 2500, pageWaitMs = 7000) {
    return new Promise((resolve) => {
        const reqId = 'crawl_' + Date.now() + '_' + Math.random().toString(36).slice(2);
        const timeout = setTimeout(() => resolve({ allText: '', nextPageUrl: null }), pageWaitMs + scrollSteps * scrollWaitMs + 25000);
        chrome.runtime.sendMessage(
            { type: 'XPIDER_CRAWL_SCROLL_REQUEST', url, scrollSteps, scrollWaitMs, pageWaitMs, reqId },
            (result) => {
                clearTimeout(timeout);
                if (chrome.runtime.lastError) { resolve({ allText: '', nextPageUrl: null }); return; }
                resolve(result || { allText: '', nextPageUrl: null });
            }
        );
    });
}

// ─── [v2.2] runWebsiteCrawl — URL 탭 완전 재작성 ───────────────────
// Depth 레벨 = (스크롤로 추가된 콘텐츠 레벨) + (다음 페이지 연결) 반복
// Text 탭과 동일한 extractNamesFromText + deepScan3Stage 파이프라인 사용
async function runWebsiteCrawl(startUrl, maxDepth, targetOption = 'all', language = 'en', region = 'us') {
    const t = await getT();
    const hl = language || 'en';
    const gl = region || 'us';
    isSearching = true;
    isCancelled = false;
    isPaused = false;
    isHardBlocked = false;
    isPausedByCaptcha = false;
    await updateState({ isSearching: true, isPaused: false, currentProgressPercent: 0 });

    sendLog(t('log_preparing'));
    await sendLog(`🌐 [URL 크롤러 v2.2] ${startUrl}`);
    await sendLog(`📐 Depth: ${maxDepth} Levels — 스크롤 + 페이지네이션 연속 수집`);

    const allFoundNames = new Set(); // 중복 방지
    let currentPageUrl = startUrl;
    let level = 0;

    // Depth 1레벨 = 한 페이지에서 스크롤 5회 (기본값)
    // Depth N레벨 = N페이지까지 스크롤+페이지네이션으로 연속 수집
    const SCROLL_STEPS_PER_LEVEL = 5; // 레벨당 스크롤 횟수
    const SCROLL_WAIT_MS = 2500;       // 스크롤 후 대기 시간

    try {
        while (level < maxDepth && !isCancelled && currentPageUrl) {
            level++;
            await checkPause();

            const progressPct = Math.round((level / maxDepth) * 100);
            await updateState({ currentProgressPercent: progressPct });
            chrome.runtime.sendMessage({ action: 'progress', percent: progressPct }).catch(() => {});
            await sendStatusDetail(`[Level ${level}/${maxDepth}] ${level === 1 ? '첫 페이지' : '연속 수집'}: ${currentPageUrl.substring(0, 60)}...`);
            sendLog(`\n📄 [Level ${level}/${maxDepth}] 스캔 시작: ${currentPageUrl}`);

            // [핵심] 스크롤+페이지네이션 크롤
            const crawlResult = await crawlUrlWithScroll(
                currentPageUrl,
                SCROLL_STEPS_PER_LEVEL,
                SCROLL_WAIT_MS,
                7000
            );

            if (!crawlResult || !crawlResult.allText) {
                sendLog(`⚠️ [Level ${level}] 페이지 텍스트 수집 실패. 다음 레벨로 건너뜁니다.`);
                break;
            }

            const pageText = crawlResult.allText;
            sendLog(`✅ [Level ${level}] 텍스트 수집: ${pageText.length}자 (스크롤 ${crawlResult.scrollCount}회)`);

            // Text 탭과 동일: extractNamesFromText로 업체명 추출
            let extractedNames = extractNamesFromText(pageText, hl);
            sendLog(`  → 줄별+마커 추출: ${extractedNames.length}개 업체명`);

            // 결과가 적으면 완화 재추출 (Text 탭과 동일한 로직)
            if (extractedNames.length < 3) {
                const fallbackNames = pageText.split(/[\n\r]+/)
                    .map(l => l.replace(/^\s*\d+[.)\-]\s*/, '').replace(/^\s*[-*\u2022]\s*/, '').trim())
                    .filter(l => l.length >= 3 && l.length <= 80
                        && /[a-zA-Z\uac00-\ud7a3]/.test(l)
                        && !/^https?:\/\//.test(l)
                        && !l.includes('@'));
                extractedNames = [...new Set([...extractedNames, ...fallbackNames])];
                sendLog(`  → 완화 재추출: ${extractedNames.length}개`);
            }

            // 중복 제거
            const newNames = extractedNames.filter(n => !allFoundNames.has(n));
            sendLog(`  → 신규 업체명: ${newNames.length}개 (누적 중복 제거 후)`);

            if (newNames.length > 0) {
                // isViableBusinessName 필터 적용 (Text 탭과 동일)
                const viableTargets = [];
                for (const name of newNames) {
                    const feedback = { ruleId: '', reason: '', pass: false, source: 'url_crawler' };
                    const result = isViableBusinessName(name, hl, [], '', feedback);
                    if (result) {
                        const finalName = typeof result === 'string' ? result : name;
                        viableTargets.push({ name: finalName, url: '', context: '' });
                        allFoundNames.add(finalName);
                    }
                }
                sendLog(`  → 필터 통과: ${viableTargets.length}개`);

                if (viableTargets.length > 0 && !isCancelled) {
                    await checkLockdown();
                    if (!isCancelled) {
                        const levelWeight = (1 / maxDepth) * 100;
                        const levelBase = ((level - 1) / maxDepth) * 100;
                        // Text 탭과 동일한 deepScan3Stage 파이프라인
                        await deepScan3Stage(
                            viableTargets,
                            'TEXT_LIST', // TEXT_LIST로 처리 → 전치사 필터 건너뜀 (URL에서 수집된 업체명이므로)
                            hl, gl, t,
                            '',
                            levelBase,
                            levelWeight,
                            targetOption
                        );
                    }
                }
            } else {
                sendLog(`  ⚠️ 신규 업체명 없음. ${level < maxDepth ? '다음 레벨(페이지)로 진행...' : '수집 완료.'}`);
            }

            // 다음 페이지 URL 결정
            if (level < maxDepth) {
                if (crawlResult.nextPageUrl && crawlResult.nextPageUrl !== currentPageUrl) {
                    sendLog(`  ➡️ 다음 페이지 감지: ${crawlResult.nextPageUrl.substring(0, 60)}`);
                    currentPageUrl = crawlResult.nextPageUrl;
                } else if (newNames.length === 0) {
                    // 새 이름도 없고 다음 페이지도 없으면 종료
                    sendLog(`  🏁 더 이상 수집할 콘텐츠가 없습니다. 조기 종료.`);
                    break;
                } else {
                    // 다음 페이지는 없지만 아직 레벨이 남음 — 같은 페이지에서 더 스크롤
                    sendLog(`  📜 같은 페이지에서 추가 스크롤 계속...`);
                    // currentPageUrl 유지 (동일 페이지 계속 스크롤)
                }
            }

            // 레벨 간 딜레이
            await new Promise(r => setTimeout(r, getDelay ? getDelay(1000) : 1000));
        }

        const totalFound = allFoundNames.size;
        sendLog(`\n🎉 [URL 크롤러 완료] 총 ${totalFound}개 업체명 수집 (${level}/${maxDepth} 레벨)`);

    } catch (e) {
        sendLog(`❌ URL 크롤 오류: ${e.message}`);
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
        // [XPIDER BUG FIX #6] urlCheckInterval을 먼저 선언하여 finish() 내 참조 오류 방지
        let urlCheckInterval = null;
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
            if (timer) clearTimeout(timer);
            if (urlCheckInterval) clearInterval(urlCheckInterval);
            chrome.runtime.onMessage.removeListener(handler);
            resolve([...new Map(items.map(i => [i.name || i.url, i])).values()]);
        };
        // [XPIDER BUG FIX #6] var 대신 이미 선언된 urlCheckInterval에 할당
        urlCheckInterval = setInterval(async () => {
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
                    chrome.tabs.update(tabId, { active: true }).catch(() => {});
                    // [XPIDER Fix] windows.update는 catch 필수
                    chrome.tabs.get(tabId).then(tabData => {
                        chrome.windows.update(tabData.windowId, { focused: true }).catch(() => {});
                    }).catch(() => {});
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

const fs = require('fs');
const baselinePath = 'e:\\vivpr\\ai\\collect-list\\restore_v5\\extension\\background.js';
const targetPath = 'e:\\vivpr\\ai\\collect-list\\extension\\background.js';

try {
    let content = fs.readFileSync(baselinePath, 'utf8');

    // [1] Global State
    content = content.replace('let isCancelled = false;', 'let isCancelled = false;\nlet isPausedByCaptcha = false;');

    // [2] Utilities
    const utilities = `
async function checkLockdown() {
    while (isPausedByCaptcha && !isCancelled) {
        await new Promise(r => setTimeout(r, 2000));
    }
}

async function safeRemoveTab(tabId) {
    if (!tabId) return;
    try {
        const tab = await chrome.tabs.get(tabId);
        if (tab.url.includes('challenge') || tab.url.includes('sorry') || tab.url.includes('captcha')) {
            return;
        }
        await chrome.tabs.remove(tabId);
    } catch (e) { }
}
`;
    content = content.replace('let searchQueue = [];', 'let searchQueue = [];' + utilities);

    // [3] Inject checkLockdown into deepScan3Stage (Line 633)
    content = content.replace('for (let i = 0; i < targets.length; i++) {', 'for (let i = 0; i < targets.length; i++) {\n        await checkLockdown();');

    // [4] safeRemoveTab in deepScan3Stage (replacing line 1159/etc via global replace is fine for chrome.tabs.remove)
    // Actually, only replace the one in scanPageInBrowser finally block
    content = content.replace('if (tab) await chrome.tabs.remove(tab.id).catch(() => { });', 'await safeRemoveTab(tab ? tab.id : null);');

    // [5] scanPageInBrowser Heartbeat (Line 1003)
    const heartbeatLoop = `
        // [Ironclad Round 23] Heartbeat focus & CAPTCHA monitor
        let hLimitEnrich = 0;
        while (hLimitEnrich < 15) {
            try {
                let currentStatus = await chrome.tabs.get(tab.id);
                if (currentStatus.url.includes('challenge') || currentStatus.url.includes('google.com/sorry') || currentStatus.url.includes('captcha')) {
                    isPausedByCaptcha = true;
                    chrome.windows.update(currentStatus.windowId, { focused: true });
                    chrome.tabs.update(tab.id, { active: true });
                    await new Promise(r => setTimeout(r, 8000));
                    hLimitEnrich = 0; 
                    continue;
                } else {
                    isPausedByCaptcha = false;
                }
            } catch(e) {}
            await new Promise(r => setTimeout(r, 1000));
            hLimitEnrich++;
        }
    `;
    content = content.replace('await new Promise(r => setTimeout(r, waitMs));', 'await new Promise(r => setTimeout(r, waitMs));' + heartbeatLoop);

    // [6] Aligned GLOBAL Listener Only (Line 1650-1666)
    const oldGlobalListener = `chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'startEngineSearch') {
        runEngineSearch(request.engines, request.keyword, request.maxPages, request.collectEmails, request.mapAuto, request.deepPages);
    } else if (request.action === 'startSearch') {
        startSearchProcess(request.text, request.collectEmails);
    } else if (request.action === 'startCrawl') {
        runWebsiteCrawl(request.url, request.depth);
    } else if (request.action === 'log') {
        sendLog(request.message);
    } else if (request.action === 'cancelSearch') {
        isCancelled = true;
        isSearching = false;
        getT().then(t => sendLog(t('log_cancelled')));
    } else if (request.action === 'OCR_RESULT') {
        // Obsolete (Removed for DOM Discovery Engine)
    }
});`;

    const newGlobalListener = `chrome.runtime.onMessage.addListener((m, sender, sendResponse) => {
    if (m.action === 'startSearch') {
        startSearchProcess(m.text, m.collectEmails, m.language, m.region);
        sendResponse({ status: 'started' });
    } else if (m.action === 'startCrawl') {
        runWebsiteCrawl(m.url, m.depth);
        sendResponse({ status: 'crawling' });
    } else if (m.action === 'startEngineSearch') {
        runEngineSearch(m.engines, m.keyword, m.maxPages, m.collectEmails, m.mapAuto, m.deepPages);
        sendResponse({ status: 'started' });
    } else if (m.action === 'cancelSearch' || m.action === 'cancel') {
        isCancelled = true;
        isSearching = false;
        isPausedByCaptcha = false;
        sendResponse({ status: 'cancelled' });
    } else if (m.action === 'GET_SEARCH_STATE') {
        sendResponse({
            isSearching,
            isCancelled,
            isPausedByCaptcha,
            isPaused: isPausedByCaptcha,
            results: typeof sessionResults !== 'undefined' ? sessionResults : [],
            logs: typeof sessionLogs !== 'undefined' ? sessionLogs : [],
            percent: typeof currentProgressPercent !== 'undefined' ? currentProgressPercent : 0,
            progress: typeof currentProgressPercent !== 'undefined' ? currentProgressPercent : 0
        });
    } else if (m.action === 'GET_CAPTCHA_STATUS') {
        sendResponse({ isPaused: isPausedByCaptcha, isPausedByCaptcha });
    } else if (m.action === 'result') {
        if (typeof sessionResults !== 'undefined') sessionResults.push(m.data);
    }
    return true; 
});`;

    content = content.replace(oldGlobalListener, newGlobalListener);

    // [7] Fix Result Collection: Ensure sessionResults exists
    if (!content.includes('let sessionResults = [];')) {
        content = content.replace('let isSearching = false;', 'let isSearching = false;\nlet sessionResults = [];\nlet sessionLogs = [];\nlet currentProgressPercent = 0;');
    }
    
    // [8] Fix KR Filter (Line 1792+)
    content = content.replace('if (words.length < 2 || words.length > 3) return false;', 'if (words.length < 1 || words.length > 4) return false;');

    fs.writeFileSync(targetPath, content, { encoding: 'utf8' });
    console.log('Surgical reconstruction complete.');
} catch (err) {
    console.error('Error:', err.message);
}

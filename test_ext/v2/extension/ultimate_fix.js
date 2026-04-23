const fs = require('fs');
const baselinePath = 'e:\\vivpr\\ai\\collect-list\\restore_v5\\extension\\background.js';
const targetPath = 'e:\\vivpr\\ai\\collect-list\\extension\\background.js';

try {
    let content = fs.readFileSync(baselinePath, 'utf8');

    // [1] Global States
    content = content.replace('let isCancelled = false;', 'let isCancelled = false;\nlet isPausedByCaptcha = false;\nlet sessionResults = [];\nlet sessionLogs = [];\nlet currentProgressPercent = 0;');

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

    // [3] Loop Protection (Inject checkLockdown)
    // - runEngineSearch (Line 1245)
    content = content.replace('for (let page = 1; page <= maxPages; page++) {', 'for (let page = 1; page <= maxPages; page++) {\n                if (isCancelled) break;\n                await checkLockdown();');
    
    // - runWebsiteCrawl
    content = content.replace('async function runWebsiteCrawl(startUrl, maxDepth) {', 'async function runWebsiteCrawl(startUrl, maxDepth) {\n    await checkLockdown();');
    
    // - startSearchProcess
    content = content.replace('await deepScan3Stage(targets, \'TEXT_LIST\', hl, gl, t);', 'await checkLockdown();\n            await deepScan3Stage(targets, \'TEXT_LIST\', hl, gl, t);');
    
    // - deepScan3Stage
    content = content.replace('for (let i = 0; i < targets.length; i++) {', 'for (let i = 0; i < targets.length; i++) {\n        await checkLockdown();');

    // [4] safeRemoveTab replacements
    content = content.replace(/await chrome\.tabs\.remove\(tab\.id\)\.catch\(\(\) => \{ \}\);/g, 'await safeRemoveTab(tab.id);');
    // Also in scanPageInBrowser finally
    content = content.replace('if (tab) await chrome.tabs.remove(tab.id).catch(() => { });', 'await safeRemoveTab(tab ? tab.id : null);');

    // [5] Heartbeat Stage 2 (scanPageInBrowser)
    const heartbeatStage2 = `
        // [Ironclad Round 25] Stage 2 Focus & Monitor
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
                }
            } catch(e) {}
            await new Promise(r => setTimeout(r, 1000));
            hLimitEnrich++;
        }
        isPausedByCaptcha = false; 
    `;
    content = content.replace('await new Promise(r => setTimeout(r, waitMs));', 'await new Promise(r => setTimeout(r, waitMs));' + heartbeatStage2);

    // [6] Heartbeat Stage 1 (waitForEngineResult)
    const heartbeatStage1 = `function waitForEngineResult(tabId, timeout, engine = '') {
    const naverMaps = engine === 'naver_maps';
    const yahooMaps = engine === 'yahoo_maps';
    return new Promise(resolve => {
        let items = [];
        let timer = null;
        let isResolved = false;

        const finish = () => {
            if (isResolved) return;
            isResolved = true;
            if (timer) clearTimeout(timer);
            if (urlCheckInterval) clearInterval(urlCheckInterval);
            chrome.runtime.onMessage.removeListener(handler);
            const unique = [...new Map(items.map(i => [i.name || i.url, i])).values()];
            resolve(unique);
        };

        const urlCheckInterval = setInterval(async () => {
            if (isResolved) return;
            try {
                const tab = await chrome.tabs.get(tabId);
                if (tab.url.includes('google.com/sorry') || tab.url.includes('challenge') || tab.url.includes('captcha')) {
                    isPausedByCaptcha = true;
                    chrome.windows.update(tab.windowId, { focused: true });
                    chrome.tabs.update(tabId, { active: true });
                    sendLog("⚠️ SEARCH PAGE BLOCKED - PLEASE SOLVE CAPTCHA!");
                }
            } catch (e) { }
        }, 1500);

        const handler = (m, s) => {
            if (s.tab && s.tab.id === tabId) {
`;

    const oldWaitForEngineRegex = /function waitForEngineResult\(tabId, timeout, engine = ''\) \{[\s\S]+?const handler = \(m, s\) => \{/;
    content = content.replace(oldWaitForEngineRegex, heartbeatStage1);

    // [7] Aligned GLOBAL onMessage Listener
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
        startSearchProcess(m.text, m.collectEmails);
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
            results: sessionResults,
            logs: sessionLogs,
            percent: currentProgressPercent,
            progress: currentProgressPercent
        });
    } else if (m.action === 'GET_CAPTCHA_STATUS') {
        sendResponse({ isPaused: isPausedByCaptcha, isPausedByCaptcha });
    } else if (m.action === 'result') {
        sessionResults.push(m.data);
    }
    return true; 
});`;
    content = content.replace(oldGlobalListener, newGlobalListener);

    // [8] Additional Guard in runEngineSearch loop (After waitForEngineResult)
    content = content.replace('let rawResults = await waitForEngineResult(tab.id, timeout, engine);', 'let rawResults = await waitForEngineResult(tab.id, timeout, engine);\n                    await checkLockdown();');

    // [9] KR Filter Fix (1-4 words)
    content = content.replace('if (words.length < 2 || words.length > 3) return false;', 'if (words.length < 1 || words.length > 4) return false;');

    fs.writeFileSync(targetPath, content, { encoding: 'utf8' });
    console.log('Ultimate Ironclad Reconstruction complete.');
} catch (err) {
    console.error('Error:', err.message);
}

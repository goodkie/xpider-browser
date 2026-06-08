const fs = require('fs');
const baselinePath = 'e:\\vivpr\\ai\\collect-list\\restore_v5\\extension\\background.js';
const targetPath = 'e:\\vivpr\\ai\\collect-list\\extension\\background.js';

try {
    let content = fs.readFileSync(baselinePath, 'utf8');

    // [1] Add Global State: isPausedByCaptcha
    content = content.replace('let isCancelled = false;', 'let isCancelled = false;\nlet isPausedByCaptcha = false;');

    // [2] Add checkLockdown & safeRemoveTab utilities
    const utilities = `
async function checkLockdown() {
    while (isPausedByCaptcha && !isCancelled) {
        await new Promise(r => setTimeout(r, 2000));
        // 실시간 복구 체크는 heartbeat 진입점에서 수행됨
    }
}

async function safeRemoveTab(tabId) {
    if (!tabId) return;
    try {
        const tab = await chrome.tabs.get(tabId);
        if (tab.url.includes('challenge') || tab.url.includes('sorry') || tab.url.includes('captcha')) {
            console.warn("CAPTCHA DETECTED - Tab removal blocked for manual solving.");
            return;
        }
        await chrome.tabs.remove(tabId);
    } catch (e) { }
}
`;
    content = content.replace('let searchQueue = [];', 'let searchQueue = [];' + utilities);

    // [3] Inject checkLockdown into deepScan3Stage
    // Target: inside the loop
    content = content.replace('for (let i = 0; i < targets.length; i++) {', 'for (let i = 0; i < targets.length; i++) {\n        await checkLockdown();');

    // [4] Inject safeRemoveTab into deepScan3Stage (Replace generic remove)
    content = content.replace(/await chrome\.tabs\.remove\(tab\.id\)\.catch\(\(\) => \{ \}\);/g, 'await safeRemoveTab(tab.id);');

    // [5] Inject Heartbeat into scanPageInBrowser
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
                    sendLog("⚠️ CAPTCHA DETECTED - PLEASE SOLVE TO CONTINUE!");
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

    // [6] Aligned onMessage listener at the end
    const alignedListener = `chrome.runtime.onMessage.addListener((m, sender, sendResponse) => {
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
            percent: (typeof currentProgressPercent !== 'undefined' ? currentProgressPercent : 0),
            progress: (typeof currentProgressPercent !== 'undefined' ? currentProgressPercent : 0)
        });
    } else if (m.action === 'GET_CAPTCHA_STATUS') {
        sendResponse({ isPaused: isPausedByCaptcha, isPausedByCaptcha });
    } else if (m.action === 'result') {
        sessionResults.push(m.data);
    }
    return true; 
});`;

    // Replace the entire old onMessage listener
    content = content.replace(/chrome\.runtime\.onMessage\.addListener\([\s\S]+?\}\s*\);/g, alignedListener);

    // [7] Relax Korean Name Filter (2-4 words)
    content = content.replace('if (words.length < 2 || words.length > 3) return false;', 'if (words.length < 1 || words.length > 4) return false;');

    fs.writeFileSync(targetPath, content, { encoding: 'utf8' });
    console.log('Ironclad Mega-Patch executed on top of restore_v5 baseline.');
} catch (err) {
    console.error('Error:', err.message);
}

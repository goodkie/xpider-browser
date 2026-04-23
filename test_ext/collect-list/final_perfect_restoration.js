const fs = require('fs');
const baselinePath = 'e:\\vivpr\\ai\\collect-list\\restore_v5\\extension\\background.js';
const targetPath = 'e:\\vivpr\\ai\\collect-list\\extension\\background.js';

try {
    let content = fs.readFileSync(baselinePath, 'utf8');

    // [1] Global State Restitution
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

    // [3] Perfect waitForEngineResult (Complete override to avoid brace errors)
    const newWaitForEngine = `function waitForEngineResult(tabId, timeout, engine = '') {
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
                } else if (isPausedByCaptcha) {
                    isPausedByCaptcha = false;
                }
            } catch (e) { }
        }, 1500);

        const handler = (m, s) => {
            if (s.tab && s.tab.id === tabId) {
                if (m.action === 'engineStatus') {
                    if (m.status === 'loaded' || m.status === 'waiting') {
                        sendLog(\`  💓 [\${engine}] Status: \${m.status}\${m.retry ? \` (Retry \${m.retry}/4)\` : ''} [\${m.isMainFrame ? 'Main' : 'Iframe'}]\`);
                        if (m.isMainFrame && timer) {
                            clearTimeout(timer);
                            const resetGrace = engine.includes('maps') ? 12000 : 5000;
                            timer = setTimeout(finish, resetGrace);
                        }
                    }
                    return;
                }
                if (m.action === 'engineSearchResult' || m.action === 'portalResult') {
                    let rs = m.results || m.links || [];
                    const senderUrl = s.url || m.frameUrl || '';
                    if (naverMaps) {
                        if (!senderUrl.includes('pcmap.place.naver.com') && !senderUrl.includes('map.naver.com/p/search')) return;
                    } else if (yahooMaps) {
                        if (!senderUrl.includes('map.yahoo.co.jp') && !senderUrl.includes('search.yahoo.co.jp')) {
                            if (!senderUrl.includes('yahoo.co.jp')) return;
                        }
                    } else if (engine === 'bing_maps') {
                        if (!senderUrl.includes('bing.com/maps') && !senderUrl.includes('bing.com/search')) return;
                    }
                    if (rs.length > 0) {
                        items = [...items, ...rs];
                        if (m.isMainFrame) {
                            if (timer) clearTimeout(timer);
                            timer = setTimeout(finish, 4000);
                        }
                    } else if (m.action === 'engineSearchResult' && m.isMainFrame) {
                        if (timer) clearTimeout(timer);
                        const isMap = engine.includes('maps');
                        timer = setTimeout(finish, isMap ? 12000 : 1000);
                    }
                }
            }
        };
        chrome.runtime.onMessage.addListener(handler);
        timer = setTimeout(finish, timeout + 5000);
    });
}
`;
    
    // Replacement range for waitForEngineResult in baseline (starts at line 1672, ends at 1755)
    // We use a regex for safety based on the function name and end
    const oldWaitForEngineRegex = /function waitForEngineResult\(tabId, timeout, engine = ''\) \{[\s\S]+?\}\n\}/;
    // Wait, the regex needs to be precise. 
    // In restore_v5, Line 1754: }); Line 1755: }
    content = content.replace(/function waitForEngineResult\(tabId, timeout, engine = ''\) \{[\s\S]+?\}\n\}/, newWaitForEngine);

    // [4] Aligned onMessage Listener
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
    
    // Replace the main listener in baseline (1650-1666)
    content = content.replace(/chrome\.runtime\.onMessage\.addListener\(\(request, sender, sendResponse\) => \{[\s\S]+?\}\);\n/, newGlobalListener);

    // [5] Loop Protections (checkLockdown)
    content = content.replace('for (let page = 1; page <= maxPages; page++) {', 'for (let page = 1; page <= maxPages; page++) {\n                if (isCancelled) break;\n                await checkLockdown();');
    content = content.replace('let rawResults = await waitForEngineResult(tab.id, timeout, engine);', 'let rawResults = await waitForEngineResult(tab.id, timeout, engine);\n                    await checkLockdown();');
    content = content.replace('await deepScan3Stage(targets, \'TEXT_LIST\', hl, gl, t);', 'await checkLockdown();\n            await deepScan3Stage(targets, \'TEXT_LIST\', hl, gl, t);');
    content = content.replace('for (let i = 0; i < targets.length; i++) {', 'for (let i = 0; i < targets.length; i++) {\n        await checkLockdown();');

    // [6] Heartbeat Stage 2 (scanPageInBrowser)
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

    // [7] SafeRemoveTab replacements
    content = content.replace('if (tab) await chrome.tabs.remove(tab.id).catch(() => { });', 'await safeRemoveTab(tab ? tab.id : null);');

    // [8] KR Filter
    content = content.replace('if (words.length < 2 || words.length > 3) return false;', 'if (words.length < 1 || words.length > 4) return false;');

    fs.writeFileSync(targetPath, content, { encoding: 'utf8' });
    console.log('Final Perfect Restoration complete.');
} catch (err) {
    console.error('Error:', err.message);
}

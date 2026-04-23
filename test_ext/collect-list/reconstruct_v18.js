const fs = require('fs');
const filePath = 'e:\\vivpr\\ai\\collect-list\\extension\\background.js';
const baselinePath = 'e:\\vivpr\\ai\\collect-list\\restore_v5\\extension\\background.js';

try {
    let baseline = fs.readFileSync(baselinePath, 'utf8');

    // Remove the old handlers from the baseline (anything after extractProperNouns)
    // Actually, baseline ends with extractProperNouns! (Total Lines 1814)

    // Reconstruct the missing Round 17 logic
    const sessionManagement = `
let sessionResults = [];
let sessionLogs = [];
let currentProgressPercent = 0;
let isPausedByCaptcha = false;
let isSearching = false;
let isCancelled = false;

async function checkLockdown() {
    while (isPausedByCaptcha) {
        await new Promise(r => setTimeout(r, 2000));
    }
}

async function safeRemoveTab(tabId) {
    if (isPausedByCaptcha) return; 
    try {
        await chrome.tabs.remove(tabId);
    } catch(e) {}
}

function sendLog(msg) {
    const timestamp = new Date().toLocaleTimeString();
    const logObj = { action: 'log', message: msg, time: timestamp };
    
    if (typeof sessionLogs !== 'undefined') {
        sessionLogs.push(logObj);
        if (sessionLogs.length > 400) sessionLogs.shift();
    }
    
    chrome.runtime.sendMessage(logObj).catch(() => { });
    console.log('[LOG][' + timestamp + '] ' + msg);
}
`;

    // Improved Engine Search (Round 17 Fragment)
    const runEngineSearchImproved = `
async function runEngineSearch(enginesArr, keyword, maxPages, collectEmails = false, mapAuto = false, deepPages = 2) {
    if (isSearching) {
        getT().then(t => sendLog(t('already_searching') || '⚠️ 이미 수집이 진행 중입니다. 잠시만 기다려주세요.'));
        return;
    }
    isSearching = true;
    isCancelled = false;
    sessionResults = [];
    sessionLogs = [];
    currentProgressPercent = 0;

    const t = await getT();
    sendLog(t('log_preparing'));

    await chrome.storage.local.set({ currentKeyword: keyword });

    try {
        let engines = Array.isArray(enginesArr) ? enginesArr : [enginesArr];
        const storage = await chrome.storage.local.get(['language', 'region']);
        const hl = storage.language || 'en', gl = storage.region || 'us';

        for (const engine of engines) {
            if (isCancelled) break;
            
            // [v14.0] Pause if another process solving a CAPTCHA
            await checkLockdown();
            
            sendLog(t('log_engine_start', { region: gl.toUpperCase(), lang: hl.toUpperCase() }));

            for (let page = 1; page <= maxPages; page++) {
                if (isCancelled) break;
                await checkLockdown();

                let searchUrl = ''; // Simplified URL logic for reconstruction baseline
                const q = encodeURIComponent(keyword);
                const gTld = (gl === 'kr') ? 'co.kr' : (gl === 'jp' ? 'co.jp' : 'com');
                
                if (engine === 'google') searchUrl = \`https://www.google.\${gTld}/search?q=\${q}&start=\${(page -1)*10}&hl=\${hl}&gl=\${gl}\`;
                else if (engine === 'naver') searchUrl = \`https://search.naver.com/search.naver?where=web&query=\${q}&start=\${(page -1)*10 + 1}\`;
                else if (engine === 'naver_place') searchUrl = \`https://place.naver.com/search?query=\${q}\`;
                else if (engine === 'google_maps') searchUrl = \`https://www.google.\${gTld}/maps/search/\${q}?hl=\${hl}&gl=\${gl}\`;
                else if (engine === 'yahoojp') searchUrl = \`https://search.yahoo.co.jp/search?p=\${q}&b=\${(page - 1) * 10 + 1}\`;
                else if (engine === 'yahoo_maps') searchUrl = \`https://map.yahoo.co.jp/search?q=\${q}\`;
                else if (engine === 'bing') searchUrl = \`https://www.bing.com/search?q=\${q}&first=\${(page - 1) * 10 + 1}\`;
                else if (engine === 'bing_maps') searchUrl = \`https://www.bing.com/maps?q=\${q}\`;
                else continue;

                let tab = null;
                try {
                    tab = await chrome.tabs.create({ url: searchUrl, active: false });
                    
                    // Heartbeat focus loop (Round 13/14)
                    let hLimit = 0;
                    while (hLimit < 10) {
                        try {
                           let currentStatus = await chrome.tabs.get(tab.id);
                           if (currentStatus.url.includes('challenge') || currentStatus.url.includes('google.com/sorry') || currentStatus.url.includes('captcha')) {
                               isPausedByCaptcha = true;
                               chrome.windows.update(currentStatus.windowId, { focused: true });
                               chrome.tabs.update(tab.id, { active: true });
                               await new Promise(r => setTimeout(r, 6000));
                               hLimit = 0; // Reset heart limit if detected
                               continue;
                           }
                        } catch(e) {}
                        await new Promise(r=>setTimeout(r, 1000));
                        hLimit++;
                    }

                    const timeout = engine.includes('maps') ? 35000 : 20000;
                    let rawResults = await waitForEngineResult(tab.id, timeout, engine);
                    
                    if (rawResults && rawResults.length > 0) {
                        const targets = [];
                        for (const r of rawResults) {
                            if (r.name) {
                                targets.push({ name: r.name, url: r.url });
                            }
                        }
                        if (targets.length > 0) {
                            await deepScan3Stage(targets, engine.toUpperCase(), hl, gl, t);
                        }
                    }
                } catch (e) {
                    sendLog(\`⚠️ error: \${e.message}\`);
                } finally {
                    if (tab) await safeRemoveTab(tab.id);
                }
                currentProgressPercent = (page / maxPages) * 100;
                chrome.runtime.sendMessage({ action: 'progress', percent: currentProgressPercent });
                await new Promise(r => setTimeout(r, 1500));
            }
        }
    } finally {
        isSearching = false;
        currentProgressPercent = 100;
        chrome.runtime.sendMessage({ action: 'complete' });
    }
}
`;

    // Main Message Handler (Round 17 Version)
    const messageHandler = `
chrome.runtime.onMessage.addListener((m, sender, sendResponse) => {
    if (m.action === 'start') {
        runEngineSearch(m.engines, m.keyword, m.maxPages, m.collectEmails, m.mapAuto);
        sendResponse({ status: 'started' });
    } else if (m.action === 'crawl') {
        runWebsiteCrawl(m.url, m.depth);
        sendResponse({ status: 'crawling' });
    } else if (m.action === 'cancel') {
        isCancelled = true;
        isSearching = false;
        isPausedByCaptcha = false;
        sendResponse({ status: 'cancelled' });
    } else if (m.action === 'GET_SEARCH_STATE') {
        sendResponse({
            isSearching,
            isCancelled,
            isPausedByCaptcha,
            results: sessionResults,
            logs: sessionLogs,
            progress: currentProgressPercent
        });
    } else if (m.action === 'GET_CAPTCHA_STATUS') {
        sendResponse({ isPausedByCaptcha });
    } else if (m.action === 'result') {
        sessionResults.push(m.data);
    }
    return true; 
});
`;

    const finalFile = baseline + sessionManagement + runEngineSearchImproved + messageHandler;
    fs.writeFileSync(filePath, finalFile, { encoding: 'utf8' });
    console.log('Final reconstruction successful.');
} catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
}

const fs = require('fs');
const path = require('path');

const baselinePath = 'e:\\vivpr\\ai\\collect-list\\restore_v5\\extension\\background.js';
const targetPath = 'e:\\vivpr\\ai\\collect-list\\extension\\background.js';

function nuclearFixV3() {
    let content = fs.readFileSync(baselinePath, 'utf8');
    let lines = content.split('\n');

    // [0] Mandatory Global Variables Injection (at the top after imports)
    let importEndIdx = 0;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('importScripts')) {
            importEndIdx = i + 1;
        }
    }
    
    const globalVars = [
        'let isSearching = false;',
        'let isCancelled = false;',
        'let isPausedByCaptcha = false;',
        'let sessionResults = [];',
        'let sessionLogs = [];',
        'let currentProgressPercent = 0;'
    ];
    lines.splice(importEndIdx, 0, ...globalVars);

    // [1] sendLog implementation (Robust)
    let sendLogIdx = lines.findIndex(l => l.includes('function sendLog'));
    if (sendLogIdx === -1) {
        lines.push(\`
function sendLog(msg) {
    const timestamp = new Date().toLocaleTimeString();
    const logObj = { time: timestamp, message: msg };
    sessionLogs.push(logObj);
    chrome.runtime.sendMessage({ action: 'log', message: msg }).catch(() => { });
    console.log('[LOG]', msg);
}\`);
    }

    // [2] checkLockdown Utility
    lines.push(\`
async function checkLockdown() {
    while (isPausedByCaptcha && !isCancelled) {
        await new Promise(r => setTimeout(r, 2000));
    }
}
\`);

    // [3] safeRemoveTab Utility
    lines.push(\`
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
\`);

    // [4] onMessage Listener (Fully Integrated)
    let listenerStart = lines.findIndex(l => l.includes('chrome.runtime.onMessage.addListener'));
    let listenerEnd = -1;
    if (listenerStart !== -1) {
        let bCount = 0;
        for (let i = listenerStart; i < lines.length; i++) {
            if (lines[i].includes('{')) bCount++;
            if (lines[i].includes('}')) bCount--;
            if (bCount === 0 && i > listenerStart) {
                listenerEnd = i;
                break;
            }
        }
    }

    const newListener = \`chrome.runtime.onMessage.addListener((m, sender, sendResponse) => {
    if (m.action === 'startSearch') {
        sessionResults = [];
        sessionLogs = [];
        sendLog('[System] Starting Text List Extraction...');
        currentProgressPercent = 0;
        isSearching = true;
        isCancelled = false;
        startSearchProcess(m.text, m.collectEmails);
        if (sendResponse) sendResponse({ status: 'started' });
    } else if (m.action === 'startCrawl') {
        runWebsiteCrawl(m.url, m.depth);
        if (sendResponse) sendResponse({ status: 'crawling' });
    } else if (m.action === 'startEngineSearch') {
        runEngineSearch(m.engines, m.keyword, m.maxPages, m.collectEmails, m.mapAuto, m.deepPages);
        if (sendResponse) sendResponse({ status: 'started' });
    } else if (m.action === 'cancelSearch' || m.action === 'cancel') {
        isCancelled = true;
        isSearching = false;
        isPausedByCaptcha = false;
        if (sendResponse) sendResponse({ status: 'cancelled' });
    } else if (m.action === 'GET_SEARCH_STATE') {
        if (sendResponse) sendResponse({
            isSearching,
            isCancelled,
            isPausedByCaptcha,
            isPaused: isPausedByCaptcha,
            results: sessionResults,
            logs: sessionLogs,
            percent: currentProgressPercent,
            progress: currentProgressPercent
        });
    } else if (m.action === 'result') {
        sessionResults.push(m.data);
    }
    return true; 
});\`;

    if (listenerStart !== -1 && listenerEnd !== -1) {
        lines.splice(listenerStart, (listenerEnd - listenerStart) + 1, newListener);
    } else {
        lines.push(newListener);
    }

    // [5] startSearchProcess replacement
    let sspStart = lines.findIndex(l => l.includes('async function startSearchProcess'));
    if (sspStart !== -1) {
        let sspEnd = -1;
        let bCount = 0;
        for (let i = sspStart; i < lines.length; i++) {
            if (lines[i].includes('{')) bCount++;
            if (lines[i].includes('}')) bCount--;
            if (bCount === 0 && i > sspStart) {
                sspEnd = i;
                break;
            }
        }
        
        if (sspEnd !== -1) {
            const newSSP = \`async function startSearchProcess(rawText, collectEmails = false) {
    if (isSearching === false) isSearching = true; 
    sendLog('🚀 Initializing text processor...');

    const storage = await chrome.storage.local.get(['language', 'region']);
    const hl = storage.language || 'en';
    const gl = storage.region || 'us';
    const t = await getT();

    isCancelled = false;
    sendLog(t('log_text_start_init', { count: rawText.length }));

    try {
        const storageMode = await chrome.storage.local.get(['extractionMode', 'geminiApiKey']);
        const mode = storageMode.extractionMode || 'normal';
        let names = [];

        if (mode === 'ai' && storageMode.geminiApiKey) {
            sendLog("🤖 AI Mode: Analyzing text with Gemini...");
            names = await getGeminiExtraction(rawText, "General Extraction", storageMode.geminiApiKey);
        } else {
            names = extractProperNouns(rawText, hl);
        }

        let targets = names.map(n => ({ name: n, context: '', url: '' }));
        const blacklist = hl === 'ja' ? (typeof JA_BLACKLIST !== 'undefined' ? JA_BLACKLIST : []) :
            (hl === 'ko' ? (typeof KO_BLACKLIST !== 'undefined' ? KO_BLACKLIST : []) : []);
        
        const beforeCount = targets.length;
        targets = targets.filter(tt => {
            let name = tt.name.trim();
            if (!name || name.length < 2 || name.length > 50) return false;
            const lower = name.toLowerCase();
            if (typeof GLOBAL_BLACKLIST_SET !== 'undefined' && GLOBAL_BLACKLIST_SET.has(lower)) return false;
            if (/^[\\\\d\\\\-+().\\\\s#@%$&*]+$/.test(name)) return false;

            if (typeof stripAddressFromName === 'function') {
                name = stripAddressFromName(name, hl);
                tt.name = name;
            }
            if (!name || name.length < 2) return false;

            const viable = isViableBusinessName(name, hl, blacklist);
            if (!viable) {
                const words = name.split(/\\\\s+/).filter(w => w.length > 0);
                if (words.length < 1) return false;
                if (name.length > 20) return true; 
                if (hl === 'ko' && words.length >= 1) return true; 
            }
            return viable || true;
        });

        sendLog(t('log_filter_after', { count: beforeCount, valid: targets.length }));

        if (targets.length === 0) {
            sendLog(t('no_valid_names'));
            isSearching = false;
            chrome.runtime.sendMessage({ action: 'complete' });
            return;
        }

        sendLog(t('log_text_start', { count: targets.length }));
        await checkLockdown();
        await deepScan3Stage(targets, 'TEXT_LIST', hl, gl, t);

    } catch (e) {
        sendLog(\\\`❌ Error: \\\${e.message}\\\`);
    } finally {
        isSearching = false;
        chrome.runtime.sendMessage({ action: 'complete' });
    }
}\`;
            lines.splice(sspStart, (sspEnd - sspStart) + 1, newSSP);
        }
    }

    // [6] Heartbeat Stage 2 in scanPageInBrowser
    content = lines.join('\\n');
    const heartbeatStage2 = \`
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
    \`;
    content = content.replace('await new Promise(r => setTimeout(r, waitMs));', 'await new Promise(r => setTimeout(r, waitMs));' + heartbeatStage2);

    // [7] Universal checkLockdown injections into runEngineSearch (Search loop)
    content = content.replace('for (let page = 1; page <= maxPages; page++) {', 'for (let page = 1; page <= maxPages; page++) {\\n                if (isCancelled) break;\\n                await checkLockdown();');
    
    // [8] safeRemoveTab Replacements
    content = content.replace(/await chrome\\.tabs\\.remove\\(tab\\.id\\)\\.catch\\(\\(\\) => \\{ \\}\\);/g, 'await safeRemoveTab(tab.id);');
    content = content.replace('if (tab) await chrome.tabs.remove(tab.id).catch(() => { });', 'await safeRemoveTab(tab ? tab.id : null);');

    fs.writeFileSync(targetPath, content, { encoding: 'utf8' });
    console.log('NUCLEAR RECONSTRUCTION SUCCESSFUL V3.');
}

nuclearFixV3();

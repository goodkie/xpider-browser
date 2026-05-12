const fs = require('fs');
const filePath = 'e:\\vivpr\\ai\\collect-list\\extension\\background.js';

try {
    let content = fs.readFileSync(filePath, 'utf8');

    // [1] Inject checkLockdown into runEngineSearch (Line 1245)
    // Target: inside the page loop before tab creation
    content = content.replace('for (let page = 1; page <= maxPages; page++) {', 'for (let page = 1; page <= maxPages; page++) {\n                if (isCancelled) break;\n                await checkLockdown();');

    // [2] Inject checkLockdown into runWebsiteCrawl
    content = content.replace('async function runWebsiteCrawl(startUrl, maxDepth) {', 'async function runWebsiteCrawl(startUrl, maxDepth) {\n    await checkLockdown();');

    // [3] Inject checkLockdown into startSearchProcess
    content = content.replace('async function startSearchProcess(rawText, collectEmails', 'async function startSearchProcess(rawText, collectEmails');
    // Ensure checkLockdown is before deepScan3Stage in startSearchProcess
    content = content.replace('await deepScan3Stage(targets, \'TEXT_LIST\', hl, gl, t);', 'await checkLockdown();\n            await deepScan3Stage(targets, \'TEXT_LIST\', hl, gl, t);');

    // [4] Harden heartbeat loop in scanPageInBrowser
    // Prevent flickering: only set isPausedByCaptcha = false at the very end or if explicitly resolved.
    const improvedHeartbeat = `
        // [Ironclad Round 24] Global Lockout Heartbeat
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
                }
            } catch(e) {}
            await new Promise(r => setTimeout(r, 1000));
            hLimitEnrich++;
        }
        isPausedByCaptcha = false; // Resolved only after heartbeat ends or success
    `;
    
    // Replace the old heartbeat loop block.
    // It starts with "// [Ironclad Round 23] Heartbeat focus & CAPTCHA monitor"
    const oldHeartbeatRegex = /\/\/ \[Ironclad Round 23\] Heartbeat focus & CAPTCHA monitor[\s\S]+?hLimitEnrich\+\+;\s+\}/;
    content = content.replace(oldHeartbeatRegex, improvedHeartbeat);

    fs.writeFileSync(filePath, content, { encoding: 'utf8' });
    console.log('Global lockout patch (Round 24) complete.');
} catch (err) {
    console.error('Error:', err.message);
}

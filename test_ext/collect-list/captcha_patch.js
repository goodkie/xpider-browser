const fs = require('fs');
const filePath = 'e:\\vivpr\\ai\\collect-list\\extension\\background.js';

try {
    let content = fs.readFileSync(filePath, 'utf8');

    // [1] Define checkLockdown and safeRemoveTab
    const utils = `
// =====================================================
// [v15.0] CAPTCHA Lockdown Utilities
// =====================================================
async function checkLockdown() {
    while (isPausedByCaptcha) {
        if (isCancelled) break;
        await new Promise(r => setTimeout(r, 1000));
    }
}

async function safeRemoveTab(tabId) {
    try {
        const tab = await chrome.tabs.get(tabId);
        if (tab.url.includes('google.com/sorry') || tab.url.includes('captcha') || tab.url.includes('challenge')) {
            console.log('Skipping tab removal: CAPTCHA detected');
            return;
        }
        await chrome.tabs.remove(tabId);
    } catch (e) { }
}
`;
    // Insert after global definitions (Line 20 approx)
    content = content.replace(/importScripts\('noise_dictionary\.js'\);/, "importScripts('noise_dictionary.js');\n" + utils);


    // [2] Add Heartbeat Detection to scanPageInBrowser
    const heartbeatDetection = `
        // [Round 21] Heartbeat Focus Detector (CAPTCHA Support)
        let hLimit = 0;
        while (hLimit < 12) {
            try {
                let currentStatus = await chrome.tabs.get(tab.id);
                if (currentStatus.url.includes('challenge') || currentStatus.url.includes('google.com/sorry') || currentStatus.url.includes('captcha')) {
                    isPausedByCaptcha = true;
                    chrome.windows.update(currentStatus.windowId, { focused: true });
                    chrome.tabs.update(tab.id, { active: true });
                    await new Promise(r => setTimeout(r, 5000));
                    hLimit = 0; 
                    continue;
                }
            } catch(e) {}
            await new Promise(r => setTimeout(r, 1000));
            hLimit++;
        }
        isPausedByCaptcha = false; // Resolved
`;

    // Insert after await new Promise(r => setTimeout(r, waitMs)); in scanPageInBrowser
    content = content.replace(/await new Promise\(r => setTimeout\(r, waitMs\)\);/, "await new Promise(r => setTimeout(r, waitMs));" + heartbeatDetection);


    // [3] Integrate checkLockdown in deepScan3Stage loop
    content = content.replace(/for \(let i = 0; i < targets\.length; i\+\+\) \{/, "for (let i = 0; i < targets.length; i++) {\n        await checkLockdown();");

    fs.writeFileSync(filePath, content, { encoding: 'utf8' });
    console.log('Captcha lockdown patch complete.');
} catch (err) {
    console.error('Error:', err.message);
}

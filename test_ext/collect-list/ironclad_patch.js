const fs = require('fs');
const filePath = 'e:\\vivpr\\ai\\collect-list\\extension\\background.js';

try {
    let content = fs.readFileSync(filePath, 'utf8');

    // [1] Ensure utilities are correctly defined (Restoration if missing)
    if (!content.includes('async function checkLockdown()')) {
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
        if (tab && tab.url && (tab.url.includes('google.com/sorry') || tab.url.includes('captcha') || tab.url.includes('challenge'))) {
            console.log('Skipping tab removal: CAPTCHA detected');
            return;
        }
        await chrome.tabs.remove(tabId);
    } catch (e) { }
}
`;
        content = content.replace(/importScripts\('noise_dictionary\.js'\);/, "importScripts('noise_dictionary.js');\n" + utils);
    }

    // [2] Ironclad scanPageInBrowser: Heartbeat loop + Safe Removal
    const heartbeatDetector = `
        // [Round 22] Ironclad Heartbeat CAPTCHA Detector
        let hLimit = 0;
        while (hLimit < 12) {
            try {
                let currentStatus = await chrome.tabs.get(tab.id);
                if (currentStatus.url.includes('google.com/sorry') || currentStatus.url.includes('captcha') || currentStatus.url.includes('challenge')) {
                    isPausedByCaptcha = true;
                    chrome.runtime.sendMessage({ action: 'captcha_required' });
                    chrome.windows.update(currentStatus.windowId, { focused: true });
                    chrome.tabs.update(tab.id, { active: true });
                    console.log('CAPTCHA Detected in Stage 2 Enrichment. Pausing.');
                    await new Promise(r => setTimeout(r, 6000));
                    hLimit = 0; // Reset
                    continue;
                }
            } catch(e) {}
            await new Promise(r => setTimeout(r, 1000));
            hLimit++;
        }
        isPausedByCaptcha = false;
`;

    // Target the line AFTER await new Promise(r => setTimeout(r, waitMs));
    content = content.replace(/await new Promise\(r => setTimeout\(r, waitMs\)\);/, "await new Promise(r => setTimeout(r, waitMs));" + heartbeatDetector);

    // [3] Replace ALL generic removals with safeRemoveTab
    content = content.replace(/if \(tab\) await chrome\.tabs\.remove\(tab\.id\)/g, "if (tab) await safeRemoveTab(tab.id)");

    // [4] Sync deepScan3Stage loop with lockdown
    // Remove duplicate checkLockdown if previous failed patch left one
    content = content.replace(/await checkLockdown\(\);\s*await checkLockdown\(\);/g, "await checkLockdown();");
    
    // Ensure one checkLockdown is present at the start of the loop
    if (!content.includes('for (let i = 0; i < targets.length; i++) {\n        await checkLockdown();')) {
        content = content.replace(/for \(let i = 0; i < targets\.length; i\+\+\) \{/, "for (let i = 0; i < targets.length; i++) {\n        await checkLockdown();");
    }

    fs.writeFileSync(filePath, content, { encoding: 'utf8' });
    console.log('Ironclad CAPTCHA patch complete.');
} catch (err) {
    console.error('Error:', err.message);
}

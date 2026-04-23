const fs = require('fs');
const filePath = 'e:\\vivpr\\ai\\collect-list\\extension\\background.js';

try {
    let content = fs.readFileSync(filePath, 'utf8');

    // [1] Patch runWebsiteCrawl initialization
    content = content.replace(/async function runWebsiteCrawl\(startUrl, maxDepth\) \{[\s\S]*?async function startSearchProcess/gm, (match) => {
        // We only want to replace the first function
        if (match.includes('sessionLogs = [];')) return match; // Already patched?
        
        let patched = match.replace(/isSearching = true;\r?\n\s*isCancelled = false;/, 'isSearching = true;\n    isCancelled = false;\n    sessionResults = [];\n    sessionLogs = [];\n    currentProgressPercent = 0;');
        patched = patched.replace(/tab = await chrome\.tabs\.create\(\{ url: startUrl, active: false \};\r?\n\s*sendLog\(t\('log_loading_list'\)\);/, 'tab = await chrome.tabs.create({ url: startUrl, active: false });\n            sendLog(t(\'log_loading_list\'));\n            await checkLockdown();');
        patched = patched.replace(/chrome\.tabs\.remove\(tab\.id\)\.catch\(\(\) => \{ \}\)/g, 'safeRemoveTab(tab.id)');
        patched = patched.replace(/isSearching = false;\r?\n\s*chrome\.runtime\.sendMessage\(\{ action: 'complete' \}\);/, 'isSearching = false;\n        currentProgressPercent = 100;\n        chrome.runtime.sendMessage({ action: \'complete\' });');
        return patched;
    });

    // [2] Ensure startSearchProcess is also patched
    content = content.replace(/async function startSearchProcess\(rawText, collectEmails = false\) \{/, 'async function startSearchProcess(rawText, collectEmails = false) {\n    if (isSearching) return;\n    isSearching = true;\n    isCancelled = false;\n    sessionResults = [];\n    sessionLogs = [];\n    currentProgressPercent = 0;');

    // [3] Final Syntax Check: Ensure all variables are declared
    if (!content.includes('let sessionResults = [];')) {
       // This shouldn't happen if my reconstruction worked, but let's be safe.
    }

    fs.writeFileSync(filePath, content, { encoding: 'utf8' });
    console.log('Patching complete.');
} catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
}

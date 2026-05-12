const fs = require('fs');
const filePath = 'e:\\vivpr\\ai\\collect-list\\extension\\background.js';

try {
    let content = fs.readFileSync(filePath, 'utf8');

    // [1] Add Universal URL Heartbeat to waitForEngineResult (around line 1720)
    // We need to inject a periodic check inside the Promise
    const improvedWaitForEngine = `function waitForEngineResult(tabId, timeout, engine = '') {
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

        // [Ironclad Round 25] Stage 1 CAPTCHA Monitor
        const urlCheckInterval = setInterval(async () => {
            if (isResolved) return;
            try {
                const tab = await chrome.tabs.get(tabId);
                if (tab.url.includes('google.com/sorry') || tab.url.includes('challenge') || tab.url.includes('captcha')) {
                    isPausedByCaptcha = true;
                    chrome.windows.update(tab.windowId, { focused: true });
                    chrome.tabs.update(tabId, { active: true });
                    // Keep the interval running and DON'T resolve until URL changes
                } else {
                    // Only resume if it was paused by this specific detection
                    // Wait for normal completion logic
                }
            } catch (e) { }
        }, 1500);

        const handler = (m, s) => {
            if (s.tab && s.tab.id === tabId) {
                // ... heartbeat status ...
`;

    // Replace waitForEngineResult starting lines
    const oldWaitForEngineRegex = /function waitForEngineResult\(tabId, timeout, engine = ''\) \{[\s\S]+?const handler = \(m, s\) => \{/;
    content = content.replace(oldWaitForEngineRegex, improvedWaitForEngine);

    // [2] Ensure checkLockdown is also called AFTER waitForEngineResult in Stage 1
    // This catches redirects that happen just as we finish or during the next cycle start
    content = content.replace('let rawResults = await waitForEngineResult(tab.id, timeout, engine);', 'let rawResults = await waitForEngineResult(tab.id, timeout, engine);\n                    await checkLockdown();');

    // [3] Mark Task Completion within the script for logging
    console.log('Universal heartbeat (Round 25) patch generated.');

    fs.writeFileSync(filePath, content, { encoding: 'utf8' });
    console.log('Universal heartbeat patch (Round 25) applied successfully.');
} catch (err) {
    console.error('Error:', err.message);
}

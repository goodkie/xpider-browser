const fs = require('fs');
const filePath = 'e:\\vivpr\\ai\\collect-list\\extension\\background.js';

try {
    let content = fs.readFileSync(filePath, 'utf8');

    // [1] Align onMessage Actions
    const newOnMessage = `chrome.runtime.onMessage.addListener((m, sender, sendResponse) => {
    if (m.action === 'startSearch') {
        // [Round 23] Text Data Mode
        startSearchProcess(m.text, m.language, m.region);
        sendResponse({ status: 'started' });
    } else if (m.action === 'startCrawl') {
        // [Round 23] Website Mode
        runWebsiteCrawl(m.url, m.depth);
        sendResponse({ status: 'crawling' });
    } else if (m.action === 'startEngineSearch') {
        // [Round 23] Main Engine Mode
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
            isPaused: isPausedByCaptcha, // [Round 23] Sync with popup.js
            results: sessionResults,
            logs: sessionLogs,
            percent: currentProgressPercent, // [Round 23] Fix field name
            progress: currentProgressPercent
        });
    } else if (m.action === 'GET_CAPTCHA_STATUS') {
        sendResponse({ isPaused: isPausedByCaptcha, isPausedByCaptcha });
    } else if (m.action === 'result') {
        sessionResults.push(m.data);
    }
    return true; 
});`;

    // Replace the old onMessage block (Line 2033+)
    content = content.replace(/chrome\.runtime\.onMessage\.addListener\([\s\S]+?\}\s*\);/g, newOnMessage);

    fs.writeFileSync(filePath, content, { encoding: 'utf8' });
    console.log('Communication lock patch complete.');
} catch (err) {
    console.error('Error:', err.message);
}

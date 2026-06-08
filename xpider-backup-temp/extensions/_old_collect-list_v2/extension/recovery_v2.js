const fs = require('fs');
const filePath = 'e:\\vivpr\\ai\\collect-list\\extension\\background.js';

try {
    let content = fs.readFileSync(filePath, 'utf8');

    // [1] Fix the corruption in waitForEngineResult
    // Target the block injected at ~1861
    const corruptedBlockRegex = /chrome\.runtime\.onMessage\.addListener\(\(m, sender, sendResponse\) => \{\s+if \(m\.action === 'startSearch'\) \{[\s\S]+?return true; \s*\}\);/;
    
    const correctLocalListener = `chrome.runtime.onMessage.addListener(handler);
        timer = setTimeout(finish, timeout);
    });
}`;

    if (content.match(corruptedBlockRegex)) {
        content = content.replace(corruptedBlockRegex, correctLocalListener);
        console.log('Fixed local listener in waitForEngineResult.');
    } else {
        console.warn('Could not find corrupted local listener block via regex.');
    }

    // [2] Ensure Global Listener at the very bottom is correct
    // (If it was also replaced, it's fine as long as it's the right one)
    // I'll check the last 2000 chars.
    
    const globalOnMessage = `chrome.runtime.onMessage.addListener((m, sender, sendResponse) => {
    if (m.action === 'startSearch') {
        startSearchProcess(m.text, m.language, m.region);
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

    // Remove any extra } characters that might have been left at line 1897
    // This is tricky. Let's look at the context after 1896 in Step 2149.
    // 1896: }); 
    // 1897: }
    // 1900: /**
    // My replacement 'correctLocalListener' ends with });\n}\n}` (if I'm careful).
    
    // Wait! Let's just use EXACT string replacement for the corrupted lines.
    
    fs.writeFileSync(filePath, content, { encoding: 'utf8' });
    console.log('Recovery step 1 complete.');
} catch (err) {
    console.error('Error:', err.message);
}

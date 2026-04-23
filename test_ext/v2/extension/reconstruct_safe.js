const fs = require('fs');
const filePath = 'e:\\vivpr\\ai\\collect-list\\extension\\background.js';

try {
    let content = fs.readFileSync(filePath, 'utf8');

    // [1] Remove the "Frankenstein" corrupted block after startSearchProcess (around 1739)
    // We target the exact pattern we saw: 
    // } catch (error) { ... } \n } \n // 메시지 리서너 \n chrome.runtime.onMessage.addListener(handler); ...
    const corruptSegment1 = `    } catch (error) {
        console.error("Search Process Error:", error);
        sendLog("❌ Error: " + (error.message || error));
        isSearching = false;
        chrome.runtime.sendMessage({ action: 'complete' });
    }
}

// 메시지 리스너
chrome.runtime.onMessage.addListener(handler);
        timer = setTimeout(finish, timeout);
    });
}`;
    // Replace with a clean function end
    const cleanSegment1 = `    } catch (error) {
        console.error("Search Process Error:", error);
        sendLog("❌ Error: " + (error.message || error));
        isSearching = false;
        chrome.runtime.sendMessage({ action: 'complete' });
    }
}`;
    content = content.replace(corruptSegment1, cleanSegment1);

    // [2] Remove the redundant "tail" listeners at the end of the file
    // Find the LAST chrome.runtime.onMessage.addListener and keep only ONE correct version.
    const startOfOnMessage = content.indexOf('chrome.runtime.onMessage.addListener((m, sender, sendResponse) => {');
    if (startOfOnMessage !== -1) {
        // Cut the file from the FIRST onMessage listener start
        const head = content.substring(0, startOfOnMessage);
        
        // Define the PERFECT SINGLE GLOBAL LISTENER
        const perfectListener = `chrome.runtime.onMessage.addListener((m, sender, sendResponse) => {
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
});
`;
        fs.writeFileSync(filePath, head + perfectListener, { encoding: 'utf8' });
        console.log('Reconstruction complete.');
    } else {
        console.warn('Could not find onMessage listener start.');
    }

} catch (err) {
    console.error('Error:', err.message);
}

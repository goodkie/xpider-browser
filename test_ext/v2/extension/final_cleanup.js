const fs = require('fs');
const filePath = 'e:\\vivpr\\ai\\collect-list\\extension\\background.js';

try {
    let content = fs.readFileSync(filePath, 'utf8');

    // 1. Global Mojibake Cleanup
    // '?좑툘' is a common corruption of the ⚠️ emoji in this file's context
    content = content.replace(/\?좑툘/g, '⚠️');
    
    // Other common corruptions seen in logs
    content = content.replace(/\?대\?/g, '이미');
    content = content.replace(/\?섏쭛??/g, '수집이');
    content = content.replace(/吏꾪뻾 以묒엯?덈떎/g, '진행 중입니다');
    content = content.replace(/\?좎떆留\? 湲곕떎\?ㅼ＜\?몄슂/g, '잠시만 기다려주세요');

    // 2. Ensure runWebsiteCrawl finally block has progress = 100
    // Identifying the block around line 1920
    const crawlFinallyRegex = /(async function runWebsiteCrawl[\s\S]*?finally\s*{[\s\S]*?isSearching = false;\r?\n)/;
    if (crawlFinallyRegex.test(content)) {
        content = content.replace(crawlFinallyRegex, '$1        currentProgressPercent = 100;\n');
    } else {
        // Fallback: target the specific isSearching = false in the crawl section
        // We know it's around 1920
        const lines = content.split(/\r?\n/);
        for (let i = 1910; i < 1940 && i < lines.length; i++) {
            if (lines[i].includes('isSearching = false;') && !lines[i+1].includes('currentProgressPercent = 100;')) {
                lines[i] = lines[i] + '\n        currentProgressPercent = 100;';
                break;
            }
        }
        content = lines.join('\n');
    }

    fs.writeFileSync(filePath, content, { encoding: 'utf8' });
    console.log('Final cleanup and fixes applied.');
} catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
}

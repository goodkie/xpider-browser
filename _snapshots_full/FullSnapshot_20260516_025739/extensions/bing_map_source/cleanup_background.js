const fs = require('fs');
const filePath = 'e:\\vivpr\\ai\\collect-list\\extension\\background.js';

try {
    let content = fs.readFileSync(filePath, 'utf8');

    // 1. Extract sessionManagement block from the bottom (or where it was added)
    const sessionVarsRegex = /let sessionResults = \[\];\r?\nlet sessionLogs = \[\];\r?\nlet currentProgressPercent = 0;\r?\nlet isPausedByCaptcha = false;\r?\nlet isSearching = false;\r?\nlet isCancelled = false;/;
    let sessionVars = '';
    content = content.replace(sessionVarsRegex, (match) => {
        sessionVars = match;
        return '';
    });

    // 2. Move it to the TOP (after importScripts)
    if (sessionVars) {
        content = content.replace(/(importScripts\(.*?\);\r?\n)/, '$1\n' + sessionVars + '\n');
    }

    // 3. Remove duplicates in startSearchProcess
    content = content.replace(/async function startSearchProcess\(rawText, collectEmails = false\) \{[\s\S]*?if \(isSearching\) return;[\s\S]*?isSearching = true;/, (match) => {
        // Keep the first block of initializations, remove the second 'if (isSearching) return;'
        const lines = match.split('\n');
        const uniqueLines = [];
        const seen = new Set();
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed === 'if (isSearching) return;' || trimmed === 'isSearching = true;' || trimmed === 'isCancelled = false;') {
                if (seen.has(trimmed)) continue;
                seen.add(trimmed);
            }
            uniqueLines.push(line);
        }
        return uniqueLines.join('\n');
    });

    fs.writeFileSync(filePath, content, { encoding: 'utf8' });
    console.log('Cleanup and optimization complete.');
} catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
}

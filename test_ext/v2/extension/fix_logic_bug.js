const fs = require('fs');
const filePath = 'e:\\vivpr\\ai\\collect-list\\extension\\background.js';

try {
    let content = fs.readFileSync(filePath, 'utf8');

    // 1. Target the problematic startSearchProcess block specifically
    // We remove the duplicate 'if (isSearching)' check that causes the early return bug.
    content = content.replace(/isSearching = true;\r?\n\s*isCancelled = false;\r?\n\s*sessionResults = \[\];\r?\n\s*sessionLogs = \[\];\r?\n\s*currentProgressPercent = 0;\r?\n\s*if \(isSearching\) return;\r?\n\s*isSearching = true;/g, (match) => {
        return 'isSearching = true;\n    isCancelled = false;\n    sessionResults = [];\n    sessionLogs = [];\n    currentProgressPercent = 0;';
    });

    fs.writeFileSync(filePath, content, { encoding: 'utf8' });
    console.log('Critical logic bug fixed.');
} catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
}

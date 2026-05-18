const fs = require('fs');
const filePath = 'e:\\vivpr\\ai\\collect-list\\extension\\background.js';

try {
    let lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
    let newLines = [];
    let seenSearching = false;
    let seenCancelled = false;

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        
        // Remove duplicate isSearching
        if (line.trim().includes('let isSearching = false;')) {
            if (seenSearching) {
                console.log(`Removing duplicate isSearching at line ${i+1}`);
                continue; 
            }
            seenSearching = true;
        }

        // Remove duplicate isCancelled
        if (line.trim().includes('let isCancelled = false;')) {
            if (seenCancelled) {
                console.log(`Removing duplicate isCancelled at line ${i+1}`);
                continue;
            }
            seenCancelled = true;
        }

        newLines.push(line);
    }

    fs.writeFileSync(filePath, newLines.join('\n'), { encoding: 'utf8' });
    console.log('Deduplication complete.');
} catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
}

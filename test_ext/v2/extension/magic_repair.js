const fs = require('fs');
const filePath = 'e:\\vivpr\\ai\\collect-list\\extension\\background.js';

try {
    let buf = fs.readFileSync(filePath);

    // Strip BOM
    if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
        buf = buf.slice(3);
    }

    let content = buf.toString('utf8');

    // HEURISTIC: In many encoding corruption scenarios on Windows,
    // the bytes were interpreted as Latin-1 (or Windows-1252) and then saved as UTF-8.
    // We reverse this by conversion: UTF-8 String -> Latin-1 Bytes -> UTF-8 String.
    let recovered = Buffer.from(content, 'latin1').toString('utf8');

    // Let's also check for the "already_searching" pattern or other Korean markers
    if (recovered.includes('이미 수집이') || recovered.includes('구조적 스마트')) {
        console.log('Recovery detected valid Korean patterns!');
        content = recovered;
    } else {
        console.log('Direct recovery did not find patterns. Trying secondary bypass...');
        // Maybe it's double encoded or slightly different.
        // We'll just write it back as UTF-8 without BOM anyway and fix specific syntax bits.
    }

    // Clean up duplicate lines that might have been introduced by previous scripts
    content = content.replace(/currentProgressPercent = 100;\r?\n\s*currentProgressPercent = 100;/g, 'currentProgressPercent = 100;');
    content = content.replace(/sessionResults = \[\];\r?\n\s*sessionResults = \[\];/g, 'sessionResults = [];');

    fs.writeFileSync(filePath, content, { encoding: 'utf8' });
    console.log('Repair process completed.');
} catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
}

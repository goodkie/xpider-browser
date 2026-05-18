const fs = require('fs');
const filePath = 'e:\\vivpr\\ai\\collect-list\\extension\\background.js';

try {
    let content = fs.readFileSync(filePath, 'utf8');

    // Rename the hLimit in scanPageInBrowser to hLimitEnrich
    // (It's located after "Ironclad Heartbeat CAPTCHA Detector")
    content = content.replace(/let hLimit = 0;/, "let hLimitEnrich = 0;");
    content = content.replace(/while \(hLimit < 12\)/, "while (hLimitEnrich < 12)");
    content = content.replace(/hLimit = 0;/, "hLimitEnrich = 0;");
    content = content.replace(/hLimit\+\+;/, "hLimitEnrich++;");

    fs.writeFileSync(filePath, content, { encoding: 'utf8' });
    console.log('hLimit deduplication complete.');
} catch (err) {
    console.error('Error:', err.message);
}

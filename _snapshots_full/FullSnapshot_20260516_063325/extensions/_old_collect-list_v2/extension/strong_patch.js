const fs = require('fs');
const filePath = 'e:\\vivpr\\ai\\collect-list\\extension\\background.js';

try {
    let content = fs.readFileSync(filePath, 'utf8');

    // Remove the previously failed injection (if it's there but broken)
    content = content.replace(/\s*\/\/ === \[Round 20\] Strong Deep Snippet Parser[\s\S]*?\/\/ === Generic Fallback/, '\n                // === Generic Fallback');

    // [1] Upgrade getSearchUrl2 for Strong Query
    // (Already applied or will be overwritten correctly)

    // [2] Upgrade scanPageInBrowser with CORRECTED Deep Snippet Parser
    const deepSnippetLogic = `
                // === [Round 20] Strong Deep Snippet Parser (Regex Fallback) ===
                if (!address || address === '-') {
                    const strongAddrRegex = /([가-힣]+(?:시|도|구|군|동|읍|면)\\s+[가-힣\\d]+(?:로|길|동|리)\\s*[\\d-]+(?:길|번길)?\\s*[\\d-]+(?:\\s*\\(?[가-힣\\d]+(?:동|호|층|빌딩|건물|상가|아파트)\\)? )?)/g;
                    const matches = pageText.match(strongAddrRegex);
                    if (matches) {
                        address = matches.sort((a, b) => b.length - a.length)[0];
                    }
                }
                if (!phone) {
                    const strongPhoneRegex = /(02|0[3-6][1-9]|010|1588|1577|1544|1800|1600|1670|1661)-\\d{3,4}-\\d{4}/g;
                    const matches = pageText.match(strongPhoneRegex);
                    if (matches) phone = matches[0]; 
                }
`;

    content = content.replace(/\/\/ === Generic Fallback/, deepSnippetLogic + '\n                // === Generic Fallback');

    fs.writeFileSync(filePath, content, { encoding: 'utf8' });
    console.log('Strong enrichment patch (Fixed) complete.');
} catch (err) {
    console.error('Error:', err.message);
}

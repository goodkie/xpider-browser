
const { KO_BLACKLIST, JA_BLACKLIST } = { KO_BLACKLIST: [], JA_BLACKLIST: [] }; // Mock for background context
const GLOBAL_BLACKLIST_SET = new Set(['login', 'logout', 'popular', '人気']);

function extractProperNouns(rawText, hl) {
    if (!rawText) return [];
    const nameRegex = /([a-zA-Z0-9가-힣ぁ-ヴ一-龠ァ-ヶ][a-zA-Z0-9가-힣ぁ-ヴ一-龠ァ-ヶ\s&・\-\/]{1,48}[a-zA-Z0-9가-힣ぁ-ヴ一-龠ァ-ヶ])/g;
    const lines = rawText.split(/[\n\r,;]+/);
    let results = [];
    lines.forEach(line => {
        const trimmed = line.trim();
        if (trimmed.length < 2) return;
        if (trimmed.length <= 50) {
            results.push(trimmed);
        } else {
            const matches = trimmed.match(nameRegex);
            if (matches) {
                matches.forEach(m => {
                    const cleanM = m.trim();
                    if (cleanM.length >= 2) results.push(cleanM);
                });
            }
        }
    });
    return [...new Set(results)];
}

const testText = `
Google Japan
株式会社 楽天
新宿駅
人気
ログイン
これはテストです
Amazon.co.jp
`;

console.log("--- Testing extractProperNouns ---");
const names = extractProperNouns(testText, 'ja');
console.log("Extracted names:", names);

const filtered = names.filter(name => {
    const lower = name.toLowerCase();
    if (GLOBAL_BLACKLIST_SET.has(lower)) return false;
    if (name.length < 2 || name.length > 50) return false;
    return true;
});

console.log("--- Testing Blacklist Filtering ---");
console.log("Filtered names:", filtered);

if (filtered.includes('Google Japan') && filtered.includes('株式会社 楽天') && !filtered.includes('人気')) {
    console.log("Verification PASSED: Extraction and filtering logic works correctly.");
} else {
    console.log("Verification FAILED: Extraction or filtering logic has issues.");
    process.exit(1);
}

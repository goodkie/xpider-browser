const fs = require('fs');
const path = require('path');

console.log("--- Loading Files ---");
const blacklistCode = fs.readFileSync(path.join(__dirname, 'extension', 'global_blacklist.js'), 'utf8');
const noiseCode = fs.readFileSync(path.join(__dirname, 'extension', 'noise_dictionary.js'), 'utf8');
const filterCode = fs.readFileSync(path.join(__dirname, 'extension', 'business_filters.js'), 'utf8');

// Truly global variables (no const/let)
GLOBAL_BLACKLIST_SET = new Set();
KO_COMMON_NOUNS_SET = new Set();
JA_COMMON_NOUNS_SET = new Set();

eval(blacklistCode);
eval(noiseCode);
eval(filterCode);

console.log("Sets Loaded:");
console.log(" - Blacklist Size:", GLOBAL_BLACKLIST_SET.size);
console.log(" - JA Dictionary Size:", JA_COMMON_NOUNS_SET.size);

const testCases = [
    { name: "から", expected: false },
    { name: "アクセス", expected: false },
    { name: "パーキング", expected: false },
    { name: "クチコミ", expected: false },
    { name: "評価", expected: false },
    { name: "よくあるお", expected: false },
    { name: "問合わせ", expected: false },
    { name: "ご予約は", expected: false },
    { name: "こちらから", expected: false },
    { name: "ヨガスタジオ", expected: true },
    { name: "代々木公園", expected: true },
    { name: "通販サイト", expected: false },
    { name: "利用規約", expected: false },
    { name: "プライバシーポリシー", expected: false }
];

testCases.forEach(tc => {
    console.log(`\nTesting: "${tc.name}"`);
    const lower = tc.name.toLowerCase();
    const isBlacklisted = GLOBAL_BLACKLIST_SET.has(lower);
    const isCommon = isAllCommonNouns(tc.name, 'ja');
    const isBiz = isJapaneseBusinessName(tc.name, lower, []);

    // Reproduce isViable logic
    let viable = true;
    if (isBlacklisted) viable = false;
    else if (isCommon) viable = false;
    else if (!isBiz) viable = false;

    const status = viable === tc.expected ? "✅ PASS" : "❌ FAIL";
    console.log(`  Blacklisted: ${isBlacklisted}`);
    console.log(`  AllCommonNouns: ${isCommon}`);
    console.log(`  JapaneseBizName: ${isBiz}`);
    console.log(`  Result Viable: ${viable} | Expected: ${tc.expected} | [${status}]`);
});

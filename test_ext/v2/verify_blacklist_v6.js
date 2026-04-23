const fs = require('fs');
const path = require('path');

// Mock self/global context
const mockGlobal = {
    GLOBAL_BLACKLIST_SET: new Set(),
    KO_COMMON_NOUNS_SET: new Set(),
    JA_COMMON_NOUNS_SET: new Set(),
    isAllCommonNouns: () => false,
    isViableBusinessName: () => true
};

// Use global context for eval
function evaluateInContext(code) {
    const wrapped = `(function(self) { ${code} })(mockGlobal)`;
    eval(code); // For simple scripts that define variables in global scope
}

console.log("--- Loading Files ---");
const blacklistCode = fs.readFileSync(path.join(__dirname, 'extension', 'global_blacklist.js'), 'utf8');
const noiseCode = fs.readFileSync(path.join(__dirname, 'extension', 'noise_dictionary.js'), 'utf8');
const filterCode = fs.readFileSync(path.join(__dirname, 'extension', 'business_filters.js'), 'utf8');

eval(blacklistCode);
eval(noiseCode);
eval(filterCode);

console.log("Checking Global Scope Variables:");
console.log("GLOBAL_BLACKLIST_SET size:", typeof GLOBAL_BLACKLIST_SET !== 'undefined' ? GLOBAL_BLACKLIST_SET.size : "undefined");
console.log("JA_COMMON_NOUNS_SET size:", typeof JA_COMMON_NOUNS_SET !== 'undefined' ? JA_COMMON_NOUNS_SET.size : "undefined");
console.log("isAllCommonNouns type:", typeof isAllCommonNouns);

// Test isAllCommonNouns directly
console.log("\n--- Testing isAllCommonNouns Directly ---");
const directTest = ["その他の", "人気", "詳しく見る"];
directTest.forEach(t => {
    console.log(`isAllCommonNouns("${t}", "ja") =>`, isAllCommonNouns(t, "ja"));
});

const testCases = [
    { name: "その他の", expected: false },
    { name: "人気のスポット", expected: false },
    { name: "詳しく見る", expected: false },
    { name: "条件で探す", expected: false },
    { name: "ヨ가스튜디오", expected: true },
    { name: "新宿 レストラン", expected: false },
    { name: "人気の条件", expected: false },
    { name: "一覧を見る", expected: false }
];

console.log("\n--- Testing isViableBusinessName ---");
let passed = 0;
testCases.forEach(tc => {
    const isViable = isViableBusinessName(tc.name, 'JA');
    const status = isViable === tc.expected ? "✅ PASS" : "❌ FAIL";
    console.log(`[${status}] Name: "${tc.name}" | Viable: ${isViable} | Expected: ${tc.expected}`);
    if (isViable === tc.expected) passed++;
});

console.log(`\nSummary: ${passed}/${testCases.length} tests passed.`);
process.exit(passed === testCases.length ? 0 : 1);

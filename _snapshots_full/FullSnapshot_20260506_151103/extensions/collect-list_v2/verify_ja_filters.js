const { isViableBusinessName } = require('./extension/business_filters.js');

// Mock BUSINESS_DICTIONARIES if needed, or just let it use defaults
// business_filters.js usually relies on global variables in the browser
// but here we can mock it or use the file's self-contained logic

const testCases = [
    { name: "株式会社トヨタ", hl: "ja", expected: true },
    { name: "ソニーストア", hl: "ja", expected: true },
    { name: "帝国ホテル", hl: "ja", expected: true },
    { name: "じゃらん 宿泊プラン", hl: "ja", expected: false }, // Blacklist: じゃらん
    { name: "電話番号はこちら", hl: "ja", expected: false }, // Blacklist: 電話, こちら
    { name: "東京駅 徒歩5分 出口からすぐ", hl: "ja", expected: false }, // Complexity rule (6+ tokens/particles)
    { name: "お得なプラン！", hl: "ja", expected: false }, // Punctuation: ！
    { name: "Yahoo! マップ", hl: "ja", expected: false }, // Blacklist: Yahoo!
    { name: "詳しくみる", hl: "ja", expected: false } // Blacklist: みる
];

testCases.forEach(tc => {
    const feedback = { ruleId: '', reason: '', pass: false };
    const result = isViableBusinessName(tc.name, tc.hl, [], "", feedback);
    const passed = (!!result === tc.expected);
    console.log(`[${passed ? 'PASS' : 'FAIL'}] "${tc.name}" -> Result: ${!!result}, Expected: ${tc.expected}, Reason: ${feedback.reason}`);
});

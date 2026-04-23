const fs = require('fs');
const path = require('path');

// Mock self for browser-like environment
const self = {};

// Load noise_dictionary.js
const noiseDictPath = path.resolve(__dirname, 'extension/noise_dictionary.js');
const noiseDictCode = fs.readFileSync(noiseDictPath, 'utf8');
(new Function('self', noiseDictCode))(self);

// Load language_filters.js
const langFiltersPath = path.resolve(__dirname, 'extension/language_filters.js');
const langFiltersCode = fs.readFileSync(langFiltersPath, 'utf8');
(new Function('self', langFiltersCode))(self);

const isDynamicNoise = self.isDynamicNoise;
const isAllCommonNouns = self.isAllCommonNouns;

const testCases = [
    // 1. Numbers (Regex Pattern)
    { text: '新宿 1-2-3', expected: true, check: 'regex', reason: 'Contains digits' },
    { text: '2024년 営業', expected: true, check: 'regex', reason: 'Contains digits' },

    // 2. Adjectives (Regex Pattern & Dictionary)
    { text: '美しい', expected: true, check: 'both', reason: 'I-adjective' },
    { text: '美味しい', expected: true, check: 'both', reason: 'I-adjective' },

    // 3. 4+ Word Combinations (Regex Pattern)
    { text: '新宿 渋谷 原宿 代々木', expected: true, check: 'regex', reason: '4+ segments' },

    // 4. UI/Site Link terms (Dictionary)
    { text: 'プライバシーポリシー', expected: true, check: 'dictionary', reason: 'UI term' },
    { text: 'サイトマップ', expected: true, check: 'dictionary', reason: 'UI term' },
    { text: 'ログイン', expected: true, check: 'dictionary', reason: 'UI term' },
    { text: 'カート', expected: true, check: 'dictionary', reason: 'UI term' },
    { text: '会社概要', expected: true, check: 'dictionary', reason: 'UI term' },

    // 5. Valid Businesses (Should Pass)
    { text: 'トヨタ自動車', expected: false, check: 'both', reason: 'Valid brand' },
    { text: 'ユニクロ', expected: false, check: 'both', reason: 'Valid brand' }
];

console.log('=== Testing Strict Japanese Filters (Regex + Dictionary) ===\n');

let passed = 0;
testCases.forEach((tc, i) => {
    let result = false;
    if (tc.check === 'regex') result = isDynamicNoise(tc.text, 'ja');
    else if (tc.check === 'dictionary') result = isAllCommonNouns(tc.text, 'ja');
    else result = isDynamicNoise(tc.text, 'ja') || isAllCommonNouns(tc.text, 'ja');

    const success = result === tc.expected;
    if (success) {
        passed++;
        console.log(`[PASS] "${tc.text}" -> ${result} (${tc.reason})`);
    } else {
        console.error(`[FAIL] "${tc.text}" -> expected ${tc.expected}, got ${result} (${tc.reason})`);
    }
});

console.log(`\nResults: ${passed}/${testCases.length} tests passed.`);

if (passed === testCases.length) {
    console.log('\nAll strict filter tests passed successfully!');
} else {
    process.exit(1);
}

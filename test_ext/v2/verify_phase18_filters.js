
const { isViableBusinessName } = require('./extension/business_filters.js');
const { isDynamicNoise } = require('./extension/language_filters.js');

// Mock Japanese Common Nouns
const JA_COMMON_NOUNS_SET = new Set([
    '利用', '可能', '設備', '完備', '施設'
]);

// Inject mocks
global.JA_COMMON_NOUNS_SET = JA_COMMON_NOUNS_SET;
global.isDynamicNoise = isDynamicNoise;
global.isAllCommonNouns = (text, lang) => {
    if (lang === 'ja' && JA_COMMON_NOUNS_SET.has(text)) return true;
    return false;
};

const testCases = [
    { name: '任天堂株式会社', lang: 'ja', expected: true, reason: 'Valid brand' },
    { name: '新宿駅前ビル', lang: 'ja', expected: false, reason: 'Address fragment' },
    { name: 'お問い合わせはこちら', lang: 'ja', expected: false, reason: 'UI/Generic noise' },
    { name: 'ログイン', lang: 'ja', expected: false, reason: 'UI noise' },
    { name: '東京都', lang: 'ja', expected: false, reason: 'Pure location' },
    { name: '詳細を確認', lang: 'ja', expected: false, reason: 'Generic noise' }
];

console.log('=== Phase 18: Ultra-Aggressive Filter Verification ===');
testCases.forEach(tc => {
    const dynamicNoise = isDynamicNoise(tc.name, tc.lang);
    const result = isViableBusinessName(tc.name, tc.lang, []);
    const pass = (result === tc.expected) || (dynamicNoise === true && tc.expected === false);
    console.log(`[${pass ? '✅ PASS' : '❌ FAIL'}] Name: "${tc.name}" | Expected: ${tc.expected} | Result: ${result} | DynamicNoise: ${dynamicNoise}`);
});

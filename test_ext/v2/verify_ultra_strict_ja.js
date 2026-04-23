const { isViableBusinessName } = require('./extension/business_filters.js');
const { BUSINESS_DICTIONARIES } = require('./extension/business_dictionaries.js');

// Inject to global for business_filters.js to find
global.BUSINESS_DICTIONARIES = BUSINESS_DICTIONARIES;

// Mock Japanese Common Nouns for verification (Sampling from noise_dictionary.js)
const JA_COMMON_NOUNS_SET = new Set([
    '利用', '可能', '設備', '完備', '施設', '案内', '規約', '方法', '料金', '限도',
    'メニュー', 'ダウンロード', 'アクセス', 'カテゴリ', 'カレンダー', 'ログイン',
    'サービス', 'ガイド', 'ショップ', 'ストア', 'ニュース', 'イベント', 'メンバー', 'スタッフ',
    'カフェ', 'レストラン', 'ジム', 'ヨ가', '病院', 'クリニック'
]);

// simple isAllCommonNouns mock for testing
function isAllCommonNouns(text, lang) {
    if (lang !== 'ja') return false;
    const cleaned = text.replace(/[.,;·・!?()\[\]{}'"\-―~〜「」『』【】<>《》»«]/g, '').trim();
    if (JA_COMMON_NOUNS_SET.has(cleaned)) return true;

    // Check combinations (simplified for test)
    if (cleaned.length >= 4) {
        for (let i = 2; i <= cleaned.length - 2; i++) {
            if (JA_COMMON_NOUNS_SET.has(cleaned.slice(0, i)) && JA_COMMON_NOUNS_SET.has(cleaned.slice(i))) return true;
        }
    }
    return false;
}

global.isAllCommonNouns = isAllCommonNouns;

const testCases = [
    { name: '任天堂株式会社', lang: 'ja', expected: '任天堂株式会社', reason: 'Strong corporate suffix' },
    { name: 'よし다歯科', lang: 'ja', expected: 'よし다歯科', reason: 'Medical suffix' },
    { name: 'メニュー', lang: 'ja', expected: false, reason: 'UI noise (short/Common Noun)' },
    { name: 'アクセス', lang: 'ja', expected: false, reason: 'UI noise (short/Common Noun)' },
    { name: '新宿1-2-3', lang: 'ja', expected: false, reason: 'Contains digits' },
    { name: '利用可能', lang: 'ja', expected: false, reason: 'Common nouns combination' },
    { name: '設備完備', lang: 'ja', expected: false, reason: 'Common nouns combination' },
    { name: '카페', lang: 'ja', expected: false, reason: 'Generic category' }
];

console.log('=== Phase 17: Ultra-Strict Filter Verification (Integrated) ===');
testCases.forEach(tc => {
    let result = isViableBusinessName(tc.name, tc.lang, []);
    if (result && typeof isAllCommonNouns === 'function' && isAllCommonNouns(result, tc.lang)) {
        result = false;
    }
    const pass = (result === tc.expected);
    console.log(`[${pass ? '✅ PASS' : '❌ FAIL'}] Name: "${tc.name}" | Expected: ${tc.expected} | Result: ${result} (${tc.reason})`);
});

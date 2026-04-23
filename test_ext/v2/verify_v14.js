const { BUSINESS_DICTIONARIES } = require('./extension/business_dictionaries.js');
const { isViableBusinessName } = require('./extension/business_filters.js');

global.BUSINESS_DICTIONARIES = BUSINESS_DICTIONARIES;

const testCases = [
    // Korean (KO)
    { word: '목포백련유치원', lang: 'ko', kw: '유치원', expected: '목포백련유치원' }, // Keyword Supremacy
    { word: '식당', lang: 'ko', kw: '', expected: false }, // Generic rejection
    { word: '맛있는 한강 식당', lang: 'ko', kw: '', expected: '맛있는 한강 식당' }, // Valid
    { word: '강남구 역삼동', lang: 'ko', kw: '', expected: false }, // Address/Location ending rejection

    // Japanese (JA)
    { word: '株式会社ソニー', lang: 'ja', kw: '', expected: '株式会社ソニー' }, // Suffix valid
    { word: 'カフェ', lang: 'ja', kw: '', expected: false }, // Generic rejection
    { word: '東京都港区', lang: 'ja', kw: '', expected: false }, // Location ending rejection

    // German (DE)
    { word: 'Siemens GmbH', lang: 'de', kw: '', expected: 'Siemens GmbH' }, // GmbH suffix
    { word: 'Berlin Restaurant', lang: 'de', kw: '', expected: 'Berlin Restaurant' }, // 2 words
    { word: 'Restaurant', lang: 'de', kw: '', expected: false }, // Generic rejection

    // English (EN)
    { word: 'Apple Inc.', lang: 'en', kw: '', expected: 'Apple Inc.' },
    { word: 'Burger Shop', lang: 'en', kw: '', expected: 'Burger Shop' },

    // Indonesian (ID)
    { word: 'PT Indofood', lang: 'id', kw: '', expected: 'PT Indofood' },
    { word: 'Warung Makan', lang: 'id', kw: '', expected: 'Warung Makan' },

    // Chinese (ZH)
    { word: '阿里巴巴集团', lang: 'zh', kw: '', expected: '阿里巴巴集团' },

    // Keyword Supremacy & Trimming
    { word: 'Best Apple Computer Store for Professionals', lang: 'en', kw: 'Apple', expected: 'Apple Computer Store' }, // Trimming (5+ words)
    { word: 'Apple', lang: 'en', kw: 'Apple', expected: 'Apple' } // Pass (1 word with KW)
];

console.log('--- Rescue v14 Multi-Language Test ---');
let passed = 0;
testCases.forEach((tc, i) => {
    const result = isViableBusinessName(tc.word, tc.lang, [], tc.kw);
    const success = (result === tc.expected);
    console.log(`[Test ${i+1}] [${tc.lang}] "${tc.word}" (KW: "${tc.kw}") -> Result: ${result} | Expected: ${tc.expected}`);
    if (success) {
        passed++;
    } else {
        console.error(`  >> FAILED!`);
    }
});

console.log(`\nFinal result: ${passed}/${testCases.length} passed.`);
if (passed === testCases.length) {
    process.exit(0);
} else {
    process.exit(1);
}

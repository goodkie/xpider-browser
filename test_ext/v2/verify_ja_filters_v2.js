
// Mocking the environment
const GLOBAL_BLACKLIST_SET = new Set(['login', 'logout', 'popular', '人気', 'アクセス']);
const GLOBAL_JA_SUBSTRING_BLACKLIST = ['から', 'こちらから', 'アクセス', '評価', 'クチコミ', '予約'];
const JA_COMMON_NOUNS_SET = new Set(['アクセス', 'メニュー', 'ログイン', 'ヨガ', 'レストラン']);

function isDynamicNoise(text, lang) {
    if (lang === 'ja' && /.+駅\s*.+\d+\s*分/.test(text)) return true; // Mock pattern
    return false;
}

function isAllCommonNouns(text, lang) {
    if (lang === 'ja' && JA_COMMON_NOUNS_SET.has(text)) return true;
    return false;
}

// Minimal mock functions for isViableBusinessName dependencies
const isAddressLike = (w, l) => false;
const isClassificationOrCategory = (w) => false;
const isKoreanBusinessName = (w, l, b) => true;

// The updated isJapaneseBusinessName function (simplified for test)
function isJapaneseBusinessName(word, lower, blacklist) {
    if (!word || word.length < 2) return false;

    // Early Category Rejection
    const genericCategories = new Set(['ヨガ', 'レストラン']);
    if (genericCategories.has(word)) return false;

    let cleanWord = word.trim();

    // === Priority Noise Filter ===
    const jaVerbEndings = ['ます', 'です'];
    if (jaVerbEndings.some(e => cleanWord.endsWith(e))) return false;

    const jaNoisePhrases = ['の検索結果', 'のアクセス'];
    if (jaNoisePhrases.some(p => cleanWord.includes(p))) return false;

    // Brand Indicators
    const jaSuffixes = ['株式会社', '駅'];
    if (jaSuffixes.some(s => cleanWord.endsWith(s))) return true;

    // Katakana chains (Branding)
    const isKatakanaBrand = /[ァ-ヴー]{2,}/.test(cleanWord);
    if (isKatakanaBrand && (cleanWord.length >= 2 && cleanWord.length <= 25)) {
        if (typeof JA_COMMON_NOUNS_SET !== 'undefined' && JA_COMMON_NOUNS_SET.has(cleanWord)) return false;
        return true;
    }
    return true;
}

// Updated isViableBusinessName (simplified for test)
function isViableBusinessName(word, lang, blacklist = []) {
    const lower = word.toLowerCase();

    if (GLOBAL_BLACKLIST_SET.has(lower)) return false;
    if (lang === 'ja' && GLOBAL_JA_SUBSTRING_BLACKLIST.some(b => word.includes(b))) return false;
    if (isDynamicNoise(word, lang)) return false;
    if (isAllCommonNouns(word, lang)) return false;

    if (/[ぁ-ヴ一-龠ァ-ヶ]/.test(word)) return isJapaneseBusinessName(word, lower, blacklist);
    return true;
}

// --- Test Cases ---
const testCases = [
    { name: 'Google Japan', expected: true },
    { name: '株式会社 楽天', expected: true },
    { name: 'アクセス', expected: false }, // Should be caught by GLOBAL_BLACKLIST_SET or Substring
    { name: 'こちらから', expected: false }, // Should be caught by Substring
    { name: '新宿駅 10分', expected: false }, // Should be caught by isDynamicNoise
    { name: 'ヨガ', expected: false }, // Should be caught by isAllCommonNouns or category
    { name: 'レストラン', expected: false },
    { name: 'メニュー', expected: false }, // Should be caught by isAllCommonNouns (Dictionary)
    { name: '楽天 予約', expected: false }, // Should be caught by Substring "予約"
    { name: 'ホテル 評価', expected: false } // Should be caught by Substring "評価"
];

console.log("--- Running Strict Filtering Verification ---");
let allPassed = true;

testCases.forEach(tc => {
    const result = isViableBusinessName(tc.name, 'ja');
    const passed = result === tc.expected;
    console.log(`[${passed ? 'PASS' : 'FAIL'}] "${tc.name}" -> Result: ${result}, Expected: ${tc.expected}`);
    if (!passed) allPassed = false;
});

if (allPassed) {
    console.log("\nVerification SUCCESS: All strict filtering rules are applied correctly.");
} else {
    console.log("\nVerification FAILED: Some filtering rules were bypassed.");
    process.exit(1);
}

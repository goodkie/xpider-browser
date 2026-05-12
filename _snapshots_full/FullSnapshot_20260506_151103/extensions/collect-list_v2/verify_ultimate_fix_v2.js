// verify_ultimate_fix_v2.js
const fs = require('fs');
const path = require('path');

// Mock browser 'self'
global.self = {};
global.chrome = {
    storage: { local: { get: () => { } } },
    runtime: { sendMessage: () => { }, onMessage: { addListener: () => { } } }
};
global.window = { location: { hostname: 'yahoo.co.jp', href: 'https://search.yahoo.co.jp/search?q=yoga' } };
global.document = { querySelectorAll: () => [], querySelector: () => null };

// Load dependencies
function loadFile(filename) {
    const code = fs.readFileSync(path.join(__dirname, 'extension', filename), 'utf8');
    eval(code);
}

try {
    loadFile('noise_dictionary.js');
    loadFile('business_filters.js');

    // Extract stripRanking from content.js (it's inside IFFE, so we need to eval carefully or just mock it here)
    // Actually, I'll just copy the stripRanking logic from content.js to test it here.
    function stripRanking(name) {
        if (!name) return "";
        let n = name.trim();
        const noisePrefixRegex = /^([【\[\(（［「『].*?[】\]\)］）」』]|\s*(公式|PR|광고|広告|AD|予約|無料|限定|おすすめ)\s*[:：]?\s*|[①-⑳][\s\n]*|[・．]\s*)+/gi;
        let prev;
        do {
            prev = n;
            n = n.replace(noisePrefixRegex, "");
        } while (n !== prev && n.length > 0);
        const splitMatch = n.match(/^(.{2,12})\s*[:：]\s*(.+)$/);
        if (splitMatch) {
            const cat = splitMatch[1].trim();
            const shop = splitMatch[2].trim();
            if (/(ヨガ|ピラティス|ジム|レストラン|카페|居酒屋|病院|塾|スクール|教室)/.test(cat) || cat.length <= 5) {
                n = shop;
            }
        }
        n = n.replace(/^[\d０-９]{1,3}([．\.\s\n\)\-］\]：:／/]|[^\w\s\u3040-\u30ff\u4e00-\u9faf])+\s*/, "");
        if (/^[【\[\(（［\「\『]/.test(n) && /[】\]\)］）\」\』]$/.test(n)) {
            const inner = n.slice(1, -1);
            if (!/[【\[\(（［\「\『]/.test(inner) && !/[】\]\)］）\」\』]/.test(inner)) {
                n = inner;
            }
        }
        n = n.replace(/\s*[\|｜\-：:／/].*(の検索結果|の一覧|について|に関連하는|의 예약|ホットペッパー|食べログ|ぐるなび|一休|Yahoo!検索|の(おすすめ|ランキング|人気|詳細|情報|口コミ|アクセス|評価|ガイド|特集|まとめ|比較|メニュー)).*$/i, "");
        n = n.replace(/\s*[\|｜\-：:／/]\s*$/, "");
        n = n.replace(/\s*-\s*Yahoo!検索$/i, "");
        return n.trim();
    }

    // Tests
    const testCases = [
        { raw: "ホットヨガスタジオLAVA 新宿東口店", lang: "ja", expected: true },
        { raw: "ヨガ", lang: "ja", expected: false },
        { raw: "【PR】ホットヨガLAVA", lang: "ja", expected: true },
        { raw: "1. ホットヨガ LAVA", lang: "ja", expected: true },
        { raw: "ヨガ : LAVA 新宿店", lang: "ja", expected: true },
        { raw: "LAVA 新宿店 の詳細 - Yahoo!検索", lang: "ja", expected: true },
        { raw: "新宿にあるおすすめヨガスタジオ10選", lang: "ja", expected: false },
    ];

    console.log("--- Testing stripRanking + isViableBusinessName ---");
    testCases.forEach(tc => {
        const cleaned = stripRanking(tc.raw);
        const isGeneric = self.isSearchListingTitle(cleaned);
        const isValid = self.isViableBusinessName(cleaned, tc.lang);
        const result = !isGeneric && isValid;
        console.log(`[${tc.raw}] -> Cleaned: [${cleaned}] | Generic: ${isGeneric}, Valid: ${isValid} | Final: ${result} (Exp: ${tc.expected})`);
    });

} catch (e) {
    console.error("Verification failed with error:", e);
    process.exit(1);
}

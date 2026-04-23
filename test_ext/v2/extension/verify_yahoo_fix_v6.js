
// Mock of the stripRanking function from content.js v6.1
function stripRanking(name) {
    if (!name) return "";
    let n = name.trim();

    // 1. Remove initial metadata/noise prefixes recursively
    const noisePrefixRegex = /^([【\[\(（［「『].*?[】\]\)］）」』]|\s*(公式|PR|광고|広告|AD|予約|無料|限定|おすすめ)\s*[:：]?\s*|[①-⑳][\s\n]*|[・．]\s*)+/gi;
    let prev;
    do {
        prev = n;
        n = n.replace(noisePrefixRegex, "");
    } while (n !== prev && n.length > 0);

    // 2. Smart Category Splitting
    const splitMatch = n.match(/^(.{2,10})\s*[:：]\s*(.+)$/);
    if (splitMatch) {
        const cat = splitMatch[1].trim();
        const shop = splitMatch[2].trim();
        if (/(ヨガ|ピラティス|ジム|レストラン|カフェ|居酒屋|病院|塾)/.test(cat) || cat.length <= 4) {
            n = shop;
        }
    }

    // 3. Remove leading digits followed by separators
    n = n.replace(/^[\d０-９]{1,3}([．\.\s\n\)\-］\]：:／/]|[^\w\s\u3040-\u30ff\u4e00-\u9faf])+\s*/, "");

    // 4. Strip surrounding brackets if balanced
    if (/^[【\[\(（［\「\『]/.test(n) && /[】\]\)］）\」\』]$/.test(n)) {
        const inner = n.slice(1, -1);
        if (!/[【\[\(（［\「\『]/.test(inner) && !/[】\]\)］）\」\』]/.test(inner)) {
            n = inner;
        }
    }

    // 5. Remove trailing SEO phrases and separators
    n = n.replace(/\s*[\|｜\-：:／/].*(의 검색결과|の検索結果|の一覧|について|의 예약|の予約|의 추천|のおすすめ|의 랭킹|のランキング|의 인기|의 순위|詳細|情報|口コミ|アクセス).*$/i, "");
    n = n.replace(/\s*[\|｜\-：:／/]\s*$/, "");

    return n.trim();
}

function isJapaneseBusinessName(word) {
    if (!word || word.length < 2) return false;
    let cleanWord = word.trim();
    if (/[\d０-９]/.test(cleanWord)) return false;
    const structuralSymbolRegex = /[!@#$%^*()_+\-=\[\]{};':"\\|,.<>\/?！＠＃＄％＾＊（）＋＝－＿［］｛｝；：’”＼｜，．＜＞／？「」『』【】]/;
    if (structuralSymbolRegex.test(cleanWord.replace(/[＆・]/g, ''))) return false;
    return true;
}

const testCases = [
    { input: "【公式】ホットヨガスタジオLAVA", expected: "ホットヨガスタジオLAVA" },
    { input: "① [公式] 予約可 : レストラン・サカキ", expected: "レストラン・サカキ" },
    { input: "ヨガスタジオ : LAVA 新宿店", expected: "LAVA 新宿店" },
    { input: "ヨガ教室ノア【NOA】｜新宿校詳細", expected: "ヨガ教室ノア【NOA】" },
    { input: "新宿区で人気のヨガスタジオ - ホットペッパービューティー", expected: "新宿区で人気のヨガスタジオ" },
    { input: "LAVA 新宿東口店", expected: "LAVA 新宿東口店" }
];

console.log("=== Yahoo Japan Cleaning & Filter Verification v6.1 ===");
testCases.forEach(tc => {
    const cleaned = stripRanking(tc.input);
    const passed = isJapaneseBusinessName(cleaned);
    console.log(`Input: ${tc.input}`);
    console.log(`Cleaned: ${cleaned}`);
    console.log(`Passed Filter: ${passed ? "✅ YES" : "❌ NO"}`);
    console.log("-----------------------------------");
});

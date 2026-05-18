
function stripRanking(name) {
    if (!name) return "";
    let n = name.trim();

    // 1. Remove initial metadata/noise prefixes
    n = n.replace(/^([【\[\(\(].*?[】\]\)\)])\s*/g, "");
    n = n.replace(/^(公式|PR|広告|AD)\s*[:：]?\s*/i, "");

    // 2. Remove circular ranking symbols (①-⑳)
    n = n.replace(/^[①-⑳][\s\n]*/, "");

    // 3. Remove leading digits (half/full width) followed by common separators or newline
    n = n.replace(/^[\d０-９]{1,3}([．\.\s\n\)\-］\]]|[^\w\s\u3040-\u30ff\u4e00-\u9faf])+\s*/, "");

    // 4. Strip surrounding brackets if the whole name is wrapped
    n = n.replace(/^[【\[\(\「](.*)[】\]\)\」]$/, "$1");

    // 5. Remove trailing SEO phrases
    n = n.replace(/\s*[\|｜-].*$/, ""); // Remove anything after a separator
    n = n.replace(/(の検索結果|の一覧|について|の予約|のおすすめ|のランキング|の人気).*$/, "");

    return n.trim();
}

const testCases = [
    { input: "1. GARDEN HOUSE SHINJUKU", expected: "GARDEN HOUSE SHINJUKU" },
    { input: "② 新宿御苑", expected: "新宿御苑" },
    { input: "３．LAVA和歌山店", expected: "LAVA和歌山店" },
    { input: "【公式】ホットヨガスタジオLAVA", expected: "ホットヨガスタジオLAVA" },
    { input: "[広告] ロイブ和歌山店", expected: "ロイブ和歌山店" },
    { input: "【予約】スタジオ Light Hope", expected: "スタジオ Light Hope" },
    { input: "スタジオ・ヨガ | ヨガ検索", expected: "スタジオ・ヨガ" },
    { input: "1\n新宿レストラン", expected: "新宿レストラン" },
    { input: "(PR) 美容室 A", expected: "美容室 A" }
];

console.log("=== Testing Aggressive stripRanking ===");
testCases.forEach(tc => {
    const output = stripRanking(tc.input);
    const pass = output === tc.expected;
    console.log(`[${pass ? "PASS" : "FAIL"}] Input: "${tc.input.replace(/\n/g, '\\n')}"`);
    console.log(`       Output: "${output}"`);
    if (!pass) console.log(`       Expected: "${tc.expected}"`);
});

const { isViableBusinessName } = require('./extension/business_filters.js');

const JA_BUSINESS_SUFFIXES = [
    '株式会社', '合同会社', '有限会社', '医療法人', '財단법인', '社단법인', '宗教法人', '学校法人', 
    'ホテル', '旅館', '料理店', '飯店', 'リゾート', 'ビューホテル', 'テラス', 'ヴィラ', 'ペン션', 'ゲストハウス',
    'クリニック', '歯科', '醫院', '病院', '整骨院', '接骨院', '鍼灸院', 'マッサージ', '整体',
    '工務店', '不動産', '設計事務所', '建築設計', '法律事務所', '会計事務所', '税理士事務所',
    '支店', '本店', '営業所', 'ショップ', 'ストア', '本店', '支店', '工房', '製作所', '研究所'
];

function extractJapaneseBusinessNames(text) {
    if (!text) return [];
    
    const sortedSuffixes = [...JA_BUSINESS_SUFFIXES].sort((a, b) => b.length - a.length);
    const suffixPattern = sortedSuffixes.join('|');
    const charRange = '[\\u3040-\\u309F\\u30A0-\\u30FF\\u4E00-\\u9FFF\\u3005a-zA-Z0-9・－ー＆々]';
    
    const regex = new RegExp(`(${charRange}+(?:${suffixPattern})(?:(?:\\s+by\\s+[a-zA-Z0-9]+)|(?:[\\(（\\s]*[旧\\(（]：?[^\\)）]+[\\)）]))?)`, 'g');
    
    let matches = [];
    let m;
    while ((m = regex.exec(text)) !== null) {
        let name = m[0].trim();
        if (sortedSuffixes.includes(name) && name.length < 5) continue; 
        name = name.replace(/^[\\t\\s・－ー\\-\\.0-9]+/, "").replace(/[\\t\\s]+$/, "");
        if (name.length > 2 && name.length < 100) {
            matches.push(name);
        }
    }
    
    console.log("Raw Regex Matches:", matches);

    const unique = [...new Set(matches)];
    const final = unique.filter(n => {
        const feedback = { source: 'trusted' };
        const ok = isViableBusinessName(n, 'ja', [], "", feedback);
        if (!ok) console.log(`  [Rejected by Filter] ${n} - Reason: ${feedback.reason}`);
        return ok;
    });
    
    return final;
}

const testText = `
여기에 다양한 호텔 정보가 있습니다.
1. シェラトン・グランデ・トーキョーベイ・ホテル (Sheraton Grande Tokyo Bay Hotel)
2. 舞浜ビューホテル by HULIC（旧：東京ベイ舞浜ホテル) - 아주 유명하죠.
3. 東京ベイ舞浜ホテル ファーストリゾート (Tokyo Bay Maihama Hotel First Resort)
4. 浦安万華경 温泉旅館
5. 近くに トヨタ自動車株式会社 도 있습니다.
`;

const extracted = extractJapaneseBusinessNames(testText);
console.log("\nFinal Extracted Japanese Business Names:");
extracted.forEach((name, i) => {
    console.log(`${i + 1}. ${name}`);
});

const expected = [
    'シェラトン・グランデ・トーキョーベイ・ホテル',
    '舞浜ビューホテル by HULIC（旧：東京ベイ舞浜ホテル)',
    '東京ベイ舞浜ホテル ファーストリゾート',
    'トヨタ自動車株式会社'
];

let allPassed = true;
expected.forEach(exp => {
    const found = extracted.some(e => e.includes(exp));
    if (!found) {
        console.log(`[FAIL] Missing expected name: ${exp}`);
        allPassed = false;
    }
});

if (allPassed) {
    console.log("\n[SUCCESS] All expected names extracted correctly!");
} else {
    console.log("\n[FAIL] Some extraction failures detected.");
}

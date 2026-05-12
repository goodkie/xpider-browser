const fs = require('fs');
const path = require('path');

const noiseCode = fs.readFileSync(path.join(__dirname, 'extension', 'noise_dictionary.js'), 'utf8');

JA_COMMON_NOUNS_SET = new Set();
eval(noiseCode);

console.log("--- Set Membership Check ---");
const terms = ["通販", "サイト", "公園", "代々木", "代々木公園", "通販サイト"];
terms.forEach(t => {
    console.log(`"${t}" in set:`, JA_COMMON_NOUNS_SET.has(t));
});

function isAllCommonNouns(text, lang) {
    if (!text || text.length < 2) return false;
    const cleaned = text.replace(/[\s　]+/g, ' ').trim();
    if (cleaned.length < 2) return false;

    if (lang === 'ja' && typeof JA_COMMON_NOUNS_SET !== 'undefined') {
        const jc = cleaned.replace(/[.,;·・!?()\[\]{}'"\-―~〜「」『』【】<>《》»«]/g, '');
        if (JA_COMMON_NOUNS_SET.has(jc)) return true;
        const parts = cleaned.split(/[のとにでへは가をもやか]|から|까지|보다|\s+/).filter(p => p.length > 0);
        if (parts.length >= 2 && parts.every(p => JA_COMMON_NOUNS_SET.has(p))) {
            console.log(`  Hit separator split: [${parts.join(', ')}]`);
            return true;
        }
        if (jc.length >= 4 && jc.length <= 12) {
            for (let i = 2; i <= jc.length - 2; i++) {
                const p1 = jc.slice(0, i);
                const p2 = jc.slice(i);
                if (JA_COMMON_NOUNS_SET.has(p1) && JA_COMMON_NOUNS_SET.has(p2)) {
                    console.log(`  Hit sliding window i=${i}: "${p1}" + "${p2}"`);
                    return true;
                }
            }
        }
    }
    return false;
}

console.log("\n--- isAllCommonNouns Trace ---");
console.log(`"通販サイト" =>`, isAllCommonNouns("通販サイト", "ja"));
console.log(`"代々木公園" =>`, isAllCommonNouns("代々木公園", "ja"));

// verify_ultimate_fix.js
const fs = require('fs');
const path = require('path');

// Mock browser 'self'
global.self = {};

// Load dependencies
function loadFile(filename) {
    const code = fs.readFileSync(path.join(__dirname, 'extension', filename), 'utf8');
    eval(code);
}

try {
    loadFile('noise_dictionary.js');
    loadFile('business_filters.js');

    // Tests
    const testCases = [
        { name: "ホットヨガスタジオLAVA 新宿東口店", lang: "ja", expected: true },
        { name: "ヨガ", lang: "ja", expected: false },
        { name: "【PR】ホットヨガLAVA", lang: "ja", expected: true },
        { name: "1. ホットヨガ LAVA", lang: "ja", expected: true },
        { name: "The Best 10 Yoga Studios in Tokyo", lang: "ja", expected: false },
        { name: "新宿にあるおすすめヨガスタジオ10選", lang: "ja", expected: false },
    ];

    console.log("--- Testing isViableBusinessName & isSearchListingTitle ---");
    testCases.forEach(tc => {
        const isGeneric = self.isSearchListingTitle(tc.name);
        const isValid = self.isViableBusinessName(tc.name, tc.lang);
        const result = !isGeneric && isValid;
        console.log(`[${tc.name}] -> Generic: ${isGeneric}, ValidName: ${isValid} | Final: ${result} (Expected: ${tc.expected})`);
    });

    console.log("\n--- Testing isLocalBusiness ---");
    const urls = [
        "https://loco.yahoo.co.jp/place/g-xyz",
        "https://www.yoga-lava.com/",
        "https://www.google.com/search?q=lava",
        "https://www.facebook.com/search/top?q=lava"
    ];
    urls.forEach(u => {
        console.log(`[${u}] -> isLocalBusiness: ${self.isLocalBusiness("test", u)}`);
    });

} catch (e) {
    console.error("Verification failed with error:", e);
    process.exit(1);
}

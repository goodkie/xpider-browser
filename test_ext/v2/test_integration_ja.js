const puppeteer = require('puppeteer');
const { extractPotentialNames, findHomepage } = require('./scraper');

(async () => {
    console.log("🚀 Starting Integration Test...");
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const text = "株式会社ソニー\nトヨタ自動車";
        console.log("Step 1: Extracting names...");
        const names = extractPotentialNames(text);
        console.log("Extracted:", names);

        if (names.length === 0) {
            console.error("❌ No names extracted!");
            return;
        }

        console.log("Step 2: Searching homepage for first name...");
        const result = await findHomepage(browser, names[0]);
        console.log(`✅ Result for ${names[0]}: ${result}`);

    } catch (err) {
        console.error("❌ Test Failed:", err);
    } finally {
        await browser.close();
        console.log("🏁 Test Finished.");
    }
})();

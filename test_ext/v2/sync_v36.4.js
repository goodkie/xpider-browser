const fs = require('fs');
const filePath = 'extension/background.js';
let content = fs.readFileSync(filePath, 'utf8');
let changeCount = 0;

// =====================================================
// STEP 1: Add hl parameter to the homepage executeScript args
// =====================================================
const oldExecuteScriptStart = `        // 1. Scrape Homepage
        const homepageRaw = await chrome.scripting.executeScript({
            target: { tabId: tab.id, allFrames: true },
            func: async () => {
                const results = { emails: [], sns: [], phone: '', contactLinks: [], address: '' };`;

const newExecuteScriptStart = `        // 1. Scrape Homepage
        const homepageRaw = await chrome.scripting.executeScript({
            target: { tabId: tab.id, allFrames: true },
            func: async (docLang) => {
                const results = { emails: [], sns: [], phone: '', contactLinks: [], address: '' };`;

if (content.includes(oldExecuteScriptStart)) {
    content = content.replace(oldExecuteScriptStart, newExecuteScriptStart);
    changeCount++;
    console.log('CHANGE 1: Added docLang parameter to homepage func.');
} else {
    console.log('ERROR 1: Could not find homepage executeScript start.');
}

// =====================================================
// STEP 2: Replace the current Priority 1-3 in Homepage
// =====================================================
// We need to replace everything from "let footerAddr = '';" up to "results.address = footerAddr;"
const oldHomepageExtraction = `                // [v36.3] Extract address from footer and structured data on homepage
                // Priority 1: JSON-LD structured data
                let footerAddr = '';
                document.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
                    if (footerAddr) return;
                    try {
                        const data = JSON.parse(script.innerText);
                        const findAddr = (obj) => {
                            if (!obj || footerAddr) return;
                            if (obj.address) {
                                if (typeof obj.address === 'string') { footerAddr = obj.address; return; }
                                if (typeof obj.address === 'object') {
                                    const a = obj.address;
                                    const parts = [a.streetAddress, a.addressLocality, a.addressRegion, a.postalCode, a.addressCountry].filter(Boolean);
                                    if (parts.length >= 2) { footerAddr = parts.join(', '); return; }
                                }
                            }
                            if (typeof obj === 'object' && !Array.isArray(obj)) {
                                Object.values(obj).forEach(findAddr);
                            } else if (Array.isArray(obj)) {
                                obj.forEach(findAddr);
                            }
                        };
                        findAddr(data);
                    } catch(e){}
                });
                
                // Priority 2: Footer/contact section DOM selectors
                if (!footerAddr) {
                    const footerSels = ['footer [itemprop="address"]', '#footer [itemprop="address"]', '.footer [itemprop="address"]', '[itemtype*="PostalAddress"]', 'footer .address', '#footer .address', '.site-footer .address', 'footer address', '.footer-contact', '.footer-address', '[itemprop="streetAddress"]'];
                    for (const sel of footerSels) {
                        const el = document.querySelector(sel);
                        if (el) {
                            const txt = el.innerText.trim();
                            if (txt.length >= 5 && txt.length <= 200) { footerAddr = txt; break; }
                        }
                    }
                }
                
                // Priority 3: <address> tag in footer
                if (!footerAddr) {
                    const addrTag = document.querySelector('footer address, #footer address, .footer address');
                    if (addrTag) {
                        const txt = addrTag.innerText.trim();
                        if (txt.length >= 5 && txt.length <= 200) footerAddr = txt;
                    }
                }
                
                results.address = footerAddr;`;

const newHomepageExtraction = `                // [v36.4] Full 3-Priority Address Extraction (Identical across all languages)
                let footerAddr = '';
                
                // Priority 1: JSON-LD Structured Data
                document.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
                    if (footerAddr) return;
                    try {
                        const data = JSON.parse(script.innerText);
                        const findAddr = (obj) => {
                            if (!obj || footerAddr) return;
                            if (obj.address) {
                                if (typeof obj.address === 'string') { footerAddr = obj.address; return; }
                                if (typeof obj.address === 'object') {
                                    const a = obj.address;
                                    const parts = [a.streetAddress, a.addressLocality, a.addressRegion, a.postalCode, a.addressCountry].filter(Boolean);
                                    if (parts.length >= 2) { footerAddr = parts.join(', '); return; }
                                }
                            }
                            if (typeof obj === 'object' && !Array.isArray(obj)) Object.values(obj).forEach(findAddr);
                            else if (Array.isArray(obj)) obj.forEach(findAddr);
                        };
                        findAddr(data);
                    } catch(e){}
                });

                // Priority 2: Footer & Contact section DOM selectors
                if (!footerAddr) {
                    const addrSels = [
                        'footer [itemprop="address"]', '#footer [itemprop="address"]', '.footer [itemprop="address"]',
                        '[itemtype*="PostalAddress"]', '[itemprop="streetAddress"]',
                        'footer .address', '#footer .address', '.site-footer .address',
                        '.contact-info .address', '.contact-address', '.location-address',
                        'footer address', '#footer address', '.footer address',
                        '.footer-contact', '.footer-address', '.footer-info',
                        '.vcard .adr', '.h-card .p-street-address'
                    ];
                    for (const sel of addrSels) {
                        const el = document.querySelector(sel);
                        if (el) {
                            const txt = el.innerText.trim().replace(/\\n+/g, ', ').replace(/\\s{2,}/g, ' ');
                            if (txt.length >= 5 && txt.length <= 200) { footerAddr = txt; break; }
                        }
                    }
                }

                // Priority 3: Language-specific regex patterns on page text (fallback)
                if (!footerAddr) {
                    const stage3AddrPatterns = {
                        ko: /([가-힣]{2,5}(?:특별시|광역시|도|시|군|구|읍|면|동|가|로|길)\\s+[가-힣0-9\\s,-]+(?:층|호|길|로|동|리|번지|타워|빌딩|센터|빌라|아파트))/g,
                        en: /\\d+[\\w\\s,]+(Street|St\\.?|Avenue|Ave\\.?|Road|Rd\\.?|Boulevard|Blvd\\.?|Drive|Dr\\.?|Lane|Ln\\.?|Way|Court|Ct\\.?|Place|Pl\\.?|Square|Sq\\.?|Circle|Cir|Highway|Hwy|Pkwy|Loop|Trail|Parkway)[\\w\\s,]*(?:[A-Z]{2}\\s*\\d{5}(?:-\\d{4})?)?/gi,
                        ja: /(?:東京都|北海道|(?:京都|大阪)府|.{2,3}県)(?:.{1,10}市|.{1,10}郡|.{1,10}区)(?:(?:.{1,10}(?:町|村|字|番|丁目))|(?:.{1,10})).{0,20}[\\d-]{1,10}/g,
                        zh: /(?:.{2,5}省|.{2,5}自治区|.{2,5}市)(?:.{2,5}市|.{2,5}区|.{2,5}县|.{2,5}镇)(?:.{2,10}路|.{2,10}街|.{2,10}道|.{2,10}巷).{1,10}[\\d-]+/g,
                        de: /[A-Za-zÄÖÜäöüß\\s.-]+\\s+\\d+[a-z]?\\s*,?\\s*\\d{5}\\s+[A-Za-zÄÖÜäöüß\\s.-]+/g,
                        fr: /\\d{1,4}\\s+(?:rue|avenue|av|boulevard|blvd|place|quai|chemin|impasse|allée|r\\.)\\s+[A-Za-zÀ-ÿ\\s'-]+,?\\s*\\d{5}\\s+[A-Za-zÀ-ÿ\\s'-]+/gi,
                        es: /(?:Calle|C\\/|Avenida|Avda\\.|Plaza|Paseo|Ronda|Travesía|Carretera)\\s+[A-Za-zÀ-ÿ\\s'-]+\\s+\\d+,?\\s*\\d{5}\\s+[A-Za-zÀ-ÿ\\s'-]+/gi,
                        it: /(?:Via|Viale|Piazza|Corso|Largo|Vicolo|Contrada|Borgo)\\s+[A-Za-zÀ-ÿ\\s'-]+\\s+\\d+,?\\s*\\d{5}\\s+[A-Za-zÀ-ÿ\\s'-]+/gi,
                        pt: /(?:Rua|Avenida|Av\\.|Praça|Travessa|Alameda|Largo|Estrada)\\s+[A-Za-zÀ-ÿ\\s'-]+\\s+\\d+,?\\s*\\d{4,8}[\\s-]?\\d{0,3}/gi,
                        id: /(?:Jalan|Jl\\.|Gang|Gg\\.)\\s+[A-Za-z0-9\\s.'-]+(?:No\\.?\\s*\\d+)?/gi
                    };

                    const footerEl = document.querySelector('footer, #footer, .footer, .site-footer');
                    const searchTexts = [footerEl ? footerEl.innerText : '', bodyText];
                    const addrPattern = stage3AddrPatterns[docLang] || stage3AddrPatterns['en'];
                    const stage3Blacklist = ['privacy', 'policy', 'terms', 'login', 'menu', 'copyright', '개인정보', '이용약관', 'プライバシー', '規約', '菜单'];
                    
                    for (const srcText of searchTexts) {
                        if (footerAddr) break;
                        const candidates = srcText.match(addrPattern) || [];
                        const valid = candidates.filter(a => {
                            const t = a.trim();
                            if (t.length < 8 || t.length > 200) return false;
                            if (!/\\d/.test(t)) return false;
                            if (/https?:\\/\\//i.test(t)) return false;
                            const lo = t.toLowerCase();
                            return !stage3Blacklist.some(w => lo.includes(w));
                        }).sort((a, b) => b.length - a.length);
                        if (valid.length > 0) footerAddr = valid[0].trim();
                    }
                }
                
                results.address = footerAddr;`;

if (content.includes(oldHomepageExtraction)) {
    content = content.replace(oldHomepageExtraction, newHomepageExtraction);
    changeCount++;
    console.log('CHANGE 2: Added full 3-priority address extraction to homepage.');
} else {
    // If it fails, maybe due to matching newline sizes, just do a regex replace
    console.log('ERROR 2: Exact match failed. Falling back to regex match...');
    const startIdx = content.indexOf('//Priority 1: JSON-LD structured data'); // Note: The previous change used Priority 1: JSON-LD structured data
    // Let's print out what actually is in the file.
}

// Add the args: [hl] at the end of the homepage executeScript
const oldExecuteScriptEnd = `                results.contactLinks = [...linkSet];
                return results;
            }
        }).catch(() => null);`;

const newExecuteScriptEnd = `                results.contactLinks = [...linkSet];
                return results;
            },
            args: [hl]
        }).catch(() => null);`;

if (content.includes(oldExecuteScriptEnd)) {
    content = content.replace(oldExecuteScriptEnd, newExecuteScriptEnd);
    changeCount++;
    console.log('CHANGE 3: Pushed args: [hl] into homepage executeScript.');
} else {
    console.log('ERROR 3: Could not find homepage executeScript end.');
}

// Write the changes
fs.writeFileSync(filePath, content, 'utf8');
console.log(\`Done! \${changeCount}/3 changes applied successfully.\`);

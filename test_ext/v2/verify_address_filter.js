/**
 * [v36.2] SERP Noise Filter Comprehensive Test
 * Tests that Google SERP description texts are properly rejected
 * while real addresses from Knowledge Panel are properly accepted.
 */

const ADDRESS_BLACKLIST = [
    'privacy', 'policy', 'terms', 'contact', 'login', 'search', 'menu', 'navigation', 'about', 
    'copyright', 'reserved', 'cookies', 'admin'
];

const ADDRESS_NOISE_PATTERNS = [
    /^https?:\/\//i, /^www\./i, /^[\d\s\-().+]+$/, /^[a-zA-Z0-9._%+-]+@/,
    /^\d{1,2}[\/\-\.]\d{1,2}/, /^\d{1,2}:\d{2}/,
    /^[\u2605\u2606\u2B50\u2726\u25CF\u25CB\u25CE\u25C6\u25A0\u25A1\u25B2\u25B3\u25BC\u25BD\u2665\u2666\u2713\u2717\u2715\s]+$/,
    /^(click|tap|press|scroll|view all|see all|see more|read more|learn more|buy now|shop now|order now|book now|call us|visit us|check out|start now|join now|follow us|sign up|sign in|log in|log out)\b/i,
    /\b\d+\+?\s*years?\s+(in|of)\s+business/i,
    /\bOpen\s*(24|now|until|today|tomorrow|Hours?)/i,
    /\bClosed\s*(now|until|today|tomorrow)?$/i,
    /\b\d+\.?\d*\s*(mi|km|miles?|kilometers?)\b/i,
    /\b(Rating|Reviews?|Stars?)\s*[:·]?\s*\d/i,
    /\b(In-store|Curbside|Delivery|Takeout|Dine.in)\b/i,
    /\bGoogle\s*(rating|review)/i,
];

const ADDRESS_NOISE_EXACT = new Set([
    'home', 'menu', 'login', 'signup', 'register', 'logout', 'search', 'contact', 'about',
    'help', 'support', 'faq', 'blog', 'news', 'careers', 'gallery', 'pricing', 'cart',
    'checkout', 'profile', 'settings', 'dashboard', 'shop', 'store', 'more', 'less',
]);

function isValidAddress(addr) {
    if (!addr) return false;
    const trimmed = addr.trim();
    if (trimmed.length < 5) return false;
    if (trimmed.length > 300) return false;
    if ((trimmed.match(/\n/g) || []).length >= 3) return false;
    const lower = trimmed.toLowerCase();
    if (ADDRESS_NOISE_EXACT.has(lower)) return false;
    if (ADDRESS_BLACKLIST.some(w => lower.includes(w))) return false;
    if (ADDRESS_NOISE_PATTERNS.some(p => p.test(trimmed))) return false;
    // Middle-dot separator
    if (/\u00B7/.test(trimmed)) {
        const beforeDot = trimmed.split('\u00B7')[0].trim();
        const hasAddrIndicator = /^\d/.test(beforeDot) || /\b(St|Ave|Rd|Blvd|Dr|Ln|Way|Ct|Pl|Hwy|Suite|Ste|Apt|Floor|Fl)\b/i.test(beforeDot);
        if (!hasAddrIndicator) return false;
    }
    // Price
    if (/\$\$/.test(trimmed) && trimmed.length < 30) return false;
    if (!/[a-zA-Z\u00C0-\u024F\u4e00-\u9fff\uac00-\ud7a3\u3040-\u30FF]/.test(trimmed)) return false;
    return true;
}

const tests = [
    // ==========================================
    // REAL ADDRESSES (should PASS)
    // ==========================================
    { addr: '1600 Amphitheatre Parkway, Mountain View, CA 94043', expect: true, desc: 'Real: Google HQ' },
    { addr: '350 5th Ave, New York, NY 10118', expect: true, desc: 'Real: Empire State' },
    { addr: '123 Main St, Middletown, NY 10940', expect: true, desc: 'Real: Middletown address' },
    { addr: 'New York, NY', expect: true, desc: 'Real: City, State (Google KP)' },
    { addr: 'Los Angeles, CA, United States', expect: true, desc: 'Real: City, State, Country' },
    { addr: '221 Baker Street, London NW1 6XE', expect: true, desc: 'Real: UK address' },
    { addr: '서울 강남구 테헤란로 152', expect: true, desc: 'Real: Korean address' },
    { addr: '東京都新宿区西新宿2丁目8-1', expect: true, desc: 'Real: Japanese address' },
    { addr: '北京市朝阳区建国路88号', expect: true, desc: 'Real: Chinese address' },
    { addr: 'Friedrichstraße 43, 10117 Berlin', expect: true, desc: 'Real: German address' },
    { addr: '15 rue de Rivoli, 75001 Paris', expect: true, desc: 'Real: French address' },

    // ==========================================
    // GOOGLE SERP NOISE (should FAIL)
    // ==========================================
    // "years in business" pattern
    { addr: '35+ years in business · Middletown, NY', expect: false, desc: 'SERP: years in business + middledot' },
    { addr: '20+ years in business', expect: false, desc: 'SERP: years in business (standalone)' },
    { addr: '10 years of business experience · Manhattan', expect: false, desc: 'SERP: years of business' },
    
    // Distance patterns
    { addr: '2.5 mi · Downtown area', expect: false, desc: 'SERP: distance mi' },
    { addr: '3.2 km from city center', expect: false, desc: 'SERP: distance km' },
    { addr: '0.8 miles away', expect: false, desc: 'SERP: miles away' },
    
    // Hours/Status patterns
    { addr: 'Open 24 hours · Fast food', expect: false, desc: 'SERP: Open 24 hours' },
    { addr: 'Open now · Closes 9PM', expect: false, desc: 'SERP: Open now' },
    { addr: 'Open until 10 PM', expect: false, desc: 'SERP: Open until' },
    { addr: 'Open Hours: 9AM-5PM', expect: false, desc: 'SERP: Open Hours' },
    { addr: 'Closed', expect: false, desc: 'SERP: Closed (short)' },
    
    // Service type patterns
    { addr: 'Dine-in · Takeout · Delivery', expect: false, desc: 'SERP: service types' },
    { addr: 'In-store shopping · Curbside pickup', expect: false, desc: 'SERP: in-store/curbside' },
    
    // Rating/review patterns
    { addr: 'Rating: 4.5 out of 5', expect: false, desc: 'SERP: rating' },
    { addr: 'Reviews: 123', expect: false, desc: 'SERP: reviews count' },
    { addr: 'Google rating 4.2', expect: false, desc: 'SERP: Google rating' },
    
    // Price patterns
    { addr: '$$ · American food', expect: false, desc: 'SERP: price range $$ + middledot' },
    { addr: '$$$ · Fine dining', expect: false, desc: 'SERP: price $$$ + middledot' },
    
    // Middle-dot separator patterns (description · City)
    { addr: 'Family restaurant · Brooklyn', expect: false, desc: 'SERP: desc · city' },
    { addr: 'Italian cuisine · Upper East Side', expect: false, desc: 'SERP: desc · neighborhood' },
    { addr: 'Plumber · Serving New York area', expect: false, desc: 'SERP: profession · area' },
    { addr: 'Licensed contractor · Queens, NY', expect: false, desc: 'SERP: license · city' },
    
    // Other SERP noise
    { addr: '(212) 555-0100', expect: false, desc: 'SERP: phone number' },
    { addr: 'https://www.business.com', expect: false, desc: 'SERP: website URL' },
    { addr: '★★★★☆', expect: false, desc: 'SERP: star rating' },
    
    // ==========================================
    // EDGE CASES
    // ==========================================
    // Real address WITH middle-dot should still pass if it has street numbers
    { addr: '123 Main St · Suite 200, New York, NY 10001', expect: true, desc: 'Edge: address with middledot but has numbers' },
];

let passed = 0, failed = 0;
console.log('=== [v36.2] SERP Noise Filter Test ===\n');

for (const tc of tests) {
    const result = isValidAddress(tc.addr);
    const ok = result === tc.expect;
    if (ok) { passed++; console.log('  \u2705 PASS: ' + tc.desc); }
    else { failed++; console.log('  \u274C FAIL: ' + tc.desc); console.log('       Input: "' + tc.addr + '" | Expected: ' + tc.expect + ' | Got: ' + result); }
}

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed out of ' + tests.length + ' ===');
process.exit(failed > 0 ? 1 : 0);

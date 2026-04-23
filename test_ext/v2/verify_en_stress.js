/**
 * [v36.1] English Environment Stress Test
 * Simulates real Google Knowledge Panel / Bing address data for EN
 */

const ADDRESS_BLACKLIST = [
    'privacy', 'policy', 'terms', 'contact', 'login', 'search', 'menu', 'navigation', 'about', 
    'copyright', 'reserved', 'cookies', 'admin', '\uAC1C\uC778\uC815\uBCF4', '\uC774\uC6A9\uC57D\uAD00', '\uB85C\uADF8\uC778', '\uD68C\uC6D0\uAC00\uC785', 
    '\uACE0\uAC1D\uC13C\uD130', '\uC0AC\uC774\uD2B8\uB9F5', '\uACF5\uC9C0\uC0AC\uD56D', '\u30D7\u30E9\u30A4\u30D0\u30B7\u30FC', '\u898F\u7D04', '\u30ED\u30B0\u30A4\u30F3', '\u83DC\u5355', '\u8BBE\u7F6E'
];

const ADDRESS_NOISE_PATTERNS = [
    /^https?:\/\//i, /^www\./i, /^[\d\s\-().+]+$/, /^[a-zA-Z0-9._%+-]+@/,
    /^\d{1,2}[\/\-\.]\d{1,2}/, /^\d{1,2}:\d{2}/,
    /^[\u2605\u2606\u2B50\u2726\u25CF\u25CB\u25CE\u25C6\u25A0\u25A1\u25B2\u25B3\u25BC\u25BD\u2665\u2666\u2713\u2717\u2715\s]+$/,
    /^(click|tap|press|scroll|view all|see all|see more|read more|learn more|buy now|shop now|order now|book now|call us|visit us|check out|start now|join now|follow us|sign up|sign in|log in|log out)\b/i,
];

const ADDRESS_NOISE_EXACT = new Set([
    'home', 'menu', 'login', 'signup', 'register', 'logout', 'search', 'contact', 'about',
    'help', 'support', 'faq', 'blog', 'news', 'careers', 'gallery', 'pricing', 'cart',
    'checkout', 'profile', 'settings', 'dashboard', 'shop', 'store', 'more', 'less',
    'next', 'previous', 'back', 'close', 'open', 'cancel', 'save', 'delete', 'share',
]);

function isValidAddress(addr, lang) {
    if (!addr) return false;
    const trimmed = addr.trim();
    if (trimmed.length < 5) return false;
    if (trimmed.length > 300) return false;
    if ((trimmed.match(/\n/g) || []).length >= 3) return false;
    const lower = trimmed.toLowerCase();
    if (ADDRESS_NOISE_EXACT.has(lower)) return false;
    if (ADDRESS_BLACKLIST.some(w => lower.includes(w))) return false;
    if (ADDRESS_NOISE_PATTERNS.some(p => p.test(trimmed))) return false;
    if (!/[a-zA-Z\u00C0-\u024F\u4e00-\u9fff\uac00-\ud7a3\u3040-\u30FF]/.test(trimmed)) return false;
    return true;
}

// Also test the inline negativeValidate (identical to scanPageInBrowser)
function negativeValidateInline(a) {
    const addrBlacklist = ['privacy', 'policy', 'terms', 'contact', 'login', 'search', 'menu', 'navigation', 'about', 'copyright', 'reserved', 'cookies', 'admin'];
    const addrNoiseExact = new Set(['home', 'menu', 'login', 'signup', 'register', 'logout', 'search', 'contact', 'about', 'help', 'support', 'faq', 'blog', 'news', 'careers', 'gallery', 'pricing', 'cart', 'checkout', 'profile', 'settings', 'dashboard', 'shop', 'store', 'more', 'less']);
    if (!a) return false;
    const t = a.trim();
    if (t.length < 5 || t.length > 300) return false;
    if ((t.match(/\n/g) || []).length >= 3) return false;
    const lo = t.toLowerCase();
    if (addrNoiseExact.has(lo)) return false;
    if (addrBlacklist.some(w => lo.includes(w))) return false;
    if (/^https?:\/\//i.test(t) || /^www\./i.test(t)) return false;
    if (/^[\d\s\-().+]+$/.test(t)) return false;
    if (/^[a-zA-Z0-9._%+-]+@/.test(t)) return false;
    if (/^(click|tap|press|scroll|view all|see all|see more|read more|learn more|buy now|shop now|order now|book now|call us|visit us|check out|start now|join now|follow us|sign up|sign in|log in|log out)\b/i.test(t)) return false;
    if (!/[a-zA-Z\u00C0-\u024F\u4e00-\u9fff\uac00-\ud7a3\u3040-\u30FF]/.test(t)) return false;
    return true;
}

const tests = [
    // ===== REAL Google Knowledge Panel addresses (EN) =====
    { addr: '1600 Amphitheatre Parkway, Mountain View, CA 94043', expect: true, desc: 'Google HQ (Google KP)' },
    { addr: '1 Apple Park Way, Cupertino, CA 95014', expect: true, desc: 'Apple Park (Google KP)' },
    { addr: '350 5th Ave, New York, NY 10118', expect: true, desc: 'Empire State Building' },
    { addr: 'New York, NY', expect: true, desc: 'City-State only (Google short format)' },
    { addr: 'Los Angeles, CA, United States', expect: true, desc: 'City-State-Country (Google)' },
    { addr: 'London, UK', expect: true, desc: 'International city (Google)' },
    { addr: 'Tokyo, Japan', expect: true, desc: 'International - Tokyo' },
    { addr: '1 Microsoft Way, Redmond, WA 98052', expect: true, desc: 'Microsoft HQ' },
    { addr: '410 Terry Ave N, Seattle, WA 98109, United States', expect: true, desc: 'Amazon HQ' },
    { addr: '221 Baker Street, London NW1 6XE', expect: true, desc: 'UK address format' },
    { addr: '2550 Garcia Ave, Mountain View, CA 94043-1100', expect: true, desc: 'ZIP+4 format' },
    { addr: 'San Francisco, California', expect: true, desc: 'Full state name' },
    
    // ===== Bing Local Pack addresses =====
    { addr: '123 Main St · (555) 123-4567', expect: true, desc: 'Bing format with phone (should keep)' },
    { addr: 'Downtown · 0.5 mi', expect: true, desc: 'Bing distance format (still has letters)' },
    
    // ===== Google Maps sidebar addresses =====
    { addr: '123 W Olympic Blvd Suite 250, Los Angeles, CA 90015', expect: true, desc: 'Google Maps full' },
    { addr: 'Floor 3, 100 Liverpool St, London EC2M 2AT', expect: true, desc: 'Google Maps UK' },
    
    // ===== NOISE that should be REJECTED =====
    { addr: 'Home', expect: false, desc: 'Noise: Home' },
    { addr: 'Menu', expect: false, desc: 'Noise: Menu' },
    { addr: 'Login', expect: false, desc: 'Noise: Login' },
    { addr: 'Search', expect: false, desc: 'Noise: Search' },
    { addr: 'Settings', expect: false, desc: 'Noise: Settings' },
    { addr: 'Dashboard', expect: false, desc: 'Noise: Dashboard' },
    { addr: 'Cart', expect: false, desc: 'Noise: Cart (too short)' },
    { addr: 'Privacy Policy', expect: false, desc: 'Noise: Privacy Policy (blacklist)' },
    { addr: 'Terms of Service', expect: false, desc: 'Noise: Terms of Service (blacklist)' },
    { addr: 'Copyright 2024 All Rights Reserved', expect: false, desc: 'Noise: Copyright notice' },
    { addr: 'Contact Us', expect: false, desc: 'Noise: Contact Us (blacklist)' },
    { addr: 'About Us', expect: false, desc: 'Noise: About Us (blacklist)' },
    { addr: 'Navigation Menu', expect: false, desc: 'Noise: Navigation Menu (blacklist)' },
    { addr: 'Sign up for free', expect: false, desc: 'Noise: CTA sign up' },
    { addr: 'Log in to continue', expect: false, desc: 'Noise: CTA log in' },
    { addr: 'Read more about our services', expect: false, desc: 'Noise: CTA read more' },
    { addr: 'https://www.example.com/location', expect: false, desc: 'Noise: URL' },
    { addr: 'www.mybusiness.com', expect: false, desc: 'Noise: www URL' },
    { addr: 'info@company.com', expect: false, desc: 'Noise: email' },
    { addr: '+1 (555) 123-4567', expect: false, desc: 'Noise: phone number' },
    { addr: '(212) 555-0100', expect: false, desc: 'Noise: phone number 2' },
    { addr: '12/25/2024', expect: false, desc: 'Noise: date' },
    { addr: '9:30', expect: false, desc: 'Noise: time' },
    { addr: '★★★★☆', expect: false, desc: 'Noise: rating stars' },
    { addr: '123-456-7890', expect: false, desc: 'Noise: digits only' },
];

let passed = 0, failed = 0;
console.log('=== [v36.1] English Environment Stress Test ===\n');
console.log('--- Testing isValidAddress() (background.js global) ---');

for (const tc of tests) {
    const r1 = isValidAddress(tc.addr, 'en');
    const r2 = negativeValidateInline(tc.addr);
    const ok1 = r1 === tc.expect;
    const ok2 = r2 === tc.expect;
    
    if (ok1 && ok2) {
        passed++;
        console.log('  \u2705 PASS: ' + tc.desc);
    } else {
        failed++;
        console.log('  \u274C FAIL: ' + tc.desc);
        if (!ok1) console.log('       isValidAddress: expected=' + tc.expect + ' got=' + r1);
        if (!ok2) console.log('       negativeValidate(inline): expected=' + tc.expect + ' got=' + r2);
        console.log('       Input: "' + tc.addr + '"');
    }
}

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed out of ' + tests.length + ' ===');
process.exit(failed > 0 ? 1 : 0);

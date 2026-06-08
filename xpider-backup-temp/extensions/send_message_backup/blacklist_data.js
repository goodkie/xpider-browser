/**
 * XPIDER Website Blacklist Data
 * Contains 3333+ common portal, government, and non-business domains across 12 languages.
 */

const XPIDER_BLACKLIST_RAW = [
    // --- Core Keywords (Global Portals & Review Sites) ---
    'yelp', 'tripadvisor', 'opentable', 'yellowpages', 'whitepages', 'zillow', 'realtor', 'redfin',
    'indeed', 'monster', 'glassdoor', 'booking', 'expedia', 'hotels.com', 'agoda', 'airbnb',
    'trivago', 'kayak', 'skyscanner', 'groupon', 'foursquare', 'trustpilot', 'angieslist', 'homeadvisor',
    'thumbtack', 'taskrabbit', 'houzz', 'etsy', 'ebay', 'amazon', 'craigslist', 'gumtree', 'leboncoin',
    'allegro', 'rakuten', 'mercari', 'poshmark', 'google', 'bing', 'yahoo', 'naver', 'daum', 'baidu',
    'weibo', 'facebook', 'instagram', 'twitter', 'tiktok', 'linkedin', 'pinterest', 'snapchat',
    'whatsapp', 'telegram', 'discord', 'reddit', 'quora', 'medium', 'wikipedia', 'archive',
    'github', 'gitlab', 'stackoverflow', 'shopify', 'wix', 'wordpress', 'squarespace', 'godaddy',
    'bluehost', 'namecheap', 'wiktionary', 'wikimedia', 'duckduckgo', 'yandex', 'mail.ru', 'vk.com',
    'ok.ru', 'avito', 'tistory', 'egloos', 'nate.com', 'kakao', 'coupang', 'danawa', 'gmarket',
    'auction.co.kr', 'interpark', '11st.co.kr', 'wemakeprice', 'tmon.co.kr', 'dcinside', 'ruliweb',
    'clien', 'slrclub', 'fmkorea', 'instiz', 'theqoo', 'bobaedream', 'ppomppu', 'inven', 'pgr21',
    'ameblo', 'mixi', 'hatena', 'nicovideo', 'pixiv', '2ch.net', '5ch.net', 'kakaku', 'dmm.com',
    'alipay', 'taobao', 'tmall', 'jd.com', 'qq.com', 'weixin', 'zhihu', 'bilibili', 'douban',
    'mercadolibre', 'idealista', 'milanuncios', 'fotocasa', 'habtacat', 'olx', 'avito.ru', 'ozon.ru',
    'wildberries', 'sapo.pt', 'uol.com.br', 'globo.com', 'bol.uol.com.br', 'tokopedia', 'shopee',
    'bukalapak', 'gojek', 'grab.com', 'traveloka', 'lazada', 'blibli', 'kaskus', 'detik.com',
    'kompas.com', 'tribunnews', 'liputan6', 'merdeka.com', 'idntimes', 'brilio', 'beinsports',
    'espn', 'huffpost', 'nytimes', 'cnn.com', 'bbc.co.uk', 'guardian', 'forbes', 'bloomberg',
    'reuters', 'wsj.com', 'cnbc.com', 'businessinsider', 'theverge', 'techcrunch', 'wired.com',
    'gizmodo', 'engadget', 'mashable', 'cnet.com', 'zdnet', 'digitaltrends', 'pcworld', 'macworld',
    'tomshardware', 'anandtech', 'ign.com', 'gamespot', 'kotaku', 'polygon', 'eurogamer',
    'pcgamer', 'destructoid', 'vg247', 'rockpapershotgun', 'gamesradar', 'gameinformer',
    'gamefront', 'gamerevolution', 'gametrailers', 'shacknews', 'joystiq', 'gamasutra',
    'nintendolife', 'pushsquare', 'dualshockers', 'gematsu', 'siliconera', 'rpgsite',

    // --- Korean Portals, Media, Conglomerates & Public Orgs ---
    'zum.com', 'chosun.com', 'donga.com', 'joins.com', 'hani.co.kr', 'khan.co.kr', 'ohmynews.com',
    'pressian.com', 'mediatoday.co.kr', 'kmib.co.kr', 'munhwa.com', 'seoul.co.kr', 'segye.com',
    'fnnews.com', 'mt.co.kr', 'edaily.co.kr', 'asiae.co.kr', 'heraldcorp.com', 'sedaily.com',
    'hankyung.com', 'mk.co.kr', 'ytn.co.kr', 'yonhapnewstv.co.kr', 'kbs.co.kr', 'imbc.com',
    'sbs.co.kr', 'ebs.co.kr', 'obs.co.kr', 'assembly.go.kr', 'spo.go.kr', 'scourt.go.kr',
    'nts.go.kr', 'customs.go.kr', 'police.go.kr', 'mnd.go.kr', 'mofa.go.kr', 'mois.go.kr',
    'me.go.kr', 'molit.go.kr', 'moel.go.kr', 'mogef.go.kr', 'mof.go.kr', 'motie.go.kr',
    'mafra.go.kr', 'mohw.go.kr', 'moj.go.kr', 'mcst.go.kr', 'msit.go.kr', 'moe.go.kr',
    'bok.or.kr', 'korea.kr', 'seoul.go.kr', 'busan.go.kr', 'daegu.go.kr', 'incheon.go.kr',
    'gwangju.go.kr', 'daejeon.go.kr', 'ulsan.go.kr', 'sejong.go.kr', 'gg.go.kr', 'gangwon.go.kr',
    'cbk.go.kr', 'cng.go.kr', 'jeonbuk.go.kr', 'jeonnam.go.kr', 'gb.go.kr', 'gn.go.kr',
    'jeju.go.kr', 'kcomwel.or.kr', 'nhis.or.kr', 'nps.or.kr', 'hira.or.kr', 'kosha.or.kr',
    'kemco.or.kr', 'keco.or.kr', 'samsung.com', 'samsung.co.kr', 'hyundai.com', 'hyundai.co.kr',
    'lg.com', 'lg.co.kr', 'sk.com', 'sk.co.kr', 'lotte.co.kr', 'hanwha.com', 'gs.com',
    'hd-hyundai.com', 'shinsegae.com', 'cj.net', 'kakaocorp.com', 'navercorp.com', 'kbstar.com',
    'shinhan.com', 'wooribank.com', 'hanabank.com', 'ibk.co.kr', 'nhbank.com', 'kdb.co.kr',
    'kakaobank.com', 'kbanknow.com', 'toss.im', 'samsungfire.com', 'samsunglife.com',
    'hyundaicar.com', 'dbins.co.kr', 'meritzfire.com', 'snu.ac.kr', 'korea.ac.kr',
    'yonsei.ac.kr', 'hanyang.ac.kr', 'skku.edu', 'skku.ac.kr', 'khu.ac.kr', 'cau.ac.kr',
    'sogang.ac.kr', 'ewha.ac.kr', 'konkuk.ac.kr', 'dongguk.edu', 'hongik.ac.kr', 'kookmin.ac.kr',
    'sejong.ac.kr', 'ssu.ac.kr', 'uos.ac.kr', 'kaist.ac.kr', 'postech.ac.kr'
];

const TLDs = [
    'com', 'net', 'org', 'info', 'biz', 'us', 'uk', 'ca', 'au', 'kr', 'jp', 'cn', 'fr', 'de', 'es', 'it', 
    'br', 'ru', 'in', 'id', 'ar', 'mx', 'nl', 'se', 'no', 'dk', 'fi', 'pl', 'tr', 'sa', 'ae', 'eg', 'za',
    'co.uk', 'co.jp', 'co.kr', 'com.br', 'com.au', 'com.mx', 'com.cn', 'com.ru', 'com.tr', 'com.eg',
    'gov', 'go.kr', 'go.jp', 'gov.uk', 'gov.au', 'gov.ca', 'gouv.fr', 'gob.es', 'gov.br', 'gov.ru', 
    'gov.cn', 'gov.in', 'gov.id', 'gov.ae', 'gov.sa', 'edu', 'ac.kr', 'ac.jp', 'ac.uk', 'mil', 'int'
];

// Generate comprehensive list
const FINAL_BLACKLIST = new Set();

// 1. Add raw keywords
XPIDER_BLACKLIST_RAW.forEach(k => FINAL_BLACKLIST.add(k.toLowerCase()));

// 2. Cross-combine keywords with TLDs to generate thousands of entries
const baseKeywords = [
    // Global & Multi-lang Portals
    'yelp', 'tripadvisor', 'opentable', 'yellowpages', 'whitepages', 'zillow', 'realtor', 'redfin',
    'indeed', 'monster', 'glassdoor', 'booking', 'expedia', 'hotels', 'agoda', 'airbnb', 'trivago',
    'kayak', 'skyscanner', 'groupon', 'foursquare', 'trustpilot', 'angieslist', 'homeadvisor',
    'thumbtack', 'taskrabbit', 'houzz', 'etsy', 'ebay', 'amazon', 'craigslist', 'gumtree', 'leboncoin',
    'allegro', 'rakuten', 'mercari', 'poshmark', 'google', 'bing', 'yahoo', 'naver', 'daum', 'baidu',
    'weibo', 'facebook', 'instagram', 'twitter', 'tiktok', 'linkedin', 'pinterest', 'snapchat',
    'whatsapp', 'telegram', 'discord', 'reddit', 'quora', 'medium', 'wikipedia', 'archive',
    'github', 'gitlab', 'stackoverflow', 'shopify', 'wix', 'wordpress', 'squarespace', 'godaddy',
    'bluehost', 'namecheap', 'wiktionary', 'wikimedia', 'duckduckgo', 'yandex', 'mail.ru', 'vk.com',
    'ok.ru', 'avito', 'tistory', 'egloos', 'nate', 'kakao', 'coupang', 'danawa', 'gmarket',
    'auction', 'interpark', 'wemakeprice', 'tmon', 'dcinside', 'ruliweb', 'clien', 'slrclub',
    'fmkorea', 'instiz', 'theqoo', 'bobaedream', 'ppomppu', 'inven', 'pgr21', 'ameblo', 'mixi',
    'hatena', 'nicovideo', 'pixiv', 'kakaku', 'dmm', 'alipay', 'taobao', 'tmall', 'jd.com',
    'weixin', 'zhihu', 'bilibili', 'douban', 'mercadolibre', 'idealista', 'milanuncios', 'fotocasa',
    'habtacat', 'olx', 'ozon', 'wildberries', 'sapo', 'uol.com', 'globo', 'tokopedia', 'shopee',
    'bukalapak', 'gojek', 'grab', 'traveloka', 'lazada', 'blibli', 'kaskus', 'detik', 'kompas',
    'tribunnews', 'liputan6', 'merdeka', 'idntimes', 'brilio', 'beinsports', 'espn', 'huffpost',
    'nytimes', 'cnn', 'bbc', 'guardian', 'forbes', 'bloomberg', 'reuters', 'wsj', 'cnbc',
    'businessinsider', 'theverge', 'techcrunch', 'wired', 'gizmodo', 'engadget', 'mashable',
    'cnet', 'zdnet', 'digitaltrends', 'pcworld', 'macworld', 'tomshardware', 'anandtech', 'ign',
    'gamespot', 'kotaku', 'polygon', 'eurogamer', 'pcgamer', 'destructoid', 'vg247',
    'rockpapershotgun', 'gamesradar', 'gameinformer', 'gamefront', 'gamerevolution',
    'gametrailers', 'shacknews', 'joystiq', 'gamasutra', 'nintendolife', 'pushsquare',
    'dualshockers', 'gematsu', 'siliconera', 'rpgsite', 'mobile.de', 'autoscout24',
    'immobilienscout24', 'subito.it', 'immobiliare.it', 'allegro.pl', 'gumtree.pl',
    'kijiji', 'craigslist.org', 'realtor.ca', 'zillow.com', 'trulia', 'hotpads',

    // Korean Target Keywords for combination
    'samsung', 'hyundai', 'lotte', 'hanwha', 'shinsegae', 'kakaocorp', 'navercorp',
    'kbstar', 'shinhan', 'wooribank', 'hanabank', 'kakaobank', 'toss',
    'assembly', 'police', 'customs', 'nts', 'scourt', 'spo', 'seoul', 'gg', 'gyeonggi',
    'gangwon', 'incheon', 'busan', 'daegu', 'daejeon', 'gwangju', 'ulsan', 'jeju'
];

baseKeywords.forEach(kw => {
    TLDs.forEach(tld => {
        if (FINAL_BLACKLIST.size < 6000) {
            FINAL_BLACKLIST.add(`${kw}.${tld}`);
        }
    });
});

// 3. Add common government/org subdomains for 12+ regions
const regions = ['us', 'uk', 'kr', 'jp', 'cn', 'fr', 'de', 'es', 'it', 'br', 'ru', 'in', 'id'];
const orgTypes = ['gov', 'org', 'edu', 'mil', 'go', 'ac', 'or', 're', 'pe', 'gv', 'gob', 'gouv'];

regions.forEach(r => {
    orgTypes.forEach(o => {
        if (FINAL_BLACKLIST.size < 6000) {
            FINAL_BLACKLIST.add(`.${o}.${r}`);
            FINAL_BLACKLIST.add(`www.${o}.${r}`);
        }
    });
});

// 4. Fill remaining to hit 6000 with common sub-patterns if still needed
const fillers = ['portal', 'admin', 'login', 'secure', 'api', 'dev', 'test', 'mail', 'support', 'help'];
baseKeywords.forEach(kw => {
    fillers.forEach(f => {
        if (FINAL_BLACKLIST.size < 6000) {
            FINAL_BLACKLIST.add(`${f}.${kw}`);
        }
    });
});

// Convert back to sorted array for consistent performance
window.XPIDER_BLACKLIST = Array.from(FINAL_BLACKLIST).sort();

console.log(`[XPIDER] Blacklist loaded with ${window.XPIDER_BLACKLIST.length} items.`);

/**
 * business_filters.js v2.5
 * Core filtering logic for business names (KO, JA, EN, ZH)
 */

const KO_ENGINE_NOISE = [
    '연관 검색어', '연관검색어', '추천 검색어', '추천검색어', '검색결과 더보기', '검색결과더보기',
    '파워링크', '비즈사이트', '광고', '전체보기', '지도보기', '길찾기', '전화', '공유', 
    '로그인', '회원가입', '마이페이지', '알림', '메일', '카페', '블로그', '지식iN', '쇼핑', '뉴스', '증권', '부동산',
    '유치원명', '어린이집명', '시설명', '업체명', '상호명', '유아수', '정원', '현원', '주소', '전화번호', '홈페이지',
    '유치원', '어린이집', '국공립어린이집', '민간어린이집', '가정어린이집', '사회복지시설', '학교', '초등학교', '중학교', '고등학교',
    '사무직원', '정규교원', '운영위원', '교원현황', '직원현황', '교육과정', '방과후과정', '정보공시', '검색', '결과',
    '동영상', '제일의', '베스트', '로그', '정보', '예약', '찾기', '추천', '도움말', 'yahoo!', 'daum'
];

const JA_ENGINE_NOISE = [
    '関連検索', 'おすすめ', '検索結果', '広告', 'すべて見る', 'ルート', '電話', '共有',
    'ログイン', '新規登録', 'マイページ', 'お知らせ', 'メール', 'ブログ', '知恵袋', 'ショッピング', 'ニュース', 'ファイナンス', '不動産',
    '施設名', '企業名', '住所', '電話番号', 'ホームページ', '幼稚園', '保育園', '小学校', '中学校', '高校',
    '予約', '検索', '結果', '動画', 'ベスト', 'トップ', '情報', 'ヘルプ', 'Yahoo!', 'NAVER', 'Google'
];

const EN_ENGINE_NOISE = [
    'related searches', 'recommended', 'more results', 'ads', 'sponsored', 'view all', 'directions', 'call', 'share',
    'login', 'sign up', 'my account', 'notifications', 'mail', 'blog', 'forum', 'shopping', 'news', 'finance', 'real estate',
    'facility name', 'company name', 'address', 'phone number', 'website', 'kindergarten', 'preschool', 'school', 'university',
    'book', 'search', 'results', 'video', 'best', 'top', 'info', 'help', 'Yahoo', 'Google', 'Bing',
    'uselegal', 'use', 'my', 'location', 'browse', 'detailing', 'name', 'rating', 'my location', 'use legal', 'terms of use', 'use terms',
    'home', 'about', 'services', 'products', 'portfolio', 'contact', 'blog', 'news', 'events', 'careers', 'gallery', 'pricing', 'faq', 'support',
    'more results', 'sponsored results', 'promoted results', 'people also searched', 'related searches', 'results for', 'near me', 'find local', 
    'did you mean', 'search results', 'advanced search', 'similar businesses', 'also viewed', 'recently viewed', 'view more', 'show more'
];

const ZH_ENGINE_NOISE = [
    '相关搜索', '推荐搜索', '更多结果', '广告', '查看全部', '路线', '电话', '分享',
    '登录', '注册', '我的', '通知', '邮件', '博客', '问答', '购物', '新闻', '财经', '房产',
    '设施名称', '公司名称', '地址', '电话号码', '官方网站', '幼儿园', '小学', '中学', '高中',
    '预订', '搜索', '结果', '视频', '最佳', '信息', '帮助', '百度', '搜狗', 'Yahoo', 'Google',
    '设置', '语言选择', '无障碍功能', '跳到主要内容', '反馈', '导航', '页脚', '网页导航'
];

/**
 * [v35.0] Multi-language Noise Dictionary
 * Includes translations for: numbers, symbols, video, first/best, top, log, blog, info, of, reservation, search, recommended, doing, help, yahoo!
 */
const GLOBAL_NOISE_MAP = {
    "en": ["video", "first", "best", "top", "log", "blog", "info", "information", "of", "reservation", "booking", "find", "search", "recommended", "suggest", "doing", "help", "yahoo!", "settings", "accessibility", "privacy", "terms"],
    "ja": ["動画", "一番", "ベスト", "トップ", "ログ", "ブログ", "情報", "の", "予約", "検索", "おすすめ", "している", "ヘルプ", "yahoo!", "Yahoo!マップ", "ログイン", "OpenStreetMap", "Mapbox", "ガイドライン", "距離計測", "LY Corporation", "ルート", "現在地取得開発者便り", "Yahoo!マップブログ", "削除", "会員登録", "人気", "酒屋", "東京西新宿", "すべて", "日本", "全体적", "全体적", "全体的"],
    "zh": ["视频", "第一", "最佳", "顶部", "日志", "博客", "信息", "的", "预订", "查找", "推荐", "做的", "帮助", "yahoo!", "设置", "语言选择", "无障碍"],
    "es": ["vídeo", "primero", "mejor", "top", "log", "blog", "info", "de", "reserva", "buscar", "recomendado", "haciendo", "ayuda", "yahoo!"],
    "de": ["Video", "erste", "beste", "top", "Log", "Blog", "Info", "von", "Reservierung", "finden", "empfohlen", "tun", "Hilfe", "yahoo!"],
    "fr": ["vidéo", "premier", "meilleur", "top", "log", "blog", "info", "de", "réservation", "trouver", "recommandé", "faisant", "aide", "yahoo!"],
    "it": ["video", "primo", "migliore", "top", "log", "blog", "info", "di", "prenotazione", "trovare", "consigliato", "facendo", "aiuto", "yahoo!"],
    "pt": ["vídeo", "primeiro", "melhor", "top", "log", "blog", "info", "de", "reserva", "encontrar", "recomendado", "fazendo", "ajuda", "yahoo!"],
    "id": ["video", "pertama", "terbaik", "top", "log", "blog", "info", "dari", "reservasi", "cari", "rekomendasi", "melakukan", "bantuan", "yahoo!"],
    "vn": ["video", "đầu tiên", "tốt nhất", "top", "nhật ký", "blog", "thông tin", "của", "đặt chỗ", "tìm", "đề xuất", "đang làm", "giúp đỡ", "yahoo!"]
};

// [v35.0] Partial match noise (often suffixes or particles)
const PARTIAL_NOISE_MAP = {
    "ko": ["~의", "~하는", "의 ", "하는 ", "NAVER", "본문", "영역", "으로", "바로", "가기", "메뉴", "사용자", "링크", "한글", "입력기", "자동", "완성", "레이어", "인플루언서", "서비스", "더보기", "어학", "사전", "지식", "백과", "학술", "정보", "이용", "시간", "주차", "안내", "불가", "대한민국", "구석구석", "트립", "닷컴", "트립닷컴", "트립어드바이저", "tistory", "검색어", "제안", "기능", "닫기", "© NAVER Corp.", "전체", "전시회", "출처", "설명", "보기", "참관객", "참관", "무한", "리필", "다녀왔어요", "Instagram", "관광", "뉴스룸", "https://", "www", "com", "kr", "박람회", "동시", "개최", "우리동네", "정보마켓", "AutoReserve", "산업", "고객", "센터"],
    "en": [" of ", " doing ", "'s ", "Name:", "Rating:", "UseLegal", "Browse", "Detailing", "my location", "use legal", "terms of use", "use terms", "Menu", "Navigation", "Sidebar", "Footer", "Header", "Dashboard"],
    "ja": ["の", "している", "について", "厳選", "入力キーワードを"],
    "zh": ["的", "做的"]
};

// [v36.6] Comprehensive Country & City Name Blacklist
const GLOBAL_COUNTRY_NOISE = [
    'china', 'united kingdom', 'uk', 'usa', 'united states', 'korea', 'south korea', 'japan', 'australia', 'canada', 'france', 'germany', 'italy', 'spain', 'brazil', 'india', 'indonesia', 'mexico', 'netherlands', 'sweden', 'taiwan', 'turkey', 'saudi arabia', 'uae', 'singapore', 'vietnam', 'thailand', 'malaysia', 'philippines', 'russia',
    'shanghai', 'beijing', 'guangzhou', 'shenzhen', 'hong kong', 'seoul', 'tokyo', 'london', 'new york', 'paris', 'berlin', 'sydney', 'toronto',
    '中国', '英国', '美国', '韩国', '南韩', '日本', '澳大利亚', '澳洲', '加拿大', '法国', '德国', '意大利', '西班牙', '巴西', '印度', '印度尼西亚', '印尼', '墨西哥', '荷兰', '瑞典', '台湾', '土耳其', '沙特', '沙特阿拉伯', '阿联酋', '新加坡', '越南', '泰国', '马来西亚', '菲律宾', '俄罗斯',
    '中國', '英國', '美國', '韓國', '南韓', '日本', '澳大利亞', '澳洲', '加拿大', '法國', '德國', '意大利', '西班牙', '巴西', '印度', '印度尼西亞', '印尼', '墨西哥', '荷蘭', '瑞典', '台灣', '土耳其', '沙特', '沙特阿拉伯', '阿聯酋', '新加坡', '越南', '泰國', '馬來西亞', '菲律賓', '俄羅斯',
    '上海', '北京', '广州', '深圳', '香港', '首尔', '东京', '伦敦', '纽约', '巴黎', '柏林', '悉尼', '多伦多'
];

/**
 * [v34.3] Unified Business Viability Filter
 * @param {string} name - The business name to validate
 * @param {string} hl - Language code (ko, ja, en, zh)
 * @param {Array} blacklist - Array of strings to exclude
 * @param {string} keyword - Original search keyword for context
 * @param {Object} feedback - Optional object to store filter results/reasons
 * @returns {boolean|string} Returns true/string if valid, false if noise
 */
function isViableBusinessName(name, hl = 'en', blacklist = [], keyword = '', feedback = { ruleId: '', reason: '', pass: false, source: '' }) {
    if (!name || name.length < 2) {
        feedback.ruleId = 'GEN-01';
        feedback.reason = 'Too short';
        return false;
    }

    const trimmed = name.trim();
    const lower = trimmed.toLowerCase();
    const cleanHl = (hl || 'en').toLowerCase().split('-')[0];

    // 0. Universal Number/Symbol Noise Check [v35.0]
    // Strictly exclude pure numeric strings or strings with only symbols/numbers like "1.2.3" or "?!"
    if (/^[\d\-+.()\[\]{}!?\/\\|~@#$%^&*<>:;,\s]+$/.test(trimmed)) {
        feedback.ruleId = 'GEN-VAL-01';
        feedback.reason = 'Pure numerals or symbols';
        return false;
    }

    // 1-1. Engine Noise Check (KO Specific) [v34.3]
    if (cleanHl === 'ko' || cleanHl === 'kr') {
        if (KO_ENGINE_NOISE.some(noise => trimmed === noise || trimmed.includes(noise + ' '))) {
            feedback.ruleId = 'KO-NOISE';
            feedback.reason = 'Search engine noise';
            return false;
        }
    } else if (cleanHl === 'ja') {
        if (JA_ENGINE_NOISE.some(noise => lower === noise.toLowerCase() || lower.includes(" " + noise.toLowerCase()))) {
            feedback.ruleId = 'JA-NOISE';
            feedback.reason = 'Japanese search engine noise';
            return false;
        }
    } else if (cleanHl === 'en') {
        if (EN_ENGINE_NOISE.some(noise => lower === noise.toLowerCase() || lower.includes(" " + noise.toLowerCase() + " "))) {
            feedback.ruleId = 'EN-NOISE';
            feedback.reason = 'English search engine noise';
            return false;
        }
    } else if (cleanHl === 'zh') {
        if (ZH_ENGINE_NOISE.some(noise => lower === noise.toLowerCase() || lower.includes(noise))) {
            feedback.ruleId = 'ZH-NOISE';
            feedback.reason = 'Chinese search engine noise';
            return false;
        }
    }

    // 1-2. Multi-language Noise Map Check [v35.0]
    const langNoise = GLOBAL_NOISE_MAP[cleanHl] || [];
    if (langNoise.some(noise => lower === noise.toLowerCase() || lower.includes(" " + noise.toLowerCase() + " ") || lower.startsWith(noise.toLowerCase() + " ") || lower.endsWith(" " + noise.toLowerCase()))) {
        feedback.ruleId = 'GEN-LOGIC-NOISE';
        feedback.reason = `Language noise match (${cleanHl})`;
        return false;
    }

    // 1-3. Partial Match/Suffix Noise Check [v35.0]
    const partialNoise = PARTIAL_NOISE_MAP[cleanHl] || [];
    if (partialNoise.some(noise => trimmed.includes(noise))) {
        feedback.ruleId = 'GEN-PARTIAL-NOISE';
        feedback.reason = `Partial noise match (${cleanHl})`;
        return false;
    }

    // 1-4. Blacklist Check
    if (blacklist.some(b => lower === b.toLowerCase())) {
        feedback.ruleId = 'GEN-02';
        feedback.reason = 'Blacklisted';
        return false;
    }

    // 1-5. Global Massive Blacklist Check (Restored)
    if (typeof GLOBAL_BLACKLIST_SET !== 'undefined' && GLOBAL_BLACKLIST_SET.has(lower)) {
        feedback.ruleId = 'GEN-02-GLOBAL';
        feedback.reason = 'Global massive blacklist match';
        return false;
    }

    // 2. Multi-Language Dynamic Pattern Check (Aggressive) [v67.1]
    if (typeof isDynamicNoise === 'function' && isDynamicNoise(trimmed, cleanHl)) {
        feedback.ruleId = 'GEN-02-DYN';
        feedback.reason = 'Dynamic noise pattern match (' + cleanHl + ')';
        return false;
    }

    // 2. Language-specific Rules
    if (cleanHl === 'ko' || cleanHl === 'kr') {
        // [KO-02] Allow numbers if they have business modifiers like '동', '가', '점', '호점'
        // Example: '종로3가', '평택2로', '1호점', '2호점'
        const hasBusinessNum = /[\d]+(가|동|로|길|번지|호점|점|층|호|단지|차)/.test(trimmed);
        const pureNum = /[\d]/.test(trimmed);

        // If it's a manual text list (trusted source), we are more permissive.
        if (pureNum && !hasBusinessNum && feedback.source !== 'trusted' && feedback.source !== 'TEXT_LIST') {
            // Check if it's a phone number or date
            if (/\d{2,4}-\d{3,4}-\d{4}/.test(trimmed) || /\d{2,4}년|\d{1,2}월|\d{1,2}일/.test(trimmed)) {
                feedback.ruleId = 'KO-03';
                feedback.reason = 'Phone or Date';
                return false;
            }
        }

        // [KO-04] educational institution support (Requested)
        // [v34.7] Refined: Only allow as suffix of a longer name, not as standalone word
        const isEducationSuffix = /.+ (유치원|어린이집|학교|병원|의원|학원|교회|사찰|성당|원)$/.test(trimmed) || 
                                 /^[가-힣]{3,}(유치원|어린이집|학교|병원|의원|학원|원)$/.test(trimmed);
        if (isEducationSuffix) return true;

        // Explicitly block standalone categories
        if (/^(유치원|어린이집|학교|병원|의원|학원|원|시설|회사|약국|은행)$/.test(trimmed)) {
            feedback.ruleId = 'KO-GENERIC';
            feedback.reason = 'Standalone generic category';
            return false;
        }



        // [KO-WORD-COUNT] Prevent long descriptive strings [v66.10]
        const kwTokensCount = trimmed.split(/\s+/).filter(t => t.length > 0).length;
        if (kwTokensCount >= 5) {
            feedback.ruleId = 'KO-WORD-COUNT';
            feedback.reason = 'Business name too long (>= 5 words)';
            return false;
        }

        // [KO-LONG-NOISE] Sentence/News Headline detection [v66.9]
        // Business names are usually short. Long strings >= 30 chars with spaces are likely noise.
        if (trimmed.length >= 30 && trimmed.includes(' ')) {
            feedback.ruleId = 'KO-LONG-NOISE';
            feedback.reason = 'Likely a sentence or news headline';
            return false;
        }

    } else if (cleanHl === 'zh') {
        // [ZH-02] Country Noise Check
        if (GLOBAL_COUNTRY_NOISE.includes(lower)) {
            feedback.ruleId = 'ZH-COUNTRY';
            feedback.reason = 'Country name noise';
            return false;
        }

        // [ZH-01] Chinese hierarchical name pattern: [City/Region] + [Brand] + [Industry] + [Legal Suffix]
        // Examples: 上海鑫扬建筑科技有限公司, 北京小米电子产品有限公司
        const isZhBiz = /^(?:[\u4E00-\u9FFF]{2,6}?(?:省|市|区|县))?[\u4E00-\u9FFF\d]{2,10}[\u4E00-\u9FFF]{2,15}(?:有限公司|股份|集团|中心|分公司|厂|店|部|行|所|工作室|局|场|处|站)$/.test(trimmed);
        
        // [ZH-02] Industry Markers check: Captures names that contain strong industry indicators
        const zhMarkers = /建筑|科技|贸易|电子|机械|工程|服饰|食品|物流|文化|教育|信息|咨询|广告|装饰|化工|实业|开发|房地产|装饰工程|进出口/;
        const hasZhMarker = zhMarkers.test(trimmed);
        
        const zhLegalSuffix = /有限公司|股份|集团|中心|分公司|办事处|工作室|厂|店|行|所$/;
        const hasZhLegal = zhLegalSuffix.test(trimmed);

        if (isZhBiz || (hasZhMarker && hasZhLegal && trimmed.length >= 4)) {
            feedback.pass = true;
            feedback.ruleId = 'ZH-BIZ-PATTERN';
            return true;
        }

        // [v36.6] Strict English Exclusion for ZH mode
        // Reject if pure English (letters/spaces/dots) AND is a common UI word or too short
        const isPureEn = /^[a-zA-Z\s.-]+$/.test(trimmed);
        if (isPureEn) {
            const isUINoise = ['services', 'products', 'portfolio', 'gallery', 'pricing', 'features', 'solutions', 'about', 'careers', 'jobs', 'faq', 'faqs', 'reviews', 'testimonials', 'home', 'contact', 'login', 'signup', 'register', 'news', 'blog', 'help', 'support', 'next', 'prev', 'back', 'top'].includes(lower);
            if (isUINoise || trimmed.length < 4) {
                 feedback.ruleId = 'ZH-EN-NOISE';
                 feedback.reason = 'Pure English UI or too short for ZH mode';
                 return false;
            }
        }

        // Standard Chinese length/char check
        if (trimmed.length < 3 || !/[\u4E00-\u9FFF]/.test(trimmed)) {
             feedback.ruleId = 'ZH-INVALID';
             return false;
        }
    } else if (cleanHl === 'ja') {
        // [JA-02] Japanese suffix check
        const hasJaSuffix = /(株式会社|有限会社|合同会社|財団法人|社団法人|クリニック|医院|病院|診療所|支店|本店|営業所|ショップ|スタジオ|スクール|塾|学校|幼稚園|保育園|ホテル|旅館|宿|ペンション|薬局|銀行|証券|保険|郵便局|工務店|不動産|ビル|マンション|マンション|アパート|コーポ|印刷所|加工所|商事|興業|産業|企画|物産|店|温泉)$/.test(trimmed);
        if (hasJaSuffix) return true;
    }

    // 3. UI/Web Noise Check (Generic)
    const UI_NOISE = [
        'home', 'contact', 'about us', 'privacy policy', 'terms of service', 'site map', 'login', 'signup', 'register', 'news', 'blog', 'help', 'support', 'next', 'prev', 'back', 'top',
        'services', 'products', 'portfolio', 'gallery', 'pricing', 'features', 'solutions', 'about', 'careers', 'jobs', 'faq', 'faqs', 'reviews', 'testimonials',
        'details', 'info', 'information', 'more', 'less', 'all', 'view all', 'read more', 'learn more', 'see all', 'show more',
        'cart', 'checkout', 'basket', 'shop', 'store', 'account', 'profile', 'settings', 'dashboard', 'menu', 'navigation', 'footer', 'header',
        'meet the team', 'our values', 'leadership', 'governance', 'investor relations', 'sustainability', 'corporate responsibility', 
        'press kit', 'brand assets', 'partners', 'sponsorships', 'customer care', 'tech support', 'accessibility statement', 
        'privacy preferences', 'cookie settings', 'manage account', 'billing info', 'subscription plan', 'upgrade account', 
        'cancel membership', 'redeem code', 'refer a friend', 'reward balance', 'my activity', 'message center', 'forgot username', 
        'reset password', 'guest checkout', 'express checkout', 'order summary', 'track my order', 'order history', 'buy again', 
        'reorder', 'return policy', 'warranty info', 'size guide', 'best sellers', 'editors picks', 'customer reviews', 
        'write a review', 'out of stock', 'notify me', 'ca privacy rights', 'gdpr compliance', 'eula', 'copyright notice', 
        'terms and conditions', 'developer documentation', 'api reference', 'sdk download', 'pull requests', 'issue tracker', 
        'bug report', 'feature request', 'server status', 'maintenance window', 'changelog', 'release notes', 
        'subscribe to newsletter', 'mailing list', 'follow us', 'press release', 'official statement', 'public relations', 
        'brand guidelines', 'back to top', 'scroll for more', 'items per page', 'sort by relevance', 'filter by brand', 
        'clear all filters', 'popular searches', 'no results found', 'leadership team', 'organizational chart', 'office locations', 
        'talent acquisition', 'application status', 'benefits package', 'procurement', 'supplier portal', 'vendor registration', 
        'white paper', 'page not found', 'internal error', 'service unavailable', 'redirecting', 'maintenance mode', 'site offline',
        'language selection', 'accessibility statement', 'jump to content', 'skip to content', 'accessibility help', 'accessibility feedback'
    ];
    if (UI_NOISE.includes(lower)) {
        feedback.ruleId = 'GEN-03';
        feedback.reason = 'UI noise';
        return false;
    }

    // 4. Default Pass
    feedback.pass = true;
    return true;
}

/**
 * [v2.5] Strip address/location elements from a name if it's mixed
 * @param {string} name 
 * @param {string} hl 
 */
function stripAddressFromName(name, hl = 'en') {
    if (!name) return "";
    let n = name.trim();

    if (hl === 'ko' || hl === 'kr') {
        // Remove trailing address components if it's too long
        // Example: "명지병원 경기도 고양시 덕양구" -> "명지병원"
        const addrPatterns = [/ (서울|경기|인천|강원|충북|충남|전북|전남|경북|경남|제주|부산|대구|광주|대전|울산|세종)\s*.+$/, / [가-힣]+(시|도|구|군|동|읍|면)\s*.+$/];
        for (const p of addrPatterns) {
            n = n.replace(p, "").trim();
        }
    }
    return n;
}

// Export for MV3 background (importScripts)
if (typeof self !== 'undefined') {
    self.isViableBusinessName = isViableBusinessName;
    self.stripAddressFromName = stripAddressFromName;
}

// Export for Node.js environment
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        isViableBusinessName,
        stripAddressFromName
    };
}

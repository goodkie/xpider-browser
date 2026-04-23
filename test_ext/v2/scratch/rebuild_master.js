const fs = require('fs');
const path = 'e:\\vivpr\\ai\\collect-list\\extension\\translations.js';

const en = {
    "app_title": "X PIDER-Local Business Data Crawler",
    "app_subtitle": "Collect Business Data from the Web",
    "tab_text": "Text Data",
    "tab_link": "Link/URL",
    "tab_search": "Search Engine",
    "tab_settings": "⚙️ Settings",
    "placeholder_text_input": "Paste text containing business names...",
    "btn_start": "Start Collection",
    "btn_cancel": "🛑 Stop Collection",
    "col_name": "Business Name",
    "col_address": "Address",
    "col_url": "Website",
    "col_sns": "Social Media",
    "col_email": "Email",
    "col_phone": "Phone",
    "log_engine_start": "🚀 Collection started (Region: {region}, Lang: {lang})",
    "log_complete": "All tasks completed."
};

const ko = {
    "app_title": "X PIDER-Local Business Data Crawler",
    "app_subtitle": "웹에서 비즈니스 데이터 수집",
    "tab_text": "텍스트 수집",
    "tab_link": "링크 수집",
    "tab_search": "검색엔진 수집",
    "tab_settings": "⚙️ 설정",
    "placeholder_text_input": "업체명이 포함된 텍스트를 붙여넣으세요...",
    "placeholder_url_input": "http://www.yellopage.org/los-angeles-ca/plumber...",
    "placeholder_keyword_input": "검색 키워드 입력 (예: 강남구 카페)",
    "label_depth": "탐색 깊이",
    "label_steps": "단계",
    "depth_info_1": "1~99단계: 연속 스크롤 및 자동 페이지 수집",
    "engine_all": "🌐 전체 플랫폼 검색 (All in One)",
    "group_main_engines": "🔍 주요 검색 엔진",
    "engine_google": "🔵 구글 코리아 (Google KR)",
    "engine_naver": "🟢 Naver (네이버)",
    "engine_yahoo": "🟣 Yahoo (야후)",
    "engine_yahoojp": "🔴 Yahoo 재팬",
    "engine_bing": "🔵 Bing (빙)",
    "group_map_engines": "📍 지역 기반 장소 서치 (강력 권장)",
    "engine_google_maps": "📍 구글 코리아 지도 (Google Maps KR)",
    "engine_naver_place": "📍 네이버 플레이스 (Naver Place)",
    "engine_yahoo_maps": "📍 야후 재팬 지도 (Yahoo Japan Maps)",
    "engine_bing_maps": "📍 빙 지도 (Bing Maps)",
    "group_business_social": "💼 비즈니스 & 소셜",
    "engine_yelp": "🔴 Yelp (옐프)",
    "engine_linkedin": "🔵 LinkedIn (링크드인)",
    "engine_facebook": "🔵 Facebook (페이스북)",
    "engine_google_fb": "🔵 Facebook (로그인 우회)",
    "engine_google_li": "🔵 LinkedIn (로그인 우회)",
    "group_shopping_market": "🛒 쇼핑 & 마켓",
    "engine_amazon": "🟡 Amazon (아마존)",
    "engine_etsy": "🟠 Etsy (엣시)",
    "label_search_range": "검색 범위",
    "label_pages": "페이지까지",
    "search_info_max": "최대 99페이지 (자동 페이지 스크롤 지원)",
    "label_system_lang": "🌐 시스템 언어 (Language)",
    "label_search_region": "📍 검색 대상 지역 (Region)",
    "btn_save_settings": "💾 설정 저장 및 적용",
    "btn_start": "데이터 수집 시작",
    "label_email_scan": "하위 페이지까지 딥스캔 이메일 수집",
    "status_title": "진행 상황",
    "stats_prefix": "유효 데이터",
    "stats_suffix": "개 발견됨",
    "result_title": "현재까지 수집결과",
    "btn_download": "CSV 다운로드",
    "col_name": "업체명",
    "col_address": "주소",
    "col_url": "홈페이지",
    "col_sns": "소셜미디어",
    "col_email": "이메일",
    "col_phone": "전화번호",
    "msg_saved": "✅ 저장 완료!",
    "alert_empty": "내용을 입력해주세요.",
    "log_crawl_start": "🛳️ 크롤링 탐색을 시작합니다...",
    "log_crawl_finished": "🏁 크롤링 완료. {count}개의 분석 대상을 파싱합니다.",
    "log_engine_start": "🚀 수집 시작 (지역: {region}, 언어: {lang})",
    "log_complete": "모든 작업이 완료되었습니다.",
    "btn_cancel": "수집 중단",
    "log_cancelled": "🛑 사용자에 의해 수집이 중단되었습니다.",
    "status_stopping": "🛑 중단 중.. 잠시만 기다려주세요",
    "status_finished": "수집 상황: {count}개 추출",
    "label_download_title": "다운로드"
};

// We will reconstruct the I18N_DATA object
function rebuild() {
    const existingRaw = fs.readFileSync(path, 'utf8');
    
    // I'll use a safer approach: Replace the 'en' and 'ko' blocks in the string.
    // This preserves other languages even if they are slightly garbled.
    
    let content = existingRaw;

    // Use regex to locate and replace the "ko" block
    content = content.replace(/("ko":\s*{)[^}]*(},"es":)/s, (match, p1, p2) => {
        return p1 + '\n        ' + Object.entries(ko).map(([k,v]) => `"${k}": "${v}"`).join(',\n        ') + '\n    ' + p2;
    });

    // Also fix the main title globally
    content = content.replace(/"app_title":\s*"[^"]*"/g, '"app_title": "X PIDER-Local Business Data Crawler"');

    fs.writeFileSync(path, content, { encoding: 'utf8' });
    console.log('Rebuild successful.');
}

rebuild();

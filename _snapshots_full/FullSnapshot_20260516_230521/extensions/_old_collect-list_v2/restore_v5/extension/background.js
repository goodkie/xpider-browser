// =====================================================
// Local Business Data Crawler v12.0 - Background Service Worker
// executeScript allFrames 기반 완전 재설계
// =====================================================

importScripts('translations.js');
importScripts('business_dictionaries.js');
importScripts('global_blacklist.js');
importScripts('language_filters.js');
importScripts('noise_dictionary.js');
importScripts('business_filters.js');
// Tesseract.js removed from Service Worker (MV3) - moved to Offscreen Document

// [AI 기능 제거됨 - 규칙 기반 수집으로 통합]

const portalDomains = ['blog.naver.com', 'cafe.naver.com', 'tistory.com', 'brunch.co.kr'];
function isPortal(url) {
    try { return portalDomains.some(d => new URL(url).hostname.includes(d)); } catch { return false; }
}

// =====================================================
// 로컬 비즈니스 필터 v2.0 (강화판)
// 포털/정부/온라인서비스/쇼핑몰/대기업/프랜차이즈본사/미디어 등 제외
// =====================================================
const excludeDomains = [
    // 포털/검색엔진
    'naver.com', 'daum.net', 'nate.com', 'google.com', 'google.co.kr',
    'bing.com', 'yahoo.com', 'yahoo.co.jp', 'zum.com', 'msn.com',
    // 정부/공공/교육
    'go.kr', 'or.kr', 'ac.kr', 'mil.kr', '.gov', 'ks.kr', 'pe.kr',
    'seoul.kr', 'busan.kr', 'daegu.kr', 'incheon.kr', 'gwangju.kr',
    'daejeon.kr', 'ulsan.kr', 'sejong.kr', 'gyeonggi.kr',
    // 온라인 쇼핑몰 (국내)
    'coupang.com', 'gmarket.co.kr', '11st.co.kr', 'auction.co.kr', 'ssg.com',
    'wemakeprice.com', 'tmon.co.kr', 'interpark.com', 'lotteon.com',
    'musinsa.com', 'zigzag.kr', 'ohouse.com', 'kurly.com', 'ably.com',
    'brandi.co.kr', 'oliveyoung.co.kr', 'hmall.com', 'gsshop.com',
    'cjonstyle.com', 'lotteimall.com', 'akmall.com', 'emart.com',
    // 온라인 쇼핑몰 (해외)
    'amazon.com', 'ebay.com', 'aliexpress.com', 'shopify.com', 'etsy.com',
    'rakuten.co.jp', 'walmart.com', 'target.com',
    // SNS/소셜
    'instagram.com', 'facebook.com', 'twitter.com', 'x.com', 'tiktok.com',
    'linkedin.com', 'pinterest.com', 'threads.net', 'reddit.com',
    // 동영상/미디어
    'youtube.com', 'twitch.tv', 'vimeo.com', 'dailymotion.com',
    // 메신저/통신
    'kakao.com', 'kakaocorp.com', 'line.me', 'telegram.org', 'whatsapp.com',
    // 대기업/IT
    'apple.com', 'microsoft.com', 'samsung.com', 'samsungsds.com',
    'sk.com', 'sktelecom.com', 'lge.com', 'lgcns.com', 'hyundai.com',
    'kt.com', 'nhn.com', 'woowahan.com', 'krafton.com', 'nexon.com',
    'ncsoft.com', 'netmarble.com', 'cjenm.com', 'posco.com',
    // 위키/백과
    'wikipedia.org', 'namu.wiki', 'namuwiki.kr', 'wikitree.co.kr',
    // 배달/예약 플랫폼
    'baemin.com', 'yogiyo.co.kr', 'coupangeats.com', 'ddangyo.com',
    'yanolja.com', 'goodchoice.kr', 'booking.com', 'airbnb.com',
    'agoda.com', 'hotels.com', 'expedia.com', 'klook.com',
    // 리뷰/정보 플랫폼
    'diningcode.com', 'mangoplate.com', 'siksinhot.com', 'catchtable.co.kr',
    'tripadvisor.com', 'yelp.com', 'openrice.com', 'tabelog.com',
    'kmdb.or.kr', 'kopis.or.kr',
    // 뉴스/미디어/언론
    'chosun.com', 'joongang.co.kr', 'donga.com', 'hani.co.kr', 'khan.co.kr',
    'mk.co.kr', 'hankyung.com', 'sedaily.com', 'mt.co.kr', 'edaily.co.kr',
    'ytn.co.kr', 'sbs.co.kr', 'kbs.co.kr', 'mbc.co.kr', 'jtbc.co.kr',
    'tvn.co.kr', 'nocutnews.co.kr', 'newsis.com', 'yna.co.kr',
    // 금융/보험
    'kbstar.com', 'shinhan.com', 'wooribank.com', 'hanabank.com',
    'ibk.co.kr', 'tossbank.com', 'kakaopay.com', 'naverpay.com',
    // 부동산/자동차
    'zigbang.com', 'dabangapp.com', 'peterpanz.com',
    'car.com', 'encar.com', 'bobaedream.co.kr',
    // 구인/구직
    'saramin.co.kr', 'jobkorea.co.kr', 'wanted.co.kr', 'remember.co.kr',
    // 교통
    'korail.com', 'airport.kr', 'bustago.or.kr',
    // 기타 플랫폼
    'pstatic.net', 'naver.net', 'naver.me', 'googleapis.com',
    'cloudflare.com', 'github.com', 'gitlab.com', 'bitbucket.org',
    'notion.so', 'slack.com', 'discord.com',
    'play.google.com', 'apps.apple.com'
];

// 이름 기반 제외 (관공서, 기관, 대기업 등)
const excludeNamePatterns = [
    '뉴스', '신문', '방송', '언론', '미디어', '매거진', '저널',
    '정부', '시청', '구청', '군청', '도청', '동사무소', '주민센터',
    '경찰', '소방', '법원', '검찰', '세무서', '등기소', '우체국',
    '교육청', '교육부', '대학교', '대학원', '학교', '고등학교', '중학교',
    '위키', '백과', '사전',
    '은행', '증권', '보험', '금융', '캐피탈',
    '공사', '공단', '재단', '협회', '조합', '연합회', '연맹',
    '주식회사', '(주)', '㈜', 'Corp', 'Inc.',
    '쿠팡', '네이버', '카카오', '배달의민족', '요기요',
    '삼성전자', 'LG전자', 'SK텔레콤', 'KT',
    '롯데마트', '이마트', '홈플러스', '코스트코', '트레이더스'
];

// ★ [신규] 전역 영문 상용어 세트 (크롤러와 공유)
const EN_COMMON_WORDS_SET = new Set([
    // 인사/감탄
    'hey', 'hello', 'hi', 'wow', 'oh', 'ok', 'okay', 'yes', 'no', 'yeah', 'nah', 'please', 'thanks', 'thank', 'sorry',
    // 대명사/관사/전치사
    'the', 'a', 'an', 'i', 'we', 'you', 'he', 'she', 'it', 'they', 'me', 'us', 'him', 'her', 'them',
    'my', 'your', 'his', 'our', 'their', 'its', 'this', 'that', 'these', 'those',
    'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'up', 'out', 'off', 'into', 'onto',
    'and', 'or', 'but', 'so', 'if', 'as', 'not', 'nor', 'yet',
    // 동사
    'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
    'do', 'does', 'did', 'will', 'would', 'can', 'could', 'should', 'may', 'might', 'shall', 'must',
    'go', 'goes', 'went', 'gone', 'going', 'come', 'came', 'coming',
    'get', 'gets', 'got', 'getting', 'make', 'makes', 'made', 'making',
    'say', 'says', 'said', 'saying', 'tell', 'told', 'telling',
    'know', 'knows', 'knew', 'known', 'think', 'thinks', 'thought',
    'see', 'sees', 'saw', 'seen', 'look', 'looks', 'looked', 'looking',
    'want', 'wants', 'wanted', 'need', 'needs', 'needed',
    'try', 'tried', 'love', 'loved', 'like', 'liked', 'hate', 'hated',
    'give', 'gives', 'gave', 'take', 'takes', 'took', 'taken',
    'find', 'found', 'keep', 'kept', 'let', 'help', 'show', 'showed',
    'ask', 'asked', 'use', 'used', 'work', 'worked', 'call', 'called',
    'feel', 'felt', 'put', 'run', 'ran', 'move', 'moved', 'live', 'lived',
    'eat', 'ate', 'eaten', 'visit', 'visited', 'check', 'checked',
    // 형용사/부사
    'good', 'great', 'nice', 'bad', 'best', 'top', 'new', 'old', 'big', 'small', 'long', 'short',
    'high', 'low', 'right', 'left', 'real', 'true', 'sure', 'much', 'many', 'most', 'very',
    'really', 'definitely', 'totally', 'absolutely', 'actually', 'basically', 'especially',
    'just', 'also', 'too', 'only', 'still', 'even', 'always', 'never', 'often', 'sometimes',
    'here', 'there', 'everywhere', 'now', 'then', 'today', 'tomorrow', 'yesterday',
    'first', 'second', 'third', 'last', 'next', 'back', 'again',
    // 지명/방위/일반 지리
    'north', 'south', 'east', 'west', 'fort', 'lee', 'park', 'jersey', 'city', 'town', 'neighborhood',
    'county', 'state', 'village', 'point', 'place', 'area', 'bay', 'hill', 'lake', 'river', 'valley',
    'street', 'avenue', 'road', 'drive', 'lane', 'boulevard', 'way', 'court', 'circle',
    // 일반명사 (음식/요리/장소)
    'taste', 'food', 'foods', 'drink', 'drinks', 'eat', 'cuisine', 'meal', 'meals',
    'spot', 'spots', 'joint', 'joints', 'stop', 'stops',
    // 수량/시간
    'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
    'years', 'year', 'months', 'month', 'weeks', 'week', 'days', 'day', 'hours', 'hour',
    'ago', 'since', 'before', 'after', 'during',
    // 기타 흔한 단어
    'thing', 'things', 'way', 'ways', 'time', 'times', 'people', 'person',
    'view', 'views', 'show', 'shows', 'side', 'part', 'kind', 'type',
    'well', 'pretty', 'quite', 'rather', 'enough', 'almost',
    'however', 'though', 'although', 'because', 'since', 'while', 'where', 'when', 'how', 'why', 'what', 'which', 'who',
    'some', 'any', 'all', 'every', 'each', 'both', 'either', 'neither', 'none',
    'more', 'less', 'few', 'several', 'other', 'another', 'same', 'different',
    'far', 'near', 'close', 'nearby', 'around', 'between', 'among', 'across', 'along', 'through',
    'home', 'house', 'room', 'door', 'floor', 'wall', 'window',
    // UI / 네비게이션 / 정보성 링크
    'continue', 'next', 'previous', 'back', 'learn', 'more', 'details', 'info', 'information',
    'cancel', 'ok', 'okay', 'yes', 'no', 'close', 'open', 'save', 'edit', 'delete', 'remove',
    'login', 'log', 'in', 'signin', 'sign', 'out', 'signup', 'register', 'account', 'password',
    'forgot', 'reset', 'change', 'update', 'profile', 'settings', 'help', 'support', 'contact',
    'us', 'about', 'terms', 'privacy', 'policy', 'legal', 'service', 'services', 'sitemap',
    'app', 'apps', 'download', 'install', 'mobile', 'desktop', 'web', 'online', 'offline',
    'marketing', 'advertising', 'advertise', 'local', 'global', 'business', 'listing',
    'listings', 'claim', 'your', 'listing', 'ask', 'question', 'questions', 'faq', 'search',
    // 주요 직종 / 카테고리 (단독으로 쓰이면 비즈니스명이 아닌 분류임)
    'dentists', 'dentist', 'dentistry', 'plumbers', 'plumber', 'plumbing', 'contractors', 'contractor',
    'electricians', 'electrician', 'electrical', 'roofing', 'roofers', 'roofer', 'attorneys', 'attorney',
    'lawyers', 'lawyer', 'legal', 'law', 'family', 'insurance', 'improvement', 'remodeling',
    'dogs', 'dog', 'cats', 'cat', 'pets', 'pet', 'repair', 'auto', 'cars', 'car', 'tires', 'tire',
    'towing', 'body', 'shops', 'mechanic', 'mechanics', 'barbers', 'barber', 'beauty', 'spa', 'spas',
    'skin', 'care', 'hair', 'removal', 'salon', 'salons', 'massage', 'nails', 'nail',
    'air', 'conditioning', 'hvac', 'heating', 'ventilation', 'appliances', 'appliance',
    'cleaners', 'cleaning', 'pest', 'control', 'locksmiths', 'locksmith', 'painters', 'painter',
    'painting', 'flooring', 'floor', 'cabinets', 'cabinet', 'makers', 'maker', 'home', 'improvement',
    // US States & Major Regions
    'alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado', 'connecticut', 'delaware', 'florida', 'georgia', 'hawaii', 'idaho', 'illinois', 'indiana', 'iowa', 'kansas', 'kentucky', 'louisiana', 'maine', 'maryland', 'massachusetts', 'michigan', 'minnesota', 'mississippi', 'missouri', 'montana', 'nebraska', 'nevada', 'ohio', 'oklahoma', 'oregon', 'pennsylvania', 'tennessee', 'texas', 'utah', 'vermont', 'virginia', 'washington', 'wisconsin', 'wyoming',
    'manhattan', 'brooklyn', 'queens', 'bronx', 'harlem', 'soho', 'tribeca', 'chelsea', 'hoboken', 'weehawken', 'edgewater', 'cliffside', 'fairview', 'ridgefield', 'ridgewood', 'leonia', 'englewood', 'teaneck', 'hackensack', 'paramus', 'bergenfield', 'dumont', 'palisades', 'closter', 'tenafly', 'cresskill', 'demarest', 'alpine',
    'boston', 'chicago', 'dallas', 'houston', 'phoenix', 'philadelphia', 'detroit', 'seattle', 'denver', 'miami', 'atlanta', 'portland', 'austin', 'nashville', 'memphis', 'baltimore',
    'orlando', 'tampa', 'jacksonville', 'charlotte', 'raleigh', 'columbus', 'indianapolis', 'milwaukee', 'st. louis', 'kansas city', 'denver', 'las vegas', 'salt lake city', 'sacramento', 'san jose', 'oakland', 'honolulu', 'anchorage'
]);

// TLD 기반 필터 (비상업 도메인)
const excludeTLDs = ['.edu', '.gov', '.mil', '.int', '.museum', '.aero'];

// [신규] 다국어 링크 탐색 필터 (연락처, 회사소개, 파트너사 등)
const LOCALIZED_FILTERS = {
    ko: {
        priority: ['문의', '연락', '소개', '파트너', '협력', '멤버', '지점', '매장', '오시는', '찾아', '회사', '정보'],
        exclude: ['로그인', '회원가입', '장바구니', '결제', '마이페이지', '공지사항', '이용약관', '개인정보']
    },
    ja: {
        priority: ['問い合', '連絡', '紹介', 'パートナー', '協力', 'メンバー', '支店', '店舗', 'アクセ', '案内', '会社', '情報'],
        exclude: ['ログイン', '新規登録', 'カート', '決済', 'マイページ', 'お知らせ', '利用規約', 'プライバシー']
    },
    en: {
        priority: ['contact', 'about', 'partner', 'member', 'branch', 'store', 'location', 'map', 'company', 'info', 'support', 'help'],
        exclude: ['login', 'signup', 'cart', 'checkout', 'mypage', 'notice', 'terms', 'privacy']
    }
};

// =====================================================
// [핵심] 비즈니스 상호명 필터 v4.0 (전면 재설계)
// 라인 단위 검색결과 감지 + 단어 단위 강력 필터
// =====================================================

// 한국어 블랙리스트
const KO_BLACKLIST = [
    // 업종 일반명사
    '카페', '맛집', '식당', '음식점', '가게', '상점', '마트', '슈퍼', '편의점', '약국', '병원', '의원', '치과', '한의원', '미용실', '헤어', '네일', '세탁소', '공장', '사무실', '회사', '학원', '교회', '성당', '절', '사찰',
    '꽃집', '꽃배달', '꽃가게', '빵집', '떡집', '고기집', '횟집', '술집', '노래방', '피시방', '찜질방', '세차장', '주유소', '주유기', '주차장', '놀이터', '도서관', '변호사', '법무사', '세무사', '회계사', '공인중개사', '부동산', '건축가', '디자인',
    '인테리어', '리모델링', '에어컨', '설비', '전기', '간판', '열쇠', '청소', '이사', '포장', '수리', '보수', '공사', '작업', '전문', '기술', '용역', '인력', '알바', '취업', '구인', '구직', '부품', '판매', '도소매',
    '전시장', '판매점', '대리점', '직영점', '가맹점', '전문점', '백화점', '쇼핑몰', '복합몰', '아울렛', '센터', '스테이션', '오피스', '빌딩', '타워',
    // 검색/리뷰/서비스
    '추천', '정보', '리뷰', '블로그', '뉴스', '후기', '기사', '영상', '사진', '보기', '더보기', '랭킹', '순위', '베스트', '인기', '핫플', '검색', '결과', '목록', '리스트',
    '신청', '예약', '문의', '주문', '배달', '배송', '택배', '수령', '반품', '교환', '환불', '결제', '구매', '구입', '판매', '쇼핑', '할인', '세일', '이벤트', '쿠폰', '적립',
    '체험단', '기자단', '협찬', '광고', '홍보', '커뮤니티', '게시판', '포럼', '공식', '웹사이트', '홈페이지', '블로그', '카페', '채널', '동영상',
    // 위치/시설
    '위치', '지도', '길찾기', '내비게이션', '오시는길', '찾아오시는길', '동네', '지역', '근처', '주변', '앞', '뒤', '옆', '건너편',
    '매장', '지점', '본점', '분점', '지사', '영업', '운영', '개점', '폐점', '종료', '휴무', '오픈', '시작', '마감',
    '메뉴', '가격', '영업시간', '주차', '전화', '번호', '주소', '연락처', '이용안내', '주차안내',
    // 지역명 (단독)
    '서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종', '경기도', '강원도', '충청북도', '충청남도', '전라북도', '전라남도', '경상북도', '경상남도', '제주도',
    '강남', '서초', '송파', '홍대', '이태원', '명동', '종로', '여의도', '신촌', '잠실', '반포', '압구정', '청담', '논현', '삼성', '대치', '도곡', '개포', '양재', '방배', '서당', '사당',
    // 일상어/조사/어미
    '좋아요', '좋아', '싫어', '좋겠', '있으면', '없으면', '했으면', '됐으면', '알려', '모르', '봤는데', '갔는데', '했는데', '같아요', '같아', '합니다', '입니다', '습니다',
    '감사', '고마워', '죄송', '미안', '부탁', '신경', '걱정', '기대', '실망',
    '그리고', '그래서', '하지만', '그러나', '그런데', '그렇게', '이렇게', '저렇게', '아마', '혹시', '정말', '진짜', '너무', '아주', '매우', '조금', '많이', '잘', '자주', '항상', '가끔',
    '이것', '그것', '저것', '여기', '거기', '저기', '이곳', '그곳',
    '안내', '소개', '공지', '사항', '이용', '방법', '시간', '요금', '무료', '유료', '할인', '특가', '신상', '최신', '날씨', '오늘', '내일', '어제', '올해', '지금', '현재',
    '위키백과', '나무위키', '위키피디아', '백과사전', '뉴스레터', '매체', '언론사'
];

// 일본어 블랙리스트 (v5.0 대폭 강화 — KO_BLACKLIST 수준)
const JA_BLACKLIST = [
    // === 업종 일반명사 ===
    'カフェ', '店', '店舗', 'レストラン', '食堂', '酒場', '居酒屋', '焼肉', '寿司', 'ラーメン', 'うどん', 'そば', '蕎麦', 'カレー', 'パン', 'ケーキ', 'スイーツ',
    '病院', '医院', '診療所', '薬局', '歯科', '歯医者', '眼科', '内科', '外科', '整形外科', '皮膚科', '小児科', '産婦人科', '耳鼻科', '泌尿器科', '精神科',
    '美容室', '美容院', '理容室', '理容院', '床屋', 'エステ', 'ネイル', 'マッサージ', 'サロン', 'スパ', 'リラクゼーション',
    'ホテル', '旅館', '民宿', 'ゲストハウス', 'ペンション', 'ホステル', '宿', '宿泊', '旅行', '観光',
    '学校', '塾', '予備校', '幼稚園', '保育園', '大学', '高校', '中学', '小学校', '専門学校', '語学',
    '神社', '寺', '寺院', '教会', 'モスク', '仏閣', '霊園', '墓地',
    '銀行', '信用金庫', '証券', '保険', '信託', '金融',
    '不動産', '建設', '工務店', '設計', 'デザイン', 'リフォーム', '建築', '土木',
    'コンビニ', 'スーパー', 'デパート', 'ショッピングモール', 'ドラッグストア', '百貨店', '量販店',
    '修理', '整備', 'クリーニング', '洗濯', '引越し', '運送', '配送', '宅配', '倉庫',
    '事務所', '営業所', '支店', '本店', '工場', '倉庫', '研究所', '本社', '本部',
    '弁護士', '税理士', '会計士', '司法書士', '行政書士', '社労士', 'コンサルタント',
    '犬', '猫', 'ペット', '動物', '鳥', '魚', '爬虫類',
    '車', 'タイヤ', 'レッカー', 'エアコン', '家電', '掃除', '害虫', '鍵', '塗装', '床', '家具', '水道', '電気', 'ガス',
    '散髪', '美容', '化粧品', '香水', 'アクセサリー', 'ジュエリー',
    '屋根', '外壁', '防水', '解体', '産廃', 'リサイクル',

    // === 自然/公園/施設 (공원/숲/자연) ===
    '公園', '庭園', '植物園', '動物園', '水族館', '遊園地', 'テーマパーク',
    '森', '森林', '林', '山', '丘', '峠', '岬', '崎', '島', '半島',
    '川', '河', '湖', '池', '沼', '沢', '滝', '渓谷', '峡谷', '渓流',
    '海', '海岸', '浜', '砂浜', 'ビーチ', '港', '湾', '入江',
    '温泉', '露天風呂', '銭湯', 'スキー場', 'ゴルフ場', 'キャンプ場', '釣り場',
    '橋', 'トンネル', 'ダム', '堤防', '灯台', '展望台', '展望',
    '広場', '通り', '商店街', '横丁', '路地', '小路',
    '城', '城跡', '遺跡', '古墳', '史跡', '名所', '旧跡', '文化財',
    '市役所', '区役所', '町役場', '村役場', '郵便局', '消防署', '警察署', '交番',
    '裁判所', '税務署', '法務局', 'ハローワーク',
    '図書館', '博物館', '美術館', '科学館', '記念館', 'ギャラリー',
    '体育館', 'プール', 'スタジアム', 'アリーナ', 'ドーム', 'グラウンド', '球場', '競技場',
    '映画館', '劇場', 'ホール', 'ライブハウス', 'カラオケ',
    '駅', '空港', '港', 'バス停', 'フェリー', 'ターミナル', 'インターチェンジ',

    // === 検索/レビュー/サービス (검색/리뷰/서비스) ===
    'おすすめ', '情報', 'レビュー', 'ブログ', 'ニュース', '予約', '問い合わせ', '場所', '地図', '感想', '記事', '動画', '写真',
    'メニュー', '価格', '営業', '駐車', '電話', '番号', '住所', 'アクセス', '人気', 'ランキング', '注文', '配達', '受取', '購入', '販売', '割引', 'セール', 'クーポン',
    '検索', '結果', '一覧', 'リスト', '口コミ', '評価', '紹介', '案内', 'お知らせ', '利用', '方法', '時間', '料金', '無料', '有料', '近く', '周辺', '最新', '比較',
    '体験', 'まとめ', '特集', '連載', 'コラム', 'インタビュー', '取材', 'ガイド', 'マニュアル', 'ハウツー',
    '申込', '申し込み', '登録', '退会', '解約', 'キャンセル', '変更', '確認', '送信', '受信',
    '広告', '宣伝', 'スポンサー', 'PR', 'プロモーション', 'キャンペーン', 'イベント',
    'ポイント', 'マイル', 'スタンプ', '景品', 'プレゼント', '懸賞', '抽選', '当選',
    'サイト', 'ページ', 'ホームページ', 'ウェブ', 'アプリ', 'ソフト', 'ツール', 'サービス', 'プラットフォーム',
    '公式', '非公式', '通販', 'オンライン', 'ネット', 'デジタル',
    'ウィキペディア', '百科事典', 'まとめサイト',

    // === 位置/方向/場所表現 (위치/방향) ===
    '位置', '場所', '地図', '道', '道路', '歩道', '交差点', '信号', '角',
    '近く', '周辺', '付近', '周囲', '近所', '近隣', '沿い', '沿線',
    '前', '後ろ', '横', '隣', '向かい', '反対側', '手前', '奥', '先',
    '右', '左', '上', '下', '中', '外', '内', '裏', '表', '頂上', '麓',
    '東', '西', '南', '北', '東側', '西側', '南側', '北側', '中央', '端',
    'こちら', 'そちら', 'あちら', 'どちら',
    '入口', '出口', '正面', '裏口', '階段', 'エレベーター', 'エスカレーター',

    // === 日常語/挨拶/感情 (일상어/인사/감정) ===
    'ありがとう', 'すみません', 'ごめん', 'ごめんなさい', 'お願い', 'よろしく',
    'おはよう', 'こんにちは', 'こんばんは', 'お疲れ', 'さようなら', 'おやすみ',
    '嬉しい', '楽しい', '悲しい', '辛い', '怖い', '寂しい', '恥ずかしい', '嫌',
    '美味しい', '不味い', '甘い', '辛い', '苦い', '酸っぱい', '塩辛い',
    '大きい', '小さい', '長い', '短い', '高い', '低い', '広い', '狭い', '深い', '浅い',
    '新しい', '古い', '若い', '暑い', '寒い', '熱い', '冷たい', '暖かい', '涼しい',
    '早い', '遅い', '速い', '太い', '細い', '厚い', '薄い', '重い', '軽い',
    '綺麗', '素敵', '可愛い', '格好いい', '面白い', 'つまらない',
    '難しい', '簡単', '便利', '不便', '安全', '危険', '大丈夫', '問題',

    // === 代名詞/指示詞/接続詞 (대명사/지시사/접속사) ===
    '私', '僕', '俺', '自分', 'あなた', 'あの', 'この', 'その', 'どの',
    'ここ', 'そこ', 'あそこ', 'どこ', 'いつ', 'どう', 'なぜ', 'なに', '何', '誰',
    'それ', 'これ', 'あれ', 'どれ', 'この人', 'その人', 'あの人',
    'しかし', 'でも', 'だけど', 'けれど', 'ただし', 'もっとも', 'なお',
    'そして', 'また', 'さらに', 'それから', 'つまり', 'すなわち', '要するに',
    'ところで', 'ちなみに', 'なぜなら', 'したがって', 'そのため', 'そこで', 'だから',
    'もし', 'たとえば', '例えば', 'つまり', 'いわゆる', 'いわば',

    // === 時間/天気/季節 (시간/날씨/계절) ===
    '今日', '明日', '昨日', '今週', '来週', '先週', '今月', '来月', '先月', '今年', '来年', '去年',
    '朝', '昼', '夕方', '夜', '深夜', '早朝', '午前', '午後', '正午', '夕暮れ', '日の出', '日の入り',
    '春', '夏', '秋', '冬', '季節', '梅雨', '台風', '雪', '雨', '晴れ', '曇り', '天気', '天候', '気温', '気候',
    '月曜', '火曜', '水曜', '木曜', '金曜', '土曜', '日曜', '祝日', '休日', '平日', '連休',

    // === 動詞(基本形/名詞形) (일반 동사) ===
    '行く', '来る', '帰る', '出る', '入る', '乗る', '降りる', '歩く', '走る', '止まる', '曲がる',
    '食べる', '飲む', '作る', '買う', '売る', '払う', '使う', '持つ', '置く', '取る', '送る', '届ける',
    '見る', '聞く', '話す', '読む', '書く', '学ぶ', '教える', '考える', '思う', '知る', '分かる', '感じる',
    '探す', '見つける', '選ぶ', '決める', '始める', '終わる', '続ける', '変える', '変わる',
    '待つ', '急ぐ', '休む', '寝る', '起きる', '遊ぶ', '楽しむ', '喜ぶ', '泣く', '笑う',
    '開く', '閉める', '開ける', '閉じる', '押す', '引く', '回す', '吸う', '吐く',
    '住む', '暮らす', '働く', '勤める', '稼ぐ', '貯める', '借りる', '貸す', '返す',

    // === 一般名詞 (일반 명사) ===
    '人', '人々', '人間', '男', '女', '子供', '大人', '若者', '高齢者', '家族', '友達', '仲間', '同僚', '上司', '部下',
    '仕事', '会議', '打ち合わせ', '商談', '出張', '残業', '休暇', '有給', '給料', '年収', '転職', '就職',
    '物', '事', '所', '点', '部分', '種類', '分類', '項目', '内容', '概要', '詳細', '全体', '一部',
    '問題', '課題', '質問', '回答', '答え', '解決', '原因', '結果', '理由', '目的', '効果', '影響',
    '意見', '考え', '気持ち', '感情', '印象', '雰囲気', '様子', '状態', '状況', '環境', '条件',
    '計画', '予定', '目標', '方針', '戦略', '対策', '手段', '手順', '段階', '過程', '基準', '規格',
    '話', '会話', '議論', '説明', '報告', '連絡', '相談', '通知', '発表', '宣言',
    '食事', '朝食', '昼食', '夕食', '夜食', 'おやつ', 'デザート', '飲料', 'ドリンク',
    '部屋', '空間', 'スペース', 'エリア', 'ゾーン', 'フロア', 'ブロック', 'セクション',
    '道具', '器具', '機器', '装置', '設備', '機械', '製品', '商品', '品物', 'グッズ', 'アイテム',
    '材料', '素材', '原料', '資源', 'エネルギー', '燃料',
    '色', '形', '大きさ', '重さ', '長さ', '幅', '高さ', '深さ', '量', '数',

    // === 地域/都市 (지역/도시 — 대폭 확장) ===
    '東京', '大阪', '京都', '横浜', '名古屋', '福岡', '札幌', '神戸', '広島', '仙台', '千葉', '埼玉',
    '新宿', '渋谷', '銀座', '六本木', '池袋', '品川', '上野', '浅草', '秋葉原', '原宿', '表参道', '恵比寿', '代官山', '中目黒', '自由が丘', '目黒', '五反田', '大崎',
    '丸の内', '大手町', '日本橋', '八重洲', '赤坂', '虎ノ門', '麻布', '青山', '白金', '芝', '汐留', '台場', 'お台場',
    '吉祥寺', '三鷹', '立川', '町田', '八王子', '府中', '調布', '国分寺', '小金井',
    '川崎', '藤沢', '鎌倉', '小田原', '箱根', '湘南', '横須賀',
    '大宮', '浦和', '川越', '所沢', '春日部', '草加', '越谷',
    '船橋', '柏', '松戸', '市川', '浦安', '成田', '木更津',
    '奈良', '和歌山', '滋賀', '大津', '堺', '枚方', '豊中', '吹田', '高槻', '茨木',
    '梅田', '難波', 'なんば', '心斎橋', '天王寺', '天神橋', '北浜', '本町', '淀屋橋',
    '博多', '天神', '中洲', '小倉', '久留米', '佐賀', '長崎', '熊本', '鹿児島', '宮崎', '大分', '別府',
    '那覇', '沖縄', '石垣', '宮古島',
    '金沢', '富山', '福井', '新潟', '長野', '松本', '軽井沢',
    '静岡', '浜松', '名古屋', '豊橋', '岐阜', '津', '四日市',
    '岡山', '倉敷', '松山', '高松', '徳島', '高知',
    '盛岡', '秋田', '山形', '福島', '郡山', '青森', '弘前',
    '函館', '旭川', '帯広', '釧路', '小樽', '富良野', '美瑛',

    // === 株式会社 등 법인/조직 ===
    '株式会社', '有限会社', '合同会社', '合資会社', '法人', '協会', '団体', '組合', '財団', '社団',
    'NPO', 'NGO', 'ボランティア',

    // === カウンター/助数詞 ===
    '個', '本', '枚', '台', '冊', '匹', '頭', '羽', '杯', '皿', '膳', '切れ', '束', '組', '足', '着', '人前'
];

// 영어 블랙리스트 (대폭 강화)
const EN_BLACKLIST = [
    // 업종/카테고리 일반명사 (단일/복수 포함)
    'dentists', 'dentist', 'dentistry', 'plumbers', 'plumber', 'plumbing', 'contractors', 'contractor', 'contracting',
    'electricians', 'electrician', 'electrical', 'roofing', 'roofers', 'roofer', 'attorneys', 'attorney',
    'lawyers', 'lawyer', 'legal', 'law', 'family', 'insurance', 'improvement', 'remodeling',
    'dogs', 'dog', 'cats', 'cat', 'pets', 'pet', 'repair', 'auto', 'cars', 'car', 'tires', 'tire',
    'towing', 'body', 'shops', 'mechanic', 'mechanics', 'barbers', 'barber', 'beauty', 'spa', 'spas',
    'skin', 'care', 'hair', 'removal', 'salon', 'salons', 'massage', 'nails', 'nail',
    'air', 'conditioning', 'hvac', 'heating', 'cooling', 'ventilation', 'appliances', 'appliance',
    'cleaners', 'cleaning', 'pest', 'control', 'locksmiths', 'locksmith', 'painters', 'painter',
    'painting', 'flooring', 'floor', 'cabinets', 'cabinet', 'makers', 'maker', 'home', 'improvement',
    'landscaping', 'landscapers', 'gardening', 'tree', 'service', 'services', 'pest', 'control',
    'movers', 'moving', 'storage', 'self-storage', 'hauling', 'junk', 'removal',
    'cafe', 'restaurant', 'restaurants', 'shop', 'shops', 'store', 'stores', 'market', 'markets', 'mall', 'malls',
    'center', 'centre', 'office', 'offices', 'building', 'tower', 'plaza', 'square', 'complex',
    'bar', 'bars', 'pub', 'pubs', 'grill', 'grills', 'diner', 'diners', 'bistro', 'eatery', 'eateries', 'takeout', 'takeaway',
    'bakery', 'bakeries', 'pizzeria', 'steakhouse', 'deli', 'buffet',
    'hospital', 'clinic', 'clinics', 'pharmacy', 'pharmacies', 'school', 'schools', 'church', 'churches',
    'bank', 'banks', 'hotel', 'hotels', 'motel', 'motels', 'hostel', 'salon', 'salons', 'spa', 'spas',
    'gym', 'gyms', 'park', 'parks', 'station', 'stations', 'airport', 'library', 'museum', 'theater', 'theatre',
    'gallery', 'studio', 'studios', 'lounge', 'club', 'clubs',
    // 플랫폼/디렉토리 브랜드 (사이트 자체 이름 제외)
    'yellow pages', 'yp', 'superpages', 'dexknows', 'yelp', 'tripadvisor', 'zillow', 'realtor', 'facebook', 'instagram', 'google', 'apple', 'amazon', 'microsoft',
    // 국적/요리 형용사 (검색결과 제목에 자주 등장)
    'korean', 'japanese', 'chinese', 'italian', 'mexican', 'thai', 'indian', 'french', 'american', 'vietnamese',
    'greek', 'turkish', 'spanish', 'german', 'brazilian', 'african', 'asian', 'european', 'mediterranean',
    'halal', 'vegan', 'vegetarian', 'organic', 'authentic', 'traditional', 'homemade', 'artisan', 'gourmet',
    // 검색/리뷰/서비스
    'best', 'top', 'info', 'review', 'reviews', 'rated', 'rating', 'ratings', 'blog', 'news', 'guide', 'guides',
    'order', 'book', 'booking', 'reserve', 'reservation', 'location', 'locations', 'map', 'maps',
    'contact', 'about', 'video', 'videos', 'photo', 'photos', 'image', 'images', 'picture', 'pictures',
    'more', 'menu', 'menus', 'price', 'prices', 'pricing', 'cost', 'costs', 'fee', 'fees',
    'opening', 'hours', 'closed', 'open', 'parking', 'phone', 'number', 'address', 'email',
    'get', 'direction', 'directions', 'navigation', 'route',
    'popular', 'famous', 'recommended', 'ranking', 'rankings', 'list', 'lists',
    'new', 'latest', 'trending', 'featured', 'updated', 'search', 'result', 'results', 'find', 'found', 'all', 'see', 'view',
    'near', 'nearby', 'around', 'close', 'closest', 'nearest', 'local', 'area', 'areas', 'region', 'city', 'town', 'county', 'state', 'country',
    'delivery', 'shipping', 'pickup', 'return', 'returns', 'refund', 'payment', 'purchase', 'sale', 'sales',
    'discount', 'discounts', 'coupon', 'coupons', 'deal', 'deals', 'offer', 'offers', 'free', 'cheap', 'affordable', 'expensive', 'budget',
    // 관사/접속사/전치사/대명사/조동사
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from',
    'up', 'out', 'off', 'if', 'as', 'so', 'no', 'not', 'nor', 'yet', 'both', 'either', 'neither',
    'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being', 'has', 'have', 'had', 'having',
    'do', 'does', 'did', 'will', 'would', 'can', 'could', 'should', 'may', 'might', 'shall', 'must',
    'it', 'its', 'me', 'my', 'mine', 'we', 'our', 'ours', 'you', 'your', 'yours',
    'he', 'she', 'his', 'her', 'hers', 'they', 'their', 'theirs', 'them',
    'this', 'that', 'these', 'those', 'what', 'where', 'when', 'which', 'how', 'why', 'who', 'whom', 'whose',
    // 일상어 (대량 추가)
    'hey', 'hello', 'hi', 'say', 'says', 'said', 'tell', 'told', 'definitely', 'totally', 'really',
    'here', 'there', 'everywhere', 'now', 'then', 'always', 'never', 'often', 'sometimes',
    'have', 'has', 'had', 'do', 'does', 'did', 'make', 'makes', 'made', 'get', 'gets', 'got', 'know', 'knows', 'knew',
    'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'years', 'days', 'weeks', 'months',
    'north', 'south', 'east', 'west', 'near', 'around', 'about', 'some', 'many', 'much', 'very', 'too',
    'good', 'great', 'nice', 'bad', 'like', 'love', 'hate', 'want', 'need', 'look', 'looking',
    'please', 'thank', 'thanks', 'sorry', 'help', 'try', 'tried', 'visit', 'visited', 'check', 'see',
    'today', 'tomorrow', 'yesterday', 'now', 'here', 'there', 'very', 'really', 'just', 'also', 'too', 'only', 'still', 'even', 'much', 'many', 'most', 'some', 'any', 'all', 'every', 'each',
    // 사업/서비스 관련
    'branch', 'branches', 'headquarter', 'headquarters', 'main', 'service', 'services', 'support',
    'feedback', 'subscribe', 'follow', 'share', 'comment', 'comments', 'post', 'posts', 'page', 'pages', 'site', 'website',
    // 기타 흔한 단어
    'food', 'foods', 'drink', 'drinks', 'eat', 'dining', 'cuisine', 'cuisines', 'meal', 'meals', 'dish', 'dishes',
    'place', 'places', 'spot', 'spots', 'joint', 'joints', 'stop', 'stops', 'destination', 'experience',
    'view', 'views', 'show', 'shows', 'way', 'thing', 'things', 'point', 'points', 'time', 'times', 'sign', 'join', 'continue',
    'right', 'left', 'back', 'front', 'side', 'next', 'last', 'first', 'second', 'third',
    'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
    'year', 'years', 'month', 'day', 'days', 'week', 'weeks', 'hour', 'minute', 'ago', 'since',
    'people', 'person', 'customer', 'customers', 'client', 'clients', 'user', 'users', 'owner', 'manager', 'staff', 'team', 'member', 'members',
    'make', 'made', 'give', 'gave', 'take', 'took', 'come', 'came', 'going', 'went', 'know', 'known', 'think', 'thought',
    'city', 'street', 'avenue', 'road', 'drive', 'lane', 'boulevard', 'highway',
    'wikipedia', 'encyclopedia',
    'windows', 'window', 'doors', 'door', 'roofs', 'roof', 'siding', 'gutters', 'gutter',
    'fireplace', 'fireplaces', 'chimney', 'snow', 'removal', 'plowing', 'mold', 'remediation', 'testing',
    'garbage', 'waste', 'trash', 'collection', 'hauling', 'recycling', 'sewer', 'septic', 'tanks', 'tank', 'drain', 'drains',
    'fences', 'fence', 'fencing', 'concrete', 'paving', 'asphalt', 'driveway', 'driveways',
    'deck', 'decks', 'patio', 'patios', 'pool', 'pools', 'sauna', 'saunas', 'hottub', 'hottubs',
    'security', 'alarm', 'alarms', 'cameras', 'camera', 'monitoring',
    'solar', 'energy', 'panels', 'wind', 'generator', 'generators',
    'handyman', 'maintenance', 'inspection', 'inspections', 'survey', 'surveys',
    'appraisal', 'appraisals', 'broker', 'brokers', 'agent', 'agents', 'realty',
    'logistics', 'freight', 'shipping', 'delivery', 'courier', 'couriers',
    // US States & Regions
    'alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado', 'connecticut', 'delaware', 'florida', 'georgia', 'hawaii', 'idaho', 'illinois', 'indiana', 'iowa', 'kansas', 'kentucky', 'louisiana', 'maine', 'maryland', 'massachusetts', 'michigan', 'minnesota', 'mississippi', 'missouri', 'montana', 'nebraska', 'nevada', 'new hampshire', 'new jersey', 'new mexico', 'new york', 'north carolina', 'north dakota', 'ohio', 'oklahoma', 'oregon', 'pennsylvania', 'rhode island', 'south carolina', 'south dakota', 'tennessee', 'texas', 'utah', 'vermont', 'virginia', 'washington', 'west virginia', 'wisconsin', 'wyoming', 'district of columbia', 'dc',
    'los angeles', 'san diego', 'san francisco', 'new york city', 'miami', 'chicago', 'houston', 'phoenix', 'philadelphia', 'dallas', 'orlando', 'sand Lake', 'lake buena vista', 'kissimmee', 'winter park', 'winter garden', 'apopka', 'oconee', 'altamonte springs',
    // [추가] 과감한 제외 키워드
    'major', 'appliance', 'appliances', 'repair', 'repairs', 'service', 'services', 'pro', 'pros',
    'concrete', 'paving', 'asphalt', 'sewer', 'septic', 'tanks', 'tank', 'drain', 'drains', 'cleaning',
    'mold', 'remediation', 'removal', 'restoration', 'damage', 'water', 'fire', 'smoke',
    'snow', 'plowing', 'removal', 'lawn', 'care', 'landscaping', 'tree', 'removal', 'stump',
    'garage', 'doors', 'door', 'gate', 'gates', 'fencing', 'fence', 'siding', 'gutters', 'gutter'
];

// =====================================================
// [DOM Discovery] 페이지 텍스트 직접 분석 기반 상호명 추출 (v30.0)
// =====================================================
// =====================================================
// [DOM Discovery] 페이지 텍스트 직접 분석 기반 상호명 추출 (v31.0)
// =====================================================
// =====================================================
// [AI Discovery] Gemini AI 기반 상호명 추출 (v33.0)
// =====================================================
async function discoverWithAI(tabId, keyword = '') {
    try {
        // 1. 페이지 텍스트 추출 (content.js에 메세지 전송)
        const results = await chrome.tabs.sendMessage(tabId, { action: "GET_PAGE_TEXT" });
        const text = results?.text || "";
        if (!text || text.length < 50) return [];

        // 2. AI 추출 수행
        const storage = await chrome.storage.local.get(['geminiApiKey']);
        const apiKey = storage.geminiApiKey;

        if (!apiKey) {
            logToPopup(tabId, "⚠️ Gemini API Key가 설정되지 않았습니다. 설정에서 키를 입력해주세요.");
            return [];
        }

        logToPopup(tabId, "🤖 Gemini AI가 상호명을 분석 중입니다...");
        const businesses = await getGeminiExtraction(text, keyword, apiKey);
        
        if (businesses && businesses.length > 0) {
            logToPopup(tabId, `✨ Gemini AI가 ${businesses.length}개의 상호명을 발견했습니다.`);
        }
        return businesses || [];
    } catch (err) {
        console.error('AI Discovery Error:', err);
        return [];
    }
}

async function getGeminiExtraction(text, keyword, apiKey) {
    try {
        const prompt = `
YOU ARE A HIGH-PRECISION DATA EXTRACTION ENGINE.
YOUR MISSION: EXTRACT AS MANY PURE BUSINESS NAMES (업체명) AS POSSIBLE FROM THE TEXT DUMP.

KEYWORD: "${keyword}"

CORE RULES:
1. **MAXIMUM YIELD**: A SEARCH PAGE TYPICALLY HAS 15-20 RESULTS. EXTRACT **EVERY** INDIVIDUAL BUSINESS ENTITY.
2. **PURITY**: EXTRACT ONLY THE BUSINESS NAME (E.G., "목포백련유치원"). DO NOT INCLUDE ADDRESSES OR PHONE NUMBERS HERE.
3. **HEADING PRIORITY**: PAY SPECIAL ATTENTION TO LINES STARTING WITH "[HEADING]".
4. **NO UI NOISE**: IGNORE "로그인", "이미지", "뉴스", "쇼핑", "지도", "Sort", "Option", "더보기".

OUTPUT FORMAT:
- RETURN ONLY A JSON ARRAY OF STRINGS: ["Name 1", "Name 2", "Name 3"]
- NO MARKDOWN, NO EXPLANATION, NO CODE BLOCKS.
- IF NONE FOUND, RETURN: []

TEXT DUMP:
---
${text.substring(0, 90000)}
---
`;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error("Gemini API Error:", errorData);
            return [];
        }

        const data = await response.json();
        let output = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        
        return extractJSONArray(output);
    } catch (e) {
        console.error("Gemini API Call Failed:", e);
        return [];
    }
}

/**
 * [v46.0] Safe JSON Extractor
 * Robustly isolates a JSON array from AI responses that might contain preamble/markdown.
 */
function extractJSONArray(text) {
    if (!text) return [];
    try {
        // [1] Standard Markdown cleanup
        let clean = text.replace(/```json|```/g, '').trim();
        
        // [2] Isolation: Find first [ and last ]
        const start = clean.indexOf('[');
        const end = clean.lastIndexOf(']');
        
        if (start !== -1 && end !== -1 && end > start) {
            clean = clean.substring(start, end + 1);
        }
        
        const parsed = JSON.parse(clean);
        if (Array.isArray(parsed)) {
            return parsed.map(s => String(s).trim()).filter(s => s.length >= 2).slice(0, 80);
        }
    } catch (e) {
        // Fallback: Naive line splitting for non-JSON responses
        return text.split('\n')
            .map(line => line.replace(/^[\d\.\-\s\[\]\"]+/, '').replace(/[\",\]]+$/, '').trim())
            .filter(name => name.length >= 2 && !name.includes('{'))
            .slice(0, 60);
    }
    return [];
}

// [v16.0] JA_BLACKLIST 보강 (noise_dictionary.js와 global_blacklist.js에서 로드된 세트 결합)
if (typeof JA_COMMON_NOUNS_SET !== 'undefined') {
    for (const item of JA_COMMON_NOUNS_SET) {
        JA_BLACKLIST.push(item);
    }
}
if (typeof GLOBAL_JA_SUBSTRING_BLACKLIST !== 'undefined') {
    for (const item of GLOBAL_JA_SUBSTRING_BLACKLIST) {
        JA_BLACKLIST.push(item);
    }
}

const COMMON_NOUNS = { ko: KO_BLACKLIST, ja: JA_BLACKLIST, en: EN_BLACKLIST, fr: EN_BLACKLIST, es: EN_BLACKLIST, de: EN_BLACKLIST, zh: JA_BLACKLIST };

// ========== 라인 레벨 필터: 검색결과 제목/리스트 라인 감지 ==========
// filtering functions moved to business_filters.js


// Filtering logic and utility functions have been moved to business_filters.js

// 2차 검색 URL (전역 유틸리티) - 위치 인식 검색 지원
function getSearchUrl2(bizName, gl, hl, context = '') {
    let suffix = ' 공식 홈페이지';
    if (gl === 'jp' || hl === 'ja') suffix = ' 公式サイト';
    else if (hl !== 'ko') suffix = ' official website';

    const searchQuery = (context ? context + ' ' : '') + bizName + suffix;
    const q = encodeURIComponent(searchQuery);

    // 구글 지역별 도메인 맵
    const googleTLDs = {
        'kr': 'co.kr',
        'jp': 'co.jp',
        'es': 'es',
        'de': 'de',
        'fr': 'fr',
        'it': 'it',
        'uk': 'co.uk',
        'us': 'com'
    };

    const tld = googleTLDs[gl] || 'com';
    const lang = hl || 'en';

    // 특정 비즈니스 언어/지역 강제 설정 (구글 재팬, 구글 스페인 등)
    return `https://www.google.${tld}/search?q=${q}&hl=${lang}&gl=${gl || 'us'}`;
}

// 검색엔진 도메인 제외 (전역 유틸리티)
function isSearchEngineDomain(url) {
    if (!url) return false;
    try {
        const h = new URL(url).hostname;
        return ['google.com', 'google.co', 'naver.com', 'yahoo.com', 'yahoo.co.jp', 'bing.com', 'daum.net', 'search.naver'].some(d => h.includes(d));
    } catch { return false; }
}

// === 통일된 3단계 딥 스캔 (전역 유틸리티) ===
async function deepScan3Stage(targets, sourceLabel, hl, gl, t) {
    sendLog(`📋 ${t('stage1Done')}: ${targets.length}${t('namesCollected')} [${sourceLabel}] ${t('stage2Start')}`);

    for (let i = 0; i < targets.length; i++) {
        if (isCancelled) break;
        const target = targets[i];
        const bizName = target.name;
        const sourceUrl = target.url || '';

        // ★ 검색 리스트 제목 필터: "The 40 Best Restaurants in NJ" 같은 제목 제외
        if (isSearchListingTitle(bizName)) {
            sendLog(t('log_skip_serp', { index: i + 1, total: targets.length, name: bizName }));
            continue;
        }

        // ★ [v10.0] 주소 제거 + 긍정 필터 최종 관문
        let cleanName = bizName;
        if (typeof stripAddressFromName === 'function') {
            cleanName = stripAddressFromName(bizName, hl);
        }
        if (cleanName && cleanName !== bizName) {
            target.name = cleanName;
        }
        const blacklist = [...(COMMON_NOUNS[hl] || COMMON_NOUNS['en'])];
        const feedback = { ruleId: '', reason: '', pass: false };
        if (!isViableBusinessName(cleanName || bizName, hl, blacklist, "", feedback)) {
            sendLog(t('log_skip_filter', { index: i + 1, total: targets.length, name: bizName, reason: feedback.reason ? `[Rule ${feedback.ruleId}] ${feedback.reason}` : t('log_skip_filter_default') }));
            continue;
        }
        if (typeof isAllCommonNouns === 'function' && isAllCommonNouns(cleanName || bizName, hl)) {
            sendLog(t('log_skip_common', { index: i + 1, total: targets.length, name: bizName }));
            continue;
        }

        const isHighFidelity = sourceUrl.includes('place.naver.com') || sourceUrl.includes('/place/g-');
        const isNaverSource = (sourceLabel || '').toLowerCase().includes('naver');

        // [v25.0] Force 2nd stage Google Korea Enrichment for KR region
        const isKR = (gl === 'kr' || hl === 'ko');
        
        let url2 = isHighFidelity ? sourceUrl : getSearchUrl2(bizName, gl, hl, target.context);
        let engineName2 = isHighFidelity ? 'High-Fidelity' : (gl === 'kr' ? 'Google Korea' : (gl === 'jp' ? 'Google Japan' : 'Google'));

        if (isNaverSource && !isHighFidelity) {
            url2 = getSearchUrl2(bizName, gl, hl, target.context);
            engineName2 = `Google Korea (Enrichment)`;
        }

        sendLog(`🔎 [${i + 1}/${targets.length}] "${bizName}" ${t('searching')} (${engineName2})`);
        let scan = await scanPageInBrowser(url2, 5000, bizName);

        const portalDomains = ['blog.naver.com', 'cafe.naver.com', 'tistory.com', 'brunch.co.kr', 'modoo.at', 'instagram.com'];
        let hasPortalHomepage = scan.homepage && portalDomains.some(d => scan.homepage.includes(d));

        // [v25.3] Enhanced Enrichment: Attempt enrichment if key data is missing (Phone, Address, or Real Homepage)
        const missingDetails = !scan.phone || !scan.address || scan.address === '-';
        const needsHomepage = !scan.homepage || hasPortalHomepage;

        if (missingDetails || needsHomepage) {
            sendLog(t('log_deep_discovery', { index: i + 1, total: targets.length, name: bizName }));
            
            // Construct a robust query: "Brand Context Official Website Address Phone"
            const queryContext = (target.context && target.context !== bizName) ? target.context : '';
            let suffix = ' 공식 홈페이지 주소 전화번호 위치';
            if (hl === 'ja' || gl === 'jp') suffix = ' 公式サイト 住所 電話番号';
            else if (hl === 'en' || gl === 'us') suffix = ' official website address phone';
            
            const searchQuery = `${bizName} ${queryContext} ${suffix}`.trim();
            const tld = gl === 'jp' ? 'co.jp' : (gl === 'kr' ? 'co.kr' : (gl === 'uk' ? 'co.uk' : 'com'));
            const googleSearchUrl = `https://www.google.${tld}/search?q=${encodeURIComponent(searchQuery)}&hl=${hl}&gl=${gl}`;
            
            sendLog(`  🔍 Enrichment Search (v26.0 KR Refined): ${searchQuery}`);
            const scanHome = await scanPageInBrowser(googleSearchUrl, 5000, bizName);

            // Merge results
            if (scanHome) {
                if (scanHome.homepage && (!scan.homepage || portalDomains.some(d => scan.homepage.includes(d)))) {
                    scan.homepage = scanHome.homepage;
                }
                if (!scan.address || scan.address === '-') scan.address = scanHome.address;
                if (!scan.phone) scan.phone = scanHome.phone;
                if (scanHome.emails && !scan.emails) scan.emails = scanHome.emails;
                
                if (scanHome.sns && scanHome.sns.length > 0) {
                    if (!scan.sns) scan.sns = [];
                    scanHome.sns.forEach(s => { if (!scan.sns.includes(s)) scan.sns.push(s); });
                }

                const foundCount = [scan.address, scan.phone, scan.homepage, scan.emails].filter(Boolean).length;
                sendLog(`  ✅ [${i + 1}/${targets.length}] Details Captured: ${foundCount} fields (Addr, Phone, Web, Email)`);
            }
        }

        // [v25.3] Targeted SNS/Social Search: If no SNS found yet, try a direct brand search for Instagram/FB
        if (!scan.sns || scan.sns.length === 0) {
            const snsQuery = `${bizName} instagram facebook`.trim();
            const snsUrl = `https://www.google.com/search?q=${encodeURIComponent(snsQuery)}&hl=${hl}&gl=${gl}`;
            const snsScan = await scanPageInBrowser(snsUrl, 4000, bizName);
            if (snsScan.sns && snsScan.sns.length > 0) {
                scan.sns = snsScan.sns;
                sendLog(`  📱 Social Discovery: Found ${snsScan.sns.length} profiles`);
            }
        }

        // ★ 홈페이지 유효성 검증: 플랫폼/제외 도메인이면 홈페이지를 버리고 Google 재검색
        let homepage = '';
        if (scan.homepage && !isSearchEngineDomain(scan.homepage)) {
            let isValid = true;
            try {
                if (typeof isLocalBusiness === 'function') {
                    isValid = isLocalBusiness(bizName, scan.homepage);
                }
            } catch (e) { isValid = true; } // Safety

            if (isValid) {
                homepage = scan.homepage;
            } else {
                sendLog(t('log_invalid_homepage', { name: bizName, url: scan.homepage }));
                scan.homepage = ''; // 버림
            }
        }


        // ★ Homepage가 없거나 버려진 경우 → Google 일반 검색으로 실제 홈페이지 찾기
        if (!homepage) {
            const googleTLDs = { 'kr': 'co.kr', 'jp': 'co.jp', 'es': 'es', 'de': 'de', 'fr': 'fr', 'it': 'it', 'uk': 'co.uk', 'us': 'com' };
            const gTld = googleTLDs[gl] || 'com';
            const googleUrl = `https://www.google.${gTld}/search?q=${encodeURIComponent(bizName)}&hl=${hl}&gl=${gl}`;
            sendLog(t('log_google_retry', { name: bizName, region: gl.toUpperCase() }));
            const googleScan = await scanPageInBrowser(googleUrl, 5000, bizName);

            let googleValid = false;
            try {
                if (googleScan.homepage && !isSearchEngineDomain(googleScan.homepage)) {
                    if (typeof isLocalBusiness === 'function') {
                        googleValid = isLocalBusiness(bizName, googleScan.homepage);
                    } else { googleValid = true; }
                }
            } catch (e) { googleValid = !!googleScan.homepage; }

            if (googleValid) {
                homepage = googleScan.homepage;
                if (!scan.address || scan.address === '-') scan.address = googleScan.address;
                if (!scan.phone) scan.phone = googleScan.phone;
                if (googleScan.emails) scan.emails = googleScan.emails;
                if (googleScan.sns && googleScan.sns.length > 0) scan.sns = googleScan.sns;
            }
        }

        let finalData = {
            name: bizName,
            address: scan.address || '-',
            homepage: homepage || '',
            sns: scan.sns ? scan.sns.join(', ') : '',
            emails: scan.emails || '',
            phone: scan.phone || ''
        };

        // 3차: 홈페이지 딥 스캔 (유효한 홈페이지가 있을 때만)
        if (homepage) {
            sendLog(`  🌐 ${t('stage3DeepScan')}: ${bizName} → ${homepage}`);
            const scan3 = await scanPageInBrowser(homepage, 5000, bizName);
            if (scan3.emails && !finalData.emails) finalData.emails = scan3.emails;
            if (scan3.phone && !finalData.phone) finalData.phone = scan3.phone;
            if (scan3.address && finalData.address === '-') finalData.address = scan3.address;
            if (scan3.sns && scan3.sns.length > 0 && !finalData.sns) finalData.sns = scan3.sns.join(', ');
        }

        // ★ 비즈니스는 항상 결과에 포함 (홈페이지 없어도 이름/주소/전화 정보만으로 가치 있음)
        chrome.runtime.sendMessage({ action: 'result', data: finalData });
        sendLog(t('log_item_success', { name: bizName, address: finalData.address, phone: finalData.phone || '-', url: homepage || '-' }));
        await new Promise(r => setTimeout(r, 500));
    }
}

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

let isSearching = false;
let isCancelled = false;
let searchQueue = [];

// 다국어 헬퍼 (전역)
async function getT() {
    const s = await chrome.storage.local.get('language');
    const hl = s.language || 'en';
    return (key, vars = {}) => {
        let str = (I18N_DATA[hl] && I18N_DATA[hl][key]) || (I18N_DATA['en'] && I18N_DATA['en'][key]) || key;
        for (const k in vars) str = str.replace(`{${k}}`, vars[k]);
        return str;
    };
}

function sendLog(msg) {
    const timestamp = new Date().toLocaleTimeString();
    const logObj = { action: 'log', message: msg, time: timestamp };
    chrome.runtime.sendMessage(logObj).catch(() => { });
    console.log(`[LOG][${timestamp}] ${msg}`);
}

chrome.runtime.onInstalled.addListener(() => {
    isSearching = false;
    isCancelled = false;
});

chrome.runtime.onStartup.addListener(() => {
    isSearching = false;
    isCancelled = false;
});

// =====================================================
// [핵심] executeScript allFrames로 네이버 지도 비즈니스 리스트 추출
// 모든 a 태그를 순회하며 .href(resolved URL)로 place ID 패턴 검사
// =====================================================
async function extractNaverMapBusinesses(tabId, waitMs = 10000) {
    const t = await getT();
    await new Promise(r => setTimeout(r, waitMs));

    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId: tabId, allFrames: true },
            func: () => {
                const businesses = [];
                const seenNames = new Set();
                const placeIdRegex = /\/\w+\/(\d{5,})/; // /카테고리/숫자ID 패턴

                // 모든 a 태그 순회 (.href = 브라우저가 절대 URL로 자동 변환)
                const allAnchors = document.querySelectorAll('a');

                for (const anchor of allAnchors) {
                    // .href는 resolved URL, getAttribute('href')는 원본 HTML 값
                    const resolvedUrl = anchor.href || '';
                    const rawHref = anchor.getAttribute('href') || '';

                    // place.naver.com의 비즈니스 링크인지 확인
                    // resolved URL에 place.naver.com이 있거나, 상대 경로가 /카테고리/숫자ID 패턴인지
                    const isPlaceLink = resolvedUrl.includes('place.naver.com') && placeIdRegex.test(resolvedUrl);
                    const isRelativePlaceLink = /^\/[a-zA-Z]+\/\d{5,}/.test(rawHref);

                    if (!isPlaceLink && !isRelativePlaceLink) continue;

                    // 최종 URL 결정
                    const placeUrl = isPlaceLink ? resolvedUrl :
                        (window.location.origin + rawHref);

                    // 부모 li 찾기
                    const li = anchor.closest('li');
                    const container = li || anchor.closest('div');
                    if (!container) continue;

                    const text = container.innerText || '';
                    if (text.length < 3 || text.length > 1500) continue;

                    // 상호명
                    let name = anchor.innerText.trim().split('\n')[0];
                    if (!name || name.length < 2) {
                        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 1);
                        name = lines[0] || '';
                    }
                    if (!name || name.length < 2 || name.length > 50) continue;

                    // UI 요소 제외
                    const uiWords = ['알림', '즐겨찾기', '설정', '로그인', 'MYBOX', '메뉴', '프로필',
                        '공지', '이벤트', '고객센터', '도움말', '더보기', '전체보기'];
                    if (uiWords.some(k => name.includes(k))) continue;

                    // 중복 체크
                    if (seenNames.has(name)) continue;
                    seenNames.add(name);

                    // 주소 (숫자 포함 도로명/지번)
                    let address = '';
                    const addrMatch = text.match(/([가-힣]+(시|도|구|군|동|읍|면)\s+[가-힣\d]+(로|길|동|리)\s*[\d-]+)/);
                    if (addrMatch) address = addrMatch[0].trim();

                    // 전화번호
                    const phoneMatch = text.match(/(02|0\d{1,2})-\d{3,4}-\d{4}/);
                    const phone = phoneMatch ? phoneMatch[0] : '';

                    // 카테고리
                    let category = '';
                    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 1);
                    for (const line of lines.slice(1, 6)) {
                        if (line.length > 2 && line.length < 20
                            && !line.match(/\d{2,}/) && !line.includes('-')
                            && line !== name && line !== address) {
                            category = line;
                            break;
                        }
                    }

                    businesses.push({ name, url: placeUrl, address: address || '-', phone, category });
                }

                return businesses;
            }
        });

        // 모든 프레임 합산 + 중복 제거
        const all = [];
        for (const r of results) {
            if (r.result && r.result.length > 0) {
                for (const item of r.result) {
                    all.push(item);
                }
            }
        }
        const unique = [...new Map(all.map(b => [b.name, b])).values()];
        sendLog(t('log_frame_scan_done', { frameCount: results.length, businessCount: unique.length }));
        return unique;
    } catch (e) {
        sendLog(t('log_naver_map_error', { msg: e.message }));
        return [];
    }
}

// =====================================================
// 수집 대상 이름 찾기 (DOM 분석)
// =====================================================

async function createOffscreenDocument() {
    if (await chrome.offscreen.hasDocument()) return;
    await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['WORKERS'],
        justification: 'OCR processing (Tesseract.js) requires a Worker environment which is provided by the offscreen context.'
    });
}

async function captureAndOCR(tabId, lang = 'kor') {
    try {
        await createOffscreenDocument();
        
        // 탭을 활성화해야 캡처 가능
        await chrome.tabs.update(tabId, { active: true });
        await new Promise(r => setTimeout(r, 1200)); // 렌더링 대기 강화

        const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
        if (!dataUrl) return "";

        const requestId = Date.now().toString() + Math.random().toString(36).substring(2);
        sendLog(`  📸 OCR Processing (${lang}) [Offscreen Bridge]...`);

        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                ocrRequests.delete(requestId);
                resolve("");
            }, 60000); // 60s timeout for OCR

            ocrRequests.set(requestId, (text) => {
                clearTimeout(timeout);
                resolve(text);
            });

            chrome.runtime.sendMessage({
                action: 'START_OCR',
                dataUrl,
                lang,
                requestId
            });
        });
    } catch (e) {
        sendLog(`  ❌ OCR Error: ${e.message}`);
        return "";
    }
}

// =====================================================
// [2차/3차] 개별 페이지를 브라우저 탭으로 열어 비즈니스 정보 추출
// =====================================================
async function scanPageInBrowser(targetUrl, waitMs = 6000, bizName = '') {
    let tab = null;
    try {
        tab = await chrome.tabs.create({ url: targetUrl, active: false });
        await new Promise(r => setTimeout(r, waitMs));

        const storage = await chrome.storage.local.get(['language', 'region', 'geminiKey']);
        const hl = storage.language || 'en', gl = storage.region || 'us';

        const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id, allFrames: true },
            func: (region, lang) => {
                const pageText = document.body ? document.body.innerText : '';
                const h = window.location.hostname;
                const isGoogle = h.includes('google.');
                const isNaver = h.includes('naver.com');

                let phone = '', address = '', homepage = '';
                
                // [v25.1] Search Engine Specific Detail Extraction (Prioritize over generic regex)
                if (isGoogle) {
                    // Google Knowledge Graph / Local Pack
                    const gAddr = document.querySelector('.L_ecrd_txt_addr, [data-atp], .L78S9c, .y35z8c, .W4P4ne .fontBodyMedium');
                    if (gAddr) address = gAddr.innerText.trim();
                    
                    const gTel = document.querySelector('.L_ecrd_txt_tel, [data-dtype="d3ph"] span, .Lrzyb, .uO797e');
                    if (gTel) phone = gTel.innerText.trim();
                    
                    const gWeb = document.querySelector('a.ab_button[href*="http"]:not([href*="google.com"]), a[data-footer-url*="http"], .yuRUbf a[href*="http"]');
                    if (gWeb) {
                        const href = gWeb.href || gWeb.getAttribute('data-footer-url');
                        if (href && !href.includes('google.')) homepage = href;
                    }
                } else if (isNaver) {
                    // Naver Place / Smart Block
                    const nAddr = document.querySelector('.place_address, .Pb4bU, .fds-vlist-base-item-sub-title, .LDvAH');
                    if (nAddr) address = nAddr.innerText.trim();
                    
                    const nTel = document.querySelector('.place_list_item_tel, .fds-vlist-base-item-tel, [class*="tel"], .xl88P');
                    if (nTel) phone = nTel.innerText.trim();
                    
                    const nWeb = document.querySelector('a.place_bluelink[href*="http"], a.fds-vlist-base-item-title a[href*="http"], a.CHmqa');
                    if (nWeb && !nWeb.href.includes('naver.com')) homepage = nWeb.href;
                }

                // === 이메일 (개인 로그인/기술용 이메일 제외) ===
                const emailSet = new Set();
                const uiSelectors = ['#header', '.gnb', '.login', '.profile', '.user', '.account', '.session', '.auth', '.member', '[class*="login"]', '[class*="profile"]', '[class*="user"]', '[class*="account"]', '[id*="login"]', '[id*="profile"]', '[id*="user"]', '[id*="account"]', '.footer', '#footer'];
                const bodyClone = document.body.cloneNode(true);
                uiSelectors.forEach(sel => bodyClone.querySelectorAll(sel).forEach(el => el.remove()));
                const cleanHtml = bodyClone.innerHTML.replace(/\s*[\[\(\{]at[\]\)\}]\s*/gi, '@').replace(/\s*[\[\(\{]dot[\]\)\}]\s*/gi, '.');
                
                const excludePrefixes = ['noreply', 'no-reply', 'admin', 'webmaster', 'postmaster', 'hostmaster', 'login', 'signin', 'signup', 'register', 'user', 'member', 'account', 'profile', 'session', 'token', 'anonymous', 'test', 'dev', 'developer', 'root', 'null', 'undefined', 'placeholder', 'mailer-daemon', 'support', 'help', 'info@google', 'info@naver', 'goodkie', 'feedback', 'contact@', 'marketing', 'sales', 'billing', 'privacy'];
                const excludeDomains = ['sentry.io', 'wixpress.com', 'example.com', 'test.com', 'localhost', 'sentry.', 'bugsnag.', 'newrelic.', 'datadog.', 'hotjar.', 'optimizely.', 'google.', 'naver.net', 'pstatic.net'];

                const emailMatches = cleanHtml.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
                if (emailMatches) emailMatches.forEach(e => {
                    const el = e.toLowerCase();
                    const prefix = el.split('@')[0];
                    if (/\.(png|jpg|gif|svg|css|js|ico)$/i.test(el)) return;
                    if (excludeDomains.some(d => el.includes(d))) return;
                    if (excludePrefixes.some(p => prefix === p || prefix.startsWith(p + '.'))) return;
                    emailSet.add(el);
                });

                // === Generic Fallback (If engine-specific extraction failed) ===
                if (!phone) {
                    const telLink = document.querySelector('a[href^="tel:"]');
                    if (telLink) phone = telLink.href.replace('tel:', '').trim();
                }
                if (!phone) {
                    const krPhone = pageText.match(/(02|0\d{1,2}|010|1588|1577|1544|1800|1600)-\d{3,4}-\d{4}/);
                    if (krPhone) phone = krPhone[0];
                }
                if (!phone) {
                    const intlPhone = pageText.match(/\+\d{1,3}[\s.-]?\(?\d{1,4}\)?[\s.-]?\d{2,4}[\s.-]?\d{3,4}/);
                    if (intlPhone) phone = intlPhone[0];
                }

                if (!address) {
                    const getKrAddr = () => {
                        // Improved pattern: covers variations of addresses with road names and building numbers
                        const m = pageText.match(/([가-힣]+(?:시|도|구|군|동|읍|면)\s+[가-힣\d]+(?:로|길|동|리)\s*[\d-]+(?:길|번길)?\s*[\d-]+)/);
                        if (m) return m[0].trim();
                        // Fallback for simpler patterns
                        const m2 = pageText.match(/([가-힣]+(?:시|도)\s+[가-힣]+(?:구|군)\s+[가-힣\d]+(?:동|읍|면|리))/);
                        return m2 ? m2[0].trim() : '';
                    };
                    const getEnAddr = () => {
                        const m = pageText.match(/\d+\s+[A-Z][a-zA-Z\s]+(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct|Place|Pl)[.,]?\s*[A-Za-z\s]*,?\s*[A-Z]{2}\s*\d{5}/);
                        return m ? m[0].trim() : '';
                    };
                    const getJpAddr = () => {
                        const m = pageText.match(/[都道府県].{1,8}[市区町村].{1,12}([\d-]+)|([市区町村].{1,12}[\d-]+(丁目|番地|号))/);
                        return m ? m[0].trim() : '';
                    };
                    if (region === 'kr') address = getKrAddr() || getEnAddr() || getJpAddr();
                    else if (region === 'jp') address = getJpAddr() || getEnAddr() || getKrAddr();
                    else address = getEnAddr() || getKrAddr() || getJpAddr();
                }

                const sns = new Set();
                const skipHomepage = ['naver.com', 'naver.me', 'naver.net', 'pstatic.net', 'google.com', 'google.co', 'googleapis.com', 'gstatic.com', 'yahoo.com', 'yahoo.co.jp', 'bing.com', 'daum.net', 'blog.naver.com', 'instagram.com', 'facebook.com', 'youtube.com', 'twitter.com', 'x.com', 'tiktok.com', 'apple.com', 'play.google.com', 'apps.apple.com'];
                const snsPatterns = [
                    { domain: 'instagram.com/', regex: /instagram\.com\/[a-zA-Z0-9_.]{2,}/ },
                    { domain: 'facebook.com/', regex: /facebook\.com\/[a-zA-Z0-9.]{2,}/ },
                    { domain: 'twitter.com/', regex: /twitter\.com\/[a-zA-Z0-9_]{2,}/ },
                    { domain: 'x.com/', regex: /x\.com\/[a-zA-Z0-9_]{2,}/ },
                    { domain: 'tiktok.com/@', regex: /tiktok\.com\/@[a-zA-Z0-9_.]+/ }
                ];
                document.querySelectorAll('a[href]').forEach(a => {
                    const href = a.href;
                    if (!href || !href.startsWith('http')) return;
                    for (const p of snsPatterns) {
                        if (href.includes(p.domain) && p.regex.test(href)) {
                            sns.add(href.split('?')[0]);
                            break;
                        }
                    }
                    if (!homepage && !skipHomepage.some(d => href.includes(d))) homepage = href;
                });

                const bizMatch = pageText.match(/([0-9]{3}-[0-9]{2}-[0-9]{5})/);
                const ownerMatch = pageText.match(/(?:대표자|대표|대표이사)[:\s]*([가-힣\s]{2,10})/);

                return {
                    emails: [...emailSet].join(', '),
                    phone, address, homepage,
                    sns: [...sns],
                    bizNumber: bizMatch ? bizMatch[1] : '',
                    owner: ownerMatch ? ownerMatch[1] : '',
                    rating: '',
                    category: '',
                    pageText: pageText.substring(0, 10000)
                };
            },
            args: [gl, hl]
        });

        // 모든 프레임 결과 합산 (가장 풍부한 데이터를 가진 프레임 사용)
        let best = { emails: '', phone: '', address: '', homepage: '', sns: [], bizNumber: '', owner: '', rating: '', category: '', pageText: '' };
        for (const r of results) {
            if (!r.result) continue;
            const d = r.result;
            if (d.emails && !best.emails) best.emails = d.emails;
            if (d.phone && !best.phone) best.phone = d.phone;
            if (d.address && !best.address) best.address = d.address;
            if (d.homepage && !best.homepage) best.homepage = d.homepage;
            if (d.sns && d.sns.length > best.sns.length) best.sns = d.sns;
            if (d.bizNumber && !best.bizNumber) best.bizNumber = d.bizNumber;
            if (d.owner && !best.owner) best.owner = d.owner;
            if (d.rating && !best.rating) best.rating = d.rating;
            if (d.category && !best.category) best.category = d.category;
            if (d.pageText && d.pageText.length > best.pageText.length) best.pageText = d.pageText;
        }

        return best;
    } catch (e) {
        return { emails: '', phone: '', address: '', homepage: '', sns: [], bizNumber: '', owner: '', rating: '', category: '', pageText: '' };
    } finally {
        if (tab) await chrome.tabs.remove(tab.id).catch(() => { });
    }
}

// =====================================================
// 메인 검색 엔진
// =====================================================

async function runEngineSearch(enginesArr, keyword, maxPages, collectEmails = false, mapAuto = false, deepPages = 2) {
    if (isSearching) {
        getT().then(t => sendLog(t('already_searching') || '⚠️ 이미 수집이 진행 중입니다. 잠시만 기다려주세요.'));
        return;
    }
    isSearching = true;
    isCancelled = false;

    const t = await getT();
    sendLog(t('log_preparing'));

    // [v52.0] Save current keyword to storage for content script filter awareness
    await chrome.storage.local.set({ currentKeyword: keyword });

    // [v40.0] Global Session Deduplication
    const sessionSeenNames = new Set();

    try {
        let engines = Array.isArray(enginesArr) ? enginesArr : [enginesArr];
        if (mapAuto) {
            const storageForMap = await chrome.storage.local.get(['language', 'region']);
            const mapLang = storageForMap.language || 'en';
            const mapRegion = storageForMap.region || 'us';
            let autoMapEngine = 'google_maps';
            if (mapLang === 'ko' || mapRegion === 'kr') autoMapEngine = 'naver_place';
            else if (mapLang === 'ja' || mapRegion === 'jp') autoMapEngine = 'yahoo_maps';
            engines = [...new Set([...engines, autoMapEngine])];
        }

        const storage = await chrome.storage.local.get(['language', 'region']);
        const hl = storage.language || 'en', gl = storage.region || 'us';

        for (const engine of engines) {
            if (isCancelled) break;
            sendLog(t('log_engine_start', { region: gl.toUpperCase(), lang: hl.toUpperCase() }));

            for (let page = 1; page <= maxPages; page++) {
                if (isCancelled) break;

                // 1차: 검색 URL 생성
                let searchUrl = '';
                const q = encodeURIComponent(keyword);
                const googleTLDs = {
                    'kr': 'co.kr',
                    'jp': 'co.jp',
                    'es': 'es',
                    'de': 'de',
                    'fr': 'fr',
                    'it': 'it',
                    'uk': 'co.uk',
                    'us': 'com'
                };
                const gTld = googleTLDs[gl] || 'com';

                if (engine === 'google') searchUrl = `https://www.google.${gTld}/search?q=${q}&start=${(page - 1) * 10}&hl=${hl}&gl=${gl}`;
                else if (engine === 'google_ai') searchUrl = `https://www.google.${gTld}/search?q=${encodeURIComponent(keyword + ' summary')}&hl=${hl}&gl=${gl}`;
                else if (engine === 'naver') searchUrl = `https://search.naver.com/search.naver?where=web&query=${q}&start=${(page - 1) * 10 + 1}`;
                else if (engine === 'naver_place') searchUrl = `https://place.naver.com/search?query=${q}`;
                else if (engine === 'google_maps') searchUrl = `https://www.google.${gTld}/maps/search/${q}?hl=${hl}&gl=${gl}`;
                else if (engine === 'yahoojp') searchUrl = `https://search.yahoo.co.jp/search?p=${q}&b=${(page - 1) * 10 + 1}`;
                else if (engine === 'yahoo_maps') searchUrl = `https://map.yahoo.co.jp/search?q=${q}`;
                else if (engine === 'bing') searchUrl = `https://www.bing.com/search?q=${q}&first=${(page - 1) * 10 + 1}`;
                else if (engine === 'bing_maps') searchUrl = `https://www.bing.com/maps?q=${q}`;
                else if (engine === 'yahoo') searchUrl = `https://search.yahoo.com/search?p=${q}&b=${(page - 1) * 10 + 1}`;
                else if (engine === 'yelp') searchUrl = `https://www.yelp.com/search?find_desc=${q}`;
                else if (engine === 'google_fb') searchUrl = `https://www.google.${gTld}/search?q=${encodeURIComponent(keyword + ' site:facebook.com')}&hl=${hl}&gl=${gl}`;
                else if (engine === 'google_li') searchUrl = `https://www.google.${gTld}/search?q=${encodeURIComponent(keyword + ' site:linkedin.com')}&hl=${hl}&gl=${gl}`;
                else if (engine === 'facebook') searchUrl = `https://www.facebook.com/search/pages/?q=${encodeURIComponent(keyword)}`;
                else if (engine === 'linkedin') searchUrl = `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(keyword)}`;
                else if (engine === 'amazon') searchUrl = `https://www.amazon.com/s?k=${encodeURIComponent(keyword)}`;
                else if (engine === 'etsy') searchUrl = `https://www.etsy.com/search?q=${encodeURIComponent(keyword)}`;
                else continue;

                const isMapEngine = engine.includes('maps');
                const isYahooMap = engine === 'yahoo_maps';
                const isNaverMap = engine === 'naver_maps';

                let tab = null;
                try {
                    tab = await chrome.tabs.create({ url: searchUrl, active: false });
                    sendLog(t('log_waiting_engine', { engine }));

                    // [v24.0] Explicitly trigger extraction for specific engines
                    // Give a small delay for content script injection
                    if (engine.includes('bing')) {
                        // [v25.0] Nuclear Injection Fallback
                        setTimeout(async () => {
                            try {
                                chrome.tabs.sendMessage(tab.id, { action: "extract" }, async (response) => {
                                    if (chrome.runtime.lastError) {
                                        sendLog(`  ☢️ Bing injection fallback triggered...`);
                                        await chrome.scripting.executeScript({
                                            target: { tabId: tab.id, allFrames: true },
                                            files: ["translations.js", "global_blacklist.js", "language_filters.js", "noise_dictionary.js", "business_filters.js", "content.js"]
                                        });
                                        // Try sending message again after manual injection
                                        setTimeout(() => chrome.tabs.sendMessage(tab.id, { action: "extract" }, () => { }), 1000);
                                    }
                                });
                            } catch (e) { }
                        }, 2500);
                    }

                    const timeout = isMapEngine ? 35000 : 20000;
                    let rawResults = await waitForEngineResult(tab.id, timeout, engine);

                    const storage = await chrome.storage.local.get(['extractionMode']);
                    const mode = storage.extractionMode || 'normal';
                    const isNaverWeb = (engine === 'naver');
                    const isNaverPlace = (engine === 'naver_place');

                    // [v46.0] AI Pursuit: Extraction based on mode or specific engine needs
                    if (mode === 'ai' || isNaverWeb || isNaverPlace || engine === 'google_ai') {
                        const traceMsg = (isNaverWeb || isNaverPlace) ? "🚀 Naver Deep Analysis starting (Total Visibility)" : "🤖 AI-Powered Discovery starting";
                        sendLog(`  ${traceMsg}...`);
                        
                        const discoveredNames = await discoverWithAI(tab.id, keyword);
                        if (discoveredNames && discoveredNames.length > 0) {
                            if (!rawResults) rawResults = [];
                            for (const name of discoveredNames) {
                                if (!rawResults.some(r => r.name === name) && !sessionSeenNames.has(name)) {
                                    rawResults.push({ name, url: '', isAi: true });
                                }
                            }
                        }
                    }

                    if (rawResults && rawResults.length > 0) {
                        sendLog(`  ✅ Received ${rawResults.length} raw results from page.`);
                        const targets = [];
                        const engineLang = hl || 'ko';
                        for (const r of rawResults) {
                            if (r.name && !sessionSeenNames.has(r.name)) {
                                // [v47.0] Strict Positive Filter: 2-4 words AND keyword inclusion
                                // [v49.0] Support for trimmed names
                                const feedback = { ruleId: '', reason: '', pass: false };
                                const filteredResult = isViableBusinessName(r.name, engineLang, [], keyword, feedback);
                                if (!filteredResult) {
                                    sendLog(t('log_skip_filter', { index: '?', total: '?', name: r.name, reason: feedback.reason ? `[Rule ${feedback.ruleId}] ${feedback.reason}` : t('log_skip_filter_default') }));
                                    continue;
                                }

                                const finalName = (typeof filteredResult === 'string') ? filteredResult : r.name;

                                // [v44.0] Standard noise listing filter
                                if (!r.isAi && isSearchListingTitle(finalName)) {
                                    sendLog(t('log_skip_serp', { index: '?', total: '?', name: finalName }));
                                    continue;
                                }
                                sessionSeenNames.add(finalName);
                                targets.push({ name: finalName, url: r.url });
                            }
                        }

                        if (targets.length > 0) {
                            await deepScan3Stage(targets, engine.toUpperCase(), hl, gl, t);
                        } else {
                            sendLog(`  ℹ️ All ${rawResults.length} results were already processed in this session.`);
                        }
                    } else {
                        sendLog(t('no_results', { engine }));
                    }
                } catch (e) {
                    sendLog(`⚠️ error: ${e.message}`);
                } finally {
                    if (tab) await chrome.tabs.remove(tab.id).catch(() => { });
                }
                chrome.runtime.sendMessage({ action: 'progress', percent: (page / maxPages) * 100 });
                await new Promise(r => setTimeout(r, 1000));
            }
        }
    } finally {
        isSearching = false;
        chrome.runtime.sendMessage({ action: 'complete' });
    }
}

// =====================================================
// [v4.0] 구조적 스마트 크롤링 (DOM 패턴 분석 → 딥 서치 연동)
// 1단계: 웹사이트 로딩 및 동적 콘텐츠 렌더링
// 2단계: 사이트 전용 셀렉터 및 범용 휴리스틱으로 상호명 추출
// 3단계: 추출된 리스트를 deepScan3Stage로 Google Korea 딥서치
// =====================================================
async function runWebsiteCrawl(startUrl, maxDepth) {
    if (isSearching) {
        sendLog('⚠️ 이미 크롤링 또는 수집이 진행 중입니다.');
        return;
    }
    const t = await getT();
    const storage = await chrome.storage.local.get(['language', 'region']);
    const hl = storage.language || 'ko';
    const gl = storage.region || 'kr';

    isSearching = true;
    isCancelled = false;
    sendLog(t('log_preparing'));

    try {
        if (!startUrl || !startUrl.startsWith('http')) {
            sendLog(`⚠️ Invalid URL: ${startUrl}`);
            return;
        }

        sendLog(t('log_smart_crawl_start', { url: startUrl }));

        let tab = null;
        try {
            tab = await chrome.tabs.create({ url: startUrl, active: false });
            sendLog(t('log_loading_list'));

            await new Promise(r => setTimeout(r, 4500));

            // 동적 콘텐츠 로드 유도 (Deep Scroll)
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: async () => {
                    const totalHeight = 6000;
                    for (let i = 1; i <= 10; i++) {
                        window.scrollTo(0, (totalHeight / 10) * i);
                        await new Promise(r => setTimeout(r, 400));
                    }
                    window.scrollTo(0, 0);
                }
            }).catch(() => { });

            await new Promise(r => setTimeout(r, 3000));

            const storageMode = await chrome.storage.local.get(['extractionMode']);
            const mode = storageMode.extractionMode || 'normal';

            sendLog(t('log_extracting_names') + ` (${mode.toUpperCase()} Mode)`);
            let rawNames = [];

            if (mode === 'ai') {
                rawNames = await discoverWithAI(tab.id, '');
            } else {
                const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    // [v4.1] 글로벌 노이즈 필터 (다국어 무시 예약어 리스트)
                    const globalNoise = {
                        ko: ['로그인', '회원가입', '공지사항', '고객센터', '메뉴', '전체보기', '더보기', '지도보기', '전화', '리뷰', '예약', '숙소', '필터', '초기화', '무료취소', '검색', '안내', '서울', '부산', '대구', '대전', '광주', '인천', '제주', '강원', '경기'],
                        en: ['Log in', 'Sign in', 'Sign up', 'Register', 'Notifications', 'Terms', 'Privacy', 'About Us', 'Contact', 'Home', 'Menu', 'Search', 'Filter', 'Next', 'Previous', 'Sort', 'Category', 'Help', 'London', 'Tokyo', 'Seoul', 'New York', 'Paris', 'Berlin', 'Italy', 'Japan', 'USA'],
                        ja: ['ログイン', 'マイページ', 'お知らせ', 'お問い合わせ', 'メニュー', '全て見る', '続きを見る', '地図', '電話', 'レビュー', '予約', '宿泊', 'フィルター', '検索', '案内', '東京', '大阪', '京都', '名古']
                    };

                    const host = window.location.hostname.toLowerCase();
                    const selectors = {
                        'yeogi.com': '.gc-thumbnail-type-seller-card h3, .list_title',
                        'yellowpages.com': 'a.business-name, .v-card .n a',
                        'yelp.com': 'h3 a[class*="css-"], .businessName__09f24__EYSwn',
                        'jalan.net': '.jln-hotel-name, .cassette-name',
                        'rakuten.co.jp': '.hotel_name, .title_box .name',
                        'daycarekorea.com': 'a[href*="_detail.php?name="]'
                    };

                    let foundNames = [];

                    // 1. 사이트 전용 선택자 우선순위
                    for (const [domain, selector] of Object.entries(selectors)) {
                        if (host.includes(domain)) {
                            document.querySelectorAll(selector).forEach(el => {
                                const txt = el.innerText.trim();
                                if (txt.length >= 2) foundNames.push({ text: txt, priority: 100 });
                            });
                        }
                    }

                    // 2. 범용 휴리스틱 추출 (시각적 속성 고려)
                    if (foundNames.length < 5) {
                        const candidates = document.querySelectorAll('h1, h2, h3, h4, strong, a.title, [class*="name"], [class*="title"], td a, li a, a[href*="detail"]');
                        candidates.forEach(el => {
                            const rect = el.getBoundingClientRect();
                            if (rect.width < 50 || rect.height < 10) return; // 너무 작거나 보이지 않는 요소 패스

                            const style = window.getComputedStyle(el);
                            const fontSize = parseFloat(style.fontSize);
                            const text = el.innerText.trim();

                            // 상호명 조건: 2~45자 사이, 적정 폰트 크기
                            if (text.length >= 2 && text.length <= 45 && fontSize >= 14) {
                                // 전역 노이즈 필터링 (다국어 통합)
                                let isNoise = false;
                                for (const lang in globalNoise) {
                                    if (globalNoise[lang].some(word => text === word || text.includes(word + ' '))) {
                                        isNoise = true;
                                        break;
                                    }
                                }

                                if (!isNoise) {
                                    foundNames.push({ text, priority: fontSize });
                                }
                            }
                        });
                    }

                    // 중복 제거 및 우선순위 정렬 (점수 높은 순)
                    const unique = [];
                    const seen = new Set();
                    foundNames.sort((a, b) => b.priority - a.priority).forEach(item => {
                        const normalized = item.text.replace(/\s+/g, ' ').toLowerCase();
                        if (!seen.has(normalized)) {
                            seen.add(normalized);
                            unique.push(item.text);
                        }
                    });

                    // 불필요한 공통 접두사/순번 제거
                    return unique
                        .map(n => n.replace(/^[-*•\d.]+\s*/, '').trim())
                        .filter(n => n.length >= 2 && n.length < 50)
                        .slice(0, 45);
                }
            }).catch(() => []);
                rawNames = results?.[0]?.result || [];
            }

            // [v28.0] KR OCR Website Crawling Implementation
            if (gl === 'kr' || hl === 'ko') {
                sendLog(`  🚀 KR OCR Website Discovery starting...`);
                const ocrText = await captureAndOCR(tab.id, 'kor');
                if (ocrText) {
                    const ocrLines = ocrText.split('\n').map(l => l.trim()).filter(l => l.length >= 2);
                    for (const line of ocrLines) {
                        const words = line.split(/\s+/).filter(w => w.length > 0);
                        if (words.length >= 2 && words.length <= 3) {
                            if (isViableBusinessName(line, 'ko')) {
                                if (!rawNames.includes(line)) rawNames.push(line);
                            }
                        }
                    }
                }
            }

            sendLog(t('log_dom_candidates', { count: rawNames.length }));

            if (rawNames.length === 0) {
                sendLog(t('no_valid_names'));
                return;
            }

            // ★ [v11.0] 초강력 통합 필터 적용 (Search Engine 모드와 동일한 파이프라인)
            const blacklist = [...(COMMON_NOUNS[hl] || COMMON_NOUNS['en'])];
            const filteredNames = rawNames.filter(n => {
                let name = n.trim();
                if (!name || name.length < 2 || name.length > 50) return false;

                // 1) 검색 리스트/UI 제목 필터 (홈, 메뉴, 공지사항 등 차단)
                if (isSearchListingTitle(name)) return false;

                // 2) 주소 제거 및 이름 정제
                if (typeof stripAddressFromName === 'function') {
                    name = stripAddressFromName(name, hl);
                }
                if (!name || name.length < 2) return false;

                // 3) 글로벌 블랙리스트 (정확 일치)
                const lower = name.toLowerCase();
                if (GLOBAL_BLACKLIST_SET && GLOBAL_BLACKLIST_SET.has(lower)) return false;

                // 4) 숫자/특수문자만 있는 경우 제외
                if (/^[\d\-+().\s#@%$&*]+$/.test(name)) return false;

                // 5) [핵심] isViableBusinessName (v10.2+ 긍정 필터)
                if (!isViableBusinessName(name, hl, blacklist)) return false;

                // 6) isAllCommonNouns 최종 확인 (일반명사 100% 조합 차단)
                if (typeof isAllCommonNouns === 'function' && isAllCommonNouns(name, hl)) return false;

                return true;
            }).map(n => {
                let name = n.trim();
                if (typeof stripAddressFromName === 'function') name = stripAddressFromName(name, hl);
                return name;
            });

            sendLog(t('log_filter_after', { count: rawNames.length, valid: filteredNames.length }));

            if (filteredNames.length === 0) {
                sendLog(t('no_valid_names'));
                return;
            }

            sendLog(t('log_items_received', { count: filteredNames.length }));
            const targets = filteredNames.map(n => ({ name: n, context: '', url: '' }));

            // 딥서치 엔진 연동
            await deepScan3Stage(targets, 'STRUCTURAL_CRAWL', hl, gl, t);

        } catch (e) {
            sendLog(`❌ Crawling error: ${e.message}`);
        } finally {
            if (tab) await chrome.tabs.remove(tab.id).catch(() => { });
        }
    } catch (e) {
        sendLog(`❌ Error: ${e.message}`);
    } finally {
        isSearching = false;
        chrome.runtime.sendMessage({ action: 'complete' });
    }
}



// 텍스트 리스트 기반 검색 (3단계 딥 스캔 적용)
// [v4.1] 글로벌 정밀 필터링 + 스펠링 보존 적용
async function startSearchProcess(rawText, collectEmails = false) {
    if (isSearching) return;
    isSearching = true;

    const storage = await chrome.storage.local.get(['language', 'region']);
    const hl = storage.language || 'en';
    const gl = storage.region || 'us';
    const t = await getT();

    isCancelled = false;
    sendLog(t('log_text_start_init', { count: rawText.length })); // [v19.0] Early confirmation log

    try {
        const storageMode = await chrome.storage.local.get(['extractionMode', 'geminiApiKey']);
        const mode = storageMode.extractionMode || 'normal';
        let names = [];

        if (mode === 'ai' && storageMode.geminiApiKey) {
            sendLog("🤖 AI Mode: Analyzing text with Gemini...");
            // We use a small dummy tab for AI analysis of raw text if needed, 
            // but for "Text Data" tab, we can call the API directly or reuse getGeminiExtraction.
            names = await getGeminiExtraction(rawText, "General Extraction", storageMode.geminiApiKey);
        } else {
            names = extractProperNouns(rawText, hl);
        }

        let targets = names.map(n => ({ name: n, context: '', url: '' }));

        // [v4.1.2] 3000+ 항목 글로벌 블랙리스트 후처리 (global_blacklist.js)
        const blacklist = hl === 'ja' ? (typeof JA_BLACKLIST !== 'undefined' ? JA_BLACKLIST : []) :
            (hl === 'ko' ? (typeof KO_BLACKLIST !== 'undefined' ? KO_BLACKLIST : []) : []);
        const beforeCount = targets.length;
        targets = targets.filter(t => {
            let name = t.name.trim();
            const lower = name.toLowerCase();
            if (GLOBAL_BLACKLIST_SET && GLOBAL_BLACKLIST_SET.has(lower)) return false;
            if (name.length < 2 || name.length > 50) return false;
            if (/^[\d\-+().\s#@%$&*]+$/.test(name)) return false;

            if (typeof stripAddressFromName === 'function') {
                name = stripAddressFromName(name, hl);
                t.name = name;
            }
            if (!name || name.length < 2) return false;

            if (!isViableBusinessName(name, hl, blacklist)) return false;
            if (typeof isAllCommonNouns === 'function' && isAllCommonNouns(name, hl)) return false;

            return true;
        });
        sendLog(t('log_filter_after', { count: beforeCount, valid: targets.length }));

        if (targets.length === 0) {
            sendLog(t('no_valid_names'));
            isSearching = false;
            chrome.runtime.sendMessage({ action: 'complete' });
            return;
        }

        sendLog(t('log_text_start', { count: targets.length }));

        try {
            await deepScan3Stage(targets, 'TEXT_LIST', hl, gl, t);
        } finally {
            isSearching = false;
            chrome.runtime.sendMessage({ action: 'complete' });
        }
    } catch (error) {
        console.error("Search Process Error:", error);
        sendLog("❌ Error: " + (error.message || error));
        isSearching = false;
        chrome.runtime.sendMessage({ action: 'complete' });
    }
}

// 메시지 리스너
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'startEngineSearch') {
        runEngineSearch(request.engines, request.keyword, request.maxPages, request.collectEmails, request.mapAuto, request.deepPages);
    } else if (request.action === 'startSearch') {
        startSearchProcess(request.text, request.collectEmails);
    } else if (request.action === 'startCrawl') {
        runWebsiteCrawl(request.url, request.depth);
    } else if (request.action === 'log') {
        sendLog(request.message);
    } else if (request.action === 'cancelSearch') {
        isCancelled = true;
        isSearching = false;
        getT().then(t => sendLog(t('log_cancelled')));
    } else if (request.action === 'OCR_RESULT') {
        // Obsolete (Removed for DOM Discovery Engine)
    }
});



// waitForEngineResult (content.js 메시지 대기)
// naverMaps = true면 pcmap.place.naver.com에서 온 결과만 수신 (메인 프레임 무시)
function waitForEngineResult(tabId, timeout, engine = '') {
    const naverMaps = engine === 'naver_maps';
    const yahooMaps = engine === 'yahoo_maps';
    return new Promise(resolve => {
        let items = [];
        let timer = null;
        const finish = () => {
            if (timer) clearTimeout(timer);
            chrome.runtime.onMessage.removeListener(handler);
            // 이름 기반 중복 제거 (URL이 없는 경우도 많으니)
            const unique = [...new Map(items.map(i => [i.name || i.url, i])).values()];
            resolve(unique);
        };
        const handler = (m, s) => {
            if (s.tab && s.tab.id === tabId) {
                // [v24.0] Handle Heartbeats / Status updates
                if (m.action === 'engineStatus') {
                    if (m.status === 'loaded' || m.status === 'waiting') {
                        sendLog(`  💓 [${engine}] Status: ${m.status}${m.retry ? ` (Retry ${m.retry}/4)` : ''} [${m.isMainFrame ? 'Main' : 'Iframe'}]`);

                        // ONLY reset/control lifecycle based on MAIN frame
                        if (m.isMainFrame && timer) {
                            clearTimeout(timer);
                            const resetGrace = engine.includes('maps') ? 12000 : 5000;
                            timer = setTimeout(finish, resetGrace);
                        }
                    }
                    return;
                }

                if (m.action === 'engineSearchResult' || m.action === 'portalResult') {
                    let rs = m.results || m.links || [];
                    sendLog(`  📩 Message Received from ${s.tab.id} (Action: ${m.action}, Items: ${rs.length})`);
                    
                    const senderUrl = s.url || m.frameUrl || '';
                    let senderHost = 'unknown';
                    try { senderHost = new URL(senderUrl).hostname; } catch (e) {}

                    // ... (keep navigation filtering logic same) ...
                    if (naverMaps) {
                        if (!senderUrl.includes('pcmap.place.naver.com') && !senderUrl.includes('map.naver.com/p/search')) return;
                    } else if (yahooMaps) {
                        if (!senderUrl.includes('map.yahoo.co.jp') && !senderUrl.includes('search.yahoo.co.jp')) {
                            if (!senderUrl.includes('yahoo.co.jp')) return;
                        }
                    } else if (engine === 'bing_maps') {
                        if (!senderUrl.includes('bing.com/maps') && !senderUrl.includes('bing.com/search')) return;
                    }

                    rs = m.results || m.links || [];
                    if (rs.length > 0) {
                        sendLog(`  📥 [Frame:${senderHost}${m.isMainFrame ? ':Main' : ''}] Received ${rs.length} items`);
                        items = [...items, ...rs];

                        // [v25.0] Only MAIN frame results can reset the collection delay
                        if (m.isMainFrame) {
                            if (timer) clearTimeout(timer);
                            timer = setTimeout(finish, 4000);
                        }
                    } else if (m.action === 'engineSearchResult') {
                        // [v25.0] CRITICAL: Only allow MAIN frame to trigger an early exit
                        if (!m.isMainFrame) {
                            sendLog(`  ℹ️ [Iframe:${senderHost}] Zero items - Ignoring lifecycle control.`);
                            return;
                        }

                        const isMap = engine.includes('maps');
                        if (!isMap) {
                            if (timer) clearTimeout(timer);
                            const smallGrace = engine === 'bing' ? 5000 : 1000;
                            timer = setTimeout(finish, smallGrace);
                        } else {
                            if (timer) clearTimeout(timer);
                            timer = setTimeout(finish, 12000);
                            sendLog(`  ⏳ [MainFrame] Waiting for Map hydration (12s grace)...`);
                        }
                    }
                }
            }
        };
        chrome.runtime.onMessage.addListener(handler);
        setTimeout(finish, timeout + 5000);
    });
}


/**
 * [v10.0] 고유명사(업소명) 추출 엔진
 * 텍스트 뭉치에서 일본어, 한국어, 영어 업소명 후보를 추출합니다.
 */
function extractProperNouns(rawText, hl) {
    if (!rawText) return [];

    // [v19.0] 정규식 확장 (JP/KO/EN 지원 - 일본어 범위 보강)
    // 히라가나(\u3040-\u309F), 가타카나(\u30A0-\u30FF), 한자, 한글, 영어 포함 2~50자
    const nameRegex = /([a-zA-Z0-9가-힣\u3040-\u309F\u30A0-\u30FF一-龠][a-zA-Z0-9가-힣\u3040-\u309F\u30A0-\u30FF一-龠\s&・\-\/]{0,48}[a-zA-Z0-9가-힣\u3040-\u309F\u30A0-\u30FF一-龠])/g;

    const lines = rawText.split(/[\n\r,;]+/);
    let results = [];

    lines.forEach(line => {
        const trimmed = line.trim();
        if (trimmed.length < 2) return;

        // 1) 전체 줄이 하나의 이름인 경우 (가장 흔함)
        if (trimmed.length <= 50) {
            results.push(trimmed);
        } else {
            // 2) 긴 텍스트에서 패턴 추출
            const matches = trimmed.match(nameRegex);
            if (matches) {
                matches.forEach(m => {
                    const cleanM = m.trim();
                    if (cleanM.length >= 2) results.push(cleanM);
                });
            }
        }
    });

    // [v28.0] KR-specific 2-3 word rule enforcement for Text Lists
    if (hl === 'ko' || hl === 'kr') {
        const koBlacklist = new Set(KO_BLACKLIST || []);
        results = results.filter(r => {
            const words = r.trim().split(/\s+/).filter(w => w.length > 0);
            if (words.length < 2 || words.length > 3) return false;
            // Use common validator
            return isViableBusinessName(r, 'ko', Array.from(koBlacklist));
        });
    } else if (hl === 'ja') {
        results = results.filter(r => {
            if (/[0-9]/.test(r)) return false;
            if (/[都道府県].{1,8}[市区町村]/.test(r)) return false;
            if (r.length > 25 && !/(株式会社|有限회사|クリニック|病院|歯科)/.test(r)) return false;
            return true;
        });
    }

    // 중복 제거
    return [...new Set(results)];
}

// Address and category utilities moved to business_filters.js

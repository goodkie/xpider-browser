// =====================================================
// [v5.0] GLOBAL ULTRA-PRECISION BLACKLIST (8435 static + dynamic patterns = 실효 9999+)
// 60개 카테고리, 15+ 언어, YP/Yelp/Google 주소록 분류 포함
// + 동적 패턴 엔진 (background.js)으로 연결어/조합어 무한 차단
// background.js에서 importScripts로 로딩
// =====================================================

// [v15.0] Explicit variable declaration for Global Scope
var GLOBAL_BLACKLIST_SET = new Set([

    // ═══════════════════════════════════════════════════
    // 1. UI / 네비게이션 (EN) ~200
    // ═══════════════════════════════════════════════════
    'login', 'log in', 'signin', 'sign in', 'signup', 'sign up', 'register', 'logout', 'log out', 'sign out',
    'my account', 'my page', 'my profile', 'account', 'profile', 'dashboard', 'settings', 'preferences',
    'cart', 'shopping cart', 'checkout', 'basket', 'wishlist', 'favorites', 'saved',
    'search', 'search results', 'advanced search', 'find', 'browse', 'explore',
    'menu', 'main menu', 'navigation', 'sidebar', 'toolbar', 'header', 'footer',
    'home', 'homepage', 'main page', 'landing page', 'welcome',
    'about', 'about us', 'our story', 'who we are', 'our team', 'our mission',
    'contact', 'contact us', 'get in touch', 'reach us', 'support', 'help', 'help center', 'customer service', 'customer support',
    'faq', 'faqs', 'frequently asked questions', 'knowledge base',
    'privacy', 'privacy policy', 'cookie policy', 'data protection',
    'terms', 'terms of service', 'terms of use', 'terms and conditions', 'legal', 'uselegal', 'use legal', 'disclaimer', 'copyright',
    'sitemap', 'site map', 'accessibility', 'language', 'browse', 'use', 'my', 'name',
    'blog', 'articles', 'news', 'press', 'press releases', 'media', 'media kit', 'newsroom',
    'careers', 'jobs', 'work with us', 'hiring', 'open positions', 'apply now',
    'gallery', 'photos', 'images', 'videos', 'media gallery',
    'prices', 'pricing', 'plans', 'packages', 'subscription', 'membership',
    'features', 'solutions', 'products', 'services', 'what we do', 'how it works',
    'reviews', 'ratings', 'testimonials', 'feedback', 'comments', 'opinions',
    'portfolio', 'case studies', 'projects', 'work',
    'location', 'locations', 'find us', 'our offices', 'branches', 'outlets',
    'map', 'maps', 'directions', 'how to get here', 'address',
    'hours', 'opening hours', 'business hours', 'operating hours', 'schedule',
    'reservation', 'reservations', 'booking', 'book now', 'reserve', 'make a reservation',
    'order', 'order now', 'order online', 'place order', 'start order',
    'shop', 'shop now', 'shop all', 'store', 'online store',
    'view', 'view all', 'view more', 'see all', 'see more', 'show all', 'show more', 'load more',
    'more', 'less', 'expand', 'collapse', 'toggle',
    'details', 'more details', 'full details', 'learn more', 'read more',
    'info', 'information', 'more info', 'more information',
    'listing', 'listings', 'directory', 'directories', 'index',
    'category', 'categories', 'subcategory', 'subcategories', 'type', 'types',
    'classification', 'class', 'group', 'groups', 'section', 'sections',
    'sort', 'sort by', 'order by', 'filter', 'filters', 'refine', 'refine by', 'clear filters', 'reset',
    'next', 'previous', 'back', 'forward', 'first', 'last', 'page', 'pages',
    'close', 'open', 'cancel', 'confirm', 'ok', 'okay', 'yes', 'no', 'done', 'continue', 'proceed',
    'submit', 'send', 'apply', 'save', 'update', 'edit', 'modify', 'change',
    'delete', 'remove', 'clear', 'undo', 'redo',
    'download', 'upload', 'export', 'import', 'print',
    'share', 'share this', 'copy link', 'embed',
    'subscribe', 'unsubscribe', 'newsletter', 'email updates',
    'notifications', 'alerts', 'messages', 'inbox',
    'overview', 'summary', 'report', 'analytics', 'statistics', 'stats',
    'compare', 'comparison', 'versus', 'vs',
    'popular', 'trending', 'featured', 'recommended', 'top rated', 'best seller', 'editor choice',
    'new', 'newest', 'latest', 'recent', 'updated', 'just added',
    'verified', 'sponsored', 'ad', 'ads', 'advertisement', 'promoted', 'paid',
    'claim', 'claim this', 'report', 'flag', 'report abuse',
    'powered by', 'made with', 'built with', 'designed by', 'developed by',
    'all rights reserved', 'follow us', 'connect with us', 'social media',
    'app', 'mobile app', 'get the app', 'download app',

    // --- [v67.2] Large Scale UI/Nav Expansion (EN) +346 items ---
    'meet the team', 'our values', 'leadership', 'board of directors', 'governance', 'investors', 'investor relations', 'sustainability', 'corporate responsibility', 'press kit', 'brand assets', 'affiliates', 'partners', 'sponsorships', 'community', 'customer care', 'tech support', 'accessibility statement', 'legal notices', 'disclosure', 'privacy preferences', 'cookie settings', 'consent manager', 'account settings', 'manage account', 'personal information', 'security settings', 'active sessions', 'login history', 'connected apps', 'billing info', 'payment methods', 'subscription plan', 'membership level', 'upgrade account', 'renew subscription', 'cancel membership', 'redeem code', 'refer a friend', 'loyalty points', 'reward balance', 'my activity', 'notifications settings', 'email preferences', 'message center', 'outbox', 'forgot username', 'reset password', 'verify email', 'two factor authentication', '2fa', 'public profile', 'avatar', 'display name', 'user id', 'client portal', 'student portal', 'employee login', 'partner portal', 'admin console', 'dashboard view', 'logout success', 'session expired', 'view bag', 'shopping bag', 'item added', 'save for later', 'move to cart', 'guest checkout', 'express checkout', 'secure checkout', 'order summary', 'apply coupon', 'promo code', 'discount code', 'gift card balance', 'voucher code', 'tax calculated', 'shipping estimate', 'delivery options', 'tracking number', 'track my order', 'order history', 'past purchases', 'buy again', 'reorder', 'return policy', 'refund request', 'exchange items', 'warranty info', 'size guide', 'fitting room', 'compare products', 'best sellers', 'editors picks', 'staff favorites', 'customer reviews', 'most helpful reviews', 'write a review', 'add a photo', 'verified purchase', 'out of stock', 'notify me', 'backorder', 'low stock warning', 'shop by category', 'shop all brands', 'department', 'clearance sale', 'flash deal', 'limited time offer', 'bundle and save', 'subscription box', 'recurring order', 'cookie preferences', 'ad choices', 'do not sell my info', 'ca privacy rights', 'gdpr compliance', 'eula', 'end user license agreement', 'copyright notice', 'trademarks', 'patents', 'ethics policy', 'modern slavery statement', 'tax strategy', 'anti-corruption', 'whistleblower', 'user agreement', 'usage terms', 'licensing', 'external links', 'third party content', 'dmca', 'digital millennium copyright act', 'service level agreement', 'sla', 'compliance report', 'audit', 'certification', 'accreditation', 'regulatory info', 'iso certified', 'security badge', 'verified secure', 'ssl certificate', 'developer documentation', 'api reference', 'api docs', 'endpoints', 'authentication docs', 'sdk download', 'cloning repository', 'fork on github', 'pull requests', 'issue tracker', 'bug report', 'feature request', 'dev community', 'sandbox env', 'test environment', 'staging server', 'production status', 'deployment logs', 'cloud dashboard', 'server status', 'maintenance window', 'uptime monitoring', 'database management', 'webhooks', 'call-back urls', 'integration guide', 'widget installation', 'snippet code', 'embed code', 'npm install', 'version history', 'release notes', 'vulnerability report', 'security advisory', 'security txt', 'technical specs', 'system requirements', 'browser compatibility', 'cli tools', 'terminal commands', 'docker compose', 'kubernetes cluster', 'deployment script', 'environment variables', 'env file', 'subscribe to newsletter', 'mailing list', 'weekly digest', 'monthly update', 'email alerts', 'join the discussion', 'community forum', 'general discussion', 'user group', 'online community', 'follow us on facebook', 'follow us on twitter', 'follow us on instagram', 'follow us on linkedin', 'watch on youtube', 'listen on spotify', 'podcast episode', 'webinar registration', 'live stream', 'view replay', 'slide deck', 'presentation materials', 'press release', 'media contact', 'journalist resources', 'official statement', 'public relations', 'brand guidelines', 'logo downloads', 'social wall', 'user generated content', 'ugc', 'comment section', 'leave a comment', 'hide comments', 'report post', 'flag comment', 'upvote', 'downvote', 'back to top', 'scroll for more', 'loading more results', 'no more items', 'end of list', 'click to enlarge', 'tap to zoom', 'swipe for next', 'drag to reorder', 'hover for details', 'expand all', 'collapse all', 'toggle menu', 'hamburger menu', 'breadcrumb navigation', 'pagination navigation', 'go to page', 'items per page', 'sort by relevance', 'sort by date', 'sort by price', 'filter by brand', 'filter by rating', 'clear all filters', 'apply filters', 'search bar', 'suggested results', 'did you mean', 'popular searches', 'recent searches', 'autocomplete', 'empty state', 'no results found', 'try another search', 'back to results', 'close modal', 'dismiss alert', 'acknowledge', 'confirm action', 'undo changes', 'save draft', 'auto save', 'discard changes', 'processing', 'please wait', 'leadership team', 'executive profile', 'board members', 'organizational chart', 'office locations', 'global headquarters', 'regional office', 'branch directory', 'contact directory', 'department list', 'employee directory', 'talent acquisition', 'internship programs', 'early careers', 'job search', 'application status', 'resume upload', 'cover letter', 'interview tips', 'benefits package', 'company culture', 'employee stories', 'diversity and inclusion', 'equal opportunity', 'workplace policy', 'procurement', 'supplier portal', 'vendor registration', 'rfp', 'request for proposal', 'corporate gifts', 'bulk orders', 'wholesale inquiry', 'partners program', 'affiliate login', 'case study download', 'white paper', '404 page', 'page not found', '500 internal error', 'service unavailable', 'database error', 'redirecting', 'please refresh', 'cache cleared', 'cookies enabled', 'javascript required', 'optimized for mobile', 'best viewed in', 'legacy site', 'mobile version', 'desktop site', 'alpha release', 'beta test', 'rc version', 'stable build', 'checksum', 'signature', 'encrypted', 'pki', 'digital signature', 'watermark', 'preview mode', 'edit mode', 'read only', 'restricted access', 'authorized users only', 'maintenance mode', 'site offline', 'emergency update',

    // ═══════════════════════════════════════════════════
    // 2. UI / 네비게이션 (KO) ~150
    // ═══════════════════════════════════════════════════
    '로그인', '로그아웃', '회원가입', '가입하기', '마이페이지', '내 정보', '내 계정',
    '장바구니', '결제', '결제하기', '주문하기', '주문내역', '배송조회',
    '검색', '검색결과', '상세검색', '통합검색',
    '메뉴', '전체메뉴', '메인메뉴', '사이드바',
    '홈', '메인', '첫페이지', '웰컴',
    '소개', '회사소개', '서비스소개', '브랜드소개',
    '연락처', '문의하기', '문의', '상담', '고객센터', '고객상담', '헬프', '도움말',
    '공지사항', '공지', '이벤트공지', '알림',
    '이용약관', '개인정보', '개인정보처리방침', '약관', '동의',
    '사이트맵', '접근성',
    '블로그', '뉴스', '보도자료', '미디어',
    '채용', '채용공고', '입사지원', '인재채용',
    '갤러리', '사진', '영상', '동영상',
    '가격', '요금', '가격표', '요금제', '플랜',
    '기능', '서비스', '제품', '솔루션',
    '리뷰', '후기', '평가', '별점', '평점', '이용후기', '체험후기',
    '포트폴리오', '사례', '프로젝트',
    '위치', '찾아오시는길', '오시는길', '약도',
    '지도', '지도보기', '길찾기',
    '영업시간', '운영시간', '진료시간',
    '예약', '예약하기', '바로예약', '즉시예약',
    '주문', '주문하기', '온라인주문',
    '쇼핑', '쇼핑하기',
    '더보기', '전체보기', '모두보기', '접기', '펼치기',
    '상세보기', '자세히보기', '자세히',
    '정보', '상세정보', '추가정보',
    '목록', '리스트', '카탈로그',
    '카테고리', '분류', '종류', '유형', '구분',
    '정렬', '정렬하기', '필터', '필터링', '조건', '초기화',
    '다음', '이전', '뒤로', '앞으로', '처음', '마지막',
    '닫기', '열기', '취소', '확인', '완료', '계속',
    '저장', '수정', '변경', '삭제', '제거',
    '다운로드', '업로드', '내보내기', '가져오기', '인쇄',
    '공유', '공유하기', '링크복사',
    '구독', '구독하기', '뉴스레터',
    '알림', '알림설정', '메시지',
    '추천', '인기', '최신', '베스트', '핫플', '랭킹', '순위', '인기순', '최신순', '추천순',
    '광고', '스폰서', '협찬', '제휴',
    '무료', '할인', '세일', '쿠폰', '이벤트', '특가', '최저가', '초특가',
    '매진', '품절', '준비중', '오픈예정',
    '무료취소', '즉시확인', '실시간',

    // ═══════════════════════════════════════════════════
    // 3. UI / 네비게이션 (JP) ~120
    // ═══════════════════════════════════════════════════
    'ログイン', 'ログアウト', '新規登録', '会員登録', 'マイページ', 'アカウント',
    'Yahoo!', 'マップ',
    'カート', 'お買い物カゴ', '決済', '注文', '注文履歴', '配送状況',
    '検索', '検索結果', '詳細検索', 'キーワード',
    'メニュー', 'ナビゲーション', 'サイドバー',
    'ホーム', 'トップページ', 'トップ',
    '紹介', '会社概要', 'サービス紹介', 'ブランド紹介', '私たちについて',
    'お問い合わせ', '連絡先', 'サポート', 'ヘルプ', 'ヘルプセンター', 'カスタマーサービス',
    'お知らせ', 'ニュース', 'プレスリリース', 'メディア',
    '利用規約', 'プライバシーポリシー', '個人情報保護方針',
    'サイトマップ', 'アクセシビリティ',
    'ブログ', '記事', 'コラム', 'マガジン',
    '採用情報', '求人', '応募',
    'ギャラリー', '写真', '動画', '画像',
    '料金', '価格', 'プラン', '料金プラン',
    '機能', 'サービス', '商品', 'ソリューション',
    'レビュー', '口コミ', '評価', '評判', 'クチコミ', '星評価',
    'ポートフォリオ', '事例', '実績',
    'アクセス', '所在地', '場所', '住所',
    '地図', 'マップ', '道案内',
    '営業時間', '診療時間', '受付時間',
    '予約', '予約する', 'ご予約', '即時予約', 'ネット予約',
    '注文する', 'オンライン注文',
    'ショッピング',
    'もっと見る', '全て見る', '続きを見る', '詳細を見る', '詳細',
    'リスト', 'カタログ', '一覧', '名',
    'カテゴリ', 'カテゴリー', '分類', '種類', 'タイプ',
    'ソート', '並び替え', 'フィルター', '絞り込み', '絞込む', 'リセット', '条件', '合致', '順', '致順',
    '次へ', '前へ', '戻る', '進む', '最初', '最後',
    '閉じる', '開く', 'キャンセル', '確認', '完了', '続ける',
    '保存', '編集', '変更', '削除',
    'ダウンロード', 'アップロード', '印刷',
    '共有', 'リンクコピー',
    '通知', '設定',
    '人気', 'おすすめ', 'ランキング', '新着', '注目', '話題', '日', 'その他の', 'その他', '関連',
    'から', 'アクセス', 'パーキング', 'クチコミ', '評価', 'よくあるお', '問合わせ', 'ご予約は', 'こちらから',
    'クリック', 'タップ', 'ボタン', 'リンク', 'メニュー', 'ナビ', 'ナビゲーション', 'トップ', 'ホーム',
    '戻る', '次へ', '前へ', 'ページ', '全ページ', '次のページ', '前のページ', '最後へ', '最初へ',
    '閉じる', 'キャンセル', '決定', '確定', '送信', '入力', '選択', 'クリア', 'リセット',
    '広告', 'スポンサー', 'PR', 'タイアップ',
    '無料', '割引', 'セール', 'クーポン', 'キャンペーン', '特価', '最安値', '限定',
    '売り切れ', '在庫切れ', '準備中', '近日公開',
    '送料無料', '即日発送', 'ポイント',
    '特集', 'ピックアップ', 'まとめ', '詳しく見る', 'もっと見る', '一覧を見る', '条件で探す', '条件を変更',
    'もっと見る', '続きを見る', '画像を見る', '動画を見る', '地図を見る', '詳細を見る', '記事を見る',
    '購入する', '注文する', '予約する', '申し込む', '登録する', 'ログイン', 'ログアウト', 'サインアップ',
    'シェア', 'つぶやく', '投稿する', '保存', 'お気に入り', 'ブックマーク', 'フォロー',
    'いいね', 'ハート', 'スター', '星', '評価する', 'レビューを書く', '口コミを書く',
    'ショッピング', '通販', 'オンライン', 'ストア', 'ショップ', 'カート', 'カゴ', '買い物', '注文', '発注',
    '在庫', '品切れ', '完売', '再入荷', '入荷待ち', '取り寄せ', '発送', '配達', '送料', '代引', '振替',
    '決済', '支払い', '価格', '定価', '税込', '税抜', '割引', 'セール', 'クーポン', '特典', 'ポイント',
    '会員', '登録', 'マイページ', 'ログイン', 'ログアウト', '退会', 'メルマガ', 'ニュース',
    'アプリ', 'ダウンロード', 'インストール', 'アップデート', 'バージョン', 'リリース', '新着',
    'ヘルプ', 'マニュアル', 'ガイド', '使い方', 'FAQ', '問合せ', 'サポート', '掲示板',
    '利用規約', 'プライバシー', 'ポリシー', '特定商取引', '免責', '著作権', '会社概要',
    'スタッフ', '採用', '求人', 'リクルート', '正社員', 'バイト', 'パート', '派遣',
    '企業', '法人', '団体', '協会', '組合', '組織', '公的', '行政', '自治体',
    'グルメ', '料理', '食材', 'レシピ', '味', '美味しい', '旨い', '絶品', '厳選', 'こだわり',
    'メニュー', '献立', '定食', 'ランチ', 'ディナー', 'モーニング', 'カフェ', 'スイーツ',
    '銀行', '口座', '振込', '入金', '出金', '残高', '投資', '証券', '保険', '年金',
    '税金', '確定申告', '所得', '控除', '資産', '負債', '融資', 'ローン', '金利',
    '不動産', '物件', '賃貸', '売買', '仲介', '管理', '査定', '引越し', '入居',
    'マンション', 'アパート', '一戸建て', '土地', '建物', 'ビル', '事務所', '店舗',
    '間取り', '築年数', '構造', '駅徒歩', '家賃', '敷金', '礼金', '管理費',
    '教育', 'スクール', '塾', '学習', '勉強', '対策', '資格', '検定', '試験',
    'コース', 'カリキュラム', '講義', '授業', 'セミナー', '研修', 'ワークショップ',
    '子供', 'キッズ', 'ベビー', '親子', '育児', '子育て', '教育', '知育',
    'イベント', '行事', '催し', '祭り', '大会', '試合', 'ライブ', '公演', '舞台',
    '毎日', '毎週', '毎月', '毎年', '日次', '週次', '月次', '年次', '定例', '定期', '臨時', '随時',
    '最高', '最低', '最良', '最悪', '優良', '優秀', '合格', '不合格', '基準', '標準', '規格',
    'サークル', 'クラブ', 'チーム', 'グループ', '団体', '組織', '連盟', '協会', '組合', '同好会', 'ファン',
    'ビル', 'マンション', 'アパート', 'ハイツ', 'コーポ', 'テラス', 'レジデンス', 'スカイ', 'タワー', 'ルーム', '号室',
    '一軒家', '一戸建て', 'テラスハウス', 'タウンハウス', 'シェアハウス', '賃貸', '分譲', '売買',
    '間取り', 'ワンルーム', 'ワンケー', 'ワンディーケー', 'ツーディーケー', 'スリーディーケー',
    '徒歩', '分', 'キロ', 'メーター', '駅近', 'バス停', '国道', '県道', '市道', '街道',
    '北側', '南側', '東側', '西側', '角地', '日当たり', '眺望', '閑静', '住宅街',
    '防犯', 'セキュリティ', 'オートロック', '監視カメラ', 'インターホン', '宅配ボックス',
    '駐車場', '駐輪場', 'バイク置き場', 'エレベーター', '階段', '屋上', 'バルコニー', '専用庭',
    'ペット可', '相談', '楽器可', '二人入居', 'ルームシェア', '高齢者', '単身者', '学生',
    '保証人', '保証会社', '礼金', '敷金', '保証金', '更新料', '仲介手数料', '管理費', '共益費',
    '火災保険', '鍵交換', 'クリーニング', '消毒', '除菌', 'ウイルス', '対策',
    '株式会社', '有限会社', '合同会社', '互助会', '一般社団', '一般財団', '公益社団', '公益財団', 'NPO法人', '医療法人', '学校法人', '宗教法人', '組合', '振興会', '協議会', '連合会', '協会', '事務局', '本部', '支部', '営業所', '出張所', '事務所', 'センター',
    '様', '殿', '御中', '先生', '氏', '君', 'ちゃん', 'くん', 'さん',
    'お願い', '致します', 'いたします', '申し上げます', 'させていただきます', 'させていただきます', '頂戴', '頂きます', 'いただきます', '賜り', '賜ります', 'ございます', '御座います', 'になります', 'でございます', 'ではない', 'であろう', 'であります',
    'につき', 'につきまして', 'に関し', 'に関しまして', 'に際し', 'に際しまして', 'に対し', 'に対しまして', 'に基づき', 'に基づきまして', 'に則り', 'に従い', 'に応じ', 'に向けて', 'を伴う', 'を含み', 'を含め', 'を除き', 'を除きまして',
    '上記', '下記', '左記', '右記', '本文', '別紙', '別紙参照', '詳細は', '詳しい内容は', '内容を確認', '内容をご確認', '承諾の上', '同意の上', '確認済み', '承認済み', '未実施', '実施済み', '完了済み', '進行中',
    '第一', '第二', '第三', '第四', '第五', '第六', '第七', '第八', '第九', '第十', '第1', '第2', '第3', '第4', '第5', '第6', '第7', '第8', '第9', '第10',
    '月間', '週間', '日間', '時間', '分間', '秒間', '期間中', '開催中', '実施中', '募集中', '受付中', '停止中', '休止中', '稼働中', '準備中', '終了', '閉幕', '閉会', '開幕', '開会',
    '最新情報', '重要なお知らせ', '更新履歴', 'よくある質問', 'お問い合わせ先', 'アクセスガイド', 'ご利用規約', 'プライバシーポリシー', '免責事項', 'サイトマップ', 'リンク集', '著作権について',
    'iniciar sesión', 'registrarse', 'cerrar sesión', 'mi cuenta', 'carrito', 'buscar', 'menú', 'inicio',
    'acerca de', 'contacto', 'contáctenos', 'ayuda', 'soporte', 'preguntas frecuentes',
    'política de privacidad', 'términos', 'mapa del sitio', 'noticias', 'blog', 'empleo',
    'precios', 'servicios', 'productos', 'reseñas', 'opiniones', 'galería',
    'ubicación', 'mapa', 'horario', 'reservar', 'pedir', 'tienda', 'ver más', 'ver todo',
    'categoría', 'categorías', 'filtrar', 'ordenar', 'siguiente', 'anterior', 'cerrar', 'guardar',
    'descargar', 'compartir', 'suscribirse', 'popular', 'destacado', 'gratis', 'descuento', 'oferta',
    // FR
    'connexion', 'inscription', 'déconnexion', 'mon compte', 'panier', 'recherche', 'rechercher',
    'accueil', 'à propos', 'contactez-nous', 'aide', 'faq',
    'politique de confidentialité', 'conditions', 'plan du site', 'actualités', 'blog', 'carrières',
    'tarifs', 'services', 'produits', 'avis', 'galerie', 'témoignages',
    'localisation', 'carte', 'horaires', 'réserver', 'commander', 'boutique', 'voir plus', 'tout voir',
    'catégorie', 'catégories', 'filtrer', 'trier', 'suivant', 'précédent', 'fermer', 'sauvegarder',
    'télécharger', 'partager', 'abonnez-vous', 'populaire', 'mis en avant', 'gratuit', 'réduction', 'offre',
    // DE
    'anmelden', 'registrieren', 'abmelden', 'mein konto', 'warenkorb', 'suche', 'suchen',
    'startseite', 'über uns', 'kontakt', 'kontaktieren sie uns', 'hilfe', 'häufige fragen',
    'datenschutz', 'nutzungsbedingungen', 'seitenübersicht', 'nachrichten', 'blog', 'karriere',
    'preise', 'dienstleistungen', 'produkte', 'bewertungen', 'galerie',
    'standort', 'karte', 'öffnungszeiten', 'reservieren', 'bestellen', 'shop', 'mehr anzeigen', 'alle anzeigen',
    'kategorie', 'kategorien', 'filtern', 'sortieren', 'weiter', 'zurück', 'schließen', 'speichern',
    'herunterladen', 'teilen', 'abonnieren', 'beliebt', 'empfohlen', 'kostenlos', 'rabatt', 'angebot',
    // IT
    'accedi', 'registrati', 'esci', 'il mio account', 'carrello', 'cerca', 'ricerca',
    'home', 'chi siamo', 'contatti', 'contattaci', 'aiuto', 'domande frequenti',
    'privacy', 'termini', 'mappa del sito', 'notizie', 'blog', 'lavora con noi',
    'prezzi', 'servizi', 'prodotti', 'recensioni', 'galleria',
    'posizione', 'mappa', 'orari', 'prenota', 'ordina', 'negozio', 'vedi tutto', 'mostra tutto',
    'categoria', 'categorie', 'filtra', 'ordina per', 'successivo', 'precedente', 'chiudi', 'salva',
    'scarica', 'condividi', 'iscriviti', 'popolare', 'in evidenza', 'gratuito', 'sconto', 'offerta',
    // PT
    'entrar', 'cadastrar', 'sair', 'minha conta', 'carrinho', 'pesquisar', 'buscar',
    'início', 'sobre nós', 'contato', 'fale conosco', 'ajuda', 'perguntas frequentes',
    'privacidade', 'termos', 'mapa do site', 'notícias', 'blog', 'vagas',
    'preços', 'serviços', 'produtos', 'avaliações', 'galeria',
    'localização', 'mapa', 'horário', 'reservar', 'pedir', 'loja', 'ver mais', 'ver tudo',
    'categoria', 'categorias', 'filtrar', 'ordenar', 'próximo', 'anterior', 'fechar', 'salvar',
    'baixar', 'compartilhar', 'inscrever-se', 'popular', 'destaque', 'grátis', 'desconto', 'oferta',
    // ZH (Chinese)
    '登录', '注册', '退出', '我的账户', '购物车', '搜索', '菜单',
    '首页', '关于我们', '联系我们', '帮助', '常见问题',
    '隐私政策', '使用条款', '网站地图', '新闻', '博客', '招聘',
    '价格', '服务', '产品', '评论', '图库', '画廊',
    '位置', '地图', '营业时间', '预订', '下单', '商店', '查看更多', '查看全部',
    '分类', '筛选', '排序', '下一页', '上一页', '关闭', '保存',
    '下载', '分享', '订阅', '热门', '推荐', '免费', '折扣', '优惠',

    // ═══════════════════════════════════════════════════
    // 5. 카테고리 / 업종 일반명사 (EN) ~200
    // ═══════════════════════════════════════════════════
    'restaurants', 'restaurant', 'hotels', 'hotel', 'motel', 'motels', 'cafe', 'cafes', 'coffee shop', 'coffee shops',
    'bar', 'bars', 'pub', 'pubs', 'club', 'clubs', 'nightclub', 'nightclubs', 'lounge', 'lounges',
    'inn', 'inns', 'resort', 'resorts', 'hostel', 'hostels', 'lodge', 'lodges', 'cabin', 'cabins',
    'bed and breakfast', 'b&b', 'guesthouse', 'guest house',
    'salon', 'salons', 'barbershop', 'barber shop', 'barbershops', 'beauty salon', 'nail salon', 'hair salon',
    'spa', 'spas', 'massage', 'wellness', 'fitness',
    'gym', 'gyms', 'fitness center', 'health club', 'yoga studio', 'pilates',
    'clinic', 'clinics', 'hospital', 'hospitals', 'medical center', 'urgent care', 'emergency room',
    'dentist', 'dentists', 'dental clinic', 'dental office', 'orthodontist',
    'pharmacy', 'pharmacies', 'drugstore', 'drugstores',
    'veterinarian', 'vet', 'vets', 'veterinary', 'animal hospital', 'pet clinic',
    'bakery', 'bakeries', 'pastry shop', 'confectionery',
    'butcher', 'butchers', 'deli', 'delicatessen',
    'grocery', 'groceries', 'supermarket', 'supermarkets', 'convenience store',
    'shop', 'shops', 'store', 'stores', 'boutique', 'boutiques',
    'market', 'markets', 'marketplace', 'mall', 'malls', 'shopping center', 'shopping mall', 'plaza',
    'accommodation', 'accommodations', 'lodging', 'housing', 'apartments', 'apartment',
    'real estate', 'realty', 'property', 'properties',
    'insurance', 'banking', 'finance', 'financial services', 'accounting', 'tax services',
    'lawyer', 'lawyers', 'attorney', 'attorneys', 'law firm', 'legal services', 'notary',
    'plumber', 'plumbers', 'plumbing', 'electrician', 'electricians', 'electrical',
    'contractor', 'contractors', 'construction', 'builder', 'builders', 'renovation',
    'painter', 'painters', 'painting', 'decorator', 'decorators',
    'roofer', 'roofers', 'roofing', 'hvac', 'air conditioning', 'heating',
    'mechanic', 'mechanics', 'auto repair', 'auto shop', 'car wash', 'car dealer',
    'towing', 'locksmith', 'pest control', 'cleaning', 'cleaning service', 'janitorial',
    'landscaping', 'lawn care', 'gardening', 'tree service',
    'moving', 'movers', 'moving company', 'relocation', 'storage', 'self storage',
    'printing', 'print shop', 'copy center',
    'laundry', 'laundromat', 'dry cleaner', 'dry cleaners', 'dry cleaning',
    'tailor', 'tailors', 'alterations', 'seamstress',
    'florist', 'flower shop', 'nursery', 'garden center',
    'jeweler', 'jewelers', 'jewelry store', 'watch repair',
    'photography', 'photographer', 'photo studio', 'video production',
    'daycare', 'childcare', 'preschool', 'kindergarten', 'school', 'schools', 'academy', 'institute',
    'university', 'college', 'tutoring', 'education', 'training',
    'church', 'temple', 'mosque', 'synagogue', 'worship',
    'funeral home', 'cemetery', 'cremation',
    'gas station', 'petrol station', 'filling station',

    // ═══════════════════════════════════════════════════
    // 6. 카테고리 / 업종 일반명사 (KO) ~150
    // ═══════════════════════════════════════════════════
    '숙소', '숙박', '숙박업소', '모텔', '호텔', '리조트', '펜션', '게스트하우스', '한옥', '캠핑', '글램핑',
    '음식점', '맛집', '카페', '식당', '분식', '중식', '일식', '양식', '한식', '치킨', '피자', '햄버거', '고깃집', '횟집', '국밥',
    '병원', '의원', '약국', '치과', '한의원', '정형외과', '피부과', '내과', '이비인후과', '안과', '산부인과', '소아과', '정신과',
    '미용실', '네일샵', '피부관리', '에스테틱', '스파', '마사지', '찜질방', '사우나', '목욕탕',
    '노래방', '노래연습장', 'PC방', '피시방', '당구장', '볼링장', '오락실',
    '학원', '학교', '유치원', '어린이집', '보습학원', '영어학원', '입시학원', '태권도',
    '교회', '성당', '절', '사찰',
    '마트', '슈퍼', '슈퍼마켓', '편의점', '백화점', '아울렛',
    '주유소', '세차장', '정비소', '카센터',
    '세탁소', '빨래방', '코인세탁',
    '부동산', '공인중개사',
    '은행', '금융', '보험', '증권', '저축은행',
    '변호사', '법무사', '법률사무소', '세무사', '회계사', '특허사무소',
    '인테리어', '건설', '건축', '철물점',
    '이사', '택배', '퀵서비스', '배달',
    '꽃집', '화원', '화훼',
    '사진관', '스튜디오', '촬영',
    '장례식장', '상조',
    '동물병원', '펫샵', '애견용품',

    // ═══════════════════════════════════════════════════
    // 7. 카테고리 / 업종 일반명사 (JP) ~100
    // ═══════════════════════════════════════════════════
    '宿泊', '宿泊施設', 'ホテル', '旅館', 'リゾート', 'ペンション', 'ゲストハウス', '民宿', 'キャンプ場',
    'レストラン', '食堂', 'カフェ', '喫茶店', 'バー', 'パブ', 'クラブ', 'ラウンジ', '居酒屋', '焼肉', '寿司', 'ラーメン', 'うどん', 'そば',
    '病院', 'クリニック', '歯科', '薬局', '整形外科', '皮膚科', '内科', '耳鼻咽喉科', '眼科', '小児科',
    '美容院', '美容室', 'ネイルサロン', 'エステ', 'スパ', 'マッサージ', '銭湯', 'サウナ',
    'カラオケ', 'ゲームセンター', 'ボウリング', 'パチンコ',
    '学校', '塾', '予備校', '幼稚園', '保育園', '大学', '専門学校',
    '神社', '寺', '教会',
    'スーパー', 'コンビニ', 'デパート', 'モール', '百貨店',
    'ガソリンスタンド', '洗車', '修理工場',
    'クリーニング', 'コインランドリー',
    '不動産', '銀行', '保険', '証券',
    '弁護士', '司法書士', '税理士', '会計士',
    '建設', '建築', '工事', 'リフォーム',
    '引越し', '宅配', '配送',
    '花屋', '写真館', 'スタジオ',
    '葬儀場', '斎場', '霊園',
    '動物病院', 'ペットショップ',

    // ═══════════════════════════════════════════════════
    // 8. 지역명 / 도시명 (KO) ~500+ [v27.0 Expanded]
    // ═══════════════════════════════════════════════════
    // 광역자치단체
    '서울특별시', '부산광역시', '대구광역시', '인천광역시', '광주광역시', '대전광역시', '울산광역시', '세종특별자치시',
    '경기도', '강원특별자치도', '충청북도', '충청남도', '전북특별자치도', '전라남도', '경상북도', '경상남도', '제주특별자치도',
    '서울', '서울시', '부산', '부산시', '대구', '대구시', '인천', '인천시', '광주', '광주시', '대전', '대전시', '울산', '울산시', '세종', '세종시',
    '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주', '제주도',
    
    // 기초자치단체 (시/군/구) - 가나다순 정렬 및 중복 제거
    '가평군', '강남구', '강동구', '강릉시', '강북구', '강서구', '강진군', '강화군', '거창군', '거제시', '계룡시', '계양구', '고령군', '고성군', '고양시', '고창군', '고흥군', '곡성군', '공주시', '과천시', '관악구', '광명시', '광산구', '광양시', '광진구', '광주시', '구례군', '구리시', '구로구', '구미시', '군포시', '군산시', '군위군', '금산군', '금정구', '금천구', '기장군', '기흥구', '김제시', '김천시', '김포시', '김해시', '나주시', '남구', '남동구', '남양주시', '남원시', '남해군', '노원구', '논산시', '단양군', '단원구', '달서구', '담양군', '당진시', '대덕구', '덕양구', '덕진구', '도봉구', '동구', '동남구', '동대문구', '동두천시', '동래구', '동작구', '동해시', '마산합포구', '마산회원구', '마포구', '만안구', '목포시', '무안군', '무주군', '문경시', '미추홀구', '밀양시', '보령시', '보은군', '보성군', '봉화군', '부산진구', '부안군', '부천시', '부평구', '북구', '분당구', '사상구', '사하구', '사천시', '산청군', '상록구', '상주시', '서구', '서귀포시', '서대문구', '서남구', '서북구', '서산시', '서원구', '서초구', '서천군', '성남시', '성동구', '성산구', '성북구', '성주군', '속초시', '송파구', '수성구', '수정구', '수원시', '수영구', '수지구', '순창군', '순천시', '시흥시', '신안군', '아산시', '안동시', '안산시', '안성시', '안양시', '양구군', '양산시', '양양군', '양주시', '양천구', '양평군', '여주시', '연수구', '연제구', '연천군', '영광군', '영덕군', '영도구', '영동군', '영암군', '영양군', '영월군', '영주시', '영천시', '영통구', '예산군', '예천군', '오산시', '옥천군', '옹진군', '완도군', '완주군', '완산구', '용산구', '용인시', '울릉군', '울진군', '울주군', '원주시', '유성구', '은평구', '의령군', '의성군', '의왕시', '의정부시', '의창구', '이천시', '익산시', '인제군', '임실군', '장성군', '장수군', '장안구', '장흥군', '전주시', '정선군', '정읍시', '제주시', '제천시', '종로구', '중구', '중랑구', '중원구', '증평군', '진도군', '진안군', '진주시', '진해구', '진천군', '창녕군', '창원시', '천안시', '철원군', '청도군', '청송군', '청양군', '청원구', '청주시', '춘천시', '충주시', '칠곡군', '태백시', '태안군', '통영시', '파주시', '팔달구', '평창군', '평택시', '포항시', '포천시', '하남시', '하동군', '함안군', '함양군', '함평군', '합천군', '해남군', '해운대구', '홍성군', '홍천군', '화성시', '화순군', '화천군', '횡성군', '흥덕구',

    // 주요 지명/랜드마크
    '홍대', '이태원', '명동', '동대문', '잠실', '강남역', '신림', '건대', '혜화',
    '여의도', '성수', '압구정', '청담', '삼성', '선릉', '역삼', '교대',
    '신촌', '이대', '합정', '상수', '망원', '연남', '서교',
    '가로수길', '경리단길', '해방촌', '성수동', '익선동', '을지로',
    // 주요 도시
    '수원', '성남', '분당', '일산', '파주', '고양', '용인', '화성',
    '안양', '안산', '시흥', '군포', '의왕', '과천', '광명', '하남', '구리', '남양주',
    '청주', '천안', '아산', '전주', '광양', '여수', '순천',
    '포항', '경주', '구미', '김해', '창원', '진주', '거제', '통영',
    '춘천', '원주', '속초', '강릉', '양양', '평창',
    '목포', '나주', '통영', '거제',
    '제주시', '서귀포', '서귀포시',

    // ═══════════════════════════════════════════════════
    // 9. 지역명 / 도시명 (JP) ~150
    // ═══════════════════════════════════════════════════
    // 都道府県
    '北海道', '青森', '岩手', '宮城', '秋田', '山形', '福島',
    '茨城', '栃木', '群馬', '埼玉', '千葉', '東京', '神奈川',
    '新潟', '富山', '石川', '福井', '山梨', '長野',
    '岐阜', '静岡', '愛知', '三重',
    '滋賀', '京都', '大阪', '兵庫', '奈良', '和歌山',
    '鳥取', '島根', '岡山', '広島', '山口',
    '徳島', '香川', '愛媛', '高知',
    '福岡', '佐賀', '長崎', '熊本', '大分', '宮崎', '鹿児島', '沖縄',
    // 主要都市
    '札幌', '仙台', 'さいたま', '横浜', '川崎', '相模原',
    '名古屋', '京都市', '大阪市', '神戸', '堺',
    '北九州', '福岡市', '熊本市',
    // 東京 区
    '千代田', '中央区', '港区', '新宿', '文京', '台東', '墨田', '江東',
    '品川', '目黒', '大田', '世田谷', '渋谷', '中野', '杉並', '豊島',
    '北区', '荒川', '板橋', '練馬', '足立', '葛飾', '江戸川',
    // ランドマーク
    '池袋', '銀座', '六本木', '原宿', '表参道', '秋葉原', '上野', '浅草',
    '品川駅', '東京駅', '新橋', '赤坂', '麻布', '恵比寿', '代官山', '自由が丘',
    '吉祥寺', '下北沢', '三軒茶屋', '中目黒',
    '心斎橋', '難波', 'なんば', '梅田', '天王寺', '日本橋',
    '天神', '中洲', '博多', '栄', '名駅',
    '祇園', '四条', '河原町', '嵐山',

    // ═══════════════════════════════════════════════════
    // 10. 지역명 / 도시명 (EN/Global) ~300
    // ═══════════════════════════════════════════════════
    // US Major Cities
    'new york', 'new york city', 'nyc', 'los angeles', 'la', 'chicago', 'houston', 'phoenix',
    'philadelphia', 'san antonio', 'san diego', 'dallas', 'san jose', 'austin', 'jacksonville',
    'fort worth', 'columbus', 'charlotte', 'indianapolis', 'san francisco', 'seattle', 'denver',
    'washington dc', 'washington', 'nashville', 'oklahoma city', 'el paso', 'boston', 'portland',
    'las vegas', 'memphis', 'louisville', 'baltimore', 'milwaukee', 'albuquerque', 'tucson',
    'fresno', 'sacramento', 'mesa', 'kansas city', 'atlanta', 'omaha', 'colorado springs',
    'raleigh', 'long beach', 'virginia beach', 'miami', 'oakland', 'minneapolis', 'tulsa',
    'tampa', 'arlington', 'new orleans', 'cleveland', 'honolulu', 'anaheim',
    'detroit', 'pittsburgh', 'cincinnati', 'st louis', 'st. louis', 'salt lake city',
    'orlando', 'buffalo', 'richmond', 'boise', 'birmingham', 'rochester',
    // US States
    'california', 'texas', 'florida', 'new york state', 'pennsylvania', 'illinois', 'ohio',
    'georgia', 'north carolina', 'michigan', 'new jersey', 'virginia', 'washington state',
    'arizona', 'massachusetts', 'tennessee', 'indiana', 'missouri', 'maryland', 'wisconsin',
    'colorado', 'minnesota', 'south carolina', 'alabama', 'louisiana', 'kentucky', 'oregon',
    'oklahoma', 'connecticut', 'utah', 'iowa', 'nevada', 'arkansas', 'mississippi', 'kansas',
    'new mexico', 'nebraska', 'hawaii', 'alaska', 'idaho', 'montana',
    // Europe Major Cities
    'london', 'paris', 'berlin', 'madrid', 'rome', 'amsterdam', 'barcelona', 'vienna',
    'prague', 'budapest', 'lisbon', 'copenhagen', 'oslo', 'stockholm', 'helsinki', 'dublin',
    'brussels', 'warsaw', 'bucharest', 'athens', 'zurich', 'geneva', 'munich', 'hamburg',
    'milan', 'naples', 'florence', 'venice', 'lyon', 'marseille', 'nice', 'manchester',
    'birmingham', 'edinburgh', 'glasgow', 'liverpool',
    // Asia Major Cities
    'tokyo', 'osaka', 'kyoto', 'seoul', 'busan', 'beijing', 'shanghai', 'hong kong',
    'taipei', 'singapore', 'bangkok', 'kuala lumpur', 'jakarta', 'manila', 'hanoi',
    'ho chi minh', 'mumbai', 'delhi', 'new delhi', 'bangalore', 'chennai', 'kolkata',
    'dubai', 'abu dhabi', 'doha', 'riyadh', 'tel aviv', 'istanbul',
    // Oceania
    'sydney', 'melbourne', 'brisbane', 'perth', 'adelaide', 'auckland', 'wellington',
    // Americas (non-US)
    'toronto', 'vancouver', 'montreal', 'ottawa', 'calgary',
    'mexico city', 'cancun', 'guadalajara',
    'são paulo', 'rio de janeiro', 'buenos aires', 'santiago', 'lima', 'bogota',
    // Countries (standalone should not be business names)
    'usa', 'united states', 'uk', 'united kingdom', 'canada', 'australia', 'japan', 'korea',
    'south korea', 'china', 'taiwan', 'thailand', 'vietnam', 'philippines', 'indonesia', 'malaysia',
    'india', 'germany', 'france', 'italy', 'spain', 'portugal', 'netherlands', 'belgium',
    'switzerland', 'austria', 'sweden', 'norway', 'denmark', 'finland', 'ireland', 'poland',
    'czech republic', 'hungary', 'greece', 'turkey', 'russia', 'brazil', 'mexico', 'argentina',
    'singapore', 'new zealand', 'south africa', 'egypt', 'morocco',

    // ═══════════════════════════════════════════════════
    // 11. 동사 / 상태어 / 형용사 (EN) ~200
    // ═══════════════════════════════════════════════════
    'click', 'tap', 'press', 'scroll', 'swipe', 'drag', 'drop', 'hover', 'select', 'choose',
    'view', 'see', 'look', 'watch', 'listen', 'hear', 'read', 'write', 'type', 'enter',
    'show', 'hide', 'display', 'reveal', 'expose',
    'find', 'discover', 'explore', 'search', 'browse', 'navigate', 'locate',
    'get', 'receive', 'obtain', 'acquire', 'gain', 'earn',
    'buy', 'purchase', 'shop', 'order', 'book', 'reserve', 'rent', 'hire', 'lease',
    'sell', 'offer', 'provide', 'supply', 'deliver',
    'call', 'phone', 'dial', 'text', 'email', 'message', 'chat', 'contact',
    'visit', 'go', 'come', 'arrive', 'leave', 'return', 'travel',
    'check', 'verify', 'confirm', 'validate', 'review',
    'learn', 'study', 'teach', 'train', 'practice',
    'start', 'begin', 'launch', 'initiate', 'commence',
    'stop', 'end', 'finish', 'complete', 'conclude', 'terminate',
    'join', 'connect', 'link', 'attach', 'combine', 'merge',
    'follow', 'track', 'trace', 'monitor', 'observe',
    'like', 'love', 'hate', 'dislike', 'prefer', 'enjoy', 'appreciate',
    'recommend', 'suggest', 'advise', 'propose', 'offer',
    'try', 'attempt', 'test', 'experiment',
    'create', 'build', 'make', 'design', 'develop', 'produce', 'generate',
    'manage', 'control', 'handle', 'operate', 'run', 'lead', 'direct',
    'work', 'function', 'perform', 'execute', 'implement',
    'improve', 'enhance', 'upgrade', 'optimize', 'boost',
    'reduce', 'decrease', 'minimize', 'lower', 'cut',
    'increase', 'grow', 'expand', 'extend', 'raise',
    'compare', 'match', 'rank', 'rate', 'score', 'evaluate', 'assess',
    // 형용사/부사
    'best', 'top', 'great', 'good', 'nice', 'excellent', 'amazing', 'awesome', 'fantastic',
    'worst', 'bad', 'poor', 'terrible', 'horrible',
    'big', 'large', 'huge', 'small', 'tiny', 'little',
    'long', 'short', 'tall', 'wide', 'narrow', 'deep', 'shallow',
    'fast', 'quick', 'slow', 'rapid', 'swift',
    'new', 'old', 'young', 'modern', 'classic', 'traditional', 'vintage',
    'hot', 'cold', 'warm', 'cool', 'fresh',
    'easy', 'hard', 'difficult', 'simple', 'complex', 'basic', 'advanced',
    'cheap', 'expensive', 'affordable', 'premium', 'luxury', 'budget', 'economy',
    'local', 'nearby', 'near', 'close', 'far', 'remote', 'distant',
    'available', 'unavailable', 'limited', 'unlimited', 'exclusive',
    'official', 'unofficial', 'certified', 'approved', 'authorized',
    'open', 'closed', 'opening', 'closing',
    'daily', 'weekly', 'monthly', 'yearly', 'annual',

    // ═══════════════════════════════════════════════════
    // 12. 동사 / 상태어 (KO) ~100
    // ═══════════════════════════════════════════════════
    '보기', '보다', '보이기', '찾기', '찾다', '검색하기',
    '가기', '오기', '이동', '돌아가기',
    '사기', '구매하기', '구입하기', '주문하기', '예약하기',
    '팔기', '판매', '배달하기', '배송하기',
    '쓰기', '작성', '작성하기', '입력', '입력하기',
    '읽기', '확인', '확인하기', '검증',
    '시작', '시작하기', '끝', '끝내기', '완료하기',
    '열기', '닫기', '접기', '펼치기',
    '만들기', '생성', '추가', '추가하기', '삭제하기', '수정하기', '변경하기',
    '공유하기', '저장하기', '다운받기', '업로드하기',
    '좋아요', '싫어요', '추천하기', '신고', '신고하기',
    '참여', '참여하기', '가입', '탈퇴', '구독', '해지',
    '안내', '공지', '참고', '주의', '경고', '확인',

    // ═══════════════════════════════════════════════════
    // 13. 프로모션 / 마케팅 키워드 (Multi) ~100
    // ═══════════════════════════════════════════════════
    'free', 'sale', 'sales', 'discount', 'discounts', 'deal', 'deals', 'offer', 'offers',
    'coupon', 'coupons', 'voucher', 'vouchers', 'promo', 'promos', 'promotion', 'promotions',
    'special', 'specials', 'limited time', 'flash sale', 'clearance', 'outlet', 'wholesale',
    'buy one get one', 'bogo', 'half price', 'half off', 'percent off', '% off',
    'cashback', 'cash back', 'rebate', 'refund', 'money back', 'guarantee',
    'new arrival', 'new arrivals', 'just in', 'coming soon', 'pre-order', 'preorder',
    'best seller', 'bestseller', 'most popular', 'trending now', 'hot deal',
    'top pick', 'top picks', 'editors choice', "editor's choice", 'staff pick',
    'member exclusive', 'vip', 'loyalty', 'rewards', 'points', 'bonus',
    'gift card', 'gift cards', 'e-gift', 'gift certificate',
    'subscribe and save', 'auto-ship', 'recurring',
    'try free', 'free trial', 'no obligation', 'no commitment',
    // KO
    '무료배송', '당일배송', '새벽배송', '무료반품', '적립금', '포인트', '멤버십', '우수회원',
    '오픈기념', '개업', '오픈', '리뉴얼', '그랜드오픈',
    '타임세일', '한정판매', '한정수량', '선착순', '조기마감',
    '신상품', '신메뉴', '입고', '재입고', '출시',
    // JP
    '無料', '半額', 'タイムセール', '期間限定', '数量限定', '先着順',
    '新商品', '新メニュー', '新発売', '再入荷', '入荷',
    'ポイント還元', 'お得', 'お買い得', 'アウトレット', '福袋',
    '会員限定', 'メンバー限定',

    // ═══════════════════════════════════════════════════
    // 14. 소셜미디어 / 플랫폼 UI (Multi) ~60
    // ═══════════════════════════════════════════════════
    'facebook', 'instagram', 'twitter', 'tiktok', 'youtube', 'linkedin', 'pinterest', 'snapchat',
    'whatsapp', 'telegram', 'wechat', 'line', 'kakaotalk', 'kakao',
    'reddit', 'tumblr', 'flickr', 'vimeo', 'twitch', 'discord',
    'like', 'likes', 'share', 'shares', 'comment', 'comments', 'reply', 'replies',
    'retweet', 'repost', 'reshare', 'pin', 'save', 'bookmark',
    'follower', 'followers', 'following', 'subscriber', 'subscribers',
    'post', 'posts', 'story', 'stories', 'reel', 'reels', 'feed', 'timeline',
    'hashtag', 'mention', 'tag', 'tagged',
    'live', 'streaming', 'broadcast', 'podcast',

    // ═══════════════════════════════════════════════════
    // 15. 이커머스 / 결제 UI (Multi) ~60
    // ═══════════════════════════════════════════════════
    'add to cart', 'add to bag', 'buy now', 'buy it now', 'shop now', 'order now',
    'in stock', 'out of stock', 'sold out', 'back in stock', 'low stock', 'limited stock',
    'shipping', 'free shipping', 'express shipping', 'same day delivery', 'next day delivery',
    'returns', 'return policy', 'exchange', 'refund policy', 'warranty',
    'size', 'sizes', 'color', 'colors', 'colour', 'colours', 'quantity', 'qty',
    'weight', 'dimensions', 'material', 'brand', 'model', 'style',
    'sku', 'upc', 'isbn', 'item number', 'product code', 'barcode',
    'subtotal', 'total', 'tax', 'shipping cost', 'handling fee', 'service fee',
    'credit card', 'debit card', 'paypal', 'apple pay', 'google pay', 'cash on delivery',
    'installment', 'financing', 'monthly payment',
    // KO
    '장바구니담기', '바로구매', '재고있음', '재고없음', '배송비', '무료배송',
    '사이즈', '색상', '수량', '소재', '브랜드',
    '소계', '합계', '결제금액', '할부',
    // JP
    'カートに入れる', '今すぐ購入', '在庫あり', '在庫なし', '送料', '代引き',
    'サイズ', 'カラー', '数量', '素材', 'ブランド',
    '小計', '合計', 'お支払い',

    // ═══════════════════════════════════════════════════
    // 16. 시간 / 날짜 / 숫자 관련 (Multi) ~80
    // ═══════════════════════════════════════════════════
    'today', 'yesterday', 'tomorrow', 'now', 'later', 'soon', 'recently', 'just now',
    'this week', 'last week', 'next week', 'this month', 'last month', 'next month',
    'this year', 'last year', 'next year',
    'morning', 'afternoon', 'evening', 'night', 'midnight', 'noon',
    'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december',
    'spring', 'summer', 'fall', 'autumn', 'winter',
    '오늘', '어제', '내일', '지금', '곧', '최근', '요즘', '올해', '작년', '내년',
    '이번주', '지난주', '다음주', '이번달', '지난달', '다음달',
    '아침', '점심', '저녁', '밤', '새벽',
    '월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일',
    '今日', '昨日', '明日', '今週', '先週', '来週', '今月', '先月', '来月',
    '朝', '昼', '夕方', '夜',
    '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日', '日曜日',

    // ═══════════════════════════════════════════════════
    // 17. 법적 / 정책 / 기업 용어 (Multi) ~80
    // ═══════════════════════════════════════════════════
    'all rights reserved', 'copyright', 'trademark', 'registered', 'patent', 'intellectual property',
    'terms and conditions', 'end user license agreement', 'eula', 'gdpr', 'ccpa',
    'cookie settings', 'cookie preferences', 'manage cookies', 'accept cookies', 'reject cookies',
    'do not sell', 'opt out', 'opt in', 'consent',
    'powered by', 'made with', 'built with', 'designed by', 'developed by', 'hosted by',
    'inc', 'inc.', 'llc', 'ltd', 'ltd.', 'corp', 'corp.', 'co.', 'company',
    'gmbh', 'ag', 's.a.', 'pty', 'pvt',
    // KO
    '저작권', '상표', '특허', '지적재산권', '무단복제금지', '무단전재금지',
    '(주)', '주식회사', '유한회사', '사단법인', '재단법인', '합자회사',
    '대표이사', '대표자', '사업자등록번호', '통신판매업',
    // JP
    '著作権', '商標', '特許', '知的財産', '無断転載禁止',
    '株式会社', '有限会社', '合同会社', '一般社団法人', '財団法人',
    '代表取締役', '事業者番号',

    // ═══════════════════════════════════════════════════
    // 18. 교통 / 방향 (Multi) ~60
    // ═══════════════════════════════════════════════════
    'north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest',
    'left', 'right', 'center', 'middle', 'upper', 'lower',
    'station', 'airport', 'bus stop', 'subway', 'metro', 'train', 'bus', 'taxi', 'ferry',
    'parking', 'parking lot', 'garage', 'valet',
    'exit', 'entrance', 'gate', 'terminal', 'platform',
    '역', '공항', '터미널', '버스정류장', '지하철', '기차', '택시',
    '주차', '주차장', '발렛', '출구', '입구',
    '駅', '空港', 'ターミナル', 'バス停', '地下鉄', '電車', 'タクシー',
    '駐車場', '出口', '入口',

    // ═══════════════════════════════════════════════════
    // 19. 해시태그 / 트렌드 키워드 (KO) ~50
    // ═══════════════════════════════════════════════════
    '가성비', '가심비', '가족여행', '감성', '감성카페', '감성숙소',
    '뷰맛집', '핫플레이스', '인생샷', '포토존', '포토스팟',
    '데이트코스', '커플추천', '가족추천', '혼밥', '혼술', '혼행',
    '반려동물', '반려견', '반려묘', '펫프렌들리',
    '바베큐', 'BBQ', 'OTT', '넷플릭스', '스파', '파티룸', '루프탑',
    '오션뷰', '시티뷰', '마운틴뷰', '리버뷰',
    '조식포함', '조식', '석식', '중식',
    '무료주차', '발렛파킹',
    '연인추천', '연박특가', '당일치기', '1박2일',
    '체크인', '체크아웃', '얼리체크인', '레이트체크아웃',

    // ═══════════════════════════════════════════════════
    // 20. Yellow Pages 직종/카테고리 (EN - 전체 주소록 분류) ~300
    // ═══════════════════════════════════════════════════
    // A
    'accountants', 'acupuncture', 'adoption agencies', 'advertising agencies', 'air duct cleaning',
    'alarm systems', 'allergists', 'animal shelters', 'antiques', 'apartment rentals',
    'appliance repair', 'appraisers', 'aquariums', 'architects', 'art galleries',
    'asbestos removal', 'assisted living', 'auctioneers', 'audiologists', 'auto body shops',
    'auto dealerships', 'auto detailing', 'auto glass repair', 'auto insurance', 'auto parts',
    'auto repair', 'auto salvage', 'awnings',
    // B
    'bail bonds', 'balloon decorations', 'banquet halls', 'beauty supplies', 'bicycle shops',
    'blinds', 'boat dealers', 'boat repair', 'bookkeepers', 'bookstores',
    'bowling alleys', 'bridal shops', 'building materials', 'burglar alarms', 'bus charter',
    // C
    'cabinet makers', 'cable tv', 'campgrounds', 'car rental', 'car stereos',
    'cardiologists', 'carpet cleaning', 'carpet installation', 'caterers', 'catering',
    'cell phone repair', 'charter buses', 'child care', 'chimney cleaning', 'chiropractors',
    'closet organizers', 'coin dealers', 'collection agencies', 'community centers', 'computer repair',
    'concrete contractors', 'consignment shops', 'copying services', 'counseling', 'courier services',
    'credit unions', 'cremation services', 'custom cabinets', 'custom t-shirts',
    // D
    'dance studios', 'data recovery', 'day spas', 'deck builders', 'delivery services',
    'demolition', 'dental hygienists', 'dermatologists', 'detective agencies', 'diagnostic centers',
    'diesel repair', 'disc jockeys', 'document shredding', 'dog grooming', 'dog training',
    'door repair', 'drainage', 'draperies', 'driveway paving', 'driving schools',
    'drywall contractors', 'dump truck service', 'dumpster rental',
    // E-F
    'ear piercing', 'elder care', 'embroidery', 'emergency plumbers', 'endodontists',
    'engineers', 'engravers', 'entertainment agencies', 'environmental consultants', 'event planners',
    'excavating', 'exercise equipment', 'exterminators', 'eye doctors',
    'fabric stores', 'family counseling', 'farm equipment', 'fencing', 'financial advisors',
    'fire damage restoration', 'fireplace services', 'fishing charters', 'floor refinishing', 'flooring',
    'food trucks', 'foundation repair', 'framing', 'freight services', 'funeral directors',
    'furnace repair', 'furniture stores', 'furniture repair',
    // G-H
    'garage door repair', 'garbage removal', 'gas fireplaces', 'gastroenterologists', 'general contractors',
    'glass repair', 'golf courses', 'gourmet shops', 'graphic designers', 'gravel',
    'gutter cleaning', 'gutter installation', 'gymnastics',
    'hair removal', 'handyman services', 'hardware stores', 'health food stores', 'hearing aids',
    'heat pump', 'home builders', 'home health care', 'home inspectors', 'home remodeling',
    'home staging', 'home theater', 'horse boarding', 'house cleaning', 'human resources',
    // I-K
    'ice cream shops', 'immigration lawyers', 'industrial equipment', 'infant care', 'injury lawyers',
    'insulation', 'interior designers', 'internet providers', 'interpreters', 'investigators',
    'irrigation', 'junk removal', 'karate schools', 'kennel services', 'kitchen remodeling',
    // L-M
    'laboratories', 'land surveyors', 'landscape architects', 'laser hair removal', 'laundry services',
    'lawn mowers', 'lawn sprinklers', 'limo services', 'limousine service', 'linens', 'locksmiths',
    'maid services', 'mail services', 'marine services', 'marriage counseling', 'martial arts',
    'masonry', 'mattresses', 'mediation services', 'medical equipment', 'medical labs',
    'mental health', 'midwives', 'mini storage', 'mobile homes', 'mold removal',
    'mortgage brokers', 'motorcycle repair', 'music lessons', 'music stores',
    // N-O
    'nail technicians', 'nannies', 'naturopaths', 'neurologists', 'notaries public',
    'nurse practitioners', 'nursing homes', 'nutritionists',
    'obstetricians', 'occupational therapists', 'oil change', 'oncologists', 'ophthalmologists',
    'opticians', 'optometrists', 'oral surgeons', 'organic food', 'orthodontics',
    'orthopedic surgeons', 'osteopaths', 'outdoor furniture',
    // P
    'packing services', 'paint stores', 'paper shredding', 'party planners', 'party supplies',
    'passport services', 'patio covers', 'pawn shops', 'payroll services', 'pediatricians',
    'periodontists', 'personal chefs', 'personal trainers', 'pet boarding', 'pet grooming',
    'pet sitting', 'pet stores', 'physical therapists', 'piano tuning', 'picture framing',
    'plastic surgeons', 'plating services', 'podiatrists', 'pool cleaning', 'pool contractors',
    'portable toilets', 'poster printing', 'power washing', 'pressure washing', 'private investigators',
    'private schools', 'process servers', 'propane', 'property management', 'prosthodontists',
    'psychiatrists', 'psychologists', 'public relations',
    // R
    'radiators', 'radon testing', 'real estate agents', 'real estate appraisers', 'recording studios',
    'recreation centers', 'recycling centers', 'reflexologists', 'refrigeration repair', 'rehabilitation',
    'rental cars', 'resale shops', 'residential cleaning', 'retirement communities', 'riding lessons',
    'road service', 'rock climbing', 'roller skating', 'roof inspection', 'rug cleaning',
    // S
    'safe dealers', 'sand blasting', 'satellite tv', 'scaffolding', 'screen repair',
    'scuba diving', 'security guards', 'security systems', 'senior care', 'septic services',
    'sewing machine repair', 'sharpening services', 'shoe repair', 'shutters', 'sign companies',
    'silk screening', 'skating rinks', 'ski shops', 'skin care', 'snow removal',
    'social workers', 'solar energy', 'sound systems', 'speech therapists', 'sporting goods',
    'sprinkler systems', 'staffing agencies', 'stained glass', 'stair lifts', 'stamp dealers',
    'storage units', 'storm damage', 'structural engineers', 'stucco', 'stump removal',
    'substance abuse', 'swimming lessons', 'swimming pools',
    // T-Z
    'tattoo shops', 'tax preparation', 'taxicab services', 'taxidermists', 'teeth whitening',
    'telephone systems', 'temp agencies', 'tennis courts', 'tent rental', 'termite control',
    'tile contractors', 'tire dealers', 'title companies', 'towing services', 'toy stores',
    'trailer rental', 'transmission repair', 'travel agencies', 'tree removal', 'tree trimming',
    'trophy shops', 'truck rental', 'tutors',
    'upholstery', 'urgent care clinics', 'used car dealers', 'utility trailers',
    'vacuum cleaners', 'vending machines', 'vinyl siding', 'vision care',
    'wallpaper', 'warehouse', 'waste management', 'water damage restoration', 'water heaters',
    'water treatment', 'web designers', 'wedding chapels', 'wedding planners', 'weed control',
    'welding', 'well drilling', 'wheelchair ramps', 'window cleaning', 'window installation',
    'window tinting', 'windshield repair', 'wine shops', 'woodworking',
    'x-ray services', 'yoga classes', 'youth organizations', 'zoo',

    // ═══════════════════════════════════════════════════
    // 21. 주소록 사이트 버튼/기능 텍스트 (EN - YP/Yelp/Google) ~150
    // ═══════════════════════════════════════════════════
    // YP 전용
    'map view', 'list view', 'grid view', 'all coupons', 'get started', 'get a quote', 'get quotes',
    'request a quote', 'request quote', 'free quote', 'free estimate', 'get estimate', 'free estimates',
    'claim this business', 'claim your listing', 'is this your business', 'add your business',
    'add a business', 'update listing', 'suggest an edit', 'edit business info',
    'write a review', 'leave a review', 'add a review', 'add review', 'rate this business',
    'find a business', 'find businesses', 'find near me', 'near me', 'find local',
    'browse categories', 'browse by category', 'browse all', 'all categories',
    'see all results', 'show results', 'results for', 'showing results', 'no results found',
    'did you mean', 'related searches', 'people also searched', 'similar businesses',
    'also viewed', 'recently viewed', 'you might also like',
    'open now', 'closed now', 'open 24 hours', 'by appointment', 'walk-ins welcome', 'call for hours',
    'accepts credit cards', 'accepts insurance', 'wheelchair accessible', 'parking available',
    'get directions', 'call now', 'call today', 'call us', 'call for details', 'visit website',
    'visit us', 'message us', 'send message', 'send email', 'email us', 'email this business',
    'from the business', 'business info', 'business details', 'business description',
    'years in business', 'established', 'serving area', 'service area', 'areas served',
    'specialties', 'specialties include', 'services offered', 'products offered', 'amenities',
    'payment methods', 'languages spoken', 'credentials', 'certifications',
    'bbb rating', 'bbb accredited', 'accredited', 'licensed', 'bonded', 'insured',
    'read reviews', 'all reviews', 'recent reviews', 'highest rated', 'lowest rated',
    'sort reviews', 'filter reviews', 'review highlights',
    'photos from the business', 'user photos', 'add photos', 'add a photo', 'see all photos',
    'report this listing', 'report a problem', 'not a real place',
    'sponsored results', 'sponsored listings', 'promoted results', 'advertisement',
    'other places nearby', 'nearby businesses', 'nearby restaurants', 'nearby hotels',
    // Yelp 전용
    'start your search', 'more categories', 'top categories', 'more businesses',
    'cost estimate', 'request an appointment', 'book a table', 'join the waitlist',
    'order delivery', 'order pickup', 'start delivery order', 'outdoor seating',
    'offers delivery', 'offers takeout', 'takes reservations', 'good for groups',
    'good for kids', 'dogs allowed', 'gender neutral restrooms',
    'hot and new', 'yelp guaranteed', 'request a call back',
    // Google Maps
    'suggest missing place', 'add a missing place', 'explore nearby', 'transit', 'cycling', 'driving',
    'in this area', 'all filters', 'top picks for you', 'updated', 'hours updated',

    // ═══════════════════════════════════════════════════
    // 22. 주소록 사이트 버튼/기능 텍스트 (KO) ~80
    // ═══════════════════════════════════════════════════
    '지도뷰', '목록뷰', '지호보기', '전체쿠폰', '시작하기', '견적받기', '무료견적',
    '업체등록', '업체수정', '리뷰쓰기', '리뷰작성', '평점남기기', '별점남기기',
    '내주변', '내근처', '근처에서찾기', '주변업체', '주변맛집', '주변호텔',
    '전체결과보기', '결과없음', '검색결과없음', '추천검색어', '관련검색',
    '영업중', '영업종료', '24시간영업', '예약필수', '방문예약',
    '신용카드가능', '주차가능', '무장애시설', '배달가능', '포장가능',
    '전화하기', '전화걸기', '오늘전화', '웹사이트방문', '메시지보내기', '이메일보내기',
    '업체정보', '업체소개', '영업기간', '서비스지역', '제공서비스',
    '자격증', '인증', '보험가입', '면허',
    '최근리뷰', '리뷰정렬', '리뷰필터', '사진보기', '사진추가',
    '이업체신고', '허위업체신고', '정보오류신고',
    '스폰서', '광고결과', '추천업체',

    // ═══════════════════════════════════════════════════
    // 23. 주소록 사이트 버튼/기능 텍스트 (JP) ~80
    // ═══════════════════════════════════════════════════
    'マップビュー', 'リストビュー', '全クーポン', '始める', '見積もり依頼', '無料見積もり',
    '店舗登録', '店舗編集', 'クチコミを書く', 'レビューを書く', '評価する', '星をつける',
    '近くのお店', '周辺のお店', '現在地から探す', '周辺施設',
    '全件表示', '検索結果なし', '関連検索', 'おすすめ検索', '人気のスポット', '人気のエリア', '人気の条件',
    'から探す', 'で探す', 'から選ぶ', 'で選ぶ', 'を探す', 'を見る', 'はこちら', 'はコチラ',
    '人気ランキング', '売れ筋ランキング', '注目ランキング', '新着ランキング', '急上昇',
    'おすすめスポット', 'おすすめエリア', 'おすすめ条件', '周辺のスポット', '周辺のエリア',
    '近くのスポット', '近くのエリア', '周辺の施設', '近隣の施設', '最寄り', '最寄駅',
    '営業中', '営業終了', '24時間営業', '要予約', '来店予約',
    'クレジットカード可', '駐車場あり', 'バリアフリー', 'デリバリー可', 'テイクアウト可',
    '電話する', '電話をかける', '今すぐ電話', 'ウェブサイトを見る', 'メッセージを送る',
    '店舗情報', '店舗紹介', '営業年数', 'サービスエリア', '提供サービス',
    '資格', '認定', '保険加入', '免許',
    '最新クチコミ', 'クチコミ並び替え', '写真を見る', '写真を追加',
    'この店舗を報告', '不正店舗報告', '情報の誤り報告',
    'スポンサー', '広告結果',

    // ═══════════════════════════════════════════════════
    // 24. "X in Y" 패턴 (직종 in 지역명 조합) ~120
    // ═══════════════════════════════════════════════════
    // "Category in City" 패턴 차단 (자주 등장하는 조합)
    'electricians in', 'plumbers in', 'dentists in', 'lawyers in', 'restaurants in',
    'hotels in', 'doctors in', 'mechanics in', 'contractors in', 'roofers in',
    'painters in', 'florists in', 'salons in', 'cleaners in', 'movers in',
    'tutors in', 'gyms in', 'barbers in', 'spas in', 'cafes in',
    'auto repair in', 'pet grooming in', 'yoga in', 'nail salons in', 'bakeries in',
    'pharmacies in', 'banks in', 'insurance in', 'realtors in', 'storage in',
    'best restaurants in', 'best hotels in', 'best dentists in', 'best lawyers in',
    'best plumbers in', 'best electricians in', 'best contractors in', 'best doctors in',
    'top restaurants in', 'top hotels in', 'top dentists in', 'top lawyers in',
    'cheap hotels in', 'cheap restaurants in', 'affordable dentists in',
    'near', 'nearby', 'near me', 'close to me', 'around me', 'in my area', 'in the area',
    // KO 직종+지역 패턴
    '맛집 추천', '호텔 추천', '병원 추천', '치과 추천', '변호사 추천',
    '근처 맛집', '근처 병원', '근처 약국', '근처 주유소', '근처 편의점',
    '주변 맛집', '주변 카페', '주변 호텔', '주변 병원', '주변 숙소',
    '서울 맛집', '부산 맛집', '제주 맛집', '강남 맛집', '홍대 맛집',
    '서울 호텔', '부산 호텔', '제주 호텔', '강남 호텔',
    '서울 병원', '부산 병원', '서울 치과', '서울 변호사',
    // JP 直種+地域 パターン
    '近くのレストラン', '近くのホテル', '近くの病院', '近くの歯科', '近くのコンビニ',
    '周辺のレストラン', '周辺のホテル', '周辺の病院',
    '東京 レストラン', '大阪 ホテル', '京都 旅館', '東京 歯科', '大阪 美容院',
    'おすすめレストラン', 'おすすめホテル', 'おすすめカフェ',
    '人気レストラン', '人気ホテル', '人気カフェ',

    // ═══════════════════════════════════════════════════
    // 26. 일본어 추가 필터 - 음식/시설 정보 접미어 (JP) ~100
    // ═══════════════════════════════════════════════════
    'の施設概要', 'の施設情報', 'の施設案内', 'の施設紹介', 'の基本情報', 'の基本データ',
    'の詳細', 'の詳細정보', 'の概要', 'の案内', 'の紹介', 'の特徴', 'の魅力',
    'のお知らせ', 'のご案内', 'のご紹介', 'のご連絡', 'のご予約', 'のお問い合わせ', 'のお問合わせ', 'のお問合せ',
    'の口コミ', 'のクチコミ', 'のレビュー', 'の評価', 'の評判', 'の感想', 'の体験談',
    'の写真', 'の画像', 'の動画', 'のフォト',
    'の料金', 'の価格', 'のプラン', 'のコース', 'のメニュー', 'の予約', 'の空室', 'の在庫', 'のカレンダー',
    'のアクセス', 'の地図', 'のマップ', 'の交通', 'の駐車場', 'の行き方', 'の周辺', 'の周辺情報', 'の近く',
    'のブログ', 'の日記', 'の新着', 'の最新', 'の更新', 'のニュース', 'のトピックス', 'のお得情報',
    'の求人', 'の採用', 'のスタッフ', 'の会社概要', 'の企業情報', 'の沿革', 'の歴史', 'の理念',
    'の設備', 'のサービス', 'のアメニティ', 'の温泉', 'のお風呂', 'のお食事', 'の朝食', 'の夕食', 'のディナー', 'のランチ',
    'の客室', 'のお部屋', 'のルーム', 'の宿泊', 'の滞在', 'のチェックイン', 'のチェックアウト',
    'のよくある質問', 'のFAQ', 'のQ&A', 'のヘルプ', 'の使い方', 'の利用方法', 'の利用規約',

    // ═══════════════════════════════════════════════════
    // 27. 일본어 추가 필터 - 광고/홍보성 문구 (JP) ~150
    // ═══════════════════════════════════════════════════
    '公式サイトはこちら', '公式HPはこちら', 'ご予約はこちらから', 'お申し込みはこちら', '詳細はこちら',
    '今すぐチェック', '今すぐ予約', '今すぐ購入', '限定セール開催中', '最大割引', '格安プラン',
    '選바れる理由', '人気の秘密', '徹底比較', 'おすすめランキング', '厳選ショップ',
    '送料無料', '即日発送', '最短お届け', 'ギフト対応', 'のし無料',
    'ポイント還元', 'キャッシュバック', 'キャンペーン実施中', '新規会員募集中', 'メルマガ登録で',
    '初回限定', '期間限定', '数量限定', '先着順', '売り切れ御免',
    '業界最安値', '日本最大級', '世界初', '特許取得', 'メディアで話題', 'テレビで紹介',
    '口コミで評判', '리피터続出', '顧客満足度No.1', '安心のサポート', '24時間対応',

    // ═══════════════════════════════════════════════════
    // 28. 일본어 추가 필터 - 지명/위치 수식어 (JP) ~100
    // ═══════════════════════════════════════════════════
    '駅前店', '駅近', '徒歩圏内', 'アクセス抜群', '好立地',
    '〇〇駅から徒歩', '〇〇ICから車で', '国道〇〇号沿い',
    '地下直結', '雨に濡れずに', '駐車場完備', '大型駐車場あり',
    '都内某所', '隠れ家的な', '静かな環境', 'オーシャンビュー', '리버사이트',
    '最寄り駅は', '周辺マップ', 'お車でお越しの方', '公共交通機関で',

    // ═══════════════════════════════════════════════════
    // 29. 일본어 추가 필터 - 상태/동작 (JP) ~100
    // ═══════════════════════════════════════════════════
    '予約受付中', '好評発売中', '残りわずか', '売り切れ', '入荷待ち', '近日オープン',
    '리뉴얼했습니다', '移転しました', '営業時間が変更', '臨時休業のお知らせ',
    'お問い合わせください', 'お気軽にご相談', 'まずはお見積もり', '無料体験受付中',
    '資料請求はこちら', 'サンプルプレゼント', 'アンケートにご協力',

    // ═══════════════════════════════════════════════════
    // 30. 일본어 추가 필터 - 문장형/질문형 (JP) ~100
    // ═══════════════════════════════════════════════════
    'とは', 'って何？', 'はどうなの？', 'の選び方', 'を安く買う方法',
    'を比較してみた', 'に行ってみた', 'を食べてみた', 'を使ってみた感想',
    'でお悩みの方', 'に興味がある方', 'をお探しの方', 'におすすすめのは',
    'のメリットとデメリット', 'の注意점', 'のコツ', 'の裏技',


    // ═══════════════════════════════════════════════════
    // 25. 추가 웹사이트 버튼/CTA 텍스트 (Multi) ~100
    // ═══════════════════════════════════════════════════
    'get started', 'get started now', 'get started today', 'get started free',
    'try it free', 'try for free', 'try now', 'start free trial', 'start now', 'start today',
    'sign up free', 'sign up now', 'sign up today', 'join free', 'join now', 'join today',
    'create account', 'create free account', 'create your account',
    'request demo', 'request a demo', 'schedule demo', 'book a demo', 'watch demo',
    'talk to sales', 'contact sales', 'talk to us', 'talk to an expert',
    'claim your free', 'claim offer', 'claim deal', 'redeem offer', 'activate offer',
    'add to favorites', 'save to favorites', 'add to wishlist', 'save for later',
    'compare plans', 'compare prices', 'compare products', 'see plans', 'view plans',
    'show on map', 'view on map', 'open in maps', 'open in google maps', 'open in app',
    'rate us', 'rate this app', 'review us', 'leave feedback',
    'accept all', 'accept all cookies', 'reject all', 'customize', 'manage preferences',
    'allow notifications', 'block notifications', 'enable notifications',
    'install app', 'update app', 'rate app',
    'loading', 'please wait', 'processing', 'submitting', 'saving',
    'error', 'success', 'warning', 'notice', 'attention', 'important',
    'go to top', 'back to top', 'scroll to top', 'return to top',
    'read our blog', 'visit our blog', 'latest posts', 'latest articles',
    // KO 버튼
    '무료체험', '무료시작', '지금시작', '오늘시작', '바로시작',
    '무료가입', '지금가입', '회원가입하기',
    '데모요청', '상담요청', '전문가상담',
    '즐겨찾기추가', '위시리스트추가', '나중에보기',
    '지도에서보기', '앱에서열기', '앱설치',
    '맨위로', '위로가기', '상단으로',
    '로딩중', '처리중', '저장중', '전송중',
    // JP 버튼
    '無料体験', '今すぐ始める', '無料登録', '無料で始める',
    'デモを見る', '相談する', '専門家に相談',
    'お気に入りに追加', 'ウィッシュリストに追加', 'あとで見る',
    '地図で見る', 'アプリで開く', 'アプリをインストール',
    'トップに戻る', 'ページトップへ',
    '読み込み中', '処理中', '保存中', '送信中',

    // ═══════════════════════════════════════════════════
    // 26. 음식/요리 유형 (단독 = 카테고리, 업소명 아님) (Multi) ~200
    // ═══════════════════════════════════════════════════
    'pizza', 'pasta', 'sushi', 'ramen', 'tacos', 'burritos', 'burgers', 'hamburgers', 'sandwiches',
    'steak', 'steakhouse', 'seafood', 'bbq', 'barbecue', 'fried chicken', 'chicken wings', 'wings',
    'chinese food', 'japanese food', 'korean food', 'thai food', 'indian food', 'mexican food',
    'italian food', 'french food', 'vietnamese food', 'greek food', 'mediterranean food',
    'american food', 'fast food', 'junk food', 'comfort food', 'soul food', 'street food',
    'vegan', 'vegetarian', 'gluten free', 'organic', 'farm to table', 'fine dining', 'casual dining',
    'buffet', 'all you can eat', 'brunch', 'breakfast', 'lunch', 'dinner', 'dessert', 'desserts',
    'ice cream', 'frozen yogurt', 'smoothies', 'juice bar', 'tea', 'bubble tea', 'boba',
    'coffee', 'espresso', 'latte', 'cappuccino', 'americano', 'mocha',
    'beer', 'wine', 'cocktails', 'spirits', 'sake', 'soju', 'whiskey', 'vodka',
    'appetizers', 'entrees', 'sides', 'soups', 'salads', 'noodles', 'rice', 'curry', 'dim sum',
    'tapas', 'fondue', 'crepes', 'waffles', 'pancakes', 'donuts', 'bagels', 'croissants',
    'pho', 'pad thai', 'teriyaki', 'tempura', 'udon', 'yakitori', 'okonomiyaki', 'tonkatsu',
    'bibimbap', 'bulgogi', 'kimchi', 'tteokbokki', 'samgyeopsal', 'galbi', 'jjigae',
    'dumplings', 'spring rolls', 'satay', 'laksa', 'rendang', 'nasi goreng',
    'shawarma', 'falafel', 'hummus', 'kebab', 'gyros', 'souvlaki',
    'paella', 'risotto', 'gnocchi', 'lasagna', 'ravioli', 'tiramisu', 'gelato', 'panna cotta',
    'croissant', 'baguette', 'quiche', 'escargot', 'ratatouille',
    'fish and chips', 'bangers and mash', 'shepherd pie', 'scones',
    // KO 음식
    '짜장면', '짬뽕', '탕수육', '깐풍기', '마라탕', '마라샹궈',
    '떡볶이', '순대', '튀김', '어묵', '라면', '칼국수', '수제비', '만두', '전',
    '갈비찜', '불고기', '갈비탕', '설렁탕', '곰탕', '감자탕', '닭갈비', '닭볶음탕',
    '삼겹살', '소고기', '돼지고기', '닭고기', '오리', '양고기',
    '회', '초밥', '사시미', '우동', '소바', '돈카츠', '오코노미야키',
    // JP 料理
    '和食', '洋食', '中華', 'イタリアン', 'フレンチ', 'エスニック', 'アジアン',
    '天ぷら', '刺身', '鉄板焼き', 'しゃぶしゃぶ', 'すき焼き', '海鮮丼', '親子丼', '牛丼',
    'お好み焼き', 'たこ焼き', '焼き鳥', '唐揚げ', 'カレー', 'ハンバーグ', 'オムライス',

    // ═══════════════════════════════════════════════════
    // 27. 의료/건강 세부 전문분야 (EN/KO/JP) ~150
    // ═══════════════════════════════════════════════════
    'family medicine', 'internal medicine', 'general practice', 'primary care',
    'cardiology', 'dermatology', 'endocrinology', 'gastroenterology', 'geriatrics',
    'hematology', 'immunology', 'infectious disease', 'nephrology', 'neurology',
    'obstetrics', 'gynecology', 'ob/gyn', 'oncology', 'ophthalmology', 'orthopedics',
    'otolaryngology', 'pathology', 'pediatrics', 'plastic surgery', 'podiatry',
    'psychiatry', 'psychology', 'pulmonology', 'radiology', 'rheumatology',
    'sports medicine', 'surgery', 'urology', 'vascular surgery', 'anesthesiology',
    'chiropractic', 'acupuncture', 'homeopathy', 'naturopathy', 'osteopathy',
    'physical therapy', 'occupational therapy', 'speech therapy', 'respiratory therapy',
    'dental', 'dental care', 'cosmetic dentistry', 'implant dentistry', 'pediatric dentistry',
    'urgent care', 'walk-in clinic', 'telemedicine', 'telehealth', 'concierge medicine',
    // KO
    '가정의학과', '응급의학과', '핵의학과', '진단검사의학과', '재활의학과',
    '비뇨기과', '흉부외과', '신경외과', '성형외과', '구강외과',
    '한방내과', '한방외과', '침구과', '한방소아과', '한방부인과',
    '통증의학과', '마취통증의학과', '영상의학과', '방사선종양학과',
    // JP
    '総合内科', '消化器内科', '循環器内科', '呼吸器内科', '神経内科',
    '外科', '整形外科', '形成外科', '脳神経外科', '心臓外科',
    '泌尿器科', '産婦人科', '放射線科', '麻酔科', '救急科',
    'リハビリテーション科', '緩和ケア', '在宅医療',

    // ═══════════════════════════════════════════════════
    // 28. 추가 세계 도시/지역 (중소도시 포함) ~400
    // ═══════════════════════════════════════════════════
    // US 중소도시
    'scottsdale', 'plano', 'chandler', 'henderson', 'irvine', 'irving', 'glendale',
    'hialeah', 'garland', 'chesapeake', 'north las vegas', 'laredo', 'gilbert',
    'winston-salem', 'reno', 'baton rouge', 'akron', 'modesto', 'fremont', 'fontana',
    'moreno valley', 'glendale', 'yonkers', 'huntington beach', 'santa clarita',
    'garden grove', 'oceanside', 'rancho cucamonga', 'ontario', 'santa rosa', 'elk grove',
    'salem', 'cary', 'santa clara', 'ann arbor', 'peoria', 'springfield', 'princeton',
    'berkeley', 'pasadena', 'burbank', 'beverly hills', 'santa monica', 'west hollywood',
    'manhattan', 'brooklyn', 'queens', 'bronx', 'staten island', 'harlem',
    'williamsburg', 'soho', 'tribeca', 'chelsea', 'midtown', 'downtown', 'uptown',
    'georgetown', 'dupont circle', 'capitol hill', 'union square', 'times square',
    'hollywood', 'venice beach', 'malibu', 'redondo beach', 'hermosa beach',
    'newport beach', 'laguna beach', 'palm springs', 'palm beach', 'key west',
    'napa valley', 'sonoma', 'aspen', 'telluride', 'park city', 'sedona', 'scottsdale',
    // UK
    'leeds', 'sheffield', 'bristol', 'nottingham', 'leicester', 'newcastle', 'cardiff',
    'belfast', 'brighton', 'oxford', 'cambridge', 'bath', 'york', 'canterbury',
    'windsor', 'stratford', 'westminster', 'soho', 'shoreditch', 'camden', 'hackney',
    'kensington', 'chelsea', 'mayfair', 'covent garden', 'notting hill',
    // France
    'bordeaux', 'toulouse', 'strasbourg', 'nantes', 'montpellier', 'lille',
    'rennes', 'grenoble', 'dijon', 'aix-en-provence', 'cannes', 'saint-tropez',
    // Germany
    'frankfurt', 'cologne', 'dusseldorf', 'stuttgart', 'dortmund', 'essen', 'leipzig',
    'bremen', 'dresden', 'hanover', 'nuremberg', 'heidelberg', 'freiburg',
    // Italy
    'turin', 'bologna', 'genoa', 'palermo', 'catania', 'verona', 'padua', 'bari',
    'pisa', 'siena', 'ravenna', 'perugia', 'sorrento', 'amalfi', 'positano',
    // Spain
    'valencia', 'seville', 'malaga', 'bilbao', 'granada', 'cordoba', 'toledo',
    'san sebastian', 'palma', 'ibiza', 'tenerife', 'las palmas',
    // Asia extended
    'yokohama', 'kobe', 'nagoya', 'sapporo', 'fukuoka', 'nara', 'kanazawa', 'hiroshima',
    'okinawa', 'hakone', 'nikko', 'kamakura', 'atami', 'beppu',
    'daegu', 'daejeon', 'gwangju', 'incheon', 'ulsan', 'jeju',
    'suwon', 'seongnam', 'goyang', 'yongin', 'changwon',
    'shenzhen', 'guangzhou', 'chengdu', 'hangzhou', 'wuhan', 'nanjing', 'xian', 'suzhou',
    'chiang mai', 'phuket', 'pattaya', 'krabi', 'koh samui',
    'bali', 'yogyakarta', 'bandung', 'surabaya',
    'cebu', 'boracay', 'palawan',
    'da nang', 'hoi an', 'sapa', 'nha trang', 'halong bay',
    'penang', 'langkawi', 'johor bahru', 'malacca', 'kota kinabalu',
    'siem reap', 'phnom penh', 'luang prabang', 'vientiane',
    'kathmandu', 'pokhara', 'colombo', 'galle',
    'goa', 'jaipur', 'agra', 'varanasi', 'udaipur', 'kochi', 'hyderabad', 'pune',
    // Middle East / Africa
    'marrakech', 'fez', 'casablanca', 'cairo', 'luxor', 'hurghada', 'sharm el sheikh',
    'amman', 'petra', 'muscat', 'salalah', 'manama', 'kuwait city', 'jeddah', 'medina',
    'cape town', 'johannesburg', 'durban', 'nairobi', 'zanzibar', 'dar es salaam',
    // Central/South America
    'playa del carmen', 'tulum', 'puerto vallarta', 'cabo san lucas', 'oaxaca',
    'cartagena', 'medellin', 'cusco', 'machu picchu', 'quito', 'guayaquil',
    'montevideo', 'punta del este', 'valparaiso', 'la paz', 'sucre',
    // Oceania
    'gold coast', 'cairns', 'hobart', 'darwin', 'canberra', 'christchurch', 'queenstown',

    // ═══════════════════════════════════════════════════
    // 29. 거리/도로명 관련 (EN/KO/JP) ~100
    // ═══════════════════════════════════════════════════
    'street', 'avenue', 'boulevard', 'road', 'drive', 'lane', 'way', 'court', 'place',
    'circle', 'terrace', 'trail', 'loop', 'parkway', 'highway', 'freeway', 'expressway',
    'turnpike', 'pike', 'route', 'alley', 'path', 'crossing', 'pass', 'ridge',
    'main street', 'broadway', 'high street', 'market street', 'park avenue',
    'first street', 'second street', 'third street', 'fourth street', 'fifth avenue',
    'sunset blvd', 'wilshire blvd', 'hollywood blvd', 'melrose ave', 'rodeo drive',
    'michigan ave', 'madison ave', 'lexington ave', 'wall street', 'broadway',
    '번지', '번길', '대로', '로', '길', '동', '리', '층', '호',
    '국도', '고속도로', '순환로', '지방도',
    '通り', '丁目', '番地', '号', '階', '国道', '県道', '高速道路',

    // ═══════════════════════════════════════════════════
    // 30. 웹사이트 메타데이터/구조 텍스트 (Multi) ~150
    // ═══════════════════════════════════════════════════
    'default', 'n/a', 'none', 'null', 'undefined', 'unknown', 'untitled', 'no title',
    'placeholder', 'test', 'sample', 'example', 'demo', 'preview', 'draft',
    'lorem ipsum', 'tbd', 'tba', 'coming soon', 'under construction', 'maintenance',
    'page not found', '404', '403', '500', 'error', 'forbidden', 'not found',
    'access denied', 'unauthorized', 'server error', 'timeout', 'connection refused',
    'results', 'result', 'no results', 'no results found', 'showing', 'displayed',
    'showing results for', 'did you mean', 'related', 'similar', 'also',
    'advertisement', 'sponsored content', 'promoted', 'partner content', 'affiliate',
    'see also', 'related articles', 'you may also like', 'recommended for you',
    'table of contents', 'navigation', 'breadcrumb', 'breadcrumbs', 'pagination',
    'copyright', 'all rights reserved', 'privacy policy', 'terms of service',
    'cookie notice', 'we use cookies', 'accept cookies', 'cookie settings',
    'select language', 'choose language', 'translate', 'translation',
    'skip to content', 'skip to main content', 'jump to', 'go to',
    'read more', 'continue reading', 'full article', 'full story',
    'share on facebook', 'share on twitter', 'share on linkedin', 'share via email',
    'print this page', 'save as pdf', 'email this', 'send to friend',
    'subscribe to newsletter', 'enter your email', 'your email address',
    'stay updated', 'get updates', 'sign up for updates', 'join our mailing list',
    // KO
    '검색결과', '관련글', '추천글', '인기글', '최신글', '조회수', '댓글수',
    '작성자', '작성일', '수정일', '조회', '추천수', '공감수',
    '본문바로가기', '메뉴바로가기', '컨텐츠바로가기',
    '쿠키사용', '쿠키설정', '언어선택', '번역',
    '페이지없음', '접근거부', '서버오류',
    // JP
    '検索結果', '関連記事', 'おすすめ記事', '人気記事', '最新記事', '閲覧数', 'コメント数',
    '作成者', '作成日', '更新日', '閲覧', '共感数',
    '本文へ', 'メニューへ', 'コンテンツへ',
    'Cookieの使用', 'Cookie設定', '言語選択', '翻訳',

    // ═══════════════════════════════════════════════════
    // 31. 자동차/차량 관련 (Multi) ~120
    // ═══════════════════════════════════════════════════
    'auto body', 'auto glass', 'auto parts', 'auto repair', 'auto sales', 'auto service',
    'body shop', 'brake repair', 'brake service', 'car accessories', 'car audio',
    'car battery', 'car care', 'car cleaning', 'car dealership', 'car detailing',
    'car electronics', 'car inspection', 'car leasing', 'car loans', 'car maintenance',
    'car painting', 'car polishing', 'car rental', 'car service', 'car stereo',
    'car tuning', 'car upholstery', 'car valeting', 'car wrapping', 'classic cars',
    'collision repair', 'dent repair', 'diesel mechanic', 'emission testing',
    'engine repair', 'exhaust repair', 'flat tire', 'fuel injection', 'headlight repair',
    'hybrid repair', 'import auto repair', 'muffler shop', 'oil change', 'paint protection',
    'pre-purchase inspection', 'radiator repair', 'rust proofing', 'smog check',
    'suspension repair', 'tire alignment', 'tire balancing', 'tire rotation', 'tire shop',
    'tire store', 'towing', 'tow truck', 'transmission', 'transmission repair',
    'truck repair', 'tune up', 'used cars', 'vehicle inspection', 'wheel alignment',
    'windshield replacement', 'windshield repair', 'wiper replacement',
    // KO
    '자동차정비', '차량정비', '엔진오일교환', '타이어교체', '배터리교체',
    '판금도색', '유리수리', '에어컨수리', '브레이크수리', '변속기수리',
    '차량검사', '배출가스검사', '차량보험', '렌트카', '중고차',
    // JP
    '自動車整備', '車検', 'オイル交換', 'タイヤ交換', 'バッテリー交換',
    '板金塗装', 'ガラス修理', 'エアコン修理', 'ブレーキ修理',
    '車両検査', '排気ガス検査', 'レンタカー', '中古車',

    // ═══════════════════════════════════════════════════
    // 32. 금융/은행 서비스 (Multi) ~120
    // ═══════════════════════════════════════════════════
    'savings account', 'checking account', 'money market', 'certificate of deposit',
    'credit card', 'debit card', 'prepaid card', 'business credit card',
    'personal loan', 'business loan', 'auto loan', 'student loan', 'home loan',
    'mortgage', 'refinance', 'reverse mortgage', 'home equity', 'line of credit',
    'investment', 'investments', 'mutual funds', 'index funds', 'etf', 'bonds', 'stocks',
    'retirement', '401k', 'ira', 'roth ira', 'pension', 'annuity',
    'financial planning', 'wealth management', 'asset management', 'portfolio',
    'tax preparation', 'tax filing', 'tax return', 'tax advisor', 'tax consultant',
    'bookkeeping', 'payroll', 'invoicing', 'billing',
    'life insurance', 'health insurance', 'car insurance', 'home insurance',
    'renters insurance', 'business insurance', 'liability insurance', 'disability insurance',
    'dental insurance', 'vision insurance', 'travel insurance', 'pet insurance',
    'claims', 'coverage', 'deductible', 'premium', 'co-pay', 'network',
    // KO
    '보통예금', '정기예금', '적금', '신용카드', '체크카드', '대출', '주택담보대출',
    '투자', '펀드', '주식', '채권', '보험료', '보험금청구', '재무설계',
    '세금신고', '부가가치세', '소득세', '법인세', '연말정산',
    // JP
    '普通預金', '定期預金', '積立', 'クレジットカード', 'ローン', '住宅ローン',
    '投資', 'ファンド', '株式', '債券', '保険料', '保険金請求', '資産運用',
    '確定申告', '消費税', '所得税', '法人税',

    // ═══════════════════════════════════════════════════
    // 33. 정부/공공 서비스 (Multi) ~100
    // ═══════════════════════════════════════════════════
    'city hall', 'town hall', 'county office', 'state office', 'federal office',
    'post office', 'dmv', 'department of motor vehicles', 'social security',
    'public library', 'fire department', 'fire station', 'police department', 'police station',
    'court', 'courthouse', 'municipal court', 'district court', 'superior court',
    'public school', 'public library', 'community center', 'recreation center',
    'public park', 'national park', 'state park', 'wildlife refuge',
    'voter registration', 'building permits', 'business license', 'zoning',
    'water utility', 'electric utility', 'gas utility', 'sewer', 'waste management',
    'public transit', 'bus route', 'train schedule', 'ferry schedule',
    // KO
    '시청', '구청', '동사무소', '주민센터', '우체국', '소방서', '경찰서', '파출소',
    '법원', '검찰청', '세무서', '등기소', '출입국관리사무소',
    '도서관', '문화센터', '체육관', '공원관리사무소',
    '차량등록사업소', '운전면허시험장',
    // JP
    '市役所', '区役所', '町役場', '村役場', '郵便局', '消防署', '警察署', '交番',
    '裁判所', '検察庁', '税務署', '法務局', '入国管理局',
    '図書館', '文化センター', '体育館', '公園管理事務所',

    // ═══════════════════════════════════════════════════
    // 34. 스포츠/레크리에이션 (Multi) ~100
    // ═══════════════════════════════════════════════════
    'basketball', 'baseball', 'football', 'soccer', 'tennis', 'golf', 'swimming',
    'hockey', 'volleyball', 'rugby', 'cricket', 'boxing', 'wrestling', 'martial arts',
    'track and field', 'cross country', 'skiing', 'snowboarding', 'surfing', 'skateboarding',
    'cycling', 'running', 'jogging', 'hiking', 'camping', 'fishing', 'hunting',
    'bowling', 'billiards', 'archery', 'fencing', 'gymnastics', 'cheerleading',
    'dance', 'ballet', 'salsa', 'zumba', 'crossfit', 'spinning',
    'rock climbing', 'bouldering', 'kayaking', 'canoeing', 'rafting', 'sailing',
    'scuba diving', 'snorkeling', 'parasailing', 'skydiving', 'bungee jumping',
    'go kart', 'paintball', 'laser tag', 'escape room', 'trampoline park',
    'mini golf', 'batting cage', 'driving range', 'shooting range',
    // KO
    '축구', '야구', '농구', '배구', '테니스', '골프', '수영', '탁구', '배드민턴',
    '태권도', '유도', '합기도', '검도', '씨름',
    '등산', '트레킹', '캠핑', '낚시', '서핑', '스키', '스노보드',
    // JP
    'サッカー', '野球', 'バスケットボール', 'バレーボール', 'テニス', 'ゴルフ', '水泳',
    '卓球', 'バドミントン', '柔道', '空手', '剣道', '相撲',
    '登山', 'キャンプ', '釣り', 'サーフィン', 'スキー', 'スノーボード',

    // ═══════════════════════════════════════════════════
    // 35. 엔터테인먼트/문화 (Multi) ~100
    // ═══════════════════════════════════════════════════
    'movie theater', 'cinema', 'theater', 'concert hall', 'arena', 'stadium', 'amphitheater',
    'museum', 'art museum', 'science museum', 'history museum', 'children museum',
    'amusement park', 'theme park', 'water park', 'zoo', 'aquarium', 'botanical garden',
    'comedy club', 'jazz club', 'music venue', 'live music', 'karaoke',
    'escape room', 'arcade', 'bowling alley', 'skating rink', 'laser tag',
    'miniature golf', 'go kart', 'trampoline park', 'indoor playground',
    'casino', 'slot machines', 'poker room', 'horse racing', 'dog racing',
    'festival', 'fair', 'carnival', 'parade', 'fireworks', 'block party',
    'planetarium', 'observatory', 'winery', 'vineyard', 'brewery', 'distillery',
    // KO
    '영화관', '극장', '공연장', '콘서트홀', '경기장', '미술관', '박물관',
    '놀이공원', '테마파크', '워터파크', '동물원', '수족관', '식물원',
    '코미디클럽', '재즈바', '라이브카페', '노래방',
    '방탈출', '오락실', '볼링장', '스케이트장',
    // JP
    '映画館', '劇場', 'コンサートホール', 'スタジアム', '美術館', '博物館',
    '遊園地', 'テーマパーク', 'ウォーターパーク', '動物園', '水族館', '植物園',
    'ライブハウス', 'カラオケ', 'アーケード', 'ボウリング場',

    // ═══════════════════════════════════════════════════
    // 36. 기술/IT 서비스 (EN) ~100
    // ═══════════════════════════════════════════════════
    'web design', 'web development', 'app development', 'mobile development', 'software development',
    'it support', 'it services', 'it consulting', 'managed it', 'cloud services',
    'cybersecurity', 'network security', 'data backup', 'disaster recovery',
    'computer repair', 'laptop repair', 'phone repair', 'tablet repair', 'screen repair',
    'virus removal', 'malware removal', 'spyware removal', 'data recovery',
    'network setup', 'wifi setup', 'server setup', 'email setup', 'voip',
    'seo', 'sem', 'ppc', 'digital marketing', 'social media marketing',
    'content marketing', 'email marketing', 'affiliate marketing', 'influencer marketing',
    'graphic design', 'logo design', 'branding', 'ui design', 'ux design',
    'video production', 'animation', '3d modeling', 'virtual reality', 'augmented reality',
    'ai', 'machine learning', 'data science', 'big data', 'blockchain', 'cryptocurrency',
    'saas', 'paas', 'iaas', 'devops', 'agile', 'scrum',
    'erp', 'crm', 'pos', 'inventory management', 'project management',
    'help desk', 'tech support', 'remote support', 'on-site support',

    // ═══════════════════════════════════════════════════
    // 37. 부동산/하우징 (Multi) ~100
    // ═══════════════════════════════════════════════════
    'for sale', 'for rent', 'for lease', 'available', 'pending', 'sold', 'rented', 'leased',
    'open house', 'virtual tour', 'floor plan', 'floor plans',
    'bedroom', 'bedrooms', 'bathroom', 'bathrooms', 'half bath',
    'square feet', 'sq ft', 'sqft', 'acres', 'lot size',
    'single family', 'multi family', 'condo', 'condominium', 'townhouse', 'townhome',
    'duplex', 'triplex', 'studio', 'loft', 'penthouse', 'cottage', 'bungalow',
    'commercial property', 'office space', 'retail space', 'warehouse space', 'industrial space',
    'foreclosure', 'short sale', 'auction', 'bank owned', 'reo',
    'mortgage calculator', 'payment calculator', 'affordability calculator',
    'school district', 'walk score', 'transit score', 'bike score',
    'hoa', 'hoa fees', 'property tax', 'property taxes',
    'listing agent', 'buyers agent', 'real estate agent', 'realtor', 'broker',
    'mls', 'mls listing', 'new listing', 'price reduced', 'just listed', 'just sold',
    // KO
    '매물', '매매', '전세', '월세', '임대', '분양', '입주', '청약',
    '원룸', '투룸', '쓰리룸', '오피스텔', '아파트', '빌라', '단독주택', '다세대', '다가구',
    '평수', '전용면적', '공급면적', '방수', '화장실수',
    '관리비', '보증금', '권리금',
    // JP
    '賃貸', '売買', '分譲', '仲介', '管理',
    'ワンルーム', '1K', '1DK', '1LDK', '2LDK', '3LDK', 'マンション', 'アパート', '一戸建て',
    '平米', '坪', '間取り', '敷金', '礼金', '管理費', '共益費',

    // ═══════════════════════════════════════════════════
    // 38. 교육/학습 관련 (Multi) ~100
    // ═══════════════════════════════════════════════════
    'elementary school', 'middle school', 'high school', 'charter school', 'magnet school',
    'montessori', 'waldorf', 'homeschool', 'online school', 'boarding school',
    'community college', 'technical school', 'trade school', 'vocational school',
    'graduate school', 'law school', 'medical school', 'business school', 'nursing school',
    'after school', 'before school', 'summer school', 'summer camp', 'day camp',
    'music school', 'art school', 'dance school', 'cooking school', 'driving school',
    'language school', 'esl', 'test prep', 'sat prep', 'act prep', 'gre prep', 'gmat prep',
    'tutoring', 'online tutoring', 'math tutoring', 'reading tutoring', 'writing tutoring',
    'special education', 'gifted education', 'adult education', 'continuing education',
    // KO
    '초등학교', '중학교', '고등학교', '대학교', '대학원', '전문대',
    '수학학원', '영어학원', '과학학원', '음악학원', '미술학원', '체육학원',
    '입시학원', '보습학원', '재수학원', '독서실', '자습실', '스터디카페',
    '유치원', '어린이집', '방과후학교', '방과후교실',
    // JP
    '小学校', '中学校', '高校', '高等学校', '大学', '大学院', '専門学校',
    '数学塾', '英語塾', '進学塾', '予備校', '個別指導', '家庭教師',
    '幼稚園', '保育園', '学童保育', '放課後教室',

    // ═══════════════════════════════════════════════════
    // 39. 복합 카테고리 구문 (EN "X and Y" / "X & Y") ~100
    // ═══════════════════════════════════════════════════
    'heating and cooling', 'heating & cooling', 'heating and air', 'heating & air',
    'plumbing and heating', 'plumbing & heating', 'electric and plumbing', 'electrical & plumbing',
    'lawn and garden', 'lawn & garden', 'home and garden', 'home & garden',
    'bath and body', 'bath & body', 'health and beauty', 'health & beauty',
    'food and drink', 'food & drink', 'wine and spirits', 'wine & spirits', 'beer and wine', 'beer & wine',
    'arts and crafts', 'arts & crafts', 'books and music', 'books & music',
    'sports and recreation', 'sports & recreation', 'toys and games', 'toys & games',
    'parts and accessories', 'parts & accessories', 'sales and service', 'sales & service',
    'design and build', 'design & build', 'supply and install', 'supply & install',
    'pick up and delivery', 'pickup & delivery', 'dine in and takeout', 'dine in & takeout',
    'breakfast and lunch', 'breakfast & lunch', 'lunch and dinner', 'lunch & dinner',
    'bed and bath', 'bed & bath', 'kitchen and bath', 'kitchen & bath',
    'lock and key', 'lock & key', 'washer and dryer', 'washer & dryer',
    'paint and wallpaper', 'paint & wallpaper', 'tile and stone', 'tile & stone',
    'doors and windows', 'doors & windows', 'blinds and shutters', 'blinds & shutters',
    'carpet and flooring', 'carpet & flooring', 'hardwood and laminate', 'hardwood & laminate',
    'roofing and siding', 'roofing & siding', 'gutters and downspouts',
    'tree and shrub', 'tree & shrub', 'pest and termite', 'pest & termite',
    'tax and accounting', 'tax & accounting', 'legal and financial', 'legal & financial',

    // ═══════════════════════════════════════════════════
    // 40. 추가 KO 세부 카테고리/서비스명 ~200
    // ═══════════════════════════════════════════════════
    '배관수리', '누수수리', '보일러수리', '에어컨설치', '에어컨수리', '전기수리', '전기공사',
    '인테리어공사', '도배', '장판', '타일시공', '싱크대수리', '방수공사', '철거',
    '이삿짐센터', '포장이사', '용달이사', '보관이사',
    '정수기', '공기청정기', '에어컨청소', '세탁기청소', '보일러청소',
    '방역', '해충구제', '쥐구제', '소독', '살균',
    '정원관리', '조경', '나무제거', '잔디관리', '울타리',
    '열쇠수리', '잠금장치', '도어록', '디지털도어록',
    '간판', '현수막', '인쇄', '복사', '제본',
    '폐기물처리', '철거업체', '고물상', '재활용',
    '웨딩', '웨딩홀', '웨딩드레스', '웨딩촬영', '신혼여행',
    '장례', '장례식장', '상조서비스', '화장장', '납골당',
    '이민', '유학', '비자', '여권', '번역', '공증', '통역',
    '입양', '위탁', '상담소', '복지관', '주간보호', '요양원', '실버타운',
    '대리운전', '퀵서비스', '용달', '화물운송',
    '철물', '전동공구', '목재', '페인트', '벽지', '바닥재',
    '수산물', '축산물', '농산물', '청과물', '건어물',
    '반찬가게', '떡집', '정육점', '생선가게', '과일가게',
    '아이돌봄', '산후조리', '산후도우미', '베이비시터',
    '가사도우미', '청소대행', '빨래대행', '집수리',
    '통신', '인터넷설치', '케이블TV', 'IPTV', '휴대폰수리',

    // ═══════════════════════════════════════════════════
    // 41. 추가 JP 세부 カテゴリ ~150
    // ═══════════════════════════════════════════════════
    '水道修理', '水漏れ修理', 'ボイラー修理', 'エアコン設置', 'エアコン修理', '電気工事',
    '内装工事', '壁紙張替え', 'タイル工事', '防水工事', '解体工事',
    '引越しセンター', '梱包引越し', '単身引越し', 'トランクルーム',
    '浄水器', '空気清浄機', 'エアコンクリーニング', '洗濯機クリーニング',
    '害虫駆除', 'ねずみ駆除', '消毒', '除菌',
    '庭園管理', '造園', '伐採', '芝生管理', 'フェンス',
    '鍵修理', '鍵交換', 'ドアロック', '電子錠',
    '看板', '横断幕', '印刷', 'コピー', '製本',
    '廃棄物処理', '解体業者', 'リサイクル',
    'ウェディング', '結婚式場', 'ウェディングドレス', '新婚旅行',
    '葬儀', '葬儀場', '互助会', '火葬場', '納骨堂',
    '移民', '留学', 'ビザ', 'パスポート', '翻訳', '公証', '通訳',
    'デイサービス', '老人ホーム', '介護施設', 'シルバータウン',
    '代行運転', '宅配便', '引越し便', '貨物運送',
    '金物', '電動工具', '木材', 'ペイント', '壁紙', '床材',
    '鮮魚', '精肉', '青果', '乾物',
    'お惣菜', '和菓子', '肉屋', '魚屋', '八百屋',
    'ベビーシッター', '産後ケア', '家事代行', 'ハウスクリーニング',
    '通信', 'インターネット設置', 'ケーブルTV', '携帯電話修理',

    // ═══════════════════════════════════════════════════
    // 42. 추가 "X in Y" / "near" 조합 패턴 ~200
    // ═══════════════════════════════════════════════════
    // 더 많은 EN 직종+전치사+도시 조합
    'locksmiths in', 'chiropractors in', 'veterinarians in', 'accountants in', 'architects in',
    'landscapers in', 'caterers in', 'photographers in', 'therapists in', 'counselors in',
    'dermatologists in', 'cardiologists in', 'pediatricians in', 'ophthalmologists in',
    'orthodontists in', 'podiatrists in', 'psychiatrists in', 'psychologists in',
    'physical therapists in', 'occupational therapists in', 'speech therapists in',
    'wedding planners in', 'event planners in', 'interior designers in', 'graphic designers in',
    'web designers in', 'personal trainers in', 'real estate agents in', 'insurance agents in',
    'financial advisors in', 'tax preparers in', 'notaries in', 'translators in',
    'daycares in', 'preschools in', 'driving schools in', 'music schools in',
    'yoga studios in', 'dance studios in', 'martial arts in', 'kickboxing in',
    'dog groomers in', 'pet sitters in', 'kennels in', 'animal hospitals in',
    'window cleaners in', 'carpet cleaners in', 'house cleaners in', 'pool cleaners in',
    'tree services in', 'lawn services in', 'pest control in', 'exterminator in',
    'storage units in', 'self storage in', 'moving companies in', 'truck rental in',
    'car dealers in', 'auto repair in', 'body shops in', 'tire shops in',
    'gas stations in', 'car washes in', 'oil change in',
    // "near" + 카테고리 조합
    'restaurants near', 'hotels near', 'dentists near', 'doctors near', 'hospitals near',
    'pharmacies near', 'gas stations near', 'atm near', 'banks near', 'post office near',
    'grocery stores near', 'supermarkets near', 'convenience stores near',
    'coffee shops near', 'bars near', 'pizza near', 'sushi near', 'chinese food near',
    'mechanic near', 'car wash near', 'laundromat near', 'dry cleaners near',
    'gym near', 'yoga near', 'salon near', 'barber near', 'spa near',
    'vet near', 'pet store near', 'dog park near',
    'school near', 'daycare near', 'library near', 'park near',
    'church near', 'mosque near', 'temple near',
    // KO 추가 "근처/주변" 조합
    '근처 세탁소', '근처 미용실', '근처 학원', '근처 교회', '근처 은행',
    '근처 마트', '근처 슈퍼', '근처 문구점', '근처 서점',
    '주변 세탁소', '주변 미용실', '주변 학원', '주변 편의점', '주변 주유소',
    '주변 은행', '주변 약국', '주변 공원', '주변 도서관',
    // JP 추加 "近く/周辺" 조합
    '近くのクリーニング', '近くの美容院', '近くの塾', '近くの教会', '近くの銀行',
    '近くのスーパー', '近くの文具店', '近くの本屋',
    '周辺のクリーニング', '周辺の美容院', '周辺の塾', '周辺のコンビニ',
    '周辺の銀行', '周辺の薬局', '周辺の公園', '周辺の図書館',

    // ═══════════════════════════════════════════════════
    // 43. 추가 웹사이트/앱 UI 조합 텍스트 ~200
    // ═══════════════════════════════════════════════════
    'map view', 'satellite view', 'street view', 'hybrid view', 'terrain view',
    'list view', 'grid view', 'card view', 'table view', 'compact view', 'detailed view',
    'dark mode', 'light mode', 'night mode', 'auto mode', 'reading mode',
    'zoom in', 'zoom out', 'full screen', 'exit full screen', 'fit to screen',
    'rotate left', 'rotate right', 'flip horizontal', 'flip vertical',
    'sort by name', 'sort by date', 'sort by price', 'sort by rating', 'sort by distance',
    'sort by relevance', 'sort by popularity', 'sort by newest', 'sort by oldest',
    'filter by price', 'filter by rating', 'filter by distance', 'filter by category',
    'filter by date', 'filter by type', 'filter by brand', 'filter by size', 'filter by color',
    'price low to high', 'price high to low', 'rating high to low', 'newest first', 'oldest first',
    'most relevant', 'most popular', 'most reviewed', 'most recent', 'highest rated', 'lowest price',
    'show map', 'hide map', 'show list', 'hide list', 'show filters', 'hide filters',
    'show photos', 'hide photos', 'show reviews', 'hide reviews',
    'show more results', 'show fewer results', 'expand all', 'collapse all',
    'select all', 'deselect all', 'clear all', 'clear selection',
    'add to compare', 'remove from compare', 'compare selected',
    'mark as favorite', 'remove from favorites', 'add to list',
    'report error', 'report photo', 'report review', 'report listing',
    'flag as inappropriate', 'flag as spam', 'block user', 'mute user',
    'turn on notifications', 'turn off notifications', 'manage notifications',
    'enable location', 'disable location', 'allow location access',
    'use current location', 'set location', 'change location', 'update location',
    // KO
    '지도보기', '위성보기', '거리보기', '목록보기', '카드보기', '상세보기',
    '다크모드', '라이트모드', '야간모드',
    '확대', '축소', '전체화면', '화면맞춤',
    '이름순', '날짜순', '가격순', '평점순', '거리순', '인기순', '최신순', '관련순',
    '가격낮은순', '가격높은순', '평점높은순',
    '지도표시', '지도숨기기', '필터표시', '필터숨기기',
    '결과더보기', '전체펼치기', '전체접기',
    '전체선택', '선택해제', '모두지우기',
    '비교추가', '비교제거', '선택비교',
    '즐겨찾기추가', '즐겨찾기제거',
    '오류신고', '사진신고', '리뷰신고',
    '현재위치사용', '위치설정', '위치변경',
    // JP
    '地図表示', '衛星表示', 'ストリートビュー', 'リスト表示', 'カード表示',
    'ダークモード', 'ライトモード', 'ナイトモード',
    '拡大', '縮小', '全画面', '画面に合わせる',
    '名前順', '日付順', '価格順', '評価順', '距離順', '人気順', '新着順',
    '価格の安い順', '価格の高い順', '評価の高い順',
    '地図を表示', '地図を非表示', 'フィルターを表示',
    '結果をもっと見る', 'すべて展開', 'すべて折りたたむ',
    'すべて選択', '選択解除', 'すべてクリア',
    '比較に追加', '比較から削除',
    'お気に入りに追加', 'お気に入りから削除',
    'エラーを報告', '写真を報告', 'レビューを報告',
    '現在地を使用', '場所を設定', '場所を変更',

    // ═══════════════════════════════════════════════════
    // 44. 평가/리뷰 관련 노이즈 (Multi) ~100
    // ═══════════════════════════════════════════════════
    'star', 'stars', 'rating', 'ratings', 'rated', 'unrated',
    'review', 'reviews', 'reviewer', 'reviewers', 'no reviews', 'no ratings',
    'write review', 'read review', 'helpful', 'not helpful', 'was this helpful',
    'thumbs up', 'thumbs down', 'upvote', 'downvote',
    'verified purchase', 'verified buyer', 'verified review', 'certified review',
    'pros', 'cons', 'pros and cons', 'advantages', 'disadvantages',
    'overall rating', 'average rating', 'customer rating', 'user rating',
    'quality', 'value', 'service', 'cleanliness', 'atmosphere', 'ambiance',
    'would recommend', 'would not recommend', 'highly recommend', 'do not recommend',
    'excellent', 'very good', 'good', 'average', 'poor', 'terrible',
    'response from owner', 'response from business', 'business response', 'owner response',
    'reported', 'flagged', 'inappropriate', 'spam', 'fake review',
    // KO
    '별점', '평점', '평가', '리뷰어', '리뷰없음', '평가없음',
    '리뷰작성', '리뷰읽기', '도움됨', '도움안됨', '도움이되었나요',
    '추천함', '비추천', '강력추천', '추천하지않음',
    '총평', '평균평점', '고객평가', '사용자평가',
    '품질', '가치', '서비스', '청결', '분위기',
    '사장님댓글', '업주답변', '업체답변',
    // JP
    '星評価', '総合評価', '口コミ評価', 'レビューなし', '評価なし',
    'クチコミを書く', 'クチコミを読む', '参考になった', '参考にならなかった',
    '推薦する', '推薦しない', '強くおすすめ',
    '総評', '平均評価', '顧客評価', 'ユーザー評価',
    '品質', '価値', 'サービス', '清潔さ', '雰囲気',
    'オーナーからの返信', '店舗からの返信',

    // ═══════════════════════════════════════════════════
    // 45. 추가 US 주변 지역/구역명 ~200
    // ═══════════════════════════════════════════════════
    'bay area', 'tri-state area', 'greater los angeles', 'greater new york',
    'greater boston', 'greater chicago', 'greater seattle', 'greater miami',
    'south bay', 'east bay', 'north bay', 'west side', 'east side', 'south side', 'north side',
    'inland empire', 'silicon valley', 'orange county', 'san fernando valley',
    'central coast', 'gold coast', 'emerald coast', 'space coast', 'treasure coast',
    'hamptons', 'jersey shore', 'outer banks', 'cape cod', 'martha vineyard', 'nantucket',
    'french quarter', 'meat packing district', 'financial district', 'theater district',
    'garment district', 'diamond district', 'chinatown', 'little italy', 'koreatown',
    'japantown', 'little tokyo', 'little havana', 'little saigon',
    'old town', 'new town', 'city center', 'town center', 'town square', 'main square',
    'waterfront', 'riverfront', 'lakefront', 'beachfront', 'boardwalk', 'pier', 'wharf',
    'arts district', 'warehouse district', 'historic district', 'entertainment district',
    'shopping district', 'business district', 'residential area', 'industrial area',
    'suburban', 'rural', 'urban', 'metro area', 'metropolitan area', 'city limits',
    'county', 'township', 'borough', 'village', 'hamlet', 'parish',
    'corridor', 'strip', 'mile', 'row', 'square', 'circle', 'green', 'commons',
    // KO 지역구분
    '남부', '북부', '동부', '서부', '중부', '수도권', '영남권', '호남권', '충청권', '강원권',
    '도심', '부도심', '외곽', '신도시', '구도심', '구시가지', '신시가지',
    '역세권', '학군', '상권', '먹자골목', '유흥가', '번화가',
    '주거지역', '상업지역', '공업지역', '녹지지역',
    // JP 地域区分
    '南部', '北部', '東部', '西部', '中部', '首都圏', '近畿圏', '中京圏',
    '都心', '副都心', '郊外', 'ニュータウン', '旧市街', '新市街',
    '駅前', '学区', '商店街', '繁華街', '歓楽街',
    '住宅地', '商業地', '工業地', '緑地',

    // ═══════════════════════════════════════════════════
    // 46. 스페인어(ES) 주소록 카테고리/직종 ~200
    // ═══════════════════════════════════════════════════
    'abogados', 'abogado', 'contadores', 'contador', 'arquitectos', 'arquitecto',
    'dentistas', 'dentista', 'doctores', 'doctor', 'electricistas', 'electricista',
    'fontaneros', 'fontanero', 'mecanicos', 'mecanico', 'pintores', 'pintor',
    'plomeros', 'plomero', 'carpinteros', 'carpintero', 'cerrajeros', 'cerrajero',
    'veterinarios', 'veterinario', 'enfermeros', 'enfermera', 'peluqueros', 'peluquera',
    'restaurantes', 'hoteles', 'cafeterias', 'cafeteria', 'bares', 'discotecas', 'discoteca',
    'tiendas', 'tienda', 'supermercados', 'supermercado', 'farmacias', 'farmacia',
    'hospitales', 'clinicas', 'clinica', 'consultorios', 'consultorio',
    'escuelas', 'escuela', 'universidades', 'universidad', 'colegios', 'colegio',
    'iglesias', 'iglesia', 'templos', 'templo', 'mezquitas', 'mezquita',
    'bancos', 'banco', 'seguros', 'seguro', 'inmobiliarias', 'inmobiliaria',
    'gimnasios', 'gimnasio', 'spa', 'salon de belleza', 'peluqueria',
    'talleres', 'taller', 'gasolineras', 'gasolinera', 'lavanderia', 'tintoreria',
    'mudanzas', 'guarderia', 'jardineria', 'fumigacion', 'impermeabilizacion',
    'cerrajeria', 'vidrieria', 'tapiceria', 'herreria', 'soldadura',
    'fotografo', 'fotografia', 'imprenta', 'publicidad', 'diseno grafico',
    'contabilidad', 'notario', 'notaria', 'gestor', 'gestoria',
    'funeraria', 'floristeria', 'joyeria', 'relojeria', 'optica',
    'papeleria', 'libreria', 'ferreteria', 'muebleria',
    // 스페인어 지역/방향
    'norte', 'sur', 'este', 'oeste', 'centro', 'zona norte', 'zona sur',
    'colonia', 'barrio', 'fraccionamiento', 'municipio', 'delegacion',
    // 스페인어 UI/버튼
    'buscar negocios', 'escribir reseña', 'dejar reseña', 'obtener cotizacion',
    'llamar ahora', 'visitar sitio web', 'como llegar', 'ver mapa', 'ver todo',
    'abierto ahora', 'cerrado', 'horario', 'estacionamiento disponible',
    'acepta tarjetas', 'resultados', 'sin resultados', 'mas negocios',
    'negocios cercanos', 'cerca de mi', 'recomendar', 'reportar',

    // ═══════════════════════════════════════════════════
    // 47. 프랑스어(FR) 주소록 카테고리/직종 ~180
    // ═══════════════════════════════════════════════════
    'avocats', 'avocat', 'comptables', 'comptable', 'architectes', 'architecte',
    'dentistes', 'dentiste', 'medecins', 'medecin', 'electriciens', 'electricien',
    'plombiers', 'plombier', 'mecaniciens', 'mecanicien', 'peintres', 'peintre',
    'menuisiers', 'menuisier', 'serruriers', 'serrurier', 'couvreurs', 'couvreur',
    'veterinaires', 'veterinaire', 'infirmiers', 'infirmiere', 'coiffeurs', 'coiffeuse',
    'restaurants', 'hotels', 'cafes', 'bistros', 'bistro', 'brasseries', 'brasserie',
    'boulangeries', 'boulangerie', 'patisseries', 'patisserie', 'charcuteries', 'charcuterie',
    'magasins', 'magasin', 'supermarches', 'supermarche', 'pharmacies', 'pharmacie',
    'hopitaux', 'hopital', 'cliniques', 'clinique', 'cabinets', 'cabinet',
    'ecoles', 'ecole', 'universites', 'universite', 'lycees', 'lycee', 'colleges', 'college',
    'eglises', 'eglise', 'temples', 'temple', 'mosquees', 'mosquee',
    'banques', 'banque', 'assurances', 'assurance', 'agences immobilieres', 'immobilier',
    'salles de sport', 'salle de sport', 'salon de coiffure', 'salon de beaute',
    'garages', 'garage', 'stations-service', 'station-service', 'pressing', 'laverie',
    'demenagements', 'demenagement', 'creches', 'creche', 'jardinage', 'desinsectisation',
    'serrurerie', 'vitrerie', 'tapisserie', 'ferronnerie', 'soudure',
    'photographe', 'photographie', 'imprimerie', 'agence de publicite',
    'pompes funebres', 'fleuriste', 'bijouterie', 'horlogerie', 'optique',
    // 프랑스어 UI/버튼
    'rechercher entreprise', 'ecrire un avis', 'laisser un avis', 'obtenir un devis',
    'appeler maintenant', 'visiter le site', 'itineraire', 'voir la carte', 'voir tout',
    'ouvert maintenant', 'ferme', 'horaires', 'parking disponible',
    'accepte les cartes', 'resultats', 'aucun resultat', 'plus de commerces',
    'commerces a proximite', 'pres de moi', 'recommander', 'signaler',

    // ═══════════════════════════════════════════════════
    // 48. 독일어(DE) 주소록 카테고리/직종 ~180
    // ═══════════════════════════════════════════════════
    'anwalte', 'anwalt', 'rechtsanwalt', 'steuerberater', 'architekten', 'architekt',
    'zahnarzte', 'zahnarzt', 'arzte', 'arzt', 'elektriker', 'klempner', 'installateur',
    'mechaniker', 'maler', 'tischler', 'schreiner', 'schlosser', 'dachdecker',
    'tierarzte', 'tierarzt', 'friseure', 'friseur', 'friseurin',
    'hotels', 'gasthof', 'pension', 'gasthaus', 'biergarten', 'kneipe',
    'backerei', 'konditorei', 'metzgerei', 'fleischerei',
    'geschafte', 'geschaft', 'supermarkt', 'apotheke', 'drogerie',
    'krankenhaus', 'klinik', 'praxis', 'arztpraxis', 'zahnarztpraxis',
    'schule', 'grundschule', 'gymnasium', 'realschule', 'hauptschule', 'universitat',
    'kirche', 'dom', 'kathedrale', 'moschee', 'synagoge',
    'bank', 'sparkasse', 'versicherung', 'makler', 'immobilien',
    'fitnessstudio', 'sportstudio', 'friseursalon', 'kosmetikstudio', 'nagelstudio',
    'werkstatt', 'autowerkstatt', 'tankstelle', 'waschanlage', 'reinigung', 'wascherei',
    'umzug', 'umzugsunternehmen', 'kindergarten', 'kita', 'kindertagesstatte',
    'gartenarbeit', 'gartenpflege', 'schadlingsbekampfung',
    'schlosserei', 'schlusseldienst', 'glaserei', 'polsterei', 'schweisserei',
    'fotograf', 'fotografie', 'druckerei', 'werbeagentur',
    'bestattung', 'bestattungsinstitut', 'blumenladen', 'juwelier', 'optiker',
    // 독일어 UI/버튼
    'unternehmen suchen', 'bewertung schreiben', 'angebot anfordern',
    'jetzt anrufen', 'webseite besuchen', 'wegbeschreibung', 'karte anzeigen', 'alle anzeigen',
    'jetzt geoffnet', 'geschlossen', 'offnungszeiten', 'parkplatz vorhanden',
    'akzeptiert kreditkarten', 'ergebnisse', 'keine ergebnisse', 'weitere unternehmen',
    'unternehmen in der nahe', 'in meiner nahe', 'empfehlen', 'melden',

    // ═══════════════════════════════════════════════════
    // 49. 이탈리아어(IT)/포르투갈어(PT) 주소록 카테고리 ~200
    // ═══════════════════════════════════════════════════
    // IT
    'avvocati', 'avvocato', 'commercialisti', 'commercialista', 'architetti', 'architetto',
    'dentisti', 'dentista', 'medici', 'medico', 'elettricisti', 'elettricista',
    'idraulici', 'idraulico', 'meccanici', 'meccanico', 'imbianchini', 'imbianchino',
    'falegnami', 'falegname', 'fabbri', 'fabbro', 'veterinari', 'veterinario',
    'parrucchieri', 'parrucchiere', 'estetiste', 'estetista',
    'ristoranti', 'ristorante', 'alberghi', 'albergo', 'trattorie', 'trattoria',
    'pizzerie', 'pizzeria', 'gelaterie', 'gelateria', 'pasticcerie', 'pasticceria',
    'negozi', 'negozio', 'supermercati', 'farmacia', 'farmacie',
    'ospedali', 'ospedale', 'ambulatori', 'ambulatorio', 'studi', 'studio medico',
    'scuole', 'scuola', 'asili', 'asilo', 'universita',
    'chiese', 'chiesa', 'banche', 'banca', 'assicurazioni', 'agenzia immobiliare',
    'palestre', 'palestra', 'salone di bellezza', 'centro benessere',
    'officine', 'officina', 'distributore', 'lavanderia', 'tintoria',
    'traslochi', 'trasloco', 'giardinaggio', 'disinfestazione',
    'fotografo', 'tipografia', 'agenzia pubblicitaria',
    'onoranze funebri', 'fiorista', 'gioielleria', 'ottico',
    // PT
    'advogados', 'advogado', 'contadores', 'contador', 'arquitetos', 'arquiteto',
    'dentistas', 'dentista', 'medicos', 'medico', 'eletricistas', 'eletricista',
    'encanadores', 'encanador', 'mecanicos', 'mecanico', 'pintores', 'pintor',
    'carpinteiros', 'carpinteiro', 'chaveiros', 'chaveiro', 'veterinarios', 'veterinario',
    'cabeleireiros', 'cabeleireiro', 'cabeleireira', 'esteticistas', 'esteticista',
    'restaurantes', 'restaurante', 'hoteis', 'hotel', 'padarias', 'padaria',
    'confeitarias', 'confeitaria', 'acougues', 'acougue',
    'lojas', 'loja', 'supermercados', 'supermercado', 'farmacias', 'farmacia',
    'hospitais', 'hospital', 'clinicas', 'clinica', 'consultorios', 'consultorio',
    'escolas', 'escola', 'universidades', 'universidade', 'faculdades', 'faculdade',
    'igrejas', 'igreja', 'templos', 'templo', 'mesquitas', 'mesquita',
    'bancos', 'banco', 'seguradoras', 'seguradora', 'imobiliarias', 'imobiliaria',
    'academias', 'academia', 'salao de beleza', 'barbearia',
    'oficinas', 'oficina', 'postos de gasolina', 'lavanderia',
    'mudancas', 'creches', 'creche', 'jardinagem',
    'fotografo', 'fotografia', 'grafica', 'agencia de publicidade',
    'funeraria', 'floricultura', 'joalheria', 'otica',

    // ═══════════════════════════════════════════════════
    // 50. 추가 도시/지역 (전세계 500개 더) ~500
    // ═══════════════════════════════════════════════════
    // US — 더 많은 도시
    'tacoma', 'spokane', 'olympia', 'bellingham', 'eugene', 'bend', 'medford',
    'reno', 'carson city', 'sparks', 'boise', 'nampa', 'meridian', 'twin falls',
    'billings', 'missoula', 'great falls', 'helena', 'butte',
    'fargo', 'bismarck', 'grand forks', 'sioux falls', 'rapid city',
    'lincoln', 'grand island', 'des moines', 'cedar rapids', 'iowa city', 'davenport',
    'wichita', 'topeka', 'lawrence', 'overland park', 'olathe',
    'little rock', 'fayetteville', 'fort smith', 'hot springs',
    'jackson', 'biloxi', 'gulfport', 'hattiesburg',
    'mobile', 'huntsville', 'montgomery', 'tuscaloosa', 'birmingham',
    'chattanooga', 'knoxville', 'murfreesboro', 'clarksville',
    'lexington', 'bowling green', 'covington', 'frankfort',
    'charleston', 'myrtle beach', 'columbia', 'greenville', 'spartanburg',
    'wilmington', 'durham', 'greensboro', 'winston-salem', 'asheville',
    'norfolk', 'virginia beach', 'newport news', 'hampton', 'alexandria',
    'annapolis', 'frederick', 'rockville', 'bethesda', 'silver spring',
    'dover', 'newark', 'wilmington', 'trenton', 'atlantic city', 'hoboken',
    'providence', 'newport', 'hartford', 'new haven', 'stamford', 'bridgeport',
    'burlington', 'manchester', 'concord', 'portland', 'bangor', 'augusta',
    'anchorage', 'fairbanks', 'juneau',
    // Canada
    'edmonton', 'winnipeg', 'saskatoon', 'regina', 'quebec city', 'halifax', 'st johns',
    'victoria', 'kelowna', 'kamloops', 'nanaimo', 'whistler', 'banff', 'jasper',
    'niagara falls', 'london', 'kitchener', 'waterloo', 'hamilton', 'barrie',
    // Australia / NZ
    'wollongong', 'newcastle', 'geelong', 'ballarat', 'bendigo', 'townsville',
    'toowoomba', 'launceston', 'alice springs', 'broome', 'dunedin', 'hamilton',
    'tauranga', 'napier', 'palmerston north', 'rotorua',
    // Mexico
    'monterrey', 'puebla', 'merida', 'queretaro', 'leon', 'tijuana', 'chihuahua',
    'acapulco', 'mazatlan', 'veracruz', 'san miguel de allende', 'guanajuato',
    // Caribbean
    'havana', 'nassau', 'kingston', 'santo domingo', 'san juan', 'bridgetown',
    // South America (more cities)
    'recife', 'salvador', 'belo horizonte', 'curitiba', 'porto alegre', 'brasilia', 'fortaleza',
    'manaus', 'belem', 'florianopolis', 'natal', 'goiania',
    'cordoba', 'rosario', 'mendoza', 'bariloche', 'ushuaia', 'salta',
    'concepcion', 'vina del mar', 'punta arenas', 'san pedro de atacama',
    'arequipa', 'trujillo', 'iquitos', 'huaraz', 'puno',
    'santa cruz', 'cochabamba', 'oruro', 'uyuni', 'potosi',
    'asuncion', 'ciudad del este', 'encarnacion',
    // Europe (more cities)
    'antwerp', 'ghent', 'bruges', 'liege', 'luxembourg', 'eindhoven', 'rotterdam', 'utrecht',
    'gothenburg', 'malmo', 'bergen', 'trondheim', 'stavanger',
    'tampere', 'turku', 'oulu', 'reykjavik',
    'krakow', 'wroclaw', 'gdansk', 'poznan', 'lodz', 'katowice',
    'brno', 'ostrava', 'bratislava', 'kosice',
    'debrecen', 'szeged', 'pecs', 'miskolc',
    'zagreb', 'split', 'dubrovnik', 'zadar',
    'belgrade', 'novi sad', 'nis',
    'sofia', 'plovdiv', 'varna',
    'thessaloniki', 'heraklion', 'santorini', 'mykonos', 'rhodes', 'corfu',
    'porto', 'faro', 'coimbra', 'braga', 'sintra', 'evora',
    'cadiz', 'salamanca', 'segovia', 'burgos', 'pamplona', 'zaragoza',
    'lucerne', 'bern', 'basel', 'interlaken', 'zermatt', 'davos',
    'innsbruck', 'salzburg', 'graz', 'linz', 'hallstatt',
    // Africa
    'tunis', 'algiers', 'dakar', 'abidjan', 'accra', 'lagos', 'kinshasa',
    'addis ababa', 'kampala', 'kigali', 'maputo', 'lusaka', 'harare',
    'windhoek', 'gaborone', 'maseru', 'mbabane',
    // Middle East
    'beirut', 'tehran', 'isfahan', 'shiraz', 'tabriz',
    'baghdad', 'erbil', 'basra', 'damascus', 'aleppo',
    'doha', 'manama', 'muscat', 'sana', 'aden',
    // Central Asia
    'tashkent', 'samarkand', 'almaty', 'nur-sultan', 'bishkek', 'dushanbe', 'ashgabat',
    // South Asia
    'dhaka', 'chittagong', 'lahore', 'karachi', 'islamabad', 'peshawar',
    'lucknow', 'ahmedabad', 'surat', 'kanpur', 'nagpur', 'indore', 'bhopal',
    'mysore', 'mangalore', 'trivandrum', 'pondicherry',
    // Southeast Asia
    'yangon', 'mandalay', 'vientiane', 'battambang',
    'makassar', 'semarang', 'medan', 'palembang',
    'davao', 'zamboanga', 'iloilo', 'bacolod',
    'ipoh', 'kuching', 'kota bharu',
    // East Asia
    'kaohsiung', 'taichung', 'tainan', 'hsinchu',
    'busan', 'incheon', 'daegu', 'daejeon', 'gwangju', 'ulsan',
    'macau', 'zhuhai', 'xiamen', 'qingdao', 'dalian', 'harbin', 'changsha',
    'kunming', 'guiyang', 'lhasa', 'urumqi', 'lanzhou', 'zhengzhou',

    // ═══════════════════════════════════════════════════
    // 51. 홈서비스/하우스키핑 (Multi) ~150
    // ═══════════════════════════════════════════════════
    'house cleaning', 'home cleaning', 'deep cleaning', 'move in cleaning', 'move out cleaning',
    'spring cleaning', 'office cleaning', 'commercial cleaning', 'carpet shampooing',
    'upholstery cleaning', 'window washing', 'gutter cleaning', 'roof cleaning',
    'pressure washing', 'power washing', 'deck cleaning', 'deck staining', 'fence painting',
    'cabinet refinishing', 'countertop installation', 'countertop repair',
    'garbage disposal repair', 'faucet repair', 'toilet repair', 'pipe repair',
    'water heater repair', 'water heater installation', 'sump pump repair',
    'sewer cleaning', 'drain cleaning', 'septic tank pumping', 'grease trap cleaning',
    'furnace installation', 'furnace repair', 'boiler repair', 'heat pump repair',
    'duct cleaning', 'duct sealing', 'insulation installation', 'attic insulation',
    'crawl space repair', 'basement waterproofing', 'foundation repair',
    'termite inspection', 'termite treatment', 'bed bug treatment', 'ant control',
    'rodent control', 'wildlife removal', 'bat removal', 'bird control',
    'lawn mowing', 'lawn fertilizing', 'weed control', 'aeration', 'overseeding',
    'hedge trimming', 'bush trimming', 'mulching', 'leaf removal', 'snow plowing',
    'driveway sealing', 'concrete repair', 'asphalt repair', 'pothole repair',
    'fence installation', 'fence repair', 'gate installation', 'gate repair',
    'deck building', 'patio installation', 'pergola installation', 'gazebo installation',
    'retaining wall', 'stone wall', 'brick wall', 'block wall',
    // KO
    '집청소', '사무실청소', '이사청소', '입주청소', '퇴거청소', '대청소',
    '카펫청소', '소파청소', '커튼세탁', '유리창청소',
    '배수관청소', '하수구청소', '정화조', '싱크대막힘',
    '보일러설치', '보일러교체', '온돌수리', '난방수리',
    '방충망교체', '방범창설치', '도어교체', '창문교체',
    // JP
    'ハウスクリーニング', 'オフィス清掃', '引越し清掃', '入居清掃', '退去清掃',
    'カーペット清掃', 'ソファ清掃', 'カーテンクリーニング', '窓ガラス清掃',
    '排水管清掃', '下水道清掃', '浄化槽', 'シンク詰まり',
    'ボイラー設置', 'ボイラー交換',

    // ═══════════════════════════════════════════════════
    // 52. 펫/동물 서비스 (Multi) ~100
    // ═══════════════════════════════════════════════════
    'dog walking', 'dog grooming', 'dog training', 'dog boarding', 'dog daycare',
    'puppy training', 'obedience training', 'agility training', 'behavior training',
    'cat sitting', 'cat grooming', 'cat boarding', 'cat hotel',
    'pet grooming', 'pet boarding', 'pet sitting', 'pet hotel', 'pet resort',
    'pet adoption', 'pet rescue', 'pet shelter', 'pet cremation', 'pet cemetery',
    'mobile grooming', 'mobile vet', 'emergency vet', '24 hour vet',
    'exotic pets', 'reptile store', 'fish store', 'bird store',
    'pet food', 'pet supplies', 'pet accessories', 'pet pharmacy', 'pet insurance',
    'horse boarding', 'horse training', 'horse riding', 'equestrian',
    'aquarium maintenance', 'pond installation', 'koi pond',
    // KO
    '강아지미용', '강아지훈련', '강아지호텔', '강아지유치원', '강아지산책',
    '고양이호텔', '고양이미용', '고양이카페',
    '펫호텔', '펫시터', '펫택시', '펫장례', '동물화장',
    '이동미용', '야간동물병원', '응급동물병원',
    // JP
    'ペットホテル', 'ペットサロン', 'ペットシッター', 'ペット火葬',
    'ドッグラン', 'ドッグカフェ', 'ドッグトレーニング',
    'キャットホテル', '猫カフェ', '動物霊園',

    // ═══════════════════════════════════════════════════
    // 53. 뷰티/웰니스 상세 (Multi) ~150
    // ═══════════════════════════════════════════════════
    'haircut', 'hair coloring', 'hair highlights', 'hair extensions', 'hair treatment',
    'keratin treatment', 'brazilian blowout', 'perms', 'relaxers', 'updos', 'braids',
    'mens haircut', 'womens haircut', 'kids haircut', 'beard trim', 'hot shave',
    'manicure', 'pedicure', 'gel nails', 'acrylic nails', 'dip powder', 'nail art',
    'facial', 'chemical peel', 'microdermabrasion', 'dermaplaning', 'hydrafacial',
    'botox', 'fillers', 'lip fillers', 'coolsculpting', 'liposuction',
    'laser hair removal', 'waxing', 'threading', 'electrolysis', 'ipl',
    'eyelash extensions', 'lash lift', 'brow lamination', 'microblading', 'permanent makeup',
    'teeth whitening', 'veneers', 'dental implants', 'invisalign', 'braces',
    'massage therapy', 'swedish massage', 'deep tissue massage', 'hot stone massage',
    'thai massage', 'shiatsu', 'reflexology', 'aromatherapy', 'prenatal massage',
    'body wrap', 'body scrub', 'mud bath', 'mineral bath', 'float therapy',
    'cryotherapy', 'infrared sauna', 'salt room', 'halotherapy',
    'yoga class', 'meditation', 'mindfulness', 'reiki', 'acupuncture', 'cupping',
    'weight loss', 'nutrition counseling', 'personal training', 'group fitness',
    'spin class', 'pilates class', 'barre class', 'boxing class', 'kickboxing class',
    // KO
    '헤어컷', '염색', '펌', '매직', '클리닉', '두피관리', '탈모관리',
    '매니큐어', '페디큐어', '젤네일', '네일아트', '속눈썹연장', '속눈썹펌',
    '왁싱', '제모', '레이저제모', '브라질리언왁싱',
    '피부관리', '여드름관리', '주름관리', '미백관리', '리프팅',
    '보톡스', '필러', '피부레이저', '점제거', '흉터치료',
    '다이어트', '체형관리', '셀룰라이트', '림프마사지',
    // JP
    'ヘアカット', 'カラーリング', 'パーマ', '縮毛矯正', 'トリートメント', '頭皮ケア',
    'マニキュア', 'ペディキュア', 'ジェルネイル', 'ネイルアート',
    'まつ毛エクステ', 'まつ毛パーマ', 'アイブロウ',
    'ワックス脱毛', 'レーザー脱毛', '光脱毛',
    'フェイシャル', 'ニキビケア', 'シワ取り', '美白ケア', 'リフトアップ',
    'ボトックス', 'ヒアルロン酸', 'レーザー治療',

    // ═══════════════════════════════════════════════════
    // 54. 여행/관광 키워드 (Multi) ~200
    // ═══════════════════════════════════════════════════
    'travel', 'tourism', 'tourist', 'tour', 'tours', 'excursion', 'excursions',
    'sightseeing', 'guided tour', 'walking tour', 'bus tour', 'boat tour', 'food tour',
    'day trip', 'day trips', 'weekend getaway', 'vacation', 'holiday', 'holidays',
    'itinerary', 'travel guide', 'travel tips', 'travel blog', 'travel agency',
    'flight', 'flights', 'airline', 'airlines', 'airport transfer', 'shuttle',
    'hotel booking', 'hostel booking', 'vacation rental', 'airbnb', 'vrbo',
    'car rental', 'bike rental', 'scooter rental', 'boat rental',
    'travel insurance', 'visa', 'passport', 'embassy', 'consulate',
    'luggage', 'packing list', 'travel essentials', 'travel accessories',
    'backpacking', 'solo travel', 'family travel', 'luxury travel', 'budget travel',
    'honeymoon', 'romantic getaway', 'adventure travel', 'eco tourism',
    'beach vacation', 'mountain vacation', 'island hopping', 'road trip',
    'cruise', 'cruises', 'ocean cruise', 'river cruise', 'expedition cruise',
    'all inclusive', 'resort vacation', 'spa vacation', 'ski vacation',
    'things to do', 'what to do', 'places to visit', 'must see', 'hidden gems',
    'best time to visit', 'weather', 'climate', 'off season', 'peak season',
    'tourist attraction', 'landmarks', 'monuments', 'heritage site', 'world heritage',
    'national monument', 'scenic route', 'lookout point', 'viewpoint',
    // KO
    '여행', '관광', '투어', '관광지', '명소', '유적지',
    '패키지여행', '자유여행', '배낭여행', '허니문', '신혼여행',
    '항공권', '비행기표', '공항픽업', '셔틀버스',
    '호텔예약', '숙소예약', '렌트카', '자전거대여',
    '여행보험', '비자', '여권', '대사관', '영사관',
    '가볼만한곳', '꼭가야할곳', '숨은명소', '포토스팟',
    '벚꽃명소', '단풍명소', '해수욕장', '스키장', '온천',
    // JP
    '旅行', '観光', 'ツアー', '観光地', '名所', '遺跡',
    'パッケージツアー', '個人旅行', 'バックパッカー', 'ハネムーン',
    '航空券', '飛行機', '空港送迎', 'シャトルバス',
    'ホテル予約', '宿泊予約', 'レンタカー', 'レンタサイクル',
    '旅行保険', 'ビザ', 'パスポート', '大使館', '領事館',
    '行くべき場所', '穴場', 'フォトスポット',
    '桜の名所', '紅葉の名所', '海水浴場', 'スキー場', '温泉',

    // ═══════════════════════════════════════════════════
    // 55. 웨딩/이벤트/파티 (Multi) ~100
    // ═══════════════════════════════════════════════════
    'wedding venue', 'wedding reception', 'wedding ceremony', 'wedding planner',
    'wedding photographer', 'wedding videographer', 'wedding dj', 'wedding band',
    'wedding cake', 'wedding catering', 'wedding flowers', 'wedding decorations',
    'bridal shower', 'bachelor party', 'bachelorette party', 'rehearsal dinner',
    'engagement party', 'anniversary party', 'birthday party', 'surprise party',
    'graduation party', 'retirement party', 'farewell party', 'welcome party',
    'baby shower', 'gender reveal', 'christening', 'baptism', 'bar mitzvah', 'bat mitzvah',
    'corporate event', 'team building', 'company party', 'holiday party', 'gala',
    'conference', 'seminar', 'workshop', 'symposium', 'meetup', 'networking event',
    'fundraiser', 'charity event', 'auction', 'raffle',
    'event space', 'event venue', 'banquet hall', 'ballroom', 'rooftop venue',
    'event planner', 'event coordinator', 'event decorator', 'event caterer',
    'photo booth', 'face painting', 'balloon artist', 'magician', 'clown',
    'bounce house', 'inflatable', 'carnival games', 'cotton candy', 'popcorn machine',
    // KO
    '웨딩플래너', '웨딩촬영', '웨딩DVD', '웨딩밴드', '웨딩케이크',
    '브라이덜샤워', '돌잔치', '돌사진', '백일잔치',
    '기업행사', '워크샵', '세미나', '컨퍼런스', '전시회',
    '이벤트대행', '파티룸', '파티플래너', '포토부스',
    // JP
    'ウェディングプランナー', 'ウェディング撮影', 'ウェディングケーキ',
    'ベビーシャワー', 'お宮参り', '七五三', '成人式', '還暦祝い',
    '企業イベント', 'ワークショップ', 'セミナー', 'カンファレンス', '展示会',
    'イベント代行', 'パーティールーム', 'フォトブース',

    // ═══════════════════════════════════════════════════
    // 56. 일반 영어 단어 (절대 업소명이 아닌 것) ~500
    // ═══════════════════════════════════════════════════
    // 관사/전치사/접속사/대명사
    'the', 'a', 'an', 'and', 'or', 'but', 'nor', 'so', 'yet', 'for', 'not',
    'in', 'on', 'at', 'to', 'from', 'by', 'with', 'without', 'about', 'between',
    'through', 'during', 'before', 'after', 'above', 'below', 'up', 'down',
    'out', 'off', 'over', 'under', 'again', 'further', 'then', 'once',
    'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each', 'every',
    'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'only',
    'own', 'same', 'than', 'too', 'very', 'just', 'because', 'as', 'until',
    'while', 'of', 'into', 'upon', 'since', 'although', 'though', 'unless',
    'i', 'me', 'my', 'mine', 'you', 'your', 'yours', 'he', 'him', 'his',
    'she', 'her', 'hers', 'it', 'its', 'we', 'us', 'our', 'ours',
    'they', 'them', 'their', 'theirs', 'this', 'that', 'these', 'those',
    'who', 'whom', 'which', 'what', 'whose',
    // 숫자/측정 단위
    'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
    'hundred', 'thousand', 'million', 'billion',
    'feet', 'inches', 'yards', 'miles', 'meters', 'kilometers',
    'pounds', 'ounces', 'grams', 'kilograms', 'tons',
    'gallons', 'liters', 'quarts', 'pints', 'cups',
    'percent', 'percentage', 'ratio', 'fraction',
    'minimum', 'maximum', 'average', 'median', 'total', 'amount', 'number',
    // 일반 명사 (절대 업소명 아님)
    'people', 'person', 'man', 'woman', 'child', 'children', 'baby', 'adult', 'family',
    'friend', 'neighbor', 'colleague', 'customer', 'client', 'user', 'member', 'visitor',
    'owner', 'manager', 'employee', 'staff', 'team', 'crew', 'worker',
    'thing', 'stuff', 'item', 'items', 'object', 'piece', 'part', 'section',
    'time', 'day', 'week', 'month', 'year', 'hour', 'minute', 'second', 'moment',
    'place', 'area', 'spot', 'point', 'location', 'site', 'position',
    'way', 'method', 'approach', 'technique', 'style', 'manner', 'mode',
    'reason', 'cause', 'factor', 'element', 'aspect', 'feature', 'detail',
    'problem', 'issue', 'question', 'answer', 'solution', 'response',
    'idea', 'concept', 'plan', 'project', 'program', 'system', 'process',
    'case', 'example', 'instance', 'situation', 'condition', 'state', 'status',
    'level', 'degree', 'step', 'stage', 'phase', 'period', 'term',
    'type', 'kind', 'sort', 'form', 'version', 'edition', 'model',
    'side', 'end', 'top', 'bottom', 'front', 'back', 'middle', 'center',
    'line', 'list', 'table', 'chart', 'graph', 'diagram', 'map',
    'name', 'title', 'label', 'tag', 'mark', 'sign', 'symbol',
    'text', 'word', 'sentence', 'paragraph', 'page', 'chapter', 'book',
    'image', 'picture', 'photo', 'video', 'audio', 'sound', 'music',
    'link', 'button', 'icon', 'logo', 'banner', 'badge', 'widget',
    'rule', 'policy', 'standard', 'guideline', 'requirement', 'specification',
    'goal', 'target', 'objective', 'mission', 'vision', 'purpose',
    'value', 'benefit', 'advantage', 'opportunity', 'challenge', 'risk',
    'option', 'choice', 'alternative', 'preference', 'selection',
    'change', 'update', 'improvement', 'progress', 'growth', 'development',
    'result', 'outcome', 'effect', 'impact', 'influence', 'consequence',
    'success', 'failure', 'achievement', 'accomplishment', 'milestone',
    // 일반 동사 추가
    'do', 'does', 'did', 'done', 'doing', 'go', 'goes', 'went', 'gone', 'going',
    'come', 'comes', 'came', 'coming', 'take', 'takes', 'took', 'taken', 'taking',
    'make', 'makes', 'made', 'making', 'give', 'gives', 'gave', 'given', 'giving',
    'say', 'says', 'said', 'saying', 'tell', 'tells', 'told', 'telling',
    'know', 'knows', 'knew', 'known', 'knowing',
    'think', 'thinks', 'thought', 'thinking',
    'want', 'wants', 'wanted', 'wanting', 'need', 'needs', 'needed', 'needing',
    'use', 'uses', 'used', 'using', 'try', 'tries', 'tried', 'trying',
    'ask', 'asks', 'asked', 'asking', 'put', 'puts', 'putting',
    'keep', 'keeps', 'kept', 'keeping', 'let', 'lets', 'letting',
    'seem', 'seems', 'seemed', 'become', 'becomes', 'became', 'becoming',
    'leave', 'leaves', 'left', 'leaving', 'feel', 'feels', 'felt', 'feeling',
    'bring', 'brings', 'brought', 'bringing', 'begin', 'begins', 'began', 'begun',
    'show', 'shows', 'showed', 'shown', 'showing',
    'hear', 'hears', 'heard', 'hearing', 'play', 'plays', 'played', 'playing',
    'run', 'runs', 'ran', 'running', 'move', 'moves', 'moved', 'moving',
    'live', 'lives', 'lived', 'living', 'believe', 'believes', 'believed',
    'hold', 'holds', 'held', 'holding', 'stand', 'stands', 'stood', 'standing',
    'turn', 'turns', 'turned', 'turning', 'follow', 'follows', 'followed',
    'look', 'looks', 'looked', 'looking', 'find', 'finds', 'found', 'finding',
    'set', 'sets', 'setting', 'sit', 'sits', 'sat', 'sitting',
    'speak', 'speaks', 'spoke', 'spoken', 'read', 'reads', 'reading',
    'grow', 'grows', 'grew', 'grown', 'growing',
    'open', 'opens', 'opened', 'opening', 'close', 'closes', 'closed', 'closing',
    'walk', 'walks', 'walked', 'walking', 'win', 'wins', 'won', 'winning',
    'offer', 'offers', 'offered', 'offering', 'remember', 'consider', 'appear',
    'love', 'add', 'continue', 'happen', 'include', 'allow', 'meet',
    'lead', 'pay', 'spend', 'watch', 'carry', 'talk', 'stop',
    'create', 'speak', 'accept', 'hope', 'develop', 'produce', 'reach',
    'wait', 'cover', 'fail', 'drive', 'break', 'pick', 'fill',
    'kill', 'pass', 'agree', 'expect', 'build', 'stay',
    'fall', 'send', 'decide', 'support', 'enjoy', 'protect',
    'achieve', 'require', 'report', 'describe', 'claim', 'suggest',
    // be 동사
    'am', 'is', 'are', 'was', 'were', 'been', 'being',
    'has', 'have', 'had', 'having',
    'can', 'could', 'will', 'would', 'shall', 'should', 'may', 'might', 'must',
    // 형용사 추가
    'able', 'available', 'bad', 'best', 'better', 'big', 'black', 'blue',
    'certain', 'clear', 'close', 'cold', 'common', 'complete', 'dark',
    'different', 'difficult', 'early', 'easy', 'enough', 'even', 'fair',
    'far', 'final', 'fine', 'first', 'foreign', 'free', 'full', 'general',
    'glad', 'golden', 'great', 'green', 'half', 'happy', 'hard', 'heavy',
    'high', 'hot', 'human', 'important', 'interested', 'interesting',
    'kind', 'known', 'large', 'last', 'late', 'less', 'likely',
    'local', 'low', 'main', 'major', 'military', 'modern',
    'national', 'natural', 'necessary', 'nice', 'normal', 'official',
    'original', 'particular', 'past', 'personal', 'physical',
    'political', 'poor', 'popular', 'possible', 'present', 'private',
    'professional', 'proper', 'public', 'quick', 'quiet', 'ready',
    'real', 'recent', 'red', 'regular', 'responsible', 'rich', 'right',
    'round', 'safe', 'serious', 'short', 'similar', 'simple',
    'single', 'slight', 'slow', 'small', 'social', 'special',
    'standard', 'strong', 'sure', 'tall', 'total', 'traditional',
    'true', 'typical', 'unable', 'usual', 'various', 'warm',
    'white', 'whole', 'wide', 'wild', 'wrong', 'young',

    // ═══════════════════════════════════════════════════
    // 57. 중국어(ZH) 확장 카테고리/UI/지역 ~300
    // ═══════════════════════════════════════════════════
    // 직종/카테고리
    '律师', '会计师', '建筑师', '医生', '牙医', '兽医', '护士',
    '电工', '水管工', '木匠', '油漆工', '锁匠', '机械师',
    '理发师', '美容师', '按摩师', '健身教练', '瑜伽教练',
    '摄影师', '设计师', '程序员', '翻译', '导游', '厨师',
    '教师', '家教', '保姆', '月嫂', '保洁', '搬家',
    '餐厅', '饭店', '酒店', '宾馆', '民宿', '旅馆', '青年旅社',
    '咖啡馆', '奶茶店', '面包店', '蛋糕店', '烧烤店', '火锅店',
    '便利店', '超市', '菜市场', '水果店', '药店',
    '医院', '诊所', '卫生所', '体检中心', '牙科诊所',
    '学校', '幼儿园', '培训机构', '补习班', '驾校',
    '银行', '保险公司', '证券公司', '基金公司',
    '房产中介', '物业管理', '装修公司', '搬家公司',
    '健身房', '游泳馆', '体育馆', '瑜伽馆', '舞蹈室',
    '电影院', '剧院', 'KTV', '网吧', '棋牌室',
    '洗衣店', '干洗店', '修鞋店', '裁缝店',
    '宠物店', '宠物医院', '宠物美容',
    '花店', '婚庆公司', '殡仪馆',
    // UI/버튼
    '立即注册', '免费试用', '立即购买', '加入购物车', '结算',
    '查看详情', '了解更多', '立即咨询', '在线客服', '联系客服',
    '收藏', '分享', '举报', '投诉', '反馈',
    '上一页', '下一页', '返回顶部', '回到首页',
    '正在加载', '请稍候', '提交成功', '操作失败',
    '筛选条件', '排序方式', '综合排序', '距离最近', '好评优先', '价格最低',
    '营业中', '已打烊', '暂停营业', '即将开业',
    '写评价', '看评价', '全部评价', '好评', '中评', '差评',
    '周边推荐', '附近商家', '同类商家',
    // 지역 (中国)
    '北京', '上海', '广州', '深圳', '杭州', '成都', '重庆', '武汉',
    '南京', '天津', '苏州', '西安', '长沙', '沈阳', '青岛', '大连',
    '厦门', '昆明', '贵阳', '哈尔滨', '长春', '南昌', '太原', '合肥',
    '福州', '济南', '郑州', '石家庄', '乌鲁木齐', '兰州', '银川',
    '西宁', '呼和浩特', '拉萨', '南宁', '海口', '三亚', '桂林',
    '丽江', '大理', '九寨沟', '张家界', '黄山', '泰山',
    '朝阳区', '海淀区', '东城区', '西城区', '浦东新区', '静安区',
    '天河区', '越秀区', '福田区', '南山区', '龙岗区',
    // 台湾
    '台北', '台中', '台南', '高雄', '新竹', '基隆', '嘉义', '花莲',
    '宜兰', '屏东', '桃园', '新北', '淡水', '九份', '垦丁', '日月潭',

    // ═══════════════════════════════════════════════════
    // 58. 러시아어(RU) 기본 주소록 카테고리/UI ~100
    // ═══════════════════════════════════════════════════
    'рестораны', 'ресторан', 'кафе', 'бар', 'отели', 'отель', 'гостиница',
    'магазины', 'магазин', 'аптека', 'аптеки', 'больница', 'больницы',
    'клиника', 'клиники', 'стоматология', 'ветеринар', 'салон красоты',
    'парикмахерская', 'фитнес', 'спортзал', 'бассейн', 'сауна', 'баня',
    'школа', 'университет', 'детский сад', 'церковь', 'мечеть',
    'банк', 'страхование', 'недвижимость', 'юрист', 'адвокат', 'нотариус',
    'автосервис', 'автомойка', 'заправка', 'шиномонтаж',
    'химчистка', 'прачечная', 'ремонт', 'строительство',
    'переезд', 'доставка', 'такси', 'грузоперевозки',
    'фотограф', 'типография', 'реклама',
    'ритуальные услуги', 'цветочный магазин', 'ювелирный магазин',
    // UI
    'войти', 'выйти', 'регистрация', 'поиск', 'меню', 'главная',
    'о нас', 'контакты', 'помощь', 'условия', 'политика конфиденциальности',
    'цены', 'услуги', 'отзывы', 'карта', 'фото', 'ещё',
    'категория', 'фильтр', 'сортировка', 'далее', 'назад', 'закрыть',
    'сохранить', 'удалить', 'скачать', 'поделиться', 'подписаться',
    // 지역
    'москва', 'санкт-петербург', 'новосибирск', 'екатеринбург', 'казань',
    'нижний новгород', 'самара', 'ростов-на-дону', 'краснодар', 'воронеж',
    'красноярск', 'пермь', 'волгоград', 'уфа', 'челябинск',

    // ═══════════════════════════════════════════════════
    // 59. 아랍어(AR) / 힌디어(HI) 기본 카테고리 ~80
    // ═══════════════════════════════════════════════════
    // 아랍어
    'مطعم', 'مطاعم', 'فندق', 'فنادق', 'مقهى', 'صيدلية', 'مستشفى',
    'عيادة', 'مدرسة', 'جامعة', 'مسجد', 'كنيسة', 'بنك',
    'محامي', 'طبيب', 'مهندس', 'كهربائي', 'سباك', 'نجار',
    'صالون', 'حلاق', 'مغسلة', 'ميكانيكي', 'بقالة', 'سوق',
    'بحث', 'تسجيل الدخول', 'اتصل بنا', 'المزيد', 'عرض الكل',
    'تصفية', 'ترتيب', 'التالي', 'السابق', 'إغلاق',
    // 힌디어
    'रेस्तरां', 'होटल', 'अस्पताल', 'दवाखाना', 'स्कूल', 'विश्वविद्यालय',
    'मंदिर', 'मस्जिद', 'गिरजाघर', 'बैंक', 'वकील', 'डॉक्टर',
    'इलेक्ट्रीशियन', 'प्लंबर', 'मैकेनिक', 'दर्जी', 'नाई',
    'जिम', 'सैलून', 'दुकान', 'बाजार', 'किराना',
    'खोजें', 'लॉग इन', 'संपर्क करें', 'और देखें', 'सब देखें',

    // ═══════════════════════════════════════════════════
    // 60. 사이트 푸터/법적 고지 문구 (Multi) ~100
    // ═══════════════════════════════════════════════════
    'all rights reserved', 'rights reserved', 'copyright notice', 'legal notice',
    'terms of use', 'acceptable use policy', 'user agreement', 'service agreement',
    'data processing agreement', 'data protection', 'privacy notice', 'cookie notice',
    'cookie consent', 'manage consent', 'privacy settings', 'cookie preferences',
    'do not sell my personal information', 'do not sell my info',
    'california privacy rights', 'your privacy choices',
    'gdpr compliance', 'ccpa compliance', 'hipaa compliance',
    'accessible version', 'screen reader', 'text only version',
    'back to top', 'return to top', 'go to top', 'top of page',
    'site feedback', 'website feedback', 'report a bug', 'report an issue',
    'last updated', 'last modified', 'published on', 'updated on',
    'developed by', 'designed by', 'powered by', 'hosted by', 'built with',
    'version', 'release notes', 'changelog', 'whats new',
    // KO
    '판권소유', '저작권고지', '법적고지', '이용약관', '개인정보처리방침',
    '쿠키동의', '개인정보설정', '접근성', '화면읽기',
    '최종수정', '게시일', '업데이트일',
    // JP
    '著作権表示', '法的通知', '利用規約', '個人情報保護方針',
    'Cookie同意', 'プライバシー設定', 'アクセシビリティ', 'スクリーンリーダー',
    '最終更新', '公開日', '更新日',

    // ═══════════════════════════════════════════════════
    // 34. 공공기관 및 정부부처 (KO) ~New
    // ═══════════════════════════════════════════════════
    '대통령', '국회의원', '도지사', '시장', '군수', '구청장', '시청', '도청', '군청', '구청', '경찰서', '소방서', '보건소', '세무서', '교육청', '법원', '검찰청', '우체국', '주민센터', '동사무소', '읍사무소', '면사무소', '선거관리위원회', '감사원', '국가정보원',

    // ═══════════════════════════════════════════════════
    // 35. 언론 및 방송사 (KO) ~New
    // ═══════════════════════════════════════════════════
    '방송국', '신문사', 'KBS', 'MBC', 'SBS', 'JTBC', 'YTN', '연합뉴스', '조선일보', '중앙일보', '동아일보', '한겨레', '경향신문', '매일경제', '한국경제',

    // ═══════════════════════════════════════════════════
    // 36. 뉴스 및 콘텐츠 용어 (KO) ~New
    // ═══════════════════════════════════════════════════
    '뉴스', '보도', '속보', '기자', '아나운서', '리포터', '제작진', '출연진', '프로그램', '유튜브', '유튜버', '인플루언서', '블로거',

    // ═══════════════════════════════════════════════════
    // 37. 기타 노이즈 키워드 (KO) ~New
    // ═══════════════════════════════════════════════════
    '검정원', '연구소', '숏텐츠', '본헤럴드', '외국인', '주민', '지원', '호수', '생태', '공원'
]);

/**
 * [v12.2] JAPANESE SUBSTRING BLACKLIST
 * 이 리스트의 단어가 업소명에 '포함'만 되어도 수집을 거부합니다. (부분 일치 차단)
 * 조사, 동사 어미, SEO 노이즈 등을 대거 포함하여 실효 9,999+ 패턴 커버.
 */
const GLOBAL_JA_SUBSTRING_BLACKLIST = [
    // --- 1. 조사 / 조동사 (Particles / Auxiliaries) ---
    'は', 'が', 'を', 'に', 'へ', 'と', 'で', 'も', 'の', 'から', 'まで', 'より',
    'ので', 'けど', 'ため', 'なら', 'ば', 'たり', 'ながら', 'ように', 'ことが',
    'ための', 'について', 'において', 'による', 'に対する',

    // --- 2. 동사 어미 (Verb Endings) ---
    'ます', 'ません', 'ました', 'ください', 'ましょう', 'できる', 'できない',
    'される', 'された', 'している', 'していた', 'してくる', 'していく',
    'です', 'でした', 'でしょう', 'ではない', 'ではないか',
    'する', 'した', 'やる', 'やった', 'ある', 'あった', 'いる', 'いった',

    // --- 3. SEO / 검색 엔진 노이즈 (SEO Noise) ---
    'キーワード', '検索', 'の検索結果', 'の一覧', 'について', 'に関連する',
    'の地図', 'の詳細', 'のクーポン', '의 검색결과', '의 일람', '에 대해서',
    '의 예약', '의 쿠폰', '의 상세', '의 지도', '의 메뉴',
    'おすすめ', 'ランキング', 'まとめ', '比較', '送料無料', '格安', '激安',
    '公式サイト', '公式ホームページ', '公式', '通販', 'オンラインショップ',
    'Hot Pepper', 'ホットペッパー', '食べログ', 'ぐるなび', 'RETTY',
    '最新', '人気', '全国', 'ガイド', '特集', '選び方', '徹底比較', '完全版',
    '質問', '口コミ', '評価', '料金', '住所', '外観', '内観', 'アクセス',
    'とは', 'とは何か', '意味', '定義', '紹介', '解説',

    // --- 4. 광고 / UI / 기타 노이즈 (Ad & UI Noise) ---
    '広告', 'スポンサー', 'PR', 'タイアップ', '注目', '話題', '日', '致順',
    'はこちら', 'を表示', 'を検索', 'で探す', 'クリック', 'タップ',
    'ログイン', 'ログアウト', '会員登録', 'マイページ', 'カート',
    'お気に入り', 'ブックマーク', '保存', 'シェア', '共有',
    '送料無料', '即日発送', '翌日到着', 'ポイント', '還元',
    'セール', 'キャンペーン', '特典', 'プレゼント', '限定',
    '準備中', '近日公開', '売り切れ', '在庫切れ',

    // --- 5. 숫자/단위 조합형 (Dynamic Pattern Snippets) ---
    '円', '名', '件', '枚', '点', '室', '部屋', 'ページ',
    '歳', '才', '分', '時間', '秒', '日', '月', '年',
    'km', 'm', 'cm', 'mm', 'kg', 'g', 'ml', 'l',
    '％', '%', 'OFF', 'オフ', '引き'
];

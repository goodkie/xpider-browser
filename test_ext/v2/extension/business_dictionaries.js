/**
 * business_dictionaries.js v1.0
 * Multi-language dictionaries for business name filtering.
 * Supported: EN, KO, JA, FR, DE, IT, ES, PT, ID, ZH
 */

// [v15.0] Explicit variable declaration for Global Scope
var BUSINESS_DICTIONARIES = {
    'en': {
        'suffixes': ['Inc', 'Ltd', 'Corp', 'Co.', 'Group', 'Solutions', 'Services', 'Associates', 'Partners', 'Agency', 'LLC', 'LLP', 'Store', 'Shop', 'Clinic', 'Hospital', 'School', 'University', 'Academy', 'Trust', 'Association', 'Bank', 'Factory', 'Plant', 'Studio', 'Gallery', 'Kitchen', 'Bar', 'Grill', 'Pub', 'Bistro', 'Plumbing', 'Electric', 'Heating', 'Cooling', 'Legal', 'Medical', 'Dental', 'Auto', 'Repair', 'Center', 'Consulting', 'Architecture', 'Design', 'Law', 'Pharma', 'Tech', 'Ventures'],
        positiveMarkers: ['Official', 'Pro', 'Professional', 'Recommended', 'Best', 'Certified', 'Authorized', 'Quality', 'Custom', 'Specialized', 'Trust', 'Expert', 'Direct'],
        uiBlacklist: ['home', 'results', 'search', 'results', 'news', 'shopping', 'images', 'videos', 'login', 'signup', 'signin', 'register', 'contact', 'about', 'terms', 'privacy', 'help', 'support', 'faq', 'dashboard', 'profile', 'settings', 'logout', 'cart', 'checkout'],
        genericCategories: ['restaurant', 'cafe', 'coffee', 'bakery', 'shop', 'store', 'hospital', 'medical', 'dental', 'gym', 'fitness', 'school', 'academy', 'salon', 'spa', 'office', 'agency', 'plumber', 'electrician', 'dentist', 'lawyer', 'attorney', 'mechanic', 'locksmith', 'hvac', 'roofer', 'painter', 'builder']
    },
    ko: {
        suffixes: ['유치원', '어린이집', '학원', '의원', '병원', '약국', '식당', '카페', '커피', '베이커리', '공방', '스튜디오', '클리닉', '치과', '상사', '산업', '건설', '공사', '기획', '유통', '무역', '물류', '센터', '본점', '지점', '직영', '매장', '상점', '빌딩', '타워', '치킨', '갈비', '스시', '주식회사', '유한회사', '합자회사', '사단법인', '재단법인', '협회', '조합', '연맹', '(주)', '(유)', '㈜', '공인중개사', '부동산', '법률사무소', '세무사', '회계사', '한의원', '마트', '점', '관', '당', '집', '옥', '원', '실', '방', '랑', '숍', '몰', '관', '소', '루', '장', '관', '각', '채', '재', '단', '관', '헌', '정', '궁', '전', '단지', '아파트', '타운', '플라자', '파크', '시장', '백화점', '아울렛', '세탁소', '수선', '네일', '피부과', '정형외과', '내과', '안과', '이비인후과', '산부인과', '비뇨기과', '외과', '소아과', '정신과', '신경과', '재활의학과'],
        positiveMarkers: ['전문', '본점', '지점', '직영', '상가', '빌딩', '타워', '공식', '프랜차이즈', '가맹점', '교육원', '연구소', '센터', '사무실', '사무소', '스토어', '플레이스'],
        uiBlacklist: ['검색', '더보기', '지도', '뉴스', '쇼핑', '이미지', '동영상', '로그인', '회원가입', '공지사항', '고객센터', '리뷰', '별점', '평점', '문의', '전화', '예약', '찾기', '결과', '목록', '날씨', '카페', '블로그', '카페홈', '내소식', '전체', '설정'],
        genericCategories: ['요가', '필라테스', '헬스장', '레스토랑', '카페', '커피숍', '이자카야', '식당', '병원', '의원', '약국', '학원', '학교', '유치원', '어린이집', '미용실', '네일아트'],
        locationEndings: /[동구시군읍명리로길번지층호]$/
    },
    ja: {
        suffixes: ['株式会社', '有限회사', '合同회사', '医療法人', '社단法人', '財단法人', '宗教法人', '学校法人', '(주)', '(유)', '(합)', 'クリニック', '歯科', '医院', '病院', '支店', '本店', '工房', '製作所', '営業所', 'ショップ', 'ベーカリー', 'ホテル', '旅館', '料理', '割烹', '診療所', '歯科医院', 'サロン', '美容室', '美容院', '理容室', '理髪店', 'ヘアメイク', 'ネイル', 'エステ', 'オフィス', '事務所', 'センター', 'スタジオ', 'スクール', '塾', '予備校', '学校', '幼稚園', '保育園', '宿', 'ペンション', 'ゲストハウス', 'ヴィラ', 'ステイ', 'マーケット', '薬局', 'ドラッグストア', '銀行', '信用金庫', '証券', '保険', '郵便局', '交番', '駅', '公園', '神社', '寺', '教会', '工務店', '不動産', 'ビル', 'マンション', 'アパート', 'ハイツ', 'コーポ', 'テラス', 'レジデンス', '整骨院', '接骨院', '鍼灸', 'マッサージ', '弁護士事務所', '税理士事務所', '会計事務所', '設計事務所', '印刷所', '加工所', '組合', '会議所', '商事', '興業', '産業', '物産', '通商'],
        positiveMarkers: ['おすすめ', '人気', '厳選', '最新', '伝統', '老舗', '特選', '公式', '専門店', '直営'],
        uiBlacklist: ['検索', 'メニュー', 'ダウンロード', 'アクセス', 'カテゴリ', 'カレンダー', 'ログイン', 'サービス', 'ガイド', 'ショップ', 'ストア', 'ニュース', 'イベント', 'メンバー', 'スタッフ', 'ジャンル', 'ランキング', 'こだわり', 'の一覧', 'について', 'に関連する', 'の予約', 'のクチコミ', 'の地図', 'の詳細', 'のクーポン'],
        genericCategories: ['ヨガ', 'ピラティス', 'ジム', 'レストラン', 'カフェ', '居酒屋', '病院', 'クリニック', '塾', 'スクール', '教室', '整骨院', '接骨院', '美容室', '美容院', '理容室', '理髪店', 'ヘアサロン', 'ネイルサロン', 'エステサロン'],
        locationEndings: /[町村区市郡県丁目番地号階駅]$/
    },
    fr: {
        suffixes: ['SARL', 'SA', 'SAS', 'EURL', 'SNC', 'SCI', 'Restaurant', 'Hôtel', 'Boutique', 'Magasin', 'Clinique', 'Cabinet', 'Étude', 'Agence', 'Atelier', 'Studio', 'Galerie', 'École', 'Institut', 'Lycée', 'Mairie', 'Banque', 'Boulangerie', 'Pâtisserie', 'Pharmacie', 'Salon', 'Spa'],
        positiveMarkers: ['Services', 'Solutions', 'Espace', 'Centre', 'Groupe', 'Expert', 'Spécialiste', 'Conseil', 'Gestion'],
        uiBlacklist: ['accueil', 'recherche', 'résultats', 'actualités', 'shopping', 'images', 'vidéos', 'connexion', 'inscription', 'contact', 'propos', 'mentions', 'confidentialité', 'aide', 'support', 'panier', 'compte'],
        genericCategories: ['restaurant', 'café', 'brasserie', 'boulangerie', 'boutique', 'magasin', 'hôtel', 'clinique', 'dentiste', 'gym', 'école', 'coiffeur']
    },
    de: {
        suffixes: ['GmbH', 'AG', 'KG', 'OHG', 'e.V.', 'GbR', 'Restaurant', 'Hotel', 'Bäckerei', 'Konditorei', 'Metzgerei', 'Schule', 'Gymnasium', 'Klinik', 'Praxis', 'Apotheke', 'Büro', 'Agentur', 'Werkstatt', 'Atelier', 'Studio', 'Galerie', 'Bank', 'Sparkasse', 'Laden', 'Geschäft', 'Markt'],
        positiveMarkers: ['Service', 'Lösungen', 'Zentrum', 'Gruppe', 'Experte', 'Spezialist', 'Beratung', 'Management'],
        uiBlacklist: ['startseite', 'suche', 'ergebnisse', 'nachrichten', 'bilder', 'videos', 'anmelden', 'registrieren', 'kontakt', 'impressum', 'datenschutz', 'hilfe', 'warenkorb', 'konto'],
        genericCategories: ['restaurant', 'gaststätte', 'café', 'bäckerei', 'laden', 'geschäft', 'hotel', 'klinik', 'arzt', 'schule', 'friseur']
    },
    it: {
        suffixes: ['S.r.l.', 'S.p.A.', 'S.n.c.', 'S.a.s.', 'Ristorante', 'Albergo', 'Hotel', 'Negozio', 'Bottega', 'Clinica', 'Studio', 'Ambulatorio', 'Ufficio', 'Agenzia', 'Officina', 'Atelier', 'Galleria', 'Scuola', 'Istituto', 'Banca', 'Panificio', 'Pasticceria', 'Farmacia', 'Salone'],
        positiveMarkers: ['Servizi', 'Soluzioni', 'Centro', 'Gruppo', 'Esperto', 'Specialista', 'Consulenza', 'Gestione'],
        uiBlacklist: ['home', 'ricerca', 'risultati', 'notizie', 'immagini', 'video', 'accedi', 'registrati', 'contatti', 'chi', 'siamo', 'privacy', 'aiuto', 'carrello', 'profilo'],
        genericCategories: ['ristorante', 'trattoria', 'pizzeria', 'bar', 'caffè', 'panificio', 'negozio', 'hotel', 'clinica', 'medico', 'scuola', 'parrucchiere']
    },
    es: {
        suffixes: ['S.A.', 'S.L.', 'S.C.', 'C.B.', 'S.A.U.', 'Restaurante', 'Hotel', 'Hostal', 'Tienda', 'Almacén', 'Clínica', 'Consultorio', 'Despacho', 'Oficina', 'Agencia', 'Taller', 'Estudio', 'Galería', 'Escuela', 'Colegio', 'Instituto', 'Banco', 'Panadería', 'Pastelería', 'Farmacia', 'Peluquería'],
        positiveMarkers: ['Servicios', 'Soluciones', 'Centro', 'Grupo', 'Experto', 'Especialista', 'Asesoría', 'Gestión'],
        uiBlacklist: ['inicio', 'buscar', 'resultados', 'noticias', 'compras', 'imágenes', 'vídeos', 'entrar', 'registro', 'contacto', 'nosotros', 'privacidad', 'ayuda', 'carrito', 'perfil'],
        genericCategories: ['restaurante', 'bar', 'cafetería', 'panadería', 'tienda', 'almacén', 'hotel', 'clínica', 'médico', 'escuela', 'peluquería']
    },
    pt: {
        suffixes: ['Ltda.', 'S.A.', 'EIRELI', 'ME', 'EPP', 'Restaurante', 'Hotel', 'Pousada', 'Loja', 'Armazém', 'Clínica', 'Consultório', 'Escritório', 'Agência', 'Oficina', 'Estúdio', 'Galeria', 'Escola', 'Colégio', 'Instituto', 'Banco', 'Padaria', 'Confeitaria', 'Farmácia', 'Cabeleireiro'],
        positiveMarkers: ['Serviços', 'Soluções', 'Centro', 'Grupo', 'Especialista', 'Consultoria', 'Gestão'],
        uiBlacklist: ['início', 'pesquisa', 'resultados', 'notícias', 'compras', 'imagens', 'vídeos', 'entrar', 'registo', 'contato', 'sobre', 'privacidade', 'ajuda', 'carrinho', 'perfil'],
        genericCategories: ['restaurante', 'bar', 'café', 'padaria', 'loja', 'hotel', 'clínica', 'médico', 'escola', 'cabeleireiro']
    },
    id: {
        suffixes: ['PT', 'CV', 'Firma', 'UD', 'Koperasi', 'Yayasan', 'Toko', 'Warung', 'Kedai', 'Restoran', 'Rumah Makan', 'Hotel', 'Wisma', 'Klinik', 'Puskesmas', 'RS', 'Rumah Sakit', 'Kantor', 'Biro', 'Agensi', 'Bengkel', 'Studio', 'Galeri', 'Sekolah', 'Madrasah', 'Kampus', 'Universitas', 'Bank'],
        positiveMarkers: ['Layanan', 'Solusi', 'Pusat', 'Grup', 'Ahli', 'Spesialis', 'Konsultasi', 'Manajemen'],
        uiBlacklist: ['beranda', 'cari', 'hasil', 'berita', 'belanja', 'gambar', 'video', 'masuk', 'daftar', 'kontak', 'tentang', 'privasi', 'bantuan', 'keranjang', 'profil'],
        genericCategories: ['restoran', 'warung', 'kedai', 'kafe', 'toko', 'hotel', 'klinik', 'dokter', 'sekolah', 'salon']
    },
    zh: {
        suffixes: ['有限公司', '股份有限公司', '集团', '餐厅', '酒店', '饭店', '商店', '超市', '诊所', '医院', '机构', '公司', '工作室', '工厂', '学校', '学院', '银行', '中心', '代理', '事务所'],
        positiveMarkers: ['推荐', '热门', '专业', '权威', '官方', '直营', '连锁', '特选'],
        uiBlacklist: ['首页', '搜索', '结果', '新闻', '购物', '图片', '视频', '登录', '注册', '联系', '关于', '隐私', '帮助', '购物车', '个人中心'],
        genericCategories: ['餐厅', '饭店', '咖啡馆', '面包店', '商店', '超市', '酒店', '诊所', '医生', '学校', '美容院'],
        locationEndings: /[省市区县镇路街弄号楼]$/
    }
};

if (typeof self !== 'undefined') {
    self.BUSINESS_DICTIONARIES = BUSINESS_DICTIONARIES;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { BUSINESS_DICTIONARIES };
}

document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('search-input');
    const searchBtn = document.getElementById('search-btn');
    const newsGrid = document.getElementById('news-grid');
    const body = document.body;

    // 테마 설정 불러오기
    function applyTheme() {
        const theme = localStorage.getItem('app-theme') || 'theme-dark';
        body.className = theme;
    }
    applyTheme();

    // 테마 변경 감지 (같은 도메인일 경우 localStorage 이벤트가 발생)
    window.addEventListener('storage', (e) => {
        if (e.key === 'app-theme') applyTheme();
    });

    // ─── 언어 설정 및 로컬라이징 ──────────────────────────────────
    function applyLanguage() {
        const lang = localStorage.getItem('app-lang') || 'en';
        
        const placeholders = {
            ko: "구글에서 웹 검색...",
            en: "Search the web with Google...",
            ja: "Googleでウェブ 검색...",
            zh: "使用 Google 搜索...",
            vi: "Tìm kiếm trên web với Google..."
        };
        const newsTitles = {
            ko: "실시간 경제 뉴스",
            en: "Economic News Feed",
            ja: "リアルタイム経済ニュース",
            zh: "实时经济新闻",
            vi: "Tin tức kinh tế trực tuyến"
        };
        const loadingTexts = {
            ko: "최신 뉴스 로딩 중...",
            en: "Loading latest insights...",
            ja: "最新ニュースを読み込み中...",
            zh: "正在加载最新动态...",
            vi: "Đang tải tin tức mới nhất..."
        };

        searchInput.placeholder = placeholders[lang] || placeholders['en'];
        document.getElementById('news-title').textContent = newsTitles[lang] || newsTitles['en'];
        
        const loader = document.querySelector('.loader');
        if (loader) loader.textContent = loadingTexts[lang] || loadingTexts['en'];

        renderNews(lang);
    }

    // 구글 검색 실행
    function performSearch() {
        const query = searchInput.value.trim();
        const lang = localStorage.getItem('app-lang') || 'en';
        if (query) {
            // 언어에 따른 검색 지역 설정 (hl 파라미터 활용)
            window.location.href = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=${lang}`;
        }
    }

    searchBtn.addEventListener('click', performSearch);
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') performSearch();
    });

    // ─── 다국어 뉴스 데이터 ──────────────────────────────────────────
    const newsData = {
        ko: [
            {
                title: "글로벌 증시, 미 연준 금리 동결 기대에 상승세",
                snippet: "인플레이션 둔화 지표가 잇따라 발표되면서 시장에서는 금리 인하 시점에 대한 기대감이 커지고 있습니다...",
                tag: "경제",
                img: "https://images.unsplash.com/photo-1611974715853-2b8ef9d1d1b2?w=800&q=80",
                source: "네이버 뉴스",
                time: "2시간 전",
                url: "https://news.naver.com/section/101"
            },
            {
                title: "K-배터리, 차세대 전고체 배터리 상용화 박차",
                snippet: "국내 주요 배터리 3사가 차세대 기술 리더십 확보를 위해 R&D 투자를 대폭 확대하고 있습니다...",
                tag: "기술/산업",
                img: "https://images.unsplash.com/photo-1593941707882-a5bba14938c7?w=800&q=80",
                source: "매일경제",
                time: "1시간 전",
                url: "https://www.mk.co.kr"
            },
            {
                title: "반도체 업황 회복 본격화... 삼성전자·SK하이닉스 실적 개선",
                snippet: "메모리 반도체 가격 상승과 AI 서버 수요 폭증으로 국내 반도체 기업들의 실적이 턴어라운드하고 있습니다...",
                tag: "증시",
                img: "https://images.unsplash.com/photo-1591696208202-7310734936d8?w=800&q=80",
                source: "한국경제",
                time: "30분 전",
                url: "https://www.hankyung.com"
            }
        ],
        en: [
            {
                title: "Global Markets React to Fed's Latest Rate Decision",
                snippet: "Central banks worldwide are adjusting their strategies as inflation data shows signs of stabilization across major economies...",
                tag: "ECONOMY",
                img: "https://images.unsplash.com/photo-1611974715853-2b8ef9d1d1b2?w=800&q=80",
                source: "Financial Times",
                time: "2h ago",
                url: "https://www.ft.com"
            },
            {
                title: "Tech Giants Unveil New AI Infrastructure Plans",
                snippet: "The next phase of cloud computing is here, with investments exceeding billions for dedicated AI hardware facilities...",
                tag: "TECH",
                img: "https://images.unsplash.com/photo-1677442136019-21780ecad995?w=800&q=80",
                source: "Reuters",
                time: "45m ago",
                url: "https://www.reuters.com"
            },
            {
                title: "Green Energy Stocks Surge Amid New Policy Updates",
                snippet: "Investors are pivoting towards renewable sectors as the government announces unprecedented tax credits for solar projects...",
                tag: "MARKETS",
                img: "https://images.unsplash.com/photo-1466611653911-95282ee3356d?w=800&q=80",
                source: "Bloomberg",
                time: "1h ago",
                url: "https://www.bloomberg.com"
            }
        ],
        ja: [
            {
                title: "日本経済、緩やかな回復基調続く",
                snippet: "内閣府が発表した月例経済報告では、設備投資や個人消費の底堅さが指摘されています...",
                tag: "経済",
                img: "https://images.unsplash.com/photo-1526948531399-320e7e40f0ca?w=800&q=80",
                source: "日本経済新聞",
                time: "1時間前",
                url: "https://www.nikkei.com"
            }
        ]
    };

    function renderNews(lang) {
        newsGrid.innerHTML = '';
        const list = newsData[lang] || newsData['en'];
        
        list.forEach(item => {
            const card = document.createElement('div');
            card.className = 'news-card';
            card.innerHTML = `
                <div class="news-img" style="background-image: url('${item.img}')"></div>
                <div class="news-content">
                    <div class="news-tag">${item.tag}</div>
                    <h3 class="news-headline">${item.title}</h3>
                    <p class="news-snippet">${item.snippet}</p>
                    <div class="news-footer">
                        <span>${item.source}</span>
                        <span>${item.time}</span>
                    </div>
                </div>
            `;
            card.onclick = () => window.location.href = item.url;
            newsGrid.appendChild(card);
        });
    }

    // 테마 및 언어 변경 감지
    window.addEventListener('storage', (e) => {
        if (e.key === 'app-theme') applyTheme();
        if (e.key === 'app-lang') applyLanguage();
    });

    // 초기 실행
    applyTheme();
    applyLanguage();
});

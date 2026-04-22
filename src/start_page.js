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

    // 구글 검색 실행
    function performSearch() {
        const query = searchInput.value.trim();
        if (query) {
            window.location.href = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
        }
    }

    searchBtn.addEventListener('click', performSearch);
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') performSearch();
    });

    // 실시간 경제 뉴스 데이터 (시뮬레이션)
    const mockNews = [
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
            snippet: "The next phase of cloud computing is here, with investments exceeding billions for dedicated AI hardware facilities in Southeast Asia...",
            tag: "TECH & STOCK",
            img: "https://images.unsplash.com/photo-1677442136019-21780ecad995?w=800&q=80",
            source: "Reuters",
            time: "45m ago",
            url: "https://www.reuters.com"
        },
        {
            title: "Green Energy Stocks Surge Amid New Policy Updates",
            snippet: "Investors are pivoting towards renewable sectors as the government announces unprecedented tax credits for solar and wind projects...",
            tag: "MARKETS",
            img: "https://images.unsplash.com/photo-1466611653911-95282ee3356d?w=800&q=80",
            source: "Bloomberg",
            time: "1h ago",
            url: "https://www.bloomberg.com"
        },
        {
            title: "Housing Market Trends: A Shift in Urban Demand",
            snippet: "New data suggests a significant return to city living, impacting rental yields and property prices in major metropolitan hubs...",
            tag: "REAL ESTATE",
            img: "https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=800&q=80",
            source: "WSJ",
            time: "3h ago",
            url: "https://www.wsj.com"
        },
        {
            title: "Cryptocurrency Regulation: SEC Issues New Guidelines",
            snippet: "The digital asset landscape faces new transparency requirements as regulators clarify the status of multiple utility tokens...",
            tag: "CRYPTO",
            img: "https://images.unsplash.com/photo-1621761191319-c6fb62004040?w=800&q=80",
            source: "CNBC",
            time: "15m ago",
            url: "https://www.cnbc.com"
        },
        {
            title: "Supply Chain Resilience: Navigating Global Disruption",
            snippet: "Logistics leaders are implementing AI-driven tracking systems to mitigate the impact of ongoing geopolitical tensions on trade routes...",
            tag: "LOGISTICS",
            img: "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=800&q=80",
            source: "The Economist",
            time: "5h ago",
            url: "https://www.economist.com"
        }
    ];

    function renderNews() {
        newsGrid.innerHTML = '';
        mockNews.forEach(item => {
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

    // 초기 렌더링
    renderNews();
});

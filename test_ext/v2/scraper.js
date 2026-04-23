const puppeteer = require('puppeteer');

/**
 * 텍스트나 URL에서 상호명 후보를 추출하는 기본 로직
 * 숫자와 특수문자를 제거하여 더 순수한 상호명 후보를 반환합니다.
 */
function extractPotentialNames(text) {
    if (!text) return [];

    // 1. 모든 숫자를 공백으로 치환 (가장 우선 순위)
    const noNumbers = text.replace(/[0-9]/g, ' ');

    // 2. 남은 비문자(가-힣, 일본어, A-Z, a-z, 공백 제외)를 공백으로 치환
    // 일본어 포함: Hiragana(\u3040-\u309F), Katakana(\u30A0-\u30FF), Kanji(\u4E00-\u9FAF)
    const sanitized = noNumbers.replace(/[^가-힣a-zA-Z\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\s]/g, ' ');

    // 3. 줄바꿈, 콤마, 탭 등 구분자로 나누기
    const items = sanitized.split(/[\n\t,;]/);

    const cleaned = items
        .map(item => {
            // 4. 연속된 공백 하나로 정리 및 양끝 공백 제거
            return item.replace(/\s+/g, ' ').trim();
        })
        .filter(name => {
            // 5. 필터링: 유의미한 길이의 상호만 남김 (한글/일본어 2자 이상, 영문 3자 이상)
            const hasCJK = /[가-힣\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(name);
            if (hasCJK) return name.length >= 2 && name.length < 30;
            return name.length >= 3 && name.length < 40;
        });

    return [...new Set(cleaned)];
}

/**
 * 특정 상호명으로 홈페이지를 검색합니다.
 */
async function findHomepage(browser, companyName) {
    const page = await browser.newPage();
    try {
        // [강화] 실제 브라우저처럼 보이도록 User-Agent 및 헤더 설정
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        await page.setExtraHTTPHeaders({ 'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7' });

        const cleanName = companyName.replace(/[0-9]/g, '').trim();
        if (!cleanName || cleanName.length < 2) return '유효하지 않은 상호';

        // 일본어 포함 여부 확인
        const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(cleanName);
        const suffix = hasJapanese ? '公式サイト' : '공식 홈페이지';

        const searchQuery = encodeURIComponent(`${cleanName} ${suffix}`);
        await page.goto(`https://www.google.com/search?q=${searchQuery}`, {
            waitUntil: 'networkidle2',
            timeout: 20000
        });

        // [중요] 구글 레이아웃 변경 대응을 위한 다중 셀렉터 및 정밀 추출
        const links = await page.evaluate(() => {
            const results = [];
            // 구글 검색 결과 링크를 담고 있는 다양한 셀렉터 시도
            const selectors = [
                'div.g a[href]',
                'div.yuRUhb a[href]',
                'div.ca_p5c a[href]',
                'a h3', // 제목 클릭 링크
                'div#rso a[href]'
            ];

            selectors.forEach(selector => {
                const elements = document.querySelectorAll(selector);
                elements.forEach(el => {
                    let href = el.href;
                    if (!href && el.parentElement && el.parentElement.tagName === 'A') {
                        href = el.parentElement.href;
                    }

                    if (href && href.startsWith('http') &&
                        !href.includes('google.com') &&
                        !['facebook', 'instagram', 'twitter', 'youtube', 'blog.naver', 'map.naver', 'blog.daum', 'tistory', 'cafe.naver'].some(s => href.includes(s))) {
                        results.push(href);
                    }
                });
            });
            return [...new Set(results)]; // 중복 제거
        });

        // 첫 번째 유효한 링크 반환
        return links.length > 0 ? links[0] : '찾을 수 없음';
    } catch (error) {
        console.error(`Error searching for ${companyName}:`, error.message);
        return '에러 발생';
    } finally {
        await page.close();
    }
}

/**
 * URL에서 텍스트를 추출합니다.
 */
async function scrapeUrl(browser, url) {
    const page = await browser.newPage();
    try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        const text = await page.evaluate(() => document.body.innerText);
        return text;
    } catch (error) {
        console.error(`Error scraping URL ${url}:`, error);
        return '';
    } finally {
        await page.close();
    }
}

/**
 * 하위 페이지를 탐색하며 외부 링크를 수집합니다.
 * @param {number} maxDepth - 탐색할 최대 깊이 (0: 현재 페이지만)
 */
async function recursiveCrawl(browser, startUrl, maxDepth, onUpdate) {
    const visited = new Set();
    const toVisit = [{ url: startUrl, depth: 0 }];
    const externalLinks = new Set();
    const startUrlObj = new URL(startUrl);
    const domain = startUrlObj.hostname;
    const MAX_PAGES = 1000;

    // 소셜 미디어 및 기타 제외 대상 도메인
    const filterList = [
        'facebook.com', 'instagram.com', 'twitter.com', 'youtube.com', 'google.com',
        'linkedin.com', 'pinterest.com', 'tiktok.com', 'naver.com', 'daum.net',
        'kakao.com', 't.me', 'apple.com', 'microsoft.com', 'play.google.com',
        'apps.apple.com', 'blog.me'
    ];

    while (toVisit.length > 0 && visited.size < MAX_PAGES) {
        const { url, depth } = toVisit.shift();
        if (visited.has(url)) continue;
        visited.add(url);

        if (onUpdate) onUpdate(`탐색 중 [깊이 ${depth}, 페이지 ${visited.size}]: ${url}`, externalLinks.size);

        const page = await browser.newPage();
        try {
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });

            const pageData = await page.evaluate((currentDomain, filters) => {
                const anchors = Array.from(document.querySelectorAll('a'));
                const internal = [];
                const external = [];

                anchors.forEach(a => {
                    const href = a.href;
                    if (!href || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) return;

                    try {
                        const urlObj = new URL(href);
                        const host = urlObj.hostname;

                        // 동일 도메인 여부 확인
                        const isInternal = host === currentDomain || host.endsWith('.' + currentDomain);

                        if (isInternal) {
                            const cleanUrl = urlObj.origin + urlObj.pathname; // search/hash 제거하여 중복 방지
                            internal.push(cleanUrl);
                        } else {
                            // 필터 목록에 있는지 확인
                            const isFiltered = filters.some(f => host.includes(f));
                            if (!isFiltered) {
                                external.push(href);
                            }
                        }
                    } catch (e) { }
                });

                return {
                    internal: [...new Set(internal)],
                    external: [...new Set(external)]
                };
            }, domain, filterList);

            pageData.external.forEach(link => externalLinks.add(link));

            // 깊이 제한 내에서 방문하지 않은 내부 링크 추가
            if (depth < maxDepth) {
                pageData.internal.forEach(link => {
                    if (!visited.has(link)) {
                        toVisit.push({ url: link, depth: depth + 1 });
                    }
                });
            }

        } catch (error) {
            console.error(`Crawl error at ${url}:`, error.message);
        } finally {
            await page.close();
        }

        await new Promise(r => setTimeout(r, 300));
    }

    if (onUpdate) onUpdate(`크롤링 완료. 총 ${visited.size}페이지 탐색, ${externalLinks.size}개 외부 링크 발견.`, externalLinks.size);
    return [...externalLinks];
}

/**
 * [v13.0] 구글 재팬 딥서치: 상호명의 상세 정보(전화, 주소, 웹사이트 등)를 수집합니다.
 */
async function deepSearchGoogleJapan(browser, companyName) {
    const page = await browser.newPage();
    try {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7',
            'referer': 'https://www.google.co.jp/',
            'Upgrade-Insecure-Requests': '1'
        });

        const query = encodeURIComponent(companyName);
        await page.goto(`https://www.google.co.jp/search?q=${query}&hl=ja`, {
            waitUntil: 'networkidle2',
            timeout: 20000
        });

        const isBlocked = await page.evaluate(() => {
            return document.body.innerText.includes('로봇이 아닙니다') ||
                document.body.innerText.includes('ロボットではありません') ||
                document.querySelector('#captcha-form') !== null;
        });

        let details = { phone: 'N/A', address: 'N/A', website: 'N/A', rating: 'N/A', category: 'N/A' };

        if (!isBlocked) {
            details = await page.evaluate(() => {
                const data = { phone: 'N/A', address: 'N/A', website: 'N/A', rating: 'N/A', category: 'N/A' };
                const ratingEl = document.querySelector('span.Aq14f, span._S9a, span[aria-label*="星"]');
                if (ratingEl) data.rating = ratingEl.innerText.trim();
                const catEl = document.querySelector('[data-attrid="subtitle"], span.Yy7i6c, span.zS79B, span.Yhemj');
                if (catEl) data.category = catEl.innerText.trim();
                const addrEl = document.querySelector('[data-attrid="kc:/location/location:address"] span.Lrzyb');
                if (addrEl) data.address = addrEl.innerText.trim();
                const phoneEl = document.querySelector('[data-attrid="kc:/local:phone"] span.Lrzyb');
                if (phoneEl) data.phone = phoneEl.innerText.trim();
                const webEl = document.querySelector('a.n1obkb.mI8Pwc, a.ab_button[href*="http"], a[aria-label*="ウェブサイト"]');
                if (webEl && !webEl.href.includes('google.com')) data.website = webEl.href;
                return data;
            });
        }

        if (isBlocked || (details.phone === 'N/A' && details.address === 'N/A')) {
            console.log(`[DeepSearch] Google blocked or no info. Trying Yahoo Japan for ${companyName}...`);
            await page.goto(`https://search.yahoo.co.jp/search?p=${query}`, { waitUntil: 'networkidle2', timeout: 20000 });

            const yahooDetails = await page.evaluate(() => {
                const data = { phone: 'N/A', address: 'N/A', website: 'N/A', rating: 'N/A', category: 'N/A' };
                const addrEl = document.querySelector('.sw-Address__text, .sw-BusinessCard__address, .sw-InfoList__description');
                if (addrEl) data.address = addrEl.innerText.trim();
                const phoneEl = document.querySelector('.sw-PhoneNumber__text, .sw-BusinessCard__phone');
                if (phoneEl) data.phone = phoneEl.innerText.trim();
                const webEl = document.querySelector('a.sw-OfficialWebsite__link, a.sw-OfficialLinks__listItemLink, a[data-beacon*="official"]');
                if (webEl) data.website = webEl.href;
                const catEl = document.querySelector('.sw-Category__text, .sw-BusinessCard__category');
                if (catEl) data.category = catEl.innerText.trim();
                const ratingEl = document.querySelector('.sw-Rating__value, .sw-Rating__text');
                if (ratingEl) data.rating = ratingEl.innerText.trim();
                return data;
            });

            if (details.phone === 'N/A') details.phone = yahooDetails.phone;
            if (details.address === 'N/A') details.address = yahooDetails.address;
            if (details.website === 'N/A') details.website = yahooDetails.website;
            if (details.category === 'N/A') details.category = yahooDetails.category;
            if (details.rating === 'N/A') details.rating = yahooDetails.rating;
        }

        return details;
    } catch (e) {
        console.error(`Deep search error for ${companyName}:`, e.message);
        return { phone: 'N/A', address: 'N/A', website: 'N/A', rating: 'N/A', category: 'N/A' };
    } finally {
        await page.close();
    }
}

module.exports = {
    extractPotentialNames,
    findHomepage,
    deepSearchGoogleJapan,
    scrapeUrl,
    recursiveCrawl
};

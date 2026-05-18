const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');
const { createObjectCsvStringifier } = require('csv-writer');
const { extractPotentialNames, findHomepage, deepSearchGoogleJapan, scrapeUrl, recursiveCrawl } = require('./scraper');

const app = express();
const PORT = 5050;

app.use(cors());
app.use(express.json());

// 헬스체크 엔드포인트
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});

// 진행 상태를 클라이언트로 전송하기 위한 헬퍼
function sendStatus(res, data) {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
}

app.post('/api/process', async (req, res) => {
    const { type, content, depth } = req.body;
    const crawlDepth = parseInt(depth) || 0;
    console.log(`[${new Date().toLocaleTimeString()}] Request: type=${type}, depth=${crawlDepth}`);

    // Server-Sent Events 설정 강화
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // 즉시 연결 확인 플러시
    res.write(': ok\n\n');
    sendStatus(res, { status: 'connected', message: '서버 연결 성공. 작업을 시작합니다...' });

    const heartbeat = setInterval(() => {
        res.write(': heartbeat\n\n');
    }, 10000);

    let browser;
    try {
        browser = await puppeteer.launch({
            headless: "new",
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-blink-features=AutomationControlled', // 봇 탐지 우회 핵심 옵션
                '--window-size=1920,1080',
                '--lang=ko-KR,ko'
            ]
        });

        let companyNames = [];

        if (type === 'url') {
            sendStatus(res, { status: 'crawling', message: `사이트[${content}] 탐색 시작 (최대 깊이: ${crawlDepth})...` });
            const externalLinks = await recursiveCrawl(browser, content, crawlDepth, (msg, count) => {
                sendStatus(res, { status: 'crawling', message: msg, linkCount: count });
            });
            // 외부 링크의 도메인명을 상호명 후보로 사용하며 정제 규칙 적용
            companyNames = externalLinks.map(link => {
                try {
                    const url = new URL(link);
                    // 도메인에서 TLD(.com, .net 등)를 제외한 브랜드 파트 추출 시도
                    let parts = url.hostname.replace('www.', '').split('.');
                    let nameCandidate = parts.length > 1 ? parts[parts.length - 2] : parts[0];

                    // 정규식을 통한 숫자/기호 제거 (한글, 일본어, 영문, 공백 허용)
                    let cleanName = nameCandidate.replace(/[^가-힣a-zA-Z\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\s]/g, ' ').replace(/\s+/g, ' ').trim();
                    return cleanName;
                } catch (e) { return null; }
            }).filter(n => n && n.length >= 2);
            companyNames = [...new Set(companyNames)];
        } else {
            companyNames = extractPotentialNames(content);
        }

        if (companyNames.length === 0) {
            sendStatus(res, { status: 'error', message: '추출된 데이터가 없습니다. (숫자/기호 제외 후 유효한 상호명이 발견되지 않음)' });
            return res.end();
        }

        sendStatus(res, { status: 'extracting', message: `${companyNames.length}개의 상호명을 정제하여 수집했습니다.`, linkCount: companyNames.length });

        const results = [];
        for (let i = 0; i < companyNames.length; i++) {
            const name = companyNames[i];
            sendStatus(res, {
                status: 'searching',
                message: `[${i + 1}/${companyNames.length}] '${name}' 검색 중...`,
                current: i + 1,
                total: companyNames.length,
                name: name
            });

            const details = await deepSearchGoogleJapan(browser, name);
            results.push({
                name,
                homepage: details.website,
                address: details.address,
                phone: details.phone,
                rating: details.rating,
                category: details.category
            });
            await new Promise(resolve => setTimeout(resolve, 800)); // 항시적인 차단 방지용 딜레이 상향
        }

        const csvStringifier = createObjectCsvStringifier({
            header: [
                { id: 'name', title: '상호명' },
                { id: 'homepage', title: '홈페이지/웹사이트' },
                { id: 'address', title: '주소' },
                { id: 'phone', title: '전화번호' },
                { id: 'rating', title: '평점' },
                { id: 'category', title: '카테고리' }
            ]
        });

        const csvContent = csvStringifier.getHeaderString() + csvStringifier.stringifyRecords(results);

        sendStatus(res, {
            status: 'completed',
            message: '작업이 완료되었습니다.',
            results: results,
            csv: csvContent
        });

    } catch (error) {
        console.error('Processing error:', error);
        sendStatus(res, { status: 'error', message: `오류 발생: ${error.message}` });
    } finally {
        clearInterval(heartbeat);
        if (browser) await browser.close().catch(() => { });
        res.end();
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

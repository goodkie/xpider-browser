const fs = require('fs');
const filePath = 'e:\\vivpr\\ai\\collect-list\\extension\\background.js';

try {
    let buf = fs.readFileSync(filePath);

    // Strip BOM
    if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
        buf = buf.slice(3);
    }

    let content = buf.toString('utf8');

    // Restoration patterns for known corrupted strings
    const corrections = [
        { bad: /\?좑툘 ?대\? ?섏쭛??吏꾪뻾 以묒엯?덈떎\. ?좎떆留\?湲곕떎?ㅼ＜?몄슂\./g, good: '⚠️ 이미 수집이 진행 중입니다. 잠시만 기다려주세요.' },
        { bad: /援ъ“\?\?\?ㅻ쭏\?\?\?\?щ·留\?\(DOM \?⑦꽩 遺꾩꽍 \?\?\?\?\?\?쒖튂 \?곕룞\)/g, good: '구조적 스마트 크롤링 (DOM 패턴 분석 → 딥 서치 연동)' },
        { bad: /1\?④퀎: \?뱀궗\?댄듃 濡쒕뵫 諛\?\?숈쟻 肄섑뀗痢\?\?뚮뜑留\?/g, good: '1단계: 웹사이트 로딩 및 동적 콘텐츠 렌더링' },
        { bad: /2\?④퀎: \?ъ씠\?\?\?\?꾩슜 \?€\?됲꽣 諛\?踰붿슜 \?대━\?ㅽ떛\?쇰줈 \?곹샇紐\?異붿텧/g, good: '2단계: 사이트 전용 셀렉터 및 범용 휴리스틱으로 상호명 추출' }
    ];

    corrections.forEach(c => {
        content = content.replace(c.bad, c.good);
    });

    // Fix duplicated lines
    content = content.replace(/sessionResults = \[\];\r?\n\s*sessionResults = \[\];/g, 'sessionResults = [];');

    // Final check for other common Mojibake artifacts if possible
    // But manual restoration of key blocks is safer.

    fs.writeFileSync(filePath, content, { encoding: 'utf8' });
    console.log('Success: background.js repaired.');
} catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
}

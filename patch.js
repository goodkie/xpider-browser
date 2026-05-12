const fs = require('fs');
let content = fs.readFileSync('src/main.js', 'utf8');

// 1. Inject _checkCaptchaResolvedGlobal
const functionInject = `
// [v3.5] 이벤트 기반 즉각적 CAPTCHA 해결 감지 함수
function _checkCaptchaResolvedGlobal(triggeredUrl) {
    if (typeof _captchaResolveCallback !== 'function') return;

    try {
        const allWc = require('electron').webContents.getAllWebContents();
        let hasSorryPage    = false; 
        let hasSearchResult = false; 
        let hasBlankPage    = false; 

        for (const wc of allWc) {
            if (_scanWin && !_scanWin.isDestroyed() && wc.id === _scanWin.webContents.id) continue;
            
            const wcUrl = wc.getURL();
            if (!wcUrl || wcUrl.startsWith('file://') || wcUrl.startsWith('chrome-extension://')) continue;

            if (wcUrl === 'about:blank') {
                hasBlankPage = true;
            } else if (wcUrl.includes('/sorry/') || wcUrl.includes('recaptcha')) {
                if (wcUrl.includes('google.') || wcUrl.includes('bing.')) {
                    hasSorryPage = true;
                }
            } else if (wcUrl.includes('google.com/search') || wcUrl.includes('bing.com/search')) {
                hasSearchResult = true;
            }
        }

        if (!hasSorryPage && (hasSearchResult || hasBlankPage)) {
            if (_captchaCheckInterval) {
                clearInterval(_captchaCheckInterval);
                _captchaCheckInterval = null;
            }
            if (typeof _captchaResolveCallback === 'function') {
                const resolveFunc = _captchaResolveCallback;
                _captchaResolveCallback = null;
                log.info('[CAPTCHA] ⚡ 이벤트 기반 즉시 해결 감지! → 즉시 재개 트리거');
                broadcastExtMessage({ action: 'CAPTCHA_STATUS', status: 'resolved', auto: true });
                broadcastExtMessage({ action: 'CAPTCHA_RESUME_ALL' });
                resolveFunc(true);
            }
        }
    } catch(e) { log.error('[CAPTCHA] 전역 자동 감지 오류:', e.message); }
}
`;
content = content.replace('async function _handleCaptchaDetected(captchaUrl) {', functionInject + '\nasync function _handleCaptchaDetected(captchaUrl) {');

// 2. Inject into did-navigate
content = content.replace(
    /wc\.on\('did-navigate',\s*\(e,\s*url\)\s*=>\s*\{[\s\S]*?\}\);/,
    "wc.on('did-navigate', (e, url) => {\n        xLog('NAV', `WV:${getType()}`, `→ ${url.substring(0, 100)}`);\n        if (typeof _checkCaptchaResolvedGlobal === 'function') _checkCaptchaResolvedGlobal(url);\n    });"
);

// 3. Inject into did-navigate-in-page
content = content.replace(
    /wc\.on\('did-navigate-in-page',\s*\(e,\s*url\)\s*=>\s*\{[\s\S]*?\}\);/,
    "wc.on('did-navigate-in-page', (e, url) => {\n        xLog('NAV-SPA', `WV:${getType()}`, `→ ${url.substring(0, 100)}`);\n        if (typeof _checkCaptchaResolvedGlobal === 'function') _checkCaptchaResolvedGlobal(url);\n    });"
);

// 4. Update the interval inside _handleCaptchaDetected
content = content.replace(
    /_captchaCheckInterval = setInterval\(\(\) => \{[\s\S]*?\}, 3000\);/g,
    `_captchaCheckInterval = setInterval(() => { _checkCaptchaResolvedGlobal(); }, 500);`
);

// 5. Update _closeCaptchaTab Method 2
const closeTabUpdate = `
    // 방법 2: 캡챠 URL, 검색 결과, 또는 about:blank가 된 모든 webContents를 강제로 닫기 시도
    try {
        const allWc = require('electron').webContents.getAllWebContents();
        for (const wc of allWc) {
            if (_scanWin && !_scanWin.isDestroyed() && wc.id === _scanWin.webContents.id) continue;
            if (mainWindow && wc.id === mainWindow.webContents.id) continue;

            const wcUrl = wc.getURL();
            const isCaptchaRelated = 
                wcUrl.includes('/sorry/') || 
                wcUrl.includes('recaptcha') ||
                wcUrl === 'about:blank' ||
                wcUrl.includes('google.com/search') ||
                wcUrl.includes('bing.com/search');

            if (isCaptchaRelated) {
                log.info('[CAPTCHA] 탭 강제 정리: ' + wcUrl.substring(0, 50));
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.executeJavaScript(\`
                        (function() {
                            if (window.tabs && Array.isArray(window.tabs)) {
                                const url = \${JSON.stringify(wcUrl)};
                                const idx = window.tabs.findIndex(t => t.url === url || (url === 'about:blank' && t.url.includes('/sorry/')));
                                if (idx >= 0) {
                                    const id = window.tabs[idx].id;
                                    if (typeof closeTab === 'function') closeTab(id);
                                    else window.tabs.splice(idx, 1);
                                    return 'closed_by_url';
                                }
                            }
                            return 'not_found';
                        })()
                    \`).catch(() => {});
                }
                wc.loadURL('about:blank').catch(() => {});
                try { wc.close(); } catch(e) {}
            }
        }
    } catch(e) {}
`;
content = content.replace(
    /\/\/ 방법 2: 캡챠 URL을 갖고 있는 모든 webContents를 about:blank로 이동[\s\S]*?\} catch\(e\) \{\}/,
    closeTabUpdate.trim()
);

// 6. Ensure _handleCaptchaDetected broadcasts RESUME (in case of manual resolution)
content = content.replace(
    /await _closeCaptchaTab\(captchaUrl\);\s*\/\/ 6\. ── \[핵심\] 전체 수집 프로세스 재개/g,
    `broadcastExtMessage({ action: 'CAPTCHA_RESUME_ALL' });\n    await _closeCaptchaTab(captchaUrl);\n    // 6. ── [핵심] 전체 수집 프로세스 재개`
);

fs.writeFileSync('src/main.js', content, 'utf8');
console.log('Patch complete.');

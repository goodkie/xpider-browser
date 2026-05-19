// ─── DOM 요소 ─────────────────────────────────────────────────
const tabsList         = document.getElementById('tabs-list');
const webviewsWrapper  = document.getElementById('webviews-wrapper');
const newTabBtn        = document.getElementById('new-tab-btn');
const addressBar       = document.getElementById('address-bar');
const backBtn          = document.getElementById('back-btn');
const forwardBtn       = document.getElementById('forward-btn');
const reloadBtn        = document.getElementById('reload-btn');
const extensionsBar    = document.getElementById('side-dock');
const sidePanel        = document.getElementById('side-panel');
const sidePanelTitle   = document.getElementById('side-panel-title');
const closeSidePanelBtn = document.getElementById('close-side-panel-btn');
const extensionWebview = document.getElementById('extension-webview');

window.electronAPI.on('open-new-tab', (url) => {
    console.log('[IPC] Opening new tab from main process:', url);
    createNewTab(url);
});
const settingsBtn      = document.getElementById('settings-btn');
const settingsMenu     = document.getElementById('settings-menu');
const appContainer     = document.getElementById('app-container');
const addBtn           = document.getElementById('add-btn');
const toggleSidebarBtn = document.getElementById('toggle-sidebar-btn');
const sidebarOpener    = document.getElementById('sidebar-opener');
const bookmarkBtn      = document.getElementById('bookmark-btn');
const historyBtn       = document.getElementById('history-btn');
const overlayPanel     = document.getElementById('browser-overlay-panel');
const panelList        = document.getElementById('panel-list');
const panelTabs        = document.querySelectorAll('.panel-tab');
const clearHistoryBtn  = document.getElementById('clear-history-btn');
const downloadsBtn     = document.getElementById('downloads-btn');

// ── 업데이트 모달 요소 ──────────────────────────────────────
const updateModal      = document.getElementById('update-modal');
const modalUpdateBtn   = document.getElementById('modal-update-btn');
const modalSkipBtn     = document.getElementById('modal-skip-btn');
const modalCurrentVer  = document.getElementById('modal-current-ver');
const modalLatestVer   = document.getElementById('modal-latest-ver');
const modalNotes       = document.getElementById('modal-release-notes');
const updateToast      = document.getElementById('update-toast');
const toastMsg         = document.getElementById('toast-msg');

let currentExtensionId = null;
let currentPanelTab    = 'history';
let _releaseUrl        = '';
window.lastActiveTabInfo = null;

// ─── 데이터 초기화 ────────────────────────────────────────────
let history   = JSON.parse(localStorage.getItem('xpider-history')   || '[]');
let bookmarks = JSON.parse(localStorage.getItem('xpider-bookmarks') || '[]');
let downloads = JSON.parse(localStorage.getItem('xpider-downloads') || '[]');
let activeDownloads = new Map(); // downloadId → {filename, path, progress, status, receivedBytes, totalBytes, timestamp}

// ─── 테마 초기화 ──────────────────────────────────────────────
const savedTheme = localStorage.getItem('app-theme') || 'theme-dark';
appContainer.className = savedTheme;

// ─── 사이드바 상태 ────────────────────────────────────────────
const sidebarCollapsed = localStorage.getItem('sidebar-collapsed') === 'true';
if (sidebarCollapsed) appContainer.classList.add('sidebar-collapsed');

// ─── 언어 초기화 (기본값: 영어) ───────────────────────────────
// localStorage에 저장된 언어 설정이 없으면 영어로 초기화
if (!localStorage.getItem('app-lang')) {
    localStorage.setItem('app-lang', 'en');
}
let currentLang = localStorage.getItem('app-lang') || 'en';

function broadcastLangToExtensions(lang) {
    // 1. 현재 열린 사이드 패널 웹뷰에 언어 변경 전송
    if (extensionWebview && extensionWebview.src) {
        try {
            extensionWebview.executeJavaScript(
                `window.postMessage({ type: 'XPIDER_EVENT', name: 'language-change', data: { lang: '${lang}' } }, '*')`
            );
        } catch(e) {}
    }
    // 2. 모든 익스텐션 팝업 웹뷰에 전송
    document.querySelectorAll('webview').forEach(wv => {
        if (wv.src && wv.src.includes('extensions')) {
            try {
                wv.executeJavaScript(
                    `window.postMessage({ type: 'XPIDER_EVENT', name: 'language-change', data: { lang: '${lang}' } }, '*')`
                );
            } catch(e) {}
        }
    });
    // 3. 메인 프로세스를 통해 chrome.storage.local에 저장 → 익스텐션 재로드 시 반영
    try { window.electronAPI.send('set-extension-lang', lang); } catch(e) {}
}


function applyLanguage(lang) {
    const dict = window.translations[lang] || window.translations['en'];
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (dict[key]) el.textContent = dict[key];
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        if (dict[key]) el.title = dict[key];
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (dict[key]) el.placeholder = dict[key];
    });

    // 모든 익스텐션에 언어 변경 브로드캐스트
    broadcastLangToExtensions(lang);
}

applyLanguage(currentLang);

// ─── 테마 버튼 ────────────────────────────────────────────────
document.querySelectorAll('.theme-opt').forEach(opt => {
    opt.onclick = () => {
        const theme = opt.getAttribute('data-theme');
        appContainer.className = theme;
        localStorage.setItem('app-theme', theme);
        settingsMenu.classList.add('hidden');
    };
});

// ─── 언어 버튼 (설정 변경 → 모든 익스텐션 즉시 동기화) ──────
document.querySelectorAll('.lang-opt').forEach(opt => {
    opt.onclick = () => {
        const lang = opt.getAttribute('data-lang');
        currentLang = lang;
        applyLanguage(lang);
        localStorage.setItem('app-lang', lang);
        settingsMenu.classList.add('hidden');
        // 언어 변경 직후 현재 열린 사이드패널도 즉시 갱신
        broadcastLangToExtensions(lang);
    };
});

// ─── 버튼 이벤트 ──────────────────────────────────────────────
addBtn.onclick = () => { createNewTab('start_page.html'); };
toggleSidebarBtn.onclick = () => { appContainer.classList.add('sidebar-collapsed'); localStorage.setItem('sidebar-collapsed', 'true'); };
sidebarOpener.onclick    = () => { appContainer.classList.remove('sidebar-collapsed'); localStorage.setItem('sidebar-collapsed', 'false'); };

settingsBtn.onclick = (e) => {
    e.stopPropagation();
    settingsMenu.classList.toggle('hidden');
    overlayPanel.classList.add('hidden');
};

document.addEventListener('click', (e) => {
    if (!settingsMenu.contains(e.target) && e.target !== settingsBtn) settingsMenu.classList.add('hidden');
    if (!overlayPanel.contains(e.target) && e.target !== historyBtn && e.target !== bookmarkBtn) overlayPanel.classList.add('hidden');
});
settingsMenu.onclick = (e) => e.stopPropagation();

// ─── 윈도우 컨트롤 ────────────────────────────────────────────
document.getElementById('min-btn').onclick   = () => window.electronAPI.send('window-control', 'minimize');
document.getElementById('max-btn').onclick   = () => window.electronAPI.send('window-control', 'maximize');
document.getElementById('close-btn').onclick = () => window.electronAPI.send('window-control', 'close');

// ─── 로그아웃 버튼 ────────────────────────────────────────────
document.getElementById('logout-btn').onclick = () => {
    const dict = window.translations[currentLang] || window.translations['en'];
    if (confirm(dict.logout_confirm || 'Are you sure you want to logout?')) {
        window.electronAPI.send('auth-logout');
    }
};

// ─── 버전 정보 ────────────────────────────────────────────────
window.electronAPI.on('app_version', (version) => {
    const el = document.getElementById('app-version');
    if (el) el.textContent = version;
    if (modalCurrentVer) modalCurrentVer.textContent = version;
});

window.electronAPI.on('app_language', (lang) => {
    if (!localStorage.getItem('app-lang')) {
        currentLang = lang;
        applyLanguage(lang);
    }
});

// ── [v4.0] Email Extractor 실시간 업데이트 ────────────────────────────────────
// main.js → renderer_ui.js → extensionWebview (XPIDER_EVENT) + 사이드바 배지

// [v4.2] 팝업이 닫혀있는 동안 수신된 마지막 이메일 이벤트를 캐싱
// → 팝업을 열면 즉시 이 캐시를 주입하여 Current 탭에 즉시 표시
window._lastEmailCollectedPayload = null;

window.electronAPI.on('xpider-email-collected-event', (payload) => {
    const eventName = payload.name || 'email-collected';
    const data      = payload.data || payload;

    // 수집 이벤트는 항상 캐싱 (팝업 열릴 때 사용)
    if (eventName === 'email-collected') {
        window._lastEmailCollectedPayload = { name: eventName, data };
    }

    // 1. 익스텐션 웹뷰(popup.js)에 실시간 이벤트 전달
    if (extensionWebview && extensionWebview.src) {
        extensionWebview.executeJavaScript(
            `window.postMessage(${JSON.stringify({ type: 'XPIDER_EVENT', name: eventName, data })}, '*')`
        ).catch(() => {});
    }

    // 2. 사이드바 이메일 배지 업데이트
    if (eventName === 'update-badge' || eventName === 'email-collected') {
        const count = data.count ?? (Array.isArray(data.allEmails) ? data.allEmails.length : 0);
        
        // .ext-btn 중 'email' 혹은 '이메일'을 포함하는 버튼 찾기
        const emailBtn = [...document.querySelectorAll('.ext-item')].find(item => {
            const btn = item.querySelector('.ext-btn');
            const title = btn ? btn.title.toLowerCase() : '';
            const balloonTitle = item.querySelector('.preview-title') ? item.querySelector('.preview-title').textContent.toLowerCase() : '';
            return title.includes('email') || balloonTitle.includes('email') || balloonTitle.includes('이메일');
        })?.querySelector('.ext-btn');

        if (emailBtn) {
            let badge = emailBtn.querySelector('.dl-count-badge');
            if (count > 0) {
                if (!badge) {
                    badge = document.createElement('span');
                    badge.className = 'dl-count-badge';
                    badge.style.background = '#ff2a5f'; // 이메일은 핑크/레드 계열로 강조
                    emailBtn.style.position = 'relative';
                    emailBtn.appendChild(badge);
                }
                badge.textContent = count > 999 ? '999+' : String(count);
                badge.style.display = 'flex';
            } else if (badge) {
                badge.style.display = 'none';
            }
        }
    }
});

// ── [VPN] VPN 상태 변경 이벤트 → extensionWebview 전달 ──────────────────────
window.electronAPI.on('xpider-vpn-state', (state) => {
    if (extensionWebview && extensionWebview.src) {
        extensionWebview.executeJavaScript(
            `window.postMessage(${JSON.stringify({ type: 'XPIDER_EVENT', name: 'vpn-state', data: state })}, '*')`
        ).catch(() => {});
    }
    // VPN 연결 상태를 사이드바 배지로 표시
    const vpnItem = [...document.querySelectorAll('.ext-item')].find(item => {
        const t = item.querySelector('.preview-title');
        return t && (t.textContent.toLowerCase().includes('vpn') || t.textContent.toLowerCase().includes('proxy'));
    });
    const vpnBtn = vpnItem ? vpnItem.querySelector('.ext-btn') : null;
    if (vpnBtn) {
        let badge = vpnBtn.querySelector('.dl-count-badge');
        if (state && state.connected) {
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'dl-count-badge';
                vpnBtn.style.position = 'relative';
                vpnBtn.appendChild(badge);
            }
            badge.textContent = '●';
            badge.style.background = '#00e676';
            badge.style.display = 'flex';
        } else if (badge) {
            badge.style.display = 'none';
        }
    }
});

// ── [v4.1] Email Extractor 배지 강제 동기화 (10초 주기) ─────────────────────
setInterval(() => {
    window.electronAPI.invoke('xpider-email-get-all', {}).then(res => {
        if (res && typeof res.count === 'number') {
            window.electronAPI.on('xpider-email-collected-event', { 
                name: 'update-badge', 
                data: { count: res.count } 
            });
        }
    }).catch(() => {});
}, 10000);
function updateDownloadBadge() {
    const btn = document.getElementById('downloads-btn');
    if (!btn) return;
    let badge = btn.querySelector('.dl-count-badge');
    const count = activeDownloads.size;
    if (count > 0) {
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'dl-count-badge';
            btn.style.position = 'relative';
            btn.appendChild(badge);
        }
        badge.textContent = count;
        badge.style.display = 'block';
    } else {
        if (badge) badge.style.display = 'none';
    }
}

function updateActiveDownloadUI(downloadId) {
    const dl = activeDownloads.get(downloadId);
    const el = document.getElementById(`dl-active-${downloadId}`);
    if (!dl || !el) return;
    const bar   = el.querySelector('.dl-bar-fill');
    const pct   = el.querySelector('.dl-pct-text');
    const info  = el.querySelector('.dl-byte-info');
    const prog  = dl.progress >= 0 ? dl.progress : 0;
    if (bar) bar.style.width = `${prog}%`;
    if (pct) pct.textContent = dl.progress >= 0 ? `${prog}%` : '다운로드 중...';
    if (info && dl.receivedBytes != null) {
        const fmt = b => b >= 1048576 ? (b/1048576).toFixed(1)+'MB' : b >= 1024 ? (b/1024).toFixed(0)+'KB' : b+'B';
        info.textContent = dl.totalBytes > 0 ? `${fmt(dl.receivedBytes)} / ${fmt(dl.totalBytes)}` : fmt(dl.receivedBytes);
    }
}

window.electronAPI.on('xpider-download-start', (data) => {
    activeDownloads.set(data.downloadId, { ...data, progress: 0, status: 'downloading' });
    overlayPanel.classList.remove('hidden');
    settingsMenu.classList.add('hidden');
    renderOverlayPanel('downloads');
    updateDownloadBadge();
});

window.electronAPI.on('xpider-download-progress', (data) => {
    if (!activeDownloads.has(data.downloadId)) return;
    const dl = activeDownloads.get(data.downloadId);
    dl.progress = data.progress;
    dl.receivedBytes = data.receivedBytes;
    dl.totalBytes = data.totalBytes;
    activeDownloads.set(data.downloadId, dl);
    if (!overlayPanel.classList.contains('hidden') && currentPanelTab === 'downloads') {
        updateActiveDownloadUI(data.downloadId);
    }
});

window.electronAPI.on('xpider-download-error', (data) => {
    if (activeDownloads.has(data.downloadId)) {
        const dl = activeDownloads.get(data.downloadId);
        dl.status = 'error';
        dl.error = data.error || '오류가 발생했습니다.';
        activeDownloads.set(data.downloadId, dl);
        renderOverlayPanel('downloads');
        setTimeout(() => { activeDownloads.delete(data.downloadId); updateDownloadBadge(); renderOverlayPanel('downloads'); }, 5000);
    }
});

window.electronAPI.on('xpider-record-download', (data) => {
    console.log('[RENDERER] 다운로드 완료:', data);
    activeDownloads.delete(data.downloadId);
    downloads.unshift({
        id: data.downloadId || Date.now(),
        filename: data.filename,
        path: data.path || data.url,
        time: data.timestamp || new Date().toISOString(),
        size: data.size || 0,
        status: 'completed'
    });
    if (downloads.length > 50) downloads = downloads.slice(0, 50);
    localStorage.setItem('xpider-downloads', JSON.stringify(downloads));
    overlayPanel.classList.remove('hidden');
    settingsMenu.classList.add('hidden');
    renderOverlayPanel('downloads');
    updateDownloadBadge();
});




// ─── AutoCruiser Hardware Engine (Direct Move Version) ─────────────────
let cruiserActive = false;
let cruiserInterval = null; // 명시적 선언 (ReferenceError 방지)
let cruiserDirection = 1;
let cruiserStepPx = 0;
let pixelsPerMile = 0;

function startHardwareCruiser(config = {}) {
    cruiserActive = true;
    const wv = getActiveWebview();
    if (!wv) return;

    const url = wv.getURL();
    const zoomMatch = url.match(/@.*,([0-9.]+)z/);
    const latMatch = url.match(/@(-?[0-9.]+),/);
    const zoom = zoomMatch ? parseFloat(zoomMatch[1]) : 15;
    const lat = latMatch ? parseFloat(latMatch[1]) : 37.0;
    
    const degreesPerMileX = 1 / (Math.cos(lat * Math.PI / 180) * 69.17);
    pixelsPerMile = (Math.pow(2, zoom) * 256) / (360 * degreesPerMileX);
    
    cruiserStepPx = (config.stepSize || 9.0) * pixelsPerMile;
    cruiserDirection = 1;

    console.log(`[CRUISER] Hardware engine ready. StepPx=${Math.round(cruiserStepPx)}`);
}

async function performHardwareMove(direction = 'HORIZONTAL') {
    if (!cruiserActive) return;
    const wv = getActiveWebview();
    if (!wv) return;

    // 물리적 이동 거리는 한 화면(약 400~500px)을 넘지 않도록 제한
    // (너무 크게 점프하면 지도가 튀거나 타일 로딩이 안 됨)
    const physicalStep = Math.min(cruiserStepPx, 400);

    if (direction === 'HORIZONTAL') {
        const dx = cruiserDirection * physicalStep;
        await simulateHardwareDrag(wv, dx, 0);
    } else if (direction === 'SOUTH') {
        await simulateHardwareDrag(wv, 0, physicalStep);
    } else if (direction === 'REVERSE') {
        cruiserDirection *= -1;
        await simulateHardwareDrag(wv, 0, physicalStep);
    }
}

function stopHardwareCruiser() {
    cruiserActive = false;
    if (cruiserInterval) clearInterval(cruiserInterval);
    cruiserInterval = null;
    stopBingMapsDragPolling();
    console.log('[CRUISER] Stopped.');
}

// ── Bing Maps 드래그 큐 폴링 엔진 ─────────────────────────────────────────
// content.js MapCruiser가 window.__xpiderQueue에 넣은 드래그 명령을
// renderer가 직접 executeJavaScript로 꺼내어 simulateHardwareDrag 실행.
// sendMessageSafe → window.postMessage는 webview 내부에만 전파되므로
// renderer_ui.js는 직접 받을 수 없음 → 폴링이 유일한 해결책.
let _bingDragPollInterval = null;
let _bingDragBusy = false; // 드래그 중 재진입 방지

function startBingMapsDragPolling() {
    if (_bingDragPollInterval) return;
    console.log('[CRUISER] 🚀 Starting Bing Maps drag queue poller...');
    _bingDragPollInterval = setInterval(async () => {
        if (_bingDragBusy) return;
        const wv = getActiveWebview();
        if (!wv) return;
        let url = '';
        try { url = wv.getURL(); } catch(e) { return; }
        if (!url.includes('bing.com')) return;

        let rawMsg = null;
        try {
            rawMsg = await wv.executeJavaScript(`
(function() {
    if (!window.__xpiderQueue || window.__xpiderQueue.length === 0) return null;
    // performHardwareMove / reverseAndMoveSouth 만 추출 (가장 최신 것)
    let lastMove = null;
    window.__xpiderQueue = window.__xpiderQueue.filter(msg => {
        if (msg.action === 'performHardwareMove' || msg.action === 'reverseAndMoveSouth') {
            lastMove = msg; // 덮어써서 최신만 유지
            return false;   // 큐에서 제거
        }
        return true;
    });
    return lastMove ? JSON.stringify(lastMove) : null;
})()
            `);
        } catch(e) { return; }

        if (!rawMsg) return;
        let msg;
        try { msg = JSON.parse(rawMsg); } catch(e) { return; }

        _bingDragBusy = true;
        try {
            if (msg.action === 'performHardwareMove') {
                if (typeof msg.cruiserDir === 'number') {
                    cruiserDirection = msg.cruiserDir;
                    console.log(`[CRUISER] 📌 Dir synced: ${cruiserDirection > 0 ? 'EAST' : 'WEST'}`);
                }
                if (!cruiserActive) {
                    console.log('[CRUISER] 🔌 Auto-activating engine for Bing drag...');
                    startHardwareCruiser({ stepSize: 9.0 });
                }
                console.log(`[CRUISER] 🚗 Executing drag: ${msg.direction || 'HORIZONTAL'}`);
                await performHardwareMove(msg.direction || 'HORIZONTAL');

            } else if (msg.action === 'reverseAndMoveSouth') {
                if (typeof msg.newDirection === 'number') {
                    cruiserDirection = msg.newDirection;
                } else {
                    cruiserDirection *= -1;
                }
                if (!cruiserActive) {
                    startHardwareCruiser({ stepSize: 9.0 });
                }
                console.log(`[CRUISER] 🔄 Reverse+South: dir=${cruiserDirection > 0 ? 'EAST' : 'WEST'}`);
                await performHardwareMove('SOUTH');
            }

            // ★ 드래그 후 Bing 스크래퍼 강제 실행 (3초 후)
            setTimeout(async () => {
                try {
                    await wv.executeJavaScript(
                        'if (window.scraper && window.scraper.active) { window.scraper.scrapeVisibleCards(); window.scraper.scrapeEntityPanel(); }'
                    );
                } catch(e) {}
            }, 2500);

        } catch(e) {
            console.warn('[CRUISER] Drag exec error:', e.message);
        } finally {
            _bingDragBusy = false;
        }
    }, 400); // 400ms 폴링 — MapCruiser의 sleep(2500ms)보다 충분히 빠름
}

function stopBingMapsDragPolling() {
    if (_bingDragPollInterval) {
        clearInterval(_bingDragPollInterval);
        _bingDragPollInterval = null;
        console.log('[CRUISER] Bing drag poller stopped.');
    }
}

// ── 구글맵 검색결과 패널 직접 스크롤 (executeJavaScript 백업 엔진) ──────

// content.js의 스크롤이 격리 환경에서 실패하는 경우를 대비한 2차 방어선
async function forceScrollGmapsResults(wv) {
    if (!wv || !wv.getURL().includes('google.com/maps')) return;
    const scrollScript = `
(function() {
  // 1. 구글맵 검색결과 패널의 스크롤 컨테이너를 탐색
  function findScrollContainer() {
    // 1. role="feed" (가장 표준적인 결과 목록 영역)
    const feed = document.querySelector('div[role="feed"]');
    if (feed && feed.scrollHeight > feed.clientHeight) return feed;

    // 2. 검색결과 카드들의 공통 부모를 역추적
    const card = document.querySelector('div[role="article"], .Nv2Ybe, .THS69c, .Ua67Yy');
    if (card) {
      let el = card.parentElement;
      for (let i = 0; i < 15 && el && el !== document.body; i++) {
        const st = window.getComputedStyle(el);
        if ((st.overflowY === 'auto' || st.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 20) {
          return el;
        }
        el = el.parentElement;
      }
    }
    // 3. 알려진 스크롤 컨테이너 클래스
    const known = document.querySelector('.m6QErb.DxyBCb.klm67c, .m6QErb[tabindex="-1"]');
    if (known && known.scrollHeight > known.clientHeight) return known;
    
    return null;
  }

  const container = findScrollContainer();
  if (!container) { console.warn('[XPIDER-SCROLL] ❌ No scroll container found'); return 'NOT_FOUND'; }

  console.log('[XPIDER-SCROLL] ✅ Container:', container.className.substring(0,50), 'scrollH=', container.scrollHeight);
  container.focus();

  let round = 0;
  const tick = setInterval(() => {
    round++;
    // 차례대로 부드럽게 스크롤 (화면 단위)
    const step = Math.max(container.clientHeight * 0.8, 600);
    container.dispatchEvent(new WheelEvent('wheel', { deltaY: step, bubbles: true, cancelable: true }));
    container.scrollBy({ top: step, behavior: 'smooth' });
    container.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', keyCode: 40, bubbles: true }));

    // 종료 마커 체크
    const txt = (container.innerText || '').toLowerCase();
    const done = ['마지막 항목', '결과가 더 없', 'end of results', 'reached the end', 'no more results'].some(m => txt.includes(m));
    const atBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 20;

    console.log('[XPIDER-SCROLL] Round', round, '| scrollTop=', container.scrollTop, '/', container.scrollHeight, '| done=', done);

    if (done || round >= 80) {
      clearInterval(tick);
      console.log('[XPIDER-SCROLL] ✅ Scroll complete at round', round);
    }
  }, 800);

  return 'STARTED';
})();
`;
    try {
        const result = await wv.executeJavaScript(scrollScript);
        console.log('[CRUISER] forceScrollGmapsResults result:', result);
    } catch(e) {
        console.warn('[CRUISER] forceScrollGmapsResults failed:', e.message);
    }
}

async function simulateHardwareDrag(wv, dx, dy) {
    if (!wv) return;
    
    // sendInputEvent는 웹븷 내부 좌표계 사용 (offsetWidth/Height 기준)
    const w = wv.offsetWidth  || wv.clientWidth  || 900;
    const h = wv.offsetHeight || wv.clientHeight || 700;
    if (w <= 0 || h <= 0) {
        console.warn('[CRUISER] Webview size 0. Drag aborted.');
        return;
    }

    // 검색결과 패널(좌측)을 완벽히 피하기 위해 시작 좌표를 우측 하단(65%, 60%)으로 설정합니다.
    const startX = Math.round(w * 0.65);
    const startY = Math.round(h * 0.60);

    // 드래그 거리를 줄여 창 밖으로 나가거나 패널로 들어가는 것을 방지합니다.
    const maxMoveX = w * 0.25;
    const maxMoveY = h * 0.25;
    const actualDx = Math.max(-maxMoveX, Math.min(maxMoveX, dx));
    const actualDy = Math.max(-maxMoveY, Math.min(maxMoveY, dy));
    
    // 지도 이동 방향: dx > 0 이면 동쪽 이동 → 실제 드래그 방향은 반대
    const endX = Math.round(startX - actualDx);
    const endY = Math.round(startY - actualDy);

    console.log(`[CRUISER] Physical Drag: (${startX},${startY}) -> (${endX},${endY}) | TargetDist: (${dx.toFixed(1)},${dy.toFixed(1)}) | WV: ${w}x${h}`);

    // 웹븷 포커스
    try { wv.focus(); } catch(e) {}

    const steps = 20;
    
    // [FIX] Ensure the mouse is logically inside the map before clicking to prevent stuttering
    // mouseEnter는 일부 환경에서 이벤트를 끊을 수 있으므로 mouseMove만 사용
    wv.sendInputEvent({ type: 'mouseMove', x: startX, y: startY });
    await new Promise(r => setTimeout(r, 100));

    // 1. Mouse Down
    wv.sendInputEvent({ type: 'mouseDown', x: startX, y: startY, button: 'left', clickCount: 1 });
    await new Promise(r => setTimeout(r, 200));

    // 2. Mouse Move (단계별 이동, modifier = 'leftButton')
    for (let i = 1; i <= steps; i++) {
        const curX = Math.round(startX + (endX - startX) * (i / steps));
        const curY = Math.round(startY + (endY - startY) * (i / steps));
        wv.sendInputEvent({ type: 'mouseMove', x: curX, y: curY, modifiers: ['leftButtonDown'] });
        await new Promise(r => setTimeout(r, 12));
    }

    await new Promise(r => setTimeout(r, 80));

    // 3. Mouse Up
    wv.sendInputEvent({ type: 'mouseUp', x: endX, y: endY, button: 'left', clickCount: 1 });
    
    // 지도 타일 로딩 대기
    await new Promise(r => setTimeout(r, 500));
}

// ─── 핫 업데이트 진행률 패널 요소 ───────────────────────────
const hotUpdatePanel = document.getElementById('hot-update-panel');
const huMsg          = document.getElementById('hu-msg');
const huBar          = document.getElementById('hu-bar');
const huPct          = document.getElementById('hu-pct');
const huCloseBtn     = document.getElementById('hu-close-btn');

function showHotUpdatePanel(phase, pct, msg) {
    if (!hotUpdatePanel) return;
    hotUpdatePanel.classList.remove('hidden', 'hu-done', 'hu-error');
    const titleEl = hotUpdatePanel.querySelector('.hu-title');
    if (phase === 'done' || (phase === 'extract' && pct >= 100)) {
        hotUpdatePanel.classList.add('hu-done');
        if (titleEl) titleEl.textContent = '✅ 업데이트 완료';
    } else if (phase === 'error') {
        hotUpdatePanel.classList.add('hu-error');
        if (titleEl) titleEl.textContent = '❌ 업데이트 실패';
    } else {
        if (titleEl) titleEl.textContent = '⚡ 업데이트 다운로드 중';
    }
    if (huMsg) huMsg.textContent = msg || '';
    if (huBar) huBar.style.width = `${Math.max(0, Math.min(100, pct || 0))}%`;
    if (huPct) huPct.textContent = `${Math.round(pct || 0)}%`;
}

if (huCloseBtn) {
    huCloseBtn.onclick = () => { if (hotUpdatePanel) hotUpdatePanel.classList.add('hidden'); };
}

// 핫 업데이트 실시간 진행률 수신
window.electronAPI.on('hot-update-progress', ({ phase, pct, msg }) => {
    showHotUpdatePanel(phase, pct, msg);
    if (phase === 'done' || phase === 'error') {
        const btn = document.getElementById('modal-hot-update-btn');
        if (btn) { btn.disabled = false; btn.textContent = '⚡ 지금 업데이트 (재시작 필요)'; }
    }
});

// ─── Update Check Result Handler ──────────────────────────────────
window.electronAPI.on('app-update-result', (result) => {
    if (!result) return;

    if (result.hasUpdate) {
        // 수동 확인(isManual)이면 skip 기록 무시 → 항상 모달 표시
        // 자동 확인이면 이전에 "나중에" 누른 버전은 건너뜀
        if (!result.isManual) {
            const skippedVersion = localStorage.getItem('xpider-skip-version');
            if (skippedVersion === result.latestVersion) {
                console.log('[Update] Auto-check: Skipping previously dismissed version:', result.latestVersion);
                return; // 자동 확인 시에만 스킵
            }
        }

        // 수동 확인 시 이전 skip 기록 초기화 (다음 자동 확인에서도 다시 표시)
        if (result.isManual) {
            localStorage.removeItem('xpider-skip-version');
        }

        if (modalCurrentVer) modalCurrentVer.textContent = result.currentVersion || '';
        if (modalLatestVer)  modalLatestVer.textContent  = result.latestVersion  || '';
        if (modalNotes) {
            const notes = (result.releaseNotes || '').trim().substring(0, 300);
            modalNotes.textContent = notes || 'A new version has been released.';
        }
        _releaseUrl = result.downloadUrl || result.releaseUrl || '';
        updateModal.classList.remove('hidden');
    } else {
        // 에러가 있으면 에러 토스트
        if (result.error) {
            if (result.isManual) showToast(`❌ 업데이트 확인 실패: ${result.error}`);
            return;
        }
        // 수동 확인일 때만 "최신 버전" 토스트 표시 (자동 확인 시에는 조용히 종료)
        if (result.isManual) {
            const cur = result.currentVersion || '';
            const lat = result.latestVersion  || cur;
            showToast(`✅ 최신 버전입니다. (현재: v${cur} / GitHub: v${lat})`, 5000);
        }
    }
});

// ─── Update Modal Buttons ───────────────────────────────────────────

// ① 릴리즈 페이지 열기
modalUpdateBtn.onclick = () => {
    window.electronAPI.send('open-release-url', _releaseUrl);
    updateModal.classList.add('hidden');
};

// ② 나중에 (스킵)
modalSkipBtn.onclick = () => {
    const latestVer = modalLatestVer ? modalLatestVer.textContent : '';
    if (latestVer) localStorage.setItem('xpider-skip-version', latestVer);
    updateModal.classList.add('hidden');
};

updateModal.onclick = (e) => { if (e.target === updateModal) updateModal.classList.add('hidden'); };

// ③ 핫 업데이트 — 백그라운드에서 다운로드 후 재시작
const modalHotUpdateBtn = document.getElementById('modal-hot-update-btn');
if (modalHotUpdateBtn) {
    modalHotUpdateBtn.onclick = async () => {
        if (!_releaseUrl) { showToast('❌ 다운로드 URL을 찾을 수 없습니다.'); return; }
        updateModal.classList.add('hidden');
        modalHotUpdateBtn.disabled = true;
        modalHotUpdateBtn.textContent = '⏳ 업데이트 중...';
        showHotUpdatePanel('download', 0, '⬇️ 다운로드 준비 중...');
        const result = await window.electronAPI.invoke('hot-update-start', { downloadUrl: _releaseUrl, dryRun: false });
        if (result && !result.ok) {
            showToast(`❌ 업데이트 실패: ${result.error || '알 수 없는 오류'}`);
            modalHotUpdateBtn.disabled = false;
            modalHotUpdateBtn.textContent = '⚡ 지금 업데이트 (재시작 필요)';
        }
    };
}

// ④ 더미 테스트 — 실제 다운로드 없이 UI만 테스트
const modalTestUpdateBtn = document.getElementById('modal-test-update-btn');
if (modalTestUpdateBtn) {
    modalTestUpdateBtn.onclick = async () => {
        updateModal.classList.add('hidden');
        showHotUpdatePanel('download', 0, '🧪 더미 테스트 시작...');
        showToast('🧪 더미 업데이트 테스트 시작!', 2000);
        const result = await window.electronAPI.invoke('hot-update-start', { downloadUrl: '', dryRun: true });
        if (result && result.dryRun) {
            showToast('✅ 더미 테스트 완료! 실제 업데이트 UI가 이렇게 동작합니다.', 4000);
        }
    };
}

// ─── Check for Updates 버튼 ───────────────────────────────────
document.getElementById('check-update-btn').onclick = () => {
    settingsMenu.classList.add('hidden');
    showToast('🔍 최신 버전을 확인 중입니다...', 4000);
    window.electronAPI.send('check-for-updates');
};

// ─── 토스트 유틸 ──────────────────────────────────────────────
function showToast(msg, duration = 3000) {
    toastMsg.textContent = msg;
    updateToast.classList.remove('hidden');
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => updateToast.classList.add('hidden'), duration);
}

// Listener for extension-triggered tab updates
window.electronAPI.on('xpider-renderer-update-badge', (data) => {
    const { count, extId } = data;
    // Find the button associated with this extId
    // We need to store extId in the button or look it up
    const buttons = document.querySelectorAll('.ext-btn');
    buttons.forEach(btn => {
        if (btn.getAttribute('data-ext-id') === extId) {
            let badge = btn.querySelector('.ext-badge');
            if (!badge) {
                badge = document.createElement('div');
                badge.className = 'ext-badge';
                btn.appendChild(badge);
            }
            badge.textContent = count > 0 ? count : '';
            badge.style.display = count > 0 ? 'flex' : 'none';
        }
    });
});

window.electronAPI.on('ext-sync-progress', (msg) => {
    showToast('📦 ' + msg, 4000);
});

// Listener for extension-triggered tab updates
window.electronAPI.on('xpider-renderer-update-active-tab', (props) => {
    const wv = getActiveWebview();
    if (wv && props.url) {
        wv.loadURL(props.url).catch(e => {
            // ignore ERR_ABORTED from overlapping loadURL calls
            if (e.code !== 'ERR_ABORTED') console.error('loadURL Error:', e);
        });
        addressBar.value = props.url;
    }
});

// ── XPIDER_CONTENT_RELAY: content.js → renderer (sendMessage 릴레이 & 크루저 신호) ──
window.electronAPI.on('xpider-ext-runtime-on-message', async (message) => {
    if (!message) return;

    // ── 모든 수신된 런타임 메시지를 extensionWebview(sidepanel 팝업)로 무조건 실시간 중계 ──
    if (extensionWebview && extensionWebview.src) {
        extensionWebview.executeJavaScript(
            `window.postMessage({ type: 'XPIDER_EVENT', name: 'runtime-on-message', data: ${JSON.stringify(message)} }, '*')`
        ).catch(() => {});
    }

    if (!message.action) return;
    console.log('[XPIDER-RUNTIME-MSG] Received:', message.action);

    if (message.action === 'OPEN_XPIDER_VPN') {
        const extBtns = document.querySelectorAll('.ext-btn');
        let vpnBtn = null;
        const vpnKeywords = ['vpn', 'proxy', 'xpider vpn', 'xpidervpn'];
        for (const btn of extBtns) {
            const titleLower = (btn.title || '').toLowerCase();
            const textLower  = (btn.textContent || '').toLowerCase();
            const dataName   = (btn.getAttribute('data-ext-name') || '').toLowerCase();
            if (vpnKeywords.some(kw => titleLower.includes(kw) || textLower.includes(kw) || dataName.includes(kw))) {
                vpnBtn = btn;
                break;
            }
        }
        if (vpnBtn) {
            // Always click to open/focus the VPN extension panel
            vpnBtn.click();
        }
        return;
    }

    if (message.action === 'startHardwareCruiser' || message.action === 'startCruiser') {
        console.log('[CRUISER] ▶ Starting hardware cruiser via runtime message', message.config);
        startHardwareCruiser(message.config || {});
        // ★ Bing Maps 드래그 큐 폴링 엔진 시작 (content.js MapCruiser 드래그 명령 수신용)
        startBingMapsDragPolling();
        // ★ Bing Maps webview에서 scraper.start() 실행 — 비즈니스 수집 보장
        setTimeout(async () => {
            const wv = getActiveWebview();
            if (!wv) return;
            try {
                const url = wv.getURL();
                if (url.includes('bing.com')) {
                    await wv.executeJavaScript(
                        'if (window.scraper && !window.scraper.active) { window.scraper.start(); console.log("[XPIDER] Scraper auto-started by cruiser."); }'
                    );
                }
            } catch(e) { console.warn('[CRUISER] Scraper auto-start failed:', e.message); }
        }, 1000);
    }
    if (message.action === 'stopHardwareCruiser') {
        console.log('[CRUISER] ⏹ Stopping hardware cruiser via runtime message');
        stopHardwareCruiser();
    }
    if (message.action === 'performHardwareMove') {
        // ★ [핵심] content.js의 실제 direction값을 메시지에서 직접 동기화
        if (typeof message.cruiserDir === 'number') {
            cruiserDirection = message.cruiserDir;  // +1(EAST) 또는 -1(WEST)
            console.log(`[CRUISER] 📌 cruiserDirection synced from content.js: ${cruiserDirection > 0 ? 'EAST(+1)' : 'WEST(-1)'}`);
        }
        // ★ [드래그 수정] content.js MapCruiser가 보낸 요청 — cruiserActive 강제 활성화
        if (!cruiserActive) {
            console.log('[CRUISER] 🚀 Auto-activating hardware engine for Bing Maps MapCruiser request...');
            startHardwareCruiser({ stepSize: 9.0 });
        }
        await performHardwareMove(message.direction || 'HORIZONTAL');
        const wv = getActiveWebview();
        if (!wv) return;
        const wvUrl = (() => { try { return wv.getURL(); } catch(e) { return ''; } })();

        // ── Bing Maps 후처리: 드래그 후 스크래퍼 강제 실행 ────────────────
        if (wvUrl.includes('bing.com')) {
            setTimeout(async () => {
                try {
                    await wv.executeJavaScript(
                        'if (window.scraper && window.scraper.active) { window.scraper.scrapeVisibleCards(); window.scraper.scrapeEntityPanel(); }'
                    );
                } catch(e) {}
            }, 3000);
        }

        // ── Google Maps 후처리 ─────────────────────────────────────
        if (wvUrl.includes('google.com/maps')) {
            // 1) '이 지역 검색' 버튼 자동 클릭 (2.5초 후)
            setTimeout(async () => {
                try {
                    await wv.executeJavaScript(`
(function() {
  const SELS = ['button.NlVald','button.X69Czc','button[jsaction*="searchThisArea"]','button[aria-label*="Search this area"]','button[aria-label*="\uc774 \uc9c0\uc5ed \uac80\uc0c9"]'];
  for (const s of SELS) {
    const el = document.querySelector(s);
    if (el && (el.offsetParent !== null || el.offsetWidth > 0)) {
      ['mousedown','mouseup','click'].forEach(t => el.dispatchEvent(new MouseEvent(t,{bubbles:true})));
      return 'CLICKED:'+s;
    }
  }
  return 'NOT_FOUND';
})();
                    `);
                } catch(e) { console.warn('[CRUISER] search-click failed:', e.message); }
            }, 2500);
            // 2) 검색 결과 로딩 후 스크롤 (5초 후)
            setTimeout(async () => { await forceScrollGmapsResults(wv); }, 5000);
        }
    }

    if (message.action === 'skipHardwareCruiserLine') {
        // \ub808\uac70\uc2dc \ud638\ud658\uc131 \uc720\uc9c0 (\ub2e8\uc21c \ub0a8\ucabd \uc774\ub3d9)
        console.log('[CRUISER] \u23ed\ufe0f Skip signal received. Moving SOUTH...');
        await performHardwareMove('SOUTH');
    }
    if (message.action === 'reverseAndMoveSouth') {
        // ★ [핵심] content.js가 이미 this.direction을 반전한 후 전송 → 직접 적용
        if (typeof message.newDirection === 'number') {
            cruiserDirection = message.newDirection;  // 반전된 값 직접 적용
        } else {
            cruiserDirection *= -1;  // fallback
        }
        // cruiserActive 강제 활성화 (content.js MapCruiser 요청 대응)
        if (!cruiserActive) {
            console.log('[CRUISER] Activating hardware engine for reverseAndMoveSouth request...');
            startHardwareCruiser({ stepSize: 9.0 });
        }
        const dirLabel = cruiserDirection > 0 ? 'EAST' : 'WEST';
        console.log(`[CRUISER] 🔄 Direction set to ${dirLabel}(${cruiserDirection}). Moving SOUTH...`);
        await performHardwareMove('SOUTH');
    }
    // ③ 실시간 cruiserUpdate → extension webview(sidepanel)로 중계
    if (message.action === 'cruiserUpdate') {
        if (extensionWebview && extensionWebview.src) {
            extensionWebview.executeJavaScript(
                `window.postMessage({ type: 'XPIDER_EVENT', name: 'runtime-on-message', data: ${JSON.stringify(message)} }, '*')`
            ).catch(() => {});
        }
    }
    // ⑤ cruiser-stopped → sidepanel로 상태 중지 알림
    if (message.action === 'cruiserStopped' || message.action === 'cruiser-stopped') {
        if (extensionWebview && extensionWebview.src) {
            extensionWebview.executeJavaScript(
                `window.postMessage({ type: 'XPIDER_EVENT', name: 'cruiser-stopped', data: {} }, '*')`
            ).catch(() => {});
        }
    }
    // storage-changed 이벤트: foundBusiness 저장 후 sidepanel 실시간 업데이트
    if (message.action === 'foundBusiness' && message.data) {
        // relay to storage then notify sidepanel
        try {
            await window.electronAPI.relayContentMessage({ message });
        } catch(e) {}
    }
});

// ── XPIDER_CONTENT_RELAY (레거시 호환 - foundBusiness 전용) ──
window.addEventListener('message', async (event) => {
    if (!event.data || event.data.type !== 'XPIDER_CONTENT_RELAY') return;
    const { message, extId } = event.data;
    console.log('[XPIDER-RELAY] Received from content script:', message.action, extId);
    
    if (message.action === 'foundBusiness' && message.data) {
        try {
            await window.electronAPI.relayContentMessage({ message });
        } catch(e) {
            console.error('[XPIDER-RELAY] Failed to relay:', e);
        }
    }
});

// ─── 온보딩 ───────────────────────────────────────────────────
const langSetupOverlay = document.getElementById('lang-setup-overlay');
const langSaveBtn      = document.getElementById('lang-save-btn');
const langDontShow     = document.getElementById('lang-dont-show');
const langBtns         = document.querySelectorAll('.lang-btn');
const onboardingOverlay = document.getElementById('onboarding-overlay');
const obCloseBtn = document.getElementById('ob-close-btn');
const obDontShow = document.getElementById('ob-dont-show');

function startLangSetup() {
    if (localStorage.getItem('skip-lang-setup') === 'true') return true;
    if (langSetupOverlay) {
        langSetupOverlay.classList.remove('hidden');
        langSetupOverlay.classList.add('active');
        return false;
    }
    return true;
}

// 언어 선택 버튼 로직
langBtns.forEach(btn => {
    btn.onclick = () => {
        langBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentLang = btn.getAttribute('data-lang');
        applyLanguage(currentLang);
    };
});

langSaveBtn.onclick = () => {
    localStorage.setItem('app-lang', currentLang);
    if (langDontShow && langDontShow.checked) localStorage.setItem('skip-lang-setup', 'true');
    langSetupOverlay.classList.remove('active');
    langSetupOverlay.classList.add('hidden');
    startOnboarding();
};

function startOnboarding() {
    if (localStorage.getItem('skip-onboarding') === 'true') return;
    if (onboardingOverlay) {
        onboardingOverlay.classList.remove('hidden');
        onboardingOverlay.classList.add('active');

        // [v4.1] Floating Scroll Indicator Logic
        const grid = document.querySelector('.ob-ext-grid');
        const indicator = document.getElementById('ob-scroll-indicator');
        if (grid && indicator) {
            // Initial state
            indicator.style.opacity = '1';
            
            grid.onscroll = () => {
                if (grid.scrollTop > 50) {
                    indicator.style.opacity = '0';
                    indicator.style.pointerEvents = 'none';
                } else {
                    indicator.style.opacity = '1';
                    indicator.style.pointerEvents = 'all';
                }
            };

            // [v4.2] Click to scroll to bottom
            indicator.onclick = () => {
                grid.scrollTo({
                    top: grid.scrollHeight,
                    behavior: 'smooth'
                });
            };
        }
    }
}

obCloseBtn.onclick = () => {
    onboardingOverlay.classList.remove('active');
    onboardingOverlay.classList.add('hidden');
    if (obDontShow && obDontShow.checked) localStorage.setItem('skip-onboarding', 'true');
};

onboardingOverlay.addEventListener('click', (e) => {
    if (e.target === onboardingOverlay) {
        onboardingOverlay.classList.remove('active');
        onboardingOverlay.classList.add('hidden');
        if (obDontShow && obDontShow.checked) localStorage.setItem('skip-onboarding', 'true');
    }
});

// ─── 히스토리 / 북마크 ────────────────────────────────────────
function addHistory(url, title) {
    if (!url || url === 'about:blank' || url.includes('start_page.html')) return;
    history = history.filter(item => item.url !== url);
    history.unshift({ url, title: title || url, time: Date.now() });
    if (history.length > 100) history.pop();
    localStorage.setItem('xpider-history', JSON.stringify(history));
}

function toggleBookmark() {
    const wv = getActiveWebview();
    if (!wv) return;
    const url = wv.getURL();
    const title = wv.getTitle();
    const index = bookmarks.findIndex(b => b.url === url);
    if (index > -1) bookmarks.splice(index, 1);
    else bookmarks.unshift({ url, title: title || url });
    localStorage.setItem('xpider-bookmarks', JSON.stringify(bookmarks));
    updateBookmarkIcon();
    if (!overlayPanel.classList.contains('hidden') && currentPanelTab === 'bookmarks') renderOverlayPanel('bookmarks');
}

function updateBookmarkIcon() {
    const wv = getActiveWebview();
    const url = wv ? wv.getURL() : '';
    const isBookmarked = bookmarks.some(b => b.url === url);
    bookmarkBtn.classList.toggle('active', isBookmarked);
    bookmarkBtn.textContent = isBookmarked ? '★' : '☆';
}

// ─── [v4.0] 다운로드 패널 렌더링 (진행중 + 완료 구분) ────────────────────────
function _renderDownloadsPanel() {
    const fmtSize = b => !b ? '' : b >= 1048576 ? (b/1048576).toFixed(1)+'MB' : b >= 1024 ? (b/1024).toFixed(0)+'KB' : b+'B';
    const fmtTime = ts => { const d = ts ? new Date(ts) : null; return d ? d.toLocaleDateString('ko-KR')+' '+d.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'}) : ''; };
    const extIcon = n => { const e=(n||'').split('.').pop().toLowerCase(); return e==='csv'?'📊':e==='json'?'📋':e==='txt'?'📝':e==='xlsx'||e==='xls'?'📈':'📄'; };

    if (activeDownloads.size === 0 && downloads.length === 0) {
        panelList.innerHTML = `<div style="text-align:center;color:var(--text-dim);padding:40px 20px;"><div style="font-size:2.5rem;margin-bottom:12px;">📥</div><div style="font-size:0.95rem;font-weight:500;">다운로드 없음</div><div style="font-size:0.8rem;margin-top:6px;opacity:0.6;">익스텐션에서 CSV/JSON/TXT 내보내기 시 여기에 표시됩니다</div></div>`;
        return;
    }

    // ── 진행 중 ──
    if (activeDownloads.size > 0) {
        const hdr = document.createElement('div');
        hdr.className = 'dl-section-hdr';
        hdr.textContent = '⏳ 다운로드 중';
        panelList.appendChild(hdr);
        activeDownloads.forEach((dl, id) => {
            const div = document.createElement('div');
            div.className = 'panel-item dl-active-item';
            div.id = `dl-active-${id}`;
            const prog = dl.progress >= 0 ? dl.progress : 0;
            const isErr = dl.status === 'error';
            div.innerHTML = `
                <div style="display:flex;align-items:center;gap:10px;width:100%;">
                    <span style="font-size:1.4rem;flex-shrink:0;">${isErr ? '❌' : extIcon(dl.filename)}</span>
                    <div style="flex:1;min-width:0;">
                        <div class="item-title" style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${dl.filename || 'File'}</div>
                        ${isErr
                            ? `<div class="dl-error-msg">${dl.error}</div>`
                            : `<div class="dl-progress-track"><div class="dl-bar-fill" style="width:${prog}%"></div></div>
                               <div style="display:flex;justify-content:space-between;margin-top:4px;font-size:0.72rem;">
                                 <span class="dl-byte-info" style="opacity:0.55;"></span>
                                 <span class="dl-pct-text" style="color:var(--accent);font-weight:700;">${dl.progress>=0?prog+'%':'준비 중...'}</span>
                               </div>`
                        }
                    </div>
                </div>`;
            panelList.appendChild(div);
        });
    }

    // ── 완료된 다운로드 ──
    if (downloads.length > 0) {
        if (activeDownloads.size > 0) {
            const hdr = document.createElement('div');
            hdr.className = 'dl-section-hdr';
            hdr.textContent = '✅ 완료된 다운로드';
            panelList.appendChild(hdr);
        }
        downloads.forEach((item, idx) => {
            const div = document.createElement('div');
            div.className = 'panel-item';
            const size = fmtSize(item.size);
            const icon = extIcon(item.filename);
            const dt = item.time ? new Date(item.time) : null;
            const timeStr = dt ? dt.toLocaleDateString('ko-KR')+' '+dt.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'}) : '';
            div.innerHTML = `
                <div style="display:flex;align-items:center;gap:10px;width:100%;">
                    <span style="font-size:1.6rem;flex-shrink:0;">${icon}</span>
                    <div style="flex:1;min-width:0;">
                        <div class="item-title" style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${item.filename||'File'}</div>
                        <div class="item-url" style="font-size:0.75rem;opacity:0.6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${item.path||''}</div>
                        <div style="display:flex;gap:8px;margin-top:3px;font-size:0.72rem;opacity:0.55;">${size?`<span>💾 ${size}</span>`:''}<span>🕒 ${timeStr}</span></div>
                    </div>
                    <button class="dl-del-btn" data-idx="${idx}" style="flex-shrink:0;background:none;border:none;cursor:pointer;opacity:0.4;font-size:1rem;padding:4px 6px;border-radius:4px;transition:opacity 0.2s;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.4'">✕</button>
                </div>`;
            div.style.cursor = 'pointer';
            div.onclick = e => { if (e.target.classList.contains('dl-del-btn')) return; if (item.path) window.electronAPI.send('open-path', item.path); };
            div.querySelector('.dl-del-btn').onclick = e => { e.stopPropagation(); downloads.splice(idx,1); localStorage.setItem('xpider-downloads',JSON.stringify(downloads)); _renderDownloadsPanel(); };
            panelList.appendChild(div);
        });
    }
}

function renderOverlayPanel(tab) {
    currentPanelTab = tab;
    panelList.innerHTML = '';
    panelTabs.forEach(t => t.classList.toggle('active', t.getAttribute('data-tab') === tab));
    clearHistoryBtn.classList.toggle('hidden', tab !== 'history');

    if (tab === 'downloads') { _renderDownloadsPanel(); return; }

    let items = tab === 'history' ? history : bookmarks;
    if (items.length === 0) {
        panelList.innerHTML = `<div style="text-align:center;color:var(--text-dim);padding:40px 20px;"><div style="font-size:2.5rem;margin-bottom:12px;">${tab==='history'?'🕒':'★'}</div><div style="font-size:0.95rem;font-weight:500;">${tab==='history'?'방문 기록 없음':'즐겨찾기 없음'}</div></div>`;
        return;
    }
    items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'panel-item';
        div.innerHTML = `<div class="item-title">${item.title || item.url}</div><div class="item-url">${item.url}</div>`;
        div.onclick = () => { const wv = getActiveWebview(); if(wv) wv.src = item.url; overlayPanel.classList.add('hidden'); };
        panelList.appendChild(div);
    });
}

bookmarkBtn.onclick = (e) => { e.stopPropagation(); toggleBookmark(); };
historyBtn.onclick  = (e) => {
    e.stopPropagation();
    if (!overlayPanel.classList.contains('hidden') && currentPanelTab === 'history') overlayPanel.classList.add('hidden');
    else { renderOverlayPanel('history'); overlayPanel.classList.remove('hidden'); settingsMenu.classList.add('hidden'); }
};
downloadsBtn.onclick = (e) => {
    e.stopPropagation();
    if (!overlayPanel.classList.contains('hidden') && currentPanelTab === 'downloads') overlayPanel.classList.add('hidden');
    else { renderOverlayPanel('downloads'); overlayPanel.classList.remove('hidden'); settingsMenu.classList.add('hidden'); }
};
panelTabs.forEach(tab => { tab.onclick = () => renderOverlayPanel(tab.getAttribute('data-tab')); });
clearHistoryBtn.onclick = () => {
    const dict = window.translations[currentLang] || window.translations['en'];
    if (confirm(dict.clear_history_confirm || 'Clear all history?')) {
        history = [];
        localStorage.setItem('xpider-history', JSON.stringify(history));
        renderOverlayPanel('history');
    }
};

// ─── 익스텐션 로드 (각자의 아이콘 사용) ──────────────────────
window.electronAPI.on('extensions_loaded', (extensions) => {
    extensionsBar.innerHTML = '';
    extensions.forEach((ext) => {
        const item = document.createElement('div');
        item.className = 'ext-item';

        const btn = document.createElement('button');
        btn.className = 'ext-btn';
        btn.title = ext.name;
        btn.setAttribute('data-ext-id', ext.id);

        // ── 아이콘: Base64 데이터를 우선 사용, 실패 시 chrome-extension URL 사용 ──────
        const iconUrl = ext.iconData || `chrome-extension://${ext.id}/${ext.icon}`;
        const img = new Image();
        img.onload  = () => { btn.style.backgroundImage = `url('${iconUrl}')`; };
        img.onerror = () => { btn.style.backgroundImage = `url('assets/icon.png')`; };
        img.src = iconUrl;

        // ── 띠용! 프리뷰 풍선 (텍스트형 세련된 팝업으로 변경) ────────────────
        const balloon = document.createElement('div');
        balloon.className = 'snapshot-balloon';
        
        const dict = window.translations[currentLang] || window.translations['en'];
        let title = ext.name;
        let desc = "";
        
        if (ext.name.toLowerCase().includes('google maps') || ext.name.toLowerCase().includes('gmaps')) {
            title = "GMaps Business Finder";
            desc = currentLang === 'ko' ? "구글 맵스에서 고품질 비즈니스 DB를 수집하고 이메일 및 연락처를 실시간으로 발굴하는 전문가용 엔진입니다." : "Professional engine for collecting high-quality business DBs from Google Maps and discovering emails and contacts in real-time.";
        } else if (ext.name.toLowerCase().includes('collect')) {
            title = dict.ext_collect_title || ext.name;
            desc = dict.ext_collect_desc || "";
        } else if (ext.name.toLowerCase().includes('autoform') || ext.name.toLowerCase().includes('message')) {
            title = "XPIDER AutoForm Sender Pro";
            desc = currentLang === 'ko' ? "전 세계 웹사이트의 문의 폼을 자동으로 분석하여 홍보 메시지를 정확하게 전달하는 AI 기반 폼 발송 엔진입니다." : "AI-powered form sending engine that automatically analyzes contact forms on websites worldwide and delivers messages accurately.";
        } else if (ext.name.toLowerCase().includes('sendforce') || ext.name.toLowerCase().includes('mailer')) {
            title = "XPIDER SendForce Mailer Pro";
            desc = currentLang === 'ko' ? "수천 건의 이메일을 순식간에 발송하고 캠페인을 관리하는 강력한 다이렉트 메일 마케팅 엔진입니다." : "Powerful direct mail marketing engine for sending thousands of emails instantly and managing campaigns.";
        } else if (ext.name.toLowerCase().includes('send')) {
            title = dict.ext_send_title || ext.name;
            desc = dict.ext_send_desc || "";
        } else if (ext.name.toLowerCase().includes('email')) {
            title = "Email Extractor";
            desc = currentLang === 'ko' ? "현재 활성화된 탭과 방문하는 모든 페이지에서 실시간으로 이메일 주소를 자동 추출하여 리스트를 만듭니다." : "Automatically extracts email addresses in real-time from the active tab and all visited pages to build lists.";
        } else if (ext.name.toLowerCase().includes('vpn') || ext.name.toLowerCase().includes('proxy')) {
            title = "XPIDER VPN";
            desc = currentLang === 'ko' ? "사용자의 IP를 숨기고 전 세계 고속 프록시 서버를 통해 익명으로 안전하게 웹을 탐색할 수 있게 도와줍니다." : "Helps you browse the web anonymously and safely by hiding your IP and using high-speed proxy servers worldwide.";
        } else if (ext.name.toLowerCase().includes('bing')) {
            title = "Bing Maps Business Finder";
            desc = currentLang === 'ko' ? "빙 맵스에서 고품질 비즈니스 DB를 수집하고 이메일 및 연락처를 실시간으로 발굴하는 전문가용 엔진입니다." : "Professional engine for collecting high-quality business DBs from Bing Maps and discovering emails and contacts in real-time.";
        } else if (ext.name.toLowerCase().includes('local business')) {
            title = "Local Business Data Crawler";
            desc = currentLang === 'ko' ? "웹상의 모든 비즈니스 정보를 탐색하고 연락처(이메일, 전화, SNS)를 수집하는 강력한 전문가용 크롤러입니다." : "Powerful professional crawler that explores all business info on the web and collects contacts (email, phone, SNS).";
        }
        
        balloon.innerHTML = `
            <div class="preview-header">
                <div class="preview-title">${title}</div>
                <div class="preview-tag">PRO</div>
            </div>
            <div class="preview-desc">${desc}</div>
            <div class="preview-footer">
                <span>XPIDER Powered Engine</span>
                <span class="pulse-dot"></span>
            </div>
        `;

        btn.onclick = () => {
            if (currentExtensionId === ext.id) {
                sidePanel.classList.toggle('hidden');
            } else {
                currentExtensionId = ext.id;
                ext.uiPage = ext.uiPage || 'popup.html';
                
                // Add console listener only once
                if (!extensionWebview.hasAttribute('data-console-attached')) {
                    extensionWebview.setAttribute('data-console-attached', 'true');
                    extensionWebview.addEventListener('console-message', (e) => {
                        window.electronAPI.send('log-from-renderer', `[EXT-WEBVIEW] ${e.message}`);
                    });
                }
                
                extensionWebview.src = `chrome-extension://${ext.id}/${ext.uiPage}`;
                extensionWebview.addEventListener('did-finish-load', () => {
                    // ① chrome.storage.local에 직접 언어 저장 (xpider_lang + language 둘 다)
                    //    → 익스텐션이 어떤 키로 읽든 영어로 초기화
                    extensionWebview.executeJavaScript(
                        `chrome.storage.local.set({ xpider_lang: '${currentLang}', language: '${currentLang}' });`
                    ).catch(() => {});

                    // ② language-change 이벤트 브로드캐스트 (실시간 UI 반영)
                    extensionWebview.executeJavaScript(
                        `window.postMessage({ type: 'XPIDER_EVENT', name: 'language-change', data: { lang: '${currentLang}' } }, '*')`
                    ).catch(() => {});

                    // 2. [v4.2] 현재 활성 탭 URL + 수집된 이메일을 즉시 팝업에 주입
                    const activeWv = getActiveWebview ? getActiveWebview() : null;
                    const activeUrl = activeWv ? (activeWv.getURL ? activeWv.getURL() : activeWv.src) : '';

                    const injectEmailData = (url) => {
                        if (!url || url.startsWith('chrome-extension://') || url.startsWith('about:') || url.includes('start_page.html')) return;

                        window.electronAPI.invoke('xpider-email-get-page', { url })
                            .then(res => {
                                const emails = (res && Array.isArray(res.emails)) ? res.emails : [];
                                // Current 탭 데이터 주입
                                extensionWebview.executeJavaScript(
                                    `window.postMessage(${JSON.stringify({
                                        type: 'XPIDER_EVENT',
                                        name: 'email-collected',
                                        data: { emails, url, count: emails.length }
                                    })}, '*')`
                                ).catch(() => {});
                            }).catch(() => {});

                        // 전체 누적 이메일 주입
                        window.electronAPI.invoke('xpider-email-get-all', {})
                            .then(res => {
                                if (res && Array.isArray(res.emails) && res.emails.length > 0) {
                                    extensionWebview.executeJavaScript(
                                        `window.postMessage(${JSON.stringify({
                                            type: 'XPIDER_EVENT',
                                            name: 'email-collected',
                                            data: { emails: [], allEmails: res.emails, url, count: res.count }
                                        })}, '*')`
                                    ).catch(() => {});
                                }
                            }).catch(() => {});
                    };

                    // activeUrl이 유효하면 즉시 주입, 아니면 캐시된 마지막 이벤트 사용
                    if (activeUrl && !activeUrl.startsWith('chrome-extension://') && !activeUrl.startsWith('about:')) {
                        injectEmailData(activeUrl);
                    } else if (window._lastEmailCollectedPayload) {
                        // 팝업이 닫힌 동안 누적된 이벤트를 즉시 재전달
                        const cached = window._lastEmailCollectedPayload;
                        extensionWebview.executeJavaScript(
                            `window.postMessage(${JSON.stringify({ type: 'XPIDER_EVENT', name: cached.name, data: cached.data })}, '*')`
                        ).catch(() => {});
                    }
                }, { once: true });
                sidePanelTitle.textContent = ext.name;
                sidePanel.classList.remove('hidden');

            }
        };

        closeSidePanelBtn.onclick = () => {
            sidePanel.classList.add('hidden');
        };

        item.appendChild(btn);
        item.appendChild(balloon);
        extensionsBar.appendChild(item);
    });
    
    // Store extensions for manual injection into webviews
    window.loadedExtensions = extensions;

    setTimeout(() => { if (startLangSetup()) startOnboarding(); }, 1000);
});

// ─── 탭 관리 및 탐색 ──────────────────────────────────────────
let tabs = [];
let activeTabId = null;
let tabCounter = 0;

function createNewTab(url = 'start_page.html', makeActive = true) {
    const tabId = 'tab-' + (++tabCounter);
    
    const tabEl = document.createElement('div');
    tabEl.className = 'tab';
    tabEl.id = `tab-ui-${tabId}`;
    tabEl.innerHTML = `
        <img class="tab-favicon" id="tab-favicon-${tabId}" src="assets/icon.png">
        <span class="tab-title" id="tab-title-${tabId}">Loading...</span>
        <button class="tab-close" title="Close" onclick="event.stopPropagation(); closeTab('${tabId}')">✕</button>
    `;
    tabEl.onmousedown = (e) => {
        if (e.button === 0) switchTab(tabId);
        if (e.button === 1) closeTab(tabId); // Middle click to close
    };
    tabsList.appendChild(tabEl);
    
    // Webview creation
    const wv = document.createElement('webview');
    wv.id = `webview-${tabId}`;
    wv.className = 'webview-hidden';
    wv.setAttribute('autosize', 'on');
    wv.setAttribute('allowpopups', ''); 
    wv.setAttribute('preload', 'ext-preload.js'); 
    
    // Remove custom UA to improve loading speed/compatibility
    // wv.useragent = ...

    webviewsWrapper.appendChild(wv);
    wv.src = url;
    
    wv.addEventListener('console-message', (e) => {
        window.electronAPI.send('log-from-renderer', `[MAIN-WEBVIEW] ${e.message}`);
    });
    
    tabs.push({ id: tabId, url, title: 'New Tab' });
    
    wv.addEventListener('did-start-loading', () => { 
        if (activeTabId === tabId) reloadBtn.textContent = '✕'; 
        document.getElementById(`tab-title-${tabId}`).textContent = 'Loading...';
        document.getElementById(`tab-ui-${tabId}`).classList.add('loading');
    });
    wv.addEventListener('did-stop-loading', () => {
        document.getElementById(`tab-ui-${tabId}`).classList.remove('loading');
        if (activeTabId === tabId) reloadBtn.textContent = '↻';
        const currentUrl = wv.getURL();
        const currentTitle = wv.getTitle() || currentUrl;
        const realId = typeof wv.getWebContentsId === 'function' ? wv.getWebContentsId() : 999999;

        const t = tabs.find(x => x.id === tabId);
        if (t) { t.url = currentUrl; t.title = currentTitle; }
        document.getElementById(`tab-title-${tabId}`).textContent = currentTitle;
        if (activeTabId === tabId) {
            addressBar.value = currentUrl;
            updateBookmarkIcon();
            const tabInfo = { id: realId, url: currentUrl, title: currentTitle, windowId: 1, active: true };
            window.lastActiveTabInfo = tabInfo;
            window.electronAPI.send('xpider-ext-report-active-tab', tabInfo);
        }
        addHistory(currentUrl, currentTitle);

        // 수동 인젝션 블록 삭제됨 (Native loadExtension에서 처리)

        window.electronAPI.send('xpider-ext-notify-tab-updated', {
            tabId: realId,
            changeInfo: { status: 'complete', url: currentUrl },
            tab: { id: realId, url: currentUrl, title: currentTitle }
        });

        // ── [CAPTCHA FIX v2] 탭이 Google /sorry/ CAPTCHA 페이지로 이동하면 main.js에 즉시 알림 ──
        // 이미 열린 탭(실제 브라우저 탭)이 CAPTCHA로 리다이렉트된 경우 새 탭 불필요
        const isGoogleCaptcha =
            (currentUrl.includes('google.') && currentUrl.includes('/sorry/')) ||
            currentUrl.includes('google.com/recaptcha');

        if (isGoogleCaptcha) {
            console.log(`[CAPTCHA-DETECT] Google CAPTCHA 탭 감지: ${tabId} → ${currentUrl.substring(0, 80)}`);
            // 해당 탭을 캡챠 탭으로 마킹
            window._captchaTabId = tabId;
            // main.js에 알림: 이 탭이 이미 열려있는 CAPTCHA 탭임
            window.electronAPI.send('xpider-captcha-tab-detected', {
                tabUIId: tabId,
                captchaUrl: currentUrl
            });
        }
    });


    // ── [CAPTCHA FIX v2] 탭 네비게이션 감지 ──────────────────────────────────────
    // 조건: 이 탭이 캡챠 탭으로 마킹(_captchaTabId)된 경우에만 해결 신호 전송
    // → 일반 탭이 google.com/search로 이동하는 경우 오탐 방지
    wv.addEventListener('did-navigate', (e) => {
        const navUrl = e.url || '';
        if (navUrl.startsWith('file://') || navUrl.includes('start_page.html')) return;

        // 해결 감지: 이 탭이 캡챠 탭으로 마킹된 경우만 처리
        const isMyCaptchaTab = (window._captchaTabId === tabId);
        const isCaptchaResolved =
            navUrl === 'about:blank' ||
            navUrl.includes('google.com/search') ||
            navUrl.includes('bing.com/search');

        if (isMyCaptchaTab && isCaptchaResolved) {
            console.log(`[CAPTCHA-NAV] ✅ 캡챠 해결 감지 → ${navUrl.substring(0, 80)} (탭: ${tabId})`);
            window._captchaTabId = null; // 마킹 해제
            // main.js에 캡챠 해결 완료 신호
            window.electronAPI.send('xpider-captcha-tab-resolved', {
                tabUIId: tabId,
                url: navUrl
            });
            // 800ms 후 탭 강제 닫기
            setTimeout(() => {
                if (tabs.find(t => t.id === tabId)) {
                    console.log(`[CAPTCHA-NAV] 탭 강제 닫기: ${tabId}`);
                    closeTab(tabId);
                }
            }, 800);
        }

        // [v4.2] 활성 탭이 이동하면 main.js Email Engine에 URL 보고 + 팝업 즉시 업데이트
        if (activeTabId === tabId) {
            window.electronAPI.send('xpider-ext-report-active-tab', { url: navUrl });
            // Current 탭: 내비게이션 직후 페이지 초기화 신호를 팝업에 전달
            if (extensionWebview && extensionWebview.src) {
                extensionWebview.executeJavaScript(
                    `window.postMessage(${JSON.stringify({
                        type: 'XPIDER_EVENT',
                        name: 'email-clear-current',
                        data: { url: navUrl }
                    })}, '*')`
                ).catch(() => {});
            }
            // 이동 즉시 페이지 스캔 요청 (기존 캐시 데이터가 있다면 즉시 팝업에 주입)
            window.electronAPI.invoke('xpider-email-get-page', { url: navUrl }).then(res => {
                if (res && Array.isArray(res.emails) && res.emails.length > 0) {
                    const evtPayload = { name: 'email-collected', data: { emails: res.emails, url: navUrl, count: res.emails.length } };
                    window._lastEmailCollectedPayload = evtPayload;
                    if (extensionWebview && extensionWebview.src) {
                        extensionWebview.executeJavaScript(
                            `window.postMessage(${JSON.stringify({ type: 'XPIDER_EVENT', name: evtPayload.name, data: evtPayload.data })}, '*')`
                        ).catch(() => {});
                    }
                }
            }).catch(() => {});
        }
    });



    wv.addEventListener('page-title-updated', (e) => {
        const title = e.title;
        const t = tabs.find(x => x.id === tabId);
        if (t) t.title = title;
        document.getElementById(`tab-title-${tabId}`).textContent = title;
        if (activeTabId === tabId) document.title = title + ' - XPIDER Browser';
    });

    wv.addEventListener('page-favicon-updated', (e) => {
        if (e.favicons && e.favicons.length > 0) {
            document.getElementById(`tab-favicon-${tabId}`).src = e.favicons[0];
        }
    });
    
    if (makeActive) switchTab(tabId);
}

function switchTab(tabId) {
    activeTabId = tabId;
    tabs.forEach(t => {
        const isAct = (t.id === tabId);
        document.getElementById(`tab-ui-${t.id}`).classList.toggle('active', isAct);
        const wv = document.getElementById(`webview-${t.id}`);
        if (wv) {
            wv.className = isAct ? 'webview-active' : 'webview-hidden';
            if (isAct) {
                addressBar.value = wv.getURL();
                updateBookmarkIcon();
                document.title = (t.title || 'XPIDER Browser') + (t.title ? ' - XPIDER Browser' : '');
                wv.focus();
                
                // 해당 웹뷰의 현재 로딩 상태에 따라 새로고침 버튼 텍스트 복구
                if (typeof wv.isLoading === 'function' && wv.isLoading()) {
                    reloadBtn.textContent = '✕';
                } else {
                    reloadBtn.textContent = '↻';
                }
                
                const realId = typeof wv.getWebContentsId === 'function' ? wv.getWebContentsId() : 999999;
                const tabInfo = { id: realId, url: wv.getURL(), title: wv.getTitle() || wv.getURL(), windowId: 1, active: true };
                window.lastActiveTabInfo = tabInfo;
                window.electronAPI.send('xpider-ext-report-active-tab', tabInfo);

                // --- 맵 드래그 감지 및 자동 스크랩 트리거 ---
                if (!wv.hasAttribute('data-drag-attached')) {
                    wv.setAttribute('data-drag-attached', 'true');
                    let dragStartPos = null;
                    
                    wv.addEventListener('mousedown', (e) => { dragStartPos = { x: e.x, y: e.y }; });
                    wv.addEventListener('mouseup', (e) => {
                        if (!dragStartPos) return;
                        const dist = Math.sqrt(Math.pow(e.x - dragStartPos.x, 2) + Math.pow(e.y - dragStartPos.y, 2));
                        // 20px 이상 드래그 시 '지도가 이동됨'으로 간주
                        const isMapUrl = wv.getURL().includes('google.com/maps') || wv.getURL().includes('bing.com/maps');
                        if (dist > 20 && isMapUrl) {
                            console.log('[XPIDER-DRAG] Map drag detected, triggering auto-scraping...');
                            // 사이드바 익스텐션에게 알림 전송
                            if (extensionWebview && extensionWebview.contentWindow) {
                                extensionWebview.executeJavaScript(`window.postMessage({ type: 'XPIDER_EVENT', name: 'xpider-ext-map-moved', data: { url: "${wv.getURL()}" } }, '*')`);
                            }
                        }
                        dragStartPos = null;
                    });
                }
            }
        }
    });
}

function closeTab(tabId) {
    const idx = tabs.findIndex(t => t.id === tabId);
    if (idx === -1) return;
    document.getElementById(`tab-ui-${tabId}`)?.remove();
    document.getElementById(`webview-${tabId}`)?.remove();
    tabs.splice(idx, 1);
    if (activeTabId === tabId) {
        if (tabs.length > 0) switchTab(tabs[Math.min(idx, tabs.length - 1)].id);
        else createNewTab();
    }
}

if (newTabBtn) newTabBtn.onclick = () => createNewTab();
window.addEventListener('DOMContentLoaded', () => createNewTab('start_page.html'));

// Expose to window for Electron bridge access
window._captchaTabId = null; // 현재 캡챠 탭 UI ID (did-stop-loading에서 마킹)
window.tabs = tabs;
window.getActiveWebview = getActiveWebview;
window.createNewTab = createNewTab;
window.switchTab = switchTab;
window.closeTab = closeTab;

function getActiveWebview() { return activeTabId ? document.getElementById(`webview-${activeTabId}`) : null; }

function navigate() {
    let url = addressBar.value.trim();
    console.log('[NAVIGATE] Input:', url);
    if (!url) return;
    
    if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('about:') && !url.startsWith('chrome-extension://')) {
        if (url.includes('.') && !url.includes(' ')) {
            url = 'https://' + url;
        } else {
            url = 'https://www.google.com/search?q=' + encodeURIComponent(url);
        }
    }
    
    console.log('[NAVIGATE] Final URL:', url);
    const wv = getActiveWebview();
    if (wv) {
        console.log('[NAVIGATE] Loading URL into webview:', wv.id);
        try {
            wv.loadURL(url);
        } catch (e) {
            console.error('[NAVIGATE] loadURL failed, falling back to .src:', e);
            wv.src = url;
        }
    } else {
        console.error('[NAVIGATE] No active webview found!');
        // Try creating a new tab if no active one exists
        createNewTab(url);
    }
}

addressBar.addEventListener('keypress', (e) => { if (e.key === 'Enter') navigate(); });
backBtn.addEventListener('click',    () => { const wv = getActiveWebview(); if (wv && wv.canGoBack())    wv.goBack();    });
forwardBtn.addEventListener('click', () => { const wv = getActiveWebview(); if (wv && wv.canGoForward()) wv.goForward(); });
reloadBtn.addEventListener('click', () => {
    const wv = getActiveWebview();
    if (!wv) return;
    if (typeof wv.isLoading === 'function' && wv.isLoading()) {
        wv.stop();
        reloadBtn.textContent = '↻';
    } else {
        wv.reload();
    }
});

// ─── Background Webviews for Extension Compatibility ───────────
const backgroundWebviews = new Map();

window.createBackgroundWebview = async function(props) {
    const id = Date.now();
    const wv = document.createElement('webview');
    wv.style.position = 'fixed';
    wv.style.top = '-10000px'; // Hide but keep in DOM
    wv.style.width = '1200px';
    wv.style.width = '1200px';
    wv.style.height = '800px';
    document.body.appendChild(wv);
    wv.src = props.url || 'about:blank';
    
    backgroundWebviews.set(id, wv);
    
    // Auto-cleanup after 1 minute to prevent memory leaks
    setTimeout(() => {
        if (backgroundWebviews.has(id)) {
            wv.remove();
            backgroundWebviews.delete(id);
        }
    }, 60000);

    return new Promise((resolve) => {
        const onDone = () => {
            wv.removeEventListener('did-finish-load', onDone);
            wv.removeEventListener('did-fail-load', onDone);
            const realId = typeof wv.getWebContentsId === 'function' ? wv.getWebContentsId() : id;
            backgroundWebviews.set(realId, wv); // Map by real ID if possible
            resolve({ id: realId, url: wv.getURL(), status: 'complete' });
        };
        wv.addEventListener('did-finish-load', onDone);
        wv.addEventListener('did-fail-load', onDone);
        setTimeout(() => onDone(), 10000);
    });
};

window.getWebviewById = function(id) {
    if (backgroundWebviews.has(id)) return backgroundWebviews.get(id);
    // Check main tabs (active and inactive)
    const allWebviews = document.querySelectorAll('webview');
    for (const wv of allWebviews) {
        if (typeof wv.getWebContentsId === 'function' && wv.getWebContentsId() == id) return wv;
    }
    return null;
};

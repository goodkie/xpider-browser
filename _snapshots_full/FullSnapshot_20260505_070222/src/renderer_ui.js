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

// ─── 테마 초기화 ──────────────────────────────────────────────
const savedTheme = localStorage.getItem('app-theme') || 'theme-dark';
appContainer.className = savedTheme;

// ─── 사이드바 상태 ────────────────────────────────────────────
const sidebarCollapsed = localStorage.getItem('sidebar-collapsed') === 'true';
if (sidebarCollapsed) appContainer.classList.add('sidebar-collapsed');

// ─── 언어 초기화 ──────────────────────────────────────────────
let currentLang = localStorage.getItem('app-lang') || 'en';


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

    // Notify extension webview about language change
    if (extensionWebview && extensionWebview.src) {
        extensionWebview.executeJavaScript(`window.postMessage({ type: 'XPIDER_EVENT', name: 'language-change', data: { lang: '${lang}' } }, '*')`);
    }
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

// ─── 언어 버튼 ────────────────────────────────────────────────
document.querySelectorAll('.lang-opt').forEach(opt => {
    opt.onclick = () => {
        const lang = opt.getAttribute('data-lang');
        currentLang = lang;
        applyLanguage(lang);
        localStorage.setItem('app-lang', lang);
        settingsMenu.classList.add('hidden');
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

window.electronAPI.on('xpider-record-download', (data) => {
    console.log('[RENDERER] Recording download:', data);
    downloads.unshift({
        id: Date.now(),
        filename: data.filename,
        path: data.url, // Fallback to URL if path is not available
        time: data.timestamp || new Date().toISOString()
    });
    // Keep last 50 downloads
    if (downloads.length > 50) downloads = downloads.slice(0, 50);
    localStorage.setItem('xpider-downloads', JSON.stringify(downloads));
    
    // Update UI if overlay is open
    if (!overlayPanel.classList.contains('hidden') && currentPanelTab === 'downloads') {
        renderOverlayPanel('downloads');
    }
});



// ─── 실시간 시스템 진단 터미널 엔진 ───────────────────────────
const sysDiagBtn = document.getElementById('sys-diag-btn');
const diagModal = document.getElementById('diag-modal');
const diagTerminal = document.getElementById('diag-log-terminal');
const diagSnapshot = document.getElementById('diag-snapshot');
const diagStatus = document.getElementById('diag-status');
const copyDiagBtn = document.getElementById('copy-diag-btn');
const closeDiagBtn = document.getElementById('close-diag-btn');
const diagClearBtn = document.getElementById('diag-clear-btn');
const diagAutoScrollBtn = document.getElementById('diag-autoscroll-btn');
const diagLevelFilter = document.getElementById('diag-level-filter');
const diagSourceFilter = document.getElementById('diag-source-filter');

let allLogs = [];
let diagAutoScroll = true;
let diagLiveListenerAttached = false;

const LOG_COLORS = {
    ERROR:   { bg: '#2a0000', fg: '#ff5555', icon: '❌' },
    WARN:    { bg: '#1a1400', fg: '#ffcc00', icon: '⚠️' },
    NAV:     { bg: '#001020', fg: '#55aaff', icon: '🔗' },
    'NAV-SPA':{ bg: '#001020', fg: '#55ccff', icon: '↪' },
    INFO:    { bg: '#000',    fg: '#cccccc', icon: 'ℹ' },
    LOG:     { bg: '#000',    fg: '#aaaaaa', icon: '·' },
    UI:      { bg: '#001a00', fg: '#55ff55', icon: '🖥' },
    DEBUG:   { bg: '#0a000a', fg: '#9966ff', icon: '🔍' },
};

function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function makeLogRow(entry) {
    const c = LOG_COLORS[entry.level] || LOG_COLORS.LOG;
    return `<div style="padding:1px 4px; background:${c.bg}; border-left:2px solid ${c.fg}33; margin-bottom:1px; white-space:pre-wrap; word-break:break-all;">` +
        `<span style="color:#555;">${escHtml(entry.t)}</span> ` +
        `<span style="color:${c.fg}; font-weight:bold; min-width:60px; display:inline-block;">${c.icon}[${escHtml(entry.level)}]</span> ` +
        `<span style="color:#77aaff;">[${escHtml(entry.source)}]</span> ` +
        `<span style="color:${c.fg};">${escHtml(entry.msg)}</span>` +
        `</div>`;
}



function renderLogs() {
    if (!diagTerminal) return;
    const lvl = diagLevelFilter ? diagLevelFilter.value : 'ALL';
    const src = diagSourceFilter ? diagSourceFilter.value : 'ALL';
    const filtered = allLogs.filter(e => {
        const levelOk = lvl === 'ALL' || e.level === lvl || (lvl === 'NAV' && e.level.startsWith('NAV'));
        const srcOk = src === 'ALL' || e.source.includes(src);
        return levelOk && srcOk;
    });
    diagTerminal.innerHTML = filtered.map(makeLogRow).join('');
    if (diagAutoScroll) diagTerminal.scrollTop = diagTerminal.scrollHeight;
    if (diagStatus) diagStatus.textContent = `${allLogs.length}개 로그 | 필터된 항목: ${filtered.length}개 | 실시간 수신 중...`;
}

function appendLogEntry(entry) {
    allLogs.push(entry);
    if (allLogs.length > 1000) allLogs.shift(); // 최대 1000개 유지
    const lvl = diagLevelFilter ? diagLevelFilter.value : 'ALL';
    const src = diagSourceFilter ? diagSourceFilter.value : 'ALL';
    const levelOk = lvl === 'ALL' || entry.level === lvl || (lvl === 'NAV' && entry.level.startsWith('NAV'));
    const srcOk = src === 'ALL' || entry.source.includes(src);
    if (diagModal && !diagModal.classList.contains('hidden') && levelOk && srcOk && diagTerminal) {
        diagTerminal.insertAdjacentHTML('beforeend', makeLogRow(entry));
        if (diagAutoScroll) diagTerminal.scrollTop = diagTerminal.scrollHeight;
        const total = allLogs.length;
        if (diagStatus) diagStatus.textContent = `${total}개 로그 | 실시간 수신 중...`;
    }
}

// 실시간 로그 스트림 수신 (한 번만 등록)
if (!diagLiveListenerAttached) {
    diagLiveListenerAttached = true;
    window.electronAPI.on('xpider-live-log', (entry) => appendLogEntry(entry));
}

async function openDiagnostics() {
    try {
        diagModal.classList.remove('hidden');
        if (diagTerminal) diagTerminal.innerHTML = '<div style="color:#555; padding:10px;">⏳ 로그 수집 중...</div>';
        const data = await window.electronAPI.invoke('get-system-logs');
        
        // Snapshot 업데이트
        if (diagSnapshot) {
            const ext = (data.activeExtensions || []).map(e => `<span style="color:#fa0;">${escHtml(e.name)}</span> v${escHtml(e.version)}`).join(' | ');
            diagSnapshot.innerHTML = [
                `<span>🕒 ${escHtml(data.timestamp?.slice(11,19) || '')}</span>`,
                `<span>📦 v${escHtml(data.appVersion || '')}</span>`,
                `<span>💾 ${escHtml(String(data.memMB || 0))}MB</span>`,
                `<span>⏱ 가동 ${escHtml(String(data.uptime || 0))}초</span>`,
                `<span>📋 리드 ${escHtml(String(data.storageLeads || 0))}개</span>`,
                `<span>🪟 창 ${escHtml(String(data.windows || 0))}개</span>`,
                `<span>🔌 ${ext || '없음'}</span>`
            ].join('<span style="color:#333; margin:0 5px;">|</span>');
        }

        // 최근 로그 초기화 (이전 로그 보존, 새 히스토리 병합)
        const history = data.recentLogs || [];
        if (allLogs.length === 0) allLogs = history;
        renderLogs();
    } catch (e) {
        if (diagTerminal) diagTerminal.innerHTML = `<div style="color:#f55;">❌ 오류: ${escHtml(e.message)}</div>`;
    }
}

if (sysDiagBtn) sysDiagBtn.onclick = openDiagnostics;
if (closeDiagBtn) closeDiagBtn.onclick = () => diagModal.classList.add('hidden');
if (diagClearBtn) diagClearBtn.onclick = () => { allLogs = []; if (diagTerminal) diagTerminal.innerHTML = ''; if (diagStatus) diagStatus.textContent = '지움'; };
if (diagAutoScrollBtn) {
    diagAutoScrollBtn.onclick = () => {
        diagAutoScroll = !diagAutoScroll;
        diagAutoScrollBtn.textContent = diagAutoScroll ? '▼ 자동스크롤 ON' : '⏸ 자동스크롤 OFF';
        diagAutoScrollBtn.style.background = diagAutoScroll ? '#1a3a1a' : '#1a1a1a';
        diagAutoScrollBtn.style.color = diagAutoScroll ? '#0f0' : '#888';
    };
}
if (diagLevelFilter) diagLevelFilter.onchange = renderLogs;
if (diagSourceFilter) diagSourceFilter.onchange = renderLogs;
if (copyDiagBtn) {
    copyDiagBtn.onclick = () => {
        const text = allLogs.map(e => `[${e.t}][${e.level}][${e.source}] ${e.msg}`).join('\n');
        navigator.clipboard.writeText(text).then(() => {
            copyDiagBtn.textContent = '✅ Copied!';
            setTimeout(() => { copyDiagBtn.textContent = '📋 Copy All'; }, 2000);
        });
    };
}

// Ctrl+Shift+L 단축키
window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'L') { e.preventDefault(); openDiagnostics(); }
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

// ─── 업데이트 체크 결과 처리 ──────────────────────────────────
window.electronAPI.on('app-update-result', (result) => {
    if (!result) return;

    if (result.hasUpdate) {
        // 사용자가 이미 이 버전을 스킵했는지 확인
        const skippedVersion = localStorage.getItem('xpider-skip-version');
        if (skippedVersion === result.latestVersion) {
            console.log('[Update] 스킵된 버전:', result.latestVersion);
            return;
        }
        // 모달 표시
        if (modalCurrentVer) modalCurrentVer.textContent = result.currentVersion || '';
        if (modalLatestVer)  modalLatestVer.textContent  = result.latestVersion  || '';
        if (modalNotes) {
            const notes = (result.releaseNotes || '').trim().substring(0, 300);
            modalNotes.textContent = notes || '새 버전이 출시되었습니다.';
        }
        _releaseUrl = result.downloadUrl || result.releaseUrl || '';
        updateModal.classList.remove('hidden');
    } else {
        // 이미 최신 버전 토스트 표시
        showToast(`✅ 최신 버전입니다. (v${result.currentVersion})`);
    }
});

// ─── 업데이트 모달 버튼 ───────────────────────────────────────
modalUpdateBtn.onclick = () => {
    window.electronAPI.send('open-release-url', _releaseUrl);
    updateModal.classList.add('hidden');
};
// '나중에' 누르면 현재 최신 버전을 스킵 버전으로 저장 (다음 실행 시 안 뜨움)
modalSkipBtn.onclick = () => {
    const latestVer = modalLatestVer ? modalLatestVer.textContent : '';
    if (latestVer) localStorage.setItem('xpider-skip-version', latestVer);
    updateModal.classList.add('hidden');
};
updateModal.onclick = (e) => { if (e.target === updateModal) updateModal.classList.add('hidden'); };

// ─── Check for Updates 버튼 ───────────────────────────────────
document.getElementById('check-update-btn').onclick = () => {
    settingsMenu.classList.add('hidden');
    showToast('🔍 업데이트 확인 중...');
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
    if (!message || !message.action) return;
    console.log('[XPIDER-RUNTIME-MSG] Received:', message.action);

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
const onboardingBubble  = document.getElementById('onboarding-bubble');
const obNextBtn  = document.getElementById('ob-next-btn');
const obCloseBtn = document.getElementById('ob-close-btn');
const obDontShow = document.getElementById('ob-dont-show');

let onboardingStep = 0;
const onboardingSteps = [
    { extName: "Collect List", titleKey: "ext_collect_title", descKey: "ext_collect_desc" },
    { extName: "Send Message", titleKey: "ext_send_title",   descKey: "ext_send_desc"  }
];

function updateOnboarding() {
    const step = onboardingSteps[onboardingStep];
    const dict = window.translations[currentLang] || window.translations['en'];
    const buttons = Array.from(document.querySelectorAll('.ext-btn'));
    const targetBtn = buttons.find(btn => btn.title.toLowerCase().includes(step.extName.toLowerCase()));
    if (targetBtn) {
        const rect = targetBtn.getBoundingClientRect();
        onboardingBubble.style.top  = `${rect.top + rect.height / 2 - onboardingBubble.offsetHeight / 2}px`;
        onboardingBubble.style.left = `${rect.right + 25}px`;
        document.querySelectorAll('.highlight-target').forEach(el => el.classList.remove('highlight-target'));
        targetBtn.classList.add('highlight-target');
    }
    document.getElementById('ob-title').textContent = dict[step.titleKey] || step.titleKey;
    document.getElementById('ob-desc').textContent  = dict[step.descKey]  || step.descKey;
    document.querySelector('.step-indicator').textContent = `${onboardingStep + 1} / ${onboardingSteps.length}`;
    if (onboardingStep === onboardingSteps.length - 1) {
        obNextBtn.classList.add('hidden');
        obCloseBtn.classList.remove('hidden');
    } else {
        obNextBtn.classList.remove('hidden');
        obCloseBtn.classList.add('hidden');
    }
}

function startLangSetup() {
    if (localStorage.getItem('skip-lang-setup') === 'true') return true;
    langSetupOverlay.classList.remove('hidden');
    langBtns.forEach(btn => {
        btn.onclick = () => {
            currentLang = btn.getAttribute('data-lang');
            langBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            applyLanguage(currentLang);
            localStorage.setItem('app-lang', currentLang);
        };
        if (btn.getAttribute('data-lang') === currentLang) btn.classList.add('active');
    });
    langSaveBtn.onclick = () => {
        langSetupOverlay.classList.add('hidden');
        if (langDontShow.checked) localStorage.setItem('skip-lang-setup', 'true');
        startOnboarding();
    };
    return false;
}

function startOnboarding() {
    if (localStorage.getItem('skip-onboarding') === 'true') return;
    onboardingOverlay.classList.remove('hidden');
    onboardingOverlay.classList.add('active');
    updateOnboarding();
}

obNextBtn.onclick  = () => { onboardingStep++; updateOnboarding(); };
obCloseBtn.onclick = () => {
    onboardingOverlay.classList.remove('active');
    onboardingOverlay.classList.add('hidden');
    document.querySelectorAll('.highlight-target').forEach(el => el.classList.remove('highlight-target'));
    if (obDontShow.checked) localStorage.setItem('skip-onboarding', 'true');
};

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

function renderOverlayPanel(tab) {
    currentPanelTab = tab;
    panelList.innerHTML = '';
    
    let items = [];
    if (tab === 'history') items = history;
    else if (tab === 'bookmarks') items = bookmarks;
    else if (tab === 'downloads') items = downloads;

    panelTabs.forEach(t => t.classList.toggle('active', t.getAttribute('data-tab') === tab));
    clearHistoryBtn.classList.toggle('hidden', tab !== 'history');
    
    if (items.length === 0) {
        panelList.innerHTML = `<div style="text-align:center;color:var(--text-dim);padding:40px;">Empty</div>`;
        return;
    }

    items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'panel-item';
        
        if (tab === 'downloads') {
            div.innerHTML = `<div class="item-title">${item.filename || 'File'}</div><div class="item-url">${item.path || ''}</div>`;
            div.onclick = () => { if(item.path) window.electronAPI.send('open-path', item.path); };
        } else {
            div.innerHTML = `<div class="item-title">${item.title || item.url}</div><div class="item-url">${item.url}</div>`;
            div.onclick = () => { const wv = getActiveWebview(); if(wv) wv.src = item.url; overlayPanel.classList.add('hidden'); };
        }
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
        
        if (ext.name.toLowerCase().includes('collect')) {
            title = dict.ext_collect_title || ext.name;
            desc = dict.ext_collect_desc || "";
        } else if (ext.name.toLowerCase().includes('send')) {
            title = dict.ext_send_title || ext.name;
            desc = dict.ext_send_desc || "";
        } else if (ext.name.toLowerCase().includes('email')) {
            title = dict.ext_email_title || ext.name;
            desc = dict.ext_email_desc || "";
        } else if (ext.name.toLowerCase().includes('bing')) {
            title = "Bing Maps Business Finder";
            desc = currentLang === 'ko' ? "빙 맵스에서 비즈니스 정보를 수집하고 이메일을 찾는 도구입니다." : "Tools for collecting business info and finding emails on Bing Maps.";
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
                    extensionWebview.executeJavaScript(`window.postMessage({ type: 'XPIDER_EVENT', name: 'language-change', data: { lang: '${currentLang}' } }, '*')`);
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
reloadBtn.addEventListener('click',  () => { const wv = getActiveWebview(); if (wv) wv.reload(); });

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

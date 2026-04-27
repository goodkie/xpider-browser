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
let currentLang = localStorage.getItem('app-lang') || 'ko';

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
    if (confirm('로그아웃 하시겠습니까?')) {
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

// ─── 익스텐션 업데이트 진행 메시지 표시 ─────────────────────────
window.electronAPI.on('ext-sync-progress', (msg) => {
    showToast('📦 ' + msg, 4000);
});

// Listener for extension-triggered tab updates
window.electronAPI.on('xpider-renderer-update-active-tab', (props) => {
    const wv = getActiveWebview();
    if (wv && props.url) {
        wv.loadURL(props.url);
        // Optionally update the address bar immediately
        addressBar.value = props.url;
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
    if (confirm('Clear all history?')) {
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

        // ── 아이콘: Base64 데이터를 우선 사용, 실패 시 chrome-extension URL 사용 ──────
        const iconUrl = ext.iconData || `chrome-extension://${ext.id}/${ext.icon}`;
        const img = new Image();
        img.onload  = () => { btn.style.backgroundImage = `url('${iconUrl}')`; };
        img.onerror = () => { btn.style.backgroundImage = `url('assets/icon.png')`; };
        img.src = iconUrl;

        // ── 풍선 프리뷰 ──────────────────────────────────────
        const balloon = document.createElement('div');
        balloon.className = 'snapshot-balloon';
        const previewSrc = ext.name.toLowerCase().includes('collect')
            ? 'assets/previews/collect-list-preview.png'
            : 'assets/previews/send-message-preview.png';
        balloon.innerHTML = `<div class="preview-title">${ext.name}</div><img src="${previewSrc}" class="preview-img">`;

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
    tabEl.innerHTML = `<span class="tab-title" id="tab-title-${tabId}">Loading...</span><button class="tab-close" title="Close" onclick="event.stopPropagation(); closeTab('${tabId}')">✕</button>`;
    tabEl.onclick = () => switchTab(tabId);
    tabsList.appendChild(tabEl);
    
    const wv = document.createElement('webview');
    wv.id = `webview-${tabId}`;
    wv.className = 'webview-hidden';
    wv.setAttribute('autosize', 'on');
    wv.src = url;
    webviewsWrapper.appendChild(wv);
    
    // FORWARD CONSOLE LOGS FOR DEBUGGING CONTENT SCRIPTS
    wv.addEventListener('console-message', (e) => {
        window.electronAPI.send('log-from-renderer', `[MAIN-WEBVIEW] ${e.message}`);
    });
    
    tabs.push({ id: tabId, url, title: 'New Tab' });
    
    wv.addEventListener('did-start-loading', () => { 
        if (activeTabId === tabId) reloadBtn.textContent = '✕'; 
        document.getElementById(`tab-title-${tabId}`).textContent = 'Loading...';
    });
    wv.addEventListener('did-stop-loading', () => {
        const currentUrl = wv.getURL();
        const currentTitle = wv.getTitle() || currentUrl;
        const t = tabs.find(x => x.id === tabId);
        if (t) { t.url = currentUrl; t.title = currentTitle; }
        document.getElementById(`tab-title-${tabId}`).textContent = currentTitle;
        if (activeTabId === tabId) {
            reloadBtn.textContent = '↻';
            addressBar.value = currentUrl;
            updateBookmarkIcon();
            
            // Update lastActiveTabInfo
            window.lastActiveTabInfo = { id: realId, url: currentUrl, title: currentTitle };
        }
        addHistory(currentUrl, currentTitle);
        
        // Notify extensions for chrome.tabs.onUpdated
        const realId = typeof wv.getWebContentsId === 'function' ? wv.getWebContentsId() : 999999;
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
                addressBar.value = typeof wv.getURL === 'function' ? wv.getURL() : (wv.src || '');
                updateBookmarkIcon();
                document.title = (t.title || 'XPIDER Browser') + (t.title ? ' - XPIDER Browser' : '');
                wv.focus();
                
                // Update lastActiveTabInfo
                const realId = typeof wv.getWebContentsId === 'function' ? wv.getWebContentsId() : 999999;
                const currentUrl = typeof wv.getURL === 'function' ? wv.getURL() : (wv.src || '');
                const currentTitle = typeof wv.getTitle === 'function' ? wv.getTitle() : '';
                window.lastActiveTabInfo = { id: realId, url: currentUrl, title: currentTitle || currentUrl };
                
                // Notify extensions about tab change so sidepanels can update their active state
                window.electronAPI.send('xpider-ext-notify-tab-updated', {
                    tabId: realId,
                    changeInfo: { status: 'complete', url: currentUrl },
                    tab: { id: realId, url: currentUrl, title: currentTitle || currentUrl }
                });
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

function getActiveWebview() { return activeTabId ? document.getElementById(`webview-${activeTabId}`) : null; }

function navigate() {
    let url = addressBar.value.trim();
    if (!url) return;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        if (url.includes('.') && !url.includes(' ')) url = 'https://' + url;
        else url = 'https://www.google.com/search?q=' + encodeURIComponent(url);
    }
    const wv = getActiveWebview();
    if (wv) wv.src = url;
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
    wv.style.height = '800px';
    wv.src = props.url || 'about:blank';
    document.body.appendChild(wv);
    
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

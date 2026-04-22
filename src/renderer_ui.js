const webview = document.getElementById('main-webview');
const addressBar = document.getElementById('address-bar');
const backBtn = document.getElementById('back-btn');
const forwardBtn = document.getElementById('forward-btn');
const reloadBtn = document.getElementById('reload-btn');
const updateNotification = document.getElementById('update-notification');
const updateMsg = document.getElementById('update-msg');
const restartBtn = document.getElementById('restart-btn');
const extensionsBar = document.getElementById('side-dock');
const sidePanel = document.getElementById('side-panel');
const extensionWebview = document.getElementById('extension-webview');
const settingsBtn = document.getElementById('settings-btn');
const settingsMenu = document.getElementById('settings-menu');
const appContainer = document.getElementById('app-container');
const addBtn = document.getElementById('add-btn');
const toggleSidebarBtn = document.getElementById('toggle-sidebar-btn');
const sidebarOpener = document.getElementById('sidebar-opener');

// 북마크/히스토리 관련 요소
const bookmarkBtn = document.getElementById('bookmark-btn');
const historyBtn = document.getElementById('history-btn');
const overlayPanel = document.getElementById('browser-overlay-panel');
const panelList = document.getElementById('panel-list');
const panelTabs = document.querySelectorAll('.panel-tab');
const clearHistoryBtn = document.getElementById('clear-history-btn');

let currentExtensionId = null;
let currentPanelTab = 'history';

// 데이터 초기화
let history = JSON.parse(localStorage.getItem('xpider-history') || '[]');
let bookmarks = JSON.parse(localStorage.getItem('xpider-bookmarks') || '[]');

// 테마 초기화
const savedTheme = localStorage.getItem('app-theme') || 'theme-dark';
appContainer.className = savedTheme;

// 사이드바 상태 초기화
const sidebarCollapsed = localStorage.getItem('sidebar-collapsed') === 'true';
if (sidebarCollapsed) {
    appContainer.classList.add('sidebar-collapsed');
}

// 언어 초기화
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
}

applyLanguage(currentLang);

// 테마 버튼 클릭
document.querySelectorAll('.theme-opt').forEach(opt => {
    opt.onclick = () => {
        const theme = opt.getAttribute('data-theme');
        appContainer.className = theme;
        localStorage.setItem('app-theme', theme);
        settingsMenu.classList.add('hidden');
    };
});

// 언어 버튼 클릭
document.querySelectorAll('.lang-opt').forEach(opt => {
    opt.onclick = () => {
        const lang = opt.getAttribute('data-lang');
        currentLang = lang;
        applyLanguage(lang);
        localStorage.setItem('app-lang', lang);
        settingsMenu.classList.add('hidden');
    };
});

// 홈페이지 이동
addBtn.onclick = () => {
    webview.src = 'start_page.html'; 
    addressBar.value = '';
};

// 사이드바 토글
toggleSidebarBtn.onclick = () => {
    appContainer.classList.add('sidebar-collapsed');
    localStorage.setItem('sidebar-collapsed', 'true');
};

sidebarOpener.onclick = () => {
    appContainer.classList.remove('sidebar-collapsed');
    localStorage.setItem('sidebar-collapsed', 'false');
};

// 설정 메뉴 토글
settingsBtn.onclick = (e) => {
    e.stopPropagation();
    settingsMenu.classList.toggle('hidden');
    overlayPanel.classList.add('hidden');
};

document.addEventListener('click', (e) => {
    if (!settingsMenu.contains(e.target) && e.target !== settingsBtn) {
        settingsMenu.classList.add('hidden');
    }
    if (!overlayPanel.contains(e.target) && e.target !== historyBtn && e.target !== bookmarkBtn) {
        overlayPanel.classList.add('hidden');
    }
});

settingsMenu.onclick = (e) => e.stopPropagation();

// 윈도우 컨트롤
document.getElementById('min-btn').onclick = () => window.electronAPI.send('window-control', 'minimize');
document.getElementById('max-btn').onclick = () => window.electronAPI.send('window-control', 'maximize');
document.getElementById('close-btn').onclick = () => window.electronAPI.send('window-control', 'close');

// 온보딩 관련
const langSetupOverlay = document.getElementById('lang-setup-overlay');
const langSaveBtn = document.getElementById('lang-save-btn');
const langDontShow = document.getElementById('lang-dont-show');
const langBtns = document.querySelectorAll('.lang-btn');
const onboardingOverlay = document.getElementById('onboarding-overlay');
const onboardingBubble = document.getElementById('onboarding-bubble');
const obNextBtn = document.getElementById('ob-next-btn');
const obCloseBtn = document.getElementById('ob-close-btn');
const obDontShow = document.getElementById('ob-dont-show');

let onboardingStep = 0;
const onboardingSteps = [
    { extName: "Collect List", titleKey: "ext_collect_title", descKey: "ext_collect_desc" },
    { extName: "Send Message", titleKey: "ext_send_title", descKey: "ext_send_desc" }
];

function updateOnboarding() {
    const step = onboardingSteps[onboardingStep];
    const dict = window.translations[currentLang] || window.translations['en'];
    const buttons = Array.from(document.querySelectorAll('.ext-btn'));
    const targetBtn = buttons.find(btn => btn.title.toLowerCase().includes(step.extName.toLowerCase()));

    if (targetBtn) {
        const rect = targetBtn.getBoundingClientRect();
        onboardingBubble.style.top = `${rect.top + rect.height / 2 - onboardingBubble.offsetHeight / 2}px`;
        onboardingBubble.style.left = `${rect.right + 25}px`;
        document.querySelectorAll('.highlight-target').forEach(el => el.classList.remove('highlight-target'));
        targetBtn.classList.add('highlight-target');
    }

    document.getElementById('ob-title').textContent = dict[step.titleKey] || step.titleKey;
    document.getElementById('ob-desc').textContent = dict[step.descKey] || step.descKey;
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

obNextBtn.onclick = () => { onboardingStep++; updateOnboarding(); };
obCloseBtn.onclick = () => {
    onboardingOverlay.classList.remove('active');
    onboardingOverlay.classList.add('hidden');
    document.querySelectorAll('.highlight-target').forEach(el => el.classList.remove('highlight-target'));
    if (obDontShow.checked) localStorage.setItem('skip-onboarding', 'true');
};

// 히스토리 및 북마크 로직
function addHistory(url, title) {
    if (!url || url === 'about:blank' || url.includes('start_page.html')) return;
    history = history.filter(item => item.url !== url);
    history.unshift({ url, title: title || url, time: Date.now() });
    if (history.length > 100) history.pop();
    localStorage.setItem('xpider-history', JSON.stringify(history));
}

function toggleBookmark() {
    const url = webview.getURL();
    const title = webview.getTitle();
    const index = bookmarks.findIndex(b => b.url === url);
    if (index > -1) {
        bookmarks.splice(index, 1);
    } else {
        bookmarks.unshift({ url, title: title || url });
    }
    localStorage.setItem('xpider-bookmarks', JSON.stringify(bookmarks));
    updateBookmarkIcon();
    if (!overlayPanel.classList.contains('hidden') && currentPanelTab === 'bookmarks') {
        renderOverlayPanel('bookmarks');
    }
}

function updateBookmarkIcon() {
    const url = webview.getURL();
    const isBookmarked = bookmarks.some(b => b.url === url);
    if (isBookmarked) {
        bookmarkBtn.classList.add('active');
        bookmarkBtn.textContent = '★';
    } else {
        bookmarkBtn.classList.remove('active');
        bookmarkBtn.textContent = '☆';
    }
}

function renderOverlayPanel(tab) {
    currentPanelTab = tab;
    panelList.innerHTML = '';
    const items = tab === 'history' ? history : bookmarks;
    
    panelTabs.forEach(t => t.classList.toggle('active', t.getAttribute('data-tab') === tab));
    clearHistoryBtn.classList.toggle('hidden', tab === 'bookmarks');

    if (items.length === 0) {
        panelList.innerHTML = `<div style="text-align:center; color:var(--text-dim); padding:40px;">Empty</div>`;
        return;
    }

    items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'panel-item';
        div.innerHTML = `
            <div class="item-title">${item.title}</div>
            <div class="item-url">${item.url}</div>
        `;
        div.onclick = () => {
            webview.src = item.url;
            overlayPanel.classList.add('hidden');
        };
        panelList.appendChild(div);
    });
}

bookmarkBtn.onclick = (e) => {
    e.stopPropagation();
    toggleBookmark();
};

historyBtn.onclick = (e) => {
    e.stopPropagation();
    if (!overlayPanel.classList.contains('hidden') && currentPanelTab === 'history') {
        overlayPanel.classList.add('hidden');
    } else {
        renderOverlayPanel('history');
        overlayPanel.classList.remove('hidden');
        settingsMenu.classList.add('hidden');
    }
};

panelTabs.forEach(tab => {
    tab.onclick = () => renderOverlayPanel(tab.getAttribute('data-tab'));
});

clearHistoryBtn.onclick = () => {
    if (confirm('Clear all history?')) {
        history = [];
        localStorage.setItem('xpider-history', JSON.stringify(history));
        renderOverlayPanel('history');
    }
};

// 익스텐션 로드
window.electronAPI.on('extensions_loaded', (extensions) => {
    extensionsBar.innerHTML = '';
    extensions.forEach((ext) => {
        const item = document.createElement('div');
        item.className = 'ext-item';
        const btn = document.createElement('button');
        btn.className = 'ext-btn';
        const iconUrl = `chrome-extension://${ext.id}/${ext.icon}`;
        const img = new Image();
        img.src = iconUrl;
        img.onload = () => btn.style.backgroundImage = `url('${iconUrl}')`;
        img.onerror = () => btn.style.backgroundImage = `url('assets/icon.png')`;
        btn.title = ext.name;

        const balloon = document.createElement('div');
        balloon.className = 'snapshot-balloon';
        const previewSrc = ext.name.toLowerCase().includes('collect') ? 'assets/previews/collect-list-preview.png' : 'assets/previews/send-message-preview.png';
        balloon.innerHTML = `<div class="preview-title">${ext.name}</div><img src="${previewSrc}" class="preview-img">`;

        btn.onclick = () => {
            if (currentExtensionId === ext.id) {
                sidePanel.classList.toggle('hidden');
            } else {
                currentExtensionId = ext.id;
                extensionWebview.src = `chrome-extension://${ext.id}/popup.html`;
                sidePanel.classList.remove('hidden');
            }
        };
        item.appendChild(btn); item.appendChild(balloon); extensionsBar.appendChild(item);
    });
    setTimeout(() => { if (startLangSetup()) startOnboarding(); }, 1000);
});

function navigate() {
    let url = addressBar.value.trim();
    if (!url) return;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        if (url.includes('.') && !url.includes(' ')) url = 'https://' + url;
        else url = 'https://www.google.com/search?q=' + encodeURIComponent(url);
    }
    webview.src = url;
}

addressBar.addEventListener('keypress', (e) => { if (e.key === 'Enter') navigate(); });
backBtn.addEventListener('click', () => { if (webview.canGoBack()) webview.goBack(); });
forwardBtn.addEventListener('click', () => { if (webview.canGoForward()) webview.goForward(); });
reloadBtn.addEventListener('click', () => { webview.reload(); });

webview.addEventListener('did-start-loading', () => { reloadBtn.textContent = '✕'; });
webview.addEventListener('did-stop-loading', () => {
    reloadBtn.textContent = '↻';
    addressBar.value = webview.getURL();
    addHistory(webview.getURL(), webview.getTitle());
    updateBookmarkIcon();
});

window.electronAPI.on('update_available', () => {
    updateNotification.classList.remove('hidden');
    updateMsg.textContent = 'New version available. Downloading...';
});

window.electronAPI.on('update_downloaded', () => {
    updateNotification.classList.remove('hidden');
    updateMsg.textContent = 'Update ready. Restart now?';
    restartBtn.classList.remove('hidden');
});

restartBtn.addEventListener('click', () => window.electronAPI.send('restart_app'));
document.getElementById('check-update-btn').onclick = () => {
    window.electronAPI.send('check-for-updates');
    alert('Checking for updates...');
};

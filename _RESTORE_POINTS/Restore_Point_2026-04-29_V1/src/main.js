const { app, BrowserWindow, session, ipcMain, shell, webContents, dialog, Menu, MenuItem, clipboard } = require('electron');
const path = require('path');
const fs   = require('fs');
const log  = require('electron-log');

// ─── 아이콘 경로 ──────────────────────────────────────────────
const ICON_PATH = path.join(__dirname, '..', 'assets', 'icons', 'win', 'icon.ico');
const ICON_PNG  = path.join(__dirname, 'assets', 'icon.png');

// ─── 프로토콜 등록 ───────────────────────────────────────────
const { protocol } = require('electron');
protocol.registerSchemesAsPrivileged([
  { scheme: 'chrome-extension', privileges: { standard: true, secure: true, corsEnabled: true, supportFetchAPI: true } }
]);

// ─── Chromium 스위치 (구글 맵 드래그 및 성능 최적화) ─────────────
app.commandLine.appendSwitch('disable-features', 'TouchpadAndWheelScrollLatching,AsyncWheelEvents');
app.commandLine.appendSwitch('disable-touch-adjustment');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('ignore-gpu-blocklist');

// --- Multi-Instance / Profile Support (Portable Isolation) ---
const profileArg = process.argv.find(a => a.startsWith('--profile='));
const profileId  = profileArg ? profileArg.split('=')[1] : '1';

// Use data folder relative to executable (Portable Isolation)
const getPortableDataPath = () => {
  const baseDir = app.isPackaged 
    ? path.dirname(app.getPath('exe')) 
    : path.join(__dirname, '..');
  
  const dataDir = path.join(baseDir, 'data', `profile-${profileId}`);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  return dataDir;
};

app.setPath('userData', getPortableDataPath());
log.info(`[Portable] UserData Path: ${app.getPath('userData')}`);


// ─── 윈도우 핸들 ──────────────────────────────────────────────
let splashWindow = null;
let loginWindow  = null;
let loadedExtensionsInfo = [];
let lastActiveTabByWindow = {}; // Cache active tab per windowId

// ─── 전역 실시간 로그 링버퍼 ──────────────────────────────────
const LOG_RING_SIZE = 500;
const logRingBuffer = [];

// ─── 원본 console 함수 먼저 저장 (xLog보다 앞에 위치해야 순환 참조 방지) ────
const _origLog = console.log;
const _origErr = console.error;

function xLog(level, source, ...args) {
    const entry = {
        t: new Date().toISOString().slice(11, 23), // HH:MM:SS.mmm
        level,
        source,
        msg: args.map(a => {
            if (typeof a === 'object') { try { return JSON.stringify(a); } catch(e) { return String(a); } }
            return String(a);
        }).join(' ')
    };
    if (logRingBuffer.length >= LOG_RING_SIZE) logRingBuffer.shift();
    logRingBuffer.push(entry);
    // 원본 console 함수 사용 → 오버라이드된 console.error/log 호출 금지 (순환 재귀 방지)
    if (level === 'ERROR') _origErr(`[${entry.source}] ${entry.msg}`);
    else _origLog(`[${entry.source}] ${entry.msg}`);
    // Forward to all renderer windows in real-time
    webContents.getAllWebContents().forEach(wc => {
        try { wc.send('xpider-live-log', entry); } catch(e) {}
    });
}

// Intercept console.log/error to also capture them (xLog 정의 이후에 배치)
console.log = (...args) => { _origLog(...args); xLog('INFO', 'MAIN', ...args); };
console.error = (...args) => { _origErr(...args); xLog('ERROR', 'MAIN', ...args); };


// ─── 스플래시 창 ───────────────────────────────────────────────
function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 460,
    height: 540,
    resizable: false,
    center: true,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    title: 'XPIDER',
    icon: ICON_PNG,
    webPreferences: {
      preload: path.join(__dirname, 'splash-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });
  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
  splashWindow.once('ready-to-show', () => {
    splashWindow.show();
    // 버전 정보 전달
    splashWindow.webContents.send('splash-version', app.getVersion());
  });
  splashWindow.on('closed', () => { splashWindow = null; });
}

// ─── 로그인 창 ───────────────────────────────────────────────
function createLoginWindow() {
  loginWindow = new BrowserWindow({
    width: 480,
    height: 660,
    resizable: false,
    center: true,
    frame: false,
    transparent: true,
    title: 'XPIDER — Sign In',
    icon: ICON_PNG,
    webPreferences: {
      preload: path.join(__dirname, 'login-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });
  loginWindow.loadFile(path.join(__dirname, 'login.html'));
  loginWindow.once('ready-to-show', () => {
    loginWindow.show();
  });
  loginWindow.on('closed', () => { loginWindow = null; });
}

// ─── 메인 브라우저 창 ─────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 700,
    title: `XPIDER Browser${profileId !== '1' ? ` — Profile ${profileId}` : ''}`,
    transparent: true,
    frame: false,
    icon: ICON_PNG,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: true,
      webviewTag: true,
      preload: path.join(__dirname, 'preload.js'),
      spellcheck: false
    },
    show: false,
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Global handler to catch all window.open / target="_blank" from ANY webview or tab
  app.on('web-contents-created', (event, contents) => {
    // 1. Handle New Windows -> Redirect to Tabs
    contents.setWindowOpenHandler(({ url }) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('open-new-tab', url);
      }
      return { action: 'deny' };
    });
    
    // 2. Handle Context Menu (Right Click)
    contents.on('context-menu', (event, params) => {
      const menu = new Menu();
      
      // Navigation
      menu.append(new MenuItem({ label: 'Back', click: () => contents.goBack(), enabled: contents.canGoBack() }));
      menu.append(new MenuItem({ label: 'Forward', click: () => contents.goForward(), enabled: contents.canGoForward() }));
      menu.append(new MenuItem({ label: 'Reload', click: () => contents.reload() }));
      menu.append(new MenuItem({ type: 'separator' }));

      // Link specific
      if (params.linkURL) {
        menu.append(new MenuItem({ label: 'Open link in new tab', click: () => {
          if (mainWindow) mainWindow.webContents.send('open-new-tab', params.linkURL);
        }}));
        menu.append(new MenuItem({ label: 'Copy link address', click: () => clipboard.writeText(params.linkURL) }));
        menu.append(new MenuItem({ type: 'separator' }));
      }

      // Text/Selection specific
      if (params.selectionText) {
        menu.append(new MenuItem({ label: 'Copy', role: 'copy' }));
        menu.append(new MenuItem({ type: 'separator' }));
      }
      if (params.isEditable) {
        menu.append(new MenuItem({ label: 'Paste', role: 'paste' }));
        menu.append(new MenuItem({ type: 'separator' }));
      }

      // Image specific
      if (params.hasImageContents) {
        menu.append(new MenuItem({ label: 'Copy Image', click: () => contents.copyImageAt(params.x, params.y) }));
        menu.append(new MenuItem({ type: 'separator' }));
      }

      // Developer Tools
      menu.append(new MenuItem({ label: 'Inspect Element', click: () => contents.inspectElement(params.x, params.y) }));
      
      menu.popup({ window: mainWindow });
    });
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.send('extensions_loaded', loadedExtensionsInfo);
    mainWindow.webContents.send('profile_id', profileId);
    mainWindow.webContents.send('app_version', app.getVersion());
    mainWindow.webContents.send('app_language', app.getLocale().split('-')[0]);

    // 브라우저 렌더링이 완료된 후 백그라운드 동기화 시작 (약간의 지연시간 추가)
    setTimeout(() => {
      checkAndSyncExtensionsInBackground();
    }, 1500);
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ─── 윈도우 컨트롤 IPC ────────────────────────────────────────
ipcMain.on('window-control', (_, action) => {
  const win = mainWindow;
  if (!win) return;
  if (action === 'minimize') win.minimize();
  else if (action === 'maximize') win.isMaximized() ? win.unmaximize() : win.maximize();
  else if (action === 'close') win.close();
});

// ─── 인증 IPC ─────────────────────────────────────────────────
const authService = require('./auth/auth-service');

ipcMain.handle('auth-login', async (_, { email, password }) =>
  await authService.login(email, password)
);
ipcMain.handle('auth-signup', async (_, { email, password, username }) =>
  await authService.signup(email, password, username)
);
ipcMain.handle('auth-check-session', async () => {
  const s = await authService.getSession();
  return s || null;
});

ipcMain.handle('get-system-logs', async () => {
    try {
        // Gather all webContents info
        const wcs = webContents.getAllWebContents().map(wc => ({
            id: wc.id,
            type: wc.getType(),
            url: (() => { try { return wc.getURL(); } catch(e) { return 'N/A'; } })()
        }));
        
        const info = {
            timestamp: new Date().toISOString(),
            appVersion: app.getVersion(),
            platform: process.platform,
            arch: process.arch,
            uptime: Math.floor(process.uptime()),
            memMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
            activeExtensions: (loadedExtensionsInfo || []).map(e => ({ 
                name: e.name, id: e.id, version: e.version,
                uiPage: e.uiPage || 'popup.html'
            })),
            storageLeads: (extStorage && extStorage.scrapedData) ? extStorage.scrapedData.length : 0,
            cruiserState: {
                isRunning: false, // updated by IPC from renderer
                leadsBeforeCruise: 0
            },
            webContents: wcs,
            windows: BrowserWindow.getAllWindows().length,
            recentLogs: [...logRingBuffer].slice(-200) // last 200 entries
        };
        return info;
    } catch (e) {
        return { error: e.message, stack: e.stack };
    }
});

// ─── 모든 WebContents 콘솔 캡처 리스너 ─────────────────────────
app.on('web-contents-created', (_, wc) => {
    const getType = () => { try { return wc.getType(); } catch(e) { return '?'; } };
    const getUrl = () => { try { return wc.getURL().substring(0, 80); } catch(e) { return '?'; } };

    wc.on('console-message', (e, level, message, line, sourceId) => {
        const lvl = ['LOG','WARN','ERROR','DEBUG'][level] || 'LOG';
        xLog(lvl, `WV:${getType()}`, `${message} (${sourceId?.split('/').pop() || ''}:${line})`);
    });

    wc.on('did-fail-load', (e, code, desc, url) => {
        xLog('ERROR', `WV:${getType()}`, `LOAD FAIL [${code}] ${desc} → ${url}`);
    });

    wc.on('did-navigate', (e, url) => {
        xLog('NAV', `WV:${getType()}`, `→ ${url.substring(0, 100)}`);
    });

    wc.on('did-navigate-in-page', (e, url) => {
        xLog('NAV-SPA', `WV:${getType()}`, `→ ${url.substring(0, 100)}`);
    });

    wc.on('crashed', () => {
        xLog('ERROR', `WV:${getType()}`, `CRASHED at ${getUrl()}`);
    });

    wc.on('unresponsive', () => {
        xLog('WARN', `WV:${getType()}`, `UNRESPONSIVE at ${getUrl()}`);
    });
});

// ─── IPC 메시지 로깅 ─────────────────────────────────────────
ipcMain.on('log-from-renderer', (event, msg) => {
    xLog('UI', 'RENDERER', msg);
});

// auth-success 중복 실행 방지 플래그
let _authSuccessFired = false;

ipcMain.on('auth-success', () => {
  if (_authSuccessFired) return;
  _authSuccessFired = true;
  if (loginWindow) { loginWindow.removeAllListeners('closed'); loginWindow.close(); loginWindow = null; }
  createWindow();
  // 메인 창 로드 후 앱 업데이트 확인
  setTimeout(() => checkAndNotifyAppUpdate(), 3000);
});

ipcMain.on('auth-close-app', () => app.quit());

// ─── 로그아웃 ─────────────────────────────────────────────────
ipcMain.on('auth-logout', async () => {
  const userId = authService.getCurrentUserId();
  await authService.logout(userId);
  if (mainWindow) { mainWindow.removeAllListeners('closed'); mainWindow.close(); mainWindow = null; }
  createLoginWindow();
});

// ─── 앱 종료 전 잠금 해제 ────────────────────────────────────
app.on('before-quit', async (e) => {
  const userId = authService.getCurrentUserId();
  if (userId) {
    e.preventDefault();
    await authService.logout(userId);
    app.exit(0);
  }
});

// ─── 어드민 IPC ───────────────────────────────────────────────
ipcMain.handle('admin-get-all-profiles', async () => authService.getAllProfiles());
ipcMain.handle('admin-set-active', async (_, { userId, isActive }) =>
  authService.setUserActive(userId, isActive)
);
ipcMain.handle('admin-force-logout', async (_, { userId }) =>
  authService.forceLogout(userId)
);

// ─── 업데이트 IPC ─────────────────────────────────────────────
const { checkAppUpdate } = require('./updater');

async function checkAndNotifyAppUpdate() {
  try {
    const result = await checkAppUpdate();
    if (mainWindow && !mainWindow.isDestroyed()) {
      // 사용자가 이미 이 버전을 스킵했다면 팝업 안 띄움
      if (result.hasUpdate) {
        // renderer_ui.js에서 skipVersion 처리를 하므로 그냥 전송
      }
      mainWindow.webContents.send('app-update-result', result);
    }
  } catch (e) {
    log.error('[AppUpdate]', e.message);
  }
}

ipcMain.on('check-for-updates', async () => {
  await checkAndNotifyAppUpdate();
});

// 업데이트 다운로드 링크를 브라우저로 열기
ipcMain.on('open-release-url', (_, url) => {
  if (url) shell.openExternal(url);
});

// 익스텐션 재로드 IPC
ipcMain.on('reload-extensions', async () => {
  loadedExtensionsInfo = await loadExtensions();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('extensions_loaded', loadedExtensionsInfo);
  }
});

// --- 익스텐션 호환성 레이어 IPC (Extension Compatibility Layer) ---
ipcMain.handle('xpider-ext-get-active-tab', async (event) => {
    // Return cached info immediately if available
    const winId = 1; // Assuming single window for now
    if (lastActiveTabByWindow[winId]) {
        return lastActiveTabByWindow[winId];
    }

    if (!mainWindow || mainWindow.isDestroyed()) return null;
    try {
        const tabInfo = await mainWindow.webContents.executeJavaScript(`
            (function() {
                if (typeof window.getActiveWebview !== 'function') return null;
                const wv = window.getActiveWebview();
                if (!wv) return null;
                return {
                    id: typeof wv.getWebContentsId === 'function' ? wv.getWebContentsId() : 999999,
                    windowId: 1,
                    active: true,
                    url: wv.getURL(),
                    title: wv.getTitle()
                };
            })()
        `);
        if (tabInfo) lastActiveTabByWindow[winId] = tabInfo;
        return tabInfo;
    } catch(e) {
        log.error('[ExtBridge] get-active-tab error:', e);
        return null;
    }
});

ipcMain.on('xpider-ext-report-active-tab', (event, tabInfo) => {
    lastActiveTabByWindow[1] = tabInfo;
});

ipcMain.handle('xpider-ext-update-tab', async (event, props) => {
    console.log(`[NAV-TRACE] Received update-tab request for: ${props.url}`);
    if (!mainWindow || mainWindow.isDestroyed()) return null;
    try {
        const startTime = Date.now();
        mainWindow.webContents.send('xpider-renderer-update-active-tab', props);
        console.log(`[NAV-TRACE] Forwarded update-tab to renderer in ${Date.now() - startTime}ms`);
        return { id: 999999, windowId: 1, active: true, url: props.url || '', status: 'loading' };
    } catch(e) {
        log.error('[ExtBridge] update-tab error:', e);
        return null;
    }
});

ipcMain.handle('xpider-ext-create-tab', async (event, props) => {
    if (!mainWindow || mainWindow.isDestroyed()) return null;
    try {
        // In XPIDER, we'll implement this as creating a new webview in the background
        const result = await mainWindow.webContents.executeJavaScript(`
            (async function() {
                if (typeof createBackgroundWebview === 'function') {
                    return await createBackgroundWebview(${JSON.stringify(props)});
                }
                return { id: Date.now(), url: "${props.url || ''}" };
            })()
        `);
        return result;
    } catch(e) {
        log.error('[ExtBridge] create-tab error:', e);
        return { id: Date.now(), url: props.url || '' };
    }
});

ipcMain.on('xpider-ext-notify-tab-updated', (event, data) => {
    // Notify all extension webview contents
    const allWebContents = webContents.getAllWebContents();
    allWebContents.forEach(wc => {
        const url = wc.getURL();
        if (url.startsWith('chrome-extension://')) {
            wc.send('xpider-ext-tab-updated-event', data);
            // onActivated 전용 채널 (onUpdated와 분리하여 중복 수신 방지)
            if (data.changeInfo && data.changeInfo.status === 'complete') {
                wc.send('xpider-ext-tab-activated-event', {
                    tabId: data.tabId,
                    windowId: (data.tab && data.tab.windowId) || 1
                });
            }
        }
    });
});

ipcMain.on('xpider-ext-update-badge', (event, data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('xpider-renderer-update-badge', data);
    }
});

ipcMain.on('log-from-renderer', (event, msg) => {
    console.log(msg);
});

ipcMain.handle('xpider-ext-send-message', async (event, data) => {
    if (!mainWindow || mainWindow.isDestroyed()) return null;
    try {
        const msgJson = JSON.stringify(data.message);
        const result = await mainWindow.webContents.executeJavaScript(`
            (async function() {
                const wv = typeof getActiveWebview === 'function' ? getActiveWebview() : null;
                if (!wv) return null;
                // Dispatch message to the webview via postMessage
                wv.executeJavaScript(\`window.postMessage({ type: 'XPIDER_CONTENT_MSG', message: ${msgJson} }, '*');\`);
                return { success: true };
            })()
        `);
        return result;
    } catch(e) {
        log.error('[ExtBridge] send-message error:', e);
        return null;
    }
});

ipcMain.handle('xpider-ext-get-script', async (event, { extId, scriptPath }) => {
    try {
        const ext = loadedExtensionsInfo.find(e => e.id === extId);
        if (!ext) return null;
        const fullPath = path.join(ext.path, scriptPath);
        if (fs.existsSync(fullPath)) {
            return fs.readFileSync(fullPath, 'utf8');
        }
        return null;
    } catch(e) {
        log.error('[ExtBridge] get-script error:', e);
        return null;
    }
});

// ─── EXTENSION STORAGE EMULATION ───────────────────────────
let extStorage = {};
const storagePath = path.join(app.getPath('userData'), 'extension-storage.json');
if (fs.existsSync(storagePath)) {
    try { extStorage = JSON.parse(fs.readFileSync(storagePath, 'utf8')); } catch(e) {}
}

function saveExtStorage() {
    try { fs.writeFileSync(storagePath, JSON.stringify(extStorage, null, 2)); } catch(e) {}
}

ipcMain.handle('xpider-ext-storage-get', async (event, { keys }) => {
    if (!keys) return extStorage;
    if (typeof keys === 'string') return { [keys]: extStorage[keys] };
    if (Array.isArray(keys)) {
        const res = {};
        keys.forEach(k => { if (extStorage[k] !== undefined) res[k] = extStorage[k]; });
        return res;
    }
    return extStorage;
});

ipcMain.handle('xpider-ext-storage-set', async (event, { items }) => {
    const changes = {};
    for (const [key, val] of Object.entries(items)) {
        changes[key] = { oldValue: extStorage[key], newValue: val };
        extStorage[key] = val;
    }
    saveExtStorage();
    // Broadcast change to all webContents
    const all = webContents.getAllWebContents();
    all.forEach(wc => {
        try { wc.send('xpider-ext-storage-changed', changes); } catch(e) {}
    });
    return { success: true };
});

ipcMain.handle('xpider-ext-storage-remove', async (event, { keys }) => {
    if (!keys) return { success: true };
    const changes = {};
    const keyList = Array.isArray(keys) ? keys : [keys];
    keyList.forEach(k => {
        changes[k] = { oldValue: extStorage[k], newValue: undefined };
        delete extStorage[k];
    });
    saveExtStorage();
    // Broadcast change to all webContents
    const all = webContents.getAllWebContents();
    all.forEach(wc => {
        try { wc.send('xpider-ext-storage-changed', changes); } catch(e) {}
    });
    return { success: true };
});

ipcMain.handle('xpider-ext-storage-clear', async () => {
    extStorage = {};
    saveExtStorage();
    return { success: true };
});

// ─── RUNTIME MESSAGE RELAY (Content -> Sidepanel) ───────────
ipcMain.handle('xpider-ext-runtime-send-message', async (event, { message }) => {
    if (!message) return { success: false };
    
    // 1. Handle Business Data
    if (message.action === 'foundBusiness' && message.data) {
        const biz = message.data;
        if (!extStorage.scrapedData) extStorage.scrapedData = [];
        
        // Prevent duplicates using placeId (preferred) or name+address
        const exists = extStorage.scrapedData.some(b => 
            (biz.placeId && b.placeId === biz.placeId) || 
            (b.name === biz.name && b.address === biz.address)
        );

        if (!exists) {
            const lead = {
                ...biz,
                id: Date.now() + Math.random().toString(36).substring(2, 9),
                email: biz.email || 'Pending Stage 2',
                status: 'captured'
            };
            extStorage.scrapedData.push(lead);
            saveExtStorage();
            
            // Broadcast storage change to all webContents (sidepanel will react)
            const changes = { scrapedData: { oldValue: null, newValue: extStorage.scrapedData } };
            const all = webContents.getAllWebContents();
            all.forEach(wc => {
                try { wc.send('xpider-ext-storage-changed', changes); } catch(e) {}
            });
        }
    }
    
    // ── CLEAR DATA ──
    if (message.action === 'clearData') {
        log.info('[ExtBridge] clearData received — wiping ALL data');
        extStorage.scrapedData = [];
        const clearKeys = ['scrapingActive', 'emailCheckActive', 'cruiserActive', 'processedUrls', 'emailProgress'];
        clearKeys.forEach(k => delete extStorage[k]);
        try { fs.writeFileSync(storagePath, JSON.stringify({ scrapedData: [] }, null, 2)); } catch(e) { log.error('[ClearData] File write failed:', e.message); }
        
        const clearChanges = { scrapedData: { oldValue: null, newValue: [] } };
        webContents.getAllWebContents().forEach(wc => {
            try { wc.send('xpider-ext-storage-changed', clearChanges); } catch(e) {}
        });
        log.info('[ClearData] Done — extStorage.scrapedData is now []');
        return { success: true };
    }

    // ── STAGE 2 TRIGGERS: main.js에서 직접 처리 ──
    // (XPIDER 아키텍처상 extension background.js ↔ main.js 직접 IPC 불가)
    if (message.action === 'startEmailCheck') {
        startDeepSearchInMain(message.hl || 'en');
    }
    if (message.action === 'stopEmailCheck') {
        stopDeepSearchInMain();
    }

    
    // 2. Relay message to all other webContents (Sidepanel/Content Scripts)
    const all = webContents.getAllWebContents();
    const senderId = event.sender.id;
    all.forEach(wc => {
        if (wc.id !== senderId) {
            try { wc.send('xpider-ext-runtime-on-message', message); } catch(e) {}
        }
    });

    // 3. Optional: Relay to background workers (if present)
    loadedExtensionsInfo.forEach(ext => {
        try {
            session.defaultSession.extensions.sendMessage(ext.id, message).catch(() => {});
        } catch(e) {}
    });
    
    return { success: true };
});

// Relay for manual polling (legacy/fallback)
ipcMain.handle('relayContentMessage', async (event, { message }) => {
    return { success: true }; 
});

// ─── CRAWL SERVICE: background.js가 chrome.tabs 없이 URL 스캔 요청 ──────
let crawlerWindow = null;

function broadcastToExtension(msg) {
    webContents.getAllWebContents().forEach(wc => {
        try { wc.send('xpider-ext-runtime-on-message', msg); } catch(e) {}
    });
    loadedExtensionsInfo.forEach(ext => {
        try { session.defaultSession.extensions.sendMessage(ext.id, msg).catch(() => {}); } catch(e) {}
    });
}

async function handleCrawlRequest({ url, requestId, waitMs = 5000 }) {
    if (!url || !requestId) return;
    if (!crawlerWindow || crawlerWindow.isDestroyed()) {
        crawlerWindow = new BrowserWindow({
            show: false,
            webPreferences: { nodeIntegration: false, contextIsolation: true }
        });
    }
    try {
        await crawlerWindow.loadURL(url);
        await new Promise(r => setTimeout(r, Math.max(waitMs, 3000)));
        const isReady = await crawlerWindow.webContents.executeJavaScript('document.readyState').catch(() => 'complete');
        if (isReady !== 'complete') await new Promise(r => setTimeout(r, 2000));

        const result = await crawlerWindow.webContents.executeJavaScript(`
            (function() {
                const text = document.body ? document.body.innerText : '';
                const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}/g;
                const rawEmails = text.match(emailRegex) || [];
                const emails = [...new Set(rawEmails)].filter(e =>
                    !e.includes('sentry') && !e.includes('example') &&
                    !e.includes('.png') && !e.includes('.jpg') &&
                    !e.includes('wixpress') && !e.includes('schema') &&
                    !e.match(/\\.(gif|svg|ico|css|js)$/i)
                );
                const phoneRegex = /[\\(]?\\+?[0-9]{1,3}[\\)]?[\\s\\-\\.]?[\\(]?[0-9]{3}[\\)]?[\\s\\-\\.]?[0-9]{3,4}[\\s\\-\\.]?[0-9]{3,4}/g;
                const phones = text.match(phoneRegex) || [];
                const koAddressRegex = /([가-힣]+(?:특별시|광역시|특별자치시|도|특별자치도)\\s*[가-힣]+(?:시|군|구)\\s*[가-힣0-9\\-\\s]+(?:로|길|대로|가)\\s*\\d+[가-힣0-9\\-\\s,]*)/;
                // Canada(A1A 1A1) + USA(12345) + general street address
                const enAddressRegex = /\\d{1,5}[,\s]+[A-Za-z0-9\s.]+(?:Avenue|Ave|Street|St|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Way|Court|Ct|Plaza|Square|Suite|Ste|Unit|Boul|Rue|Route)[,\s]+[A-Za-z\s]+[,\s]+(?:[A-Z]{2}[\s,]+[0-9]{5}|[A-Z][0-9][A-Z]\s?[0-9][A-Z][0-9])/gi;

                const koAddr = text.match(koAddressRegex);
                const enAddr = text.match(enAddressRegex);
                const detectedAddress = (koAddr && koAddr[0]) || (enAddr && enAddr[0]) || null;
                let homepage = null;
                const firstOrganic = document.querySelector('div.g a[href^="http"]:not([href*="google.com"]), a[data-ved] h3');
                if (firstOrganic) {
                    const link = firstOrganic.tagName === 'H3' ? firstOrganic.closest('a') : firstOrganic;
                    if (link && link.href && !link.href.includes('google.com')) homepage = link.href;
                }
                if (!homepage) {
                    const cite = document.querySelector('cite');
                    if (cite) {
                        const t = cite.innerText.split(' ')[0].split(' ›')[0];
                        if (t.includes('.') && !t.includes('google.com')) homepage = t.startsWith('http') ? t : 'https://' + t;
                    }
                }
                const contactPathSegments = ['contact','about','reach-us','reach_us','get-in-touch','get_in_touch','enquiry','inquiry','contactus','contact-us','aboutus','about-us','연락처','오시는길','고객센터','문의','찾아오시는','kontakt','impressum','nous-contacter','contacto','contact_us'];
                const productBlockList = ['contact-lens','contact-lense','contact_lens','touch-screen','touchscreen','connect2go','connected','connection','connections','connector','contactless'];
                let contactLinks = [];
                document.querySelectorAll('a').forEach(a => {
                    const href = (a.href || '');
                    const aText = (a.innerText || '').trim().toLowerCase();
                    if (!href.startsWith('http')) return;
                    if (productBlockList.some(b => href.toLowerCase().includes(b))) return;
                    let urlPath = ''; try { urlPath = new URL(href).pathname.toLowerCase(); } catch(e) { return; }
                    const segs = urlPath.split('/').filter(Boolean);
                    const matchesPath = contactPathSegments.some(kw => segs.some(s => s === kw || s.startsWith(kw+'-') || s.endsWith('-'+kw)));
                    const matchesText = ['contact','about us','about','문의','연락처','오시는길','kontakt','contactez','get in touch'].some(kw => aText === kw || aText.startsWith(kw));
                    if (matchesPath || matchesText) contactLinks.push(a.href);
                });
                const socialDomains = ['facebook.com','instagram.com','twitter.com','x.com','linkedin.com','youtube.com','tiktok.com'];
                const socialBlock = ['/embed/','/share/','shoutout.wix','intent/tweet','platform.twitter','/hashtag/','embed?','?v='];
                const socialLinks = [];
                document.querySelectorAll('a').forEach(a => {
                    const href = a.href || '';
                    if (!socialDomains.some(d => href.includes(d))) return;
                    if (socialBlock.some(b => href.includes(b))) return;
                    try { const u = new URL(href); if (u.pathname.split('/').filter(Boolean).length >= 1) socialLinks.push(href); } catch(e) {}
                });
                return {
                    emails: emails.join(', '),
                    phone: phones.find(p => p && p.replace(/\\D/g,'').length >= 7) || null,
                    address: detectedAddress, homepage,
                    socials: [...new Set(socialLinks)].slice(0, 8),
                    contactLinks: [...new Set(contactLinks)].slice(0, 3)
                };
            })();
        `).catch(() => ({}));

        broadcastToExtension({ action: 'CRAWL_RESULT', requestId, result: result || {} });
    } catch(e) {
        log.error('[CrawlService] Failed:', url, e.message);
        broadcastToExtension({ action: 'CRAWL_RESULT', requestId, result: {} });
    }
}
// ─── STAGE 2: 수집 엔진 (main.js BrowserWindow 방식) ─────────────────────
let isDeepSearching = false;
let deepSearchCancel = false;

function broadcastExtMessage(msg) {
    webContents.getAllWebContents().forEach(wc => {
        try { wc.send('xpider-ext-runtime-on-message', msg); } catch(e) {}
    });
}

function broadcastStorageUpdate() {
    saveExtStorage();
    const changes = { scrapedData: { oldValue: null, newValue: extStorage.scrapedData } };
    webContents.getAllWebContents().forEach(wc => {
        try { wc.send('xpider-ext-storage-changed', changes); } catch(e) {}
    });
}

async function scanPageInCrawler(url, waitMs = 5000) {
    if (!crawlerWindow || crawlerWindow.isDestroyed()) {
        crawlerWindow = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false, contextIsolation: true } });
    }
    try {
        await crawlerWindow.loadURL(url);
        await new Promise(r => setTimeout(r, Math.max(waitMs, 3000)));
        const isReady = await crawlerWindow.webContents.executeJavaScript('document.readyState').catch(() => 'complete');
        if (isReady !== 'complete') await new Promise(r => setTimeout(r, 2000));
        const result = await crawlerWindow.webContents.executeJavaScript(`
            (function() {
                const text = document.body ? document.body.innerText : '';
                const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}/g;
                const rawEmails = text.match(emailRegex) || [];
                const emails = [...new Set(rawEmails)].filter(e =>
                    !e.includes('sentry') && !e.includes('example') && !e.includes('.png') &&
                    !e.includes('.jpg') && !e.includes('wixpress') && !e.includes('schema') &&
                    !e.match(/\\.(gif|svg|ico|css|js)$/i)
                );
                const phoneRegex = /[\\(]?\\+?[0-9]{1,3}[\\)]?[\\s\\-\\.]?[\\(]?[0-9]{3}[\\)]?[\\s\\-\\.]?[0-9]{3,4}[\\s\\-\\.]?[0-9]{3,4}/g;
                const phones = text.match(phoneRegex) || [];
                const koAddr = text.match(/([가-힣]+(?:특별시|광역시|특별자치시|도|특별자치도)\\s*[가-힣]+(?:시|군|구)\\s*[가-힣0-9\\-\\s]+(?:로|길|대로|가)\\s*\\d+[가-힣0-9\\-\\s,]*)/);
                // 캐나다(A1A 1A1) + 미국(12345) + 일반 번지 주소
                const enAddr = text.match(/\\d{1,5}[,\\s]+[A-Za-z0-9\\s.'-]+(?:Avenue|Ave|Street|St|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Way|Court|Ct|Plaza|Square|Suite|Ste|Unit|Boul|Blvd|Rue|Route)[,\\s]+[A-Za-z\\s]+[,\\s]+(?:[A-Z]{2}[\\s,]+(?:[0-9]{5}|[A-Z][0-9][A-Z]\\s?[0-9][A-Z][0-9])|[A-Z][0-9][A-Z]\\s?[0-9][A-Z][0-9])/gi);
                const detectedAddress = (koAddr && koAddr[0]) || (enAddr && enAddr[0]) || null;
                let homepage = null;
                const og = document.querySelector('div.g a[href^="http"]:not([href*="google.com"])');
                if (og && og.href && !og.href.includes('google.com')) homepage = og.href;
                if (!homepage) { const cite = document.querySelector('cite'); if (cite) { const t = cite.innerText.split(' ')[0].split(' >')[0]; if (t.includes('.') && !t.includes('google.com')) homepage = t.startsWith('http') ? t : 'https://' + t; } }
                const cPS = ['contact','about','reach-us','reach_us','get-in-touch','get_in_touch','enquiry','inquiry','contactus','contact-us','aboutus','about-us','연락처','오시는길','고객센터','문의','찾아오시는','kontakt','impressum','nous-contacter','contacto','contact_us'];
                const pBL = ['contact-lens','contact-lense','contact_lens','touch-screen','touchscreen','connect2go','connected','connection','connections','connector','contactless'];
                let contactLinks = [];
                document.querySelectorAll('a').forEach(a => {
                    const href = (a.href || ''), aText = (a.innerText || '').trim().toLowerCase();
                    if (!href.startsWith('http') || pBL.some(b => href.toLowerCase().includes(b))) return;
                    let up = ''; try { up = new URL(href).pathname.toLowerCase(); } catch(e) { return; }
                    const segs = up.split('/').filter(Boolean);
                    const mp = cPS.some(kw => segs.some(s => s === kw || s.startsWith(kw+'-') || s.endsWith('-'+kw)));
                    const mt = ['contact','about us','about','문의','연락처','오시는길','kontakt','contactez','get in touch'].some(kw => aText === kw || aText.startsWith(kw));
                    if (mp || mt) contactLinks.push(a.href);
                });
                const sD = ['facebook.com','instagram.com','twitter.com','x.com','linkedin.com','youtube.com','tiktok.com'];
                const sB = ['/embed/','/share/','shoutout.wix','intent/tweet','platform.twitter','/hashtag/','embed?','?v='];
                const socialLinks = [];
                document.querySelectorAll('a').forEach(a => {
                    const href = a.href || '';
                    if (!sD.some(d => href.includes(d)) || sB.some(b => href.includes(b))) return;
                    try { const u = new URL(href); if (u.pathname.split('/').filter(Boolean).length >= 1) socialLinks.push(href); } catch(e) {}
                });
                return { emails: emails.join(', '), phone: phones.find(p => p && p.replace(/\\D/g,'').length >= 7) || null, address: detectedAddress, homepage, socials: [...new Set(socialLinks)].slice(0,8), contactLinks: [...new Set(contactLinks)].slice(0,3) };
            })();
        `).catch(() => ({}));
        return result || {};
    } catch(e) { log.error('[Crawler] scan failed:', e.message); return {}; }
}

async function startDeepSearchInMain(hl = 'en') {
    const sendLog = (msg) => { console.log(`[STAGE2] ${msg}`); broadcastExtMessage({ action: 'log', message: `[STAGE2] ${msg}` }); };
    if (isDeepSearching) { sendLog('Already running.'); return; }
    isDeepSearching = true; deepSearchCancel = false;
    sendLog('Discovery Engine Started.');
    try { if (fs.existsSync(storagePath)) { const f = JSON.parse(fs.readFileSync(storagePath,'utf8')); if (Array.isArray(f.scrapedData)) extStorage.scrapedData = f.scrapedData; } } catch(e) {}
    if (!extStorage.scrapedData) extStorage.scrapedData = [];
    const leads = extStorage.scrapedData.filter(b => b.status === 'captured' || b.email === 'Pending Stage 2' || !b.status);
    sendLog(`Found ${leads.length} leads to process.`);
    if (leads.length === 0) { isDeepSearching = false; broadcastExtMessage({ action: 'emailCheckStatus', total: 0, current: 0, finished: true }); return; }
    broadcastExtMessage({ action: 'emailCheckStatus', total: leads.length, current: 0 });
    let count = 0;
    for (const lead of leads) {
        if (deepSearchCancel) { sendLog('Cancelled.'); break; }
        count++;
        sendLog(`[${count}/${leads.length}] Processing: ${lead.name}`);
        try {
            let url = (lead.website && lead.website !== 'N/A') ? lead.website : null;
            if (!url) {
                broadcastExtMessage({ action: 'emailCheckStatus', total: leads.length, current: count, stage: 1, statusText: `Searching: ${lead.name}` });
                const q = hl === 'ko' ? `${lead.name} 홈페이지 이메일` : `${lead.name} official website contact email`;
                const enrich = await scanPageInCrawler(`https://www.google.com/search?q=${encodeURIComponent(q)}&hl=${hl}`, 3000);
                if (enrich.homepage && !enrich.homepage.includes('google.com')) {
                    url = enrich.homepage;
                    if (enrich.phone && (!lead.phone || lead.phone === 'N/A')) lead.phone = enrich.phone;
                }
            }
            if (!url || url.includes('google.com')) { lead.email = 'No Website'; lead.status = 'complete'; broadcastStorageUpdate(); continue; }
            broadcastExtMessage({ action: 'emailCheckStatus', total: leads.length, current: count, stage: 2, statusText: `Opening: ${lead.name}` });
            sendLog(`[STEP 2] Loading homepage: ${url}`);
            const home = await scanPageInCrawler(url, 4000);
            sendLog(`Homepage: Emails(${home.emails?home.emails.split(',').filter(e=>e.trim()).length:0}), Contacts(${(home.contactLinks||[]).length}), Socials(${(home.socials||[]).length})`);
            let emails = home.emails ? home.emails.split(', ').filter(e=>e) : [];
            let phone = home.phone || null, address = home.address || null, socials = [...(home.socials||[])];
            for (const cUrl of [...new Set(home.contactLinks||[])].slice(0,3)) {
                if (deepSearchCancel) break;
                sendLog(`  -> Scanning contact: ${cUrl}`);
                broadcastExtMessage({ action: 'emailCheckStatus', total: leads.length, current: count, stage: 3, statusText: `Contact: ${lead.name}` });
                const cs = await scanPageInCrawler(cUrl, 3500);
                if (cs.emails) emails = [...new Set([...emails, ...cs.emails.split(', ').filter(e=>e)])];
                if (!phone && cs.phone) phone = cs.phone;
                if (!address && cs.address) address = cs.address;
                if (cs.socials?.length) socials = [...new Set([...socials, ...cs.socials])];
            }
            lead.email = [...new Set(emails)].filter(e=>e).join(', ') || 'Not Found';
            if (phone && (!lead.phone || lead.phone === 'N/A')) lead.phone = phone;
            if (address && (!lead.address || lead.address === 'N/A')) lead.address = address;
            if (socials.length > 0) { const ex = lead.social ? lead.social.split(', ') : []; lead.social = [...new Set([...ex,...socials])].join(', '); }
            lead.status = 'complete';
            broadcastStorageUpdate();
            broadcastExtMessage({ action: 'emailCheckStatus', total: leads.length, current: count });
            sendLog(`[DONE] ${lead.name}`);
        } catch(e) { sendLog(`ERROR: ${lead.name}: ${e.message}`); }
        await new Promise(r => setTimeout(r, 500));
    }
    isDeepSearching = false;
    sendLog('Discovery Engine Finished.');
    broadcastExtMessage({ action: 'emailCheckStatus', total: leads.length, current: count, finished: true });
}

function stopDeepSearchInMain() {
    deepSearchCancel = true;
    isDeepSearching = false;
    log.info('[Stage2] Stopped by user.');
}




ipcMain.handle('xpider-ext-save-file', async (event, data) => {
    if (!mainWindow || mainWindow.isDestroyed()) return null;
    try {
        const { filePath } = await dialog.showSaveDialog(mainWindow, {
            defaultPath: data.filename || 'download.txt',
            title: 'Save Exported Leads'
        });
        
        if (filePath) {
            fs.writeFileSync(filePath, data.content);
            return { success: true, path: filePath };
        }
        return { success: false, cancelled: true };
    } catch(e) {
        log.error('[ExtBridge] save-file error:', e);
        return { success: false, error: e.message };
    }
});

ipcMain.handle('xpider-ext-execute-script', async (event, injection) => {
    if (!mainWindow || mainWindow.isDestroyed()) return null;
    let codeToExecute = '';
    
    if (injection.resolvedFileUrls && injection.resolvedFileUrls.length > 0) {
        for (const fileUrl of injection.resolvedFileUrls) {
            try {
                const response = await fetch(fileUrl);
                codeToExecute += await response.text() + '\n';
            } catch (e) {
                log.error("[ExtBridge] Fetch extension file error:", fileUrl, e);
            }
        }
    } else if (injection.code) {
        codeToExecute = injection.code;
    } else if (injection.funcString) {
        const argsStr = injection.args ? JSON.stringify(injection.args) : '[]';
        codeToExecute = `(${injection.funcString}).apply(null, ${argsStr})`;
    }

    if (codeToExecute) {
        try {
            const targetId = injection.target ? injection.target.tabId : null;
            const result = await mainWindow.webContents.executeJavaScript(`
                (async function() {
                    let wv = null;
                    if (${targetId} && typeof getWebviewById === 'function') {
                        wv = getWebviewById(${targetId});
                    } else {
                        wv = typeof getActiveWebview === 'function' ? getActiveWebview() : null;
                    }
                    if (!wv) return null;
                    try {
                        return await wv.executeJavaScript(${JSON.stringify(codeToExecute)});
                    } catch(e) {
                        return null;
                    }
                })()
            `);
            return result;
        } catch (e) {
            log.error("[ExtBridge] execution error in webview:", e);
            return null;
        }
    }
    return null;
});

// 익스텐션 진행 상황을 스플래시/renderer 모두에 전달하는 헬퍼
function sendExtProgress(msg) {
  // 스플래시가 열려있으면 스플래시에 표시
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.send('splash-progress', msg);
  }
  // 메인 창이 열려있으면 토스트로도 표시
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('ext-sync-progress', msg);
  }
}

// ─── 익스텐션 로드 시스템 ─────────────────────────────────────
const { syncExtensionsFromGitHub } = require('./updater');

function getExtDir() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'extensions')
    : path.join(__dirname, '..', 'extensions');
}


async function loadLocalExtensions() {
  try {
    const extDir = getExtDir();
    if (!fs.existsSync(extDir)) fs.mkdirSync(extDir, { recursive: true });

    // 개발모드 직접 편집: extensions/ 폴더를 직접 작업 위치로 사용
    // (syncLocalExtensions 불필요 — browser/extensions/ 폴더에서 바로 편집)

    // 2. 로컬 폴더 스캔 → 브라우저에 로드
    const results = [];
    const entries = fs.readdirSync(extDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const extPath = path.join(extDir, entry.name);
      const manifestPath = path.join(extPath, 'manifest.json');
      if (!fs.existsSync(manifestPath)) continue;

      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        let iconFile = 'icons/icon128.png';
        if (manifest.icons) {
          iconFile = manifest.icons['48'] || manifest.icons['128'] ||
                     manifest.icons['64'] || Object.values(manifest.icons)[0];
        }

        let defaultUiPage = 'popup.html'; // Default fallback
        if (manifest.side_panel && manifest.side_panel.default_path) {
            defaultUiPage = manifest.side_panel.default_path;
        } else if (manifest.action && manifest.action.default_popup) {
            defaultUiPage = manifest.action.default_popup;
        } else if (manifest.browser_action && manifest.browser_action.default_popup) {
            defaultUiPage = manifest.browser_action.default_popup;
        }

        // ── 아이콘을 Base64로 로드 (사이드바에서 안정적으로 표시하기 위함) ──
        let iconBase64 = null;
        try {
            const fullIconPath = path.join(extPath, iconFile);
            if (fs.existsSync(fullIconPath)) {
                const iconBuf = fs.readFileSync(fullIconPath);
                iconBase64 = `data:image/png;base64,${iconBuf.toString('base64')}`;
            }
        } catch (err) {
            log.error(`[Extensions] Icon load error (${entry.name}):`, err.message);
        }

        const ext = await session.defaultSession.extensions.loadExtension(extPath, { allowFileAccess: true });
        results.push({
          id:      ext.id,
          name:    manifest.name || entry.name,
          icon:    iconFile,
          iconData: iconBase64,
          version: manifest.version || '1.0.0',
          path:    extPath,
          manifest: manifest,
          uiPage:  defaultUiPage
        });
        log.info(`[Extensions] Loaded: ${manifest.name} v${manifest.version}`);
      } catch (e) {
        log.error(`[Extensions] Failed to load ${entry.name}:`, e.message);
      }
    }
    return results;
  } catch (e) {
    log.error('[Extensions] loadLocalExtensions error:', e.message);
    return [];
  }
}

// 브라우저가 열린 후 백그라운드에서 실행될 동기화 함수
async function checkAndSyncExtensionsInBackground() {
  try {
    const extDir = getExtDir();
    // 익스텐션 버전을 확인 중이라는 것을 알려줌 (토스트 팝업)
    sendExtProgress('🔄 Checking extension versions from GitHub...');

    const syncResult = await syncExtensionsFromGitHub(extDir, (msg) => {
      sendExtProgress(msg);
      log.info('[Extensions]', msg);
    });

    const hasUpdates = syncResult.updated.length > 0;
    const hasInstalls = syncResult.installed.length > 0;

    if (hasUpdates || hasInstalls) {
      let msgParts = [];
      if (hasInstalls) msgParts.push(`설치: ${syncResult.installed.join(', ')}`);
      if (hasUpdates) msgParts.push(`업데이트: ${syncResult.updated.join(', ')}`);
      sendExtProgress(`✅ Done (${msgParts.join(' / ')}), applying...`);
      log.info(`[Extensions] Sync complete: ${msgParts.join(' / ')}`);

      // 변경사항이 있으므로 로컬 익스텐션을 다시 로드하고 화면에 반영
      loadedExtensionsInfo = await loadLocalExtensions();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('extensions_loaded', loadedExtensionsInfo);
        sendExtProgress('🚀 Extensions applied to sidebar successfully!');
      }
    } else {
      sendExtProgress('✅ All extensions are up to date.');
    }
  } catch (e) {
    log.error('[Extensions] Background sync error:', e.message);
  }
}

// ─── 메인 브라우저 창 ─────────────────────────────────────────
// (참고: 상단의 createWindow 함수 내부 이벤트 로직에서 checkAndSyncExtensionsInBackground() 호출을 위해 추가 처리)
ipcMain.on('trigger-background-sync', () => {
  checkAndSyncExtensionsInBackground();
});

// ─── 앱 시작 ──────────────────────────────────────────────────
app.whenReady().then(async () => {
  // --- 익스텐션 브릿지 주입 (Extension Compatibility Layer) ---
  session.defaultSession.setPreloads([path.join(__dirname, 'ext-preload.js')]);

  // 1. 스플래시 창 먼저 표시
  createSplashWindow();

  // 스플래시가 화면에 뜨도록 약간 대기
  await new Promise(resolve => setTimeout(resolve, 800));

  // 2. 로컬 익스텐션 빠르게 로드
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.send('splash-progress', 'Loading local extensions...');
  }
  loadedExtensionsInfo = await loadLocalExtensions();

  // 3. 로그인 창 표시 후 스플래시 닫기
  createLoginWindow();
  await new Promise(resolve => setTimeout(resolve, 400));
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createLoginWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

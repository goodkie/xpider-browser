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
    if (!mainWindow || mainWindow.isDestroyed()) return { id: Date.now(), url: props.url || '' };
    try {
        const url = props.url || 'about:blank';
        const makeActive = (props.active !== false);
        const propsJson = JSON.stringify({ url, makeActive });
        const result = await mainWindow.webContents.executeJavaScript(
            `(async function() {
                const p = ${propsJson};
                if (p.makeActive && typeof createNewTab === 'function') {
                    // [v1.1.2] 사용자에게 보이는 실제 탭 생성
                    createNewTab(p.url, true);
                    await new Promise(r => setTimeout(r, 600));
                    const wv = window.getActiveWebview ? window.getActiveWebview() : null;
                    const realId = (wv && typeof wv.getWebContentsId === 'function') ? wv.getWebContentsId() : Date.now();
                    const tabUIId = window.tabs && window.tabs.length > 0 ? window.tabs[window.tabs.length - 1].id : null;
                    if (tabUIId) window.__xpiderLastCreatedTabUIId = tabUIId;
                    return { id: realId, tabUIId: tabUIId, url: p.url, status: 'loading', windowId: 1, active: true };
                } else if (typeof createBackgroundWebview === 'function') {
                    return await createBackgroundWebview({ url: p.url, active: false });
                }
                return { id: Date.now(), url: p.url };
            })()`
        );
        return result || { id: Date.now(), url };
    } catch(e) {
        log.error('[ExtBridge] create-tab error:', e);
        return { id: Date.now(), url: props.url || '' };
    }
});

// [v1.1.2] 익스텐션에서 탭 제거 요청 처리 (크롤러 작업 후 탭 닫기)
ipcMain.handle('xpider-ext-tabs-remove', async (event, removeProps) => {
    if (!mainWindow || mainWindow.isDestroyed()) return { success: false };
    try {
        const tabId = removeProps ? removeProps.tabId : null;
        await mainWindow.webContents.executeJavaScript(
            `(async function() {
                const targetId = ${JSON.stringify(tabId)};
                const allWvs = document.querySelectorAll('webview');
                for (const wv of allWvs) {
                    try {
                        const wcId = typeof wv.getWebContentsId === 'function' ? wv.getWebContentsId() : -1;
                        if (wcId == targetId) {
                            const tabUiId = wv.id ? wv.id.replace('webview-', '') : null;
                            if (tabUiId && typeof closeTab === 'function') { closeTab(tabUiId); return 'closed'; }
                        }
                    } catch(e) {}
                }
                if (window.__xpiderLastCreatedTabUIId && typeof closeTab === 'function') {
                    closeTab(window.__xpiderLastCreatedTabUIId);
                    window.__xpiderLastCreatedTabUIId = null;
                    return 'closed-last';
                }
                return 'not-found';
            })()`
        );
        return { success: true };
    } catch(e) {
        log.error('[ExtBridge] tabs-remove error:', e);
        return { success: false };
    }
});

ipcMain.on('xpider-ext-notify-tab-updated', (event, data) => {
    const allWebContents = webContents.getAllWebContents();
    allWebContents.forEach(wc => {
        const url = wc.getURL();
        if (url.startsWith('chrome-extension://')) {
            wc.send('xpider-ext-tab-updated-event', data);
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

// ─── [v1.1.2] XPIDER PAGE SCANNER ──────────────────────────
// 업체당 한 번에 하나의 탭만 열리도록 순차 처리 (캡챠 우회용)
// closeTab을 await로 처리하여 탭이 완전히 닫힌 후 다음 탭이 열림
// ═══════════════════════════════════════════════════════════
// [v1.1.3] XPIDER 탭 큐 — 탭을 반드시 하나씩 열고 닫음
// ipcMain.handle은 병렬 처리 가능하므로 명시적 직렬화 큐 필요
// ═══════════════════════════════════════════════════════════
class XpiderTabQueue {
    constructor() { this._q = Promise.resolve(); }
    run(fn) {
        const result = this._q.then(fn);
        // 에러가 나도 큐가 멈추지 않도록 항상 resolve로 연결
        this._q = result.then(() => {}, () => {});
        return result;
    }
}
const tabQueue = new XpiderTabQueue();

// ─── 탭 헬퍼: 새 탭을 열고 WebContents를 반환 ────────────
async function _openXpiderTab(url, showTab) {
    const urlJson = JSON.stringify(url);
    const tabInfo = await mainWindow.webContents.executeJavaScript(`
        (async function() {
            if (typeof createNewTab !== 'function') return null;
            createNewTab(${urlJson}, ${showTab});
            await new Promise(r => setTimeout(r, 900));
            const tabs = window.tabs || [];
            if (!tabs.length) return null;
            const last = tabs[tabs.length - 1];
            const wv = document.getElementById('webview-' + last.id);
            if (!wv) return { tabUIId: last.id, wcId: null };
            return { tabUIId: last.id, wcId: typeof wv.getWebContentsId === 'function' ? wv.getWebContentsId() : null };
        })()
    `);
    return tabInfo;
}

// ─── 탭 헬퍼: 탭 닫기 (await 보장) ──────────────────────
async function _closeXpiderTab(tabUIId) {
    if (!tabUIId || !mainWindow || mainWindow.isDestroyed()) return;
    await mainWindow.webContents.executeJavaScript(
        `if (typeof closeTab === 'function') closeTab(${JSON.stringify(tabUIId)});`
    ).catch(() => {});
    await new Promise(r => setTimeout(r, 500)); // 탭 완전 종료 대기
}

// ─── 탭 헬퍼: 페이지 로드 완료 대기 ─────────────────────
function _waitForLoad(wc, timeoutMs) {
    return new Promise((resolve) => {
        const t = setTimeout(resolve, timeoutMs);
        if (wc.isLoading()) {
            wc.once('did-finish-load', () => { clearTimeout(t); resolve(); });
            wc.once('did-fail-load',   () => { clearTimeout(t); resolve(); });
        } else { clearTimeout(t); resolve(); }
    });
}

// ─── [v1.1.3] xpider-scan-page ── Google/Bing 검색 결과 스캔 ──
ipcMain.handle('xpider-scan-page', (event, args) =>
    tabQueue.run(() => _doScanPage(args))
);
async function _doScanPage({ url, waitMs = 5000, showTab = false }) {
    const EMPTY = { emails:[], phone:'', address:'', homepage:'', sns:[], pageText:'' };
    if (!mainWindow || mainWindow.isDestroyed()) return EMPTY;
    let tabUIId = null;
    try {
        const tabInfo = await _openXpiderTab(url, showTab);
        if (!tabInfo || !tabInfo.wcId) return EMPTY;
        tabUIId = tabInfo.tabUIId;
        const wc = webContents.fromId(tabInfo.wcId);
        if (!wc) return EMPTY;
        await _waitForLoad(wc, waitMs);
        await new Promise(r => setTimeout(r, showTab ? 1000 : 400));

        const result = await wc.executeJavaScript(`
            (function() {
                const pageText = document.body ? document.body.innerText : '';
                const h = window.location.hostname;
                const isGoogle = h.includes('google.');
                const isBing   = h.includes('bing.com');
                let phone = '', address = '', homepage = '', emails = [];
                document.querySelectorAll('a[href^="mailto:"]').forEach(a => {
                    const em = a.href.replace(/^mailto:/i,'').split('?')[0].trim().toLowerCase();
                    if (em && em.includes('@')) emails.push(em);
                });
                (pageText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}/g)||[]).forEach(e=>{
                    const el=e.toLowerCase();
                    if(!['google.com','sentry.io','example.com','wixpress.com'].some(d=>el.includes(d))) emails.push(el);
                });
                if (isGoogle) {
                    const gAddr = document.querySelector('[data-attrid="kc:/local:address"],[data-local-attribute="d3adr"],.LrzXr,.y35z8c');
                    if (gAddr) address = gAddr.innerText.replace(/^Address:/i,'').trim();
                    const gTel = document.querySelector('[data-local-attribute="d3ph"],[data-attrid="kc:/local:phone"],a[href^="tel:"]');
                    if (gTel) phone = (gTel.innerText||gTel.href||'').replace(/^tel:|^Phone:/i,'').trim();
                    const gWeb = document.querySelector('a.ab_button[href*="http"],a.mI8Ptc[href*="http"],a[data-item-id="authority"],a[aria-label="Website"]');
                    if (gWeb && !gWeb.href.includes('google.')) homepage = gWeb.href;
                    if (!homepage) {
                        for (const l of document.querySelectorAll('.yuRUbf a,.tF2Cxc a[href*="http"]')) {
                            if (l.closest('.g,.MjjYud') && !l.href.includes('google.')) { homepage=l.href; break; }
                        }
                    }
                } else if (isBing) {
                    const bAddr = document.querySelector('.b_address,.l_staddr');
                    if (bAddr) address = bAddr.innerText.trim();
                    const bTel  = document.querySelector('.b_phone,.l_sttel,a[href^="tel:"]');
                    if (bTel)  phone = (bTel.innerText||bTel.href||'').replace(/^tel:/i,'').trim();
                    const bWeb  = document.querySelector('a[aria-label="Website"],.l_stweb');
                    if (bWeb)  homepage = bWeb.href;
                } else {
                    const telLink = document.querySelector('a[href^="tel:"]');
                    if (telLink) phone = telLink.href.replace(/^tel:/i,'').trim();
                    const addrEl = document.querySelector('[itemprop="address"],.address,[class*="address"]');
                    if (addrEl) address = addrEl.innerText.trim();
                    const snsDomains=['facebook.com','instagram.com','twitter.com','x.com','linkedin.com','youtube.com','tiktok.com'];
                    const snsLinks=[];
                    document.querySelectorAll('a[href]').forEach(a=>{if(snsDomains.some(d=>a.href.toLowerCase().includes(d)))snsLinks.push(a.href);});
                    return { emails:[...new Set(emails)].slice(0,5), phone, address, homepage, sns:snsLinks.slice(0,5), pageText:pageText.slice(0,3000) };
                }
                return { emails:[...new Set(emails)].slice(0,5), phone, address, homepage, sns:[], pageText:pageText.slice(0,3000) };
            })()
        `).catch(() => EMPTY);
        return result;
    } catch(e) {
        log.error('[ScanPage]', e.message);
        return EMPTY;
    } finally {
        await _closeXpiderTab(tabUIId);
    }
}

// ─── [v1.1.3] xpider-scan-full ── 홈페이지 정보+컨텍트링크 통합 ──
ipcMain.handle('xpider-scan-full', (event, args) =>
    tabQueue.run(() => _doScanFull(args))
);
async function _doScanFull({ url, waitMs = 5000, showTab = false }) {
    if (!mainWindow || mainWindow.isDestroyed()) return null;
    let tabUIId = null;
    try {
        const tabInfo = await _openXpiderTab(url, showTab);
        if (!tabInfo || !tabInfo.wcId) return null;
        tabUIId = tabInfo.tabUIId;
        const wc = webContents.fromId(tabInfo.wcId);
        if (!wc) return null;
        await _waitForLoad(wc, waitMs);
        await new Promise(r => setTimeout(r, showTab ? 1000 : 500));

        const result = await wc.executeJavaScript(`
            (function() {
                const pageText = document.body ? document.body.innerText : '';
                const origin = window.location.origin;
                let phone='', address='', emails=[], sns=[], contactLinks=[];
                document.querySelectorAll('a[href^="mailto:"]').forEach(a=>{
                    const em=a.href.replace(/^mailto:/i,'').split('?')[0].trim().toLowerCase();
                    if(em&&em.includes('@'))emails.push(em);
                });
                (pageText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}/g)||[]).forEach(e=>{
                    const el=e.toLowerCase();
                    if(!['google.com','sentry.io','example.com','wixpress.com'].some(d=>el.includes(d)))emails.push(el);
                });
                const telEl=document.querySelector('a[href^="tel:"]');
                if(telEl)phone=telEl.href.replace(/^tel:/i,'').trim();
                if(!phone){const m=pageText.match(/[+]?[(]?[0-9]{1,4}[)]?[-\\s.]?[(]?[0-9]{1,4}[)]?[-\\s.][0-9]{3,4}[-\\s.][0-9]{3,4}/);if(m)phone=m[0];}
                const addrEl=document.querySelector('[itemprop="address"],.address,[class*="address"],[itemtype*="PostalAddress"]');
                if(addrEl)address=addrEl.innerText.trim();
                const snsDomains=['facebook.com','instagram.com','twitter.com','x.com','linkedin.com','youtube.com','tiktok.com'];
                document.querySelectorAll('a[href]').forEach(a=>{if(snsDomains.some(d=>a.href.toLowerCase().includes(d)))sns.push(a.href);});
                const contactKeywords=['contact','about','reach','connect','get-in-touch','kontakt','nous-contacter','contacto'];
                document.querySelectorAll('a[href]').forEach(a=>{
                    try{
                        const href=new URL(a.href,window.location.href).href;
                        const lo=href.toLowerCase();
                        const text=(a.innerText||'').toLowerCase().trim();
                        if(contactKeywords.some(k=>lo.includes(k)||text.includes(k))&&href.startsWith(origin)&&!lo.includes('mailto:')&&!lo.match(/\\.(pdf|jpg|png|gif)$/i))contactLinks.push(href);
                    }catch(e){}
                });
                return {emails:[...new Set(emails)].slice(0,5),phone,address,sns:[...new Set(sns)].slice(0,5),contactLinks:[...new Set(contactLinks)].slice(0,3),pageText:pageText.slice(0,2000)};
            })()
        `).catch(() => null);
        return result;
    } catch(e) {
        log.error('[ScanFull]', e.message);
        return null;
    } finally {
        await _closeXpiderTab(tabUIId);
    }
}

// ─── [v1.1.3] xpider-contact-page ── 컨텍트 링크 추출 ──
ipcMain.handle('xpider-contact-page', (event, args) =>
    tabQueue.run(() => _doContactPage(args))
);
async function _doContactPage({ url, waitMs = 4000, showTab = false }) {
    if (!mainWindow || mainWindow.isDestroyed()) return { contactLinks: [] };
    let tabUIId = null;
    try {
        const tabInfo = await _openXpiderTab(url, showTab);
        if (!tabInfo || !tabInfo.wcId) return { contactLinks: [] };
        tabUIId = tabInfo.tabUIId;
        const wc = webContents.fromId(tabInfo.wcId);
        if (!wc) return { contactLinks: [] };
        await _waitForLoad(wc, waitMs);
        await new Promise(r => setTimeout(r, 500));
        const contactLinks = await wc.executeJavaScript(`
            (function() {
                const keywords=['contact','about','reach','connect','get-in-touch','kontakt','nous-contacter','contacto'];
                const origin=window.location.origin;
                const found=new Set();
                document.querySelectorAll('a[href]').forEach(a=>{
                    try{
                        const href=new URL(a.href,window.location.href).href;
                        const lo=href.toLowerCase();
                        const text=(a.innerText||a.textContent||'').toLowerCase().trim();
                        const isContact=keywords.some(k=>lo.includes(k)||text.includes(k));
                        if(isContact&&href.startsWith(origin)&&!lo.includes('mailto:')&&!lo.match(/\\.(pdf|jpg|png|gif)$/i))found.add(href);
                    }catch(e){}
                });
                return [...found].slice(0,3);
            })()
        `).catch(() => []);
        return { contactLinks };
    } catch(e) {
        log.error('[ContactPage]', e.message);
        return { contactLinks: [] };
    } finally {
        await _closeXpiderTab(tabUIId);
    }
}


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
    
    // ── CLEAR DATA (반드시 early return — relay 차단) ──
    if (message.action === 'clearData') {
        log.info('[ExtBridge] clearData received — wiping ALL data');
        // 1. 메인 프로세스 메모리 즉시 초기화
        extStorage.scrapedData = [];
        const clearKeys = ['scrapingActive', 'emailCheckActive', 'cruiserActive', 'processedUrls', 'emailProgress'];
        clearKeys.forEach(k => delete extStorage[k]);
        // 2. 파일에 강제 저장
        try { fs.writeFileSync(storagePath, JSON.stringify({ scrapedData: [] }, null, 2)); } catch(e) { log.error('[ClearData] File write failed:', e.message); }
        // 3. Stage 2 엔진 강제 중단 (isDeepSearching은 true로 유지하여 재시작 방지)
        deepSearchCancel = true;
        if (crawlerWindow && !crawlerWindow.isDestroyed()) {
            try { crawlerWindow.close(); } catch(e) {}
            crawlerWindow = null;
        }
        isDeepSearching = false;
        // 4. 모든 webContents에 브로드캐스트
        const clearChanges = { scrapedData: { oldValue: null, newValue: [] } };
        webContents.getAllWebContents().forEach(wc => {
            try { wc.send('xpider-ext-storage-changed', clearChanges); } catch(e) {}
        });
        log.info('[ClearData] Done — extStorage.scrapedData is now []');
        return { success: true }; // early return: relay 하지 않음
    }

    // ── STAGE 2 TRIGGERS ──
    if (message.action === 'startEmailCheck') {
        startDeepSearchInMain();
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

// ─── STAGE 2: HEADLESS DISCOVERY ENGINE ─────────────────────
let isDeepSearching = false;
let deepSearchCancel = false;
let crawlerWindow = null;

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
    if (!crawlerWindow || crawlerWindow.isDestroyed()) return {};
    try {
        await crawlerWindow.loadURL(url);
        // Wait a bit for JS to render
        await new Promise(r => setTimeout(r, waitMs));
        
        const result = await crawlerWindow.webContents.executeJavaScript(`
            (function() {
                const text = document.body ? document.body.innerText : '';
                const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
                const emails = text.match(emailRegex) || [];
                
                const phoneRegex = /\\+?\\d{1,4}?[-.\\s]?\\(?\\d{1,3}?\\)?[-.\\s]?\\d{1,4}[-.\\s]?\\d{1,4}[-.\\s]?\\d{1,9}/g;
                const phones = text.match(phoneRegex) || [];
                
                // Address pattern matching (simplified for US/EU formats)
                const addressRegex = /\\d{1,5}\\s[A-Za-z0-9\\s.,-]+(?:Avenue|Ave|Street|St|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Way|Court|Ct|Plaza|Square|Sq|Suite|Ste|Unit|Building|Bldg)[.,\\s]+[A-Za-z\\s]+[.,\\s]+[A-Z]{2}\\s\\d{5}(?:-\\d{4})?/gi;
                const addresses = text.match(addressRegex) || [];

                let homepage = null;
                const cite = document.querySelector('cite');
                if (cite) {
                    const parts = cite.innerText.split(' ');
                    if (parts[0].includes('http')) homepage = parts[0];
                }

                const contactKeywords = ['contact', 'about', '연락처', '오시는길', '고객센터', '문의', 'team', 'company', 'get-in-touch', 'impressum', 'kontakt'];
                let contactLinks = [];
                document.querySelectorAll('a').forEach(a => {
                    const href = a.href || '';
                    const aText = (a.innerText || '').toLowerCase();
                    if (href.startsWith('http') && contactKeywords.some(kw => href.toLowerCase().includes(kw) || aText.includes(kw))) {
                        contactLinks.push(href);
                    }
                });

                const socialRegex = /(?:facebook|instagram|twitter|x|linkedin|youtube|tiktok)\\.com\\/([a-zA-Z0-9._%+-]+)/gi;
                const socials = text.match(socialRegex) || [];
                const socialLinks = [];
                document.querySelectorAll('a').forEach(a => {
                    const href = a.href || '';
                    if (href.match(/(facebook|instagram|twitter|linkedin|youtube|tiktok|x\\.com)/i)) {
                        socialLinks.push(href);
                    }
                });

                return {
                    emails: [...new Set(emails)].join(', '),
                    phone: phones[0] || null,
                    address: addresses[0] || null,
                    homepage: homepage,
                    socials: [...new Set([...socials.map(s => 'https://' + s), ...socialLinks])].slice(0, 5),
                    contactLinks: [...new Set(contactLinks)].slice(0, 2)
                };
            })();
        `);
        return result || {};
    } catch (e) {
        log.error("[Crawler] Scan failed:", e);
        return {};
    }
}

async function startDeepSearchInMain() {
    const sendLog = (msg) => {
        console.log(`[STAGE2-TRACE] ${msg}`);
        broadcastExtMessage({ action: 'log', message: `[STAGE2] ${msg}` });
    };

    sendLog("Discovery Engine Started.");
    if (isDeepSearching) {
        sendLog("Engine already running. Ignoring start request.");
        return;
    }
    isDeepSearching = true;
    deepSearchCancel = false;

    // 항상 최신 extStorage를 파일에서 다시 읽음 (Clear Data 후 stale 방지)
    try {
        if (fs.existsSync(storagePath)) {
            const fresh = JSON.parse(fs.readFileSync(storagePath, 'utf8'));
            // 파일의 scrapedData가 더 최신이면 사용, 메모리가 비어있으면 파일 우선
            if (Array.isArray(fresh.scrapedData)) {
                extStorage.scrapedData = fresh.scrapedData;
            }
        }
    } catch(e) { log.error('[Stage2] Fresh read failed:', e.message); }

    if (!extStorage.scrapedData) extStorage.scrapedData = [];
    const leadsToProcess = extStorage.scrapedData.filter(b => b.status === 'captured' || b.email === 'Pending Stage 2' || !b.status);
    sendLog(`Found ${leadsToProcess.length} leads to process.`);
    
    if (leadsToProcess.length === 0) {
        sendLog('No leads to process. Stage 2 aborted.');
        isDeepSearching = false;
        broadcastExtMessage({ action: 'emailCheckStatus', total: 0, current: 0, finished: true });
        return;
    }
    
    broadcastExtMessage({ action: 'emailCheckStatus', total: leadsToProcess.length, current: 0 });

    if (leadsToProcess.length > 0) {
        sendLog("Creating crawler window...");
        crawlerWindow = new BrowserWindow({
            show: false, 
            webPreferences: { nodeIntegration: false, contextIsolation: true }
        });
    }

    let processedCount = 0;
    for (const lead of leadsToProcess) {
        if (deepSearchCancel) {
            sendLog("Discovery cancelled by user.");
            break;
        }
        processedCount++;
        sendLog(`[${processedCount}/${leadsToProcess.length}] Processing: ${lead.name}`);

        try {
            let targetUrl = lead.website && lead.website !== 'N/A' ? lead.website : null;
            
            if (!targetUrl) {
                sendLog(`No website for ${lead.name}. Searching Google...`);
                broadcastExtMessage({ action: 'emailCheckStatus', total: leadsToProcess.length, current: processedCount, stage: 2, statusText: `Searching for ${lead.name}...` });
                const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(lead.name + " official website contact email")}`;
                const enrich = await scanPageInCrawler(searchUrl, 3000);
                if (enrich.homepage) {
                    targetUrl = enrich.homepage;
                    sendLog(`Found website via search: ${targetUrl}`);
                }
            }

            if (targetUrl && !targetUrl.includes('google.com')) {
                sendLog(`Navigating to official site: ${targetUrl}`);
                broadcastExtMessage({ action: 'emailCheckStatus', total: leadsToProcess.length, current: processedCount, stage: 3, statusText: `Scraping: ${lead.name}` });
                
                const webScan = await scanPageInCrawler(targetUrl, 4500);
                let finalEmails = webScan.emails ? webScan.emails.split(', ') : [];
                let finalPhone = webScan.phone;
                let finalAddress = webScan.address;
                let finalSocials = webScan.socials || [];

                sendLog(`Homepage results: Emails(${finalEmails.length}), Phone(${finalPhone?1:0}), Address(${finalAddress?1:0}), Socials(${finalSocials.length})`);

                // Stage 3.5: Contact Page Autopilot
                if ((!finalEmails.length || !finalPhone || !finalAddress) && webScan.contactLinks && webScan.contactLinks.length > 0) {
                    const uniqueLinks = [...new Set(webScan.contactLinks)].slice(0, 3); // Limit to top 3 links
                    sendLog(`Missing some info. Checking contact pages: ${uniqueLinks.join(', ')}`);
                    for (const contactUrl of uniqueLinks) {
                        sendLog(`-> Scanning contact page: ${contactUrl}`);
                        const subScan = await scanPageInCrawler(contactUrl, 3500);
                        if (subScan.emails) finalEmails.push(...subScan.emails.split(', '));
                        if (!finalPhone && subScan.phone) finalPhone = subScan.phone;
                        if (!finalAddress && subScan.address) finalAddress = subScan.address;
                        if (subScan.socials) finalSocials.push(...subScan.socials);
                        
                        if (finalEmails.length > 0 && finalPhone && finalAddress) {
                            sendLog("All info found. Stopping crawl for this lead.");
                            break;
                        }
                    }
                }

                const uniqueEmails = [...new Set(finalEmails)].filter(e => e).join(', ');
                if (uniqueEmails) {
                    lead.email = uniqueEmails;
                    sendLog(`Found Emails: ${uniqueEmails}`);
                } else {
                    lead.email = 'Not Found';
                }
                
                if (finalPhone && (!lead.phone || lead.phone === 'N/A')) lead.phone = finalPhone;
                if (finalAddress && (!lead.address || lead.address === 'N/A')) lead.address = finalAddress;
                
                if (finalSocials.length > 0) {
                    const existingSocials = lead.social ? lead.social.split(', ') : [];
                    lead.social = [...new Set([...existingSocials, ...finalSocials])].join(', ');
                    sendLog(`Found Socials: ${lead.social}`);
                }
            } else {
                sendLog(`Skipping ${lead.name} (No valid website found)`);
                lead.email = 'No Website';
            }

            lead.status = 'complete';
            broadcastStorageUpdate();
            broadcastExtMessage({ action: 'emailCheckStatus', total: leadsToProcess.length, current: processedCount });

        } catch (e) {
            sendLog(`ERROR processing ${lead.name}: ${e.message}`);
        }
        await new Promise(r => setTimeout(r, 500));
    }

    if (crawlerWindow && !crawlerWindow.isDestroyed()) {
        crawlerWindow.close();
        crawlerWindow = null;
    }
    isDeepSearching = false;
    sendLog("Discovery Engine Finished.");
    broadcastExtMessage({ action: 'emailCheckStatus', finished: true });
}

function stopDeepSearchInMain() {
    deepSearchCancel = true;
    isDeepSearching = false;
    if (crawlerWindow && !crawlerWindow.isDestroyed()) {
        crawlerWindow.close();
        crawlerWindow = null;
    }
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
      // [v1.1.0] _나 .으로 시작하는 레거시/숨김 폴더는 로드 제외
      if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
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

        // [v1.1.0 Fix] Electron은 동일 경로 익스텐션을 세션에 캐시합니다.
        // 브라우저 재시작 시 manifest 변경사항(이름, 버전 등)이 반영되지 않으므로,
        // 로드 전에 기존 캐시를 제거하여 항상 최신 버전이 로드되도록 합니다.
        try {
          const allLoaded = session.defaultSession.extensions.getAllExtensions();
          for (const [cachedId, cachedExt] of Object.entries(allLoaded)) {
            if (cachedExt.path === extPath) {
              await session.defaultSession.extensions.removeExtension(cachedId);
              log.info(`[Extensions] Removed cached extension: ${cachedId} (${entry.name})`);
              break;
            }
          }
        } catch (removeErr) {
          log.warn(`[Extensions] Cache removal skipped (${entry.name}): ${removeErr.message}`);
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
        log.info(`[Extensions] ✅ Loaded FRESH: ${manifest.name} v${manifest.version} (${entry.name})`);
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
    sendExtProgress('🔄 GitHub에서 익스텐션 버전을 확인하는 중...');

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
      sendExtProgress(`✅ 완료 (${msgParts.join(' / ')}), 적용 중...`);
      log.info(`[Extensions] Sync complete: ${msgParts.join(' / ')}`);

      // 변경사항이 있으므로 로컬 익스텐션을 다시 로드하고 화면에 반영
      loadedExtensionsInfo = await loadLocalExtensions();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('extensions_loaded', loadedExtensionsInfo);
        sendExtProgress('🚀 익스텐션이 사이드바에 성공적으로 적용되었습니다!');
      }
    } else {
      sendExtProgress('✅ 모든 익스텐션이 최신 상태입니다.');
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
    splashWindow.webContents.send('splash-progress', '로컬 익스텐션 로딩 중...');
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

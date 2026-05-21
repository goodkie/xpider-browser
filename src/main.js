const { app, BrowserWindow, session, ipcMain, shell, webContents, dialog, Menu, MenuItem, clipboard } = require('electron');
const path = require('path');
const fs   = require('fs');
const log  = require('electron-log');

// ─── Campaign Engine (AutoForm Sender Pro) ────────────────────
const campaignEngine = require('./campaign-engine');

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
let witSettingsWindow = null;
let loadedExtensionsInfo = [];
let lastActiveTabByWindow = {}; // Cache active tab per windowId

// ─── 전역 실시간 로그 링버퍼 ──────────────────────────────────
// xLog 함수를 빈 함수로 두거나, 단순 native console로 대체하여 레거시 오류 방지
function xLog(level, source, ...args) {
    // 실시간 로그 스트림과 링버퍼는 완전히 제거되었습니다.
}


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
    //    BUT: if the opener is a chrome-extension:// page (e.g. extension popup),
    //    open external http/https URLs directly in the OS default browser.
    contents.setWindowOpenHandler(({ url }) => {
      const openerUrl = contents.getURL();
      const isExtensionContext = openerUrl.startsWith('chrome-extension://');
      const isExternalUrl = url.startsWith('https://') || url.startsWith('http://');

      if (isExtensionContext && isExternalUrl) {
        // Open in OS default browser (e.g. Chrome, Edge, Safari)
        shell.openExternal(url);
        log.info('[WindowOpen] Extension opened external URL in system browser:', url);
        return { action: 'deny' };
      }

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

    // 렌더러가 완전히 준비된 후 앱 최신버전 확인 (2초 딜레이)
    // 익스텐션 버전 검사는 시작 시 실행하지 않음 (trigger-background-sync IPC로만 수동 실행 가능)
    setTimeout(() => {
      checkAndNotifyAppUpdate();
    }, 2000);
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

// ─── 업데이트 IPC (auth-success 전에 선언해야 함) ─────────────────────────────
const { checkAppUpdate, performHotUpdate } = require('./updater');

async function checkAndNotifyAppUpdate(isManual = false) {
  try {
    const result = await checkAppUpdate();
    result.isManual = isManual; // 수동/자동 구분 플래그
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('app-update-result', result);
    }
  } catch (e) {
    log.error('[AppUpdate]', e.message);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('app-update-result', { hasUpdate: false, error: e.message, isManual });
    }
  }
}

// ① 수동 업데이트 확인 (설정 메뉴 "업데이트 확인" 버튼)
ipcMain.on('check-for-updates', () => {
  log.info('[AppUpdate] Manual check triggered by user');
  checkAndNotifyAppUpdate(true); // isManual = true → skippedVersion 필터 무시
});

// ② 핫 업데이트 시작 (새 버전 다운로드 → 재시작)
// renderer가 invoke('hot-update-start', { downloadUrl, dryRun }) 로 호출
ipcMain.handle('hot-update-start', async (event, { downloadUrl, dryRun = false } = {}) => {
  log.info(`[HotUpdate] Starting — dryRun=${dryRun}, url=${downloadUrl || 'N/A'}`);
  try {
    const result = await performHotUpdate(downloadUrl, (progress) => {
      // 진행률을 렌더러로 실시간 스트리밍
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('hot-update-progress', progress);
      }
    }, dryRun);
    return result;
  } catch (e) {
    log.error('[HotUpdate] Error:', e.message);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('hot-update-progress', { phase: 'error', pct: 0, msg: `❌ 업데이트 오류: ${e.message}` });
    }
    return { ok: false, error: e.message };
  }
});

// ③ 릴리즈 페이지 열기 (깃허브 릴리즈 페이지 → 시스템 브라우저)
ipcMain.on('open-release-url', (event, url) => {
  if (url && (url.startsWith('https://') || url.startsWith('http://'))) {
    shell.openExternal(url);
    log.info('[AppUpdate] Opening release URL:', url);
  }
});

// auth-success 중복 실행 방지 플래그
let _authSuccessFired = false;

ipcMain.on('auth-success', () => {
  if (_authSuccessFired) return;
  _authSuccessFired = true;
  if (loginWindow) { loginWindow.removeAllListeners('closed'); loginWindow.close(); loginWindow = null; }
  createWindow();
  // 앱 업데이트 확인은 did-finish-load 이벤트에서 처리 (renderer 준비 보장)
});

ipcMain.on('auth-close-app', () => app.quit());

ipcMain.on('close-wit-settings-window', () => {
  if (witSettingsWindow && !witSettingsWindow.isDestroyed()) {
    witSettingsWindow.close();
    witSettingsWindow = null;
  }
});

ipcMain.on('open-wit-external-link', (event, url) => {
  if (url && (url.startsWith('https://') || url.startsWith('http://'))) {
    shell.openExternal(url);
  }
});

// ─── Hard Block VPN 패널 열기 (content.js → XPIDER_INVOKE → here → renderer_ui.js) ──
ipcMain.handle('open-xpider-vpn-panel', async (event) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send('xpider-ext-runtime-on-message', { action: 'OPEN_XPIDER_VPN' });
  }
  return { success: true };
});

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


// 익스텐션 재로드 IPC
ipcMain.on('reload-extensions', async () => {
  loadedExtensionsInfo = await loadExtensions();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('extensions_loaded', loadedExtensionsInfo);
  }
});

// ─── [VPN] XPIDER VPN IPC 핸들러 ─────────────────────────────────────────────
// 구조: popup.js → XPIDER_INVOKE → ext-preload → ipcMain.handle('xpider-vpn-*')
// 해결책: Electron app.on('login') 이벤트가 webview CONNECT 터널에서
//         event.preventDefault() 없이 동작하지 않는 문제를 우회하기 위해
//         로컬 HTTP 프록시 릴레이 서버를 Node.js로 직접 구동합니다.
//         브라우저 → localhost:localPort → 자격증명 주입 → WebShare 프록시
const net  = require('net');
const http = require('http');

let _vpnState       = { connected: false, server: null };
let _vpnLocalServer = null;   // http.Server 인스턴스
let _vpnLocalPort   = 0;      // 실제 바인딩된 포트

function _stopLocalProxy() {
  return new Promise((resolve) => {
    if (_vpnLocalServer) {
      _vpnLocalServer.closeAllConnections?.();
      _vpnLocalServer.close(() => { _vpnLocalServer = null; resolve(); });
    } else {
      resolve();
    }
  });
}

// 로컬 HTTP 프록시 서버 시작
// HTTP CONNECT 터널 요청을 받으면 upstream(WebShare)에 자격증명 포함 CONNECT 전달
function _startLocalProxy(upHost, upPort, upUser, upPass) {
  return new Promise((resolve, reject) => {
    const proxyAuthB64 = Buffer.from(`${upUser}:${upPass}`).toString('base64');
    const authHeader   = `Basic ${proxyAuthB64}`;

    const server = http.createServer((req, res) => {
      // 일반 HTTP 요청 → upstream으로 포워드
      const upReq = http.request({
        host: upHost,
        port: upPort,
        method: req.method,
        path: req.url,
        headers: { ...req.headers, 'Proxy-Authorization': authHeader },
      }, (upRes) => {
        res.writeHead(upRes.statusCode, upRes.headers);
        upRes.pipe(res);
      });
      req.pipe(upReq);
      upReq.on('error', () => res.end());
    });

    // HTTP CONNECT (HTTPS 터널링)
    server.on('connect', (req, clientSocket, head) => {
      const [targetHost, targetPort] = req.url.split(':');
      const upSocket = net.connect(upPort, upHost, () => {
        // upstream에 자격증명 포함 CONNECT 요청 전송
        upSocket.write(
          `CONNECT ${req.url} HTTP/1.1\r\n` +
          `Host: ${req.url}\r\n` +
          `Proxy-Authorization: ${authHeader}\r\n` +
          `\r\n`
        );
      });

      upSocket.once('data', (chunk) => {
        const response = chunk.toString();
        if (response.includes('200')) {
          // upstream이 터널 수락 → 클라이언트에 연결 수립 응답
          clientSocket.write('HTTP/1.1 200 Connection established\r\n\r\n');
          if (head && head.length) upSocket.write(head);
          upSocket.pipe(clientSocket);
          clientSocket.pipe(upSocket);
        } else {
          log.error('[VPN-RELAY] Upstream CONNECT rejected:', response.substring(0, 100));
          clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
          clientSocket.end();
          upSocket.end();
        }
      });

      upSocket.on('error', (err) => {
        log.error('[VPN-RELAY] upstream socket error:', err.message);
        clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
        clientSocket.end();
      });
      clientSocket.on('error', () => upSocket.end());
    });

    server.listen(0, '127.0.0.1', () => {
      _vpnLocalServer = server;
      _vpnLocalPort   = server.address().port;
      log.info(`[VPN-RELAY] Local proxy started on 127.0.0.1:${_vpnLocalPort} → ${upHost}:${upPort}`);
      resolve(_vpnLocalPort);
    });

    server.on('error', reject);
  });
}

ipcMain.handle('xpider-vpn-connect', async (event, { host, port, username, password, country, city }) => {
  try {
    if (!host || !port) return { ok: false, error: 'Invalid proxy: host/port missing' };

    // 기존 로컬 프록시 중지
    await _stopLocalProxy();

    // 로컬 릴레이 서버 기동 (자격증명 자동 주입)
    const localPort = await _startLocalProxy(host, port, username, password);

    // Electron 세션을 로컬 릴레이로 연결 (인증 불필요 — 릴레이가 대신 처리)
    const { session: electronSession } = require('electron');
    await electronSession.defaultSession.setProxy({
      proxyRules: `http://127.0.0.1:${localPort}`,
      proxyBypassRules: '<local>',
    });

    _vpnState = { connected: true, server: { host, port, username, password, country, city } };
    log.info(`[VPN] Connected via relay 127.0.0.1:${localPort} → ${host}:${port} (${country}${city ? '/' + city : ''})`);

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('xpider-vpn-state', _vpnState);
    }
    return { ok: true };
  } catch (e) {
    log.error('[VPN] Connect error:', e.message);
    await _stopLocalProxy();
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('xpider-vpn-disconnect', async () => {
  try {
    const { session: electronSession } = require('electron');
    await electronSession.defaultSession.setProxy({ mode: 'direct' });
    await _stopLocalProxy();

    _vpnState = { connected: false, server: null };
    log.info('[VPN] Disconnected — proxy cleared, relay stopped');

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('xpider-vpn-state', _vpnState);
    }
    return { ok: true };
  } catch (e) {
    log.error('[VPN] Disconnect error:', e.message);
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('xpider-vpn-get-state', async () => _vpnState);
// ─────────────────────────────────────────────────────────────────────────────


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

const handleExtUpdateTab = async (event, props) => {
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
};
ipcMain.handle('xpider-ext-update-tab', handleExtUpdateTab);
ipcMain.handle('xpider-ext-tabs-update', handleExtUpdateTab);

const handleExtCreateTab = async (event, props) => {
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
};
ipcMain.handle('xpider-ext-create-tab', handleExtCreateTab);
ipcMain.handle('xpider-ext-tabs-create', handleExtCreateTab);

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

// ─── [v4.0] Email Extractor 수집 엔진 ────────────────────────────────────────
// content.js → XPIDER_SEND → ext-preload.js → ipcRenderer.send → main.js
// main.js → mainWindow.send('xpider-email-collected-event') → renderer_ui.js
// renderer_ui.js → extensionWebview.executeJavaScript → popup.js 실시간 업데이트

const _emailByUrl = new Map();  // url → Set<email>
const _allEmails  = new Set();  // 전체 누적 이메일
let   _lastActiveUrl = '';      // 현재 활성 탭 URL

function _broadcastEmailEvent(eventName, data) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('xpider-email-collected-event', { name: eventName, data });
    }
}

// 이메일 수집 수신 (content.js → ext-preload.js → ipcMain)
ipcMain.on('xpider-email-collected', (event, data) => {
    if (!data || !Array.isArray(data.emails) || data.emails.length === 0) return;
    
    // URL 정규화 (캐싱 및 매칭용)
    const rawUrl = data.url || 'unknown';
    const url = rawUrl.split(/[#\?]/)[0].replace(/\/$/, '');

    if (!_emailByUrl.has(url)) _emailByUrl.set(url, new Set());
    const urlSet = _emailByUrl.get(url);
    let added = 0;

    data.emails.forEach(e => {
        const em = e.toLowerCase().trim();
        if (em && !urlSet.has(em)) {
            urlSet.add(em);
            added++;
        }
        _allEmails.add(em || e);
    });

    // 수집 로그 (가시성 확보)
    const logMsg = `[EmailEngine] +${added} emails from ${url.substring(0, 50)}... (Total: ${_allEmails.size})`;
    console.log(logMsg);
    log.info(logMsg);

    if (added === 0 && data.forceUpdate !== true) return; 

    const pageEmails = [...urlSet].sort();
    const allList    = [..._allEmails].sort();

    // 팝업 및 사이드바 실시간 업데이트 브로드캐스트
    const payload = {
        emails:    pageEmails,
        allEmails: allList,
        url: url,
        rawUrl: rawUrl,
        count: _allEmails.size
    };

    _broadcastEmailEvent('email-collected', payload);

    // 배지 업데이트 전용 이벤트
    _broadcastEmailEvent('update-badge', {
        count: _allEmails.size,
        extId: 'email-extractor'
    });
});


// 현재 페이지 이메일 반환
ipcMain.handle('xpider-email-get-page', async (event, args) => {
    // popup.js가 직접 전달한 URL 우선, 없으면 마지막 활성 URL
    const rawUrl = (args && args.url) ? args.url : _lastActiveUrl;
    const url    = (rawUrl || '').split(/[#\?]/)[0].replace(/\/$/, '');
    let emails   = [];

    if (url) {
        // 1. 정확 매칭 (정규화된 URL 기준)
        if (_emailByUrl.has(url)) {
            emails = [..._emailByUrl.get(url)].sort();
        } else {
            // 2. 부분 매칭 (폴백)
            for (const [storedUrl, set] of _emailByUrl.entries()) {
                if (storedUrl.includes(url) || url.includes(storedUrl)) {
                    emails = [...set].sort();
                    break;
                }
            }
        }
    }

    return { emails, url };
});



// 전체 누적 이메일 반환
ipcMain.handle('xpider-email-get-all', async () => {
    return { emails: [..._allEmails].sort(), count: _allEmails.size };
});

// 전체 초기화
ipcMain.on('xpider-email-clear-all', () => {
    _allEmails.clear();
    _emailByUrl.clear();
    _broadcastEmailEvent('update-badge', { text: '', extId: 'email-extractor' });
    log.info('[EmailEngine] 전체 이메일 초기화');
});

// 현재 페이지 이메일 초기화
ipcMain.on('xpider-email-clear-current', (event, data) => {
    const rawUrl = (data && data.url) ? data.url : _lastActiveUrl;
    const url = (rawUrl || '').split(/[#\?]/)[0].replace(/\/$/, '');

    let clearedEmails = new Set();

    // 1. 정확 매칭 삭제
    if (url && _emailByUrl.has(url)) {
        clearedEmails = new Set([..._emailByUrl.get(url)]);
        _emailByUrl.delete(url);
    } else if (url) {
        // 2. 부분 매칭 폴백 (URL이 저장된 키와 일부 일치하는 경우)
        for (const [storedUrl, set] of _emailByUrl.entries()) {
            if (storedUrl.includes(url) || url.includes(storedUrl)) {
                set.forEach(e => clearedEmails.add(e));
                _emailByUrl.delete(storedUrl);
                break;
            }
        }
    }

    // 3. _allEmails에서도 해당 URL 이메일 제거
    //    단, 다른 URL에도 동일 이메일이 있는 경우는 유지
    if (clearedEmails.size > 0) {
        const remainingEmails = new Set();
        for (const [, set] of _emailByUrl.entries()) {
            set.forEach(e => remainingEmails.add(e));
        }
        // _allEmails를 남아있는 이메일로만 재구성
        _allEmails.clear();
        remainingEmails.forEach(e => _allEmails.add(e));
    }

    log.info(`[EmailEngine] 현재 페이지(${url}) 이메일 초기화 — 삭제됨: ${clearedEmails.size}개, 남은 전체: ${_allEmails.size}개`);

    // 4. 팝업 UI에 초기화 이벤트 전파 + 배지 카운트 갱신
    _broadcastEmailEvent('email-clear-current', { url: rawUrl, cleared: clearedEmails.size });
    _broadcastEmailEvent('update-badge', {
        count: _allEmails.size,
        text: _allEmails.size > 0 ? String(_allEmails.size) : '',
        extId: 'email-extractor'
    });
});

// 활성 탭 URL 추적 (renderer_ui.js → xpider-ext-report-active-tab)
ipcMain.on('xpider-ext-report-active-tab', (event, data) => {
    if (data && data.url) _lastActiveUrl = data.url;
});

// [Lang] Browser language -> Extension storage sync
ipcMain.on('set-extension-lang', (event, lang) => {
    if (!lang || typeof lang !== 'string') return;
    extStorage['language']    = lang;
    extStorage['xpider_lang'] = lang;
    if (typeof saveExtStorage === 'function') saveExtStorage();
    log.info(`[LangSync] Language saved to extStorage: ${lang}`);
});


// 다운로드 시작 → 진행률 실시간 전송 → 완료/오류 처리
// HTTP/HTTPS URL 다운로드 완전 지원
const _dlStreams = new Map(); // downloadId → {req, fileStream}

function _notifyDl(event, data) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(event, data);
    }
}

ipcMain.handle('xpider-download-file', async (event, { content, filename, url, saveAs }) => {
    const downloadId = Date.now();
    const fs   = require('fs');
    const path = require('path');
    const os   = require('os');
    const { dialog, shell } = require('electron');

    // ── 1. 저장 경로 결정 ──
    let savePath;
    try {
        if (saveAs !== false) {
            const result = await dialog.showSaveDialog(mainWindow, {
                defaultPath: path.join(os.homedir(), 'Downloads', filename || 'download'),
                filters: [
                    { name: 'CSV',        extensions: ['csv'] },
                    { name: 'JSON',       extensions: ['json'] },
                    { name: 'Text',       extensions: ['txt'] },
                    { name: 'Excel',      extensions: ['xlsx', 'xls'] },
                    { name: 'All Files',  extensions: ['*'] }
                ],
                title: '파일 저장', buttonLabel: '저장'
            });
            if (result.canceled || !result.filePath) return { downloadId: 0, canceled: true };
            savePath = result.filePath;
        } else {
            savePath = path.join(os.homedir(), 'Downloads', filename || `xpider_${downloadId}`);
        }
    } catch(e) {
        return { downloadId: 0, error: e.message };
    }

    const basename = path.basename(savePath);

    // ── 2. 다운로드 시작 알림 ──
    _notifyDl('xpider-download-start', {
        downloadId, filename: basename, path: savePath,
        timestamp: new Date().toISOString(), status: 'downloading', progress: 0, size: 0
    });

    // ── 3a. content 직접 저장 ──
    if (content !== undefined && content !== null) {
        try {
            const buf = Buffer.from(content, 'utf8');
            const total = buf.length;
            _notifyDl('xpider-download-progress', { downloadId, progress: 50, receivedBytes: Math.floor(total / 2), totalBytes: total });
            fs.writeFileSync(savePath, buf);
            _notifyDl('xpider-download-progress', { downloadId, progress: 100, receivedBytes: total, totalBytes: total });
            const size = fs.statSync(savePath).size;
            _notifyDl('xpider-record-download', { downloadId, filename: basename, path: savePath, timestamp: new Date().toISOString(), size, status: 'completed' });
            try { shell.showItemInFolder(savePath); } catch(e) {}
            return { downloadId, path: savePath };
        } catch(e) {
            _notifyDl('xpider-download-error', { downloadId, error: e.message });
            return { downloadId: 0, error: e.message };
        }
    }

    // ── 3b. HTTP/HTTPS URL 다운로드 ──
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
        try {
            await new Promise((resolve, reject) => {
                const protocol = url.startsWith('https://') ? require('https') : require('http');
                const fileStream = fs.createWriteStream(savePath);
                let received = 0, total = 0, lastPct = -1;

                const req = protocol.get(url, { headers: { 'User-Agent': 'XPIDER/4.0' } }, (res) => {
                    if (res.statusCode !== 200) {
                        fileStream.destroy(); fs.unlink(savePath, ()=>{});
                        return reject(new Error(`HTTP ${res.statusCode}`));
                    }
                    total = parseInt(res.headers['content-length'] || '0', 10);
                    res.on('data', chunk => {
                        received += chunk.length;
                        const pct = total > 0 ? Math.round((received / total) * 100) : -1;
                        if (pct !== lastPct) {
                            lastPct = pct;
                            _notifyDl('xpider-download-progress', { downloadId, progress: pct, receivedBytes: received, totalBytes: total });
                        }
                    });
                    res.pipe(fileStream);
                    fileStream.on('finish', () => {
                        fileStream.close(() => {
                            _dlStreams.delete(downloadId);
                            const size = fs.existsSync(savePath) ? fs.statSync(savePath).size : received;
                            _notifyDl('xpider-record-download', { downloadId, filename: basename, path: savePath, timestamp: new Date().toISOString(), size, status: 'completed' });
                            try { shell.showItemInFolder(savePath); } catch(e) {}
                            resolve();
                        });
                    });
                    fileStream.on('error', err => { _dlStreams.delete(downloadId); reject(err); });
                });
                req.on('error', err => { fileStream.destroy(); _dlStreams.delete(downloadId); reject(err); });
                _dlStreams.set(downloadId, { req, fileStream });
            });
            return { downloadId, path: savePath };
        } catch(e) {
            log.error('[Downloader] URL 다운로드 실패:', e.message);
            _notifyDl('xpider-download-error', { downloadId, error: e.message });
            return { downloadId: 0, error: e.message };
        }
    }

    // ── 3c. 지원하지 않는 URL 형식 ──
    _notifyDl('xpider-download-error', { downloadId, error: '지원하지 않는 URL 형식입니다.' });
    return { downloadId: 0 };
});

// open-path IPC (Downloads 패널 클릭 → 파일 탐색기로 열기)
ipcMain.on('open-path', (event, filePath) => {
    try {
        const { shell } = require('electron');
        if (filePath && filePath.startsWith('/') || filePath.match(/^[A-Za-z]:\\/)) {
            shell.showItemInFolder(filePath);
        } else {
            shell.openExternal(filePath).catch(() => {});
        }
    } catch(e) {
        log.warn('[open-path] 실패:', e.message);
    }
});

// ─── [v4.0] 네이티브 다운로드 안전망 (will-download 인터셉터) ──────────────────
// IPC 브릿지를 우회하는 네이티브 다운로드를 가로채어 Downloads 패널에 기록
// ※ setSavePath()는 이 핸들러 안에서만 동기적으로 호출 가능
//   → dialog 없이 Electron 기본 저장 위치를 사용하고, 진행률/완료만 추적
app.whenReady().then(() => {
    session.defaultSession.on('will-download', (event, item, webContents) => {
        const filename   = item.getFilename() || 'download';
        const downloadId = Date.now();
        const path       = require('path');
        const os         = require('os');
        const { shell }  = require('electron');

        // 기본 저장 경로: ~/Downloads (Electron이 dialog를 띄우지 않도록 명시적 설정)
        const savePath = path.join(os.homedir(), 'Downloads', filename);
        item.setSavePath(savePath);

        log.info('[will-download] 네이티브 다운로드 감지:', filename, '→', savePath);

        // 다운로드 시작 알림
        _notifyDl('xpider-download-start', {
            downloadId, filename, path: savePath,
            timestamp: new Date().toISOString(), status: 'downloading', progress: 0, size: 0
        });

        // 진행률 추적
        item.on('updated', (_, state) => {
            if (state !== 'progressing') return;
            const received = item.getReceivedBytes();
            const total    = item.getTotalBytes();
            const progress = total > 0 ? Math.round((received / total) * 100) : -1;
            _notifyDl('xpider-download-progress', { downloadId, progress, receivedBytes: received, totalBytes: total });
        });

        // 완료/실패 처리
        item.on('done', (_, state) => {
            if (state === 'completed') {
                _notifyDl('xpider-record-download', {
                    downloadId, filename, path: item.getSavePath(),
                    timestamp: new Date().toISOString(), size: item.getReceivedBytes(), status: 'completed'
                });
                try { shell.showItemInFolder(item.getSavePath()); } catch(e) {}
            } else if (state !== 'cancelled') {
                _notifyDl('xpider-download-error', { downloadId, error: `다운로드 실패 (${state})` });
            }
        });
    });
});





// 업체당 한 번에 하나의 탭만 열리도록 순차 처리 (캡챠 우회용)
// closeTab을 await로 처리하여 탭이 완전히 닫힌 후 다음 탭이 열림
// ═══════════════════════════════════════════════════════════
// [v1.1.3] XPIDER 탭 큐 — 탭을 반드시 하나씩 열고 닫음
// ipcMain.handle은 병렬 처리 가능하므로 명시적 직렬화 큐 필요
// ═══════════════════════════════════════════════════════════
class XpiderTabQueue {
    constructor() { this._q = Promise.resolve(); }
    run(fn) {
        const result = this._q.then(fn).catch((e) => {
            log.error('[TabQueue] error:', e ? e.message : 'unknown');
            return null;
        });
        this._q = result.then(() => {}).catch(() => {});
        return result;
    }
}
const tabQueue = new XpiderTabQueue();

// 단일 숨겨진 스캔 윈도우 (절대로 show:true 하지 않음)
let _scanWin = null;

function _getScanWin() {
    if (_scanWin && !_scanWin.isDestroyed()) return _scanWin;
    const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
    _scanWin = new BrowserWindow({
        show: false,
        width: 1280,
        height: 900,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: false,
            javascript: true,
            session: session.defaultSession,
        }
    });
    _scanWin.webContents.setUserAgent(UA);
    _scanWin.on('closed', () => { _scanWin = null; });
    return _scanWin;
}

// ─── [v3.0] CAPTCHA 감지 + 새 탭 표시 + 해결 대기 시스템 ───
let _captchaResolveCallback = null;
let _captchaCheckInterval   = null;
let _captchaTabUIId         = null; // 새로 열린 캡챠 탭 ID
let _captchaResolvedAt      = 0;    // [v3.3] 마지막 해결 시각(ms) — 쿨다운 단속 제어용
const CAPTCHA_COOLDOWN_MS   = 15000; // 해결 후 15초 내 재감지 억제

// CAPTCHA 페이지 여부 감지 — Google /sorry/ 전용 (contact 페이지 reCAPTCHA 위젯 추룬 제외)
async function _isCaptchaPage(wc) {
    try {
        return await wc.executeJavaScript(`
            (function() {
                const hostname = window.location.hostname.toLowerCase();
                const pathname = window.location.pathname.toLowerCase();

                // [핵심] Google 도메인으로만 제한 — 일반 비즈니스 콘택트 페이지 제외
                const isGoogleDomain = hostname === 'www.google.com' ||
                                       hostname === 'google.com' ||
                                       hostname.endsWith('.google.com');

                if (!isGoogleDomain) return false; // 반드시 Google 도메인이어야 함

                // Google 도메인 내에서 /sorry/ 경로 확인
                const isSorryPath = pathname.includes('/sorry/');

                // Google 페이지 본문에서 unusual traffic 문언 확인
                const body = document.body ? document.body.innerText.toLowerCase() : '';
                const hasUnusualTraffic = body.includes('unusual traffic') ||
                                          body.includes('automated queries') ||
                                          body.includes('\uc790동화된 쿼리') ||
                                          body.includes('비정상적인 트래픽');

                return isSorryPath || hasUnusualTraffic;
            })()
        `);
    } catch(e) { return false; }
}

// ─── [v3.2] 봇 차단 페이지 감지 (Cloudflare, DDoS-Guard, etc.) ───────────────
// 이 페이지들은 실제 업체 데이터가 없으므로 수집에서 제외해야 함
async function _isBlockedPage(wc) {
    try {
        return await wc.executeJavaScript(`
            (function() {
                const body = document.body ? document.body.innerText : '';
                const html = document.documentElement ? document.documentElement.innerHTML : '';
                const title = document.title || '';
                const url = window.location.href;

                // Cloudflare 차단 페이지 시그니처
                const cfSignals = [
                    'Checking if the site connection is secure',
                    'Enable JavaScript and cookies',
                    'cf-browser-verification',
                    'Ray ID:',              // Cloudflare Ray ID
                    'cloudflare.com/cdn-cgi',
                    'cf-challenge',
                    'Verifying you are human',
                    '보안 확인 수행 중',
                    'Just a moment...',
                ];
                const hasCF = cfSignals.some(s => body.includes(s) || html.includes(s) || title.includes(s));

                // DDoS-Guard
                const hasDDOS = body.includes('DDoS') && (body.includes('protection') || body.includes('보호'));

                // 기타 일반 봇 차단
                const hasGenericBlock = 
                    title === 'Just a moment...' ||
                    title === 'Attention Required! | Cloudflare' ||
                    title.includes('Security Check') ||
                    title.includes('보안 확인') ||
                    title.includes('Access Denied') ||
                    title.includes('403 Forbidden') ||
                    html.includes('__cf_bm') ||           // Cloudflare bot management cookie
                    html.includes('cf_clearance');        // Cloudflare clearance cookie field

                return hasCF || hasDDOS || hasGenericBlock;
            })()
        `);
    } catch(e) { return false; }
}


// CAPTCHA 감지 → 새 탭 열기 → 해결 대기 → 완료 반환
async function _handleCaptchaDetected(captchaUrl) {
    // [v3.3] 쿨다운: 해결 후 15초 내 재감지 억제 — ghost popup 방지
    const timeSinceResolved = Date.now() - _captchaResolvedAt;
    if (timeSinceResolved < CAPTCHA_COOLDOWN_MS) {
        log.info(`[CAPTCHA] 쿨다운 중 재감지 무시 (${Math.round(timeSinceResolved/1000)}s / ${CAPTCHA_COOLDOWN_MS/1000}s)`);
        return false;
    }

    // [v3.3] 이미 대기 중이면 재진입 차단
    if (_captchaResolveCallback) {
        log.info('[CAPTCHA] 이미 CAPTCHA 대기 중 — 재진입 무시');
        return new Promise(r => { /* 기존 콜백이 해결하면 true/false 반환 */ });
    }

    // [v3.3] _captchaTabUIId 고착 방지: 너무 오래된 ID는 믴효화
    // (5초 이상 된 _captchaTabUIId는 이미 닫힌 탭으로 간주하고 다시 탭을 열어야 함)
    if (_captchaTabUIId && timeSinceResolved > 5000) {
        log.warn('[CAPTCHA] _captchaTabUIId 고착 감지 → 강제 null 리셋');
        _captchaTabUIId = null;
    }

    log.warn(`[CAPTCHA] 감지! → ${captchaUrl.substring(0, 80)}`);

    // 1. 메인 브라우저에 새 탭 열기 (사용자에게 직접 보여주기)
    //    [v3.2] 이미 _captchaTabUIId가 설정된 경우(브라우저 탭이 CAPTCHA로 리다이렉트된 상황)는
    //    새 탭을 열지 않고 기존 탭을 그대로 사용
    if (!_captchaTabUIId && mainWindow && !mainWindow.isDestroyed()) {
        try {
            const result = await mainWindow.webContents.executeJavaScript(`
                (function() {
                    if (typeof createNewTab !== 'function') return 'ERR_NO_FUNC';
                    createNewTab(${JSON.stringify(captchaUrl)}, true);
                    // 전역 window.tabs가 이제 노출되어 있음 (renderer_ui.js 수정됨)
                    const ts = window.tabs || [];
                    return ts.length > 0 ? ts[ts.length - 1].id : 'ERR_NO_TAB';
                })()
            `);
            _captchaTabUIId = (result && !result.startsWith('ERR_')) ? result : null;
            log.info(`[CAPTCHA] 새 탭 생성 시도 결과: ${result} (저장된 ID: ${_captchaTabUIId})`);

            // 새로 열린 탭을 캡챠 탭으로 마킹 (did-navigate 감지 연동)
            if (_captchaTabUIId) {
                await mainWindow.webContents.executeJavaScript(`
                    window._captchaTabId = ${JSON.stringify(_captchaTabUIId)};
                    console.log('[CAPTCHA] 새 탭 캡챠 마킹:', window._captchaTabId);
                `);
            }
        } catch(e) {
            log.warn('[CAPTCHA] 탭 열기 executeJavaScript 실패:', e.message);
        }
    } else if (_captchaTabUIId) {
        log.info(`[CAPTCHA] 기존 탭 재사용 (ID: ${_captchaTabUIId}) — 다시 열지 않음`);
    }


    // 탭 ID를 못 얻었더라도 일단 멈추고 대기 (수동 재개 가능하게)
    if (!_captchaTabUIId) {
        log.error('[CAPTCHA] 탭 ID를 획득하지 못했습니다. 수동 재개가 필요할 수 있습니다.');
    }

    // 2. ── [핵심] 모든 수집 프로세스 일시중지 ──────────────────
    broadcastExtMessage({ action: 'CAPTCHA_PAUSE_ALL' });
    log.info('[CAPTCHA] ⏸️ 전체 수집 일시중지 브로드캐스트 완료');

    // 3. 익스텐션 팝업에 상태 알림
    broadcastExtMessage({
        action: 'CAPTCHA_STATUS',
        status: 'detected',
        captchaUrl,
        tabOpened: !!_captchaTabUIId
    });

    // 4. 해결 대기 (수동 버튼 OR 자동감지, 최대 9분)
    const resolved = await new Promise((resolve) => {
        _captchaResolveCallback = resolve;

        // 9분 타임아웃 — 바이패스 모드
        const timeout = setTimeout(() => {
            if (_captchaResolveCallback === resolve) {
                _captchaResolveCallback = null;
                if (_captchaCheckInterval) { clearInterval(_captchaCheckInterval); _captchaCheckInterval = null; }
                // 타임아웃시 true로 resolve(bypass) — 수집은 잠시 후 다시 시작
                broadcastExtMessage({ action: 'CAPTCHA_STATUS', status: 'bypassed', auto: true });
                broadcastExtMessage({ action: 'CAPTCHA_RESUME_ALL' });
                broadcastExtMessage({ action: 'MANUAL_CAPTCHA_RESOLVED' });
                _captchaResolvedAt = Date.now(); // 쿨다운
                log.warn('[CAPTCHA] 9분 타임아웃 → 자동 바이패스 실행');
                resolve(true); // true로 바이패스 — 수집 재개
            }
        }, 540000);

        // 자동 감지: 2초마다 캡챠용 UI 탭의 상태를 직접 확인
        // [v3.1] did-navigate 이벤트에서 먼저 resolve() 호출 시 폴링이 중복 동작하지 않도록
        //        _captchaResolveCallback 이 null 이면 이미 처리된 것이므로 즉시 인터벌 종료
        _captchaCheckInterval = setInterval(async () => {
            try {
                // 이미 다른 경로(did-navigate IPC)로 해결된 경우 → 인터벌 자동 정리
                if (_captchaResolveCallback !== resolve) {
                    clearInterval(_captchaCheckInterval);
                    _captchaCheckInterval = null;
                    return;
                }

                if (!mainWindow || mainWindow.isDestroyed() || !_captchaTabUIId) return;
                
                const tabStatus = await mainWindow.webContents.executeJavaScript(`
                    (function() {
                        const tabId = ${JSON.stringify(_captchaTabUIId)};
                        const wv = document.getElementById('webview-' + tabId);
                        // 웹뷰가 삭제되었거나 탭이 닫혔다면
                        if (!wv) return 'CLOSED';
                        
                        let url = '';
                        try { 
                            url = wv.getURL(); 
                        } catch(e) { 
                            url = wv.src || ''; 
                        }
                        
                        // 아직 캡챠 페이지인 경우
                        if (url.includes('/sorry/') || url.includes('recaptcha')) return 'CAPTCHA';
                        
                        // 캡챠가 풀려 검색결과로 이동했거나 about:blank인 경우
                        if (url.includes('google.com/search') || url.includes('bing.com/search') || url === 'about:blank') return 'RESOLVED';
                        
                        return 'UNKNOWN';
                    })()
                `);

                if (tabStatus !== 'CAPTCHA' && tabStatus !== 'UNKNOWN') {
                    log.info(`[CAPTCHA-POLL] 상태 감지됨: ${tabStatus} (해결 처리 시작)`);
                }

                // 탭이 스스로 닫혔거나, 정상 해결(about:blank/검색결과) 상태가 된 경우 즉시 해결 처리
                if (tabStatus === 'RESOLVED' || tabStatus === 'CLOSED') {
                    clearInterval(_captchaCheckInterval);
                    clearTimeout(timeout);
                    _captchaCheckInterval = null;
                    // 중복 호출 방지: 콜백이 아직 살아있는 경우에만 실행
                    if (_captchaResolveCallback === resolve) {
                        _captchaResolveCallback = null;
                        log.info('[CAPTCHA-POLL] ✅ 자동 해결 감지! (상태: ' + tabStatus + ')');
                        broadcastExtMessage({ action: 'CAPTCHA_STATUS', status: 'resolved', auto: true, source: 'poll' });
                        resolve(true);
                    }
                }
            } catch(e) {}
        }, 2000);
    });

    // 5. ── [핵심] 해결 후 캡챠 탭 강제 닫기 (2중 방식) ──────────────
    await _closeCaptchaTab(captchaUrl);

    // 6. ── [핵심] 전체 수집 프로세스 재개 ────────────────────────
    broadcastExtMessage({ action: 'CAPTCHA_RESUME_ALL' });
    log.info('[CAPTCHA] ▶️ 전체 수집 재개 브로드캐스트 완료');

    if (_captchaCheckInterval) { clearInterval(_captchaCheckInterval); _captchaCheckInterval = null; }
    return resolved;
}

// CAPTCHA 탭 닫기 — 2중 방식 (renderer closeTab + webContents destroy)
async function _closeCaptchaTab(captchaUrl) {
    // 방법 1: 렌더러의 closeTab() 함수를 이용하여 UI 상의 탭 삭제
    if (mainWindow && !mainWindow.isDestroyed()) {
        try {
            const result = await mainWindow.webContents.executeJavaScript(`
                (function() {
                    let closedCount = 0;
                    if (typeof closeTab === 'function' && window.tabs && Array.isArray(window.tabs)) {
                        // 1. _captchaTabUIId 가 있으면 먼저 닫기
                        const targetId = ${JSON.stringify(_captchaTabUIId)};
                        if (targetId) {
                            closeTab(targetId);
                            closedCount++;
                        }
                        
                        // 2. 현재 열린 탭들 중 about:blank / google|bing 검색결과 / sorry 인 탭 모두 닫기
                        const tabsToClose = window.tabs.filter(t => {
                            if (!t || !t.url) return false;
                            const url = t.url;
                            return url === 'about:blank'
                                || url.includes('/sorry/')
                                || url.includes('recaptcha')
                                || url.includes('google.com/search')
                                || url.includes('bing.com/search');
                        });
                        
                        for (const t of tabsToClose) {
                            if (t.id !== targetId) { // 중복 방지
                                closeTab(t.id);
                                closedCount++;
                            }
                        }
                    }
                    return closedCount;
                })()
            `);
            log.info(`[CAPTCHA] 탭 닫기 UI 방식 성공 (닫힌 탭 수: ${result})`);
        } catch(e) {
            log.warn('[CAPTCHA] 탭 닫기 UI 방식 실패:', e.message);
        }
        _captchaTabUIId = null;
    }

    // 방법 2: UI에서 못 닫은 webContents가 남아있다면 강제 파괴 또는 about:blank 이동
    try {
        const allWc = webContents.getAllWebContents();
        for (const wc of allWc) {
            // [핵심 Fix] UI 탭(webview)만 대상으로 하여 백그라운드 프로세스의 OOPIF 건드리는 것 방지
            if (typeof wc.getType === 'function' && wc.getType() !== 'webview') continue;
            
            const wcUrl = wc.getURL();
            if (wcUrl.includes('/sorry/') || wcUrl.includes('recaptcha') || wcUrl === 'about:blank' ||
                (captchaUrl && wcUrl.includes(new URL(captchaUrl).hostname || ''))) {
                
                // loadURL 대신 webview를 소유한 렌더러 측의 요소가 사라졌을 수 있으므로 강제로 빈 페이지 로드
                wc.loadURL('about:blank').catch(() => {});
            }
        }
    } catch(e) {}
}


// ─── [v3.2] renderer_ui.js did-stop-loading → 탭이 CAPTCHA로 리다이렉트됨 감지 ───
// 브라우저 탭 자체가 Google /sorry/ CAPTCHA로 이동한 경우 새 탭 열기 불필요
// 해당 탭 UI ID를 저장하고 CAPTCHA 대기 루프를 시작─────────────
ipcMain.on('xpider-captcha-tab-detected', async (event, { tabUIId, captchaUrl }) => {
    log.warn(`[CAPTCHA-DETECT] 탭 CAPTCHA 리다이렉트 감지: tabUIId=${tabUIId} url=${(captchaUrl||'').substring(0, 80)}`);

    // 이미 다른 수단으로 캡챠 처리 중이면 무시 (중복 방지)
    if (_captchaResolveCallback) {
        log.info('[CAPTCHA-DETECT] 이미 CAPTCHA 대기 중 — 탭 ID만 업데이트');
        _captchaTabUIId = tabUIId; // 탭 ID 업데이트
        return;
    }

    // 탭 ID 저장
    _captchaTabUIId = tabUIId;

    // CAPTCHA 일시정지 브로드캐스트
    broadcastExtMessage({ action: 'CAPTCHA_PAUSE_ALL' });
    broadcastExtMessage({
        action: 'CAPTCHA_STATUS',
        status: 'detected',
        captchaUrl,
        tabOpened: true
    });
    log.info('[CAPTCHA-DETECT] ⏸️ CAPTCHA 일시정지 브로드캐스트 완료');

    // 5분 대기 Promise 시작 (9분으로 연장)
    const resolved = await new Promise((resolve) => {
        _captchaResolveCallback = resolve;

        // 9분 타임아웃 — 바이패스 모드
        const timeout = setTimeout(() => {
            if (_captchaResolveCallback === resolve) {
                _captchaResolveCallback = null;
                if (_captchaCheckInterval) { clearInterval(_captchaCheckInterval); _captchaCheckInterval = null; }
                broadcastExtMessage({ action: 'CAPTCHA_STATUS', status: 'bypassed', auto: true });
                broadcastExtMessage({ action: 'CAPTCHA_RESUME_ALL' });
                broadcastExtMessage({ action: 'MANUAL_CAPTCHA_RESOLVED' });
                _captchaResolvedAt = Date.now(); // 쿨다운
                log.warn('[CAPTCHA-DETECT] 9분 타임아웃 → 자동 바이패스');
                resolve(true); // 자동 바이패스 — 수집 재개
            }
        }, 540000);

        // 2초마다 탭 상태 폴링
        _captchaCheckInterval = setInterval(async () => {
            try {
                if (_captchaResolveCallback !== resolve) {
                    clearInterval(_captchaCheckInterval);
                    _captchaCheckInterval = null;
                    return;
                }
                if (!mainWindow || mainWindow.isDestroyed() || !_captchaTabUIId) return;

                const tabStatus = await mainWindow.webContents.executeJavaScript(`
                    (function() {
                        const wv = document.getElementById('webview-' + ${JSON.stringify(_captchaTabUIId)});
                        if (!wv) return 'CLOSED';
                        let url = '';
                        try { url = wv.getURL(); } catch(e) { url = wv.src || ''; }
                        if (url.includes('/sorry/') || url.includes('recaptcha')) return 'CAPTCHA';
                        if (url.includes('google.com/search') || url.includes('bing.com/search') || url === 'about:blank') return 'RESOLVED';
                        return 'UNKNOWN';
                    })()
                `);

                if (tabStatus === 'RESOLVED' || tabStatus === 'CLOSED') {
                    clearInterval(_captchaCheckInterval);
                    clearTimeout(timeout);
                    _captchaCheckInterval = null;
                    if (_captchaResolveCallback === resolve) {
                        _captchaResolveCallback = null;
                        log.info(`[CAPTCHA-DETECT] ✅ 해결 감지 (${tabStatus})`);
                        broadcastExtMessage({ action: 'CAPTCHA_STATUS', status: 'resolved', auto: true, source: 'tab-detect' });
                        resolve(true);
                    }
                }
            } catch(e) {}
        }, 2000);
    });

    // 해결 후 수집 재개 + 탭 닫기
    if (resolved) {
        broadcastExtMessage({ action: 'CAPTCHA_RESUME_ALL' });
        broadcastExtMessage({ action: 'MANUAL_CAPTCHA_RESOLVED' });
        log.info('[CAPTCHA-DETECT] ▶️ 수집 재개 브로드캐스트 완료');
    }
    await _closeCaptchaTab(captchaUrl);
    if (_captchaCheckInterval) { clearInterval(_captchaCheckInterval); _captchaCheckInterval = null; }
});

// 수동 [계속] 버튼 IPC — popup.js에서 호출
ipcMain.handle('xpider-captcha-resume', async () => {
    if (_captchaResolveCallback) {
        log.info('[CAPTCHA] 수동 재개 요청 수신');
        broadcastExtMessage({ action: 'CAPTCHA_STATUS', status: 'resolved', auto: false });
        const cb = _captchaResolveCallback;
        _captchaResolveCallback = null;
        if (_captchaCheckInterval) { clearInterval(_captchaCheckInterval); _captchaCheckInterval = null; }
        cb(true);
        return { success: true };
    }
    return { success: false, message: '대기 중인 CAPTCHA 없음' };
});

// ─── [v3.2] renderer_ui.js did-navigate → 캡챠 해결 즉시 감지 + 팝업 닫기 + 탭 강제 닫기 ───
// 동작 순서:
//  1. 폴링 중단 → 2. 해결콜백 실행 → 3. CAPTCHA_STATUS resolved (팝업 모달 닫기)
//  4. CAPTCHA_RESUME_ALL (background.js 수집 재개) → 5. MANUAL_CAPTCHA_RESOLVED (isPausedByCaptcha 해제)
//  6. 300ms 후 열린 탭 강제 닫기
ipcMain.on('xpider-captcha-tab-resolved', async (event, { tabUIId, url }) => {
    log.info(`[CAPTCHA-NAV] 탭 네비게이션 감지: tabUIId=${tabUIId} url=${(url||'').substring(0, 80)}`);

    // [v3.3] 쿨다운 즉시 설정 + _captchaTabUIId 즉시 null — ghost 재감지 방지
    _captchaResolvedAt = Date.now();
    _captchaTabUIId = null;
    log.info('[CAPTCHA-NAV] 쿨다운 시작 + tabUIId null 리셋');

    // 1. 폴링 인터벌 즉시 중단
    if (_captchaCheckInterval) {
        clearInterval(_captchaCheckInterval);
        _captchaCheckInterval = null;
        log.info('[CAPTCHA-NAV] 폴링 인터벌 중단');
    }

    // 2. 해결 콜백 실행 (_handleCaptchaDetected Promise 해결)
    if (_captchaResolveCallback) {
        log.info('[CAPTCHA-NAV] ✅ 해결 콜백 실행');
        const cb = _captchaResolveCallback;
        _captchaResolveCallback = null;
        cb(true);
    }

    // 3. popup.js CAPTCHA 모달 닫기 → CAPTCHA_STATUS resolved 브로드캐스트
    broadcastExtMessage({ action: 'CAPTCHA_STATUS', status: 'resolved', auto: true, source: 'nav' });
    log.info('[CAPTCHA-NAV] CAPTCHA_STATUS resolved → 팝업 모달 닫힘');

    // 4. background.js 수집 루프 재개
    broadcastExtMessage({ action: 'CAPTCHA_RESUME_ALL' });

    // 5. background.js isPausedByCaptcha 강제 해제
    broadcastExtMessage({ action: 'MANUAL_CAPTCHA_RESOLVED' });
    log.info('[CAPTCHA-NAV] ▶️ 수집 재개 신호 전체 브로드캐스트 완료');

    // 6-A. [v3.3] 직접 강제 닫기 — broadcastExtMessage 유실 대비 3중 보장
    // mainWindow.executeJavaScript → extensionWebview.send('xpider-captcha-force-close')
    // → ext-preload.js → postMessage → popup.js window.addEventListener 수신
    const _forceCloseModal = async (attempt) => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        try {
            await mainWindow.webContents.executeJavaScript(`
                (function() {
                    const extWv = document.getElementById('extension-webview');
                    if (extWv && typeof extWv.send === 'function') {
                        extWv.send('xpider-captcha-force-close');
                        return 'sent';
                    }
                    return 'no-webview';
                })()
            `);
            log.info('[CAPTCHA-NAV] force-close 신호 발송 (시도 ' + attempt + '/3)');
        } catch(e) {
            log.warn('[CAPTCHA-NAV] force-close 발송 실패 (' + attempt + '):', e.message);
        }
    };
    // 0ms / 500ms / 1500ms 3회 재시도
    _forceCloseModal(1);
    setTimeout(() => _forceCloseModal(2), 500);
    setTimeout(() => _forceCloseModal(3), 1500);

    // 6. 열린 탭 강제 닫기 (renderer_ui.js did-navigate의 500ms setTimeout과 겹치지 않게 300ms 후 실행)
    setTimeout(async () => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        try {
            const closedIds = await mainWindow.webContents.executeJavaScript(`
                (function() {
                    const tid = ${JSON.stringify(tabUIId)};
                    const closedIds = [];
                    if (typeof closeTab !== 'function' || !Array.isArray(window.tabs)) return closedIds;

                    // (a) tabUIId 직접 닫기
                    if (tid && window.tabs.find(t => t.id === tid)) {
                        closeTab(tid);
                        closedIds.push(tid);
                    }

                    // (b) about:blank / 구글·빙 검색결과 / sorry 탭 모두 닫기
                    window.tabs
                        .filter(t => t && t.url && t.id !== tid && (
                            t.url === 'about:blank' ||
                            t.url.includes('google.com/search') ||
                            t.url.includes('bing.com/search') ||
                            t.url.includes('/sorry/')
                        ))
                        .forEach(t => { closeTab(t.id); closedIds.push(t.id); });

                    return closedIds;
                })()
            `).catch(() => []);

            if (closedIds && closedIds.length > 0) {
                log.info(`[CAPTCHA-NAV] 탭 강제 닫기: [${closedIds.join(', ')}]`);
            } else {
                log.info('[CAPTCHA-NAV] 닫을 탭 없음 (이미 닫혔거나 없음)');
            }
        } catch(e) {
            log.warn('[CAPTCHA-NAV] 탭 닫기 실패:', e.message);
        }
    }, 300);
});

async function _scanUrlWithHiddenWin(url, waitMs = 6000) {
    const EMPTY = { emails:[], phone:'', address:'', homepage:'', sns:[], contactLinks:[], pageText:'' };
    try {
        const win = _getScanWin();
        const wc = win.webContents;
        const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
        await new Promise((resolve) => {
            let done = false;
            const finish = (delay = 0) => { if (!done) { done = true; setTimeout(resolve, delay); } };
            const timer = setTimeout(() => finish(), waitMs + 5000); // 최대 대기
            wc.once('did-finish-load', () => { clearTimeout(timer); finish(1500); }); // 로드 완료 후 1.5초 렌더링 대기
            wc.once('did-fail-load', (e, code) => {
                log.warn(`[ScanWin] did-fail-load code=${code}`);
                clearTimeout(timer);
                finish(2000); // [FIX] 즉시 종료 없이 2초 후 추출 시도
            });
            wc.loadURL(url, { userAgent: UA }).catch(err => { log.warn(`[ScanWin] loadURL: ${err.message}`); finish(2000); });
        });

        // [v3.0] CAPTCHA 감지 및 처리
        const captchaDetected = await _isCaptchaPage(wc);
        if (captchaDetected) {
            const captchaUrl = wc.getURL();
            log.warn(`[ScanWin] CAPTCHA 감지 → 새 탭 열기 및 대기: ${captchaUrl.substring(0, 60)}`);
            const resolved = await _handleCaptchaDetected(captchaUrl);
            if (!resolved) {
                log.warn('[ScanWin] CAPTCHA 미해결 — 이 URL 건너뜀');
                return EMPTY;
            }
            // 해결 후 원본 URL 재시도
            log.info('[ScanWin] CAPTCHA 해결 — 원본 URL 재시도:', url);
            await new Promise((resolve2) => {
                let done = false;
                const finish2 = (d = 0) => { if (!done) { done = true; setTimeout(resolve2, d); } };
                const t2 = setTimeout(() => finish2(), waitMs + 5000);
                wc.once('did-finish-load', () => { clearTimeout(t2); finish2(1500); });
                wc.once('did-fail-load',   () => { clearTimeout(t2); finish2(2000); });
                wc.loadURL(url, { userAgent: UA }).catch(() => finish2(2000));
            });
        }

        // [v3.2] Cloudflare / 봇 차단 페이지 감지 — 잘못된 데이터 수집 방지
        const isBlocked = await _isBlockedPage(wc);
        if (isBlocked) {
            log.warn(`[ScanWin] 봇 차단 페이지 감지 (Cloudflare 등) → 건너뜀: ${url.substring(0, 60)}`);
            return EMPTY;
        }

        const result = await wc.executeJavaScript(`
            (function() {
                try {
                    const pageText = document.body ? document.body.innerText : '';
                    const origin = window.location.origin;
                    const h = window.location.hostname;
                    const isGoogle = h.includes('google.');
                    const isBing = h.includes('bing.com');
                    let phone = '', address = '', homepage = '', emails = [], sns = [], contactLinks = [];
                    document.querySelectorAll('a[href^="mailto:"]').forEach(a => {
                        const em = a.href.replace(/^mailto:/i,'').split('?')[0].trim().toLowerCase();
                        if (em && em.includes('@')) emails.push(em);
                    });
                    (pageText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}/g)||[]).forEach(e => {
                        const el = e.toLowerCase();
                        if (!['google.com','sentry.io','example.com','wixpress.com','schema.org'].some(d => el.includes(d))) emails.push(el);
                    });
                    const telEl = document.querySelector('a[href^="tel:"]');
                    if (telEl) phone = telEl.href.replace(/^tel:/i,'').trim();
                    if (!phone) { const m = pageText.match(/[+]?[(]?[0-9]{1,4}[)]?[-\\s.]?[(]?[0-9]{1,4}[)]?[-\\s.][0-9]{3,4}[-\\s.][0-9]{3,4}/); if (m) phone = m[0]; }
                    const addrEl = document.querySelector('[itemprop="address"],.address,[class*="address"],[itemtype*="PostalAddress"]');
                    if (addrEl) address = addrEl.innerText.trim();
                    const snsDomains = ['facebook.com','instagram.com','twitter.com','x.com','linkedin.com','youtube.com','tiktok.com'];
                    document.querySelectorAll('a[href]').forEach(a => { if (a.href && snsDomains.some(d => a.href.toLowerCase().includes(d))) sns.push(a.href); });
                    if (isGoogle) {
                        const gAddr = document.querySelector('[data-attrid="kc:/local:address"],[data-local-attribute="d3adr"],.LrzXr,.y35z8c');
                        if (gAddr) address = gAddr.innerText.replace(/^Address:/i,'').trim();
                        const gTel = document.querySelector('[data-local-attribute="d3ph"],[data-attrid="kc:/local:phone"],a[href^="tel:"]');
                        if (gTel) phone = (gTel.innerText||gTel.href||'').replace(/^tel:|^Phone:/i,'').trim();
                        const gWeb = document.querySelector('a.ab_button[href*="http"],a.mI8Ptc[href*="http"],a[data-item-id="authority"],a[aria-label="Website"]');
                        if (gWeb && !gWeb.href.includes('google.')) homepage = gWeb.href;
                        if (!homepage) {
                            const searchLinks = document.querySelectorAll('.yuRUbf a,.tF2Cxc a[href*="http"],.g a[href*="http"],h3+div a[href*="http"]');
                            for (const l of searchLinks) {
                                try {
                                    const u = new URL(l.href);
                                    const skip = ['google.','yelp.com','yellowpages.','bing.com','facebook.com','wikipedia.org','mapquest.','bbb.org'].some(d => u.hostname.includes(d));
                                    if (!skip) { homepage = l.href; break; }
                                } catch(e) {}
                            }
                        }
                    } else if (isBing) {
                        const bAddr = document.querySelector('.b_address,.l_staddr');
                        if (bAddr) address = bAddr.innerText.trim();
                        const bTel = document.querySelector('.b_phone,.l_sttel,a[href^="tel:"]');
                        if (bTel) phone = (bTel.innerText||bTel.href||'').replace(/^tel:/i,'').trim();
                        const bWeb = document.querySelector('a[aria-label="Website"],.l_stweb');
                        if (bWeb) homepage = bWeb.href;
                    } else {
                        const contactKeywords = ['contact','about','reach','connect','get-in-touch','kontakt','nous-contacter','contacto'];
                        document.querySelectorAll('a[href]').forEach(a => {
                            try {
                                const href = new URL(a.href, window.location.href).href;
                                const lo = href.toLowerCase(), text = (a.innerText||'').toLowerCase().trim();
                                if (contactKeywords.some(k => lo.includes(k)||text.includes(k)) && href.startsWith(origin) && !lo.includes('mailto:') && !lo.match(/\\.(pdf|jpg|png|gif)$/i)) contactLinks.push(href);
                            } catch(e) {}
                        });
                    }
                    return { emails:[...new Set(emails)].slice(0,5), phone, address, homepage, sns:[...new Set(sns)].slice(0,5), contactLinks:[...new Set(contactLinks)].slice(0,3), pageText:pageText.slice(0,4000) };
                } catch(err) { return null; }
            })()
        `).catch(() => null);
        log.info(`[ScanWin] ${url.substring(0,60)} → hp=${result && result.homepage ? result.homepage.substring(0,40) : 'NONE'}`);
        return result || EMPTY;
    } catch(e) {
        log.error('[ScanWin]', e.message);
        return EMPTY;
    }
}

// ─── [v2.2] 스크롤+페이지네이션 크롤러 (URL 탭 전용) ────────
// scrollSteps: 각 레벨에서 하단 스크롤 반복 횟수 (무한스크롤 지원)
// 스크롤 후 새 콘텐츠 감지, 다음 페이지 URL 자동 감지 포함
async function _crawlUrlWithScroll(url, { scrollSteps = 5, scrollWaitMs = 2500, pageWaitMs = 7000 } = {}) {
    const EMPTY = { allText: '', nextPageUrl: null, scrollCount: 0, emails: [], phone: '', address: '', sns: [] };
    try {
        const win = _getScanWin();
        const wc = win.webContents;
        const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

        // 페이지 로드
        await new Promise((resolve) => {
            let done = false;
            const finish = (delay = 0) => { if (!done) { done = true; setTimeout(resolve, delay); } };
            const timer = setTimeout(() => finish(), pageWaitMs + 8000);
            wc.once('did-finish-load', () => { clearTimeout(timer); finish(2000); });
            wc.once('did-fail-load', (e, code) => { clearTimeout(timer); log.warn(`[CrawlScroll] fail code=${code}`); finish(1500); });
            wc.loadURL(url, { userAgent: UA }).catch(err => { log.warn(`[CrawlScroll] loadURL: ${err.message}`); finish(1500); });
        });

        // 초기 텍스트 수집
        let allText = await wc.executeJavaScript(`document.body ? document.body.innerText : ''`).catch(() => '');
        let actualScrolls = 0;

        // [v3.2] Cloudflare / 봇 차단 페이지 감지 — 잘못된 데이터 수집 방지
        const isBlockedScroll = await _isBlockedPage(wc);
        if (isBlockedScroll) {
            log.warn(`[CrawlScroll] 봇 차단 페이지 감지 → 건너뜀: ${url.substring(0, 60)}`);
            return EMPTY;
        }

        // 무한스크롤: 지정 횟수만큼 하단 스크롤 반복
        for (let i = 0; i < scrollSteps; i++) {
            const prevLen = allText.length;
            // JS로 맨 아래 스크롤 (일반 + SPA 양쪽 지원)
            await wc.executeJavaScript(`
                (function() {
                    const h = Math.max(
                        document.body.scrollHeight,
                        document.documentElement.scrollHeight
                    );
                    window.scrollTo({ top: h, behavior: 'smooth' });
                    document.documentElement.scrollTop = h;
                    // React/Vue 앱을 위한 추가 스크롤 트리거
                    window.dispatchEvent(new Event('scroll'));
                    window.dispatchEvent(new Event('wheel'));
                })()
            `).catch(() => {});

            // 새 콘텐츠 로드 대기
            await new Promise(r => setTimeout(r, scrollWaitMs));

            // 업데이트된 텍스트 수집
            const newText = await wc.executeJavaScript(`document.body ? document.body.innerText : ''`).catch(() => '');
            actualScrolls++;

            // 새 콘텐츠가 100자 이상 추가된 경우에만 계속
            if (newText.length > prevLen + 100) {
                allText = newText;
            } else {
                log.info(`[CrawlScroll] No new content after scroll ${i + 1}. Stopping scroll.`);
                break;
            }
        }

        // 다음 페이지 URL 감지 (페이지네이션)
        const nextPageUrl = await wc.executeJavaScript(`
            (function() {
                // 1순위: rel="next" 링크
                const relNext = document.querySelector('a[rel="next"]');
                if (relNext && relNext.href && relNext.href.startsWith('http')) return relNext.href;

                // 2순위: aria-label / class 기반
                const selectors = [
                    'a[aria-label="Next page"]', 'a[aria-label="Next"]',
                    '.pagination .next a', '.pager-next a', 'li.next > a',
                    '.next-page a', 'a.next', 'a.next-page',
                    '[class*="pagination"] a[class*="next"]',
                    '[class*="pager"] a[class*="next"]',
                    'nav a[class*="next"]'
                ];
                for (const sel of selectors) {
                    try {
                        const el = document.querySelector(sel);
                        if (el && el.href && el.href.startsWith('http') && !el.href.includes('javascript:')) return el.href;
                    } catch(e) {}
                }

                // 3순위: 텍스트 기반 감지
                const nextTexts = ['next', '다음', '次', 'suivant', 'siguiente', '›', '»', 'next page', '다음 페이지'];
                const links = document.querySelectorAll('a[href]');
                for (const a of links) {
                    const txt = (a.innerText || a.textContent || '').toLowerCase().trim();
                    if (nextTexts.includes(txt) && a.href.startsWith('http') && !a.href.includes('javascript:')) {
                        return a.href;
                    }
                }

                // 4순위: URL 패턴 기반 (page=N → page=N+1)
                const cur = window.location.href;
                const pageMatch = cur.match(/[?&](page|p|pg|paged|start|offset)=(\d+)/i);
                if (pageMatch) {
                    const nextNum = parseInt(pageMatch[2]) + 1;
                    return cur.replace(pageMatch[0], pageMatch[0].replace(pageMatch[2], nextNum));
                }

                return null;
            })()
        `).catch(() => null);

        // 이메일/전화/SNS 추출 (페이지 본문에서)
        const extras = await wc.executeJavaScript(`
            (function() {
                const txt = document.body ? document.body.innerText : '';
                const emails = [];
                document.querySelectorAll('a[href^="mailto:"]').forEach(a => {
                    const em = a.href.replace(/^mailto:/i,'').split('?')[0].trim().toLowerCase();
                    if (em && em.includes('@')) emails.push(em);
                });
                (txt.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}/g)||[]).forEach(e => {
                    const el = e.toLowerCase();
                    if (!['google.com','sentry.io','example.com','wixpress.com'].some(d => el.includes(d))) emails.push(el);
                });
                const telEl = document.querySelector('a[href^="tel:"]');
                const phone = telEl ? telEl.href.replace(/^tel:/i,'').trim() : '';
                const snsDomains = ['facebook.com','instagram.com','twitter.com','x.com','linkedin.com','youtube.com','tiktok.com'];
                const sns = [];
                document.querySelectorAll('a[href]').forEach(a => {
                    if (a.href && snsDomains.some(d => a.href.toLowerCase().includes(d))) sns.push(a.href);
                });
                return { emails: [...new Set(emails)].slice(0, 5), phone, sns: [...new Set(sns)].slice(0, 10) };
            })()
        `).catch(() => ({ emails: [], phone: '', sns: [] }));

        log.info(`[CrawlScroll] ${url.substring(0,60)} scrolls=${actualScrolls} textLen=${allText.length} nextPage=${nextPageUrl ? nextPageUrl.substring(0,40) : 'NONE'}`);
        return { allText: allText.slice(0, 60000), nextPageUrl, scrollCount: actualScrolls, ...(extras || {}) };
    } catch(e) {
        log.error('[CrawlScroll]', e.message);
        return EMPTY;
    }
}

// ─── IPC 핸들러 (모두 단일 숨겨진 윈도우 재사용) ──────────
// [v2.2] xpider-crawl-with-scroll: URL 탭 전용 — 스크롤+페이지네이션 크롤러
ipcMain.handle('xpider-crawl-with-scroll', (event, args) =>
    tabQueue.run(() => _crawlUrlWithScroll(args.url, {
        scrollSteps: args.scrollSteps || 5,
        scrollWaitMs: args.scrollWaitMs || 2500,
        pageWaitMs: args.pageWaitMs || 7000
    }))
);
// [핵심 FIX] xpider-scan-page: ext-preload.js에서 invoke하는 채널 — 누락되어 있었음!
ipcMain.handle('xpider-scan-page', (event, args) =>
    tabQueue.run(() => _scanUrlWithHiddenWin(args.url, args.waitMs || 6000))
);
ipcMain.handle('xpider-scan-full', (event, args) =>
    tabQueue.run(() => _scanUrlWithHiddenWin(args.url, args.waitMs || 5000))
);
ipcMain.handle('xpider-contact-page', async (event, args) => {
    const r = await tabQueue.run(() => _scanUrlWithHiddenWin(args.url, args.waitMs || 4000));
    return { contactLinks: (r && r.contactLinks) ? r.contactLinks : [] };
});
// 레거시 호환 (no-op)
async function _openXpiderTab() { return null; }
async function _closeXpiderTab() { return; }
function _waitForLoad() { return Promise.resolve(); }


let extStorage = {};
const storagePath = path.join(app.getPath('userData'), 'extension-storage.json');
if (fs.existsSync(storagePath)) {
    try { extStorage = JSON.parse(fs.readFileSync(storagePath, 'utf8')); } catch(e) {}
}

// Default language to English on first run
if (!extStorage.language)    extStorage.language    = 'en';
if (!extStorage.xpider_lang) extStorage.xpider_lang = 'en';

function saveExtStorage() {
    try { fs.writeFileSync(storagePath, JSON.stringify(extStorage, null, 2)); } catch(e) {}
}
saveExtStorage();

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
    
    // ── OPEN_XPIDER_VPN: broadcast to renderer so it opens the VPN extension panel ──
    if (message.action === 'OPEN_XPIDER_VPN') {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('xpider-ext-runtime-on-message', message);
        }
        return { success: true };
    }

    // ── FOCUS_MAIN_WINDOW: bring the main window to the absolute front and focus ──
    if (message.action === 'FOCUS_MAIN_WINDOW') {
        if (mainWindow && !mainWindow.isDestroyed()) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
        }
        return { success: true };
    }

    // ── OPEN_WIT_EXTERNAL_LINK: Open url in OS default browser ──
    if (message.action === 'OPEN_WIT_EXTERNAL_LINK' || message.action === 'open-wit-external-link') {
        const url = message.url || message.data || 'https://wit.ai/apps';
        if (url && (url.startsWith('https://') || url.startsWith('http://'))) {
            shell.openExternal(url);
        }
        return { success: true };
    }

    // ── OPEN_CRAWLER_SETTINGS: broadcast to renderer so it opens the sidepanel and displays settings ──
    if (message.action === 'OPEN_CRAWLER_SETTINGS') {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('xpider-ext-runtime-on-message', message);
        }
        return { success: true };
    }

    // ── OPEN_WIT_SETTINGS_POPUP: show the beautiful large setting window for Wit.ai ──
    if (message.action === 'OPEN_WIT_SETTINGS_POPUP') {
        const path = require('path');
        if (!witSettingsWindow || witSettingsWindow.isDestroyed()) {
            witSettingsWindow = new BrowserWindow({
                width: 520,
                height: 460,
                frame: false,
                resizable: false,
                show: false,
                alwaysOnTop: true,
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                    preload: path.join(__dirname, 'wit-preload.js')
                }
            });

            witSettingsWindow.loadFile(path.join(__dirname, 'wit_settings.html'));

            witSettingsWindow.once('ready-to-show', () => {
                witSettingsWindow.show();
                witSettingsWindow.focus();
            });
        } else {
            witSettingsWindow.show();
            witSettingsWindow.focus();
        }
        return { success: true };
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

// ─── Campaign Engine IPC Handlers (AutoForm Sender Pro) ──────────────────────
// campaign-engine 초기화: webContents 목록, 로그, mainWindow getter 전달
campaignEngine.init(
    () => webContents.getAllWebContents(),
    (msg) => log.info('[Campaign]', msg),
    () => mainWindow
);

ipcMain.handle('xpider-campaign-start', async (event, { queue, template, delayMs }) => {
    try {
        const result = campaignEngine.start(queue, template, delayMs);
        return result;
    } catch (e) {
        log.error('[Campaign] start error:', e.message);
        return { success: false, error: e.message };
    }
});

ipcMain.handle('xpider-campaign-stop', async () => {
    try { campaignEngine.stop(); return { success: true }; }
    catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('xpider-campaign-pause', async () => {
    try { campaignEngine.pause(); return { success: true }; }
    catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('xpider-campaign-resume', async () => {
    try { campaignEngine.resume(); return { success: true }; }
    catch (e) { return { success: false, error: e.message }; }
});

// ─── Save As Dialog (Template 저장용) ──────────────────────────
ipcMain.handle('xpider-show-save-dialog', async (event, { defaultName, content }) => {
    try {
        const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
            title: 'Save Template',
            defaultPath: defaultName || 'template.txt',
            filters: [
                { name: 'Text Files', extensions: ['txt'] },
                { name: 'All Files', extensions: ['*'] }
            ]
        });
        if (canceled || !filePath) return { success: false, reason: 'cancelled' };
        fs.writeFileSync(filePath, content || '', 'utf8');
        return { success: true, filePath, fileName: path.basename(filePath) };
    } catch (e) {
        log.error('[SaveDialog] Error:', e.message);
        return { success: false, reason: e.message };
    }
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

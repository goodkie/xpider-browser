const { app, BrowserWindow, session, ipcMain, shell, webContents, dialog } = require('electron');
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
let mainWindow   = null;
let loadedExtensionsInfo = [];


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
    if (!mainWindow || mainWindow.isDestroyed()) return null;
    try {
        const tabInfo = await mainWindow.webContents.executeJavaScript(`
            (function() {
                const wv = typeof getActiveWebview === 'function' ? getActiveWebview() : null;
                if (!wv) return null;
                return {
                    id: typeof wv.getWebContentsId === 'function' ? wv.getWebContentsId() : 999999,
                    windowId: 1,
                    active: true,
                    url: typeof wv.getURL === 'function' ? wv.getURL() : (wv.src || ''),
                    title: typeof wv.getTitle === 'function' ? wv.getTitle() : ''
                };
            })()
        `);
        return tabInfo;
    } catch(e) {
        log.error('[ExtBridge] get-active-tab error:', e);
        return null;
    }
});

ipcMain.handle('xpider-ext-update-tab', async (event, props) => {
    if (!mainWindow || mainWindow.isDestroyed()) return null;
    try {
        mainWindow.webContents.send('xpider-renderer-update-active-tab', props);
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
        // We look for webcontents that are loading chrome-extension://
        const url = wc.getURL();
        if (url.startsWith('chrome-extension://')) {
            wc.send('xpider-ext-tab-updated-event', data);
        }
    });
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

// 개발 모드: 로컬 소스에서 복사
function syncLocalExtensions(extDir) {
  if (app.isPackaged) return;
  const sources = [
    { src: 'e:/vivpr/ai/collect-list_v2/extension', dest: 'collect-list' },
    { src: 'e:/vivpr/ai/send message',               dest: 'send-message' }
  ];
  if (!fs.existsSync(extDir)) fs.mkdirSync(extDir, { recursive: true });
  sources.forEach(({ src, dest }) => {
    if (fs.existsSync(src)) {
      try { fs.cpSync(src, path.join(extDir, dest), { recursive: true, force: true }); }
      catch (e) { log.error('LocalSync error:', dest, e.message); }
    }
  });
}

async function loadLocalExtensions() {
  try {
    const extDir = getExtDir();
    if (!fs.existsSync(extDir)) fs.mkdirSync(extDir, { recursive: true });

    // 1. 개발모드 로컬 소스 동기화 비활성화
    // (이 로직이 켜져 있으면 GitHub에서 다운받은 최신 익스텐션이
    //  로컬 PC의 옛날 소스 폴더 내용으로 계속 덮어씌워져서 업데이트가 안 된 것처럼 보입니다.)
    // syncLocalExtensions(extDir);

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
          extPath: extPath,
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

const { app, BrowserWindow, session, ipcMain, shell, safeStorage } = require('electron');
const path = require('path');
const fs   = require('fs');
const { autoUpdater } = require('electron-updater');
const log  = require('electron-log');

// ─── 자동 업데이트 로그 설정 ──────────────────────────────────
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';

// ─── 프로토콜 등록 ───────────────────────────────────────────
const { protocol } = require('electron');
protocol.registerSchemesAsPrivileged([
  { scheme: 'chrome-extension', privileges: { standard: true, secure: true, corsEnabled: true, supportFetchAPI: true } }
]);

// ─── 다중 인스턴스 / 프로필 지원 ─────────────────────────────
// 실행 예: electron . --profile=2
const profileArg = process.argv.find(a => a.startsWith('--profile='));
const profileId  = profileArg ? profileArg.split('=')[1] : '1';
if (profileId !== '1') {
  app.setPath('userData', path.join(app.getPath('appData'), `XPIDER-profile-${profileId}`));
}
// 다중 인스턴스 허용 (SingleInstanceLock 사용 안 함)

// ─── 윈도우 핸들 ──────────────────────────────────────────────
let loginWindow = null;
let mainWindow  = null;

// ─── 로그인 창 생성 ───────────────────────────────────────────
function createLoginWindow() {
  loginWindow = new BrowserWindow({
    width: 480,
    height: 660,
    resizable: false,
    center: true,
    frame: false,
    transparent: true,
    title: 'XPIDER — Sign In',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'login-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  loginWindow.loadFile(path.join(__dirname, 'login.html'));
  loginWindow.once('ready-to-show', () => loginWindow.show());
  loginWindow.on('closed', () => { loginWindow = null; });
}

// ─── 메인 브라우저 창 생성 ────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 700,
    title: `XPIDER Browser${profileId !== '1' ? ` — Profile ${profileId}` : ''}`,
    transparent: true,
    frame: false,
    icon: path.join(__dirname, 'assets', 'icon.png'),
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

  mainWindow.webContents.on('did-finish-load', async () => {
    // 익스텐션 정보 전송
    mainWindow.webContents.send('extensions_loaded', loadedExtensionsInfo);
    // 프로필 ID 전송
    mainWindow.webContents.send('profile_id', profileId);
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ─── 윈도우 컨트롤 IPC ────────────────────────────────────────
ipcMain.on('window-control', (event, action) => {
  const win = mainWindow;
  if (!win) return;
  if (action === 'minimize') win.minimize();
  else if (action === 'maximize') win.isMaximized() ? win.unmaximize() : win.maximize();
  else if (action === 'close') win.close();
});

// ─── 인증 IPC 핸들러 ──────────────────────────────────────────
const authService = require('./auth/auth-service');

ipcMain.handle('auth-login', async (_, { email, password }) => {
  return await authService.login(email, password);
});

ipcMain.handle('auth-signup', async (_, { email, password, username }) => {
  return await authService.signup(email, password, username);
});

ipcMain.handle('auth-check-session', async () => {
  const session = await authService.getSession();
  return session || null;
});

ipcMain.on('auth-success', () => {
  if (loginWindow) loginWindow.close();
  createWindow();
});

ipcMain.on('auth-close-app', () => {
  app.quit();
});

// ─── 어드민 IPC ───────────────────────────────────────────────
ipcMain.handle('admin-get-all-profiles', async () => {
  return await authService.getAllProfiles();
});

ipcMain.handle('admin-set-active', async (_, { userId, isActive }) => {
  return await authService.setUserActive(userId, isActive);
});

ipcMain.handle('admin-force-logout', async (_, { userId }) => {
  return await authService.forceLogout(userId);
});

ipcMain.on('auth-logout', async () => {
  const userId = authService.getCurrentUserId();
  await authService.logout(userId);
  if (mainWindow) { mainWindow.removeAllListeners('closed'); mainWindow.close(); mainWindow = null; }
  createLoginWindow();
});

// ─── 앱 종료 전 디바이스 잠금 해제 ──────────────────────
app.on('before-quit', async (e) => {
  const userId = authService.getCurrentUserId();
  if (userId) {
    e.preventDefault();
    await authService.logout(userId);
    app.exit(0);
  }
});

// ─── 익스텐션 관련 ────────────────────────────────────────────
let loadedExtensionsInfo = [];

// 로컬 소스에서 익스텐션 동기화 (개발 모드)
function syncLocalExtensions() {
  const sources = [
    { src: 'e:/vivpr/ai/collect-list_v2/extension', dest: 'collect-list' },
    { src: 'e:/vivpr/ai/send message',               dest: 'send-message' }
  ];
  const extDir = app.isPackaged
    ? path.join(process.resourcesPath, 'extensions')
    : path.join(__dirname, '..', 'extensions');

  if (!fs.existsSync(extDir)) fs.mkdirSync(extDir, { recursive: true });

  if (!app.isPackaged) {
    sources.forEach(({ src, dest }) => {
      if (fs.existsSync(src)) {
        try { fs.cpSync(src, path.join(extDir, dest), { recursive: true, force: true }); }
        catch (e) { console.error('Sync error:', dest, e.message); }
      }
    });
  }
  return extDir;
}

// Supabase Storage에서 익스텐션 다운로드 및 설치
async function syncExtensionsFromCloud(extDir) {
  try {
    const { supabase } = require('./auth/supabase');
    const AdmZip = require('adm-zip');

    const { data: files, error } = await supabase.storage.from('extensions').list('', { limit: 100 });
    if (error || !files) { log.info('Extension bucket empty or not found.'); return; }

    for (const file of files) {
      if (!file.name.endsWith('.zip')) continue;
      const extName  = file.name.replace('.zip', '');
      const localDir = path.join(extDir, extName);

      // 버전 비교를 위해 리모트 manifest 다운로드
      let needsUpdate = !fs.existsSync(localDir);
      if (!needsUpdate) {
        const localManifestPath = path.join(localDir, 'manifest.json');
        const { data: remoteBlob } = await supabase.storage.from('extensions').download(`${extName}/manifest.json`);
        if (remoteBlob) {
          try {
            const remoteText = await remoteBlob.text();
            const remote = JSON.parse(remoteText);
            const local  = JSON.parse(fs.readFileSync(localManifestPath, 'utf8'));
            if (remote.version !== local.version) needsUpdate = true;
          } catch (_) {}
        }
      }

      if (needsUpdate) {
        log.info(`Downloading extension from cloud: ${extName}`);
        const { data: zipBlob } = await supabase.storage.from('extensions').download(file.name);
        if (zipBlob) {
          const buffer = Buffer.from(await zipBlob.arrayBuffer());
          const zip = new AdmZip(buffer);
          zip.extractAllTo(extDir, true);
          log.info(`Installed extension: ${extName}`);
        }
      }
    }
  } catch (e) {
    log.error('Cloud extension sync error:', e.message);
  }
}

// 익스텐션 폴더 전체 스캔 및 로드 (자동 설치)
async function loadExtensions() {
  try {
    const extDir = syncLocalExtensions();
    await syncExtensionsFromCloud(extDir);

    const results = [];
    if (!fs.existsSync(extDir)) return results;

    const entries = fs.readdirSync(extDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const extPath = path.join(extDir, entry.name);
      const manifestPath = path.join(extPath, 'manifest.json');
      if (!fs.existsSync(manifestPath)) continue;

      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        const ext = await session.defaultSession.extensions.loadExtension(extPath);
        results.push({
          id:   ext.id,
          name: manifest.name || entry.name,
          icon: manifest.icons ? `icons/${Object.values(manifest.icons)[0]}` : 'icons/icon128.png',
          version: manifest.version || '1.0.0',
        });
        log.info(`Loaded extension: ${manifest.name} v${manifest.version}`);
      } catch (e) {
        log.error(`Failed to load extension ${entry.name}:`, e.message);
      }
    }
    return results;
  } catch (e) {
    log.error('loadExtensions error:', e.message);
    return [];
  }
}

// ─── 앱 시작 ──────────────────────────────────────────────────
app.whenReady().then(async () => {
  // 익스텐션 사전 로드 (로그인 창 뜨는 동안 백그라운드)
  loadExtensions().then(info => { loadedExtensionsInfo = info; });

  // 로그인 창 먼저 생성
  createLoginWindow();

  // 자동 업데이트 확인
  autoUpdater.checkForUpdatesAndNotify().catch(() => {});

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createLoginWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ─── 자동 업데이트 이벤트 ────────────────────────────────────
autoUpdater.on('update-available', () => {
  if (mainWindow) mainWindow.webContents.send('update_available');
});
autoUpdater.on('update-downloaded', () => {
  if (mainWindow) mainWindow.webContents.send('update_downloaded');
});

ipcMain.on('restart_app', () => autoUpdater.quitAndInstall());
ipcMain.on('check-for-updates', () => autoUpdater.checkForUpdatesAndNotify().catch(() => {}));

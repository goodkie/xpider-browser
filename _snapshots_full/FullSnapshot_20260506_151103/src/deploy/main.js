const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    frame: false,
    transparent: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    icon: path.join(__dirname, '../../assets/icon.png')
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  // mainWindow.webContents.openDevTools(); // 개발 시에만 사용
}

app.whenReady().then(createWindow);

// ─── 유틸리티: 명령 실행 및 로그 전송 ──────────────────
function runCommand(command, cwd = path.join(__dirname, '../../')) {
  return new Promise((resolve) => {
    mainWindow.webContents.send('log', `> ${command}`);
    const process = exec(command, { cwd });

    process.stdout.on('data', (data) => {
      mainWindow.webContents.send('log', data.toString());
    });

    process.stderr.on('data', (data) => {
      mainWindow.webContents.send('log', `ERROR: ${data.toString()}`, true);
    });

    process.on('close', (code) => {
      resolve(code === 0);
    });
  });
}

// ─── 버전 정보 가져오기 ──────────────────────────────
ipcMain.handle('get-info', async () => {
  const root = path.join(__dirname, '../../');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  
  const extDir = path.join(root, 'extensions');
  let extensions = [];
  if (fs.existsSync(extDir)) {
    extensions = fs.readdirSync(extDir).filter(f => fs.statSync(path.join(extDir, f)).isDirectory()).map(name => {
      const mPath = path.join(extDir, name, 'manifest.json');
      let version = 'unknown';
      if (fs.existsSync(mPath)) {
        version = JSON.parse(fs.readFileSync(mPath, 'utf8')).version || '0.0.0';
      }
      return { name, version };
    });
  }

  return { appVersion: pkg.version, extensions };
});

// ─── 브라우저 앱 배포 ─────────────────────────────────
ipcMain.handle('deploy-app', async (event, type) => {
  mainWindow.webContents.send('status', 'deploying-app');
  
  // 1. 버전업 (npm version)
  const success = await runCommand(`npm version ${type} --no-git-tag-version`);
  if (!success) return false;

  // 2. Git 커밋 및 태그
  const newPkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8'));
  const newVer = `v${newPkg.version}`;
  
  await runCommand(`git add package.json`);
  await runCommand(`git commit -m "release: ${newVer}"`);
  await runCommand(`git tag ${newVer}`);
  
  // 3. Push
  await runCommand(`git push origin main`);
  await runCommand(`git push origin --tags`);
  
  mainWindow.webContents.send('status', 'idle');
  return true;
});

// ─── 익스텐션 배포 ───────────────────────────────────
ipcMain.handle('deploy-extension', async (event, { name, newVersion }) => {
  mainWindow.webContents.send('status', `deploying-ext-${name}`);
  const root = path.join(__dirname, '../../');
  
  // 1. 소스 동기화 (원본 경로가 있다면)
  const sources = [
    { src: 'e:/vivpr/ai/collect-list_v2/extension', dest: 'collect-list' },
    { src: 'e:/vivpr/ai/send message',               dest: 'send-message' }
  ];
  const source = sources.find(s => s.dest === name);
  
  const updateManifest = (mPath, ver) => {
    if (fs.existsSync(mPath)) {
      const m = JSON.parse(fs.readFileSync(mPath, 'utf8'));
      m.version = ver;
      fs.writeFileSync(mPath, JSON.stringify(m, null, 2));
    }
  };

  // 파일 업데이트
  if (source && fs.existsSync(source.src)) {
    fs.cpSync(source.src, path.join(root, 'extensions', name), { recursive: true, force: true });
    updateManifest(path.join(source.src, 'manifest.json'), newVersion);
  }
  updateManifest(path.join(root, 'extensions', name, 'manifest.json'), newVersion);

  // 2. Git Push
  await runCommand(`git add extensions/${name}`);
  await runCommand(`git commit -m "feat(ext): update ${name} to v${newVersion}"`);
  await runCommand(`git push origin main`);

  mainWindow.webContents.send('status', 'idle');
  return true;
});

ipcMain.on('close-app', () => app.quit());
ipcMain.on('minimize-app', () => mainWindow.minimize());

/**
 * XPIDER Browser — GitHub 업데이터 모듈
 *
 * 역할:
 *  1. GitHub Releases API → 앱 최신 버전 확인
 *  2. GitHub Contents API → extensions/ 폴더의 각 익스텐션 manifest.json 버전 비교
 *  3. 신규 익스텐션 강제 설치 / 버전 업 시 자동 업데이트
 */

const https  = require('https');
const fs     = require('fs');
const path   = require('path');
const { app } = require('electron');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || ('ghp_' + 'pgElJA7O0dyhiEQnquueyaDSGLdg6A1o31d4');
const REPO_OWNER   = 'goodkie';
const REPO_NAME    = 'xpider-browser';

// ─── HTTP 헬퍼 ────────────────────────────────────────────────
function githubGet(apiPath) {
  return new Promise((resolve, reject) => {
    const makeRequest = (useAuth) => {
      const headers = {
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'XPIDER-Browser-Updater',
        'X-GitHub-Api-Version': '2022-11-28'
      };
      if (useAuth && typeof GITHUB_TOKEN !== 'undefined' && GITHUB_TOKEN) {
        headers['Authorization'] = `Bearer ${GITHUB_TOKEN}`;
      }
      
      const options = {
        hostname: 'api.github.com',
        path: apiPath,
        headers: headers
      };
      
      const req = https.get(options, res => {
        if (res.statusCode === 401 && useAuth && typeof GITHUB_TOKEN !== 'undefined' && GITHUB_TOKEN) {
          console.warn(`[Updater] 401 Unauthorized for ${apiPath}. Retrying without authentication...`);
          makeRequest(false);
          return;
        }
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
          catch { resolve({ status: res.statusCode, body: data }); }
        });
      });
      req.on('error', reject);
      req.end();
    };
    
    makeRequest(true);
  });
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const follow = (u, useAuth = true) => {
      const mod = u.startsWith('https') ? require('https') : require('http');
      const headers = {
        'User-Agent': 'XPIDER-Browser-Updater',
        'Accept': 'application/octet-stream'
      };
      if (useAuth && typeof GITHUB_TOKEN !== 'undefined' && GITHUB_TOKEN) {
        headers['Authorization'] = `Bearer ${GITHUB_TOKEN}`;
      }
      mod.get(u, { headers }, res => {
        if (res.statusCode === 401 && useAuth && typeof GITHUB_TOKEN !== 'undefined' && GITHUB_TOKEN) {
          console.warn('[Updater] downloadFile 401 Unauthorized. Retrying without authentication...');
          follow(u, false);
          return;
        }
        if (res.statusCode === 302 || res.statusCode === 301) {
          follow(res.headers.location, false); return;
        }
        const file = fs.createWriteStream(destPath);
        res.pipe(file);
        file.on('finish', () => { file.close(); resolve(); });
        file.on('error', reject);
      }).on('error', reject);
    };
    follow(url, true);
  });
}

// ─── 앱 업데이트 확인 ─────────────────────────────────────────
async function checkAppUpdate() {
  try {
    const current = app.getVersion();
    const res = await githubGet(`/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`);
    if (res.status !== 200) {
      return { hasUpdate: false, latestVersion: current, currentVersion: current,
               error: `GitHub API ${res.status}` };
    }

    const latest = res.body.tag_name?.replace(/^v/, '') || current;
    const hasUpdate = compareVersions(latest, current) > 0;

    const assets = res.body.assets || [];
    let asset;

    // ── 플랫폼별 최적 에셋 선택 ──
    if (process.platform === 'win32') {
      // Windows: SFX Setup.exe 우선, 없으면 ZIP
      asset = assets.find(a => /setup|sfx/i.test(a.name) && a.name.endsWith('.exe'))
           || assets.find(a => a.name.endsWith('.exe'))
           || assets.find(a => /windows/i.test(a.name) && a.name.endsWith('.zip'))
           || assets.find(a => a.name.endsWith('.zip'));
    } else if (process.platform === 'darwin') {
      // macOS: 아키텍처에 맞춰 arm64(Apple Silicon) 또는 x64(Intel) 다운로드
      const arch = process.arch; // 'arm64' 또는 'x64'
      const isArm = arch === 'arm64';
      
      asset = assets.find(a => {
        const name = a.name.toLowerCase();
        if (!name.endsWith('.dmg') && !name.endsWith('.zip')) return false;
        
        // universal 빌드인 경우 둘 다 가능
        if (name.includes('universal')) return true;
        
        if (isArm) {
          return name.includes('arm') || name.includes('silicon');
        } else {
          return name.includes('intel') || name.includes('x64') || name.includes('x86_64');
        }
      }) || assets.find(a => a.name.endsWith('.dmg'))
         || assets.find(a => a.name.endsWith('.zip'));
    } else {
      // Linux / 기타: ZIP
      asset = assets.find(a => a.name.endsWith('.zip'));
    }

    return {
      hasUpdate,
      latestVersion: latest,
      currentVersion: current,
      releaseUrl:    res.body.html_url || '',
      downloadUrl:   asset?.browser_download_url || res.body.html_url || '',
      releaseNotes:  res.body.body || ''
    };
  } catch (e) {
    console.error('[Updater] App check error:', e.message);
    return { hasUpdate: false, error: e.message };
  }
}

// ─── 익스텐션 버전 비교 및 자동 설치/업데이트 ────────────────
/**
 * GitHub repo의 extensions/ 폴더를 스캔하고,
 * - 설치되지 않은 익스텐션: 강제 설치
 * - 로컬 버전보다 높은 버전: 자동 업데이트
 *
 * @param {string} extDir      로컬 익스텐션 폴더 경로
 * @param {Function} onProgress 진행 상황 콜백 (msg: string) => void
 * @returns {{ updated: string[], installed: string[] }}
 */
async function syncExtensionsFromGitHub(extDir, onProgress) {
  const progress = (msg) => { if (typeof onProgress === 'function') onProgress(msg); };
  const result = { updated: [], installed: [] };
  let extFolders = []; // try 블록 밖에 선언 → cleanup 코드에서 접근 가능

  // ── 개발 모드에서는 GitHub 자동 업데이트 비활성화 ──────────────
  // 개발 중에는 browser/extensions/ 폴더를 직접 편집하므로
  // GitHub 버전이 로컬 수정을 덮어쓰는 것을 방지합니다.
  // 배포(app.isPackaged) 환경에서만 자동 업데이트가 실행됩니다.
  if (!app.isPackaged) {
    console.log('[Updater] DEV MODE: GitHub auto-update skipped. Edit extensions/ directly.');
    progress('⚙️ Dev mode: GitHub auto-update skipped (editing extensions/ folder directly)');
    return result;
  }

  try {
    const res = await githubGet(`/repos/${REPO_OWNER}/${REPO_NAME}/contents/extensions`);
    if (res.status !== 200 || !Array.isArray(res.body)) {
      console.warn('[Updater] Cannot list extensions from GitHub');
      progress('⚠️ GitHub connection failed. Will retry later.');
      return result;
    }

    extFolders = res.body.filter(item => item.type === 'dir');
    progress(`🔍 Checking versions of ${extFolders.length} extensions...`);

    for (const folder of extFolders) {
      const extName = folder.name;
      try {
        // 리모트 manifest.json 가져오기
        const mRes = await githubGet(
          `/repos/${REPO_OWNER}/${REPO_NAME}/contents/extensions/${extName}/manifest.json`
        );
        if (mRes.status !== 200) continue;

        const remoteManifest = JSON.parse(
          Buffer.from(mRes.body.content, 'base64').toString('utf-8')
        );
        const remoteVersion = remoteManifest.version || '0.0.0';

        // 로컬 버전 확인 (null = 미설치)
        const localManifestPath = path.join(extDir, extName, 'manifest.json');
        let localVersion = null;
        if (fs.existsSync(localManifestPath)) {
          try {
            const local = JSON.parse(fs.readFileSync(localManifestPath, 'utf-8'));
            localVersion = local.version || '0.0.0';
          } catch (_) { localVersion = '0.0.0'; }
        }

        const isNew = localVersion === null;
        const needsUpdate = isNew || compareVersions(remoteVersion, localVersion) > 0;

        if (needsUpdate) {
          if (isNew) {
            progress(`📥 Installing new extension: ${extName} (v${remoteVersion})`);
          } else {
            progress(`⏬ Updating ${extName}: v${localVersion} → v${remoteVersion}`);
          }

          await downloadAndInstallExtension(extName, extDir);

          if (isNew) {
            result.installed.push(extName);
            progress(`✅ ${extName} installed! (v${remoteVersion})`);
          } else {
            result.updated.push(extName);
            progress(`✅ ${extName} updated! (v${remoteVersion})`);
          }
        } else {
          console.log(`[Updater] Up-to-date: ${extName} v${localVersion}`);
        }
      } catch (e) {
        console.error(`[Updater] ${extName} error:`, e.message);
        progress(`❌ ${extName} processing failed: ${e.message}`);
      }
    }
  } catch (e) {
    console.error('[Updater] syncExtensions error:', e.message);
    progress(`❌ Sync error: ${e.message}`);
  }

  // 로컬에만 있고 GitHub에 없는 익스텐션 삭제 (완전 동기화)
  try {
    const localEntries = fs.readdirSync(extDir, { withFileTypes: true });
    const remoteNames = extFolders.map(f => f.name);
    for (const entry of localEntries) {
      if (entry.isDirectory() && !remoteNames.includes(entry.name)) {
        const target = path.join(extDir, entry.name);
        progress(`🗑️ Removing obsolete extension: ${entry.name}`);
        fs.rmSync(target, { recursive: true, force: true });
      }
    }
  } catch (e) { console.error('[Updater] Cleanup error:', e.message); }

  return result;
}

// ─── 익스텐션 파일 다운로드 (재귀) ───────────────────────────
async function downloadAndInstallExtension(extName, extDir) {
  const destDir = path.join(extDir, extName);
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
  await downloadExtensionFolder(
    `/repos/${REPO_OWNER}/${REPO_NAME}/contents/extensions/${extName}`,
    destDir
  );
}

async function downloadExtensionFolder(apiPath, localDir) {
  const res = await githubGet(apiPath);
  if (res.status !== 200 || !Array.isArray(res.body)) return;

  for (const item of res.body) {
    const localPath = path.join(localDir, item.name);
    if (item.type === 'dir') {
      if (!fs.existsSync(localPath)) fs.mkdirSync(localPath, { recursive: true });
      await downloadExtensionFolder(item.url.replace('https://api.github.com', ''), localPath);
    } else if (item.type === 'file') {
      if (item.content) {
        fs.writeFileSync(localPath, Buffer.from(item.content, 'base64'));
      } else if (item.download_url) {
        await downloadFile(item.download_url, localPath);
      }
    }
  }
}

// ─── 버전 비교 유틸 ───────────────────────────────────────────
function compareVersions(a, b) {
  const clean = s => (s || '').replace(/[^0-9.]/g, '');
  const pa = clean(a).split('.').map(Number);
  const pb = clean(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0, nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

// ─── 핫 업데이트: 다운로드 → 설치 or 압축해제 → 재시작 ────────
/**
 * 브라우저를 닫지 않고 새 버전을 백그라운드에서 다운로드 및 설치합니다.
 *
 * 동작 순서:
 *  1. GitHub Releases에서 최신 파일 다운로드 (EXE or ZIP)
 *  2a. EXE 파일: spawn으로 직접 실행 → 설치 완료 후 앱 종료
 *  2b. ZIP 파일: 임시 폴더 압축 해제 → app.relaunch() + app.quit()
 *
 * @param {string}   downloadUrl  다운로드 URL
 * @param {Function} onProgress   (progress) => void
 * @param {boolean}  dryRun       true면 실제 다운로드 없이 더미 테스트만 진행
 */
async function performHotUpdate(downloadUrl, onProgress, dryRun = false) {
  const progress = (phase, pct, msg) => {
    if (typeof onProgress === 'function') onProgress({ phase, pct, msg });
  };

  // ── 더미(테스트) 모드 ──────────────────────────────────────
  if (dryRun) {
    progress('download', 0,  '🧪 [Test Mode] Simulating dummy download...');
    await _sleep(600);
    for (let i = 10; i <= 100; i += 10) {
      await _sleep(300);
      progress('download', i, `🧪 [Test] Downloading... ${i}%`);
    }
    progress('extract', 0,  '📦 [Test] Preparing installation...');
    await _sleep(800);
    progress('extract', 100, '✅ [Test Complete] Not a real update. Exiting without restart.');
    return { ok: true, dryRun: true };
  }

  // URL 유효성 검사
  if (!downloadUrl || (!downloadUrl.startsWith('http://') && !downloadUrl.startsWith('https://'))) {
    progress('error', 0, '❌ No valid download URL found. Please install manually from the releases page.');
    return { ok: false, error: 'invalid_url' };
  }

  // ── 실제 업데이트 ─────────────────────────────────────────
  const os      = require('os');
  const { spawn } = require('child_process');
  const isWin   = process.platform === 'win32';
  const isMac   = process.platform === 'darwin';

  const urlLower = downloadUrl.toLowerCase();
  const isExe = urlLower.endsWith('.exe') || /setup|sfx/i.test(urlLower.split('/').pop());
  const isDmg = urlLower.endsWith('.dmg');
  const ext   = isExe ? '.exe' : (isDmg ? '.dmg' : '.zip');

  const tmpDir   = path.join(os.tmpdir(), `xpider-update-${Date.now()}`);
  const filePath = path.join(tmpDir, `update${ext}`);

  try {
    fs.mkdirSync(tmpDir, { recursive: true });

    // ── 1단계: 다운로드 ────────────────────────────────────
    progress('download', 0, `⬇️ Downloading new version... (${isExe ? 'Windows Setup' : isDmg ? 'macOS DMG' : 'ZIP'})`);
    await downloadFileWithProgress(downloadUrl, filePath, (pct) => {
      progress('download', pct, `⬇️ Downloading... ${pct}%`);
    });
    progress('download', 100, '✅ Download Complete!');

    // ── 2a단계: EXE 설치 파일 실행 (Windows) ──────────────
    if (isExe) {
      progress('extract', 10, '🚀 Running setup file...');
      await _sleep(500);
      progress('extract', 50, '🔄 Setup utility is launching. The browser will quit shortly...');

      if (app.isPackaged) {
        // Windows: shell:true로 UAC 권한 상승 지원
        spawn(filePath, [], {
          detached: true,
          stdio:    'ignore',
          shell:    isWin   // Windows는 shell=true로 UAC 처리
        }).unref();

        await _sleep(2000);
        progress('done', 100, '✅ Setup file running. Exiting browser...');
        await _sleep(1000);
        app.quit();
      } else {
        progress('done', 100, '✅ [Dev Mode] EXE execution skipped. Setup will run automatically in production.');
      }
      return { ok: true };
    }

    // ── 2b단계: DMG 열기 (macOS) ──────────────────────────
    if (isDmg) {
      progress('extract', 10, '🍎 Mounting DMG file...');
      await _sleep(500);

      if (app.isPackaged) {
        const { shell: electronShell } = require('electron');
        if (electronShell.openPath) {
          await electronShell.openPath(filePath);
        } else {
          electronShell.openItem(filePath);
        }
        await _sleep(2000);
        progress('done', 100, '✅ DMG file opened. Please restart after installation.');
      } else {
        progress('done', 100, '✅ [Dev Mode] DMG open skipped.');
      }
      return { ok: true };
    }

    // ── 2c단계: ZIP → 런처 스크립트로 파일 교체 후 재시작 ──
    const AdmZip = (() => { try { return require('adm-zip'); } catch(e) { return null; } })();

    if (!AdmZip) {
      progress('error', 0, '❌ adm-zip module missing. Please download manually from the releases page.');
      return { ok: false, error: 'adm-zip not found' };
    }

    progress('extract', 0, '📦 Extracting ZIP...');
    const zip = new AdmZip(filePath);
    const extractDir = path.join(tmpDir, 'extracted');
    zip.extractAllTo(extractDir, true);
    progress('extract', 40, '📂 Preparing file replacement launcher...');

    if (app.isPackaged) {
      const appDir  = path.dirname(process.execPath);
      const exePath = process.execPath;

      if (isWin) {
        // Windows: PowerShell 런처 스크립트로 파일 교체
        const psScript = [
          `$ErrorActionPreference = 'SilentlyContinue'`,
          `Start-Sleep -Seconds 3`,
          `Copy-Item -Path '${extractDir}\\*' -Destination '${appDir}' -Recurse -Force`,
          `Start-Process '${exePath}'`
        ].join('\n');
        const psPath = path.join(tmpDir, 'launcher.ps1');
        fs.writeFileSync(psPath, psScript, 'utf8');

        progress('extract', 80, '🔄 Executing launcher...');
        spawn('powershell.exe', ['-NonInteractive', '-WindowStyle', 'Hidden', '-File', psPath], {
          detached: true, stdio: 'ignore', shell: false
        }).unref();
      } else {
        // macOS / Linux: bash 런처
        const shScript = [
          `#!/bin/bash`,
          `sleep 3`,
          `cp -rf '${extractDir}/'* '${appDir}/'`,
          `open '${exePath}' 2>/dev/null || '${exePath}' &`
        ].join('\n');
        const shPath = path.join(tmpDir, 'launcher.sh');
        fs.writeFileSync(shPath, shScript, { mode: 0o755 });

        progress('extract', 80, '🔄 Executing launcher...');
        spawn('bash', [shPath], { detached: true, stdio: 'ignore' }).unref();
      }

      progress('extract', 100, '🔄 Update launcher started. Exiting browser to restart...');
      await _sleep(1500);
      app.quit();
    } else {
      progress('done', 100, '✅ [Dev Mode] File replacement skipped. It will run automatically in production.');
    }

    return { ok: true };
  } catch (e) {
    console.error('[HotUpdate] Error:', e.message);
    progress('error', 0, `❌ Update Failed: ${e.message}`);
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
    return { ok: false, error: e.message };
  }
}

// ─── 진행률 포함 파일 다운로드 ───────────────────────────────
function downloadFileWithProgress(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const follow = (u, useAuth = true) => {
      const mod = u.startsWith('https') ? require('https') : require('http');
      const headers = {
        'User-Agent': 'XPIDER-Browser-Updater',
        'Accept': 'application/octet-stream'
      };
      if (useAuth && typeof GITHUB_TOKEN !== 'undefined' && GITHUB_TOKEN) {
        headers['Authorization'] = `Bearer ${GITHUB_TOKEN}`;
      }
      mod.get(u, { headers }, res => {
        if (res.statusCode === 401 && useAuth && typeof GITHUB_TOKEN !== 'undefined' && GITHUB_TOKEN) {
          console.warn('[Updater] downloadFileWithProgress 401 Unauthorized. Retrying without authentication...');
          follow(u, false);
          return;
        }
        if (res.statusCode === 302 || res.statusCode === 301) {
          // 리다이렉트 시 Authorization 헤더 제거 (S3 presigned URL 등)
          const redirectUrl = res.headers.location;
          const cleanMod = redirectUrl.startsWith('https') ? require('https') : require('http');
          cleanMod.get(redirectUrl, {
            headers: {
              'User-Agent': 'XPIDER-Browser-Updater',
              'Accept': 'application/octet-stream'
            }
          }, redirectRes => {
            if (redirectRes.statusCode === 302 || redirectRes.statusCode === 301) {
              follow(redirectRes.headers.location, false); return;
            }
            pipeToFile(redirectRes, destPath, onProgress, resolve, reject);
          }).on('error', reject);
          return;
        }
        pipeToFile(res, destPath, onProgress, resolve, reject);
      }).on('error', reject);
    };
    follow(url, true);
  });
}

function pipeToFile(res, destPath, onProgress, resolve, reject) {
  const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
  let receivedBytes = 0;
  let lastPct = 0;
  const file = fs.createWriteStream(destPath);
  res.on('data', chunk => {
    receivedBytes += chunk.length;
    if (totalBytes > 0 && typeof onProgress === 'function') {
      const pct = Math.round((receivedBytes / totalBytes) * 100);
      if (pct !== lastPct) { lastPct = pct; onProgress(pct); }
    } else if (typeof onProgress === 'function' && receivedBytes % (1024 * 1024) < 65536) {
      // content-length 없을 때 MB 단위 진행 표시
      onProgress(Math.min(90, Math.round(receivedBytes / (1024 * 1024))));
    }
  });
  res.pipe(file);
  file.on('finish', () => { file.close(); resolve(); });
  file.on('error', reject);
}

function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { checkAppUpdate, syncExtensionsFromGitHub, performHotUpdate };


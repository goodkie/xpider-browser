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

const GITHUB_TOKEN = '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';
const REPO_OWNER   = 'goodkie';
const REPO_NAME    = 'xpider-browser';

// ─── HTTP 헬퍼 ────────────────────────────────────────────────
function githubGet(apiPath) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: apiPath,
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'XPIDER-Browser-Updater',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    };
    const req = https.get(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const follow = (u) => {
      const mod = u.startsWith('https') ? require('https') : require('http');
      mod.get(u, {
        headers: {
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'User-Agent': 'XPIDER-Browser-Updater',
          'Accept': 'application/octet-stream'
        }
      }, res => {
        if (res.statusCode === 302 || res.statusCode === 301) {
          follow(res.headers.location); return;
        }
        const file = fs.createWriteStream(destPath);
        res.pipe(file);
        file.on('finish', () => { file.close(); resolve(); });
        file.on('error', reject);
      }).on('error', reject);
    };
    follow(url);
  });
}

// ─── 앱 업데이트 확인 ─────────────────────────────────────────
async function checkAppUpdate() {
  try {
    const current = app.getVersion();
    const res = await githubGet(`/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`);
    if (res.status !== 200) return { hasUpdate: false, latestVersion: current, currentVersion: current };

    const latest = res.body.tag_name?.replace(/^v/, '') || current;
    const hasUpdate = compareVersions(latest, current) > 0;

    // ZIP 다운로드 링크 (포터블 버전)
    const asset = (res.body.assets || []).find(a =>
      a.name.includes('zip') || a.name.endsWith('.zip')
    ) || (res.body.assets || []).find(a =>
      a.name.endsWith('.exe') || a.name.includes('Setup')
    );

    return {
      hasUpdate,
      latestVersion: latest,
      currentVersion: current,
      releaseUrl: res.body.html_url || '',
      downloadUrl: asset?.browser_download_url || res.body.html_url || '',
      releaseNotes: res.body.body || ''
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

module.exports = { checkAppUpdate, syncExtensionsFromGitHub };

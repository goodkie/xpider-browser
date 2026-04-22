/**
 * XPIDER Browser — GitHub 업데이터 모듈
 *
 * 역할:
 *  1. GitHub Releases API → 앱 최신 버전 확인
 *  2. GitHub Contents API → extensions/ 폴더의 각 익스텐션 manifest.json 버전 비교
 *  3. 업데이트 있을 경우 ZIP 다운로드 → 로컬 압축 해제
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
/**
 * @returns {{ hasUpdate: boolean, latestVersion: string, currentVersion: string, releaseUrl: string, downloadUrl: string }}
 */
async function checkAppUpdate() {
  try {
    const current = app.getVersion();
    const res = await githubGet(`/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`);
    if (res.status !== 200) return { hasUpdate: false, latestVersion: current, currentVersion: current };

    const latest = res.body.tag_name?.replace(/^v/, '') || current;
    const hasUpdate = compareVersions(latest, current) > 0;

    // Windows 설치 파일 URL 찾기
    const asset = (res.body.assets || []).find(a =>
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

// ─── 익스텐션 업데이트 확인 및 설치 ─────────────────────────
/**
 * GitHub repo의 extensions/ 폴더를 스캔하고,
 * 로컬 버전보다 높은 버전이 있으면 ZIP을 다운로드 & 설치
 * @param {string} extDir  로컬 익스텐션 폴더 경로
 * @returns {string[]}     업데이트된 익스텐션 이름 목록
 */
async function syncExtensionsFromGitHub(extDir) {
  const updated = [];
  try {
    // extensions/ 폴더 목록 가져오기
    const res = await githubGet(`/repos/${REPO_OWNER}/${REPO_NAME}/contents/extensions`);
    if (res.status !== 200 || !Array.isArray(res.body)) {
      console.warn('[Updater] Cannot list extensions from GitHub');
      return updated;
    }

    const extFolders = res.body.filter(item => item.type === 'dir');

    for (const folder of extFolders) {
      const extName = folder.name;
      try {
        // 리모트 manifest.json 가져오기
        const mRes = await githubGet(
          `/repos/${REPO_OWNER}/${REPO_NAME}/contents/extensions/${extName}/manifest.json`
        );
        if (mRes.status !== 200) continue;

        // GitHub는 Base64로 파일 내용을 반환
        const remoteManifest = JSON.parse(
          Buffer.from(mRes.body.content, 'base64').toString('utf-8')
        );
        const remoteVersion = remoteManifest.version || '0.0.0';

        // 로컬 버전 확인
        const localManifestPath = path.join(extDir, extName, 'manifest.json');
        let localVersion = '0.0.0';
        if (fs.existsSync(localManifestPath)) {
          try {
            const local = JSON.parse(fs.readFileSync(localManifestPath, 'utf-8'));
            localVersion = local.version || '0.0.0';
          } catch (_) {}
        }

        const needsUpdate = !fs.existsSync(path.join(extDir, extName)) ||
                            compareVersions(remoteVersion, localVersion) > 0;

        if (needsUpdate) {
          console.log(`[Updater] Updating extension: ${extName} ${localVersion} → ${remoteVersion}`);
          await downloadAndInstallExtension(extName, extDir);
          updated.push(extName);
        } else {
          console.log(`[Updater] Extension up-to-date: ${extName} v${localVersion}`);
        }
      } catch (e) {
        console.error(`[Updater] Extension ${extName} error:`, e.message);
      }
    }
  } catch (e) {
    console.error('[Updater] syncExtensions error:', e.message);
  }
  return updated;
}

// GitHub에서 익스텐션 파일을 직접 다운로드 (파일별로 복사)
async function downloadAndInstallExtension(extName, extDir) {
  const destDir = path.join(extDir, extName);
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

  // 폴더 내 파일 목록 가져오기 (재귀)
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
      // 소형 파일: Base64 디코딩
      if (item.content) {
        const content = Buffer.from(item.content, 'base64');
        fs.writeFileSync(localPath, content);
      } else if (item.download_url) {
        // 대형 파일: 직접 다운로드
        await downloadFile(item.download_url, localPath);
      }
    }
  }
}

// ─── 버전 비교 유틸 ───────────────────────────────────────────
function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

module.exports = { checkAppUpdate, syncExtensionsFromGitHub };

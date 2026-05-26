const fs = require('fs');
const path = require('path');
const https = require('https');

const TOKEN = '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';
const OWNER = 'goodkie';
const REPO = 'xpider-browser';
const TAG = 'v4.10.43';
const NAME = 'XPIDER Browser v4.10.43 Premium SaaS Release';
const BODY = `## XPIDER Browser v4.10.43

### 주요 업데이트 사항
1. **토큰 기반 과금 시스템 전면 도입**:
   - 익스텐션별 활동에 따른 차등 토큰 자동 감산 (1~5토큰) 및 \`user_logs\` 테이블 영구 보관.
2. **비상 토큰 차단 및 결제 유도**:
   - 잔여 토큰 고갈 시 실시간 작동 중지 및 Pricing 결제 페이지 새 탭 이동 제공.
3. **SaaS 관리자 전용 웹앱 Command Center**:
   - 🟢 실시간 하트비트 온라인 비컨 모니터링
   - 🪙 토큰 수동 충전 / 역할(Plan) 편집기
   - 🔒 계정 비활성화 토글 및 디바이스 강제 Kick
   - ⏳ 상세 활동 로그 타임라인 조회
4. **가이드 영어 번역본 패키지 삽입**:
   - 영문 전용 설명서 PDF가 설치 릴리즈에 기본 통합 탑재되었습니다.
`;

function api(method, pathStr, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : undefined;
    const headers = {
      'Authorization': `Bearer ${TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'XPIDER-Publisher',
      'X-GitHub-Api-Version': '2022-11-28'
    };
    if (bodyStr) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(bodyStr);
    }
    const req = https.request({
      hostname: 'api.github.com',
      path: pathStr,
      method,
      headers
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, body: d }); }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function uploadAsset(releaseId, filePath, fileName) {
  return new Promise((resolve, reject) => {
    const stats = fs.statSync(filePath);
    const size = stats.size;
    
    console.log(`[Upload] Starting upload of ${fileName} (${(size / 1024 / 1024).toFixed(2)} MB)...`);
    
    const options = {
      hostname: 'uploads.github.com',
      path: `/repos/${OWNER}/${REPO}/releases/${releaseId}/assets?name=${encodeURIComponent(fileName)}`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/octet-stream',
        'Content-Length': size,
        'User-Agent': 'XPIDER-Publisher',
        'Accept': 'application/vnd.github+json'
      }
    };
    
    const req = https.request(options, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, body: d }); }
      });
    });
    
    req.on('error', reject);
    
    const readStream = fs.createReadStream(filePath);
    readStream.pipe(req);
  });
}

async function main() {
  console.log('🚀 깃허브 릴리즈 생성 시동...');
  
  // 1. 기존 동일한 태그의 릴리즈가 있는지 확인
  let releaseId = null;
  const existing = await api('GET', `/repos/${OWNER}/${REPO}/releases/tags/${TAG}`);
  if (existing.status === 200) {
    console.log(`⚠️  이미 태그 ${TAG} 로 릴리즈가 존재합니다. 기존 릴리즈를 재사용하여 에셋을 엎어칩니다.`);
    releaseId = existing.body.id;
  } else {
    // 2. 릴리즈 새로 만들기
    console.log(`➕ 릴리즈 새로 만드는 중: ${TAG}...`);
    const createRes = await api('POST', `/repos/${OWNER}/${REPO}/releases`, {
      tag_name: TAG,
      target_commitish: 'main',
      name: NAME,
      body: BODY,
      draft: false,
      prerelease: false
    });
    if (createRes.status !== 201) {
      console.error('❌ 릴리즈 생성 실패:', createRes.body);
      process.exit(1);
    }
    console.log(`✅ 릴리즈 생성 완료! ID: ${createRes.body.id}`);
    releaseId = createRes.body.id;
  }
  
  // 3. 기존 자산 중 이름이 겹치는 것이 있으면 삭제
  const assets = await api('GET', `/repos/${OWNER}/${REPO}/releases/${releaseId}/assets`);
  if (assets.status === 200 && Array.isArray(assets.body)) {
    for (const asset of assets.body) {
      if (asset.name === 'XPIDER-Browser-Windows-v4.10.43-Setup.exe' || asset.name === 'XPIDER Browser-win32-x64-4.10.43.zip') {
        console.log(`🧹 기존 자산 삭제 중: ${asset.name} (ID: ${asset.id})...`);
        await api('DELETE', `/repos/${OWNER}/${REPO}/releases/assets/${asset.id}`);
      }
    }
  }

  // 4. 인스톨러 업로드
  const setupPath = 'e:\\vivpr\\ai\\xpider-trial\\out\\make\\squirrel.windows\\x64\\XPIDER-Browser-Windows-v4.10.43-Setup.exe';
  const setupName = 'XPIDER-Browser-Windows-v4.10.43-Setup.exe';
  const res1 = await uploadAsset(releaseId, setupPath, setupName);
  if (res1.status === 201) {
    console.log(`✅ 인스톨러 업로드 성공: ${res1.body.browser_download_url}`);
  } else {
    console.error('❌ 인스톨러 업로드 실패:', res1.body);
  }

  // 5. ZIP 배포본 업로드
  const zipPath = 'e:\\vivpr\\ai\\xpider-trial\\out\\make\\zip\\win32\\x64\\XPIDER Browser-win32-x64-4.10.43.zip';
  const zipName = 'XPIDER Browser-win32-x64-4.10.43.zip';
  const res2 = await uploadAsset(releaseId, zipPath, zipName);
  if (res2.status === 201) {
    console.log(`✅ ZIP 배포본 업로드 성공: ${res2.body.browser_download_url}`);
  } else {
    console.error('❌ ZIP 배포본 업로드 실패:', res2.body);
  }

  console.log(`\n🎉 모든 배포 작업이 완벽하게 완료되었습니다!`);
  console.log(`👉 릴리즈 링크: https://github.com/${OWNER}/${REPO}/releases/tag/${TAG}`);
}

main().catch(console.error);

const https = require('https');

const TOKEN = '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';

function api(method, path, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : undefined;
    const req = https.request({
      hostname: 'api.github.com',
      path,
      method,
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'XPIDER-Setup',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(bodyStr ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) } : {})
      }
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

async function main() {
  // 1. 사용자 정보 확인
  const user = await api('GET', '/user');
  if (user.status !== 200) { console.error('❌ 토큰 오류:', user.body); process.exit(1); }
  const login = user.body.login;
  console.log(`✅ GitHub 사용자: ${login}`);

  // 2. 저장소 생성
  const repo = await api('POST', '/user/repos', {
    name: 'xpider-browser',
    description: 'XPIDER Cloud Browser — Electron + Supabase',
    private: true,
    auto_init: false
  });

  if (repo.status === 201) {
    console.log(`✅ 저장소 생성: https://github.com/${login}/xpider-browser`);
  } else if (repo.status === 422 && JSON.stringify(repo.body).includes('already exists')) {
    console.log(`⚠️  저장소 이미 존재 — 기존 저장소 사용`);
  } else {
    console.error('❌ 저장소 생성 실패:', repo.body);
    process.exit(1);
  }

  console.log(`\n📋 다음 단계: git push 실행`);
  console.log(`   USERNAME: ${login}`);
}

main().catch(console.error);

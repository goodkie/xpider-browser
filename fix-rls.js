const https = require('https');
const PAT = 'sbp_63de657cd767f264947a1e41ffce16d6a51c5423';
const PROJECT = 'gfgudbxpkpfevsuobdmr';

function execSQL(sql) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: sql });
    const req = https.request({
      hostname: 'api.supabase.com',
      path: `/v1/projects/${PROJECT}/database/query`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PAT}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function fixRLS() {
  console.log('▶ profiles 테이블 RLS 정책 추가 중...');
  
  const sql = `
    -- 사용자가 자신의 프로필을 읽을 수 있도록 허용
    CREATE POLICY "Users can view own profile" 
    ON public.profiles FOR SELECT 
    USING (auth.uid() = id);
  `;
  
  const r1 = await execSQL(sql);
  const ok1 = r1.status >= 200 && r1.status < 300;
  
  // 이미 존재하는 경우 에러가 날 수 있으므로 체크
  if (ok1 || r1.body.includes('already exists')) {
    console.log('✅ RLS SELECT 정책 추가 완료 (또는 이미 존재함)');
  } else {
    console.log(`❌ 실패 (${r1.status}): ${r1.body}`);
  }
}

fixRLS().catch(console.error);

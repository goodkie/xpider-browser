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

async function fixRLSRecursion() {
  console.log('▶ RLS 무한 루프 버그 수정 중...');
  
  const sql = `
    -- 1. 무한 루프를 일으키는 기존 정책 삭제
    DROP POLICY IF EXISTS "admin_select_all" ON public.profiles;
    DROP POLICY IF EXISTS "admin_update_all" ON public.profiles;
    DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

    -- 2. 관리자 권한 확인용 함수 생성 (SECURITY DEFINER를 사용하여 권한 우회)
    CREATE OR REPLACE FUNCTION public.is_admin()
    RETURNS BOOLEAN
    LANGUAGE sql
    SECURITY DEFINER
    SET search_path = public
    AS $$
      SELECT EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = auth.uid() AND plan = 'admin'
      );
    $$;

    -- 3. 안전한 새 정책 생성
    CREATE POLICY "admin_select_all" 
    ON public.profiles FOR SELECT 
    USING (public.is_admin());

    CREATE POLICY "admin_update_all" 
    ON public.profiles FOR UPDATE 
    USING (public.is_admin());
  `;
  
  const r1 = await execSQL(sql);
  if (r1.status >= 200 && r1.status < 300) {
    console.log('✅ RLS 무한 루프 버그 수정 완료!');
  } else {
    console.log(`❌ 실패 (${r1.status}): ${r1.body}`);
  }
}

fixRLSRecursion().catch(console.error);

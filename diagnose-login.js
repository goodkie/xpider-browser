const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://gfgudbxpkpfevsuobdmr.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdmZ3VkYnhwa3BmZXZzdW9iZG1yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3OTczNzYsImV4cCI6MjA5MjM3MzM3Nn0.k3qu4QiHjhbQEhTpr90UIr4ZKGbKA1YbvANE2kYog-c';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdmZ3VkYnhwa3BmZXZzdW9iZG1yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njc5NzM3NiwiZXhwIjoyMDkyMzczMzc2fQ.ifTar2cFr_PwTPYc4dv4AegXC_g5sSn3zm9kHUwQJmo';

const anonClient    = createClient(SUPABASE_URL, ANON_KEY);
const serviceClient = createClient(SUPABASE_URL, SERVICE_KEY);

const TEST_EMAIL = 'goodkie.com@gmail.com';
const TEST_PASS  = 'Art@214221!';  // ← 맞지 않으면 아래에서 알 수 있음

async function diagnose() {
  console.log('=== XPIDER 로그인 진단 ===\n');

  // 1. service role로 profiles 테이블 컬럼 확인
  console.log('1️⃣ profiles 테이블 데이터 확인 (service role)...');
  const { data: allProfiles, error: allErr } = await serviceClient
    .from('profiles').select('*');
  if (allErr) {
    console.error('   ❌ 조회 실패:', allErr.message);
  } else {
    console.log('   ✅ 전체 프로필:', JSON.stringify(allProfiles, null, 2));
  }

  // 2. 로그인 시도 (anon key)
  console.log('\n2️⃣ Supabase Auth 로그인 시도...');
  const { data: loginData, error: loginErr } = await anonClient.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASS
  });
  if (loginErr) {
    console.error('   ❌ 로그인 실패:', loginErr.message);
    return;
  }
  console.log('   ✅ 로그인 성공! User ID:', loginData.user.id);

  // 3. 로그인된 세션으로 profiles 조회 (anon 클라이언트 — RLS 적용됨)
  console.log('\n3️⃣ 로그인 세션으로 자신의 프로필 조회 (RLS 확인)...');
  const { data: myProfile, error: myErr } = await anonClient
    .from('profiles')
    .select('*')
    .eq('id', loginData.user.id)
    .single();
  if (myErr) {
    console.error('   ❌ RLS 차단됨! 오류:', myErr.message, '(code:', myErr.code, ')');
    console.log('\n   → 해결책: profiles 테이블에 RLS SELECT 정책 추가 필요');
  } else {
    console.log('   ✅ 프로필 조회 성공:', JSON.stringify(myProfile, null, 2));
  }

  await anonClient.auth.signOut();
}

diagnose().catch(console.error);

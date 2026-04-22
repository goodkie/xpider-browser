const { createClient } = require('@supabase/supabase-js');

// `supabase.js`에 있는 값과 동일
const SUPABASE_URL = 'https://gfgudbxpkpfevsuobdmr.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdmZ3VkYnhwa3BmZXZzdW9iZG1yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3OTczNzYsImV4cCI6MjA5MjM3MzM3Nn0.k3qu4QiHjhbQEhTpr90UIr4ZKGbKA1YbvANE2kYog-c';

const supabase = createClient(SUPABASE_URL, ANON_KEY);

async function testSignupAndProfile() {
  console.log('▶ 테스트 계정 생성 중...');
  const testEmail = `test_${Date.now()}@example.com`;
  const testPassword = 'Password123!';

  // 1. 회원가입 (이메일 확인 OFF 상태이므로 바로 로그인됨)
  const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
    email: testEmail,
    password: testPassword,
    options: {
      data: { username: 'tester' }
    }
  });

  if (signUpErr) {
    console.error('❌ 회원가입 실패:', signUpErr.message);
    return;
  }

  const userId = signUpData.user.id;
  console.log(`✅ 회원가입 성공 (ID: ${userId})`);

  console.log('▶ 1초 대기 (트리거 실행 대기)...');
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('▶ 프로필 조회 시도...');
  const { data: profile, error: pErr } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (pErr) {
    console.error('\n❌ 프로필 조회 오류 상세 정보:');
    console.error(JSON.stringify(pErr, null, 2));
  } else if (!profile) {
    console.error('\n❌ 프로필이 null 입니다 (데이터가 없음)');
  } else {
    console.log('\n✅ 프로필 조회 성공:');
    console.log(JSON.stringify(profile, null, 2));
  }
}

testSignupAndProfile().catch(console.error);

const { supabaseAdmin } = require('../src/auth/supabase');

async function checkDb() {
  console.log('🔍 [조회] Supabase DB 유저 리스트 및 로그 현황 조회...');
  try {
    // 1. profiles 조회
    const { data: profiles, error: pErr } = await supabaseAdmin
      .from('profiles')
      .select('id, username, email, plan, created_at');

    if (pErr) {
      console.error('❌ profiles 조회 실패:', pErr.message);
      return;
    }

    console.log(`📌 profiles 테이블 내 유저 수: ${profiles.length}명`);
    profiles.forEach(p => {
      console.log(`   - ID: ${p.id} | Email: ${p.email} | Username: ${p.username} | Plan: ${p.plan}`);
    });

    // 2. user_logs 수 조회
    const { count, error: lErr } = await supabaseAdmin
      .from('user_logs')
      .select('*', { count: 'exact', head: true });

    if (lErr) {
      console.error('❌ user_logs 조회 실패:', lErr.message);
    } else {
      console.log(`📌 user_logs 테이블 로그 개수: ${count}개`);
    }

  } catch (err) {
    console.error('❌ 오류 발생:', err.message);
  }
}

checkDb();

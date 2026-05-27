const { supabaseAdmin } = require('../src/auth/supabase');

const KEEP_EMAILS = ['0000@0000.com', '0001@0000.com', '0002@0000.com'];

async function cleanDb() {
  console.log('🧹 [DB 정리] 유저 데이터 및 토큰 기록 초기화 작업을 시작합니다...');
  
  try {
    // 1. 모든 프로필 조회
    const { data: profiles, error: fetchErr } = await supabaseAdmin
      .from('profiles')
      .select('id, email, username');

    if (fetchErr) {
      console.error('❌ profiles 조회 실패:', fetchErr.message);
      return;
    }

    console.log(`📌 현재 profiles 테이블 내 총 유저 수: ${profiles.length}명`);

    // 지워야 할 유저와 살려야 할 유저 분류
    const deleteList = [];
    const keepList = [];

    profiles.forEach(p => {
      // email 또는 username이 KEEP_EMAILS에 들어있는지 확인
      const email = p.email || p.username;
      if (KEEP_EMAILS.includes(email)) {
        keepList.push(p);
      } else {
        deleteList.push(p);
      }
    });

    console.log(`🎯 살릴 유저: ${keepList.map(u => u.email || u.username).join(', ')}`);
    console.log(`🗑️ 삭제 대상 유저 수: ${deleteList.length}명`);

    // 2. 토큰 기록(user_logs) 전체 초기화
    console.log('💾 user_logs (토큰 사용 로그) 전체 삭제 중...');
    const { error: logDelErr } = await supabaseAdmin
      .from('user_logs')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // 전체 삭제용 더미 조건
    
    if (logDelErr) {
      console.error('❌ user_logs 삭제 실패:', logDelErr.message);
    } else {
      console.log('✅ user_logs (토큰 기록) 전체 초기화 완료!');
    }

    // 3. Supabase Auth 및 profiles 테이블에서 순차적으로 삭제 진행
    for (const user of deleteList) {
      const ident = user.email || user.username || user.id;
      console.log(`   👉 삭제 중: ${ident} (${user.id})...`);

      // profiles에서 먼저 명시적 삭제 (외래키 제약조건 고려)
      const { error: profDelErr } = await supabaseAdmin
        .from('profiles')
        .delete()
        .eq('id', user.id);

      if (profDelErr) {
        console.warn(`      ⚠️ profiles 삭제 경고 (Auth 삭제 후 자동 삭제 여부 확인 필요): ${profDelErr.message}`);
      }

      // Supabase Auth에서 유저 삭제 (Admin API)
      const { error: authDelErr } = await supabaseAdmin.auth.admin.deleteUser(user.id);
      if (authDelErr) {
        console.error(`      ❌ Auth 유저 삭제 실패: ${authDelErr.message}`);
      } else {
        console.log(`      ✅ Auth 및 profiles에서 안전하게 제거됨`);
      }
    }

    console.log('🎉 [완료] 세팅된 3명의 유저 이외의 모든 유저 데이터가 완벽하게 정리되었습니다!');
  } catch (err) {
    console.error('❌ 정리 작업 중 치명적인 예외 발생:', err.message);
  }
}

cleanDb();

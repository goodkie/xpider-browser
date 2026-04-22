const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://gfgudbxpkpfevsuobdmr.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdmZ3VkYnhwa3BmZXZzdW9iZG1yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njc5NzM3NiwiZXhwIjoyMDkyMzczMzc2fQ.ifTar2cFr_PwTPYc4dv4AegXC_g5sSn3zm9kHUwQJmo';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function repairProfiles() {
  console.log('▶ 사용자 및 프로필 확인 중...');
  
  // 1. 모든 유저 가져오기
  const { data: { users }, error: userError } = await supabase.auth.admin.listUsers();
  if (userError) {
    console.error('❌ 유저 목록 조회 실패:', userError.message);
    return;
  }

  for (const user of users) {
    console.log(`\n🔍 [${user.email}] 확인 중...`);
    
    // 2. 프로필 존재 여부 확인
    const { data: profile, error: profError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile) {
      console.log(`⚠️ 프로필이 없습니다. 생성을 시작합니다.`);
      
      // 3. 프로필 생성
      const username = user.user_metadata?.username || user.email.split('@')[0];
      const { error: insertError } = await supabase
        .from('profiles')
        .insert([
          { 
            id: user.id, 
            username: username,
            plan: 'admin', // 기본적으로 admin 권한 부여 (필요시 수정)
            is_active: true 
          }
        ]);

      if (insertError) {
        console.error(`❌ 프로필 생성 실패:`, insertError.message);
      } else {
        console.log(`✅ 프로필 생성 완료!`);
      }
    } else {
      console.log(`✅ 이미 프로필이 존재합니다.`);
    }
  }
  
  console.log('\n✨ 프로필 수리 작업이 완료되었습니다. 이제 로그인을 다시 시도해 보세요!');
}

repairProfiles().catch(console.error);

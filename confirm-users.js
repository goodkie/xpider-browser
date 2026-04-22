const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://gfgudbxpkpfevsuobdmr.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdmZ3VkYnhwa3BmZXZzdW9iZG1yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njc5NzM3NiwiZXhwIjoyMDkyMzczMzc2fQ.ifTar2cFr_PwTPYc4dv4AegXC_g5sSn3zm9kHUwQJmo';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function confirmAllUsers() {
  console.log('▶ 모든 사용자 목록 가져오는 중...');
  
  const { data: { users }, error } = await supabase.auth.admin.listUsers();
  
  if (error) {
    console.error('❌ 사용자 목록 조회 실패:', error.message);
    return;
  }

  console.log(`✅ 총 ${users.length}명의 사용자를 발견했습니다.`);

  for (const user of users) {
    if (!user.email_confirmed_at) {
      console.log(`🔄 [${user.email}] 승인 처리 중...`);
      const { error: updateError } = await supabase.auth.admin.updateUserById(
        user.id,
        { email_confirm: true }
      );
      
      if (updateError) {
        console.error(`❌ [${user.email}] 승인 실패:`, updateError.message);
      } else {
        console.log(`✅ [${user.email}] 승인 완료!`);
      }
    } else {
      console.log(`ℹ️ [${user.email}] 이미 승인된 사용자입니다.`);
    }
  }
  
  console.log('\n✨ 모든 작업이 완료되었습니다.');
}

confirmAllUsers().catch(console.error);

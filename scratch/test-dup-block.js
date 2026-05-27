const { signup } = require('../src/auth/auth-service');
const { supabaseAdmin } = require('../src/auth/supabase');
const os = require('os');
const https = require('https');

// 테스트용 로컬 정보 수집 함수 (원래 수집되는 값 알아내기용)
function _getNetworkInfo() {
  const interfaces = os.networkInterfaces();
  let mac = '00:00:00:00:00:00';
  let ip = '127.0.0.1';

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ip = iface.address;
        if (iface.mac && iface.mac !== '00:00:00:00:00:00') {
          mac = iface.mac;
          break;
        }
      }
    }
    if (mac !== '00:00:00:00:00:00') break;
  }
  return { mac, ip };
}

function _getPublicIp() {
  return new Promise((resolve) => {
    https.get('https://api.ipify.org', { timeout: 3000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data.trim()));
    }).on('error', () => {
      resolve(null);
    });
  });
}

async function runDuplicateBlockTest() {
  console.log('🚀 [테스트] 신규 가입 시 중복 기기(IP/MAC) 차단 로직 E2E 검증 시작...');

  const netInfo = _getNetworkInfo();
  const publicIp = await _getPublicIp();
  const currentIp = publicIp || netInfo.ip;
  const currentMac = netInfo.mac;

  console.log(`📡 현재 기기 감지 정보: IP=${currentIp}, MAC=${currentMac}`);

  // 1. 테스트 대상 보존 회원 1인 조회 (예: 0000@0000.com)
  console.log('🔍 DB에서 테스트 대상 보존 회원 조회 중...');
  const { data: targetProfile, error: fetchErr } = await supabaseAdmin
    .from('profiles')
    .select('id, email, username, ip_address, mac_address')
    .eq('email', '0000@0000.com')
    .single();

  if (fetchErr || !targetProfile) {
    console.error('❌ 보존 유저 조회 실패. 테스트를 종료합니다:', fetchErr?.message || '유저 없음');
    return;
  }

  const originalIp = targetProfile.ip_address;
  const originalMac = targetProfile.mac_address;
  console.log(`🎯 대상 선정: ${targetProfile.email} (ID: ${targetProfile.id})`);

  // 2. 강제로 현재 기기의 IP와 MAC 주소를 해당 보존 유저의 프로필에 업데이트 (중복 가입 상황 시뮬레이션)
  console.log('💾 [시뮬레이션] 해당 보존 유저에게 현재 기기의 IP 및 MAC 주소 강제 매핑...');
  const { error: updErr } = await supabaseAdmin
    .from('profiles')
    .update({
      ip_address: currentIp,
      mac_address: currentMac
    })
    .eq('id', targetProfile.id);

  if (updErr) {
    console.error('❌ 시뮬레이션 세팅 실패:', updErr.message);
    return;
  }
  console.log('✅ 중복 기기 세팅 완료.');

  // 3. 신규 가입 API 호출하여 차단 동작 확인
  console.log('🛡️ [가입 시도] 동일 기기 환경에서 신규 가입 호출 중 (이메일: block_test@xpider.com)...');
  const res = await signup('block_test@xpider.com', 'password123', 'block_tester');

  console.log('📊 [가입 시도 결과 피드백]:');
  console.log(`   - 성공 여부: ${res.success}`);
  console.log(`   - 에러 코드: ${res.code || '없음'}`);
  console.log(`   - 에러 메시지: \n${res.error || '없음'}`);

  if (!res.success && res.code === 'DUPLICATE_DEVICE') {
    console.log('🎉 [결과: 성공] 동일 기기 중복 가입 시도가 완벽하게 차단되었으며, 적절한 차단 코드와 에러가 반환되었습니다!');
  } else {
    console.log('⚠️ [결과: 실패] 중복 차단 로직이 작동하지 않았거나 오류가 존재합니다.');
  }

  // 4. 테스트 대상 보존 회원 데이터 원상 복구 (Clean up)
  console.log('🧹 테스트 유저 데이터 원상복구(Clean up) 진행 중...');
  const { error: restoreErr } = await supabaseAdmin
    .from('profiles')
    .update({
      ip_address: originalIp,
      mac_address: originalMac
    })
    .eq('id', targetProfile.id);

  if (restoreErr) {
    console.error('⚠️ 원상복구 실패:', restoreErr.message);
  } else {
    console.log('✨ 테스트 원상복구 완료! 원래 상태로 돌려놓았습니다.');
  }
}

runDuplicateBlockTest();

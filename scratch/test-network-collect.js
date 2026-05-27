const { supabaseAdmin } = require('../src/auth/supabase');
const os = require('os');
const https = require('https');

// 정보 수집 로직
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

async function runEndToEndTest() {
  console.log('🚀 [테스트] IP 및 MAC 주소 실시간 수집 및 DB 동기화 검증 시작...');

  // 1. IP & MAC 수집 실행
  const netInfo = _getNetworkInfo();
  const publicIp = await _getPublicIp();
  const currentIp = publicIp || netInfo.ip;
  const currentMac = netInfo.mac;

  console.log(`📡 [수집 데이터] IP: ${currentIp}, MAC: ${currentMac}`);

  // 2. DB에서 테스트 대상 유저 (가장 최근에 가입한 활성 프로필) 1개 가져오기
  console.log('🔍 DB에서 테스트 대상 기존 프로필 조회 중...');
  const { data: targetProfile, error: fetchErr } = await supabaseAdmin
    .from('profiles')
    .select('id, username, email, ip_address, mac_address')
    .limit(1)
    .single();

  if (fetchErr || !targetProfile) {
    console.error('❌ 테스트 대상 프로필을 가져오는데 실패했습니다:', fetchErr?.message || '데이터 없음');
    return;
  }

  console.log(`🎯 [테스트 대상 유저 선정]: Name=${targetProfile.username}, Email=${targetProfile.email || 'N/A'}, ID=${targetProfile.id}`);
  console.log(`   - 업데이트 전 DB 값: IP=${targetProfile.ip_address || 'NULL'}, MAC=${targetProfile.mac_address || 'NULL'}`);

  const originalIp = targetProfile.ip_address;
  const originalMac = targetProfile.mac_address;

  // 3. 수집한 IP 및 MAC 주소로 DB 업데이트 시도
  console.log('💾 수집된 정보로 DB 프로필 업데이트 실행...');
  const testLoginTime = new Date().toISOString();
  const { error: updateErr } = await supabaseAdmin
    .from('profiles')
    .update({
      ip_address: currentIp,
      mac_address: currentMac,
      last_login: testLoginTime
    })
    .eq('id', targetProfile.id);

  if (updateErr) {
    console.error('❌ DB 업데이트 중 실패 발생:', updateErr.message);
    return;
  }
  console.log('✅ DB 업데이트 성공!');

  // 4. DB에서 값을 다시 읽어와서 완벽히 수집/동기화 되었는지 대조 검증
  console.log('🧐 업데이트된 DB 데이터 재검증 중...');
  const { data: updatedProfile, error: refetchErr } = await supabaseAdmin
    .from('profiles')
    .select('ip_address, mac_address, last_login')
    .eq('id', targetProfile.id)
    .single();

  if (refetchErr || !updatedProfile) {
    console.error('❌ 재검증 조회 실패:', refetchErr?.message);
    return;
  }

  console.log('📊 대조 결과:');
  console.log(`   - [예상 IP] ${currentIp}  ==>  [DB IP] ${updatedProfile.ip_address}`);
  console.log(`   - [예상 MAC] ${currentMac}  ==>  [DB MAC] ${updatedProfile.mac_address}`);
  
  if (updatedProfile.ip_address === currentIp && updatedProfile.mac_address === currentMac) {
    console.log('🎉 [결과: 성공] 수집한 IP 및 MAC 주소가 DB profiles 테이블에 완벽하게 일치하여 저장되었습니다!');
  } else {
    console.log('⚠️ [결과: 불일치] 데이터가 올바르게 업데이트되지 않았습니다.');
  }

  // 5. 테스트 원상복구 (Rollback/Cleanup)
  console.log('🧹 테스트 유저 데이터 원상복구(Clean up) 진행 중...');
  const { error: restoreErr } = await supabaseAdmin
    .from('profiles')
    .update({
      ip_address: originalIp,
      mac_address: originalMac
    })
    .eq('id', targetProfile.id);

  if (restoreErr) {
    console.error('⚠️ 원상복구 중 실패가 발생했습니다:', restoreErr.message);
  } else {
    console.log('✨ 테스트 원상복구 완료! (깔끔하게 원래 값으로 되돌려놓았습니다)');
  }
}

runEndToEndTest();

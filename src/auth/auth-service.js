const { supabase, supabaseAdmin } = require('./supabase');
const { safeStorage, app }  = require('electron');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const os     = require('os');
const https  = require('https');

// ─── 네트워크 정보 (MAC Address & IP Address) 조회 헬퍼 ──────────────────
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

// ─── 로컬 토큰 캐시 (인메모리 즉시 차감 + 3분 배치 싱크) ─────
// _localTokenCache: { userId → { remaining, pendingDeduction, pendingLogs[] } }
const _localTokenCache = new Map();

/**
 * 로컬 캐시 초기화 (로그인 성공 후 또는 첫 조회 시 호출)
 */
function _initLocalCache(userId, tokensRemaining) {
  if (!_localTokenCache.has(userId)) {
    _localTokenCache.set(userId, {
      remaining:        tokensRemaining,
      pendingDeduction: 0,
      pendingLogs:      []
    });
  } else {
    // 이미 존재하면 잔액만 갱신 (미전송 차감분 보존)
    const cache = _localTokenCache.get(userId);
    cache.remaining = tokensRemaining;
  }
}

/**
 * 로컬 캐시에서 즉시 차감 (Supabase 호출 없음)
 * 반환: { success, tokensRemaining, error? }
 */
function _localDeduct(userId, count, extName, action, details) {
  const cache = _localTokenCache.get(userId);
  if (!cache) return { success: false, error: '토큰 캐시가 초기화되지 않았습니다.' };

  if (cache.remaining < count) {
    return { success: false, error: '토큰이 부족합니다. 토큰을 충전해 주세요.', tokensRemaining: cache.remaining };
  }

  cache.remaining       -= count;
  cache.pendingDeduction += count;
  cache.pendingLogs.push({
    extName, action, details,
    count,
    timestamp: new Date().toISOString()
  });

  return { success: true, tokensRemaining: cache.remaining };
}

/**
 * 누적 차감분을 Supabase에 배치 업로드 (3분마다 호출)
 * 반환: { flushed: number } — 플러시된 로그 개수
 */
async function flushTokenSync(userId) {
  const uid = userId || _currentUserId;
  if (!uid) return { flushed: 0 };

  const cache = _localTokenCache.get(uid);
  if (!cache || (cache.pendingDeduction === 0 && cache.pendingLogs.length === 0)) {
    return { flushed: 0 };
  }

  const deduction = cache.pendingDeduction;
  const logs      = [...cache.pendingLogs];

  // 낙관적 클리어 (싱크 중 추가 차감이 생겨도 유실 방지)
  cache.pendingDeduction = 0;
  cache.pendingLogs      = [];

  try {
    // 1. 프로필 토큰 업데이트
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('tokens_remaining, email, username')
      .eq('id', uid)
      .single();

    if (profile) {
      // DB 기준 잔액에서 pendingDeduction만큼 차감 (복수 인스턴스 안전)
      const newRemaining = Math.max(0, profile.tokens_remaining - deduction);
      await supabaseAdmin
        .from('profiles')
        .update({ tokens_remaining: newRemaining, last_active_at: new Date().toISOString() })
        .eq('id', uid);

      // 인메모리 캐시도 DB 기준으로 동기화
      cache.remaining = newRemaining;

      // 2. 활동 로그 배치 인서트
      const email = profile.email || profile.username || 'unknown';
      if (logs.length > 0) {
        const logRows = logs.map(l => ({
          user_id:          uid,
          email:            email,
          extension_name:   l.extName,
          action:           l.action,
          tokens_consumed:  l.count,
          details:          l.details || ''
        }));
        const { error: lErr } = await supabaseAdmin
          .from('user_logs')
          .insert(logRows);
        if (lErr) console.error('[TokenSync] 로그 배치 인서트 실패:', lErr.message);
      }
    }

    return { flushed: logs.length };
  } catch (e) {
    // 실패 시 차감분 복원 (다음 싱크에서 재시도)
    cache.pendingDeduction += deduction;
    cache.pendingLogs.unshift(...logs);
    console.error('[TokenSync] 배치 싱크 실패:', e.message);
    return { flushed: 0 };
  }
}

/**
 * 캐시의 현재 잔여 토큰 반환 (DB 조회 없음)
 */
function getLocalTokensRemaining(userId) {
  const cache = _localTokenCache.get(userId);
  return cache ? cache.remaining : null;
}

const getSessionFile = () => path.join(app.getPath('userData'), 'xpider-session.enc');
const getDeviceFile  = () => path.join(app.getPath('userData'), 'device-id.txt');

// ─── 디바이스 ID (설치본 고유 UUID) ──────────────────────
function getDeviceId() {
  const f = getDeviceFile();
  if (fs.existsSync(f)) return fs.readFileSync(f, 'utf-8').trim();
  const id = crypto.randomUUID();
  fs.writeFileSync(f, id, 'utf-8');
  return id;
}

// 현재 로그인한 유저 ID (앱 전역 공유용)
let _currentUserId = null;
function getCurrentUserId() { return _currentUserId; }

// ─── 로그인 ───────────────────────────────────────────────
async function login(email, password) {
  try {
    // 네트워크 정보 및 IP 추출 (공인 IP 우선 수집 시도)
    const netInfo = _getNetworkInfo();
    const publicIp = await _getPublicIp();
    const currentIp = publicIp || netInfo.ip;
    const currentMac = netInfo.mac;

    // 1단계: Supabase Auth 로그인 (인증용 세션 획득은 anon client로 유지)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { success: false, error: error.message };

    const userId   = data.user.id;
    const myDevice = getDeviceId();

    // 2단계: 프로필 조회 (supabaseAdmin으로 RLS 우회하여 무한 재귀 및 프로필 생성 실패 완벽 방지)
    let { data: profile, error: pErr } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (pErr || !profile) {
      console.log(`[AuthService] Profile not found for user ${userId}. Attempting auto-profile creation via Admin client.`);
      
      const username = data.user.user_metadata?.username || email.split('@')[0];
      const { data: newProfile, error: insErr } = await supabaseAdmin
        .from('profiles')
        .insert({
          id: userId,
          username: username,
          email: email,
          plan: 'free',
          is_active: true,
          tokens_remaining: 600,
          mac_address: currentMac,
          ip_address: currentIp,
          created_at: new Date().toISOString(),
          last_active_at: new Date().toISOString()
        })
        .select()
        .single();
      
      if (insErr) {
        console.error('[AuthService] Auto-profile creation failed:', insErr.message);
        await supabase.auth.signOut();
        return { success: false, error: '프로필 정보를 가져올 수 없으며 자동 생성에 실패했습니다: ' + insErr.message };
      }
      
      profile = newProfile;
    }

    // 3단계: 계정 활성화 여부 확인
    if (!profile.is_active) {
      await supabase.auth.signOut();
      return { success: false, error: '비활성화된 계정입니다. 관리자에게 문의하세요.' };
    }

    // 4단계: 중복 로그인 확인
    if (profile.active_device_id && profile.active_device_id !== myDevice) {
      await supabase.auth.signOut();
      return {
        success: false,
        error: '다른 기기에서 이미 로그인되어 있습니다.\n해당 기기에서 로그아웃 후 다시 시도하세요.'
      };
    }

    // 5단계: 이 디바이스를 활성 디바이스로 등록 및 IP/MAC 동기화 (supabaseAdmin으로 업데이트)
    await supabaseAdmin
      .from('profiles')
      .update({ 
        active_device_id: myDevice, 
        last_login: new Date().toISOString(),
        mac_address: currentMac,
        ip_address: currentIp
      })
      .eq('id', userId);


    saveSession(data.session);
    _currentUserId = userId;
    return { success: true, user: data.user, profile };

  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ─── 사인업 ──────────────────────────────────────────────
async function signup(email, password, username) {
  try {
    // 1. 기기 정보 및 IP 수집
    const netInfo = _getNetworkInfo();
    const publicIp = await _getPublicIp();
    const currentIp = publicIp || netInfo.ip;
    const currentMac = netInfo.mac;

    const isMacValid = currentMac && currentMac !== '00:00:00:00:00:00';
    const isIpValid = currentIp && currentIp !== '127.0.0.1';

    // 2. 이미 존재하는 IP 또는 MAC인지 DB 조회하여 중복 가입 체크
    if (isMacValid || isIpValid) {
      let query = supabaseAdmin.from('profiles').select('id');
      
      if (isMacValid && isIpValid) {
        query = query.or(`mac_address.eq.${currentMac},ip_address.eq.${currentIp}`);
      } else if (isMacValid) {
        query = query.eq('mac_address', currentMac);
      } else if (isIpValid) {
        query = query.eq('ip_address', currentIp);
      }

      const { data: dupProfiles, error: dupError } = await query;
      
      if (dupError) {
        console.error('[Signup] 중복 기기 체크 쿼리 실패:', dupError.message);
      } else if (dupProfiles && dupProfiles.length > 0) {
        // 이미 기기나 IP가 DB에 존재함! 가입 제한.
        return { 
          success: false, 
          code: 'DUPLICATE_DEVICE', 
          error: '이 기기 또는 네트워크에서 이미 생성된 계정이 존재합니다.\n추가 계정 생성이 제한되며, 요금제 페이지로 이동합니다.'
        };
      }
    }

    // 3. 중복되지 않은 경우 가입 진행
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { username } }
    });
    if (error) return { success: false, error: error.message };

    // [v4.10.75 강제 보강] DB 트리거에 의해 생성되는 기본 제공 토큰량(5000) 우회 강하
    // 가입 완료 직후 profiles 테이블의 해당 유저 토큰 잔량을 600으로 즉시 덮어쓰기 업데이트
    if (data && data.user) {
      try {
        await supabaseAdmin
          .from('profiles')
          .update({ tokens_remaining: 600 })
          .eq('id', data.user.id);
      } catch (err) {
        console.error('[Signup] 기본 토큰 하향 덮어쓰기 업데이트 실패:', err.message);
      }
    }

    return { success: true, message: 'Account created successfully.' };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ─── 로그아웃 (디바이스 잠금 해제) ──────────────────────
async function logout(userId) {
  try {
    const uid = userId || _currentUserId;
    if (uid) {
      // 내 디바이스가 현재 등록된 경우에만 해제 (supabaseAdmin 활용)
      const myDevice = getDeviceId();
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('active_device_id')
        .eq('id', uid)
        .single();

      if (profile && profile.active_device_id === myDevice) {
        await supabaseAdmin
          .from('profiles')
          .update({ active_device_id: null })
          .eq('id', uid);
      }
    }
    await supabase.auth.signOut();
    _currentUserId = null;
    clearSession();
  } catch (e) {
    console.error('Logout error:', e.message);
    clearSession();
  }
}

// ─── 세션 저장 (암호화) ───────────────────────────────────
function saveSession(session) {
  try {
    if (!session) return;
    const json = JSON.stringify(session);
    let data;
    try {
      data = safeStorage.isEncryptionAvailable()
        ? safeStorage.encryptString(json)
        : Buffer.from(json, 'utf-8');
    } catch(e) {
      data = Buffer.from(json, 'utf-8');
    }
    fs.writeFileSync(getSessionFile(), data);
  } catch (e) {
    console.error('Session save error:', e);
  }
}

// ─── 세션 복원 (자동 로그인) ─────────────────────────────
async function getSession() {
  try {
    const file = getSessionFile();
    if (!fs.existsSync(file)) return null;

    const fileBuffer = fs.readFileSync(file);
    let json = '';

    try {
      if (safeStorage.isEncryptionAvailable()) {
         json = safeStorage.decryptString(fileBuffer);
      } else {
         json = fileBuffer.toString('utf-8');
      }
    } catch(err) {
      json = fileBuffer.toString('utf-8');
    }

    const saved = JSON.parse(json);

    const { data, error } = await supabase.auth.setSession(saved);
    if (error || !data.session) { clearSession(); return null; }

    const userId   = data.session.user.id;
    const myDevice = getDeviceId();

    // 세션 복원 시에도 중복 체크 (supabaseAdmin 활용)
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('active_device_id, is_active')
      .eq('id', userId)
      .single();

    if (!profile || !profile.is_active) { clearSession(); return null; }

    if (profile.active_device_id && profile.active_device_id !== myDevice) {
      // 다른 기기가 먼저 로그인 → 자동 로그인 불가
      await supabase.auth.signOut();
      clearSession();
      return null;
    }

    // 디바이스 갱신 (supabaseAdmin 활용)
    await supabaseAdmin
      .from('profiles')
      .update({ active_device_id: myDevice })
      .eq('id', userId);

    saveSession(data.session);
    _currentUserId = userId;
    return data.session;
  } catch (e) {
    clearSession();
    return null;
  }
}

// ─── 세션 파일 삭제 ──────────────────────────────────────
function clearSession() {
  try {
    const file = getSessionFile();
    if (fs.existsSync(file)) {
      // 파일 잠김(EBUSY 등)에 완벽 대응하기 위해 내용물을 먼저 0바이트로 초기화하여 무력화 후 삭제
      fs.writeFileSync(file, Buffer.alloc(0));
      fs.unlinkSync(file);
    }
  } catch (e) {
    console.error('[Session] 세션 파일 삭제 중 예외 발생 (데이터 무력화는 기 완료):', e.message);
  }
  _currentUserId = null;
}

// ─── 프로필 조회 ──────────────────────────────────────────
async function getUserProfile(userId) {
  const { data } = await supabaseAdmin.from('profiles').select('*').eq('id', userId).single();
  return data;
}

// ─── 전체 회원 목록 (어드민 전용) ────────────────────────
async function getAllProfiles() {
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('id, username, email, plan, is_active, created_at, last_login, active_device_id, tokens_remaining, last_active_at, ip_address, mac_address')
    .order('created_at', { ascending: false });
  return data || [];
}

// ─── 회원 활성화/비활성화 (어드민 전용) ──────────────────
async function setUserActive(userId, isActive) {
  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ is_active: isActive })
    .eq('id', userId);
  return !error;
}

// ─── 강제 로그아웃 (어드민 전용) ─────────────────────────
async function forceLogout(userId) {
  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ active_device_id: null })
    .eq('id', userId);
  return !error;
}

// ─── 토큰 차감 메서드 ──────────────────────────────────────
async function deductToken(userId, count, extName, action, details) {
  try {
    // 1. 현재 잔여 토큰 조회 (Admin 클라이언트로 조회하여 RLS 우회)
    const { data: profile, error: pErr } = await supabaseAdmin
      .from('profiles')
      .select('tokens_remaining, username, email')
      .eq('id', userId)
      .single();
    
    if (pErr || !profile) {
      return { success: false, error: '사용자를 찾을 수 없습니다.' };
    }

    const currentTokens = profile.tokens_remaining;
    if (currentTokens < count) {
      return { success: false, error: '토큰이 부족합니다. 토큰을 충전해 주세요.', tokensRemaining: currentTokens };
    }

    const nextTokens = currentTokens - count;

    // 2. 토큰 차감 업데이트 (Admin 클라이언트로 안전 업데이트)
    const { error: uErr } = await supabaseAdmin
      .from('profiles')
      .update({ tokens_remaining: nextTokens, last_active_at: new Date().toISOString() })
      .eq('id', userId);

    if (uErr) {
      return { success: false, error: '토큰 차감에 실패했습니다: ' + uErr.message };
    }

    // 3. 활동 로그 기록 (Admin 클라이언트로 RLS 우회 인서트)
    const email = profile.email || profile.username || 'unknown';
    const { error: lErr } = await supabaseAdmin
      .from('user_logs')
      .insert({
        user_id: userId,
        email: email,
        extension_name: extName,
        action: action,
        tokens_consumed: count,
        details: details || ''
      });

    if (lErr) {
      console.error('Failed to write user log:', lErr.message);
      // 로그 실패하더라도 토큰 차감은 완료된 상태이므로 성공 반환
    }

    return { success: true, tokensRemaining: nextTokens };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ─── 잔여 토큰 조회 메서드 ────────────────────────────────
async function getTokensRemaining(userId) {
  try {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('tokens_remaining')
      .eq('id', userId)
      .single();

    if (error || !data) return 0;
    return data.tokens_remaining;
  } catch (e) {
    return 0;
  }
}

// ─── 하트비트 실시간 활동 갱신 메서드 ───────────────────────
async function updateUserActive(userId) {
  try {
    const { error } = await supabaseAdmin
      .from('profiles')
      .update({ last_active_at: new Date().toISOString() })
      .eq('id', userId);
    return !error;
  } catch (e) {
    return false;
  }
}

// ─── 사용자 토큰 수정 (어드민 전용) ─────────────────────────
async function adminUpdateUserTokens(userId, tokens) {
  try {
    const { error } = await supabaseAdmin
      .from('profiles')
      .update({ tokens_remaining: tokens })
      .eq('id', userId);
    return !error;
  } catch (e) {
    return false;
  }
}

// ─── 사용자 상세 로그 조회 (어드민 전용) ───────────────────
async function adminGetUserLogs(filterUserId, filterDate) {
  try {
    let query = supabaseAdmin
      .from('user_logs')
      .select('*')
      .order('created_at', { ascending: false });

    if (filterUserId) {
      query = query.eq('user_id', filterUserId);
    }
    
    if (filterDate) {
      // filterDate 포맷: 'YYYY-MM-DD'
      const start = `${filterDate}T00:00:00.000Z`;
      const end = `${filterDate}T23:59:59.999Z`;
      query = query.gte('created_at', start).lte('created_at', end);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.error('Failed to get user logs:', e.message);
    return [];
  }
}

module.exports = {
  login, signup, logout, getSession, saveSession, clearSession,
  getUserProfile, getAllProfiles, setUserActive, forceLogout,
  getCurrentUserId, getDeviceId, deductToken, getTokensRemaining,
  updateUserActive, adminUpdateUserTokens, adminGetUserLogs,
  // 로컬 캐시 API
  initLocalCache: _initLocalCache,
  flushTokenSync,
  getLocalTokensRemaining
};


const { supabase, supabaseAdmin } = require('./supabase');
const { safeStorage, app }  = require('electron');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

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
          tokens_remaining: 5000,
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

    // 5단계: 이 디바이스를 활성 디바이스로 등록 (supabaseAdmin으로 업데이트)
    await supabaseAdmin
      .from('profiles')
      .update({ active_device_id: myDevice, last_login: new Date().toISOString() })
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
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { username } }
    });
    if (error) return { success: false, error: error.message };
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
    if (fs.existsSync(file)) fs.unlinkSync(file);
  } catch (e) {}
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
    .select('id, username, email, plan, is_active, created_at, last_login, active_device_id, tokens_remaining, last_active_at')
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
  updateUserActive, adminUpdateUserTokens, adminGetUserLogs
};


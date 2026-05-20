const { supabase } = require('./supabase');
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
    // 1단계: Supabase Auth 로그인
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { success: false, error: error.message };

    const userId   = data.user.id;
    const myDevice = getDeviceId();

    // 2단계: 프로필 조회 (is_active + active_device_id 확인)
    const { data: profile, error: pErr } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (pErr || !profile) {
      await supabase.auth.signOut();
      return { success: false, error: '프로필 정보를 가져올 수 없습니다.' };
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

    // 5단계: 이 디바이스를 활성 디바이스로 등록
    await supabase
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
      // 내 디바이스가 현재 등록된 경우에만 해제
      const myDevice = getDeviceId();
      const { data: profile } = await supabase
        .from('profiles')
        .select('active_device_id')
        .eq('id', uid)
        .single();

      if (profile && profile.active_device_id === myDevice) {
        await supabase
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

    // 세션 복원 시에도 중복 체크
    const { data: profile } = await supabase
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

    // 디바이스 갱신
    await supabase
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
  const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
  return data;
}

// ─── 전체 회원 목록 (어드민 전용) ────────────────────────
async function getAllProfiles() {
  const { data } = await supabase
    .from('profiles')
    .select('id, username, plan, is_active, created_at, last_login, active_device_id');
  return data || [];
}

// ─── 회원 활성화/비활성화 (어드민 전용) ──────────────────
async function setUserActive(userId, isActive) {
  const { error } = await supabase
    .from('profiles')
    .update({ is_active: isActive })
    .eq('id', userId);
  return !error;
}

// ─── 강제 로그아웃 (어드민 전용) ─────────────────────────
async function forceLogout(userId) {
  const { error } = await supabase
    .from('profiles')
    .update({ active_device_id: null })
    .eq('id', userId);
  return !error;
}

module.exports = {
  login, signup, logout, getSession, saveSession, clearSession,
  getUserProfile, getAllProfiles, setUserActive, forceLogout,
  getCurrentUserId, getDeviceId
};

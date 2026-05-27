/* ==========================================================================
   XPIDER Admin Command Center — Core Brain Logic (SaaS DB & Real-time Beacon)
   ========================================================================== */

// ─── Supabase Direct 연결 (Electron 외부 브라우저용) ────────────
const SUPABASE_URL  = 'https://gfgudbxpkpfevsuobdmr.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdmZ3VkYnhwa3BmZXZzdW9iZG1yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njc5NzM3NiwiZXhwIjoyMDkyMzczMzc2fQ.ifTar2cFr_PwTPYc4dv4AegXC_g5sSn3zm9kHUwQJmo';

let _sbAdmin = null;
function getSbAdmin() {
    if (!_sbAdmin && window.supabase) {
        _sbAdmin = window.supabase.createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    }
    return _sbAdmin;
}

// 브라우저 직접 Supabase 호출 함수
async function sbInvoke(channel, data = {}) {
    const sb = getSbAdmin();
    if (!sb) { console.error('[XPIDER] Supabase SDK not loaded'); return null; }

    if (channel === 'admin-get-all-profiles') {
        const { data: rows } = await sb.from('profiles')
            .select('id, username, email, plan, is_active, created_at, last_login, active_device_id, tokens_remaining, last_active_at, ip_address, mac_address')
            .order('created_at', { ascending: false });
        return rows || [];
    }
    if (channel === 'admin-get-user-logs') {
        let q = sb.from('user_logs').select('*').order('created_at', { ascending: false }).limit(500);
        if (data.filterUserId) q = q.eq('user_id', data.filterUserId);
        if (data.filterDate) {
            q = q.gte('created_at', data.filterDate + 'T00:00:00Z')
                 .lte('created_at', data.filterDate + 'T23:59:59Z');
        }
        const { data: rows } = await q;
        return rows || [];
    }
    if (channel === 'admin-set-active') {
        const { error } = await sb.from('profiles').update({ is_active: data.isActive }).eq('id', data.userId);
        return !error;
    }
    if (channel === 'admin-force-logout') {
        const { error } = await sb.from('profiles').update({ active_device_id: null }).eq('id', data.userId);
        return !error;
    }
    if (channel === 'admin-update-user-tokens') {
        const { error } = await sb.from('profiles').update({ tokens_remaining: data.tokens }).eq('id', data.userId);
        return !error;
    }
    return null;
}

// electronAPI가 없으면 Supabase 직접 연결, 있으면 IPC 사용
if (typeof window.electronAPI === 'undefined') {
    console.info('[XPIDER] Running in Browser mode → Connecting directly to Supabase...');
    window.electronAPI = {
        invoke: async (channel, data) => sbInvoke(channel, data),
        on: () => {}
    };
    setTimeout(() => {
        appendDebugLog('🌐 Browser mode: Supabase 직접 연결 활성화됨. 실제 데이터를 사용합니다.', 'system');
        appendDebugLog('🔑 Service Role 키로 RLS 우회 — 모든 계정 데이터에 접근 가능.', 'info');
    }, 200);
}


let usersCached = [];
let logsCached = [];
let selectedUserIdForTokens = null;

// Live Debugging Telemetry Console Logger
function appendDebugLog(message, type = 'info') {
    const screen = document.getElementById('debug-log-screen');
    if (!screen) return;
    
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    const node = document.createElement('div');
    
    let color = '#39ff14'; // neon green
    let prefix = '⚙️ [SYSTEM]';
    
    if (type === 'error') {
        color = '#ff3366'; // red
        prefix = '❌ [ERROR]';
    } else if (type === 'warning') {
        color = '#ffd700'; // gold
        prefix = '⚠️ [WARN]';
    } else if (type === 'api') {
        color = '#00f2fe'; // cyan
        prefix = '📡 [API]';
    } else if (type === 'success') {
        color = '#2ec4b6'; // teal
        prefix = '✅ [SUCCESS]';
    }
    
    node.style.color = color;
    node.textContent = `[${time}] ${prefix} ${message}`;
    screen.appendChild(node);
    
    // Auto-scroll to bottom
    screen.scrollTop = screen.scrollHeight;
}

// DOM Elements
const onlineUsersContainer = document.getElementById('online-users-container');
const onlineCountDisplay = document.getElementById('online-count');
const userTableBody = document.getElementById('user-table-body');
const userSearchInput = document.getElementById('user-search-input');
const timelineContainer = document.getElementById('timeline-container');
const logDateFilter = document.getElementById('log-date-filter');
const clearFiltersBtn = document.getElementById('clear-filters-btn');
const refreshAllBtn = document.getElementById('refresh-all-btn');

// Modal Elements
const tokenEditModal = document.getElementById('token-edit-modal');
const modalUserEmail = document.getElementById('modal-user-email');
const newTokenAmount = document.getElementById('new-token-amount');
const saveTokenBtn = document.getElementById('save-token-btn');
const closeModalBtn = document.getElementById('close-modal-btn');

// ─── 🔑 강력한 암호화 로그인 보안 시스템 (SHA-256) ──────────────────
async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

const SECURE_PW_HASH = 'de34ddf5af5bcbda0219a7280880a0b7c6ae7b12885160996fe3effaa67733a3'; // 'koko'
const SESSION_VAL_HASH = 'c028a4be8544d65a8df2f8b54e69e855c3c19e855a024c7ad44cbad762a5da0a4'; // 고유 세션 키

let autoPollInterval = null;

async function checkAdminSession() {
    const overlay = document.getElementById('admin-login-overlay');
    const session = localStorage.getItem('xpider_admin_session');
    
    if (session === SESSION_VAL_HASH) {
        overlay.classList.add('fade-out');
        appendDebugLog('🔑 [보안] 기존 유효한 어드민 세션이 감지되어 자동 로그인 완료.', 'success');
        startAdminConsole();
    } else {
        appendDebugLog('🔒 [보안] 미인증 접근 감지. 계정 로그인을 대기 중입니다.', 'warning');
        document.getElementById('login-username').focus();
    }
}

async function handleSecureLogin() {
    const usernameInput = document.getElementById('login-username').value.trim();
    const passwordInput = document.getElementById('login-password').value;
    const errorMsg = document.getElementById('login-error-msg');
    
    if (!usernameInput || !passwordInput) {
        errorMsg.textContent = '아이디와 비밀번호를 모두 입력하세요.';
        return;
    }
    
    const pwHash = await sha256(passwordInput);
    
    if (usernameInput === 'Annie' && pwHash === SECURE_PW_HASH) {
        errorMsg.textContent = '';
        localStorage.setItem('xpider_admin_session', SESSION_VAL_HASH);
        const overlay = document.getElementById('admin-login-overlay');
        overlay.classList.add('fade-out');
        appendDebugLog('🔓 [보안] 해시 암호화 검증 통과! 어드민 로그인에 성공했습니다.', 'success');
        startAdminConsole();
    } else {
        errorMsg.textContent = '❌ 아이디 또는 비밀번호가 올바르지 않습니다.';
        appendDebugLog('🚨 [보안 경고] 잘못된 어드민 인증 시도가 거부되었습니다.', 'error');
    }
}

function handleAdminLogout() {
    localStorage.removeItem('xpider_admin_session');
    appendDebugLog('🔒 [보안] 세션을 정상 종료하고 안전하게 로그아웃했습니다.', 'info');
    setTimeout(() => {
        window.location.reload();
    }, 500);
}

function startAdminConsole() {
    loadAllData();
    loadStats('day'); // 통계 초기 로드
    
    if (!autoPollInterval) {
        autoPollInterval = setInterval(loadAllData, 5000);
    }
}

// Initial Load & Heartbeat Setup
document.addEventListener('DOMContentLoaded', () => {
    appendDebugLog('Command Center Telemetry Console Activated. Session gate checking...', 'info');
    checkAdminSession();
    
    // 엔터키 로그인 이벤트 바인딩
    document.getElementById('login-password').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSecureLogin();
    });
    document.getElementById('login-username').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSecureLogin();
    });
    
    // Event Listeners
    userSearchInput.addEventListener('input', renderUsersTable);
    logDateFilter.addEventListener('change', loadLogsData);
    
    clearFiltersBtn.addEventListener('click', () => {
        logDateFilter.value = '';
        appendDebugLog('Log date filter cleared by user.', 'info');
        loadLogsData();
    });
    
    refreshAllBtn.addEventListener('click', () => {
        appendDebugLog('Manual database synchronization requested by user click.', 'info');
        loadAllData(true);
    });

    // Modal Close
    closeModalBtn.addEventListener('click', () => {
        tokenEditModal.classList.add('hidden');
        selectedUserIdForTokens = null;
    });

    saveTokenBtn.addEventListener('click', saveTokensRecharge);
});

// Load Profiles & Logs securely via IPC Bridge
async function loadAllData(isManual = false) {
    try {
        if (isManual) {
            refreshAllBtn.textContent = '⚡ Syncing...';
            appendDebugLog('Syncing full command center datasets...', 'api');
        }
        
        // 1. Fetch Users
        const users = await window.electronAPI.invoke('admin-get-all-profiles');
        usersCached = users || [];
        
        if (isManual) {
            appendDebugLog(`SaaS profiles synced successfully. Total: ${usersCached.length} account(s) loaded.`, 'success');
        }
        
        // 2. Load Logs
        await loadLogsData();
        
        // 3. Render
        renderLiveBeacons();
        renderUsersTable();
        
        if (isManual) {
            refreshAllBtn.textContent = '🔄 Sync Database';
        }
    } catch (e) {
        console.error('Failed to load command center data:', e.message);
        appendDebugLog(`Database sync failed: ${e.message}`, 'error');
        appendDebugLog(`Suggestion: Check if public.profiles & public.user_logs tables are created in Supabase SQL editor and RLS policies are enabled correctly.`, 'warning');
        if (isManual) refreshAllBtn.textContent = '❌ Failed Sync';
    }
}

// Load Logs separately to support custom date filters
async function loadLogsData() {
    try {
        const filterDate = logDateFilter.value || null; // 'YYYY-MM-DD'
        appendDebugLog(`Querying activity logs (Filter Date: ${filterDate || 'All Time'})...`, 'api');
        
        const logs = await window.electronAPI.invoke('admin-get-user-logs', { filterDate });
        logsCached = logs || [];
        
        appendDebugLog(`Retrieved ${logsCached.length} activity log entry(s) successfully.`, 'success');
        renderTimelineLogs();
    } catch(e) {
        console.error('Failed to load user logs:', e.message);
        appendDebugLog(`Activity log query failure: ${e.message}`, 'error');
    }
}

// 🟢 renderLiveBeacons: Filter & Display users active in last 5 minutes
function renderLiveBeacons() {
    onlineUsersContainer.innerHTML = '';
    const now = Date.now();
    const FIVE_MINUTES_MS = 5 * 60 * 1000;
    
    const onlineUsers = usersCached.filter(u => {
        if (!u.last_active_at) return false;
        const lastActiveTime = new Date(u.last_active_at).getTime();
        return (now - lastActiveTime) < FIVE_MINUTES_MS;
    });

    onlineCountDisplay.textContent = `${onlineUsers.length} Active Now`;

    if (onlineUsers.length === 0) {
        onlineUsersContainer.innerHTML = `<div class="no-data-msg">No active sessions detected in the last 5 minutes.</div>`;
        return;
    }

    onlineUsers.forEach(u => {
        const email = u.email || u.username || 'unknown@xpider.pro';
        const lastActiveTime = new Date(u.last_active_at).getTime();
        const diffSec = Math.max(0, Math.floor((now - lastActiveTime) / 1000));
        
        let relativeTime = 'Just now';
        if (diffSec >= 60) {
            relativeTime = `${Math.floor(diffSec / 60)}m ago`;
        } else if (diffSec > 0) {
            relativeTime = `${diffSec}s ago`;
        }

        const node = document.createElement('div');
        node.className = 'beacon-node';
        node.innerHTML = `
            <div class="pulse-wrapper">
                <div class="green-pulse"></div>
            </div>
            <div class="beacon-details">
                <span class="beacon-email" title="${email}">${email}</span>
                <span class="beacon-time">Pulse: ${relativeTime}</span>
            </div>
        `;
        node.style.cursor = 'pointer';
        node.addEventListener('click', () => {
            userSearchInput.value = email;
            appendDebugLog(`Filtering user list by beacon email: ${email}`, 'info');
            renderUsersTable();
        });
        onlineUsersContainer.appendChild(node);
    });
}

// 👥 renderUsersTable: Render directory with live status toggle & token adjustment
function renderUsersTable() {
    userTableBody.innerHTML = '';
    const query = userSearchInput.value.toLowerCase().trim();
    
    const filtered = usersCached.filter(u => {
        const email = (u.email || '').toLowerCase();
        const username = (u.username || '').toLowerCase();
        return email.includes(query) || username.includes(query);
    });

    if (filtered.length === 0) {
        userTableBody.innerHTML = `<tr><td colspan="5" class="no-data-msg" style="text-align:center;">No matched users found in database.</td></tr>`;
        return;
    }

    filtered.forEach(u => {
        const tr = document.createElement('tr');
        const email = u.email || u.username || 'unknown@xpider.pro';
        const plan = u.plan || 'free';
        const tokens = u.tokens_remaining !== undefined ? u.tokens_remaining : 5000;
        const device = u.active_device_id ? u.active_device_id.substring(0, 8) + '...' : 'None';
        const isActive = u.is_active !== false;

        tr.innerHTML = `
            <td>
                <div class="user-cell">
                    <span class="user-username">${u.username || 'No Name'}</span>
                    <span class="user-email">${email}</span>
                </div>
            </td>
            <td>
                <span class="badge ${plan}">${plan}</span>
            </td>
            <td>
                <button class="token-badge" onclick="openTokenRechargeModal('${u.id}', '${email}', ${tokens})">
                    🪙 ${Number(tokens).toLocaleString()}
                </button>
            </td>
            <td>
                <span class="device-id" title="${u.active_device_id || 'Not logged in'}">${device}</span>
            </td>
            <td>
                <div style="display:flex; align-items:center; gap:12px;">
                    <!-- Active Status Toggle -->
                    <label class="switch" title="Toggle account active status">
                        <input type="checkbox" ${isActive ? 'checked' : ''} onchange="toggleUserActiveState('${u.id}', this.checked)">
                        <span class="slider"></span>
                    </label>
                    <!-- Force Logout button -->
                    ${u.active_device_id ? `<button class="btn-action kick" onclick="forceUserLogout('${u.id}', '${email}')">Kick</button>` : ''}
                </div>
            </td>
            <td>
                <button class="btn-detail" onclick="openUserDetail('${u.id}')">🔍 상세보기</button>
            </td>
        `;
        userTableBody.appendChild(tr);
    });
}

// ⏳ renderTimelineLogs: Render logs with beautiful details
function renderTimelineLogs() {
    timelineContainer.innerHTML = '';
    
    if (logsCached.length === 0) {
        timelineContainer.innerHTML = `<div class="no-data-msg">No logs recorded for this selection.</div>`;
        return;
    }

    logsCached.forEach(log => {
        const timeStr = new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const dateStr = new Date(log.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' });
        
        const node = document.createElement('div');
        node.className = 'timeline-node';
        node.innerHTML = `
            <div class="timeline-dot"></div>
            <div class="timeline-content">
                <div class="timeline-meta">
                    <span class="timeline-user">${log.email}</span>
                    <span class="timeline-time">${dateStr} · ${timeStr}</span>
                </div>
                <div class="timeline-ext">🔧 ${log.extension_name}</div>
                <div class="timeline-action"><strong>Action:</strong> ${log.action}</div>
                ${log.details ? `<div class="timeline-desc">${log.details}</div>` : ''}
                <span class="timeline-cost">-${log.tokens_consumed} Tokens</span>
            </div>
        `;
        timelineContainer.appendChild(node);
    });
}

// Trigger User Active / Disable State Toggle Switch
async function toggleUserActiveState(userId, isChecked) {
    try {
        appendDebugLog(`Invoking active state update to: ${isChecked} (User ID: ${userId})...`, 'api');
        const success = await window.electronAPI.invoke('admin-set-active', { userId, isActive: isChecked });
        if (success) {
            appendDebugLog(`Successfully changed active status for user ${userId} to ${isChecked}.`, 'success');
            // 캐시 동기화
            const user = usersCached.find(u => u.id === userId);
            if (user) user.is_active = isChecked;
        } else {
            appendDebugLog(`Failed to change active status for user ${userId}.`, 'error');
            alert('Failed to modify user status.');
        }
    } catch(e) {
        console.error('Failed to toggle active status:', e.message);
        appendDebugLog(`Active state update crashed: ${e.message}`, 'error');
    }
}

// Force user logout (Kick Device ID)
async function forceUserLogout(userId, email) {
    if (!confirm(`Are you sure you want to FORCE LOGOUT user: ${email}?`)) return;
    try {
        appendDebugLog(`Invoking session kick for user: ${email} (User ID: ${userId})...`, 'api');
        const success = await window.electronAPI.invoke('admin-force-logout', { userId });
        if (success) {
            appendDebugLog(`Kicked device lock for user: ${email} successfully.`, 'success');
            alert(`User ${email} has been forced to log out successfully.`);
            loadAllData();
        } else {
            appendDebugLog(`Failed to kick session for user ${userId}.`, 'error');
            alert('Failed to force logout.');
        }
    } catch (e) {
        console.error('Failed to force logout:', e.message);
        appendDebugLog(`Session kick request crashed: ${e.message}`, 'error');
    }
}

// Open Token Adjustment Modal
function openTokenRechargeModal(userId, email, currentTokens) {
    selectedUserIdForTokens = userId;
    modalUserEmail.textContent = `Adjusting tokens for: ${email}`;
    newTokenAmount.value = currentTokens;
    tokenEditModal.classList.remove('hidden');
    newTokenAmount.focus();
    appendDebugLog(`Opened manual token adjustment dialog for user ${email}.`, 'info');
}
window.openTokenRechargeModal = openTokenRechargeModal; // Expose globally for inline onclick

// Save Token Recharge adjust
async function saveTokensRecharge() {
    if (!selectedUserIdForTokens) return;
    const tokens = parseInt(newTokenAmount.value);
    if (isNaN(tokens) || tokens < 0) {
        alert('Please enter a valid positive token amount.');
        appendDebugLog('Invalid token value entered in adjust dialog.', 'warning');
        return;
    }

    try {
        appendDebugLog(`Requesting manual token recharge to ${tokens} for user ${selectedUserIdForTokens}...`, 'api');
        const success = await window.electronAPI.invoke('admin-update-user-tokens', { userId: selectedUserIdForTokens, tokens });
        if (success) {
            appendDebugLog(`Successfully adjusted tokens to ${tokens} for user ${selectedUserIdForTokens}.`, 'success');
            tokenEditModal.classList.add('hidden');
            selectedUserIdForTokens = null;
            loadAllData();
        } else {
            appendDebugLog(`Failed to update tokens in database for user ${selectedUserIdForTokens}.`, 'error');
            alert('Failed to update tokens in database.');
        }
    } catch(e) {
        console.error('Failed to recharge tokens:', e.message);
        appendDebugLog(`Token adjustment crashed: ${e.message}`, 'error');
    }
}

// Expose switch/kick handlers globally for inline triggers
window.toggleUserActiveState = toggleUserActiveState;
window.forceUserLogout = forceUserLogout;
window.openUserDetail = openUserDetail;
window.closeDetailModal = closeDetailModal;
window.switchDetailTab = switchDetailTab;
window.loadDetailLogs = loadDetailLogs;
window.saveUserEdit = saveUserEdit;
window.deleteUser = deleteUser;
window.setStatPeriod = setStatPeriod;

// ══════════════════════════════════════════════════════════════
// 📊 DASHBOARD STATISTICS
// ══════════════════════════════════════════════════════════════
let currentStatPeriod = 'day';

function getPeriodStart(period) {
    const now = new Date();
    switch(period) {
        case 'day':   return new Date(now.getFullYear(), now.getMonth(), now.getDate());
        case 'week':  { const d = new Date(now); d.setDate(d.getDate() - 6); d.setHours(0,0,0,0); return d; }
        case 'month': return new Date(now.getFullYear(), now.getMonth(), 1);
        case 'year':  return new Date(now.getFullYear(), 0, 1);
        default:      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }
}

function getPeriodLabel(period) {
    const labels = { day: 'Today', week: 'This Week', month: 'This Month', year: 'This Year' };
    return labels[period] || 'Today';
}

async function loadStats(period) {
    currentStatPeriod = period;
    const startDate = getPeriodStart(period);
    const startISO  = startDate.toISOString();

    // UI 로딩 상태
    ['stat-downloads','stat-subscriptions','stat-issued','stat-usage'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '<span class="loader-dot">...</span>';
    });
    const periodLabel = document.getElementById('stat-period-label');
    if (periodLabel) periodLabel.textContent = getPeriodLabel(period);

    try {
        const sb = getSbAdmin();
        if (!sb) { appendDebugLog('Stats: Supabase not available', 'warning'); return; }

        // 1. New Downloads = 기간 내 신규 가입 (profiles.created_at)
        const { data: newUsers, error: e1 } = await sb
            .from('profiles')
            .select('id, plan, tokens_remaining', { count: 'exact' })
            .gte('created_at', startISO);

        const downloads = newUsers ? newUsers.length : 0;

        // 2. New Subscriptions = 기간 내 유료 플랜 가입
        const subscriptions = newUsers
            ? newUsers.filter(u => u.plan && u.plan !== 'free' && u.plan !== 'admin').length
            : 0;

        // 3. Tokens Issued = 기간 내 신규 유저들의 초기 토큰 합산
        const tokensIssued = newUsers
            ? newUsers.reduce((sum, u) => sum + (u.tokens_remaining || 0), 0)
            : 0;

        // 4. Token Usage = 기간 내 user_logs의 tokens_consumed 합산
        const { data: usageLogs, error: e2 } = await sb
            .from('user_logs')
            .select('tokens_consumed')
            .gte('created_at', startISO);

        const tokenUsage = usageLogs
            ? usageLogs.reduce((sum, l) => sum + (l.tokens_consumed || 0), 0)
            : 0;

        // UI 업데이트
        const el = (id) => document.getElementById(id);
        if (el('stat-downloads'))     el('stat-downloads').textContent     = downloads.toLocaleString();
        if (el('stat-subscriptions')) el('stat-subscriptions').textContent = subscriptions.toLocaleString();
        if (el('stat-issued'))        el('stat-issued').textContent        = tokensIssued.toLocaleString();
        if (el('stat-usage'))         el('stat-usage').textContent         = tokenUsage.toLocaleString();

        appendDebugLog(`Stats loaded [${getPeriodLabel(period)}]: ${downloads} downloads, ${subscriptions} subs, ${tokensIssued} issued, ${tokenUsage} used`, 'success');
    } catch(e) {
        appendDebugLog(`Stats load failed: ${e.message}`, 'error');
        console.error('Stats error:', e);
    }
}

function setStatPeriod(period) {
    // 버튼 active 상태 전환
    document.querySelectorAll('.time-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.period === period);
    });
    loadStats(period);
}

// ══════════════════════════════════════════════════════════════
// 🔍 USER DETAIL MODAL
// ══════════════════════════════════════════════════════════════
let detailUserId = null;

function openUserDetail(userId) {
    const user = usersCached.find(u => u.id === userId);
    if (!user) return;
    detailUserId = userId;

    // 헤더 정보 채우기
    const name = user.username || user.email?.split('@')[0] || 'User';
    const el = (id) => document.getElementById(id);
    el('detail-avatar').textContent = name.charAt(0).toUpperCase();
    el('detail-title').textContent  = name;
    el('detail-email-sub').textContent = user.email || '';

    // Profile Info 탭 채우기
    const fields = [
        { label: 'User ID',         value: user.id },
        { label: 'Username',        value: user.username || '-' },
        { label: 'Email',           value: user.email || '-' },
        { label: 'Plan',            value: (user.plan || 'free').toUpperCase() },
        { label: 'Status',          value: user.is_active ? '✅ Active' : '🚫 Inactive' },
        { label: 'Tokens Remaining',value: Number(user.tokens_remaining || 0).toLocaleString() },
        { label: 'Joined',          value: user.created_at ? new Date(user.created_at).toLocaleString('ko-KR') : '-' },
        { label: 'Last Login',      value: user.last_login ? new Date(user.last_login).toLocaleString('ko-KR') : '-' },
        { label: 'Last Active',     value: user.last_active_at ? new Date(user.last_active_at).toLocaleString('ko-KR') : '-' },
        { label: 'IP Address',      value: user.ip_address || '-' },
        { label: 'MAC Address',     value: user.mac_address || '-' },
        { label: 'Device ID',       value: user.active_device_id || 'Not logged in' },
    ];
    const grid = el('detail-info-grid');
    grid.innerHTML = fields.map(f => `
        <div class="info-item">
            <div class="info-item-label">${f.label}</div>
            <div class="info-item-value">${f.value}</div>
        </div>
    `).join('');

    // Edit 탭 기본값 채우기
    el('edit-username').value = user.username || '';
    el('edit-email').value    = user.email || '';
    el('edit-plan').value     = user.plan || 'free';
    el('edit-tokens').value   = user.tokens_remaining || 0;
    el('edit-active').value   = String(user.is_active !== false);

    // 첫 탭으로 초기화
    switchDetailTab('info', document.querySelector('.detail-tab'));

    // 모달 열기
    document.getElementById('user-detail-modal').classList.remove('hidden');

    // 로그 자동 로드
    loadDetailLogs();
}

function closeDetailModal() {
    document.getElementById('user-detail-modal').classList.add('hidden');
    detailUserId = null;
}

function switchDetailTab(tab, btn) {
    // 탭 버튼 active 상태
    document.querySelectorAll('.detail-tab').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    // 탭 컨텐츠 표시
    ['info','logs','edit'].forEach(t => {
        const el = document.getElementById(`detail-tab-${t}`);
        if (el) el.classList.toggle('hidden', t !== tab);
    });
}

async function loadDetailLogs() {
    if (!detailUserId) return;
    const tbody = document.getElementById('detail-log-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;color:#7f90a6">로딩 중...</td></tr>';

    try {
        const sb = getSbAdmin();
        const dateFilter = document.getElementById('detail-log-date')?.value;
        let q = sb.from('user_logs').select('*').eq('user_id', detailUserId)
            .order('created_at', { ascending: false }).limit(500);
        if (dateFilter) {
            q = q.gte('created_at', dateFilter + 'T00:00:00Z')
                 .lte('created_at', dateFilter + 'T23:59:59Z');
        }
        const { data: logs } = await q;
        if (!logs || logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;color:#7f90a6">이용 내역이 없습니다</td></tr>';
            return;
        }
        tbody.innerHTML = logs.map(l => `
            <tr>
                <td>${new Date(l.created_at).toLocaleString('ko-KR')}</td>
                <td><span class="badge free">${l.extension_name || '-'}</span></td>
                <td>${l.action || '-'}</td>
                <td style="color:#ffd700;font-weight:700">-${(l.tokens_consumed||0).toLocaleString()}</td>
                <td style="color:#7f90a6;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${l.details||''}">${l.details || '-'}</td>
            </tr>
        `).join('');
    } catch(e) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#ff3366">${e.message}</td></tr>`;
    }
}

async function saveUserEdit() {
    if (!detailUserId) return;
    const username = document.getElementById('edit-username').value.trim();
    const email    = document.getElementById('edit-email').value.trim();
    const plan     = document.getElementById('edit-plan').value;
    const tokens   = parseInt(document.getElementById('edit-tokens').value);
    const isActive = document.getElementById('edit-active').value === 'true';

    if (!username || !email) { alert('Username과 Email은 필수입니다.'); return; }
    if (isNaN(tokens) || tokens < 0) { alert('유효한 토큰 값을 입력하세요.'); return; }

    try {
        const sb = getSbAdmin();
        const { error } = await sb.from('profiles').update({
            username, email, plan,
            tokens_remaining: tokens,
            is_active: isActive
        }).eq('id', detailUserId);

        if (error) throw error;

        appendDebugLog(`User ${email} 정보 업데이트 완료.`, 'success');
        alert('✅ 저장되었습니다.');
        closeDetailModal();
        loadAllData();
    } catch(e) {
        appendDebugLog(`User edit failed: ${e.message}`, 'error');
        alert('❌ 저장 실패: ' + e.message);
    }
}

async function deleteUser() {
    if (!detailUserId) return;
    const user = usersCached.find(u => u.id === detailUserId);
    const email = user?.email || detailUserId;
    if (!confirm(`⚠️ 경고: ${email} 계정을 완전히 삭제합니다.\n\n이 작업은 되돌릴 수 없습니다. 계속하시겠습니까?`)) return;

    try {
        const sb = getSbAdmin();
        // 1. 로그 먼저 삭제
        await sb.from('user_logs').delete().eq('user_id', detailUserId);
        // 2. 프로필 삭제
        const { error } = await sb.from('profiles').delete().eq('id', detailUserId);
        if (error) throw error;

        appendDebugLog(`User ${email} 계정 및 로그 삭제 완료.`, 'success');
        alert(`✅ ${email} 계정이 삭제되었습니다.`);
        closeDetailModal();
        loadAllData();
        loadStats(currentStatPeriod);
    } catch(e) {
        appendDebugLog(`Delete failed: ${e.message}`, 'error');
        alert('❌ 삭제 실패: ' + e.message);
    }
}

// ─── 📦 GitHub 자동/수동 백업 및 복원 API 연동 ──────────────────
async function triggerGithubBackup() {
    const btn = document.getElementById('github-backup-btn');
    const originalText = btn.textContent;
    btn.textContent = '📦 백업 생성 중...';
    btn.disabled = true;
    
    appendDebugLog('🚀 [백업] GitHub 원격 백업 스냅샷 생성을 시작합니다...', 'api');
    
    try {
        const result = await window.electronAPI.invoke('admin-github-backup');
        if (result && result.success) {
            appendDebugLog(`✅ [백업 성공] 깃허브 커밋 성공! 경로: ${result.path}`, 'success');
            alert(`🎉 데이터 백업이 깃허브에 성공적으로 저장되었습니다!\n\n경로: ${result.path}`);
        } else {
            throw new Error(result ? result.error : '알 수 없는 오류');
        }
    } catch (err) {
        appendDebugLog(`❌ [백업 실패] ${err.message}`, 'error');
        alert(`❌ 백업 실패: ${err.message}`);
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

async function triggerGithubRestore() {
    if (!confirm('⚠️ 정말로 깃허브의 가장 최신 백업본에서 데이터베이스를 복원하시겠습니까?\n\n이 작업을 수행하면 현재의 profiles 및 user_logs 데이터가 백업 시점으로 강제 덮어쓰기 복원됩니다.')) return;
    
    const btn = document.getElementById('github-restore-btn');
    const originalText = btn.textContent;
    btn.textContent = '🔄 데이터 복원 중...';
    btn.disabled = true;
    
    appendDebugLog('🚀 [복원] GitHub로부터 최신 스냅샷 다운로드 및 복원 작업 시작...', 'api');
    
    try {
        const result = await window.electronAPI.invoke('admin-github-restore');
        if (result && result.success) {
            appendDebugLog(`✅ [복원 성공] 총 ${result.count}개의 회원 프로필 정보가 완벽 복원되었습니다!`, 'success');
            alert(`🎉 데이터베이스 복원이 성공적으로 완료되었습니다!\n\n복원 유저 수: ${result.count}명`);
            loadAllData(true);
        } else {
            throw new Error(result ? result.error : '알 수 없는 오류');
        }
    } catch (err) {
        appendDebugLog(`❌ [복원 실패] ${err.message}`, 'error');
        alert(`❌ 복원 실패: ${err.message}`);
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

// 윈도우 글로벌 바인딩 등록
window.handleSecureLogin = handleSecureLogin;
window.handleAdminLogout = handleAdminLogout;
window.triggerGithubBackup = triggerGithubBackup;
window.triggerGithubRestore = triggerGithubRestore;

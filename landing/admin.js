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

// DOM Elements — 동적 getter 방식으로 null 에러 방지
function getEl(id) { return document.getElementById(id); }


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
// DOMContentLoaded가 이미 발생한 경우도 안전하게 처리
function initAdminPage() {
    appendDebugLog('Command Center Telemetry Console Activated. Session gate checking...', 'info');
    checkAdminSession();

    // 엔터키 로그인 이벤트 바인딩
    const pwInput = getEl('login-password');
    const unInput = getEl('login-username');
    if (pwInput) pwInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleSecureLogin(); });
    if (unInput) unInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleSecureLogin(); });

    // Event Listeners — 요소가 없을 경우 skip
    const userSearchInput = getEl('user-search-input');
    const logDateFilter   = getEl('log-date-filter');
    const clearFiltersBtn = getEl('clear-filters-btn');
    const refreshAllBtn   = getEl('refresh-all-btn');
    const closeModalBtn   = getEl('close-modal-btn');
    const saveTokenBtn    = getEl('save-token-btn');
    const tokenEditModal  = getEl('token-edit-modal');

    if (userSearchInput) userSearchInput.addEventListener('input', renderUsersTable);
    if (logDateFilter)   logDateFilter.addEventListener('change', loadLogsData);

    if (clearFiltersBtn) clearFiltersBtn.addEventListener('click', () => {
        if (logDateFilter) logDateFilter.value = '';
        appendDebugLog('Log date filter cleared by user.', 'info');
        loadLogsData();
    });

    if (refreshAllBtn) refreshAllBtn.addEventListener('click', () => {
        appendDebugLog('Manual database synchronization requested by user click.', 'info');
        loadAllData(true);
    });

    if (closeModalBtn) closeModalBtn.addEventListener('click', () => {
        if (tokenEditModal) tokenEditModal.classList.add('hidden');
        selectedUserIdForTokens = null;
    });

    if (saveTokenBtn) saveTokenBtn.addEventListener('click', saveTokensRecharge);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAdminPage);
} else {
    // 이미 DOM이 준비된 경우 즉시 실행
    initAdminPage();
}

// Load Profiles & Logs securely via IPC Bridge
async function loadAllData(isManual = false) {
    const refreshAllBtn = getEl('refresh-all-btn');
    try {
        if (isManual) {
            if (refreshAllBtn) refreshAllBtn.textContent = '⚡ Syncing...';
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
        
        // 4. Brevo Credits Sync
        loadBrevoCreditsAdmin().catch(() => {});
        loadSolverCreditsAdmin().catch(() => {});
        loadSolverUsageAdmin().catch(() => {});

        // 5. SMTP Relay Provider 설정 로드
        loadSmtpProviderSetting().catch(() => {});
        
        if (isManual) {
            if (refreshAllBtn) refreshAllBtn.textContent = '🔄 Sync Database';
        }
    } catch (e) {
        console.error('Failed to load command center data:', e.message);
        appendDebugLog(`Database sync failed: ${e.message}`, 'error');
        appendDebugLog(`Suggestion: Check if public.profiles & public.user_logs tables are created in Supabase SQL editor and RLS policies are enabled correctly.`, 'warning');
        if (isManual && refreshAllBtn) refreshAllBtn.textContent = '❌ Failed Sync';
    }
}

// Load Logs separately to support custom date filters
async function loadLogsData() {
    const logDateFilter = getEl('log-date-filter');
    try {
        const filterDate = logDateFilter ? logDateFilter.value || null : null;
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
    const onlineUsersContainer = getEl('online-users-container');
    const onlineCountDisplay   = getEl('online-count');
    if (!onlineUsersContainer) return;
    onlineUsersContainer.innerHTML = '';
    const now = Date.now();
    const FIVE_MINUTES_MS = 5 * 60 * 1000;
    
    const onlineUsers = usersCached.filter(u => {
        if (!u.last_active_at) return false;
        const lastActiveTime = new Date(u.last_active_at).getTime();
        return (now - lastActiveTime) < FIVE_MINUTES_MS;
    });

    if (onlineCountDisplay) onlineCountDisplay.textContent = `${onlineUsers.length} Active Now`;

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
            const si = getEl('user-search-input');
            if (si) si.value = email;
            appendDebugLog(`Filtering user list by beacon email: ${email}`, 'info');
            renderUsersTable();
        });
        onlineUsersContainer.appendChild(node);
    });
}

// 👥 renderUsersTable: Render directory with live status toggle & token adjustment
function renderUsersTable() {
    const userTableBody    = getEl('user-table-body');
    const userSearchInput  = getEl('user-search-input');
    if (!userTableBody) return;
    userTableBody.innerHTML = '';
    const query = userSearchInput ? userSearchInput.value.toLowerCase().trim() : '';
    
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
                    <label class="switch" title="Toggle account active status">
                        <input type="checkbox" ${isActive ? 'checked' : ''} onchange="toggleUserActiveState('${u.id}', this.checked)">
                        <span class="slider"></span>
                    </label>
                    ${u.active_device_id ? `<button class="btn-action kick" onclick="forceUserLogout('${u.id}', '${email}')">Kick</button>` : ''}
                </div>
            </td>
            <td>
                <button class="btn-detail" onclick="openUserDetail('${u.id}')">&#128269; 상세보기</button>
            </td>
        `;
        userTableBody.appendChild(tr);
    });
}

// ⏳ renderTimelineLogs: Render logs with beautiful details
function renderTimelineLogs() {
    const timelineContainer = getEl('timeline-container');
    if (!timelineContainer) return;
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
    const modalUserEmail = getEl('modal-user-email');
    const newTokenAmount  = getEl('new-token-amount');
    const tokenEditModal  = getEl('token-edit-modal');
    if (modalUserEmail) modalUserEmail.textContent = `Adjusting tokens for: ${email}`;
    if (newTokenAmount) { newTokenAmount.value = currentTokens; newTokenAmount.focus(); }
    if (tokenEditModal) tokenEditModal.classList.remove('hidden');
    appendDebugLog(`Opened manual token adjustment dialog for user ${email}.`, 'info');
}
window.openTokenRechargeModal = openTokenRechargeModal; // Expose globally for inline onclick

// Save Token Recharge adjust
async function saveTokensRecharge() {
    if (!selectedUserIdForTokens) return;
    const newTokenAmount = getEl('new-token-amount');
    const tokenEditModal = getEl('token-edit-modal');
    const tokens = parseInt(newTokenAmount ? newTokenAmount.value : '0');
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
            if (tokenEditModal) tokenEditModal.classList.add('hidden');
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

// ─── Brevo Credits 실시간 모니터링 ───
async function loadBrevoCreditsAdmin() {
    const creditsVal = document.getElementById('brevo-credits-val-admin');
    const planVal = document.getElementById('brevo-plan-val-admin');
    if (!creditsVal || !planVal) return;

    try {
        const gatewayUrl = 'https://brevo-key-provider.goodkie-com.workers.dev/';
        const keyRes = await fetch(gatewayUrl, { cache: 'no-store' });
        if (!keyRes.ok) throw new Error('Failed to fetch API key');
        const apiKey = (await keyRes.text()).trim();

        if (!apiKey) {
            creditsVal.textContent = 'Key Missing';
            planVal.textContent = 'Unconfigured';
            return;
        }

        const isBrowser = (typeof window.electronAPI === 'undefined') || window.electronAPI.isBrowserFallback || !window.electronAPI.send;
        const targetUrl = 'https://api.brevo.com/v3/accounts';
        const finalUrl = isBrowser ? `https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}` : targetUrl;

        const accountRes = await fetch(finalUrl, {
            method: 'GET',
            headers: {
                'accept': 'application/json',
                'api-key': apiKey
            }
        });

        if (!accountRes.ok) throw new Error(`HTTP ${accountRes.status}`);
        const accountData = await accountRes.json();

        let totalCredits = 0;
        let planName = 'Free Plan';

        if (accountData.plan && accountData.plan.length > 0) {
            accountData.plan.forEach(p => {
                if (p.credits !== undefined) {
                    totalCredits += p.credits;
                }
            });
            planName = accountData.plan[0].type || planName;
        }

        const planLabels = { payAsYouGo: 'Pay As You Go', free: 'Free Plan', subscription: 'Subscription' };
        const mappedPlan = planLabels[planName] || planName;

        creditsVal.textContent = totalCredits.toLocaleString() + ' Credits';
        planVal.textContent = mappedPlan;

        // ─── Supabase DB에 캐싱 ───
        const sb = getSbAdmin();
        if (sb) {
            const { data: exist } = await sb.from('profiles').select('id').eq('email', 'brevo@xpider.pro').maybeSingle();
            if (!exist) {
                await sb.auth.admin.createUser({
                    email: 'brevo@xpider.pro',
                    password: 'BrevoSyncTemp135!@',
                    user_metadata: { username: 'Brevo Monitor' },
                    email_confirm: true
                }).catch(() => {});
            }
            
            await sb.from('profiles').update({
                tokens_remaining: totalCredits,
                plan: planName,
                last_active_at: new Date().toISOString()
            }).eq('email', 'brevo@xpider.pro');
        }

    } catch (e) {
        console.error('[AdminPanel] Brevo API Error:', e);
        
        // CORS 등 에러 시 Supabase에서 캐시된 데이터 로드 폴백
        try {
            const sb = getSbAdmin();
            if (sb) {
                const { data, error } = await sb.from('profiles').select('tokens_remaining, plan').eq('email', 'brevo@xpider.pro').maybeSingle();
                if (data && !error) {
                    const planLabels = { payAsYouGo: 'Pay As You Go', free: 'Free Plan', subscription: 'Subscription' };
                    creditsVal.textContent = data.tokens_remaining.toLocaleString() + ' Credits';
                    planVal.textContent = planLabels[data.plan] || data.plan;
                    return;
                }
            }
        } catch (dbErr) {
            console.error('[AdminPanel] Brevo Fallback DB Error:', dbErr);
        }
        
        creditsVal.textContent = 'API Error';
        planVal.textContent = 'Connection Fail';
    }
}

// ─── CapSolver & 2Captcha 실시간 모니터링 ───
async function loadSolverCreditsAdmin() {
    const csStatus = document.getElementById('capsolver-status');
    const csBalance = document.getElementById('capsolver-balance');
    const tcStatus = document.getElementById('twocaptcha-status');
    const tcBalance = document.getElementById('twocaptcha-balance');

    if (!csStatus || !csBalance || !tcStatus || !tcBalance) return;

    // Electron 환경인지 체크
    const isElectron = window.electronAPI && typeof window.electronAPI.invoke === 'function' && !window.electronAPI.isBrowserFallback;

    if (isElectron) {
        try {
            const result = await window.electronAPI.invoke('admin-get-solver-credits');
            
            // CapSolver UI 반영
            if (result.capsolver.success) {
                csBalance.textContent = `$${result.capsolver.balance}`;
                csStatus.textContent = 'Active';
                csStatus.style.color = '#10b981';
                csStatus.style.backgroundColor = 'rgba(16,185,129,0.1)';
            } else {
                csBalance.textContent = '$0.00';
                csStatus.textContent = result.capsolver.status;
                csStatus.style.color = '#ef4444';
                csStatus.style.backgroundColor = 'rgba(239,68,68,0.1)';
            }

            // 2Captcha UI 반영
            if (result.twocaptcha.success) {
                tcBalance.textContent = `$${result.twocaptcha.balance}`;
                tcStatus.textContent = 'Active';
                tcStatus.style.color = '#10b981';
                tcStatus.style.backgroundColor = 'rgba(16,185,129,0.1)';
            } else {
                tcBalance.textContent = '$0.00';
                tcStatus.textContent = result.twocaptcha.status;
                tcStatus.style.color = '#ef4444';
                tcStatus.style.backgroundColor = 'rgba(239,68,68,0.1)';
            }
            return;
        } catch (ipcErr) {
            console.warn('[AdminPanel] IPC credits check failed, falling back to fetch:', ipcErr.message);
        }
    }

    const capSolverKey = 'CAP-85826E780AAEB49B3B0BA99D2962E3AAB2CE7187F000E2F9E88FC1C9BFA0813C';
    const twoCaptchaKey = '478f83de37251fd5ced7590c5916bbcb';
    const isBrowser = (typeof window.electronAPI === 'undefined') || window.electronAPI.isBrowserFallback || !window.electronAPI.send;

    // 1. CapSolver
    try {
        const targetUrl = 'https://api.capsolver.com/getBalance';
        const finalUrl = isBrowser ? `https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}` : targetUrl;
        
        const res = await fetch(finalUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientKey: capSolverKey })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data.errorId !== 0) {
            throw new Error(data.errorDescription || 'API Error');
        }
        csBalance.textContent = `$${Number(data.balance).toFixed(4)}`;
        csStatus.textContent = 'Active';
        csStatus.style.color = '#10b981';
        csStatus.style.backgroundColor = 'rgba(16,185,129,0.1)';
    } catch (e) {
        console.error('[AdminPanel] CapSolver API Error:', e.message);
        csBalance.textContent = '$0.00';
        csStatus.textContent = e.message.includes('authorization') || e.message.includes('denied') || e.message.includes('invalid') ? 'Auth Error' : 'Offline';
        csStatus.style.color = '#ef4444';
        csStatus.style.backgroundColor = 'rgba(239,68,68,0.1)';
    }

    // 2. 2Captcha
    try {
        const targetUrl = 'https://api.2captcha.com/getBalance';
        const finalUrl = isBrowser ? `https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}` : targetUrl;

        const res = await fetch(finalUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientKey: twoCaptchaKey })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data.errorId !== 0) {
            throw new Error(data.errorDescription || 'API Error');
        }
        tcBalance.textContent = `$${Number(data.balance).toFixed(4)}`;
        tcStatus.textContent = 'Active';
        tcStatus.style.color = '#10b981';
        tcStatus.style.backgroundColor = 'rgba(16,185,129,0.1)';
    } catch (e) {
        console.error('[AdminPanel] 2Captcha API Error:', e.message);
        tcBalance.textContent = '$0.00';
        tcStatus.textContent = e.message.includes('missing') || e.message.includes('format') || e.message.includes('exist') ? 'Auth Error' : 'Offline';
        tcStatus.style.color = '#ef4444';
        tcStatus.style.backgroundColor = 'rgba(239,68,68,0.1)';
    }
}

// ─── UltraSolver Pro 사용량 통계 로드 ───
async function loadSolverUsageAdmin() {
    const totalSolvedEl = document.getElementById('solver-total-solved');
    const totalTokensEl = document.getElementById('solver-total-tokens');
    if (!totalSolvedEl || !totalTokensEl) return;

    try {
        const sb = getSbAdmin();
        if (!sb) return;

        const { data: logs, error } = await sb
            .from('user_logs')
            .select('tokens_consumed')
            .eq('extension_name', 'UltraSolverPro');

        if (error) throw error;

        const count = logs ? logs.length : 0;
        const tokens = logs ? logs.reduce((sum, l) => sum + (l.tokens_consumed || 0), 0) : 0;

        totalSolvedEl.textContent = count.toLocaleString() + ' times';
        totalTokensEl.textContent = `🪙 ${tokens.toLocaleString()}`;
    } catch (e) {
        console.error('[AdminPanel] Solver Usage Error:', e.message);
        totalSolvedEl.textContent = 'Error';
        totalTokensEl.textContent = 'Error';
    }
}

// 외부 target="_blank" 링크를 Electron 환경에서 브라우저로 열도록 가로채는 리스너
document.addEventListener('click', (e) => {
    const anchor = e.target.closest('a');
    if (anchor && anchor.getAttribute('target') === '_blank') {
        const href = anchor.getAttribute('href');
        const isElectron = window.electronAPI && typeof window.electronAPI.send === 'function' && !window.electronAPI.isBrowserFallback;
        if (isElectron && href && (href.startsWith('http://') || href.startsWith('https://'))) {
            e.preventDefault();
            window.electronAPI.send('open-external-url', href);
        }
    }
});

window.triggerGithubBackup = triggerGithubBackup;
window.triggerGithubRestore = triggerGithubRestore;

// ─── SMTP Relay Server 설정 연동 ───

// 저장 진행 중 플래그 — true이면 폴링이 UI를 덮어쓰지 않음
let _smtpSaving = false;

/**
 * Supabase profiles 테이블(smtp-config@xpider.pro 행)에서 SMTP provider 설정 로드
 * ⚠️ _smtpSaving=true(저장 중)이면 UI 덮어쓰기 스킵
 */
async function loadSmtpProviderSetting() {
    if (_smtpSaving) return;

    try {
        const sb = getSbAdmin();
        if (!sb) return;

        const { data } = await sb
            .from('profiles')
            .select('plan')
            .eq('email', 'smtp-config@xpider.pro')
            .maybeSingle();

        if (_smtpSaving) return;

        let provider = 'brevo';
        if (data && data.plan && (data.plan === 'brevo' || data.plan === 'resend')) {
            provider = data.plan;
        }

        updateSmtpToggleUI(provider);
        appendDebugLog(`📡 SMTP Relay: ${provider.toUpperCase()} 로드됨.`, 'info');
    } catch (e) {
        console.warn('[SmtpConfig] 로드 실패:', e.message);
    }
}

/**
 * 어드민이 토글 스위치 조작 시 호출 — provider 변경 및 Supabase 저장
 * profiles(smtp-config@xpider.pro).plan 컬럼에 UPDATE
 * @param {boolean} isResend - true: Resend, false: Brevo
 */
async function handleSmtpToggle(isResend) {
    const provider = isResend ? 'resend' : 'brevo';
    const statusEl = document.getElementById('smtp-save-status');
    if (statusEl) { statusEl.textContent = '🔄 저장 중...'; statusEl.style.color = '#6b7a8d'; }

    // 폴링 UI 롤백 차단 + 즉시 UI 반영
    _smtpSaving = true;
    updateSmtpToggleUI(provider);

    try {
        const sb = getSbAdmin();
        if (!sb) throw new Error('Supabase 미연결');

        // smtp-config@xpider.pro 행의 plan 컬럼만 UPDATE (행은 이미 존재함)
        const { error } = await sb
            .from('profiles')
            .update({
                plan: provider,
                last_active_at: new Date().toISOString()
            })
            .eq('email', 'smtp-config@xpider.pro');

        if (error) throw new Error(error.message);

        updateSmtpToggleUI(provider);

        if (statusEl) {
            statusEl.textContent = `✅ ${provider.toUpperCase()} 릴레이로 저장되었습니다.`;
            statusEl.style.color = '#39ff14';
            setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 3000);
        }
        appendDebugLog(`📡 SMTP Relay 변경: ${provider.toUpperCase()}`, 'success');

    } catch (e) {
        console.error('[SmtpConfig] 저장 실패:', e.message);
        if (statusEl) {
            statusEl.textContent = `❌ 저장 실패: ${e.message}`;
            statusEl.style.color = '#ff4d6d';
        }
        appendDebugLog(`❌ SMTP 저장 오류: ${e.message}`, 'error');
    } finally {
        setTimeout(() => { _smtpSaving = false; }, 2000);
    }
}

/**
 * provider에 따라 토글 스위치 UI 상태 업데이트
 * @param {'brevo'|'resend'} provider
 */
function updateSmtpToggleUI(provider) {
    const toggle = document.getElementById('smtp-relay-toggle');
    const track = document.getElementById('smtp-toggle-track');
    const thumb = document.getElementById('smtp-toggle-thumb');
    const badge = document.getElementById('smtp-status-badge');
    const brevoLabel = document.getElementById('smtp-label-brevo');
    const resendLabel = document.getElementById('smtp-label-resend');
    if (!toggle) return;

    const isResend = (provider === 'resend');
    toggle.checked = isResend;

    if (isResend) {
        // Resend 활성
        track.style.background = 'rgba(251,146,60,0.4)';
        track.style.borderColor = 'rgba(251,146,60,0.5)';
        track.style.boxShadow = '0 0 10px rgba(251,146,60,0.4)';
        thumb.style.left = '27px';
        badge.textContent = 'RESEND';
        badge.style.color = '#fb923c';
        // Resend 레이블 하이라이트
        if (resendLabel) {
            resendLabel.style.border = '1px solid rgba(251,146,60,0.5)';
            resendLabel.style.background = 'rgba(251,146,60,0.1)';
            resendLabel.querySelector('span:last-child').style.color = '#fb923c';
        }
        // Brevo 레이블 닙우기
        brevoLabel.style.border = '1px solid rgba(255,255,255,0.08)';
        brevoLabel.style.background = 'rgba(255,255,255,0.03)';
        brevoLabel.querySelector('span:last-child').style.color = '#6b7a8d';
    } else {
        // Brevo 활성
        track.style.background = 'rgba(99,179,237,0.4)';
        track.style.borderColor = 'rgba(99,179,237,0.5)';
        track.style.boxShadow = '0 0 10px rgba(99,179,237,0.3)';
        thumb.style.left = '3px';
        badge.textContent = 'BREVO';
        badge.style.color = '#63b3ed';
        // Brevo 레이블 하이라이트
        brevoLabel.style.border = '1px solid rgba(99,179,237,0.3)';
        brevoLabel.style.background = 'rgba(99,179,237,0.1)';
        brevoLabel.querySelector('span:last-child').style.color = '#63b3ed';
        // Resend 레이블 닙우기
        if (resendLabel) {
            resendLabel.style.border = '1px solid rgba(255,255,255,0.08)';
            resendLabel.style.background = 'rgba(255,255,255,0.03)';
            resendLabel.querySelector('span:last-child').style.color = '#6b7a8d';
        }
    }
}

// 함수들을 window에 노출
window.handleSmtpToggle = handleSmtpToggle;
window.loadSmtpProviderSetting = loadSmtpProviderSetting;

/**
 * Resend 또는 Brevo 레이블 div 클릭 시 해당 provider로 직접 전환
 * @param {'brevo'|'resend'} provider
 */
window.switchSmtpTo = async function(provider) {
    const toggle = document.getElementById('smtp-relay-toggle');
    if (!toggle) return;
    const isResend = (provider === 'resend');
    toggle.checked = isResend;
    await handleSmtpToggle(isResend);
};

// ══════════════════════════════════════════════════════════════
// 🔔 실시간 이벤트 알림 시스템
// ══════════════════════════════════════════════════════════════

// 이전 폴링 시점의 유저/구독 수 (첫 로드 시에는 알림 없이 기준값만 설정)
let _notifyPrevCounts = null; // { downloads: N, subscriptions: N }
let _notifySettings   = { email: '', downloads: true, subscriptions: true };
let _notifyInitialized = false;

/**
 * Supabase에서 알림 설정 로드
 * mac_address     → 알림 수신 이메일
 * stripe_customer_id → JSON flags {"downloads":true,"subscriptions":true}
 */
async function loadNotificationSettings() {
    try {
        const sb = getSbAdmin();
        if (!sb) return;

        const { data } = await sb
            .from('profiles')
            .select('mac_address, stripe_customer_id')
            .eq('email', 'smtp-config@xpider.pro')
            .maybeSingle();

        if (data) {
            if (data.mac_address) _notifySettings.email = data.mac_address;
            if (data.stripe_customer_id) {
                try {
                    const flags = JSON.parse(data.stripe_customer_id);
                    if (typeof flags.downloads === 'boolean')     _notifySettings.downloads     = flags.downloads;
                    if (typeof flags.subscriptions === 'boolean') _notifySettings.subscriptions = flags.subscriptions;
                } catch(e) {}
            }
        }

        // UI 반영
        const emailEl = document.getElementById('notify-email-input');
        if (emailEl) emailEl.value = _notifySettings.email;
        updateNotifyToggleUI('downloads', _notifySettings.downloads);
        updateNotifyToggleUI('subscriptions', _notifySettings.subscriptions);

        appendDebugLog(`🔔 알림 설정 로드됨. 수신: ${_notifySettings.email || '(미설정)'}`, 'info');
    } catch(e) {
        console.warn('[Notify] 설정 로드 실패:', e.message);
    }
}

/**
 * 알림 설정 Supabase에 저장
 */
async function saveNotificationSettings() {
    const emailEl  = document.getElementById('notify-email-input');
    const dlToggle = document.getElementById('notify-downloads-toggle');
    const subToggle= document.getElementById('notify-subscriptions-toggle');
    const statusEl = document.getElementById('notify-save-status');

    const email = emailEl ? emailEl.value.trim() : '';
    const flags = {
        downloads:     dlToggle  ? dlToggle.checked  : true,
        subscriptions: subToggle ? subToggle.checked : true
    };

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        if (statusEl) { statusEl.textContent = '❌ 올바른 이메일 주소를 입력해주세요.'; statusEl.style.color = '#ff4d6d'; }
        return;
    }

    if (statusEl) { statusEl.textContent = '🔄 저장 중...'; statusEl.style.color = '#6b7a8d'; }

    try {
        const sb = getSbAdmin();
        if (!sb) throw new Error('Supabase 미연결');

        const { error } = await sb
            .from('profiles')
            .update({
                mac_address: email,
                stripe_customer_id: JSON.stringify(flags),
                last_active_at: new Date().toISOString()
            })
            .eq('email', 'smtp-config@xpider.pro');

        if (error) throw new Error(error.message);

        _notifySettings = { email, ...flags };

        if (statusEl) {
            statusEl.textContent = `✅ 저장 완료! ${email || '(이메일 없음)'}`;
            statusEl.style.color = '#39ff14';
            setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 3000);
        }
        appendDebugLog(`🔔 알림 설정 저장: ${email}, downloads=${flags.downloads}, subs=${flags.subscriptions}`, 'success');
    } catch(e) {
        console.error('[Notify] 저장 실패:', e.message);
        if (statusEl) { statusEl.textContent = `❌ 저장 실패: ${e.message}`; statusEl.style.color = '#ff4d6d'; }
    }
}

/**
 * 알림 토글 UI 상태 업데이트
 * @param {'downloads'|'subscriptions'} type
 * @param {boolean} enabled
 */
function updateNotifyToggleUI(type, enabled) {
    const isDl = (type === 'downloads');
    const trackId = isDl ? 'notify-dl-track'  : 'notify-sub-track';
    const thumbId = isDl ? 'notify-dl-thumb'  : 'notify-sub-thumb';
    const inputId = isDl ? 'notify-downloads-toggle' : 'notify-subscriptions-toggle';

    const track = document.getElementById(trackId);
    const thumb = document.getElementById(thumbId);
    const input = document.getElementById(inputId);
    if (!track || !thumb || !input) return;

    input.checked = enabled;
    if (enabled) {
        track.style.background = isDl ? 'rgba(99,179,237,0.5)' : 'rgba(251,191,36,0.5)';
        track.style.borderColor = isDl ? 'rgba(99,179,237,0.7)' : 'rgba(251,191,36,0.7)';
        thumb.style.left = '21px';
    } else {
        track.style.background = 'rgba(255,255,255,0.1)';
        track.style.borderColor = 'rgba(255,255,255,0.15)';
        thumb.style.left = '3px';
    }
}

/**
 * 현재 전체 유저·구독 수를 Supabase에서 읽어 반환
 * @returns {{ downloads: number, subscriptions: number, newDownloadUsers: Array, newSubUsers: Array }}
 */
async function fetchCurrentCounts() {
    const sb = getSbAdmin();
    if (!sb) return null;

    const { data: users } = await sb
        .from('profiles')
        .select('id, email, username, plan, created_at')
        .neq('email', 'smtp-config@xpider.pro')
        .order('created_at', { ascending: false });

    if (!users) return null;

    const total = users.length;
    const subs  = users.filter(u => u.plan && u.plan !== 'free' && u.plan !== 'admin' && u.plan !== 'starter').length;
    return { downloads: total, subscriptions: subs, users };
}

/**
 * 폴링마다 호출 — 변화 감지 시 이메일 알림 발송
 */
async function checkAndFireNotifications() {
    if (!_notifySettings.email) return; // 이메일 미설정 시 스킵

    try {
        const current = await fetchCurrentCounts();
        if (!current) return;

        if (!_notifyInitialized) {
            // 첫 로드: 기준값만 설정하고 알림은 보내지 않음
            _notifyPrevCounts = { downloads: current.downloads, subscriptions: current.subscriptions };
            _notifyInitialized = true;
            return;
        }

        const prev = _notifyPrevCounts;

        // 📥 신규 다운로드 감지
        if (_notifySettings.downloads && current.downloads > prev.downloads) {
            const newCount = current.downloads - prev.downloads;
            // 가장 최근 신규 유저들
            const newUsers = current.users.slice(0, newCount);
            const userList = newUsers.map(u =>
                `<tr style="border-bottom:1px solid #1e2a3a;">
                    <td style="padding:8px 12px;">${u.email || '-'}</td>
                    <td style="padding:8px 12px;">${u.username || '-'}</td>
                    <td style="padding:8px 12px; color:#63b3ed;">${u.plan || 'free'}</td>
                    <td style="padding:8px 12px; color:#6b7a8d; font-size:11px;">${new Date(u.created_at).toLocaleString('ko-KR')}</td>
                </tr>`
            ).join('');

            await sendAdminNotificationEmail(
                `📥 XPIDER 신규 다운로드 ${newCount}건`,
                `<div style="font-family:sans-serif; background:#03070d; color:#e2e8f0; padding:30px; border-radius:12px;">
                    <h2 style="color:#63b3ed; margin-top:0;">📥 신규 다운로드 알림</h2>
                    <p style="color:#a4b3c6;">신규 가입자가 <strong style="color:#fff;">${newCount}명</strong> 발생했습니다.</p>
                    <table style="width:100%; border-collapse:collapse; margin-top:16px; background:#080f1a; border-radius:8px; overflow:hidden;">
                        <thead><tr style="background:#0d1929;">
                            <th style="padding:10px 12px; text-align:left; color:#63b3ed; font-size:12px;">이메일</th>
                            <th style="padding:10px 12px; text-align:left; color:#63b3ed; font-size:12px;">유저명</th>
                            <th style="padding:10px 12px; text-align:left; color:#63b3ed; font-size:12px;">플랜</th>
                            <th style="padding:10px 12px; text-align:left; color:#63b3ed; font-size:12px;">가입 시간</th>
                        </tr></thead>
                        <tbody>${userList}</tbody>
                    </table>
                    <p style="margin-top:20px; color:#6b7a8d; font-size:12px;">총 누적 다운로드: ${current.downloads}명</p>
                </div>`
            );
            appendDebugLog(`📧 신규 다운로드 알림 이메일 발송 (${newCount}건)`, 'success');
        }

        // ⭐ 신규 구독 감지
        if (_notifySettings.subscriptions && current.subscriptions > prev.subscriptions) {
            const newCount = current.subscriptions - prev.subscriptions;
            const newSubUsers = current.users.filter(u =>
                u.plan && u.plan !== 'free' && u.plan !== 'admin' && u.plan !== 'starter'
            ).slice(0, newCount);

            const userList = newSubUsers.map(u =>
                `<tr style="border-bottom:1px solid #1e2a3a;">
                    <td style="padding:8px 12px;">${u.email || '-'}</td>
                    <td style="padding:8px 12px; color:#fbbf24; font-weight:700; text-transform:uppercase;">${u.plan}</td>
                    <td style="padding:8px 12px; color:#6b7a8d; font-size:11px;">${new Date(u.created_at).toLocaleString('ko-KR')}</td>
                </tr>`
            ).join('');

            await sendAdminNotificationEmail(
                `⭐ XPIDER 신규 구독 ${newCount}건`,
                `<div style="font-family:sans-serif; background:#03070d; color:#e2e8f0; padding:30px; border-radius:12px;">
                    <h2 style="color:#fbbf24; margin-top:0;">⭐ 신규 구독 알림</h2>
                    <p style="color:#a4b3c6;">유료 플랜 구독이 <strong style="color:#fff;">${newCount}건</strong> 발생했습니다.</p>
                    <table style="width:100%; border-collapse:collapse; margin-top:16px; background:#080f1a; border-radius:8px; overflow:hidden;">
                        <thead><tr style="background:#0d1929;">
                            <th style="padding:10px 12px; text-align:left; color:#fbbf24; font-size:12px;">이메일</th>
                            <th style="padding:10px 12px; text-align:left; color:#fbbf24; font-size:12px;">플랜</th>
                            <th style="padding:10px 12px; text-align:left; color:#fbbf24; font-size:12px;">구독 시간</th>
                        </tr></thead>
                        <tbody>${userList}</tbody>
                    </table>
                    <p style="margin-top:20px; color:#6b7a8d; font-size:12px;">총 누적 구독: ${current.subscriptions}건</p>
                </div>`
            );
            appendDebugLog(`📧 신규 구독 알림 이메일 발송 (${newCount}건)`, 'success');
        }

        // 기준값 업데이트
        _notifyPrevCounts = { downloads: current.downloads, subscriptions: current.subscriptions };

    } catch(e) {
        console.warn('[Notify] 감지 실패:', e.message);
    }
}

/**
 * 현재 SMTP 릴레이 설정에 따라 Brevo 또는 Resend로 알림 이메일 발송
 * @param {string} subject - 이메일 제목
 * @param {string} htmlBody - HTML 본문
 */
async function sendAdminNotificationEmail(subject, htmlBody) {
    const toEmail = _notifySettings.email;
    if (!toEmail) throw new Error('알림 이메일 주소 미설정');

    // 현재 SMTP provider 확인
    const provider = (() => {
        const toggle = document.getElementById('smtp-relay-toggle');
        return (toggle && toggle.checked) ? 'resend' : 'brevo';
    })();

    if (provider === 'resend') {
        await _sendViaResend(toEmail, subject, htmlBody);
    } else {
        await _sendViaBrevo(toEmail, subject, htmlBody);
    }
}

/**
 * Brevo API로 이메일 발송
 */
async function _sendViaBrevo(toEmail, subject, htmlBody) {
    // Cloudflare Worker Gateway에서 Brevo 키 획득
    const keyRes = await fetch('https://brevo-key-provider.goodkie-com.workers.dev/', { cache: 'no-store' });
    if (!keyRes.ok) throw new Error('Brevo 키 획득 실패');
    const apiKey = (await keyRes.text()).trim();

    const payload = {
        sender: { name: 'XPIDER Admin', email: 'no-reply@xpider.pro' },
        to: [{ email: toEmail }],
        subject,
        htmlContent: htmlBody
    };

    // 브라우저 단독 실행(CORS 제한 환경)인 경우 corsproxy.io 우회 적용
    const isBrowser = (typeof window.electronAPI === 'undefined') || window.electronAPI.isBrowserFallback || !window.electronAPI.send;
    const targetUrl = 'https://api.brevo.com/v3/smtp/email';
    const finalUrl = isBrowser ? `https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}` : targetUrl;

    const res = await fetch(finalUrl, {
        method: 'POST',
        headers: { 'accept': 'application/json', 'api-key': apiKey, 'content-type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`Brevo 오류 (${res.status}): ${err.message || 'unknown'}`);
    }
}

/**
 * Resend API로 이메일 발송
 */
async function _sendViaResend(toEmail, subject, htmlBody) {
    const a = 're_r6WymNfo', b = '_JSA47YBgS', c = 'FYUU5cf7v9', d = 'Ayh2J';
    const rsKey = a + b + c + d;
    const FROM_DOMAIN = 'instaheroi.com';

    const payload = {
        from: `XPIDER Admin <no-reply@${FROM_DOMAIN}>`,
        to: [toEmail],
        subject: subject,
        html: htmlBody
    };

    // Resend API는 JSON 방식, CORS 제한 환경에서는 corsproxy.io 우회
    const isBrowser = (typeof window.electronAPI === 'undefined') || window.electronAPI.isBrowserFallback || !window.electronAPI.send;
    const targetUrl = 'https://api.resend.com/emails';
    const finalUrl = isBrowser ? `https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}` : targetUrl;

    const res = await fetch(finalUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${rsKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`Resend 오류 (${res.status}): ${err.message || 'unknown'}`);
    }
}

// ── 폴링에 알림 감지 통합 ──
// loadAllData의 Supabase 직접 호출 버전 오버라이드 (웹 환경)
const _origStartConsole = window.startAdminConsole || null;

(function patchNotifyIntoPolling() {
    // 5초 폴링에 알림 감지 추가
    const origSetInterval = window._notifyPollPatched;
    if (origSetInterval) return; // 중복 방지
    window._notifyPollPatched = true;

    // 알림 설정 최초 로드
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => loadNotificationSettings().catch(() => {}), 2000);
        });
    } else {
        setTimeout(() => loadNotificationSettings().catch(() => {}), 2000);
    }

    // 30초마다 알림 감지 실행 (Supabase 부하 분산)
    setInterval(() => {
        checkAndFireNotifications().catch(() => {});
    }, 30000);
})();

// window 노출
window.saveNotificationSettings = saveNotificationSettings;
window.updateNotifyToggleUI = updateNotifyToggleUI;
window.loadNotificationSettings = loadNotificationSettings;

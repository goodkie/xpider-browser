/* ==========================================================================
   XPIDER Mobile Admin Command Center — Core Brain Logic (SaaS DB & Real-time Beacon)
   ========================================================================== */

// ─── 🌐 Supabase Direct 연결 (Electron 외부 브라우저용) ────────────
const SUPABASE_URL  = 'https://gfgudbxpkpfevsuobdmr.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdmZ3VkYnhwa3BmZXZzdW9iZG1yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njc5NzM3NiwiZXhwIjoyMDkyMzczMzc2fQ.ifTar2cFr_PwTPYc4dv4AegXC_g5sSn3zm9kHUwQJmo';

let _sbAdmin = null;
function getSbAdmin() {
    if (!_sbAdmin && window.supabase) {
        _sbAdmin = window.supabase.createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    }
    return _sbAdmin;
}

// 브라우저용 Supabase 다이렉트 데이터 엑세스
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
    if (channel === 'admin-update-user-plan') {
        const { error } = await sb.from('profiles').update({ plan: data.plan }).eq('id', data.userId);
        return !error;
    }
    if (channel === 'admin-delete-user') {
        const { error } = await sb.from('profiles').delete().eq('id', data.userId);
        return !error;
    }
    return null;
}

// electronAPI 호환 브릿지 우회 생성 (브라우저 직접 구동용)
if (typeof window.electronAPI === 'undefined') {
    window.electronAPI = {
        invoke: async (channel, data) => sbInvoke(channel, data),
        on: () => {}
    };
}

// ─── 💾 데이터 상태 캐싱 ────────────
let usersCached = [];
let logsCached = [];
let activeTab = 'dashboard';
let currentStatPeriod = 'day';
let selectedUserId = null; // 바텀 시트 타겟 유저
let autoPollInterval = null;

// ─── 💻 모바일 미니 텔레메트리 터미널 로거 ────────────
function appendDebugLog(message, type = 'info') {
    const screen = document.getElementById('debug-log-screen');
    if (!screen) return;
    
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    const line = document.createElement('div');
    line.className = `terminal-line ${type}`;
    
    let prefix = '⚙️ [SYS]';
    if (type === 'error') prefix = '❌ [ERR]';
    else if (type === 'warning') prefix = '⚠️ [WRN]';
    else if (type === 'api') prefix = '📡 [API]';
    else if (type === 'success') prefix = '✅ [OK]';
    
    line.textContent = `[${time}] ${prefix} ${message}`;
    screen.appendChild(line);
    
    // 자동 스크롤
    screen.scrollTop = screen.scrollHeight;
}

// ─── 🔑 강력한 모바일 암호화 로그인 시스템 (SHA-256) ────────────
async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

const SECURE_PW_HASH = 'de34ddf5af5bcbda0219a7280880a0b7c6ae7b12885160996fe3effaa67733a3'; // 'koko'
const SESSION_VAL_HASH = 'c028a4be8544d65a8df2f8b54e69e855c3c19e855a024c7ad44cbad762a5da0a4';

async function checkAdminSession() {
    const overlay = document.getElementById('admin-login-overlay');
    const session = localStorage.getItem('xpider_admin_session');
    
    if (session === SESSION_VAL_HASH) {
        overlay.classList.add('fade-out');
        appendDebugLog('🔑 [보안] 기존 유효한 세션 감지됨. 즉각 자동 로그인.', 'success');
        startAdminConsole();
    } else {
        appendDebugLog('🔒 [보안] 인증되지 않은 디바이스 접근. 관리자 암호를 대기합니다.', 'warning');
        document.getElementById('login-username').focus();
    }
}

async function handleSecureLogin() {
    const usernameInput = document.getElementById('login-username').value.trim();
    const passwordInput = document.getElementById('login-password').value;
    const errorMsg = document.getElementById('login-error-msg');
    
    if (!usernameInput || !passwordInput) {
        errorMsg.textContent = '아이디와 패스워드를 모두 기입해 주세요.';
        return;
    }
    
    const pwHash = await sha256(passwordInput);
    
    if (usernameInput === 'Annie' && pwHash === SECURE_PW_HASH) {
        errorMsg.textContent = '';
        localStorage.setItem('xpider_admin_session', SESSION_VAL_HASH);
        const overlay = document.getElementById('admin-login-overlay');
        overlay.classList.add('fade-out');
        appendDebugLog('🔓 [보안] SHA-256 암호화 서명 일치. 로그인 성공.', 'success');
        startAdminConsole();
    } else {
        errorMsg.textContent = '❌ 아이디 또는 비밀번호가 잘못되었습니다.';
        appendDebugLog('🚨 [보안 경고] 잘못된 자격 증명 진입 시도 차단됨.', 'error');
    }
}

function handleAdminLogout() {
    localStorage.removeItem('xpider_admin_session');
    appendDebugLog('🔒 [보안] 로그인 세션이 즉시 폐기되었습니다. 재인증을 대기합니다.', 'info');
    setTimeout(() => {
        window.location.reload();
    }, 400);
}

// ─── 🏃 어드민 콘솔 기동 및 폴링 ────────────
function startAdminConsole() {
    loadAllData(true);
    loadStats(currentStatPeriod);
    
    // 5초 간격 실시간 갱신 활성화
    if (!autoPollInterval) {
        autoPollInterval = setInterval(() => {
            loadAllData(false);
        }, 5000);
    }
}

// ─── 📡 실시간 통합 데이터 수집 ────────────
async function loadAllData(isFirstLoad = false) {
    try {
        if (isFirstLoad) {
            appendDebugLog('SaaS 실시간 통합 데이터베이스 폴링 개시...', 'api');
        }
        
        // 1. 유저 정보 조회
        const users = await window.electronAPI.invoke('admin-get-all-profiles');
        usersCached = users || [];
        
        // 2. 활동 로그 조회
        const filterDate = document.getElementById('log-date-filter').value || null;
        const logs = await window.electronAPI.invoke('admin-get-user-logs', { filterDate });
        logsCached = logs || [];
        
        // 3. UI 렌더링
        renderLiveBeacons();
        renderUsersList();
        renderTimelineLogs();
        
        // 4. Brevo Credits Sync
        loadBrevoCreditsMobile().catch(() => {});
        
        // 바텀 시트 열려있는 경우 해당 유저 정보도 실시간 갱신 반영
        if (selectedUserId) {
            const freshUser = usersCached.find(u => u.id === selectedUserId);
            if (freshUser) refreshBottomSheetData(freshUser);
        }
        
    } catch (e) {
        console.error('Data pull crash:', e);
        appendDebugLog(`데이터 동기화 실패: ${e.message}`, 'error');
    }
}

// ─── 🟢 실시간 5분 이내 액티브 비콘 리스팅 ────────────
function renderLiveBeacons() {
    const container = document.getElementById('online-users-container');
    if (!container) return;
    
    const now = Date.now();
    const FIVE_MINUTES_MS = 5 * 60 * 1000;
    
    const onlineUsers = usersCached.filter(u => {
        if (!u.last_active_at) return false;
        const lastActiveTime = new Date(u.last_active_at).getTime();
        return (now - lastActiveTime) < FIVE_MINUTES_MS;
    });

    document.getElementById('online-count').textContent = `${onlineUsers.length} Active Now`;

    if (onlineUsers.length === 0) {
        container.innerHTML = `<div class="no-data-msg">액티브 세션이 감지되지 않았습니다.</div>`;
        return;
    }

    container.innerHTML = '';
    onlineUsers.forEach(u => {
        const email = u.email || u.username || 'unknown@xpider.pro';
        const badge = document.createElement('div');
        badge.className = 'online-user-badge';
        badge.innerHTML = `<span class="online-pulse"></span> ${email}`;
        badge.style.cursor = 'pointer';
        badge.onclick = () => {
            // 유저 탭으로 즉시 이동하고 검색어 입력 후 바텀시트까지 오픈해주는 하이퍼모션 제공
            switchTab('users');
            const search = document.getElementById('user-search-input');
            search.value = email;
            renderUsersList();
            
            // 매칭된 유저 바텀시트 다이렉트 팝업
            setTimeout(() => {
                const freshUser = usersCached.find(usr => (usr.email || '').toLowerCase() === email.toLowerCase());
                if (freshUser) openBottomSheet(freshUser);
            }, 150);
        };
        container.appendChild(badge);
    });
}

// ─── 👥 모바일 유저 카드형 렌더링 ────────────
function renderUsersList() {
    const container = document.getElementById('mobile-user-list-container');
    if (!container) return;
    
    const query = document.getElementById('user-search-input').value.toLowerCase().trim();
    const filtered = usersCached.filter(u => {
        const email = (u.email || '').toLowerCase();
        const username = (u.username || '').toLowerCase();
        return email.includes(query) || username.includes(query);
    });

    if (filtered.length === 0) {
        container.innerHTML = `<div class="no-data-msg">일치하는 가입자를 찾지 못했습니다.</div>`;
        return;
    }

    container.innerHTML = '';
    filtered.forEach(u => {
        const card = document.createElement('div');
        card.className = 'user-mobile-card';
        
        const email = u.email || u.username || 'No Email';
        const name = u.username || '이름 없음';
        const plan = u.plan || 'free';
        const tokens = u.tokens_remaining !== undefined ? u.tokens_remaining : 5000;
        const device = u.active_device_id ? '📱 연동중' : '💤 미연동';
        const isActive = u.is_active !== false;

        card.innerHTML = `
            <div class="user-card-left">
                <div class="user-card-avatar">${name.substring(0,1).toUpperCase()}</div>
                <div class="user-card-info">
                    <span class="user-card-name">${name}</span>
                    <span class="user-card-email">${email}</span>
                    <div class="user-card-badges">
                        <span class="badge-plan ${plan}">${plan}</span>
                        <span class="badge-active ${isActive ? 'active' : 'inactive'}">${isActive ? 'Active' : 'Locked'}</span>
                    </div>
                </div>
            </div>
            <div class="user-card-right">
                <div class="user-card-tokens">🪙 ${tokens.toLocaleString()}</div>
                <div class="user-card-device">${device}</div>
            </div>
        `;
        
        // 카드 클릭 시 바텀 시트 활성화
        card.onclick = () => openBottomSheet(u);
        container.appendChild(card);
    });
}

// ─── ⏳ 모바일 활동 로그 타임라인 렌더링 ────────────
function renderTimelineLogs() {
    const container = document.getElementById('timeline-container');
    if (!container) return;

    if (logsCached.length === 0) {
        container.innerHTML = `<div class="no-data-msg">기록된 이력이 존재하지 않습니다.</div>`;
        return;
    }

    container.innerHTML = '';
    logsCached.forEach(log => {
        const timeStr = new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
        const dateStr = new Date(log.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' });
        
        // 익스텐션 및 액션 성격에 맞춘 뱃지 분화
        let actionClass = '';
        if (log.action.includes('Mining') || log.action.includes('Extract')) actionClass = 'action-mine';
        else if (log.action.includes('Login') || log.action.includes('Auth')) actionClass = 'action-auth';
        else if (log.action.includes('Token') || log.action.includes('Admin')) actionClass = 'action-admin';

        const card = document.createElement('div');
        card.className = 'timeline-card';
        card.innerHTML = `
            <div class="timeline-card-header">
                <span class="timeline-user">${log.email}</span>
                <span class="timeline-time">${dateStr} ${timeStr}</span>
            </div>
            <div class="timeline-body">${log.action}</div>
            ${log.details ? `<div style="font-size:11px; color:#8e9bb3; margin-top:2px;">↳ ${log.details}</div>` : ''}
            <div class="timeline-footer">
                <span class="timeline-badge">${log.extension_name || 'XPIDER PRO'}</span>
                <span class="timeline-badge ${actionClass}">🪙 -${log.tokens_consumed} 토큰</span>
            </div>
        `;
        container.appendChild(card);
    });
}

// ─── 📊 대시보드 통계 계산 엔진 (Supabase 직통) ────────────
function getPeriodStart(period) {
    const now = new Date();
    switch(period) {
        case 'day':   return new Date(now.getFullYear(), now.getMonth(), now.getDate());
        case 'week':  { const d = new Date(now); d.setDate(d.getDate() - 6); d.setHours(0,0,0,0); return d; }
        case 'month': return new Date(now.getFullYear(), now.getMonth(), 1);
        default:      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }
}

async function loadStats(period) {
    currentStatPeriod = period;
    const startDate = getPeriodStart(period);
    const startISO  = startDate.toISOString();

    // UI 로더 작동
    ['stat-downloads','stat-subscriptions','stat-issued','stat-usage'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '...';
    });

    try {
        const sb = getSbAdmin();
        if (!sb) return;

        // 1. 신규 다운로드 (가입) 수
        const { data: newUsers } = await sb
            .from('profiles')
            .select('id, plan, tokens_remaining')
            .gte('created_at', startISO);

        const downloads = newUsers ? newUsers.length : 0;

        // 2. 신규 유료 구독 수
        const subscriptions = newUsers
            ? newUsers.filter(u => u.plan && u.plan !== 'free' && u.plan !== 'admin').length
            : 0;

        // 3. 토큰 신규 충전/발행량 합계
        const tokensIssued = newUsers
            ? newUsers.reduce((sum, u) => sum + (u.tokens_remaining || 0), 0)
            : 0;

        // 4. 소모된 토큰 총량
        const { data: usageLogs } = await sb
            .from('user_logs')
            .select('tokens_consumed')
            .gte('created_at', startISO);

        const tokenUsage = usageLogs
            ? usageLogs.reduce((sum, l) => sum + (l.tokens_consumed || 0), 0)
            : 0;

        // UI 바인딩
        document.getElementById('stat-downloads').textContent = downloads.toLocaleString();
        document.getElementById('stat-subscriptions').textContent = subscriptions.toLocaleString();
        document.getElementById('stat-issued').textContent = tokensIssued.toLocaleString();
        document.getElementById('stat-usage').textContent = tokenUsage.toLocaleString();

        appendDebugLog(`대시보드 리포트 분석 완료 (${period})`, 'success');
    } catch(e) {
        appendDebugLog(`리포트 집계 실패: ${e.message}`, 'error');
    }
}

function setStatPeriod(period) {
    document.querySelectorAll('.time-filter-chips .chip').forEach(c => {
        c.classList.toggle('active', c.dataset.period === period);
    });
    loadStats(period);
}

// ─── 📱 SPA 탭 네비게이션 스위치 ────────────
function switchTab(tabId) {
    if (activeTab === tabId) return;
    activeTab = tabId;
    
    // 탭 헤더/컨텐츠 비주얼 스위치
    document.querySelectorAll('.tab-content').forEach(el => {
        el.classList.remove('active');
    });
    document.getElementById(`tab-content-${tabId}`).classList.add('active');
    
    document.querySelectorAll('.mobile-nav-bar .nav-item').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabId);
    });

    appendDebugLog(`화면 탭 전환: [${tabId.toUpperCase()}] 피드 이동`, 'info');
    
    // 즉각 데이터 리싱크 기동
    if (tabId === 'dashboard') loadStats(currentStatPeriod);
    loadAllData(false);
}

// ─── 🎛️ 모바일 바텀 시트 (유저 상세 제어) ────────────
function openBottomSheet(user) {
    selectedUserId = user.id;
    refreshBottomSheetData(user);

    // 슬라이드 애니메이션 활성화
    document.getElementById('bottom-sheet-overlay').classList.remove('hidden');
    document.getElementById('mobile-bottom-sheet').classList.remove('hidden');
    
    appendDebugLog(`바텀 제어 패널 확장: ${user.email}`, 'info');
}

function refreshBottomSheetData(user) {
    const email = user.email || user.username || 'unknown@xpider.pro';
    const name = user.username || 'No Name';
    const tokens = user.tokens_remaining !== undefined ? user.tokens_remaining : 5000;
    const plan = user.plan || 'free';
    const device = user.active_device_id ? `📱 연동중 (${user.active_device_id.substring(0,8)})` : '💤 기기 연동 없음';
    const isActive = user.is_active !== false;

    // 바텀 시트 요소 바인딩
    document.getElementById('sheet-avatar').textContent = name.substring(0,1).toUpperCase();
    document.getElementById('sheet-username').textContent = name;
    document.getElementById('sheet-email').textContent = email;
    document.getElementById('sheet-status-device').textContent = `💻 기기상태: ${device}`;
    
    const activeChip = document.getElementById('sheet-status-active');
    if (isActive) {
        activeChip.textContent = '🟢 계정 활성화 상태';
        activeChip.style.color = 'var(--success)';
        activeChip.style.background = 'rgba(46,196,182,0.1)';
        document.getElementById('sheet-toggle-active-btn').textContent = '🔒 계정 일시 정지';
        document.getElementById('sheet-toggle-active-btn').style.color = '#fff';
    } else {
        activeChip.textContent = '🚫 계정 잠금 상태';
        activeChip.style.color = 'var(--danger)';
        activeChip.style.background = 'rgba(255,51,102,0.1)';
        document.getElementById('sheet-toggle-active-btn').textContent = '🔓 계정 잠금 해제';
        document.getElementById('sheet-toggle-active-btn').style.color = 'var(--success)';
    }

    document.getElementById('sheet-tokens-input').value = tokens;
    document.getElementById('sheet-plan-select').value = plan;
}

function closeBottomSheet() {
    document.getElementById('bottom-sheet-overlay').classList.add('hidden');
    document.getElementById('mobile-bottom-sheet').classList.add('hidden');
    selectedUserId = null;
}

// [바텀 시트] 토큰 변경
async function saveSheetTokens() {
    if (!selectedUserId) return;
    const tokensVal = parseInt(document.getElementById('sheet-tokens-input').value);
    
    if (isNaN(tokensVal) || tokensVal < 0) {
        alert('올바른 토큰 수량을 입력하세요.');
        return;
    }

    try {
        appendDebugLog(`수동 토큰 수치 조절 요청 (${tokensVal} 토큰)...`, 'api');
        const success = await window.electronAPI.invoke('admin-update-user-tokens', { userId: selectedUserId, tokens: tokensVal });
        if (success) {
            appendDebugLog('토큰 밸런스 데이터베이스 갱신 완료.', 'success');
            loadAllData(false);
        } else {
            alert('토큰 변경에 실패했습니다.');
        }
    } catch(e) {
        appendDebugLog(`토큰 조작 장애: ${e.message}`, 'error');
    }
}

// [바텀 시트] 플랜 강제 변경
async function saveSheetPlan() {
    if (!selectedUserId) return;
    const planVal = document.getElementById('sheet-plan-select').value;

    try {
        appendDebugLog(`계정 플랜 강제 개편 요청 (${planVal.toUpperCase()})...`, 'api');
        const success = await window.electronAPI.invoke('admin-update-user-plan', { userId: selectedUserId, plan: planVal });
        if (success) {
            appendDebugLog('가입 플랜 갱신이 안전하게 승인되었습니다.', 'success');
            loadAllData(false);
        } else {
            alert('플랜 등급 수정에 실패했습니다.');
        }
    } catch(e) {
        appendDebugLog(`플랜 변경 장애: ${e.message}`, 'error');
    }
}

// [바텀 시트] 기기 연동 강제 로그아웃
async function triggerSheetDeviceReset() {
    if (!selectedUserId) return;
    const email = document.getElementById('sheet-email').textContent;
    
    if (!confirm(`정말로 이 유저(${email})의 기존 크롬 브라우저 기기 연동을 강제 폐기하고 원격 로그아웃 처리하시겠습니까?\n해당 기기에서는 실시간 벤이 진행됩니다.`)) return;

    try {
        appendDebugLog(`디바이스 락 릴리즈 통보 발송...`, 'api');
        const success = await window.electronAPI.invoke('admin-force-logout', { userId: selectedUserId });
        if (success) {
            appendDebugLog(`원격 로그아웃 명령 통과. 기기 식별값 반환 완료.`, 'success');
            loadAllData(false);
        } else {
            alert('기기 연동 해제 실패.');
        }
    } catch(e) {
        appendDebugLog(`기기 정지 장애: ${e.message}`, 'error');
    }
}

// [바텀 시트] 계정 활성/잠금 토글
async function toggleSheetActive() {
    if (!selectedUserId) return;
    
    const freshUser = usersCached.find(u => u.id === selectedUserId);
    if (!freshUser) return;
    const nextState = !(freshUser.is_active !== false);

    try {
        appendDebugLog(`계정 활성화 상태 반전 (${nextState})...`, 'api');
        const success = await window.electronAPI.invoke('admin-set-active', { userId: selectedUserId, isActive: nextState });
        if (success) {
            appendDebugLog(`계정 라이선스 제어 성공. (활성 상태: ${nextState})`, 'success');
            loadAllData(false);
        } else {
            alert('라이선스 상태 수정에 실패했습니다.');
        }
    } catch(e) {
        appendDebugLog(`라이선스 잠금 장애: ${e.message}`, 'error');
    }
}

// [바텀 시트] 계정 삭제
async function deleteSheetUser() {
    if (!selectedUserId) return;
    const email = document.getElementById('sheet-email').textContent;

    if (!confirm(`🛑 [경고] 정말로 유저 계정(${email})을 Supabase 데이터베이스에서 영구 삭제하시겠습니까?\n삭제된 계정 정보와 라이선스는 물리적으로 완전히 지워지며 복구할 수 없습니다.`)) return;

    try {
        appendDebugLog(`유저 레코드 물리적 영구 말소 집행 중...`, 'api');
        const success = await window.electronAPI.invoke('admin-delete-user', { userId: selectedUserId });
        if (success) {
            appendDebugLog(`가입자 계정 데이터 삭제 완결.`, 'success');
            closeBottomSheet();
            loadAllData(false);
        } else {
            alert('계정 삭제에 실패했습니다.');
        }
    } catch(e) {
        appendDebugLog(`물리 삭제 장애: ${e.message}`, 'error');
    }
}

// ─── 📅 이벤트 바인딩 및 부팅 ────────────
document.addEventListener('DOMContentLoaded', () => {
    appendDebugLog('XPIDER Mobile Command Center Engine 부팅...', 'info');
    checkAdminSession();

    // 비밀번호 입력창 엔터키
    document.getElementById('login-password').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSecureLogin();
    });
    
    // 유저 실시간 검색
    document.getElementById('user-search-input').addEventListener('input', renderUsersList);
    
    // 로그 필터 초기화
    document.getElementById('clear-filters-btn').addEventListener('click', () => {
        document.getElementById('log-date-filter').value = '';
        appendDebugLog('날짜 필터를 해제했습니다.', 'info');
        loadAllData(false);
    });
    
    // 로그 날짜 변경 리스너
    document.getElementById('log-date-filter').addEventListener('change', () => {
        loadAllData(false);
    });

    // 수동 동기화 버튼
    document.getElementById('refresh-all-btn').addEventListener('click', () => {
        appendDebugLog('어드민 관리자가 수동 갱신을 요청했습니다.', 'info');
        loadAllData(true);
    });
});

// 전역 바인딩 리스너 노출
window.switchTab = switchTab;
window.handleSecureLogin = handleSecureLogin;
window.handleAdminLogout = handleAdminLogout;
window.setStatPeriod = setStatPeriod;
window.closeBottomSheet = closeBottomSheet;
window.saveSheetTokens = saveSheetTokens;
window.saveSheetPlan = saveSheetPlan;
window.triggerSheetDeviceReset = triggerSheetDeviceReset;
window.toggleSheetActive = toggleSheetActive;
window.deleteSheetUser = deleteSheetUser;

// ─── Brevo Credits 실시간 모니터링 ───
async function loadBrevoCreditsMobile() {
    const creditsVal = document.getElementById('brevo-credits-val-mobile');
    const planVal = document.getElementById('brevo-plan-val-mobile');
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
        console.error('[MobilePanel] Brevo API Error:', e);
        
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
            console.error('[MobilePanel] Brevo Fallback DB Error:', dbErr);
        }
        
        creditsVal.textContent = 'API Error';
        planVal.textContent = 'Connection Fail';
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

window.loadBrevoCreditsMobile = loadBrevoCreditsMobile;


/* ==========================================================================
   XPIDER Admin Command Center — Core Brain Logic (SaaS DB & Real-time Beacon)
   ========================================================================== */

let usersCached = [];
let logsCached = [];
let selectedUserIdForTokens = null;

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

// Initial Load & Heartbeat Setup
document.addEventListener('DOMContentLoaded', () => {
    loadAllData();
    
    // 5초 간격으로 실시간 DB 자동 동기화 (Green Beacon 및 로그 실시간 갱신)
    setInterval(loadAllData, 5000);
    
    // Event Listeners
    userSearchInput.addEventListener('input', renderUsersTable);
    logDateFilter.addEventListener('change', loadLogsData);
    
    clearFiltersBtn.addEventListener('click', () => {
        logDateFilter.value = '';
        loadLogsData();
    });
    
    refreshAllBtn.addEventListener('click', () => {
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
        if (isManual) refreshAllBtn.textContent = '⚡ Syncing...';
        
        // 1. Fetch Users
        const users = await window.electronAPI.invoke('admin-get-all-profiles');
        usersCached = users || [];
        
        // 2. Load Logs
        await loadLogsData();
        
        // 3. Render
        renderLiveBeacons();
        renderUsersTable();
        
        if (isManual) {
            refreshAllBtn.textContent = '🔄 Sync Database';
            console.log('Synchronized database successfully.');
        }
    } catch (e) {
        console.error('Failed to load command center data:', e.message);
        if (isManual) refreshAllBtn.textContent = '❌ Failed Sync';
    }
}

// Load Logs separately to support custom date filters
async function loadLogsData() {
    try {
        const filterDate = logDateFilter.value || null; // 'YYYY-MM-DD'
        const logs = await window.electronAPI.invoke('admin-get-user-logs', { filterDate });
        logsCached = logs || [];
        renderTimelineLogs();
    } catch(e) {
        console.error('Failed to load user logs:', e.message);
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
        // 클릭 시 검색창에 해당 유저 자동 검색
        node.style.cursor = 'pointer';
        node.addEventListener('click', () => {
            userSearchInput.value = email;
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
        const success = await window.electronAPI.invoke('admin-set-active', { userId, isActive: isChecked });
        if (success) {
            console.log(`User active state updated successfully: ${isChecked}`);
            // 캐시 동기화
            const user = usersCached.find(u => u.id === userId);
            if (user) user.is_active = isChecked;
        } else {
            alert('Failed to modify user status.');
        }
    } catch(e) {
        console.error('Failed to toggle active status:', e.message);
    }
}

// Force user logout (Kick Device ID)
async function forceUserLogout(userId, email) {
    if (!confirm(`Are you sure you want to FORCE LOGOUT user: ${email}?`)) return;
    try {
        const success = await window.electronAPI.invoke('admin-force-logout', { userId });
        if (success) {
            alert(`User ${email} has been forced to log out successfully.`);
            loadAllData();
        } else {
            alert('Failed to force logout.');
        }
    } catch (e) {
        console.error('Failed to force logout:', e.message);
    }
}

// Open Token Adjustment Modal
function openTokenRechargeModal(userId, email, currentTokens) {
    selectedUserIdForTokens = userId;
    modalUserEmail.textContent = `Adjusting tokens for: ${email}`;
    newTokenAmount.value = currentTokens;
    tokenEditModal.classList.remove('hidden');
    newTokenAmount.focus();
}
window.openTokenRechargeModal = openTokenRechargeModal; // Expose globally for inline onclick

// Save Token Recharge adjust
async function saveTokensRecharge() {
    if (!selectedUserIdForTokens) return;
    const tokens = parseInt(newTokenAmount.value);
    if (isNaN(tokens) || tokens < 0) {
        alert('Please enter a valid positive token amount.');
        return;
    }

    try {
        const success = await window.electronAPI.invoke('admin-update-user-tokens', { userId: selectedUserIdForTokens, tokens });
        if (success) {
            tokenEditModal.classList.add('hidden');
            selectedUserIdForTokens = null;
            // 갱신
            loadAllData();
        } else {
            alert('Failed to update tokens in database.');
        }
    } catch(e) {
        console.error('Failed to recharge tokens:', e.message);
    }
}

// Expose switch/kick handlers globally for inline triggers
window.toggleUserActiveState = toggleUserActiveState;
window.forceUserLogout = forceUserLogout;

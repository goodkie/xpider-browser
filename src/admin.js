/* ==========================================================================
   XPIDER Admin Command Center — Core Brain Logic (SaaS DB & Real-time Beacon)
   ========================================================================== */

// Defensive Mock for window.electronAPI when running outside Electron (e.g. standard browsers)
if (typeof window.electronAPI === 'undefined') {
    console.warn("[XPIDER] Running outside Electron. Mocking window.electronAPI for safety.");
    window.electronAPI = {
        invoke: async (channel, data) => {
            console.log(`[Mock ElectronAPI] Invoke called on channel "${channel}"`, data);
            
            // Return safe mock data for visual demonstration outside Electron
            if (channel === 'admin-get-all-profiles') {
                return [
                    {
                        id: 'mock-admin-id',
                        username: 'System Admin (Demo)',
                        email: 'admin@xpider.pro',
                        plan: 'admin',
                        is_active: true,
                        tokens_remaining: 999999,
                        last_active_at: new Date().toISOString(),
                        created_at: new Date().toISOString()
                    },
                    {
                        id: 'mock-user-1',
                        username: 'John Doe',
                        email: 'john@example.com',
                        plan: 'free',
                        is_active: true,
                        tokens_remaining: 4250,
                        last_active_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(), // 2 mins ago (Active Beacon)
                        created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
                    },
                    {
                        id: 'mock-user-2',
                        username: 'Jane Smith',
                        email: 'jane@demo.com',
                        plan: 'pro',
                        is_active: false,
                        tokens_remaining: 12000,
                        last_active_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
                        created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
                    }
                ];
            }
            if (channel === 'admin-get-user-logs') {
                return [
                    {
                        id: 'log-1',
                        email: 'john@example.com',
                        extension_name: 'Local Crawler',
                        action: 'Extract Leads',
                        tokens_consumed: 10,
                        created_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
                        details: 'Successfully extracted 50 business leads from web listing.'
                    },
                    {
                        id: 'log-2',
                        email: 'jane@demo.com',
                        extension_name: 'VPN Extractor',
                        action: 'Switch Location',
                        tokens_consumed: 25,
                        created_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
                        details: 'Tunnel routed through Oregon premium node.'
                    }
                ];
            }
            if (channel === 'admin-set-active') return true;
            if (channel === 'admin-force-logout') return true;
            if (channel === 'admin-update-user-tokens') return true;
            
            return [];
        },
        on: (channel, callback) => {
            console.log(`[Mock ElectronAPI] Listener registered on channel "${channel}"`);
        }
    };
    
    // UI에 경고성 로그 출력
    setTimeout(() => {
        appendDebugLog("Running in Standard Browser mode. Real-time telemetry is running on local Mock API.", "warning");
        appendDebugLog("To connect with actual live Electron backend, launch XPIDER Browser application.", "info");
    }, 100);
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

// Initial Load & Heartbeat Setup
document.addEventListener('DOMContentLoaded', () => {
    appendDebugLog('Command Center Telemetry Console Activated. Auto-polling interval: 5000ms.', 'info');
    loadAllData();
    
    // 5초 간격으로 실시간 DB 자동 동기화 (Green Beacon 및 로그 실시간 갱신)
    setInterval(loadAllData, 5000);
    
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

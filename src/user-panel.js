// ═══════════════════════════════════════════════════════
// XPIDER User Panel — Frontend Logic
// ═══════════════════════════════════════════════════════

// Mock API for browser-based development
const api = window.electronAPI || {
  invoke: async (ch, data) => {
    console.warn('[UserPanel] electronAPI not available, using mock for:', ch);
    if (ch === 'user-get-profile') return {
      id: 'mock-id', username: 'Demo User', email: 'demo@xpider.io',
      plan: 'free', tokens_remaining: 3200, created_at: new Date().toISOString(),
      last_login: new Date().toISOString(), is_active: true
    };
    if (ch === 'user-get-logs') return [
      { created_at: new Date().toISOString(), extension_name: 'AI Crawler', action: 'Page Crawl', tokens_consumed: 50, details: 'https://example.com' },
      { created_at: new Date(Date.now() - 86400000).toISOString(), extension_name: 'Email Extractor', action: 'Extract', tokens_consumed: 20, details: '12 emails found' }
    ];
    return null;
  },
  send: (ch, data) => { console.warn('[UserPanel] send not available:', ch); }
};

// ─── State ─────────────────────────────────────────────
let currentProfile = null;
const MAX_TOKENS = 1000000; // Reference max for progress bar

// ─── Init ───────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  await loadProfile();
  await loadLogs();
});

// ─── Load Profile ───────────────────────────────────────
async function loadProfile() {
  try {
    const profile = await api.invoke('user-get-profile');
    if (!profile) {
      showToast('❌ 프로필 정보를 불러오지 못했습니다');
      return;
    }
    currentProfile = profile;
    renderProfile(profile);
  } catch (e) {
    console.error('[UserPanel] Failed to load profile:', e);
    showToast('❌ 프로필 로딩 오류: ' + e.message);
  }
}

// ─── Render Profile ──────────────────────────────────────
function renderProfile(profile) {
  const name = profile.username || profile.email?.split('@')[0] || 'User';

  // Header
  const avatar = document.getElementById('user-avatar');
  const headerName = document.getElementById('header-username');
  if (avatar) avatar.textContent = name.charAt(0).toUpperCase();
  if (headerName) headerName.textContent = name;

  // Welcome
  const title = document.getElementById('welcome-title');
  const sub = document.getElementById('welcome-sub');
  if (title) title.textContent = `안녕하세요, ${name}님! 👋`;
  if (sub) sub.textContent = profile.email + ' · XPIDER 서비스를 이용해 주셔서 감사합니다.';

  // Plan badge
  const planBadge = document.getElementById('plan-badge');
  const planName = document.getElementById('plan-name');
  if (planName) {
    const planLabels = { free: 'Free', starter: 'Starter', pro: 'Pro', enterprise: 'Enterprise', admin: 'Admin' };
    planName.textContent = planLabels[profile.plan] || profile.plan || 'Free';
  }
  if (planBadge && profile.plan === 'pro') {
    planBadge.style.background = 'linear-gradient(135deg, rgba(108,99,255,0.2), rgba(78,205,196,0.1))';
    planBadge.style.borderColor = 'rgba(108,99,255,0.4)';
    planBadge.style.color = '#a78bfa';
  }

  // Stats
  const tokens = profile.tokens_remaining ?? 0;
  const tokenDisplay = document.getElementById('stat-tokens');
  if (tokenDisplay) tokenDisplay.textContent = tokens.toLocaleString();

  const pct = Math.min(100, Math.round((tokens / MAX_TOKENS) * 100));
  const fill = document.getElementById('token-progress');
  const pctLabel = document.getElementById('token-pct');
  if (fill) fill.style.width = pct + '%';
  if (pctLabel) pctLabel.textContent = pct + '% 남음';

  // Joined
  const joined = document.getElementById('stat-joined');
  if (joined && profile.created_at) {
    joined.textContent = formatDate(profile.created_at);
  }

  // Last login
  const lastLogin = document.getElementById('stat-last-login');
  if (lastLogin && profile.last_login) {
    lastLogin.textContent = formatDateTime(profile.last_login);
  } else if (lastLogin) {
    lastLogin.textContent = '방금 전';
  }
}

// ─── Load Logs ──────────────────────────────────────────
async function loadLogs() {
  const tbody = document.getElementById('history-tbody');
  const footer = document.getElementById('history-footer');
  if (!tbody) return;

  // Show loading
  tbody.innerHTML = `<tr class="loading-row"><td colspan="5"><div class="loader-ring"></div><span>불러오는 중...</span></td></tr>`;

  try {
    const extFilter = document.getElementById('log-filter-ext')?.value || '';
    const dateFilter = document.getElementById('log-filter-date')?.value || '';
    const logs = await api.invoke('user-get-logs', { extFilter, dateFilter });

    if (!logs || logs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:40px; color:#8892b0;">📭 이용 내역이 없습니다</td></tr>`;
      if (footer) footer.style.display = 'none';
      return;
    }

    // Update total AI uses stat
    const totalEl = document.getElementById('stat-total-uses');
    if (totalEl) totalEl.textContent = logs.length.toLocaleString() + '회';

    // Render rows
    tbody.innerHTML = logs.map(log => `
      <tr>
        <td>${formatDateTime(log.created_at)}</td>
        <td><span class="ext-badge">${escHtml(log.extension_name || '-')}</span></td>
        <td>${escHtml(log.action || '-')}</td>
        <td class="token-consumed">−${(log.tokens_consumed || 0).toLocaleString()} 🪙</td>
        <td style="color:#8892b0; max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escHtml(log.details || '')}">
          ${escHtml(log.details || '-')}
        </td>
      </tr>
    `).join('');

    if (footer) {
      footer.style.display = 'block';
      document.getElementById('history-count').textContent = logs.length.toLocaleString() + '건';
    }

  } catch (e) {
    console.error('[UserPanel] Failed to load logs:', e);
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:40px; color:#ff5252;">❌ 내역을 불러오지 못했습니다: ${e.message}</td></tr>`;
  }
}

// ─── Purchase ───────────────────────────────────────────
const PLAN_LABELS = {
  starter: '스타터 플랜 — $9/월 (50,000 토큰)',
  pro: '프로 플랜 — $29/월 (200,000 토큰)',
  enterprise: '엔터프라이즈 플랜 — $99/월 (1,000,000 토큰)',
  topup_10k: '10,000 토큰 충전 — $2',
  topup_50k: '50,000 토큰 충전 — $8',
  topup_100k: '100,000 토큰 충전 — $14',
  topup_500k: '500,000 토큰 충전 — $59',
};

function openPurchase(planId) {
  const modal = document.getElementById('purchase-modal');
  const planEl = document.getElementById('modal-selected-plan');
  if (planEl) planEl.textContent = '선택: ' + (PLAN_LABELS[planId] || planId);
  if (modal) modal.classList.remove('hidden');
}

function closePurchaseModal() {
  const modal = document.getElementById('purchase-modal');
  if (modal) modal.classList.add('hidden');
}

function notifyMe() {
  closePurchaseModal();
  showToast('✅ 오픈 알림 신청이 완료되었습니다!');
}

// ─── Logout ────────────────────────────────────────────
function handleLogout() {
  if (confirm('로그아웃 하시겠습니까?')) {
    try { api.send('auth-logout'); } catch(e) {}
    // Fallback: close window / navigate back
    try { window.close(); } catch(e) {}
  }
}

// ─── Helpers ────────────────────────────────────────────
function formatDate(isoStr) {
  if (!isoStr) return '-';
  const d = new Date(isoStr);
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(isoStr) {
  if (!isoStr) return '-';
  const d = new Date(isoStr);
  return d.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })
    + ' ' + d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

let _toastTimer = null;
function showToast(msg) {
  const t = document.getElementById('up-toast');
  const m = document.getElementById('up-toast-msg');
  if (!t || !m) return;
  m.textContent = msg;
  t.classList.remove('hidden');
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.add('hidden'), 3000);
}

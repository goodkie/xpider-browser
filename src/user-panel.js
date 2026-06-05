// user-panel.js - Logic & Core Integrations for XPIDER Premium Account Center
let currentProfile = null;

// ─── Plan Token Map ─────────────────────────────────────
const PLAN_TOKENS = {
  free:       600,
  starter:    6000,
  pro:        12000,
  enterprise: 30000,
  admin:      99999
};
// Helper: get max tokens for current profile's plan
function getPlanMaxTokens(plan) {
  return PLAN_TOKENS[plan] || PLAN_TOKENS.free;
}

// Electron API bridge
const api = window.electronAPI || {
  invoke: async (channel, args) => {
    // Web Browser Fallback - Direct Supabase simulation if needed
    console.log(`[Browser Simulation] Invoke channel: ${channel}`, args);
    if (channel === 'user-get-profile') {
      const email = localStorage.getItem('xpider-sim-email') || 'buyer@enterprise.com';
      return {
        username: email.split('@')[0],
        email: email,
        plan: localStorage.getItem('xpider-sim-plan') || 'pro',
        tokens_remaining: parseInt(localStorage.getItem('xpider-sim-tokens') || '2000'),
        created_at: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
        last_login: new Date().toISOString()
      };
    }
    if (channel === 'user-get-logs') {
      return [
        { created_at: new Date(Date.now() - 50000).toISOString(), extension_name: 'AI Crawler', action: 'Local Crawl', tokens_consumed: 30, details: 'Mined 12 target local businesses' },
        { created_at: new Date(Date.now() - 3600000).toISOString(), extension_name: 'VPN', action: 'IP Masking', tokens_consumed: 3, details: 'Proxy tunnel active for 1 minute' },
        { created_at: new Date(Date.now() - 7200000).toISOString(), extension_name: 'Email Extractor', action: 'Lead Scrape', tokens_consumed: 15, details: 'Extracted 3 B2B prospect emails' }
      ];
    }
    return {};
  },
  send: (channel, args) => {
    console.log(`[Browser Simulation] Send channel: ${channel}`, args);
  }
};

// ─── Init ───────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  await loadProfile();
  await loadLogs();

  // Initialize Tilt Animations safely
  if (typeof VanillaTilt !== 'undefined') {
    VanillaTilt.init(document.querySelectorAll("[data-tilt]"), {
      max: 5,
      speed: 400,
      glare: true,
      "max-glare": 0.25,
    });
  }

  // ─── Real-time Token Refresh (Every 30 Seconds) ────────────────
  // Queries local cache (Fast IPC response)
  setInterval(async () => {
    try {
      const remaining = await api.invoke('xpider-token-get-remaining');
      if (remaining !== undefined && remaining !== null) {
        const tokenDisplay = document.getElementById('stat-tokens');
        if (tokenDisplay) tokenDisplay.textContent = remaining.toLocaleString() + ' Tokens';

        const maxTokens = getPlanMaxTokens(currentProfile?.plan || 'free');
        const pct = Math.min(100, Math.round((remaining / maxTokens) * 100));
        const fill    = document.getElementById('token-progress');
        const pctLabel = document.getElementById('token-pct');
        if (fill) fill.style.width = pct + '%';
        if (pctLabel) pctLabel.textContent = `${pct}% Left (${remaining.toLocaleString()} / ${maxTokens.toLocaleString()})`;

        // Sync local profile data state
        if (currentProfile) currentProfile.tokens_remaining = remaining;
      }
    } catch (e) { /* Ignore when panel closes */ }
  }, 30000);
});

// ─── Load Profile ───────────────────────────────────────
async function loadProfile() {
  try {
    const profile = await api.invoke('user-get-profile');
    if (!profile) {
      showToast('❌ Failed to load profile information');
      return;
    }
    currentProfile = profile;
    renderProfile(profile);
  } catch (e) {
    console.error('[UserPanel] Failed to load profile:', e);
    showToast('❌ Profile loading error: ' + e.message);
  }
}

// ─── Render Profile ──────────────────────────────────────
function renderProfile(profile) {
  const name = profile.username || profile.email?.split('@')[0] || 'User';

  // Map Header Avatar and Username
  const avatar = document.getElementById('user-avatar');
  const headerName = document.getElementById('header-username');
  if (avatar) avatar.textContent = name.charAt(0).toUpperCase();
  if (headerName) headerName.textContent = name;

  // Welcome banner text mapping (No wave emoji 👋 as requested)
  const title = document.getElementById('welcome-title');
  const sub = document.getElementById('welcome-sub');
  if (title) title.innerHTML = `<span>Welcome, ${name}!</span>`;
  if (sub) sub.textContent = `${profile.email} · Premium Command Center`;

  // Active Plan Badge Mapping
  const planName = document.getElementById('plan-name');
  if (planName) {
    const planLabels = { free: 'Free Plan', starter: 'Starter Plan', pro: 'Business Pro', enterprise: 'Enterprise', admin: 'Admin Suite' };
    planName.textContent = planLabels[profile.plan] || profile.plan || 'Free Plan';
  }

  // Tokens Remaining Gauge bar refresh
  const tokens = profile.tokens_remaining ?? 0;
  const tokenDisplay = document.getElementById('stat-tokens');
  if (tokenDisplay) tokenDisplay.textContent = tokens.toLocaleString() + ' Tokens';

  const maxTokens = getPlanMaxTokens(profile.plan || 'free');
  const pct = Math.min(100, Math.round((tokens / maxTokens) * 100));
  const fill = document.getElementById('token-progress');
  const pctLabel = document.getElementById('token-pct');
  if (fill) fill.style.width = pct + '%';
  if (pctLabel) pctLabel.textContent = `${pct}% Left (${tokens.toLocaleString()} / ${maxTokens.toLocaleString()})`;

  // Map Registration Date
  const joined = document.getElementById('stat-joined');
  if (joined && profile.created_at) {
    joined.textContent = formatDate(profile.created_at);
  }

  // Map Last Login Time
  const lastLogin = document.getElementById('stat-last-login');
  if (lastLogin && profile.last_login) {
    lastLogin.textContent = formatDateTime(profile.last_login);
  } else if (lastLogin) {
    lastLogin.textContent = 'Just Now';
  }

  // 어드민 전용 Command Center 제어
  const adminPanel = document.getElementById('admin-panel');
  if (adminPanel) {
    if (profile.plan === 'admin') {
      adminPanel.classList.remove('hidden');
    } else {
      adminPanel.classList.add('hidden');
    }
  }
}

// ─── Load Logs ──────────────────────────────────────────
async function loadLogs() {
  const tbody = document.getElementById('history-tbody');
  const footer = document.getElementById('history-footer');
  if (!tbody) return;

  // Loading Placeholder
  tbody.innerHTML = `<tr class="loading-row"><td colspan="5"><div class="loader-ring"></div><span>Querying and auditing real-time transaction logs...</span></td></tr>`;

  try {
    const extFilter = document.getElementById('log-filter-ext')?.value || '';
    const dateFilter = document.getElementById('log-filter-date')?.value || '';
    const logs = await api.invoke('user-get-logs', { extFilter, dateFilter });

    if (!logs || logs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:50px; color:var(--text-dim);">📭 No active module execution history found.</td></tr>`;
      if (footer) footer.style.display = 'none';
      return;
    }

    // Cumulative uses count update
    const totalEl = document.getElementById('stat-total-uses');
    if (totalEl) totalEl.textContent = logs.length.toLocaleString() + ' Times';

    // Render Logs Table
    tbody.innerHTML = logs.map(log => `
      <tr>
        <td>${formatDateTime(log.created_at)}</td>
        <td><span class="ext-badge">${escHtml(log.extension_name || '-')}</span></td>
        <td style="font-weight:600; color:#fff;">${escHtml(log.action || '-')}</td>
        <td class="token-consumed">−${(log.tokens_consumed || 0).toLocaleString()} T</td>
        <td style="color:var(--text-muted); max-width:260px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escHtml(log.details || '')}">
          ${escHtml(log.details || '-')}
        </td>
      </tr>
    `).join('');

    if (footer) {
      footer.style.display = 'block';
      document.getElementById('history-count').textContent = logs.length.toLocaleString();
    }

  } catch (e) {
    console.error('[UserPanel] Failed to load logs:', e);
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:50px; color:var(--color-pink);">❌ Error loading transaction logs: ${e.message}</td></tr>`;
  }
}


// ─── 7 Premium Engine Specifications Data ──────────────────────
const MODULE_DATA = [
  {
    tag: "AI EXTRACTION",
    title: "Local Business Crawler Pro",
    desc: "Revolutionizes traditional manual leads hunting. Targets 10 global directories and search pipelines (including Google and Bing) in a single click, extracting verified business titles, websites, contact numbers, and social media linkages into structured files.",
    screenshot: "screenshot/Local Business.JPG",
    mockup: "mockup-t/local_business_crawler2.png",
    specs: [
      { name: "4-Step Deep Scan", desc: "Crawls domain hierarchies recursively to discover contact info nested deep inside brand pages." },
      { name: "Auto Email Extraction", desc: "Applies high-accuracy parsing algorithms to aggregate and prioritize active domain emails." },
      { name: "Auto CAPTCHA Bypass", desc: "Utilizes specialized security tokens to smoothly bypass anti-bot mechanisms and crawler gates." }
    ]
  },
  {
    tag: "GOOGLE MAPS",
    title: "GMaps Business Finder",
    desc: "Offline brick-and-mortar storefronts represent a massive pool of B2B outreach prospects. This module integrates seamlessly with the Google Maps architecture, extracting every localized business profile (rating, feedback count, phone, domains, and email channels) within precise spatial coordinates.",
    screenshot: "screenshot/GMaps.png",
    mockup: "mockup-t/gmaps_business_finder2.png",
    specs: [
      { name: "Location-based Search", desc: "Coordinates with geospatial range filters to harvest business entries from designated regions." },
      { name: "Rating Filter", desc: "Leverages rating scores and feedback thresholds to organize and prioritize hot business prospects." },
      { name: "Instant CSV Export", desc: "Saves gathered datasets on-the-fly into spreadsheet-compliant CSV structures in real-time." }
    ]
  },
  {
    tag: "MS ECOSYSTEM",
    title: "Bing Maps Finder",
    desc: "Directly harvests structural local listings from Microsoft's Bing Maps engine. Designed to work in tandem with Google Maps databases, conducting automated cross-validation queries to scrub duplicates and generate premium, validated target accounts lists.",
    screenshot: "screenshot/Bing Maps.png",
    mockup: "mockup-t/bing_maps_finder2.png",
    specs: [
      { name: "Cross Validation System", desc: "Validates geographical address entries across both mapping databases to ensure zero invalid targets." },
      { name: "Auto Contact Discovery", desc: "Proactively crawls localized domains to fetch valid contact mail channels." },
      { name: "Sophisticated JSON Export", desc: "Compiles all target assets into raw JSON formats, optimal for developer pipelines and custom CRM loads." }
    ]
  },
  {
    tag: "SECURE & ANONYMOUS",
    title: "XPIDER VPN",
    desc: "Continuous massive scraping risks domain blacklist triggers and IP restrictions. XPIDER VPN deploys military-grade anonymous tunnel routing, hiding your raw outbound address behind globally relaying premium proxy nodes to secure nonstop data harvesting pipelines.",
    screenshot: "screenshot/VPN.JPG",
    mockup: "mockup-t/xpider_vpn2.png",
    specs: [
      { name: "IP Encryption Tunnel", desc: "Fully encrypts both scraper query headers and metadata packets to completely bypass anti-bot sniffers." },
      { name: "High-speed Proxy Nodes", desc: "Leverages a dedicated high-bandwidth backbone network, ensuring seamless multi-thread crawling speed." },
      { name: "Global Server Switching", desc: "Supports premium proxy nodes spanning Asia, Europe, and the US to access regionally restricted portals." }
    ]
  },
  {
    tag: "REAL-TIME LEAD CAPTURE",
    title: "Email Extractor",
    desc: "Eliminates the tedious manual copy-pasting of prospect information. Operates silently in the browser background, parsing visible mail-format string matrices inside target web panels as you traverse various tabs during active browsing sessions.",
    screenshot: "screenshot/EMAIL.png",
    mockup: "mockup-t/email2.png",
    specs: [
      { name: "Real-time Detection Engine", desc: "Monitors and captures hidden contact tags or mail patterns in webpage layouts dynamically." },
      { name: "Smart Lead Filter", desc: "Filters out temporary trash, placeholder mail extensions, and dead inactive accounts automatically." },
      { name: "Cross-Tab Multi Thread", desc: "Watches multiple active tabs concurrently to maximize passive extraction efficiency." }
    ]
  },
  {
    tag: "AI AUTOMATION",
    title: "AutoForm Sender Pro",
    desc: "One of the most potent outreach channels is direct submission to a brand's 'Contact Form'. Features an intelligent AI field parser to automatically decode, fill, and submit business proposals to inquiry forms in milliseconds.",
    screenshot: "screenshot/sender.JPG",
    mockup: "mockup-t/autoform_sender2.png",
    specs: [
      { name: "AI Field Detection", desc: "Identifies fields (e.g., Name, Mail, Proposal) accurately despite structural layout shifts or multi-language changes." },
      { name: "Bulk Campaign Scheduling", desc: "Loads target B2B domains and dispatches pre-composed templates with custom transmit delay intervals." },
      { name: "Advanced Report Manager", desc: "Tracks submit success metrics, Captcha block rates, and delivery confirmations in a sleek statistics console." }
    ]
  },
  {
    tag: "BULK EMAIL OUTREACH",
    title: "SendForce Mailer Pro",
    desc: "Deploy highly personalized cold emails to vast B2B prospect lists effortlessly. Deploys custom SMTP relay rotation and smart rate limits to ensure your marketing copy lands directly in the recipient's primary inbox.",
    screenshot: "screenshot/Send Force.JPG",
    mockup: "mockup-t/sendforce_mailer2.png",
    specs: [
      { name: "Optimized Delivery Engine", desc: "Injects custom headers and parses templates cleanly to bypass standard incoming spam filters." },
      { name: "Smart Delivery Scheduler", desc: "Implements strict interval delay logic between bulk outbox dispatches to avoid server rate caps." },
      { name: "Technical Settings Panel", desc: "Full control over SPF/DKIM registration checks, custom domain configuration, and SMTP setups." }
    ]
  }
];

// ─── Pricing Policy Data ───────────────────────────────────
let isYearlyBilling = false;
const PRICING_DATA = {
  starter: { monthly: "$59", yearly: "$47" },
  business: { monthly: "$99", yearly: "$79" },
  enterprise: { monthly: "$199", yearly: "$159" }
};

function toggleBilling() {
  const toggle = document.getElementById('billing-toggle');
  const labelMonthly = document.getElementById('label-monthly');
  const labelYearly = document.getElementById('label-yearly');
  
  isYearlyBilling = !isYearlyBilling;

  if (isYearlyBilling) {
    toggle.classList.add('yearly');
    labelMonthly.classList.remove('active');
    labelYearly.classList.add('active');
    updatePricingText('yearly');
  } else {
    toggle.classList.remove('yearly');
    labelMonthly.classList.add('active');
    labelYearly.classList.remove('active');
    updatePricingText('monthly');
  }
}

function updatePricingText(type) {
  const pStarter = document.getElementById('price-starter');
  const pBusiness = document.getElementById('price-business');
  const pEnterprise = document.getElementById('price-enterprise');

  // Text Animation
  [pStarter, pBusiness, pEnterprise].forEach(el => {
    if (el) {
      el.style.opacity = '0';
      el.style.transform = 'translateY(-6px) scale(0.95)';
    }
  });

  setTimeout(() => {
    if (pStarter) pStarter.textContent = PRICING_DATA.starter[type];
    if (pBusiness) pBusiness.textContent = PRICING_DATA.business[type];
    if (pEnterprise) pEnterprise.textContent = PRICING_DATA.enterprise[type];

    [pStarter, pBusiness, pEnterprise].forEach(el => {
      if (el) {
        el.style.opacity = '1';
        el.style.transform = 'translateY(0) scale(1)';
      }
    });
  }, 200);
}

// ─── 3D Spec Overlay Modal ───────────────────────────────────────
function openModuleModal(index) {
  const data = MODULE_DATA[index];
  const modal = document.getElementById('module-modal');
  if (!modal || !data) return;
  
  document.getElementById('modal-module-tag').textContent = data.tag;
  document.getElementById('modal-module-title').textContent = data.title;
  document.getElementById('modal-module-desc').textContent = data.desc;
  
  // Media Mapping
  document.getElementById('modal-main-img').src = data.screenshot;
  document.getElementById('modal-packshot-overlay').src = data.mockup;
  
  // Specs Populate
  const specGrid = document.getElementById('modal-spec-grid');
  if (specGrid) {
    specGrid.innerHTML = '';
    data.specs.forEach(spec => {
      const item = document.createElement('div');
      item.className = 'modal-feature-card';
      item.innerHTML = `
        <div class="modal-feature-icon-box">
          <i class="fa-solid fa-fire"></i>
        </div>
        <div class="modal-feature-info">
          <span class="modal-feature-name">${spec.name}</span>
          <span class="modal-feature-desc">${spec.desc}</span>
        </div>
      `;
      specGrid.appendChild(item);
    });
  }

  modal.classList.add('active');
  document.body.style.overflow = 'hidden'; // Parent scroll block
}

function closeModuleModal(event) {
  const modal = document.getElementById('module-modal');
  if (modal) modal.classList.remove('active');
  document.body.style.overflow = '';
}

// ─── FAQ Accordion Toggle ────────────────────────────────────────
function toggleFaq(element) {
  const allFaqItems = document.querySelectorAll('.faq-item');
  
  allFaqItems.forEach(item => {
    if (item !== element) {
      item.classList.remove('active');
      const answer = item.querySelector('.faq-answer');
      if (answer) answer.style.maxHeight = null;
    }
  });

  element.classList.toggle('active');
  const answer = element.querySelector('.faq-answer');
  
  if (answer) {
    if (element.classList.contains('active')) {
      answer.style.maxHeight = answer.scrollHeight + 15 + "px";
    } else {
      answer.style.maxHeight = null;
    }
  }
}

// ─── Pricing Plan Config ────────────────────────────────────
const PLAN_CONFIG = {
  starter: {
    label: 'Starter Plan',
    monthly: { price: '$59', period: 'month', tokens: '6,000' },
    yearly:  { price: '$47', period: 'month', tokens: '6,000' }
  },
  pro: {
    label: 'Business Pro Plan',
    monthly: { price: '$99', period: 'month', tokens: '12,000' },
    yearly:  { price: '$79', period: 'month', tokens: '12,000' }
  },
  enterprise: {
    label: 'Enterprise Plan',
    monthly: { price: '$199', period: 'month', tokens: '30,000' },
    yearly:  { price: '$159', period: 'month', tokens: '30,000' }
  }
};

let _currentCheckoutPlan = 'starter';
let _modalIsYearly = false;

function openPurchase(planId) {
  _currentCheckoutPlan = planId;
  _modalIsYearly = false;
  const modal = document.getElementById('purchase-modal');
  if (modal) modal.classList.add('active');
  _updateModalPlanInfo();
}

function _updateModalPlanInfo() {
  const cfg = PLAN_CONFIG[_currentCheckoutPlan];
  if (!cfg) return;
  const billing = _modalIsYearly ? cfg.yearly : cfg.monthly;

  const nameEl   = document.getElementById('stripe-plan-name');
  const priceEl  = document.getElementById('stripe-plan-price');
  const tokenEl  = document.getElementById('stripe-plan-tokens');
  const mLabel   = document.getElementById('modal-billing-monthly');
  const yLabel   = document.getElementById('modal-billing-yearly');
  const toggle   = document.getElementById('modal-billing-toggle');

  if (nameEl)  nameEl.textContent  = cfg.label;
  if (priceEl) priceEl.textContent = `${billing.price} / ${billing.period}`;
  if (tokenEl) tokenEl.textContent = `${billing.tokens} tokens per month`;

  if (_modalIsYearly) {
    toggle?.classList.add('yearly');
    mLabel?.classList.remove('active-label');
    yLabel?.classList.add('active-label');
    mLabel && (mLabel.style.fontWeight = '400'); mLabel && (mLabel.style.color = 'var(--text-muted)');
    yLabel && (yLabel.style.fontWeight = '700'); yLabel && (yLabel.style.color = '#fff');
  } else {
    toggle?.classList.remove('yearly');
    mLabel?.classList.add('active-label');
    yLabel?.classList.remove('active-label');
    mLabel && (mLabel.style.fontWeight = '700'); mLabel && (mLabel.style.color = '#fff');
    yLabel && (yLabel.style.fontWeight = '400'); yLabel && (yLabel.style.color = 'var(--text-muted)');
  }
}

function toggleModalBilling() {
  _modalIsYearly = !_modalIsYearly;
  _updateModalPlanInfo();
}

function closePurchaseModal() {
  const modal = document.getElementById('purchase-modal');
  if (modal) modal.classList.remove('active');
}

// ─── Stripe Checkout ─────────────────────────────────────────
async function startStripeCheckout() {
  const btn = document.getElementById('btn-stripe-checkout');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Redirecting...</span>';
  }

  try {
    const billingCycle = _modalIsYearly ? 'yearly' : 'monthly';
    const result = await api.invoke('stripe-create-checkout', {
      planId:       _currentCheckoutPlan,
      billingCycle: billingCycle,
      userId:       currentProfile?.id || '',
      email:        currentProfile?.email || ''
    });

    if (result?.url) {
      // Electron: external browser opens Stripe
      api.send('open-external-url', result.url);
      closePurchaseModal();
      showToast('✅ Stripe checkout opened in your browser');
    } else if (result?.error) {
      showToast('❌ ' + result.error);
    } else {
      showToast('❌ Failed to create checkout session');
    }
  } catch (e) {
    showToast('❌ Checkout error: ' + e.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-brands fa-stripe-s"></i> <span>Pay with Stripe</span> <i class="fa-solid fa-arrow-right"></i>';
    }
  }
}

// ─── Sign Out ────────────────────────────────────────────────
function handleLogout() {
  if (confirm('Are you sure you want to sign out?')) {
    // 다음 구동 시 자동 로그인이 수행되지 않도록 저장된 비밀번호 정보를 철저히 제거
    localStorage.removeItem('xpider-saved-pw');
    
    // Chromium LevelDB 디스크 쓰기 대기 및 안전 리로드 대기 (150ms)
    setTimeout(() => {
      try { api.send('auth-logout'); } catch(e) {}
      try { window.close(); } catch(e) {}
    }, 150);
  }
}

// ─── Date Formatter ───────────────────────────────────────────
function formatDate(isoStr) {
  if (!isoStr) return '-';
  const d = new Date(isoStr);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// Date/Time Formatter (e.g. May 26, 10:30 AM)
function formatDateTime(isoStr) {
  if (!isoStr) return '-';
  const d = new Date(isoStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    + ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
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

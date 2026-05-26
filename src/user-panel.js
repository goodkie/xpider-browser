// ─── Supabase Direct 연결 설정 ────────────────────────────────
const SUPABASE_URL = 'https://gfgudbxpkpfevsuobdmr.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdmZ3VkYnhwa3BmZXZzdW9iZG1yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njc5NzM3NiwiZXhwIjoyMDkyMzczMzc2fQ.ifTar2cFr_PwTPYc4dv4AegXC_g5sSn3zm9kHUwQJmo';

// 브라우저 테스트용: 조회할 유저 이메일 지정 (URL ?email=xxx 또는 아래 직접 입력)
const urlParams = new URLSearchParams(window.location.search);
const TEST_EMAIL = urlParams.get('email') || '';

let _sb = null;
function getSb() {
    if (!_sb && window.supabase) {
        _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    }
    return _sb;
}

// Supabase 직접 호출 함수
async function sbInvoke(channel, data = {}) {
    const sb = getSb();
    if (!sb) return null;

    if (channel === 'user-get-profile') {
        if (!TEST_EMAIL) return null;
        const { data: row } = await sb.from('profiles').select('*').eq('email', TEST_EMAIL).single();
        return row || null;
    }
    if (channel === 'user-get-logs') {
        if (!TEST_EMAIL) return [];
        // 먼저 해당 유저 id 조회
        const { data: profile } = await sb.from('profiles').select('id').eq('email', TEST_EMAIL).single();
        if (!profile) return [];
        let q = sb.from('user_logs').select('*').eq('user_id', profile.id)
            .order('created_at', { ascending: false }).limit(200);
        if (data.extFilter) q = q.ilike('extension_name', '%' + data.extFilter + '%');
        if (data.dateFilter) {
            q = q.gte('created_at', data.dateFilter + 'T00:00:00Z')
                 .lte('created_at', data.dateFilter + 'T23:59:59Z');
        }
        const { data: rows } = await q;
        return rows || [];
    }
    return null;
}

// electronAPI: Electron이면 IPC, 브라우저면 Supabase 직접
const api = (typeof window.electronAPI !== 'undefined')
    ? window.electronAPI
    : { invoke: sbInvoke, send: () => {} };

// 브라우저 모드일 때 이메일 입력 UI 표시
if (typeof window.electronAPI === 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        if (!TEST_EMAIL) {
            showEmailPrompt();
        }
    });
}

function showEmailPrompt() {
    const banner = document.createElement('div');
    banner.id = 'email-prompt-banner';
    banner.style.cssText = `
        position:fixed; top:0; left:0; right:0; z-index:5000;
        background:linear-gradient(135deg,rgba(10,6,36,0.96),rgba(6,182,212,0.95));
        padding:16px 24px; display:flex; align-items:center; justify-content:center; gap:16px;
        backdrop-filter:blur(20px); box-shadow:0 4px 24px rgba(0,0,0,0.5);
        border-bottom: 1px solid rgba(6,182,212,0.3);
    `;
    banner.innerHTML = `
        <span style="font-size:20px;">🔍</span>
        <span style="font-weight:700;color:#fff;font-size:14px;">테스트할 유저 이메일을 입력하세요:</span>
        <input id="test-email-input" type="email" placeholder="user@example.com"
            style="width:260px;padding:8px 14px;border-radius:8px;border:1px solid rgba(6,182,212,0.3);
            background:rgba(255,255,255,0.05);color:#fff;font-size:14px;outline:none;"
        />
        <button onclick="applyTestEmail()"
            style="padding:8px 24px;border-radius:8px;border:none;cursor:pointer;
            background:linear-gradient(135deg,#06b6d4,#3b82f6);color:#fff;font-weight:800;font-size:14px;
            box-shadow:0 0 15px rgba(6,182,212,0.4);">
            조회하기
        </button>
        <span style="font-size:12px;color:rgba(255,255,255,0.7);">
            또는 URL에 ?email=xxx 추가
        </span>
    `;
    document.body.prepend(banner);
    document.body.style.paddingTop = '64px';
}

function applyTestEmail() {
    const email = document.getElementById('test-email-input')?.value?.trim();
    if (!email) return;
    const url = new URL(window.location.href);
    url.searchParams.set('email', email);
    window.location.href = url.toString();
}


// ─── State ─────────────────────────────────────────────
let currentProfile = null;
const MAX_TOKENS = 1000000; // Reference max for progress bar

// ─── Init ───────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  await loadProfile();
  await loadLogs();
  
  // 3D 틸트 카드 초기화
  if (typeof VanillaTilt !== 'undefined') {
    VanillaTilt.init(document.querySelectorAll("[data-tilt]"), {
      max: 6,
      speed: 400,
      glare: true,
      "max-glare": 0.1
    });
  }

  // ─── 실시간 토큰 잔액 갱신 (30초 간격) ────────────────
  // xpider-token-get-remaining → 로컬 캐시 우선 반환 (DB 미조회)
  setInterval(async () => {
    try {
      const remaining = await api.invoke('xpider-token-get-remaining');
      if (remaining !== undefined && remaining !== null) {
        const tokenDisplay = document.getElementById('stat-tokens');
        if (tokenDisplay) tokenDisplay.textContent = remaining.toLocaleString() + ' 🪙';

        const pct = Math.min(100, Math.round((remaining / MAX_TOKENS) * 100));
        const fill    = document.getElementById('token-progress');
        const pctLabel = document.getElementById('token-pct');
        if (fill) fill.style.width = pct + '%';
        if (pctLabel) pctLabel.textContent = `${pct}% 남음 (${remaining.toLocaleString()} / ${MAX_TOKENS.toLocaleString()})`;

        // currentProfile 동기화
        if (currentProfile) currentProfile.tokens_remaining = remaining;
      }
    } catch (e) { /* 패널 닫힘 등 무시 */ }
  }, 30000);
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

  // Header 아바타 및 이름 매핑
  const avatar = document.getElementById('user-avatar');
  const headerName = document.getElementById('header-username');
  if (avatar) avatar.textContent = name.charAt(0).toUpperCase();
  if (headerName) headerName.textContent = name;

  // 히어로 웰컴 배너 문구 매핑
  const title = document.getElementById('welcome-title');
  const sub = document.getElementById('welcome-sub');
  if (title) title.innerHTML = `<span>안녕하세요, ${name}님! 👋</span>`;
  if (sub) sub.textContent = `${profile.email} · Premium Command Center`;

  // 현재 플랜 뱃지 매핑
  const planName = document.getElementById('plan-name');
  if (planName) {
    const planLabels = { free: 'Free Plan', starter: 'Starter Plan', pro: 'Business Pro', enterprise: 'Enterprise', admin: 'Admin Suite' };
    planName.textContent = planLabels[profile.plan] || profile.plan || 'Free Plan';
  }

  // 잔여 토큰 표시 및 네온 게이지 바 갱신
  const tokens = profile.tokens_remaining ?? 0;
  const tokenDisplay = document.getElementById('stat-tokens');
  if (tokenDisplay) tokenDisplay.textContent = tokens.toLocaleString() + ' 🪙';

  const pct = Math.min(100, Math.round((tokens / MAX_TOKENS) * 100));
  const fill = document.getElementById('token-progress');
  const pctLabel = document.getElementById('token-pct');
  if (fill) fill.style.width = pct + '%';
  if (pctLabel) pctLabel.textContent = `${pct}% 남음 (${tokens.toLocaleString()} / ${MAX_TOKENS.toLocaleString()})`;

  // 가입일 매핑
  const joined = document.getElementById('stat-joined');
  if (joined && profile.created_at) {
    joined.textContent = formatDate(profile.created_at);
  }

  // 마지막 로그인 매핑
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

  // 로딩 플레이스홀더
  tbody.innerHTML = `<tr class="loading-row"><td colspan="5"><div class="loader-ring"></div><span>이용 로그를 실시간 분석 중입니다...</span></td></tr>`;

  try {
    const extFilter = document.getElementById('log-filter-ext')?.value || '';
    const dateFilter = document.getElementById('log-filter-date')?.value || '';
    const logs = await api.invoke('user-get-logs', { extFilter, dateFilter });

    if (!logs || logs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:50px; color:var(--text-dim);">📭 활성화된 모듈 사용 이력이 없습니다.</td></tr>`;
      if (footer) footer.style.display = 'none';
      return;
    }

    // 누적 AI 사용 횟수 스탯 카드 업데이트
    const totalEl = document.getElementById('stat-total-uses');
    if (totalEl) totalEl.textContent = logs.length.toLocaleString() + ' 회';

    // 로그 목록 테이블 생성
    tbody.innerHTML = logs.map(log => `
      <tr>
        <td>${formatDateTime(log.created_at)}</td>
        <td><span class="ext-badge">${escHtml(log.extension_name || '-')}</span></td>
        <td style="font-weight:600; color:#fff;">${escHtml(log.action || '-')}</td>
        <td class="token-consumed">−${(log.tokens_consumed || 0).toLocaleString()} 🪙</td>
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
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:50px; color:var(--color-pink);">❌ 내역 로딩 실패: ${e.message}</td></tr>`;
  }
}


// ─── 7대 핵심 엔진 모듈 세부 데이터 명세 (sales.html 탑재 스펙 보존) ──────────────────────
const MODULE_DATA = [
  {
    tag: "AI EXTRACTION",
    title: "Local Business Crawler Pro",
    desc: "여러 검색 엔진을 일일이 접속하여 정보를 직접 긁어가던 지루한 시대를 혁신합니다. 구글, 네이버, 빙 등 글로벌 핵심 검색 채널 총 10곳을 대상으로 단 한번의 키워드 입력으로 타겟 사업자명, 전화번호, 이메일, 브랜드 SNS 연락망을 일괄 심층 추출 및 정렬하는 핵심 테크 드라이버 모듈입니다.",
    screenshot: "screenshot/Local Business.JPG",
    mockup: "mockup-t/local_business_crawler2.png",
    specs: [
      { name: "4-Step Deep Scan", desc: "도메인 기업 홈 내부의 연락망 뎁스까지 자동으로 탐색하는 인텔리전트 심층 크롤링 제공" },
      { name: "Auto Email Extraction", desc: "정밀 파싱 알고리즘을 활용해 사이트 내 활성화된 이메일 계정을 추려 정렬합니다." },
      { name: "Auto CAPTCHA Bypass", desc: "보안 캡차 회피 장치 작동으로 수집 중 포털 측 차단 발생을 유연하게 우회합니다." }
    ]
  },
  {
    tag: "GOOGLE MAPS",
    title: "GMaps Business Finder",
    desc: "지도 상에 위치한 수많은 로컬 오프라인 비즈니스는 B2B 타겟 개척의 핵심입니다. 본 모듈은 구글 지도 데이터를 대상으로 특정 검색 타겟 반경 내 등재된 모든 오프라인 리드(상점명, 브랜드 평점, 전화번호, 이메일 주소)를 실시간 크롤링하여 영업 DB화해줍니다.",
    screenshot: "screenshot/GMaps.png",
    mockup: "mockup-t/gmaps_business_finder2.png",
    specs: [
      { name: "Location-based Search", desc: "구/시 좌표 연동 필터를 사용해 가장 정확한 대상 지역 내 타겟 매장을 탐색해냅니다." },
      { name: "Rating Filter", desc: "리뷰 수와 브랜드 평점 필터를 활용해 우선순위가 높은 양질의 영업 대상만 1차 소팅합니다." },
      { name: "Instant CSV Export", desc: "크롤링 진행 중인 실시간 상태에서도 한 번의 터치로 엑셀에 호환되는 CSV 저장을 수행합니다." }
    ]
  },
  {
    tag: "MS ECOSYSTEM",
    title: "Bing Maps Finder",
    desc: "마이크로소프트의 지도 생태계 Bing Maps API를 정밀 수집합니다. 특히 타겟 수집의 질을 높이기 위해, 구글 지도 검색 결과와의 동시 교차 검증(Cross-Validation) 분석을 단행하여 허수를 지우고 완전히 일치하는 확실한 B2B 주소록을 필터링해 내는데 보조 역할을 합니다.",
    screenshot: "screenshot/Bing Maps.png",
    mockup: "mockup-t/bing_maps_finder2.png",
    specs: [
      { name: "Cross Validation System", desc: "구글맵과 빙맵의 주소 체계를 교차 분석하여 오류를 제거한 무오류 연락망 리스트 수거" },
      { name: "Auto Contact Discovery", desc: "상점의 홈 도메인을 지능 탐지하여 연락처가 없는 로드샵의 가상 메일 정보까지 완벽 비교 연동" },
      { name: "Sophisticated JSON Export", desc: "서버 데이터 연동 및 CRM 적재에 유용한 원시 타입 JSON 저장 기능 제공" }
    ]
  },
  {
    tag: "SECURE & ANONYMOUS",
    title: "XPIDER VPN",
    desc: "보안 터널링이 없는 대규모 수집은 타겟 웹서버 측의 IP 영구 차단으로 이어집니다. XPIDER VPN은 초고속 정밀 프록시 릴레이를 이용해 내 실제 아이피를 완벽하게 감추고 깨끗한 글로벌 IP 세션으로 스위칭하여 영속적인 데이터 획득 환경을 확보해 줍니다.",
    screenshot: "screenshot/VPN.JPG",
    mockup: "mockup-t/xpider_vpn2.png",
    specs: [
      { name: "IP Encryption Tunnel", desc: "모든 크롤링 트래픽 데이터의 유입/유출 흐름을 암호화하여 타겟 웹서버의 감지를 차단합니다." },
      { name: "High-speed Proxy Nodes", desc: "웹 수집 처리에 최적화된 프록시 백본을 연동하여 전송 렉 없이 엄청난 멀티 크롤링을 수행합니다." },
      { name: "Global Server Switching", desc: "아시아, 유럽, 아메리카 등 여러 국가 대역의 깨끗한 IP 세션을 지원하여 국가 차단 사이트도 정복합니다." }
    ]
  },
  {
    tag: "REAL-TIME LEAD CAPTURE",
    title: "Email Extractor",
    desc: "웹상에서 직접 영업용 메일을 찾기 위해 텍스트를 수작업으로 긁어가던 번거로움을 완전히 잊으세요. 이 모듈은 XPIDER 브라우저의 백그라운드 스레드에서 작동하며, 사용자가 열어둔 탭 내부의 이메일 계정 형태 텍스트 패턴을 실시간 파싱하여 자동으로 저장합니다.",
    screenshot: "screenshot/EMAIL.png",
    mockup: "mockup-t/email2.png",
    specs: [
      { name: "Real-time Detection Engine", desc: "HTML 속에 숨겨진 메일 양식 주소나 가상 태그까지 실시간 모니터링하여 가집계" },
      { name: "Smart Lead Filter", desc: "수집 리스트 내 무효화된 임시 메일이나 휴면 계정은 사전에 골라내는 똑똑한 소팅 알고리즘" },
      { name: "Cross-Tab Multi Thread", desc: "다수의 열려있는 멀티 탭들을 동시에 백그라운드 추적하여 크롤링 효율을 높입니다." }
    ]
  },
  {
    tag: "AI AUTOMATION",
    title: "AutoForm Sender Pro",
    desc: "최적화된 아웃바운드 영업 기법은 바로 기업 사이트의 '문의하기(Contact Form)' 창을 자동으로 두드리는 것입니다. 본 모듈은 각 사이트 문의 폼 입력란의 구조 형식을 AI가 판별 해독하여 이름, 연락처, 제안 메시지를 빈틈없이 자동 기입해 대량 발송합니다.",
    screenshot: "screenshot/sender.JPG",
    mockup: "mockup-t/autoform_sender2.png",
    specs: [
      { name: "AI Field Detection", desc: "문의란 양식의 변화나 다국어 항목(Name, Email, Message)도 정확히 인식하여 채우는 지능형 매핑" },
      { name: "Bulk Campaign Scheduling", desc: "준비된 잠재 타겟 목록을 로드하여 일정한 지연 주기를 가미하며 자동으로 대량 송신하는 자동 스케줄러" },
      { name: "Advanced Report Manager", desc: "송신 성공률, 캡차 차단율 및 전체 발송 결과를 시각적으로 표현해주는 정밀 리포트 대시보드" }
    ]
  },
  {
    tag: "BULK EMAIL OUTREACH",
    title: "SendForce Mailer Pro",
    desc: "수많은 잠재 파트너사에게 한 번에 정밀 제안 이메일을 발송합니다. SendForce Mailer Pro는 포털 측의 일시 차단을 피하는 발송 인터벌 및 SMTP 릴레이 분산 스케줄링을 가동하여 전송 성공률을 극대화 수준으로 보장해 주는 대량 메일러입니다.",
    screenshot: "screenshot/Send Force.JPG",
    mockup: "mockup-t/sendforce_mailer2.png",
    specs: [
      { name: "Optimized Delivery Engine", desc: "스팸 수신 필터링 차단을 유연하게 우회하는 헤더 커스텀 및 템플릿 최적화 연동 제공" },
      { name: "Smart Delivery Scheduler", desc: "메일 서버 과부하를 사전에 예방하기 위해 일정한 간격 지연 발송 로직 실행" },
      { name: "Technical Settings Panel", desc: "전문 메일 인프라 연동을 위한 SMTP 커스텀, SPF/DKIM 등록 테스트 도구 탑재" }
    ]
  }
];

// ─── 빌링 가격 정책 연동 ───────────────────────────────────
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

  // 텍스트 애니메이션 기동
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

// ─── 3D 모듈 상세 팝업 ───────────────────────────────────────
function openModuleModal(index) {
  const data = MODULE_DATA[index];
  const modal = document.getElementById('module-modal');
  if (!modal || !data) return;
  
  document.getElementById('modal-module-tag').textContent = data.tag;
  document.getElementById('modal-module-title').textContent = data.title;
  document.getElementById('modal-module-desc').textContent = data.desc;
  
  // 이미지 매핑
  document.getElementById('modal-main-img').src = data.screenshot;
  document.getElementById('modal-packshot-overlay').src = data.mockup;
  
  // 기능 목록 생성
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
  document.body.style.overflow = 'hidden'; // 부모 스크롤 차단
}

function closeModuleModal(event) {
  const modal = document.getElementById('module-modal');
  if (modal) modal.classList.remove('active');
  document.body.style.overflow = '';
}

// ─── FAQ 아코디언 토글 ────────────────────────────────────────
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

// ─── 요금제 가입 모달 연동 ────────────────────────────────────
const PLAN_LABELS = {
  starter: 'Starter Plan — $59/mo (기본 크롤러 + 구글맵 + 실시간 이메일)',
  pro: 'Business Pro Plan — $99/mo (7대 모듈 + 전용 VPN + AI 자동 발송)',
  enterprise: 'Enterprise Plan — $199/mo (다중 인프라 + 커스텀 개발 + 1:1 기술 지원)'
};

function openPurchase(planId) {
  const modal = document.getElementById('purchase-modal');
  const planEl = document.getElementById('modal-selected-plan');
  if (planEl) planEl.textContent = '선택한 플랜: ' + (PLAN_LABELS[planId] || planId);
  if (modal) modal.classList.add('active');
}

function closePurchaseModal() {
  const modal = document.getElementById('purchase-modal');
  if (modal) modal.classList.remove('active');
}

function notifyMe() {
  closePurchaseModal();
  showToast('📧 B2B 우선 순위 알림 등록이 완료되었습니다!');
}

// ─── 로그아웃 ────────────────────────────────────────────────
function handleLogout() {
  if (confirm('로그아웃 하시겠습니까?')) {
    try { api.send('auth-logout'); } catch(e) {}
    try { window.close(); } catch(e) {}
  }
}

// ─── 헬퍼 함수 ───────────────────────────────────────────────
function formatDate(isoStr) {
  if (!isoStr) return '-';
  const d = new Date(isoStr);
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
}

// 2026-05-26 날짜 정렬 포맷
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

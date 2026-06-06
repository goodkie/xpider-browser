/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  XPIDER 24/7 Monitor Worker — Cloudflare Cron Trigger       ║
 * ║  1분마다 신규 다운로드·구독 감지 → Brevo/Mailgun 알림 발송  ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * 배포: wrangler deploy  (또는 Cloudflare Dashboard에서 직접 붙여넣기)
 * Cron:  * * * * *  (1분마다)
 */

// ── Supabase 연결 ──────────────────────────────────────────────
const SUPABASE_URL         = 'https://gfgudbxpkpfevsuobdmr.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdmZ3VkYnhwa3BmZXZzdW9iZG1yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njc5NzM3NiwiZXhwIjoyMDkyMzczMzc2fQ.ifTar2cFr_PwTPYc4dv4AegXC_g5sSn3zm9kHUwQJmo';
const SUPABASE_ANON_KEY    = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdmZ3VkYnhwa3BmZXZzdW9iZG1yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3OTczNzYsImV4cCI6MjA5MjM3MzM3Nn0.WJkL0PZ2YeqVvMoFUjQ5c-fAvlsMCFEK7GdVXJa4JVA';

// ── Brevo Worker Gateway ────────────────────────────────────────
const BREVO_WORKER_URL = 'https://brevo-key-provider.goodkie-com.workers.dev/';

// ── Mailgun 키 (분할 저장) ──────────────────────────────────────
function getMailgunKey() {
  const p1='5fec900d', p2='af079cce', p3='773ffd12', p4='ccb56522';
  const p5='d638fab7', p6='f05ef5e1';
  return [p1,p2,p3,p4].join('') + '-' + p5 + '-' + p6;
}
const MAILGUN_DOMAIN = 'xpider.pro';

// ══════════════════════════════════════════════════════════════
// 📌 Cloudflare Worker Entry Points
// ══════════════════════════════════════════════════════════════

export default {
  // Cron Trigger: 매 1분마다 자동 실행
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runMonitor(env));
  },

  // HTTP Trigger: 수동 실행 or 헬스체크
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 보안: Bearer 토큰 검증
    const auth = request.headers.get('Authorization') || '';
    const token = auth.replace('Bearer ', '').trim();
    const expectedToken = (env && env.MONITOR_SECRET) || 'xpider-monitor-secret-2024';

    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', time: new Date().toISOString() }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (url.pathname === '/run') {
      if (token !== expectedToken) {
        return new Response('Unauthorized', { status: 401 });
      }
      ctx.waitUntil(runMonitor(env));
      return new Response(JSON.stringify({ status: 'triggered', time: new Date().toISOString() }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response('XPIDER Monitor Worker v1.0', { status: 200 });
  }
};

// ══════════════════════════════════════════════════════════════
// 🔍 핵심 모니터링 로직
// ══════════════════════════════════════════════════════════════

async function runMonitor(env) {
  console.log('[Monitor] 실행 시작:', new Date().toISOString());

  try {
    // 1. 알림 설정 로드 (smtp-config@xpider.pro 프로필)
    const settings = await loadNotifySettings();
    if (!settings) {
      console.log('[Monitor] 알림 설정 없음. 종료.');
      return;
    }
    if (!settings.email) {
      console.log('[Monitor] 알림 이메일 미설정. 종료.');
      return;
    }

    console.log(`[Monitor] 설정: email=${settings.email}, dl=${settings.downloads}, sub=${settings.subscriptions}, provider=${settings.provider}`);

    // 2. 현재 유저·구독 수 조회
    const current = await fetchCurrentCounts();
    if (!current) {
      console.log('[Monitor] 유저 데이터 조회 실패.');
      return;
    }

    console.log(`[Monitor] 현재: downloads=${current.total}, subscriptions=${current.subs}`);

    // 3. 이전 수치 비교 (ip_address 필드에 JSON으로 저장)
    const prev = settings.prevCounts;

    if (!prev) {
      // 최초 실행: 기준값만 저장하고 알림 없이 종료
      console.log('[Monitor] 최초 실행 — 기준값 저장 후 종료.');
      await savePrevCounts(current.total, current.subs);
      return;
    }

    console.log(`[Monitor] 이전: downloads=${prev.downloads}, subscriptions=${prev.subscriptions}`);

    let notified = false;

    // 📥 신규 다운로드 감지
    if (settings.downloads && current.total > prev.downloads) {
      const newCount = current.total - prev.downloads;
      console.log(`[Monitor] 📥 신규 다운로드 ${newCount}건 감지!`);

      const newUsers = current.users.slice(0, Math.min(newCount, 20));
      const html = buildDownloadEmailHtml(newCount, newUsers, current.total);

      await sendEmail(settings, `📥 XPIDER 신규 다운로드 ${newCount}건 발생`, html);
      notified = true;
    }

    // ⭐ 신규 구독 감지
    if (settings.subscriptions && current.subs > prev.subscriptions) {
      const newCount = current.subs - prev.subscriptions;
      console.log(`[Monitor] ⭐ 신규 구독 ${newCount}건 감지!`);

      const paidUsers = current.users
        .filter(u => u.plan && !['free','admin','starter'].includes(u.plan))
        .slice(0, Math.min(newCount, 20));
      const html = buildSubscriptionEmailHtml(newCount, paidUsers, current.subs);

      await sendEmail(settings, `⭐ XPIDER 신규 구독 ${newCount}건 발생`, html);
      notified = true;
    }

    // 4. 이전 수치 업데이트
    await savePrevCounts(current.total, current.subs);

    console.log(`[Monitor] 완료. 알림 발송: ${notified ? '✅' : '없음'}`);

  } catch (err) {
    console.error('[Monitor] 오류:', err.message || err);
  }
}

// ══════════════════════════════════════════════════════════════
// 📊 Supabase 데이터 조회
// ══════════════════════════════════════════════════════════════

async function loadNotifySettings() {
  const res = await supabaseFetch(
    `/rest/v1/profiles?email=eq.smtp-config%40xpider.pro&select=plan,mac_address,stripe_customer_id,ip_address`,
    'GET'
  );
  if (!res || res.length === 0) return null;

  const row = res[0];
  const settings = {
    provider:    row.plan || 'brevo',
    email:       row.mac_address || '',
    downloads:   true,
    subscriptions: true,
    prevCounts:  null
  };

  // 알림 플래그 파싱
  if (row.stripe_customer_id) {
    try {
      const flags = JSON.parse(row.stripe_customer_id);
      if (typeof flags.downloads === 'boolean')     settings.downloads     = flags.downloads;
      if (typeof flags.subscriptions === 'boolean') settings.subscriptions = flags.subscriptions;
    } catch(e) {}
  }

  // 이전 수치 파싱 (ip_address 필드 재활용)
  if (row.ip_address) {
    try {
      const counts = JSON.parse(row.ip_address);
      if (typeof counts.downloads === 'number' && typeof counts.subscriptions === 'number') {
        settings.prevCounts = counts;
      }
    } catch(e) {}
  }

  return settings;
}

async function fetchCurrentCounts() {
  const res = await supabaseFetch(
    `/rest/v1/profiles?select=id,email,username,plan,created_at&neq.email=smtp-config%40xpider.pro&order=created_at.desc`,
    'GET'
  );
  if (!res) return null;

  const total = res.length;
  const subs  = res.filter(u => u.plan && !['free','admin','starter'].includes(u.plan)).length;
  return { total, subs, users: res };
}

async function savePrevCounts(downloads, subscriptions) {
  const json = JSON.stringify({ downloads, subscriptions, updatedAt: new Date().toISOString() });
  await supabaseFetch(
    `/rest/v1/profiles?email=eq.smtp-config%40xpider.pro`,
    'PATCH',
    { ip_address: json, last_active_at: new Date().toISOString() }
  );
}

// ══════════════════════════════════════════════════════════════
// 📧 이메일 발송
// ══════════════════════════════════════════════════════════════

async function sendEmail(settings, subject, htmlBody) {
  try {
    if (settings.provider === 'mailgun') {
      await sendViaMailgun(settings.email, subject, htmlBody);
    } else {
      await sendViaBrevo(settings.email, subject, htmlBody);
    }
    console.log(`[Monitor] ✅ 이메일 발송 성공: ${subject}`);
  } catch (err) {
    console.error(`[Monitor] ❌ 이메일 발송 실패: ${err.message}`);
  }
}

async function sendViaBrevo(toEmail, subject, htmlBody) {
  // Brevo API 키 획득
  const keyRes = await fetch(BREVO_WORKER_URL, { cache: 'no-store' });
  if (!keyRes.ok) throw new Error(`Brevo Worker 오류: ${keyRes.status}`);
  const apiKey = (await keyRes.text()).trim();

  const payload = {
    sender:      { name: 'XPIDER Monitor', email: 'no-reply@xpider.pro' },
    to:          [{ email: toEmail }],
    subject,
    htmlContent: htmlBody
  };

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method:  'POST',
    headers: { 'accept': 'application/json', 'api-key': apiKey, 'content-type': 'application/json' },
    body:    JSON.stringify(payload)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Brevo 오류 (${res.status}): ${err.message || 'unknown'}`);
  }
}

async function sendViaMailgun(toEmail, subject, htmlBody) {
  const mgKey  = getMailgunKey();
  const creds  = btoa(`api:${mgKey}`);

  const form   = new FormData();
  form.append('from',    `XPIDER Monitor <no-reply@${MAILGUN_DOMAIN}>`);
  form.append('to',      toEmail);
  form.append('subject', subject);
  form.append('html',    htmlBody);

  const res = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
    method:  'POST',
    headers: { 'Authorization': `Basic ${creds}` },
    body:    form
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Mailgun 오류 (${res.status}): ${err.message || 'unknown'}`);
  }
}

// ══════════════════════════════════════════════════════════════
// 📝 이메일 HTML 템플릿
// ══════════════════════════════════════════════════════════════

function buildDownloadEmailHtml(newCount, newUsers, totalCount) {
  const rows = newUsers.map(u => `
    <tr style="border-bottom:1px solid #1e2a3a;">
      <td style="padding:10px 14px; color:#e2e8f0;">${escHtml(u.email || '-')}</td>
      <td style="padding:10px 14px; color:#a4b3c6;">${escHtml(u.username || '-')}</td>
      <td style="padding:10px 14px; color:#63b3ed; font-weight:600; text-transform:uppercase;">${escHtml(u.plan || 'free')}</td>
      <td style="padding:10px 14px; color:#6b7a8d; font-size:11px;">${new Date(u.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:20px;background:#050d1a;font-family:'Segoe UI',sans-serif;">
  <div style="max-width:640px;margin:0 auto;">
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#0d2137,#081829);border:1px solid rgba(99,179,237,0.2);border-radius:16px;padding:28px;margin-bottom:20px;text-align:center;">
      <div style="font-size:36px;margin-bottom:10px;">📥</div>
      <h1 style="margin:0;font-size:22px;color:#63b3ed;font-weight:800;">신규 다운로드 알림</h1>
      <p style="margin:8px 0 0;color:#6b7a8d;font-size:13px;">${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</p>
    </div>

    <!-- Summary -->
    <div style="display:flex;gap:12px;margin-bottom:20px;">
      <div style="flex:1;background:#0d1929;border:1px solid rgba(99,179,237,0.15);border-radius:12px;padding:20px;text-align:center;">
        <div style="font-size:28px;font-weight:800;color:#63b3ed;">${newCount}</div>
        <div style="font-size:11px;color:#6b7a8d;text-transform:uppercase;letter-spacing:0.05em;margin-top:4px;">신규 가입</div>
      </div>
      <div style="flex:1;background:#0d1929;border:1px solid rgba(255,255,255,0.05);border-radius:12px;padding:20px;text-align:center;">
        <div style="font-size:28px;font-weight:800;color:#e2e8f0;">${totalCount}</div>
        <div style="font-size:11px;color:#6b7a8d;text-transform:uppercase;letter-spacing:0.05em;margin-top:4px;">누적 다운로드</div>
      </div>
    </div>

    <!-- User Table -->
    <div style="background:#080f1a;border:1px solid rgba(255,255,255,0.05);border-radius:12px;overflow:hidden;">
      <div style="padding:14px 16px;background:#0d1929;border-bottom:1px solid rgba(255,255,255,0.05);">
        <span style="font-size:12px;font-weight:700;color:#63b3ed;text-transform:uppercase;letter-spacing:0.08em;">신규 가입자 목록</span>
      </div>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#060d18;">
            <th style="padding:10px 14px;text-align:left;font-size:11px;color:#4a5568;text-transform:uppercase;">이메일</th>
            <th style="padding:10px 14px;text-align:left;font-size:11px;color:#4a5568;text-transform:uppercase;">유저명</th>
            <th style="padding:10px 14px;text-align:left;font-size:11px;color:#4a5568;text-transform:uppercase;">플랜</th>
            <th style="padding:10px 14px;text-align:left;font-size:11px;color:#4a5568;text-transform:uppercase;">가입 시간 (KST)</th>
          </tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="4" style="padding:16px;text-align:center;color:#4a5568;">데이터 없음</td></tr>'}</tbody>
      </table>
    </div>

    <!-- Footer -->
    <div style="margin-top:20px;text-align:center;padding:16px;">
      <p style="color:#4a5568;font-size:11px;margin:0;">
        XPIDER Monitor — 자동 알림 시스템 ·
        <a href="https://xpider.d23b8wu27vwban.amplifyapp.com/admin.html" style="color:#63b3ed;text-decoration:none;">어드민 페이지 열기</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}

function buildSubscriptionEmailHtml(newCount, paidUsers, totalSubs) {
  const rows = paidUsers.map(u => `
    <tr style="border-bottom:1px solid #1e2a3a;">
      <td style="padding:10px 14px; color:#e2e8f0;">${escHtml(u.email || '-')}</td>
      <td style="padding:10px 14px;">
        <span style="background:rgba(251,191,36,0.15);color:#fbbf24;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;text-transform:uppercase;">
          ${escHtml(u.plan)}
        </span>
      </td>
      <td style="padding:10px 14px; color:#6b7a8d; font-size:11px;">${new Date(u.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:20px;background:#050d1a;font-family:'Segoe UI',sans-serif;">
  <div style="max-width:640px;margin:0 auto;">
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1a1000,#0d0a00);border:1px solid rgba(251,191,36,0.25);border-radius:16px;padding:28px;margin-bottom:20px;text-align:center;">
      <div style="font-size:36px;margin-bottom:10px;">⭐</div>
      <h1 style="margin:0;font-size:22px;color:#fbbf24;font-weight:800;">신규 구독 알림</h1>
      <p style="margin:8px 0 0;color:#6b7a8d;font-size:13px;">${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</p>
    </div>

    <!-- Summary -->
    <div style="display:flex;gap:12px;margin-bottom:20px;">
      <div style="flex:1;background:#0d1929;border:1px solid rgba(251,191,36,0.2);border-radius:12px;padding:20px;text-align:center;">
        <div style="font-size:28px;font-weight:800;color:#fbbf24;">+${newCount}</div>
        <div style="font-size:11px;color:#6b7a8d;text-transform:uppercase;letter-spacing:0.05em;margin-top:4px;">신규 구독</div>
      </div>
      <div style="flex:1;background:#0d1929;border:1px solid rgba(255,255,255,0.05);border-radius:12px;padding:20px;text-align:center;">
        <div style="font-size:28px;font-weight:800;color:#e2e8f0;">${totalSubs}</div>
        <div style="font-size:11px;color:#6b7a8d;text-transform:uppercase;letter-spacing:0.05em;margin-top:4px;">누적 구독</div>
      </div>
    </div>

    <!-- User Table -->
    <div style="background:#080f1a;border:1px solid rgba(255,255,255,0.05);border-radius:12px;overflow:hidden;">
      <div style="padding:14px 16px;background:#0d1929;border-bottom:1px solid rgba(255,255,255,0.05);">
        <span style="font-size:12px;font-weight:700;color:#fbbf24;text-transform:uppercase;letter-spacing:0.08em;">신규 구독자 목록</span>
      </div>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#060d18;">
            <th style="padding:10px 14px;text-align:left;font-size:11px;color:#4a5568;text-transform:uppercase;">이메일</th>
            <th style="padding:10px 14px;text-align:left;font-size:11px;color:#4a5568;text-transform:uppercase;">플랜</th>
            <th style="padding:10px 14px;text-align:left;font-size:11px;color:#4a5568;text-transform:uppercase;">구독 시간 (KST)</th>
          </tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="3" style="padding:16px;text-align:center;color:#4a5568;">데이터 없음</td></tr>'}</tbody>
      </table>
    </div>

    <!-- Footer -->
    <div style="margin-top:20px;text-align:center;padding:16px;">
      <p style="color:#4a5568;font-size:11px;margin:0;">
        XPIDER Monitor — 자동 알림 시스템 ·
        <a href="https://xpider.d23b8wu27vwban.amplifyapp.com/admin.html" style="color:#fbbf24;text-decoration:none;">어드민 페이지 열기</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}

// ══════════════════════════════════════════════════════════════
// 🛠 유틸리티
// ══════════════════════════════════════════════════════════════

async function supabaseFetch(path, method = 'GET', body = null) {
  const opts = {
    method,
    headers: {
      'apikey':        SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type':  'application/json',
      'Accept':        'application/json',
      'Prefer':        method === 'PATCH' ? 'return=minimal' : ''
    }
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${SUPABASE_URL}${path}`, opts);
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    console.error(`[Supabase] ${method} ${path} → ${res.status}: ${txt}`);
    return null;
  }
  if (method === 'PATCH' || method === 'DELETE') return true;
  return res.json().catch(() => null);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

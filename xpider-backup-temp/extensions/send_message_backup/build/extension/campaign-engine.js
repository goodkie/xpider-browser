/**
 * XPIDER Native Campaign Engine v3.0 — Super-Intelligent Form Filler
 * - Opens contact pages in XPIDER browser NEW TAB (not separate window)
 * - Smart form filling: infers values for unmatched fields from template
 * - [v3.0] Full support: SELECT dropdowns, radio buttons, checkboxes, custom widgets
 * - [v3.0] Human-like mouse simulation (mousemove→mousedown→mouseup→click)
 * - [v4.17.0] 모든 sendLog 호출 포함 devlog ENGINE 레벨 100% 라우팅
 */

const { app, BrowserWindow } = require('electron');
const authService = require('./auth/auth-service');
const devlog = require('./xpider-devlog');  // [v4.17.0] 디버깅 로그 허브

let _getAllWebContents = null;
let _log = null;
let _getMainWindow = null;  // Function that returns the current mainWindow

const state = {
    active: false, paused: false, cancelled: false,
    queue: [], template: null, delayMs: 10000,
    successCount: 0, completedCount: 0, totalTargets: 0,
    currentTabWC: null, sessionId: 0
};

function init(getAllWebContentsFn, logFn, getMainWindowFn) {
    _getAllWebContents = getAllWebContentsFn;
    _log = logFn;
    _getMainWindow = getMainWindowFn;
}

function broadcast(message) {
    // 1. Send directly to mainWindow for robust sidepanel UI relaying
    if (_getMainWindow) {
        try {
            const mw = _getMainWindow();
            if (mw && !mw.isDestroyed()) {
                mw.webContents.send('xpider-ext-runtime-on-message', message);
            }
        } catch(e) {
            if (_log) _log(`[Broadcast Error] Failed to send to mainWindow: ${e.message}`);
        }
    }

    // 2. Broadcast to all other webContents securely
    if (_getAllWebContents) {
        try {
            _getAllWebContents().forEach(wc => {
                if (wc && !wc.isDestroyed()) {
                    try { wc.send('xpider-ext-runtime-on-message', message); } catch(e) {}
                }
            });
        } catch(e) {
            if (_log) _log(`[Broadcast Error] Failed to iterate allWebContents: ${e.message}`);
        }
    }
}

function sendLog(msg, type = 'info') {
    if (_log) _log(msg);
    // [v4.17.0] ENGINE 레벨로 devlog 실시간 라우팅
    try {
        const lvlMap = { info: 'ENGINE', warn: 'WARN', error: 'ERROR', success: 'ENGINE', debug: 'DEBUG' };
        devlog.addLog(lvlMap[type] || 'ENGINE', 'CampaignEngine', msg);
    } catch(_) {}
    broadcast({ action: 'SENDER_LOG', message: msg, logType: type });
}

function sendStats() {
    broadcast({ action: 'UPDATE_STATS', data: {
        successCount: state.successCount,
        completedCount: state.completedCount || 0,
        remainingCount: state.queue.length,
        totalTargets: state.totalTargets
    }});
}

const EXCLUDED_DOMAINS = /gov|go\.kr|go\.jp|mil|google|facebook|instagram|youtube|twitter|x\.com|linkedin|pinterest|github|naver|daum|kakao|tistory|yahoo|bing|msn|wikipedia|apple|microsoft|amazon|netflix|zoom|slack|skype|telegram|whatsapp|adobe|oracle|salesforce|ibm|intel|amd|nvidia|qualcomm|samsung|lg|hyundai|kia|kakaocorp|line|coupang|gmarket|11st|auction|danawa|interpark|wemakeprice|tmon|kurly|musinsa|zigzag|aboki|mutnam|stylenanda|imvely|dahong|jogunshop|keyward|abcmart|folder|folderstyle|shoemarker|lesmore|s-market|grandstage|jd-sports|footlocker/i;

const CONTACT_PROBES = [
    '/contact', '/contact-us', '/contactus', '/inquiry', '/support',
    '/get-in-touch', '/write-to-us', '/feedback', '/customer-service',
    '/pages/contact', '/pages/contact-us', '/about/contact',
    '/문의', '/문의하기', '/연락처'
];

async function findContactPages(targetUrl) {
    const results = [];
    let baseUrl;
    try {
        baseUrl = new URL(targetUrl).origin;
    } catch (e) {
        return ['/contact', '/contact-us'];
    }

    // [비폼 경로 제외] careers, blog, news 등은 문의 폼이 없으므로 제외
    const isExcludedPath = /\/careers|\/jobs|\/team|\/blog|\/news|\/media|\/press|\/sitemap|\/privacy|\/terms|\/legal|\/policy/i;

    // 1. targetUrl 자체가 서브패스를 포함하고 있고 contact 관련 키워드가 있는 경우 우선순위 1위로 추가
    const targetPath = targetUrl.replace(baseUrl, '');
    // [수정] 'about' 제거 → careers/about 등 비관련 경로 오인식 방지
    const isContactKeyword = /contact|inquiry|support|feedback|write|customer|문의|연락/i;
    
    if (targetPath && targetPath !== '/' && isContactKeyword.test(targetPath) && !isExcludedPath.test(targetPath)) {
        results.push(targetPath);
    }

    // 2. targetUrl(혹은 baseUrl)의 HTML을 GET fetch하여 내부에 있는 contact 링크들을 추출
    try {
        sendLog(`🌐 Fetching HTML to extract contact links from: ${targetUrl}`, 'debug');
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4000); // 4초 타임아웃
        const response = await fetch(targetUrl, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        clearTimeout(timer);
        if (response.ok) {
            const html = await response.text();
            // a 태그의 href 속성 추출
            const hrefRegex = /<a\s+(?:[^>]*?\s+)?href=(["'])(.*?)\1/gi;
            let match;
            const extractedPaths = new Set();
            while ((match = hrefRegex.exec(html)) !== null) {
                const href = match[2].trim();
                if (!href || href.startsWith('#') || href.startsWith('javascript:')) continue;
                
                // contact 관련 키워드가 포함되었는지 확인 + 비폼 경로 제외
                if (isContactKeyword.test(href) && !isExcludedPath.test(href)) {
                    try {
                        const resolvedUrl = new URL(href, targetUrl);
                        if (resolvedUrl.origin === baseUrl) {
                            extractedPaths.add(resolvedUrl.pathname + resolvedUrl.search);
                        }
                    } catch(e) {
                        // 상대경로 형식 (/contact-us 등)인 경우 직접 삽입
                        if (href.startsWith('/') || !href.includes('://')) {
                            const normalizedPath = href.startsWith('/') ? href : '/' + href;
                            if (!isExcludedPath.test(normalizedPath)) {
                                extractedPaths.add(normalizedPath);
                            }
                        }
                    }
                }
            }
            
            // 추출된 경로들을 results에 추가 (중복 방지)
            for (const path of extractedPaths) {
                if (!results.includes(path)) {
                    results.push(path);
                }
            }
            if (results.length > 0) {
                sendLog(`✨ Extracted ${results.length} contact link(s) directly from HTML.`, 'debug');
            }
        }
    } catch (e) {
        sendLog(`⚠️ HTML extraction failed or timed out: ${e.message}`, 'debug');
    }

    // 3. 만약 여전히 후보가 부족한 경우 (3개 미만), 기존 CONTACT_PROBES 중 겹치지 않는 것들로 채워 넣고 HEAD 요청으로 검증
    if (results.length < 3) {
        const batchSize = 6;
        for (let i = 0; i < CONTACT_PROBES.length; i += batchSize) {
            if (state.cancelled) break;
            const batch = CONTACT_PROBES.slice(i, i + batchSize);
            const checks = await Promise.all(batch.map(async path => {
                if (results.includes(path)) return null;
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), 2500);
                try {
                    const res = await fetch(baseUrl + path, { method: 'HEAD', signal: controller.signal, mode: 'no-cors' });
                    clearTimeout(timer);
                    return path;
                } catch(e) { clearTimeout(timer); return null; }
            }));
            results.push(...checks.filter(Boolean));
            if (results.length >= 3) break;
        }
    }

    // [우선순위 정렬] /contact, /contact-us 등 핵심 경로가 맨 앞에 오도록
    const deduped = [...new Set(results)].filter(Boolean);
    deduped.sort((a, b) => {
        const score = p => /^\/(\w+\/)?contact($|\/|-us|-form|-page)/i.test(p) ? 0
                         : /contact/i.test(p) ? 1
                         : /inquiry|support|feedback|write|customer/i.test(p) ? 2
                         : 3;
        return score(a) - score(b);
    });
    return deduped.length > 0 ? deduped : ['/contact', '/contact-us'];
}

// ─── [Probing Engine] 백그라운드 선행 폼 요소 감지 (탭 로딩 전 고속 필터링) ──────────────────
async function probeFormPresence(url) {
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3500); // 3.5초 타임아웃
        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        clearTimeout(timer);
        if (response.ok) {
            const html = await response.text();
            // HTML 내부에 form, input, textarea, select, button, 또는 Turnstile 챌린지 등의 폼 지표가 있는지 검사
            const lowerHtml = html.toLowerCase();
            const hasForm = lowerHtml.includes('<form') || 
                            lowerHtml.includes('input') || 
                            lowerHtml.includes('textarea') || 
                            lowerHtml.includes('select') || 
                            lowerHtml.includes('cf-turnstile') || 
                            lowerHtml.includes('g-recaptcha') ||
                            lowerHtml.includes('contact-form');
            if (hasForm) return true;

            // [외부 폼 서비스 감지] HubSpot / Marketo / Pardot / EPiServerForms / Typeform 등
            // JS 스크립트로 동적 생성되는 폼은 정적 HTML에 <input>이 없어도 실제 브라우저에서 폼이 렌더링됨
            const hasExternalForm =
                lowerHtml.includes('hsforms.net') ||       // HubSpot (e.g. srsdistribution.com)
                lowerHtml.includes('hs-scripts.com') ||
                lowerHtml.includes('hbspt.forms') ||
                lowerHtml.includes('hubspot') ||
                lowerHtml.includes('munchkin.js') ||       // Marketo
                lowerHtml.includes('mktoforms') ||
                lowerHtml.includes('marketo') ||
                lowerHtml.includes('pardot') ||            // Salesforce Pardot
                lowerHtml.includes('typeform') ||          // Typeform
                lowerHtml.includes('jotform') ||           // JotForm
                lowerHtml.includes('formstack') ||         // Formstack
                lowerHtml.includes('episerver') ||         // EPiServer/Optimizely Forms
                lowerHtml.includes('episerverfforms') ||
                lowerHtml.includes('epiforms') ||
                lowerHtml.includes('gravityforms') ||      // Gravity Forms (JS-rendered)
                lowerHtml.includes('wpcf7') ||             // Contact Form 7
                lowerHtml.includes('ninja-forms') ||
                lowerHtml.includes('wpforms');
            if (hasExternalForm) {
                sendLog(`📋 [Probing] 외부 폼 서비스(HubSpot/Marketo/Pardot 등) 감지됨, 실제 탭에서 폼 재확인: ${url}`, 'debug');
                return true;
            }

            // [SPA 감지] React / Angular / Vue / Knockout / Tealium 기반 SPA 사이트는 
            // 서버 응답 HTML에 입력 필드가 없어도 브라우저 JS 실행 후 폼이 렌더링됨
            // → SPA 힌트가 감지되면 true로 판단하여 실제 탭을 열어 확인
            const isSpa = lowerHtml.includes('ko.applybindings') ||
                          lowerHtml.includes('knockout') ||
                          lowerHtml.includes('ng-app') || lowerHtml.includes('ng-controller') ||
                          lowerHtml.includes('v-app') || lowerHtml.includes('vue') ||
                          lowerHtml.includes('react') || lowerHtml.includes('__react') ||
                          lowerHtml.includes('tealium') ||
                          lowerHtml.includes('data-bind') ||
                          (lowerHtml.includes('app.js') && lowerHtml.includes('bundle')) ||
                          lowerHtml.includes('single-page') ||
                          lowerHtml.includes('spa') ||
                          // 폼/문의/연락처 관련 단어가 URL 또는 페이지에 있으면 SPA 폼 가능성 있음
                          /contact|inquiry|support|feedback|write|form|문의|연락/i.test(url);
            if (isSpa) {
                sendLog(`🌐 [Probing] SPA/JS 기반 사이트로 감지됨, 실제 탭에서 폼 재확인: ${url}`, 'debug');
                return true;
            }
            return false;
        }
    } catch(e) {
        // 네트워크 에러나 타임아웃 시 안전을 위해 폼이 있을 수도 있는 후보로 간주하여 true 반환
        return true;
    }
    return false;
}


// ─── Smart Form Filler Script ─────────────────────────────────
function getFormFillerScript(template, fillMode = 'instant') {
    const tplJson = JSON.stringify(template);
    const fillDelay = state.fillDelayMs || 300;
    const submitDelay = state.submitDelayMs || 1500;
    return `(async function xpiderFill(){
if(window.__xpider_filling)return;
window.__xpider_filling=true;

// 폼 자동 입력 방식 주입
const fillMode = '${fillMode}';

// 👤 [User Active Tracker] 사용자의 실시간 입력/활동 추적 리스너 등록
window.__xpider_user_active = Date.now();
['keydown', 'mousedown', 'input', 'scroll'].forEach(evtType => {
  window.addEventListener(evtType, () => {
    window.__xpider_user_active = Date.now();
  }, { passive: true });
});

// 🌐 [Network Sniffer] Fetch 및 XMLHttpRequest 몽키 패칭 적용 (성공 응답 스니핑)
window.__xpider_ajax_success = false;
try {
  if (window.fetch && !window.fetch.__xpider_patched) {
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
      try {
        const response = await originalFetch(...args);
        const urlLower = String(args[0] || '').toLowerCase();
        const method = (typeof args[1] === 'object' && args[1] ? (args[1].method || 'GET') : 'GET').toUpperCase();
        // POST 요청이 성공한 경우 → 폼 제출 성공으로 강력 간주
        if (response.ok && (method === 'POST' || urlLower.includes('contact') || urlLower.includes('submit') || urlLower.includes('form') || urlLower.includes('mail') || urlLower.includes('api') || urlLower.includes('message') || urlLower.includes('inquiry') || urlLower.includes('send'))) {
          window.__xpider_ajax_success = true;
        }
        return response;
      } catch (err) {
        return originalFetch(...args);
      }
    };
    window.fetch.__xpider_patched = true;
  }

  if (window.XMLHttpRequest && !window.XMLHttpRequest.__xpider_patched) {
    const originalOpen = window.XMLHttpRequest.prototype.open;
    const originalSend = window.XMLHttpRequest.prototype.send;
    
    window.XMLHttpRequest.prototype.open = function(method, url, ...rest) {
      this.__xpider_url = url;
      this.__xpider_method = method;
      return originalOpen.call(this, method, url, ...rest);
    };

    window.XMLHttpRequest.prototype.send = function(...args) {
      this.addEventListener('load', function() {
        const urlLower = String(this.__xpider_url || '').toLowerCase();
        const method = String(this.__xpider_method || 'GET').toUpperCase();
        const isSuccess = this.status >= 200 && this.status < 300;
        // POST 요청이 성공한 경우 → 폼 제출 성공으로 강력 간주
        if (isSuccess && (method === 'POST' || urlLower.includes('contact') || urlLower.includes('submit') || urlLower.includes('form') || urlLower.includes('mail') || urlLower.includes('api') || urlLower.includes('message') || urlLower.includes('inquiry') || urlLower.includes('send'))) {
          window.__xpider_ajax_success = true;
        }
      });
      return originalSend.call(this, ...args);
    };
    window.XMLHttpRequest.__xpider_patched = true;
  }
} catch (e) {}

// 🛡️ [Stealth Shield v4.0] Main-world patch inside form frame to completely hide automation traces
try {
  if (navigator.webdriver !== false) {
    try { delete Navigator.prototype.webdriver; } catch(e) {}
    try { Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false, configurable: true }); } catch(e) {}
  }
  if (!window.chrome) window.chrome = { app: {} };
  Object.defineProperty(navigator, 'languages', { get: () => ['ko-KR', 'ko', 'en-US', 'en'], configurable: true });
} catch(e) {}

// ⚡ [Turnstile Bypass v2.0] 폼 내 Cloudflare Turnstile 위젯 자동 해결 엔진
async function bypassTurnstileWidget() {
  try {
    // [방법 1] window.turnstile API 직접 강제 호출 (Turnstile JS SDK가 로드된 경우)
    if (window.turnstile) {
      try {
        // Turnstile execute()로 강제 실행
        if (typeof window.turnstile.execute === 'function') {
          const widgets = document.querySelectorAll('.cf-turnstile, [data-sitekey], cf-turnstile');
          for (const w of widgets) {
            const sitekey = w.getAttribute('data-sitekey') || w.sitekey || '';
            if (sitekey) {
              try { window.turnstile.execute(w, { sitekey }); } catch(e) {}
            }
          }
        }
        // Turnstile 콜백 강제 트리거 (등록된 콜백이 있는 경우)
        if (typeof window.turnstile.getResponse === 'function') {
          const resp = window.turnstile.getResponse();
          if (resp) {
            // 이미 토큰이 있으면 hidden input에 주입
            const tokenInputs = document.querySelectorAll('[name="cf-turnstile-response"], [name="turnstile-response"], input[type="hidden"]');
            tokenInputs.forEach(inp => { if (!inp.value) inp.value = resp; });
          }
        }
      } catch(e) {}
    }

    // [방법 2] Turnstile iframe의 내부 체크박스/버튼 클릭 시뮬레이션
    const cfIframes = document.querySelectorAll('iframe[src*="challenges.cloudflare.com"], iframe[src*="turnstile"]');
    for (const iframe of cfIframes) {
      try {
        const iDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (iDoc) {
          const checkbox = iDoc.querySelector('input[type="checkbox"], .cb-i, [id*="checkbox"]');
          if (checkbox && !checkbox.checked) {
            checkbox.click();
            await new Promise(r => setTimeout(r, 500));
          }
          const btn = iDoc.querySelector('button, [role="button"]');
          if (btn) { btn.click(); await new Promise(r => setTimeout(r, 300)); }
        }
      } catch(e) {} // 크로스 오리진 iframe은 접근 불가, 무시
    }

    // [방법 3] __cf_chl_opt 글로벌 객체 (Managed Challenge) 강제 처리 신호 발송
    try {
      if (window.__cf_chl_opt) {
        window.__cf_chl_opt.cNounce = Math.floor(Math.random() * 999999);
        // Cloudflare의 챌린지 완료 이벤트를 발생시킴
        window.dispatchEvent(new CustomEvent('cf-challenge-success', { detail: { token: 'bypassed' } }));
      }
    } catch(e) {}

    // [방법 4] data-callback 속성에 지정된 함수 강제 호출
    const turnstileEls = document.querySelectorAll('[data-callback], .cf-turnstile[data-callback], cf-turnstile');
    for (const el of turnstileEls) {
      const cbName = el.getAttribute('data-callback');
      if (cbName && typeof window[cbName] === 'function') {
        try { window[cbName]('XPIDER_BYPASS_TOKEN_' + Date.now()); } catch(e) {}
      }
    }

    // [방법 5] 숨겨진 Turnstile 응답 input에 더미 토큰 주입 (일부 서버에서 클라이언트 검증만 하는 경우)
    const responseInputs = document.querySelectorAll(
      'input[name="cf-turnstile-response"], input[name="turnstile-response"]'
    );
    responseInputs.forEach(inp => {
      if (!inp.value || inp.value.trim() === '') {
        inp.value = 'XPIDER_BYPASS_' + Math.random().toString(36).substr(2, 20);
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

  } catch(e) {} // 최상위 에러는 조용히 무시
}

// Turnstile 위젯 바이패스 즉시 실행 (폼 주입과 동시에)
try { await bypassTurnstileWidget(); } catch(e) {}
await new Promise(r => setTimeout(r, 500)); // 바이패스 처리 후 DOM 안정화 대기

const tpl=${tplJson};
const fillDelayMs=${fillDelay};
const submitDelayMs=${submitDelay};

// [v18.60.0] Smart Address Parser (Extracts city, state, zip from a single Address string if needed)
function parseAddress(addrStr) {
  const res = { street: '', city: '', state: '', zip: '' };
  if (!addrStr) return res;
  
  // 1. 미국식 ZIP Code 검색 (5자리 혹은 5+4자리)
  const zipMatch = addrStr.match(/(?:\b)(\d{5})(?:-\d{4})?(?:\b)/);
  if (zipMatch) {
    res.zip = zipMatch[1];
  }
  
  // 2. 미국식 주(State) 검색 (2글자 대문자 약어)
  const stateMatch = addrStr.match(/(?:\b)(AL|AK|AS|AZ|AR|CA|CO|CT|DE|DC|FM|FL|GA|GU|HI|ID|IL|IN|IA|KS|KY|LA|ME|MH|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|MP|OH|OK|OR|PW|PA|PR|RI|SC|SD|TN|TX|UT|VT|VI|VA|WA|WV|WI|WY)(?:\b)/i);
  if (stateMatch) {
    res.state = stateMatch[1].toUpperCase();
  }
  
  // 3. 쉼표(,) 구분 파싱 시도 (예: "123 Business Rd, New York, NY 10001")
  const parts = addrStr.split(',').map(p => p.trim());
  if (parts.length >= 3) {
    res.street = parts[0];
    res.city = parts[1];
  } else {
    // 4. 한국 주소 파싱 시도
    const krParts = addrStr.split(/\s+/);
    if (krParts.length >= 2) {
      if (/(특별시|광역시|특별자치시|도)$/.test(krParts[0])) {
        res.state = krParts[0];
        if (krParts[1].endsWith('시') || krParts[1].endsWith('군') || krParts[1].endsWith('구')) {
          res.city = krParts[1];
          if (krParts[2] && (krParts[2].endsWith('구') || krParts[2].endsWith('동') || krParts[2].endsWith('읍') || krParts[2].endsWith('면'))) {
            res.city += ' ' + krParts[2];
          }
        }
      }
    }
  }
  return res;
}

// 템플릿의 개별 주소 구성요소가 비어 있을 경우, Address 필드에서 파싱해 복구함
const parsedAddr = parseAddress(tpl.address);
if (!tpl.city || tpl.city.trim() === '') tpl.city = parsedAddr.city;
if (!tpl.state || tpl.state.trim() === '') tpl.state = parsedAddr.state;
if (!tpl.zip || tpl.zip.trim() === '') tpl.zip = parsedAddr.zip;

// Primary field patterns (v4.12.40 - Multi-lingual Supreme Matchers)
const P={
  firstName:[/\\bfirst.?name\\b/i,/\\bgiven.?name\\b/i,/\\bforename\\b/i,/\\bfname\\b/i,/\\bfirst\\b/i,/\\bgiven\\b/i,/이름/i,/성함/i,/名前/i,/名/i,/given/i,/\\bnombre\\b/i,/\\bprenom\\b/i,/\\bvorname\\b/i],
  lastName:[/\\blast.?name\\b/i,/\\bfamily.?name\\b/i,/\\bsurname\\b/i,/\\blname\\b/i,/\\blast\\b/i,/\\bfamily\\b/i,/성(?!명|함)/i,/苗字/i,/姓/i,/\\bapellido\\b/i,/\\bnom\\b/i,/\\bnachname\\b/i],
  name:[/\\bname\\b/i,/\\bfull.?name\\b/i,/\\byour.*name\\b/i,/\\bcontact.*name\\b/i,/\\bcustomer.*name\\b/i,/\\bsender.*name\\b/i,/성함/i,/氏名/i,/姓名/i,/성명/i,/이름/i,/user/i,/fullname/i,/\\bcontact.*person\\b/i,/\\bclient.*name\\b/i],
  email:[/e.?mail/i,/이메일/i,/メール/i,/邮箱/i],
  companyName:[/company/i,/\\borg(anization)?\\b/i,/\\bcorp(oration)?\\b/i,/\\bfirm\\b/i,/\\bbusiness\\b/i,/회사/i,/기업/i,/상호/i,/co\\b/i,/\\bbrand\\b/i,/\\bemployer\\b/i,/\\b소속\\b/i,/회사명/i,/직장/i,/단체/i,/상호명/i,/업체명/i],
  address:[/[\\b]?add?ress\\b/i,/\\bstreet\\b/i,/\\baddr\\b/i,/\\bst\\b/i,/주소/i,/도로명/i,/\\broad\\b/i,/\\blocation\\b/i,/\\bresidence\\b/i,/address1/i,/address2/i,/line1/i,/line2/i,/지번/i,/상세주소/i],
  city:[/\\bcity\\b/i,/\\btown\\b/i,/도시/i,/시\\.?군\\.?구/i,/시구/i,/\\bmunicipality\\b/i,/\\bsuburb\\b/i,/\\blocality\\b/i,/시(?!도)/i,/군(?!주)/i,/구(?!글)/i,/읍면동/i],
  state:[/\\bstate\\b/i,/\\bprovince\\b/i,/\\bcounty\\b/i,/\\bregion\\b/i,/주(?!소)/i,/도(?!록)/i,/시\\.?도/i,/\\bterritory\\b/i,/\\bcanton\\b/i,/광역시/i,/특별시/i],
  zip:[/\\bzip\\b/i,/\\bpostal\\b/i,/\\bpost.?code\\b/i,/우편/i,/우편번호/i,/\\bzipcode\\b/i,/\\bpostalcode\\b/i,/\\bpincode\\b/i],
  subject:[/subject/i,/title(?!.*name)/i,/제목/i,/件名/i,/主题/i,/topic/i,/heading/i],
  phone:[/phone/i,/mobile/i,/tel(?!eg)/i,/전화/i,/手机/i,/电话/i,/fax/i],
  message:[/message/i,/content/i,/body/i,/comment/i,/inquiry/i,/description/i,/내용/i,/本文/i,/内容/i,/detail/i,/note/i,/\\bmessage.*text\\b/i,/\\bbody.*text\\b/i]
};

// [v4.12.27] Smart Name Splitter
function splitName(fullName) {
  if (!fullName) return { first: 'John', last: 'Doe' };
  const trimmed = fullName.trim();
  const hangulRegex = /^[가-힣]+$/;
  if (hangulRegex.test(trimmed)) {
    if (trimmed.length === 3) {
      return { last: trimmed.charAt(0), first: trimmed.substring(1) };
    } else if (trimmed.length === 2) {
      return { last: trimmed.charAt(0), first: trimmed.charAt(1) };
    } else if (trimmed.length === 4) {
      const doubleSurnames = ['황보', '독고', '사공', '남궁', '제갈', '서문'];
      const prefix2 = trimmed.substring(0, 2);
      if (doubleSurnames.includes(prefix2)) {
        return { last: prefix2, first: trimmed.substring(2) };
      }
      return { last: trimmed.charAt(0), first: trimmed.substring(1) };
    }
  }
  const parts = trimmed.split(/\\s+/);
  if (parts.length > 1) {
    const last = parts.pop();
    const first = parts.join(' ');
    return { first, last };
  }
  return { first: trimmed, last: trimmed };
}

// [v4.12.27] Smart Value Generator for BruteForce fallback
function generateSmartRandomValue(el) {
  const c = getFieldId(el);
  const type = (el.type || 'text').toLowerCase();
  
  // 1. 숫자 전용 필드 판정
  const isNumeric = type === 'number' || type === 'tel' || 
                    el.getAttribute('inputmode') === 'numeric' ||
                    /zip|postal|phone|tel|fax|mobile|number|qty|quantity|code|digit/i.test(c);
  
  if (isNumeric) {
    if (/phone|tel|mobile|fax|전화|연락처|휴대폰/i.test(c)) {
      if (tpl.phone && tpl.phone.trim() !== '') return tpl.phone;
      const rand8 = Math.floor(10000000 + Math.random() * 90000000);
      return '010-' + String(rand8).substring(0, 4) + '-' + String(rand8).substring(4);
    }
    if (/zip|postal|우편/i.test(c)) {
      const rand5 = Math.floor(10000 + Math.random() * 90000);
      return String(rand5);
    }
    const rand2 = Math.floor(1 + Math.random() * 98);
    return String(rand2);
  }
  
  // 2. 이메일 필드 판정
  const isEmail = type === 'email' || /email|mail/i.test(c);
  if (isEmail) {
    if (tpl.email && tpl.email.trim() !== '') return tpl.email;
    const randChars = Math.random().toString(36).substring(2, 8);
    return randChars + '@gmail.com';
  }
  
  // 3. 텍스트 / 일반 글자 필드
  const templateVals = [tpl.firstName, tpl.lastName, tpl.name, tpl.email, tpl.phone, tpl.subject, tpl.message].filter(v => typeof v === 'string' && v.trim() !== '');
  const getRandomTemplateVal = () => {
    const randSuffix = Math.random().toString(36).substring(2, 7);
    if (templateVals.length > 0) {
      const val = templateVals[Math.floor(Math.random() * templateVals.length)];
      return val + '_' + randSuffix;
    }
    return "Inquiry_" + randSuffix;
  };
  
  if (/company|회사|org/i.test(c)) {
    return tpl.companyName || (tpl.name || getRandomTemplateVal()) + ' Inc.';
  }
  if (/address|주소/i.test(c)) {
    return tpl.address || '123 Business Rd, New York, NY';
  }
  if (/city|도시/i.test(c)) {
    return tpl.city || 'New York';
  }
  if (/state|province|county|주(?!소)/i.test(c)) {
    return tpl.state || 'NY';
  }
  if (/zip|postal|우편/i.test(c)) {
    return tpl.zip || '10001';
  }
  if (/subject|제목|title/i.test(c)) {
    return tpl.subject || '';
  }
  if (el.tagName === 'TEXTAREA' || /message|content|body|내용/i.test(c)) {
    return tpl.message || '';
  }
  
  // 성/이름 필드 스마트 스플리터 적용
  if (/last.?name|family.?name|surname|성(?!명)/i.test(c)) {
    const s = splitName(tpl.name);
    return tpl.lastName || s.last || '';
  }
  if (/first.?name|given.?name/i.test(c)) {
    const s = splitName(tpl.name);
    return tpl.firstName || s.first || '';
  }
  if (/name|이름|성함|성명/i.test(c)) {
    return tpl.name || '';
  }
  
  return getRandomTemplateVal();
}

// [v4.12.31] React/Vue/Angular Native Value Setter Utility to bypass virtual DOM state synchronization
function setNativeValue(el, val) {
  try {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype
                : el.tagName === 'SELECT' ? HTMLSelectElement.prototype
                : HTMLInputElement.prototype;
    const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value');
    if (nativeSetter && nativeSetter.set) {
      nativeSetter.set.call(el, val);
    } else {
      el.value = val;
    }
  } catch (e) {
    el.value = val;
  }
}

// [v4.12.31] Stealth Human-like typing simulation — types character by character with native setters
async function tv(el,v){
  if(!v||!el||el.disabled||el.readOnly)return false;
  window.__xpider_user_active = Date.now(); // 자동 타이핑 시작 시 갱신
  
  // ⚡ [Instant Mode] 무지연 즉시 폼 주입 모드 지원
  if (typeof fillMode !== 'undefined' && fillMode === 'instant') {
    setNativeValue(el, v);
    el.focus&&el.focus();
    ['input', 'change', 'blur'].forEach(t=>
      el.dispatchEvent(new Event(t,{bubbles:true,cancelable:true}))
    );
    try{
      const rk=Object.keys(el).find(k=>k.startsWith('__reactFiber')||k.startsWith('__reactInternalInstance'));
      if(rk){
        const props=(el[rk]?.memoizedProps||el[rk]?.pendingProps||el[rk]);
        if(typeof props?.onChange==='function')props.onChange({target:el,currentTarget:el,type:'change',bubbles:true});
      }
    }catch(e){}
    return el.value === v;
  }
  
  // Click first using the stealth humanClick to establish mouse context
  await humanClick(el);
  el.focus&&el.focus();
  await new Promise(r=>setTimeout(r,100+Math.random()*120));
  
  // Standardize select & clear before typing
  try {
    el.select&&el.select();
    document.execCommand('selectAll',false,null);
    document.execCommand('delete',false,null);
  } catch(e) { setNativeValue(el, ''); }
  
  // Typist simulator
  const chars = Array.from(v);
  let currentVal = '';
  
  for(let i=0; i<chars.length; i++) {
    const char = chars[i];
    window.__xpider_user_active = Date.now(); // 매 문자 입력 순간마다 타임스탬프 갱신
    
    // Simulating user errors (typo) - 1.2% chance
    if (Math.random() < 0.012 && i > 0 && i < chars.length - 1) {
      const wrongChars = 'abcdefghijklmnopqrstuvwxyz';
      const typo = wrongChars.charAt(Math.floor(Math.random() * wrongChars.length));
      
      // Inject typo
      currentVal += typo;
      setNativeValue(el, currentVal);
      el.dispatchEvent(new InputEvent('input', {bubbles:true, data:typo}));
      await new Promise(r=>setTimeout(r, 100 + Math.random()*120));
      
      // Delete typo (Backspace simulation)
      currentVal = currentVal.slice(0, -1);
      setNativeValue(el, currentVal);
      el.dispatchEvent(new InputEvent('input', {bubbles:true, inputType: 'deleteContentBackward'}));
      await new Promise(r=>setTimeout(r, 120 + Math.random()*80));
    }
    
    currentVal += char;
    setNativeValue(el, currentVal);
    
    // Dispatch rich keyboard and input events
    const keyOpts = {bubbles:true, cancelable:true, key:char, charCode:char.charCodeAt(0)};
    el.dispatchEvent(new KeyboardEvent('keydown', keyOpts));
    el.dispatchEvent(new KeyboardEvent('keypress', keyOpts));
    el.dispatchEvent(new InputEvent('input', {bubbles:true, data:char}));
    el.dispatchEvent(new KeyboardEvent('keyup', keyOpts));
    
    // Standard typist delay scaled dynamically by fillDelayMs
    // 300ms is Normal (Level 6), which maps to base 45ms delay per keystroke.
    // 최대 지연 한계치를 45ms로 캡핑하여 극단적인 느린 설정 차단
    const baseDelay = Math.min(45, Math.max(8, Math.floor((typeof fillDelayMs !== 'undefined' ? fillDelayMs : 300) / 6.6)));
    const delay = /[.,!?;:]/.test(char) ? (baseDelay * 4 + Math.random()*220) : (baseDelay + Math.random()*50);
    await new Promise(r=>setTimeout(r, delay));
  }
  
  // [v4.12.31] Dual-Layer Sync Safeguard: Force update React/Vue state
  setNativeValue(el, v);
  ['input', 'change', 'blur'].forEach(t=>
    el.dispatchEvent(new Event(t,{bubbles:true,cancelable:true}))
  );
  
  try{
    const rk=Object.keys(el).find(k=>k.startsWith('__reactFiber')||k.startsWith('__reactInternalInstance'));
    if(rk){
      const props=(el[rk]?.memoizedProps||el[rk]?.pendingProps||el[rk]);
      if(typeof props?.onChange==='function')props.onChange({target:el,currentTarget:el,type:'change',bubbles:true});
    }
  }catch(e){}
  
  return el.value === v;
}

// [v4.12.26] Stealth Human-like Mouse Event simulation with Bezier path movements and smooth scrolls
async function humanClick(el){
  if(!el)return;
  window.__xpider_user_active = Date.now(); // 마우스 조작 시작 시 갱신
  
  // ⚡ [Instant Mode] 무지연 즉시 클릭 모드 지원
  if (typeof fillMode !== 'undefined' && fillMode === 'instant') {
    try { el.scrollIntoView({ behavior: 'auto', block: 'center' }); } catch(e){}
    const rect = el.getBoundingClientRect();
    const x = rect.left + rect.width/2;
    const y = rect.top + rect.height/2;
    const evtInit = {bubbles:true, cancelable:true, clientX:x, clientY:y, screenX:x, screenY:y, button:0};
    
    el.dispatchEvent(new MouseEvent('mouseenter', evtInit));
    el.dispatchEvent(new MouseEvent('mouseover', evtInit));
    el.dispatchEvent(new MouseEvent('mousedown', evtInit));
    el.dispatchEvent(new MouseEvent('mouseup', evtInit));
    el.click();
    try{ el.focus(); }catch(e){}
    return;
  }
  
  // 1. Ensure element is in view smoothly
  try {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await new Promise(r=>setTimeout(r, 450 + Math.random()*150));
  } catch(e) {}
  
  const rect=el.getBoundingClientRect();
  const targetX=rect.left+rect.width/2+(Math.random()*6-3);
  const targetY=rect.top+rect.height/2+(Math.random()*6-3);
  
  // Track last mouse location globally to simulate cohesive drag/hover paths
  if (typeof window.__xpider_last_mouse_x === 'undefined') {
    window.__xpider_last_mouse_x = Math.random() * window.innerWidth;
    window.__xpider_last_mouse_y = Math.random() * window.innerHeight;
  }
  
  const startX = window.__xpider_last_mouse_x;
  const startY = window.__xpider_last_mouse_y;
  
  // Generate Bezier control points for beautiful curve
  const steps = 7 + Math.floor(Math.random() * 5); // 7 to 11 intermediate points
  const cp1x = startX + (targetX - startX) * 0.25 + (Math.random() * 60 - 30);
  const cp1y = startY + (targetY - startY) * 0.25 + (Math.random() * 60 - 30);
  const cp2x = startX + (targetX - startX) * 0.75 + (Math.random() * 60 - 30);
  const cp2y = startY + (targetY - startY) * 0.75 + (Math.random() * 60 - 30);
  
  for(let i=1; i<=steps; i++) {
    const t = i / steps;
    // Cubic Bezier curve formula
    const x = Math.round((1-t)**3 * startX + 3*(1-t)**2*t * cp1x + 3*(1-t)*t**2 * cp2x + t**3 * targetX);
    const y = Math.round((1-t)**3 * startY + 3*(1-t)**2*t * cp1y + 3*(1-t)*t**2 * cp2y + t**3 * targetY);
    
    const moveInit={bubbles:true,cancelable:true,clientX:x,clientY:y,screenX:x,screenY:y,button:0};
    el.dispatchEvent(new MouseEvent('mousemove', moveInit));
    await new Promise(r=>setTimeout(r, 12 + Math.random()*15)); // Fluid movement speed
  }
  
  window.__xpider_last_mouse_x = targetX;
  window.__xpider_last_mouse_y = targetY;
  
  const evtInit={bubbles:true,cancelable:true,clientX:targetX,clientY:targetY,screenX:targetX,screenY:targetY,button:0};
  
  el.dispatchEvent(new MouseEvent('mouseenter',evtInit));
  await new Promise(r=>setTimeout(r,12+Math.random()*20));
  el.dispatchEvent(new MouseEvent('mouseover',evtInit));
  await new Promise(r=>setTimeout(r,25+Math.random()*40));
  el.dispatchEvent(new MouseEvent('mousedown',evtInit));
  await new Promise(r=>setTimeout(r,45+Math.random()*50));
  el.dispatchEvent(new MouseEvent('mouseup',evtInit));
  el.dispatchEvent(new MouseEvent('click',evtInit));
  try{el.focus();}catch(e){}
  await new Promise(r=>setTimeout(r,55+Math.random()*60));
}

// [v4.12.25] Smart SELECT dropdown filler
async function fillSelect(el){
  if(!el||el.tagName!=='SELECT'||el.disabled)return false;
  const opts=Array.from(el.options);
  if(opts.length<=1)return false;
  // Skip if already has a valid non-default selection
  if(el.selectedIndex>0 && el.value && el.value.trim()!=='')return false;
  const id=getFieldId(el);
  let bestIdx=-1;
  // Smart label-based matching
  // [전화번호 국가코드 select] phone/dial/country-code 전용 드롭다운 → 미국(+1) 우선 선택
  const isPhoneCodeSelect = /\\bphone.?code\\b|\\bdial.?code\\b|\\bcountry.?code\\b|\\bcalling.?code\\b|\\barea.?code\\b|\\bintl\\b|\\bcountry.?dial\\b/i.test(id) ||
    opts.some(o => /^\\+1\\b|\\bUS\\b|\\bUSA\\b|United States/i.test(o.text) && opts.some(o2 => /^\\+44\\b|\\bUK\\b|United Kingdom/i.test(o2.text)));
  if (isPhoneCodeSelect) {
    // +1 / US / United States 우선
    const usIdx = opts.findIndex(o => /^\\+1$|^1$|\\bUS\\b|\\bUSA\\b|United States/i.test(o.text.trim()) || o.value === '1' || o.value === '+1' || o.value === 'US' || o.value === 'us');
    if (usIdx > 0) { bestIdx = usIdx; }
    // 못 찾으면 +1이 포함된 항목 검색
    if (bestIdx < 0) {
      const plusOne = opts.findIndex(o => o.text.includes('+1') || o.value === '+1' || o.value === '1');
      if (plusOne > 0) bestIdx = plusOne;
    }
  }
  if (bestIdx < 0 && /country|region|location|지역|국가|地域|国家/i.test(id)) {
    // 일반 country select → 미국 우선
    const prefs = ['united states', 'us', 'usa', 'united kingdom', 'uk', 'canada', 'australia'];
    for (const pref of prefs) {
      const idx = opts.findIndex(o => o.text.toLowerCase().includes(pref));
      if (idx > 0) { bestIdx = idx; break; }
    }
  }
  if(bestIdx<0 && /subject|topic|reason|purpose|inquiry|service|문의|件名|主题/i.test(id)){
    // Try to match tpl.subject
    if(tpl.subject){
      const idx=opts.findIndex(o=>o.text.toLowerCase().includes(tpl.subject.toLowerCase().substring(0,15)));
      if(idx>0)bestIdx=idx;
    }
    if(bestIdx<0){
      const genIdx=opts.findIndex(o=>/general|other|기타|その他|其他|inquiry|info/i.test(o.text));
      if(genIdx>0)bestIdx=genIdx;
    }
  }
  if(bestIdx<0 && /salutation|title|prefix|호칭|敬称|称谓/i.test(id)){
    const mrIdx=opts.findIndex(o=>/^mr\\.?$/i.test(o.text.trim())||/^ms\\.?$/i.test(o.text.trim()));
    if(mrIdx>0)bestIdx=mrIdx;
  }
  if(bestIdx<0 && /how.*hear|how.*find|referral|알게/i.test(id)){
    const webIdx=opts.findIndex(o=>/internet|website|web|search|google|online/i.test(o.text));
    if(webIdx>0)bestIdx=webIdx;
  }
  // Fallback: pick random non-empty option
  if(bestIdx<0){
    const validOpts = opts.map((o, idx) => ({o, idx})).filter(item => item.idx > 0 && item.o.value && item.o.value.trim() !== '' && !item.o.disabled);
    if (validOpts.length > 0) {
      bestIdx = validOpts[Math.floor(Math.random() * validOpts.length)].idx;
    }
  }
  if(bestIdx<0)return false;
  await humanClick(el);
  el.selectedIndex=bestIdx;
  el.value=opts[bestIdx].value;
  ['input','change','blur'].forEach(t=>el.dispatchEvent(new Event(t,{bubbles:true})));
  // React fiber sync
  try{
    const rk=Object.keys(el).find(k=>k.startsWith('__reactFiber')||k.startsWith('__reactInternalInstance'));
    if(rk){
      const props=(el[rk]?.memoizedProps||el[rk]?.pendingProps||el[rk]);
      if(typeof props?.onChange==='function')props.onChange({target:el,currentTarget:el,type:'change',bubbles:true});
    }
  }catch(e){}
  await new Promise(r=>setTimeout(r,100+Math.random()*100));
  return true;
}

// [v4.12.25] Smart radio group filler
async function fillRadioGroups(container){
  const radios=Array.from(container.querySelectorAll('input[type=radio]'));
  if(radios.length===0)return 0;
  const groups={};
  radios.forEach(r=>{
    const name=r.name||r.id||'__unnamed';
    if(!groups[name])groups[name]=[];
    groups[name].push(r);
  });
  let filled=0;
  for(const[name,items] of Object.entries(groups)){
    if(items.some(r=>r.checked))continue;
    
    const chosen = items[Math.floor(Math.random() * items.length)];
    if(chosen && !chosen.disabled){
      await humanClick(chosen);
      chosen.checked=true;
      ['input','change'].forEach(t=>chosen.dispatchEvent(new Event(t,{bubbles:true})));
      filled++;
      await new Promise(r=>setTimeout(r,80+Math.random()*80));
    }
  }
  return filled;
}

// [v4.12.25] Smart checkbox filler (supports custom checkbox widgets and advanced labels)
async function fillCheckboxes(container){
  const cbs = Array.from(container.querySelectorAll('input[type=checkbox], [role=checkbox], [class*="checkbox" i]:not(label):not(input)'));
  if(cbs.length===0)return 0;
  let filled=0;
  for(const cb of cbs){
    if(cb.disabled || cb.getAttribute('disabled') !== null) continue;
    
    await humanClick(cb);
    if (cb.type === 'checkbox') {
      cb.checked = true;
    } else {
      cb.setAttribute('aria-checked', 'true');
      cb.classList.add('checked');
    }
    ['input','change','click'].forEach(t=>cb.dispatchEvent(new Event(t,{bubbles:true})));
    filled++;
    await new Promise(r=>setTimeout(r,80+Math.random()*80));
  }
  return filled;
}

// ─── [v4.12.50] Phone Country Code Auto-Setter (미국 +1 자동 선택) ───
// intl-tel-input, 플래그 버튼, 커스텀 국가코드 드롭다운 등 모든 형태를 처리
async function fillPhoneCountryCode(container) {
  let filled = 0;

  // ─ 방법 1: intl-tel-input 라이브러리 (가장 대중적인 전화번호 국제코드 라이브러리)
  // iti 인스턴스가 window.intlTelInputGlobals 또는 el.__iti 에 저장됨
  try {
    const telInputs = Array.from(container.querySelectorAll('input[type="tel"], input[name*="phone" i], input[id*="phone" i], input[name*="mobile" i]'));
    for (const inp of telInputs) {
      // intl-tel-input 인스턴스 탐색
      try {
        const iti = window.intlTelInputGlobals?.getInstance(inp) || inp.__iti || inp._iti;
        if (iti && typeof iti.setCountry === 'function') {
          iti.setCountry('us');
          filled++;
          await new Promise(r => setTimeout(r, 100));
          continue;
        }
      } catch(e) {}

      // intl-tel-input 플래그 버튼이 DOM에 있는 경우 클릭하여 US 선택
      const wrapper = inp.closest('.iti, [class*="intl-tel"], [class*="phone-input"], [class*="phone-flag"], [class*="tel-input"]');
      if (wrapper) {
        const flagBtn = wrapper.querySelector('.iti__flag-container, .iti__selected-flag, [class*="flag-button"], [class*="country-flag"], [class*="iti__arrow"]');
        if (flagBtn) {
          try {
            await humanClick(flagBtn);
            await new Promise(r => setTimeout(r, 400));

            // 드롭다운 열린 후 US 항목 탐색
            const listItems = Array.from(document.querySelectorAll('.iti__country-list li, .iti__country, [class*="country-option"], [data-country-code]'))
              .filter(el => el.offsetParent !== null);

            // Search input이 있으면 'United States' 입력
            const searchInput = document.querySelector('.iti__search-input, [class*="country-search"]');
            if (searchInput) {
              setNativeValue(searchInput, 'United States');
              searchInput.dispatchEvent(new InputEvent('input', { bubbles: true }));
              await new Promise(r => setTimeout(r, 300));
            }

            const usItem = listItems.find(el =>
              /^us$|united states/i.test((el.getAttribute('data-country-code') || el.getAttribute('data-dial-code') || el.textContent || '').trim())
            );
            if (usItem) {
              await humanClick(usItem);
              filled++;
              await new Promise(r => setTimeout(r, 200));
            } else if (listItems.length > 0) {
              // US 못 찾으면 ESC로 닫기
              document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
            }
          } catch(e) {}
          continue;
        }
      }
    }
  } catch(e) {}

  // ─ 방법 2: 국가코드 전용 <select> 탐색 (tel input 바로 앞/뒤의 select)
  try {
    const phoneInputs = Array.from(container.querySelectorAll('input[type="tel"], input[name*="phone" i], input[id*="phone" i]'));
    for (const inp of phoneInputs) {
      // 인근(부모 3단계 이내)의 select 중 국가코드 관련인 것 탐색
      let parent = inp.parentElement;
      for (let i = 0; i < 4 && parent; i++) {
        const selInParent = Array.from(parent.querySelectorAll('select'));
        for (const sel of selInParent) {
          if (sel === inp || sel.disabled) continue;
          const selId = getFieldId(sel);
          const opts = Array.from(sel.options);
          // 이 select가 국가코드 관련인지 판단
          const isDialCode = /country.?code|dial.?code|phone.?code|calling.?code|country/i.test(selId) ||
            opts.some(o => /^\\+1$|\\+44|\\+61|\\+82/i.test(o.text.trim()));
          if (isDialCode && (sel.selectedIndex <= 0 || !sel.value)) {
            // US +1 선택
            const usIdx = opts.findIndex(o =>
              /^\\+1$|^1$|\\bUS\\b|\\bUSA\\b|United States/i.test(o.text.trim()) ||
              o.value === '1' || o.value === '+1' || o.value === 'US' || o.value === 'us'
            );
            if (usIdx > 0) {
              await humanClick(sel);
              sel.selectedIndex = usIdx;
              sel.value = opts[usIdx].value;
              ['input', 'change', 'blur'].forEach(t => sel.dispatchEvent(new Event(t, { bubbles: true })));
              filled++;
              await new Promise(r => setTimeout(r, 100));
            }
          }
        }
        parent = parent.parentElement;
      }
    }
  } catch(e) {}

  // ─ 방법 3: 전화번호 국가코드 텍스트가 있는 커스텀 드롭다운/버튼 탐색
  try {
    // 국가코드를 표시하는 요소 패턴 탐색 (e.g. +1, US flag, "United States" 드롭다운)
    const codeSelectors = [
      '[class*="phone-code"i]', '[class*="country-code"i]', '[class*="dial-code"i]',
      '[class*="calling-code"i]', '[data-type="phone-code"]', '[aria-label*="country code"i]',
      '[aria-label*="phone code"i]', '[aria-label*="dial code"i]',
      'button[class*="phone"i]', 'span[class*="flag"i]'
    ];
    for (const cSel of codeSelectors) {
      const elems = Array.from(container.querySelectorAll(cSel)).filter(el => el.offsetParent !== null);
      for (const elem of elems) {
        const txt = (elem.textContent || '').trim();
        // 이미 +1 또는 US이면 스킵
        if (/^\\+1$|^US$|United States/i.test(txt)) continue;
        // 클릭해서 드롭다운 열기
        try {
          await humanClick(elem);
          await new Promise(r => setTimeout(r, 400));
          // 열린 옵션 목록에서 US / +1 찾기
          const visibleOpts = Array.from(document.querySelectorAll('[role="option"], [class*="option"i], li, [class*="item"i]'))
            .filter(el => el.offsetParent !== null && el.textContent.trim());
          const usOpt = visibleOpts.find(el =>
            /United States|\\+1|^US$/i.test(el.textContent.trim()) ||
            /^us$/i.test(el.getAttribute('data-value') || el.getAttribute('value') || '')
          );
          if (usOpt) {
            await humanClick(usOpt);
            filled++;
            await new Promise(r => setTimeout(r, 200));
          } else {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
          }
        } catch(e) {}
      }
    }
  } catch(e) {}

  return filled;
}

// [v4.12.25] Custom (non-native) dropdown handler (Wix, React, etc.)
async function fillCustomDropdowns(container){
  const selectors=['[role=combobox]','[role=listbox]','[data-hook*=dropdown]','[class*=dropdown]:not(select)','[class*=select-wrapper]','[class*=custom-select]'];
  let filled=0;
  for(const sel of selectors){
    const els=container.querySelectorAll(sel);
    for(const el of els){
      // Skip if already has a selected value displayed
      const displayText=(el.textContent||'').trim();
      if(displayText && !/select|choose|pick|선택/i.test(displayText))continue;
      try{
        await humanClick(el);
        await new Promise(r=>setTimeout(r,300));
        // Find the opened options list
        const optionSelectors=['[role=option]','[class*=option]','[class*=menu-item]','[data-hook*=option]','li'];
        let options=[];
        for(const os of optionSelectors){
          options=Array.from(document.querySelectorAll(os)).filter(o=>o.offsetParent!==null && o.textContent.trim()!=='');
          if(options.length>1)break;
        }
        if(options.length>1){
          // Pick first non-header option
          const target=options.find((o,i)=>i>0 && !/select|choose|선택/i.test(o.textContent.trim()))||options[1];
          if(target){
            await humanClick(target);
            filled++;
            await new Promise(r=>setTimeout(r,200));
          }
        }
      }catch(e){}
    }
  }
  return filled;
}

function lbl(el){
  // Standard labels
  const ls=el.labels?Array.from(el.labels).map(l=>l.textContent).join(' '):'';
  const al=el.getAttribute('aria-label')||'';
  const alb=el.getAttribute('aria-labelledby');
  const albt=alb?(document.getElementById(alb)||{}).textContent||'':'';
  // Wix: data-hook attribute
  const hook=el.getAttribute('data-hook')||'';
  // Wix: label inside parent container (wix wraps inputs in divs with a label above)
  let parentLbl='';
  let p=el.parentElement;
  for(let i=0;i<3&&p;i++){
    if(p.querySelectorAll('input,textarea,select,[contenteditable]').length>1){
      // Wix나 복수 필드 공통 부모는 라벨 혼동을 막기 위해 브레이크하되,
      // 체크박스일 때는 이 제한을 해제하여 라벨을 올바르게 가져오도록 함
      if (el.type !== 'checkbox' && el.getAttribute('role') !== 'checkbox') {
        break;
      }
    }
    const lEl=p.querySelector('label,p[class*="label"],span[class*="label"],div[class*="label"]');
    if(lEl&&lEl!==el){parentLbl=lEl.textContent||'';break;}
    p=p.parentElement;
  }
  // Previous sibling label
  let prevLbl='';
  let sibPrev=el.previousElementSibling;
  for(let i=0;i<3&&sibPrev;i++){
    if(['LABEL','SPAN','P','DIV'].includes(sibPrev.tagName)&&(sibPrev.textContent||'').length<250){prevLbl=sibPrev.textContent||'';break;}
    sibPrev=sibPrev.previousElementSibling;
  }
  // Next sibling label (체크박스는 보통 오른쪽에 라벨 문구가 오므로 뒤쪽 형제 탐색이 필수적임)
  let nextLbl='';
  let sibNext=el.nextElementSibling;
  for(let i=0;i<3&&sibNext;i++){
    if(['LABEL','SPAN','P','DIV'].includes(sibNext.tagName)&&(sibNext.textContent||'').length<250){nextLbl=sibNext.textContent||'';break;}
    sibNext=sibNext.nextElementSibling;
  }
  return (ls+' '+al+' '+albt+' '+hook+' '+parentLbl+' '+prevLbl+' '+nextLbl).toLowerCase().trim();
}

function getFieldId(el){
  const hook=el.getAttribute('data-hook')||'';
  return [el.name||'',el.id||'',el.placeholder||'',lbl(el),el.className||'',hook].join(' ').toLowerCase();
}

// [v4.12.46] High-Precision Name Field Detector (scans surrounding DOM text for hash-based fields)
function detectNameField(el) {
  // 1. 엘리먼트 자체 고유 속성 (id, name, placeholder, className, data-hook, aria-label) 1순위 판별 (간섭 원천 배제)
  const hook = el.getAttribute('data-hook') || '';
  const al = el.getAttribute('aria-label') || '';
  const pureAttr = [el.name || '', el.id || '', el.placeholder || '', el.className || '', hook, al].join(' ').toLowerCase();

  const isPureLast = /\blast.?name\b|\blname\b|\blast\b|\bsurname\b|\bfamily.?name\b/.test(pureAttr);
  const isPureFirst = /\bfirst.?name\b|\bfname\b|\bfirst\b|\bgiven.?name\b|\bforename\b/.test(pureAttr);

  if (isPureLast && !isPureFirst) {
    return 'last';
  }
  if (isPureFirst && !isPureLast) {
    return 'first';
  }

  // 2. 주변 텍스트(lbl)를 합산한 종합 검증
  const c = getFieldId(el).toLowerCase();
  const hasLast = /\blast.?name\b|\bfamily.?name\b|\bsurname\b|\blname\b|\blast\b|\bfamily\b|\bapellido\b|\bnom\b|\bnachname\b/.test(c);
  const hasFirst = /\bfirst.?name\b|\bgiven.?name\b|\bforename\b|\bfname\b|\bfirst\b|\bgiven\b|given|\bnombre\b|\bprenom\b|\bvorname\b/.test(c);

  if (hasFirst && !hasLast) {
    return 'first';
  }
  if (hasLast && !hasFirst) {
    return 'last';
  }

  // 만약 둘 다 검출되어 충돌이 발생한 경우, 엘리먼트 자체 고유 속성을 한 번 더 신뢰하여 판단
  if (hasFirst && hasLast) {
    if (isPureLast) return 'last';
    if (isPureFirst) return 'first';
    
    // 둘 다 고유 속성에 없는 경우, lbl(el)의 텍스트 자체에서 'last'와 'first'의 매칭 인덱스를 비교 (뒤에 나오는 쪽이 실제 본인의 라벨일 확률이 큼)
    const labelText = lbl(el).toLowerCase();
    const firstIdx = labelText.indexOf('first');
    const lastIdx = labelText.indexOf('last');
    if (firstIdx !== -1 && lastIdx !== -1) {
      return lastIdx > firstIdx ? 'last' : 'first';
    }
  }

  if (/\bname\b|\bfull.?name\b|\byour.*name\b|\bcontact.*name\b|\bcustomer.*name\b|\bsender.*name\b|user|fullname|\bcontact.*person\b|\bclient.*name\b/.test(c)) {
    return 'full';
  }
  
  // Korean keyword fallback
  if (/이름|성함|성명|성(?!명|함)/i.test(c)) {
    if (/성(?!명|함)/i.test(c)) return 'last';
    if (/이름|성함|성명/i.test(c)) return 'full';
  }
  
  // 3. Shadow DOM & parent wrapper text scanning safety fallback
  let parentText = '';
  let p = el.parentElement;
  for (let i = 0; i < 3 && p; i++) {
    if (p.querySelectorAll('input,textarea,select,[contenteditable]').length > 1) {
      break;
    }
    parentText += ' ' + (p.textContent || '');
    p = p.parentElement;
  }
  parentText = parentText.toLowerCase();
  
  const hasParentFirst = parentText.includes('first name') || parentText.includes('given name') || parentText.includes('fname') || parentText.includes('이름') || parentText.includes('성함');
  const hasParentLast = parentText.includes('last name') || parentText.includes('family name') || parentText.includes('lname') || parentText.includes('surname') || (parentText.includes('성') && !parentText.includes('성명') && !parentText.includes('성함'));

  if (hasParentFirst && !hasParentLast) {
    return 'first';
  }
  if (hasParentLast && !hasParentFirst) {
    return 'last';
  }
  if (parentText.includes('name') || parentText.includes('full name') || parentText.includes('성명') || parentText.includes('성함')) {
    return 'full';
  }
  
  return null;
}

// [v3.0] Math CAPTCHA solver — detects "5+1=", "What is 3×7?" etc. and computes the answer
async function solveMathCaptchas(container){
  const inputs=Array.from(container.querySelectorAll('input[type=text],input[type=number],input:not([type])'));
  let solved=0;
  for(const el of inputs){
    if(el.value||el.disabled||el.readOnly)continue;
    // Gather all text clues: label, placeholder, aria-label, nearby text
    const clues=(getFieldId(el)+' '+lbl(el)).toLowerCase();
    // Quick gate: must contain a captcha/math/quiz/verify/spam/human keyword OR a math expression
    if(!/captcha|math|quiz|verify|spam|human|bot|security|check|prove|계산|확인|검증|認証|验证|\\d\\s*[+\\-×x*÷\\/]\\s*\\d/i.test(clues))continue;
    // Extract math expressions from the clue text
    // Patterns: "5+1=", "5 + 1", "What is 5+1?", "5+1 =", "5 plus 1", "5 × 3", "5 * 3", "5 - 2", "15 / 3", "15÷3"
    const allText=(lbl(el)+' '+(el.placeholder||'')+' '+(el.getAttribute('aria-label')||'')).trim();
    // Also check parent/sibling text for the math expression
    let contextText=allText;
    let p=el.parentElement;
    for(let i=0;i<4&&p;i++){
      const texts=Array.from(p.childNodes).filter(n=>n.nodeType===3||['LABEL','SPAN','P','DIV','STRONG','B','EM'].includes(n.tagName)).map(n=>n.textContent||'').join(' ');
      if(texts.length>contextText.length)contextText=texts;
      if(/\\d\\s*[+\\-×x*÷\\/]\\s*\\d/.test(contextText))break;
      p=p.parentElement;
    }
    // Try to find and solve the math expression
    const answer=parseMathExpression(contextText);
    if(answer!==null){
      await humanClick(el);
      await tv(el,String(answer));
      solved++;
      await new Promise(r=>setTimeout(r,100+Math.random()*100));
    }
  }
  return solved;
}

function parseMathExpression(text){
  // Normalize: × → *, ÷ → /, x (multiplication) → *
  let t=text.replace(/×/g,'*').replace(/÷/g,'/').replace(/[Xx](?=\\s*\\d)/g,'*');
  // Replace word operators
  t=t.replace(/\\bplus\\b/gi,'+').replace(/\\bminus\\b/gi,'-').replace(/\\btimes\\b/gi,'*').replace(/\\bmultiplied\\s*by\\b/gi,'*').replace(/\\bdivided\\s*by\\b/gi,'/');
  // Match patterns: "5 + 1 =", "5+1", "What is 5 + 1", etc.
  // Try multi-operand expressions first: "2 + 3 + 4 ="
  const multiMatch=t.match(/(\\d+(?:\\s*[+\\-\\*\\/]\\s*\\d+)+)\\s*[=?]?/);
  if(multiMatch){
    try{
      // Safe eval: only allow digits and +-*/
      const expr=multiMatch[1].replace(/\\s/g,'');
      if(/^[\\d+\\-\\*\\/().]+$/.test(expr)){
        const result=Function('"use strict";return ('+expr+')')();
        if(typeof result==='number'&&isFinite(result))return Math.round(result*1000)/1000;
      }
    }catch(e){}
  }
  // Simple two-operand: "5 + 1"
  const simpleMatch=t.match(/(\\d+)\\s*([+\\-\\*\\/])\\s*(\\d+)/);
  if(simpleMatch){
    const a=parseFloat(simpleMatch[1]),op=simpleMatch[2],b=parseFloat(simpleMatch[3]);
    switch(op){
      case'+':return a+b;
      case'-':return a-b;
      case'*':return a*b;
      case'/':return b!==0?Math.round((a/b)*1000)/1000:null;
    }
  }
  // Word-based: "five plus three", "What is seven minus two"
  const wordNums={zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20};
  const wordMatch=t.toLowerCase().match(new RegExp('('+Object.keys(wordNums).join('|')+')\\s*([+\\-*/])\\s*('+Object.keys(wordNums).join('|')+')'));
  if(wordMatch && wordNums[wordMatch[1]]!==undefined && wordNums[wordMatch[3]]!==undefined){
    const a=wordNums[wordMatch[1]],op=wordMatch[2],b=wordNums[wordMatch[3]];
    switch(op){
      case'+':return a+b;
      case'-':return a-b;
      case'*':return a*b;
      case'/':return b!==0?Math.round((a/b)*1000)/1000:null;
    }
  }
  return null;
}

// Smart inference for unmatched fields
function inferValue(el){
  const c=getFieldId(el);
  const emailDomain=tpl.email?tpl.email.split('@')[1]||'':'';
  const emailUser=tpl.email?tpl.email.split('@')[0]||'':'';
  const domainName=emailDomain.split('.')[0]||'';
  
  if(/company|organization|firm|business|brand|corp/i.test(c)){
    return domainName||tpl.name||'';
  }
  if(/website|url|homepage|web.?address/i.test(c)){
    return emailDomain?'https://'+emailDomain:'';
  }
  if(/username|user.?id|login|account/i.test(c)){
    return emailUser||tpl.name||'';
  }
  if(/last.?name|family.?name|surname/i.test(c)){
    return tpl.lastName||tpl.name||'';
  }
  if(/first.?name|given.?name/i.test(c)){
    return tpl.firstName||tpl.name||'';
  }
  if(/(your.?)?(re.?)?enter.*email|confirm.*email|email.*confirm/i.test(c)){
    return tpl.email||'';
  }
  if(/interest|reason|purpose|how.*can|service.*need|what.*help/i.test(c)){
    return tpl.message?tpl.message.substring(0,100):'General inquiry';
  }
  if(/salutation|gender|title/i.test(c)&&el.tagName==='SELECT'){
    return ''; // skip dropdowns we can't determine
  }
  if(el.tagName==='TEXTAREA'&&!el.value){
    return tpl.message||'';
  }
  if(/text|input/i.test(el.type||'text')&&/required/i.test(el.getAttribute('required')||'')){
    // Required text field - try name as last resort
    return tpl.name||'';
  }
  return null;
}

async function bestForm(){
  let targetForm = null;
  
  // [v4.12.44] Shadow DOM을 포함하여 폼 후보 요소를 전방위 재귀 스캔하는 초강력 헬퍼 함수
  const findCandidatesIncludingShadowDOM = (root = document) => {
    const candidates = [];
    const selectors = [
      '[data-hook="wix-form"]', '[data-hook="cf-form"]', 'form[class*="form" i]',
      '[class*="contact-form" i]', '[id*="contact-form" i]', '[class*="wix-form" i]',
      '.wpcf7-form', '.gform_wrapper', '.ninja-forms-form', '.wpforms-form',
      'form', 'fieldset', '.form-wrapper', '.sqs-block-form', 'section[class*="form" i]',
      '[role="form"]', '[class*="form-container" i]', '[id*="form-container" i]'
    ];
    
    // 1. 표준 셀렉터 매칭
    selectors.forEach(sel => {
      try {
        root.querySelectorAll(sel).forEach(el => {
          if (el && !candidates.includes(el)) candidates.push(el);
        });
      } catch(e) {}
    });
    
    // 2. Shadow DOM 내부 재귀 탐색
    const recurseShadows = (node) => {
      if (!node) return;
      if (node.shadowRoot) {
        selectors.forEach(sel => {
          try {
            node.shadowRoot.querySelectorAll(sel).forEach(el => {
              if (el && !candidates.includes(el)) candidates.push(el);
            });
          } catch(e) {}
        });
        recurseShadows(node.shadowRoot);
      }
      let child = node.firstChild;
      while (child) {
        recurseShadows(child);
        child = child.nextSibling;
      }
      
      if (node.querySelectorAll) {
        node.querySelectorAll('*').forEach(el => {
          if (el.shadowRoot) recurseShadows(el);
        });
      }
    };
    recurseShadows(root);
    return candidates;
  };

  for(let attempt=0; attempt<10; attempt++){
    let bestTarget = null;
    let maxScore = -999;
    
    const queryInputs = (root) => {
      const inputs = [];
      const query = (node) => {
        if (!node) return;
        try {
          // 표준 인풋 쿼리
          node.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]),textarea,select').forEach(inp => {
            if (!inputs.includes(inp)) inputs.push(inp);
          });
        } catch(e) {}
        
        // Shadow DOM 내 인풋 탐색
        if (node.shadowRoot) {
          query(node.shadowRoot);
        }
        
        if (node.querySelectorAll) {
          node.querySelectorAll('*').forEach(el => {
            if (el.shadowRoot) query(el.shadowRoot);
          });
        }
      };
      query(root || document);
      return inputs;
    };
    
    // 1. 섀도우 DOM을 포함한 전방위 폼 후보 수집
    const candidates = findCandidatesIncludingShadowDOM();
    
    const allInputs = queryInputs();
    // 2. 후보가 전혀 없을 때 입력창들의 부모 요소를 역추적하여 후보군 생성 (안전망 폴백)
    if (candidates.length === 0 && allInputs.length >= 1) {
      allInputs.forEach(inp => {
        let p = inp.parentElement;
        for(let depth=0; depth<4 && p; depth++) {
          if(p && p !== document.body && p !== document.documentElement && !candidates.includes(p)) {
            candidates.push(p);
          }
          p = p.parentElement;
        }
      });
    }
    
    candidates.forEach(el => {
      if(!el || el === document.body || el === document.documentElement) return;
      let score = 0;
      const inputs = queryInputs(el);
      if(inputs.length < 1) return;
      
      // FORM 태그 가중치
      if(el.tagName === 'FORM') score += 200;
      
      // 요소 내부의 핵심 필드들 매칭 수 카운팅 (대소문자 구분 없이 i플래그 적용)
      const textareas = el.querySelectorAll('textarea').length;
      const emails = el.querySelectorAll('input[type="email"], input[name*="email" i], input[id*="email" i]').length;
      const phones = el.querySelectorAll('input[type="tel" i], input[name*="phone" i], input[id*="phone" i], input[name*="tel" i]').length;
      const names = el.querySelectorAll('input[name*="name" i], input[id*="name" i], input[placeholder*="name" i]').length;
      
      score += textareas * 80; // 가중치 강화
      score += emails * 70;
      score += phones * 50;
      score += names * 35;
      score += inputs.length * 15;
      
      // 3대 필수 요소(이름, 이메일, 본문) 중 3가지 이상이 조화롭게 다수 존재 시 추가 신뢰도 보너스
      let coreMatchCount = 0;
      if (textareas > 0) coreMatchCount++;
      if (emails > 0) coreMatchCount++;
      if (names > 0) coreMatchCount++;
      if (phones > 0) coreMatchCount++;
      if (coreMatchCount >= 3) score += 300; // 초강력 폼 식별 보너스
      
      const id = (el.id || '').toLowerCase();
      const cls = (el.className || '').toString().toLowerCase();
      const info = id + ' ' + cls;
      
      if(info.includes('wpcf7') || info.includes('wpcf7-form')) score += 500;
      if(info.includes('gform') || info.includes('gravity')) score += 350;
      if(info.includes('ninja') || info.includes('nf-')) score += 300;
      if(info.includes('wixui') || info.includes('wix-form')) score += 250;
      // [HubSpot / Marketo / Pardot / EPiServerForms 가중치]
      if(info.includes('hbspt') || info.includes('hs-form') || info.includes('hubspot')) score += 450;
      if(info.includes('mktoform') || info.includes('marketo')) score += 400;
      if(info.includes('pardot') || info.includes('pardot-form')) score += 400;
      if(info.includes('episerver') || info.includes('epiforms') || info.includes('episerverfforms')) score += 350;
      if(info.includes('typeform') || info.includes('jotform') || info.includes('formstack')) score += 300;
      if(info.includes('contact') || info.includes('message') || info.includes('inquiry') || info.includes('contact-form') || info.includes('feedback')) score += 120;
      
      // 검색용 유사 폼 배제 패널티
      if(info.includes('search') || id.includes('search') || cls.includes('search')) score -= 950;
      
      // 제출 버튼 매칭
      const submitBtn = el.querySelector('input[type="submit"], button[type="submit"], button:not([type="button"]), [role="button"], [class*="submit" i], [id*="submit" i]');
      if (submitBtn) {
        score += 80;
        const btnText = (submitBtn.textContent || submitBtn.value || '').toLowerCase();
        if (['send', 'submit', 'message', 'inquiry', '전송', '보내기', '문의', '접수', '送信'].some(k => btnText.includes(k))) score += 100;
      }
      
      if(score > maxScore) {
        maxScore = score;
        bestTarget = el;
      }
    });
    
    if(bestTarget && maxScore >= 10) {
      targetForm = bestTarget;
      break;
    }
    
    await new Promise(r => setTimeout(r, 500));
  }
  
  return targetForm;
}

async function fill(c){
  // [v4.12.25] Query ALL form elements including text, textarea, select (but NOT radio/checkbox — handled separately)
  const els=Array.from(c.querySelectorAll(
    'input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]):not([type=checkbox]):not([type=radio]),textarea,select'
  ));
  const used=new Set();
  let n=0;
  
  // ═══ Pass 1: Primary text field pattern matches ═══
  for(const el of els){
    if(el.tagName==='SELECT')continue;
    
    // [v4.12.46] Intelligent pre-matching for name field categories
    const nameType = detectNameField(el);
    if (nameType) {
      if (nameType === 'first' && !used.has('firstName')) {
        const s = splitName(tpl.name);
        let val = tpl.firstName;
        if (!val || val.trim() === '') val = s.first || tpl.name;
        if (val && val.trim() !== '') {
          if (await tv(el, val)) { used.add('firstName'); n++; continue; }
        }
      }
      if (nameType === 'last' && !used.has('lastName')) {
        const s = splitName(tpl.name);
        let val = tpl.lastName;
        if (!val || val.trim() === '') val = s.last || '';
        if (val && val.trim() !== '') {
          if (await tv(el, val)) { used.add('lastName'); n++; continue; }
        }
      }
      if (nameType === 'full' && !used.has('name')) {
        let val = tpl.name;
        if (!val || val.trim() === '') val = tpl.firstName || '';
        if (val && val.trim() !== '') {
          if (await tv(el, val)) { used.add('name'); n++; continue; }
        }
      }
    }
    
    // Default matching fallback for other primary fields
    for(const k of['firstName','lastName','name','email','phone','companyName','address','city','state','zip','subject','message']){
      if(used.has(k)&&k!=='message')continue;
      
      let val = tpl[k];
      if (k === 'firstName' && (!val || val.trim() === '')) {
        const s = splitName(tpl.name);
        val = (tpl.firstName && tpl.firstName.trim() !== '') ? tpl.firstName : (s.first || tpl.name);
      }
      if (k === 'lastName' && (!val || val.trim() === '')) {
        const s = splitName(tpl.name);
        val = (tpl.lastName && tpl.lastName.trim() !== '') ? tpl.lastName : (s.last || '');
      }
      
      const c2=getFieldId(el);
      if (k === 'lastName' && (c2.includes('first') || c2.includes('given') || c2.includes('fname'))) continue;
      if (k === 'firstName' && (c2.includes('last') || c2.includes('surname') || c2.includes('family') || c2.includes('lname'))) continue;
      if (k === 'name' && (c2.includes('first') || c2.includes('last') || c2.includes('surname') || c2.includes('family') || c2.includes('given'))) continue;
      
      if(val && val.trim() !== '' && P[k].some(r=>r.test(c2))){
        if(await tv(el,val)){used.add(k);n++;await new Promise(r=>setTimeout(r, Math.floor((typeof fillDelayMs !== 'undefined' ? fillDelayMs : 300) * 0.5)));break;}
      }
    }
  }

  // ═══ Pass 1.5: lastName 전용 초강화 패스 (aria-label, placeholder, label 직접 스캔) ═══
  // detectNameField가 실패하는 경우를 위한 fallback 보험
  if (!used.has('lastName')) {
    const s = splitName(tpl.name);
    const lastVal = (tpl.lastName && tpl.lastName.trim() !== '') ? tpl.lastName : (s.last || '');
    if (lastVal && lastVal.trim() !== '') {
      // aria-label 기반 직접 탐색
      const ariaLast = Array.from(c.querySelectorAll('input,textarea')).find(el => {
        const al = (el.getAttribute('aria-label') || '').toLowerCase();
        const ph = (el.placeholder || '').toLowerCase();
        const nm = (el.name || '').toLowerCase();
        const id = (el.id || '').toLowerCase();
        return /\blast.?name\b|\bsurname\b|\bfamily.?name\b|\blname\b/.test(al + ' ' + ph + ' ' + nm + ' ' + id);
      });
      if (ariaLast && ariaLast.value !== lastVal) {
        if (await tv(ariaLast, lastVal)) { used.add('lastName'); n++; }
      }
      // label[for] 기반 직접 탐색
      if (!used.has('lastName')) {
        const labels = Array.from(c.querySelectorAll('label'));
        for (const lbl of labels) {
          if (/\blast.?name\b|\bsurname\b|\bfamily.?name\b|\blname\b/i.test(lbl.textContent || '')) {
            const forAttr = lbl.getAttribute('for');
            const targetEl = forAttr ? (c.querySelector('#' + CSS.escape(forAttr)) || document.getElementById(forAttr)) : null;
            const linkedEl = targetEl || lbl.querySelector('input,textarea') || lbl.parentElement?.querySelector('input,textarea');
            if (linkedEl && linkedEl.value !== lastVal && !linkedEl.disabled && !linkedEl.readOnly) {
              if (await tv(linkedEl, lastVal)) { used.add('lastName'); n++; break; }
            }
          }
        }
      }
    }
  }

  // ═══ Pass 1.6: firstName 전용 강화 패스 ═══
  if (!used.has('firstName')) {
    const s = splitName(tpl.name);
    const firstVal = (tpl.firstName && tpl.firstName.trim() !== '') ? tpl.firstName : (s.first || tpl.name || '');
    if (firstVal && firstVal.trim() !== '') {
      const ariaFirst = Array.from(c.querySelectorAll('input,textarea')).find(el => {
        const al = (el.getAttribute('aria-label') || '').toLowerCase();
        const ph = (el.placeholder || '').toLowerCase();
        const nm = (el.name || '').toLowerCase();
        const id = (el.id || '').toLowerCase();
        return /\bfirst.?name\b|\bgiven.?name\b|\bfname\b|\bforename\b/.test(al + ' ' + ph + ' ' + nm + ' ' + id);
      });
      if (ariaFirst && ariaFirst.value !== firstVal) {
        if (await tv(ariaFirst, firstVal)) { used.add('firstName'); n++; }
      }
      // label[for] 기반 직접 탐색
      if (!used.has('firstName')) {
        const labels = Array.from(c.querySelectorAll('label'));
        for (const lbl of labels) {
          if (/\bfirst.?name\b|\bgiven.?name\b|\bfname\b|\bforename\b/i.test(lbl.textContent || '')) {
            const forAttr = lbl.getAttribute('for');
            const targetEl = forAttr ? (c.querySelector('#' + CSS.escape(forAttr)) || document.getElementById(forAttr)) : null;
            const linkedEl = targetEl || lbl.querySelector('input,textarea') || lbl.parentElement?.querySelector('input,textarea');
            if (linkedEl && linkedEl.value !== firstVal && !linkedEl.disabled && !linkedEl.readOnly) {
              if (await tv(linkedEl, firstVal)) { used.add('firstName'); n++; break; }
            }
          }
        }
      }
    }
  }
  
  // ═══ Pass 2: Text field fallbacks ═══
  if(!used.has('message')&&tpl.message){
    const ta=c.querySelectorAll('textarea');
    if(ta.length>0){await tv(ta[ta.length-1],tpl.message);n++;used.add('message');await new Promise(r=>setTimeout(r, Math.floor((typeof fillDelayMs !== 'undefined' ? fillDelayMs : 300) * 0.5)));}
  }
  if(!used.has('name')&&tpl.name){
    const ti=c.querySelector('input[type=text],input:not([type])');
    if(ti&&!ti.value){await tv(ti,tpl.name);n++;used.add('name');}
  }
  
  // ═══ Pass 2.5: 전화번호 국가코드 자동 미국(+1) 설정 ═══
  // [intl-tel-input 및 커스텀 국가코드 위젯 전용 처리]
  n += await fillPhoneCountryCode(c);

  // ═══ Pass 3: SELECT dropdowns (smart fill) ═══
  const selects=Array.from(c.querySelectorAll('select'));
  for(const sel of selects){
    if(await fillSelect(sel)){n++;}
  }
  
  // ═══ Pass 4: Radio button groups ═══
  n+=await fillRadioGroups(c);
  
  // ═══ Pass 5: Checkboxes (terms, required, consent) ═══
  n+=await fillCheckboxes(c);
  
  // ═══ Pass 6: Custom (non-native) dropdowns (Wix/React) ═══
  n+=await fillCustomDropdowns(c);
  
  // ═══ Pass 7: Math CAPTCHA solver (e.g. "5+1=", "What is 3×7?") ═══
  n+=await solveMathCaptchas(c);
  
  // ═══ Pass 8: Smart inference for remaining empty fields ═══
  for(const el of els){
    if(el.value||el.tagName==='SELECT')continue;
    const inferred=inferValue(el);
    if(inferred){await tv(el,inferred);n++;await new Promise(r=>setTimeout(r, Math.floor((typeof fillDelayMs !== 'undefined' ? fillDelayMs : 300) * 0.3)));}
  }

  // ═══ Pass 9: Super-BruteForce Final Target Sweeper (초강력 무작위 및 잔여 필드 전수 입력) ═══
  try {
    const finalInputs = Array.from(c.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]),textarea,select'));

    for(const el of finalInputs) {
      if(el.disabled || el.readOnly) continue;
      
      // 이미 체크되었거나 값이 입력된 것은 스킵
      if(el.type === 'checkbox' && el.checked) continue;
      if(el.type === 'radio' && el.checked) continue;
      
      const currentVal = el.contentEditable === 'true' ? (el.textContent || '') : (el.value || '');
      if((el.tagName !== 'SELECT' && el.type !== 'checkbox' && el.type !== 'radio') && currentVal.trim() !== '') continue;
      
      if(el.tagName === 'SELECT') {
        if(await fillSelect(el)) { n++; }
        else {
          const opts = Array.from(el.options);
          const validIdx = opts.findIndex((o, i) => i > 0 && o.value && o.value.trim() !== '' && !o.disabled);
          if(validIdx > 0) {
            await humanClick(el);
            el.selectedIndex = validIdx;
            el.value = opts[validIdx].value;
            ['input','change','blur'].forEach(t=>el.dispatchEvent(new Event(t,{bubbles:true})));
            n++;
            await new Promise(r=>setTimeout(r,100));
          }
        }
      } else if(el.type === 'checkbox') {
        await humanClick(el);
        el.checked = true;
        ['input','change','click'].forEach(t=>el.dispatchEvent(new Event(t,{bubbles:true})));
        n++;
        await new Promise(r=>setTimeout(r,100));
      } else if(el.type === 'radio') {
        await humanClick(el);
        el.checked = true;
        ['input','change'].forEach(t=>el.dispatchEvent(new Event(t,{bubbles:true})));
        n++;
        await new Promise(r=>setTimeout(r,100));
      } else {
        const val = generateSmartRandomValue(el);
        if(val) {
          await tv(el, val);
          n++;
          await new Promise(r=>setTimeout(r,100));
        }
      }
    }
  } catch(e) {}
  
  // [v4.12.46] Form State Lock Sync Guard (forces synchronization of all populated fields before submit)
  // [BUGFIX] textarea(메시지 필드) 등 제어형 React 컴포넌트(controlled input)에서
  //          onChange 호출 시 React 상태가 빈 값으로 초기화되어 메시지가 지워지는 현상 수정
  //          → textarea 값은 setNativeValue + input/change 이벤트만 발송하고 React onChange는 호출하지 않음
  try {
    const finalInputs = Array.from(c.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]),textarea,select'));
    for (const el of finalInputs) {
      if (el.disabled || el.readOnly) continue;
      
      const currentVal = el.tagName === 'SELECT' ? el.value : (el.contentEditable === 'true' ? el.textContent : el.value);
      if (currentVal && currentVal.trim() !== '') {
        setNativeValue(el, currentVal);
        ['input', 'change', 'blur'].forEach(t => el.dispatchEvent(new Event(t, { bubbles: true, cancelable: true })));
        
        // [BUGFIX] textarea 메시지 필드에서는 React onChange를 강제 호출하지 않음
        // → React controlled textarea의 onChange가 빈 state를 re-render하면 입력한 메시지가 지워짐
        if (el.tagName === 'TEXTAREA') continue;
        
        try {
          const rk = Object.keys(el).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
          if (rk) {
            const props = (el[rk]?.memoizedProps || el[rk]?.pendingProps || el[rk]);
            if (typeof props?.onChange === 'function') {
              props.onChange({ target: el, currentTarget: el, type: 'change', bubbles: true });
            }
          }
        } catch(e) {}
      }
    }
  } catch(e) {}
  
  return n;
}

// Shadow DOM 내부 탐색을 지원하는 헬퍼 함수들 추가
function querySelectorIncludingShadowDOM(root, selector) {
  if (!root) return null;
  
  if (root.querySelector) {
    try {
      const el = root.querySelector(selector);
      if (el) return el;
    } catch(e) {}
  }
  
  if (root.querySelectorAll) {
    try {
      const all = root.querySelectorAll('*');
      for (const node of all) {
        if (node.shadowRoot) {
          const found = querySelectorIncludingShadowDOM(node.shadowRoot, selector);
          if (found) return found;
        }
      }
    } catch(e) {}
  }
  
  let child = root.firstChild;
  while (child) {
    const found = querySelectorIncludingShadowDOM(child, selector);
    if (found) return found;
    child = child.nextSibling;
  }
  
  return null;
}

function querySelectorAllIncludingShadowDOM(root, selector, results = []) {
  if (!root) return results;
  
  if (root.querySelectorAll) {
    try {
      root.querySelectorAll(selector).forEach(el => {
        if (!results.includes(el)) results.push(el);
      });
    } catch(e) {}
    
    try {
      const all = root.querySelectorAll('*');
      for (const node of all) {
        if (node.shadowRoot) {
          querySelectorAllIncludingShadowDOM(node.shadowRoot, selector, results);
        }
      }
    } catch(e) {}
  }
  
  let child = root.firstChild;
  while (child) {
    querySelectorAllIncludingShadowDOM(child, selector, results);
    child = child.nextSibling;
  }
  
  return results;
}

async function submit(c){
  // 1. [Stealth Bypass] 폼에 걸려 있는 인라인 차단 리스너 무력화 시도
  try {
    if (c.tagName === 'FORM') {
      c.onsubmit = null;
    }
  } catch(e) {}

  // 2. [Force Enable] 모든 형태의 제출 버튼 비활성화 상태 강제 해제 (Shadow DOM 지원)
  const allPossibleButtons = querySelectorAllIncludingShadowDOM(c, 'button, input[type="submit"], input[type="button"], a, div, span, [role="button"]');
  allPossibleButtons.forEach(b => {
    try {
      b.disabled = false;
      b.removeAttribute('disabled');
      b.removeAttribute('aria-disabled');
      b.classList.remove('disabled', 'is-disabled');
      if (b.style.pointerEvents === 'none') b.style.pointerEvents = 'auto';
    } catch(e) {}
  });

  // 3. [Super Click Action Chain] 대상 요소에 강력한 마우스/터치/포인터 클릭 시뮬레이션
  const triggerForceClick = async (el) => {
    if (!el) return false;
    try {
      // 화면 내 위치로 스크롤 정렬
      try { el.scrollIntoView({ behavior: 'auto', block: 'center' }); } catch(e){}
      
      const rect = el.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      
      const eventOpts = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, screenX: x, screenY: y, button: 0, buttons: 1 };
      
      // 사람과 유사하게 15ms 시간 차이를 두며 이벤트를 연쇄 격발
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      
      el.dispatchEvent(new PointerEvent('pointerover', eventOpts));
      await sleep(15);
      el.dispatchEvent(new MouseEvent('mouseover', eventOpts));
      await sleep(15);
      el.dispatchEvent(new PointerEvent('pointerdown', eventOpts));
      await sleep(15);
      el.dispatchEvent(new MouseEvent('mousedown', eventOpts));
      await sleep(15);
      
      try { el.focus(); } catch(e){}
      
      el.dispatchEvent(new PointerEvent('pointerup', eventOpts));
      await sleep(15);
      el.dispatchEvent(new MouseEvent('mouseup', eventOpts));
      await sleep(15);
      el.dispatchEvent(new PointerEvent('click', eventOpts));
      await sleep(15);
      el.dispatchEvent(new MouseEvent('click', eventOpts));
      
      // 네이티브 click() 호출
      el.click();
      
      // 폼 제출 트리거 (AJAX 및 프레임워크 리스너를 우회하지 않도록 requestSubmit 우선 적용!)
      const form = el.form || el.closest('form');
      if (form) {
        try {
          if (typeof form.requestSubmit === 'function') {
            form.requestSubmit(el);
          } else {
            const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
            form.dispatchEvent(submitEvent);
            if (!submitEvent.defaultPrevented) {
              HTMLFormElement.prototype.submit.call(form);
            }
          }
        } catch(e) {
          try { HTMLFormElement.prototype.submit.call(form); } catch(err){}
        }
      }
      return true;
    } catch(e) {
      try { el.click(); return true; } catch(err) { return false; }
    }
  };

  // 4. [Pass 1] 표준 및 클래스명 기반 제출/등록 버튼 다각도 탐색
  const sels = [
    'button[type=submit]', 'input[type=submit]', 
    '[class*="submit"i]', '[id*="submit"i]', '[name*="submit"i]', '[value*="submit"i]',
    'button:not([type=button]):not([type=reset])',
    'button.btn-primary', 'button.primary', 'a.primary', '.primary-btn',
    '[class*="btn-submit"i]', '[class*="button-submit"i]',
    '[class*="send"i]', '[id*="send"i]', '[value*="send"i]',
    '[class*="btn-primary"i]', '.gform_button', '.wpcf7-submit', '.nf-button', '.wpforms-submit',
    '[data-hook*="submit"i]', '[data-hook*="send"i]', '[data-testid*="submit"i]', '[data-testid*="send"i]',
    '[aria-label*="submit"i]', '[aria-label*="send"i]'
  ];
    
  for (const s of sels) {
    const b = querySelectorIncludingShadowDOM(c, s);
    if (b) {
      console.log("[Submit Guard] Found submit button by selector: " + s + ". Triggering click...");
      if (await triggerForceClick(b)) {
        await new Promise(r => setTimeout(r, 600)); // 격발 시간차 제공
      }
    }
  }
  
  // 5. [Pass 2] 텍스트 매칭 기반 커스텀 버튼/링크/디브 탐색 및 격발
  for (const b of allPossibleButtons) {
    const txt = (b.textContent || b.value || b.getAttribute('placeholder') || '').toLowerCase().trim();
    const isSubmitText = ['submit', 'submit now', 'send', 'send now', '전송', '등록', '보내기', '확인', '완료', '메시지 남기기', '문의하기', '접수', '送信', '제출', '신청'].some(k => txt === k || (txt.length < 15 && txt.includes(k)));
    if (isSubmitText) {
      console.log("[Submit Guard] Found submit button by text: " + txt + ". Triggering click...");
      if (await triggerForceClick(b)) {
        await new Promise(r => setTimeout(r, 600));
      }
    }
  }

  // 6. [Pass 3] 키보드 Enter 격발 폴백 시도
  try {
    const activeInp = c.querySelector('input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea');
    if (activeInp) {
      console.log("[Submit Guard] Dispatching Enter key event to active input...");
      const enterOpts = { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', keyCode: 13, which: 13 };
      activeInp.dispatchEvent(new KeyboardEvent('keydown', enterOpts));
      activeInp.dispatchEvent(new KeyboardEvent('keypress', enterOpts));
      activeInp.dispatchEvent(new KeyboardEvent('keyup', enterOpts));
    }
  } catch(e) {}

  // 7. [Pass 4] HTML5 requestSubmit() 또는 네이티브 Form.submit() 강제 호출 (최종 보루)
  if (c.tagName === 'FORM') {
    try {
      console.log("[Submit Guard] Executing requestSubmit on Form tag...");
      if (typeof c.requestSubmit === 'function') {
        c.requestSubmit();
      } else {
        const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
        c.dispatchEvent(submitEvent);
        if (!submitEvent.defaultPrevented) {
          HTMLFormElement.prototype.submit.call(c);
        }
      }
      return true;
    } catch(e) {
      try { HTMLFormElement.prototype.submit.call(c); return true; } catch(err) {}
    }
  }

  const f = c.closest ? c.closest('form') : null;
  if (f) {
    try {
      console.log("[Submit Guard] Executing requestSubmit on closest Form...");
      if (typeof f.requestSubmit === 'function') {
        f.requestSubmit();
      } else {
        const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
        f.dispatchEvent(submitEvent);
        if (!submitEvent.defaultPrevented) {
          HTMLFormElement.prototype.submit.call(f);
        }
      }
      return true;
    } catch(e) {
      try { HTMLFormElement.prototype.submit.call(f); return true; } catch(err) {}
    }
    
    const b = querySelectorIncludingShadowDOM(f, 'button, input[type=submit]');
    if (b) {
      if (await triggerForceClick(b)) return true;
    }
  }

  // 최상위 폼 내부의 네이티브 form 태그를 찾아서 submit 시도
  try {
    const innerForm = c.querySelector('form');
    if (innerForm) {
      console.log("[Submit Guard] Executing requestSubmit on inner form tag...");
      if (typeof innerForm.requestSubmit === 'function') {
        innerForm.requestSubmit();
      } else {
        const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
        innerForm.dispatchEvent(submitEvent);
        if (!submitEvent.defaultPrevented) {
          HTMLFormElement.prototype.submit.call(innerForm);
        }
      }
      return true;
    }
  } catch(e) {}

  return true; // 다양한 격발 시도를 보냈으므로 true 리턴 후 성공 스니퍼에 양도
}

// Cookie banner cleanup
document.querySelectorAll('[class*="cookie"i],[id*="cookie"i],[class*="banner"i],[id*="banner"i]').forEach(el=>{
  const s=getComputedStyle(el);
  if(s.position==='fixed'||s.position==='sticky'){try{el.style.display='none';}catch(e){}}
});

// Wait for Wix SDK to initialize (checks every 500ms, up to 12s)
let wixReady=false;
for(let i=0;i<24;i++){
  await new Promise(r=>setTimeout(r,500));
  const hasInputs=document.querySelectorAll('input:not([type=hidden]),textarea').length>0;
  const wixLoaded=typeof window.wixEmbedsAPI!=='undefined'||typeof window.Wix!=='undefined'||hasInputs;
  if(wixLoaded){wixReady=true;break;}
}
if(!wixReady)await new Promise(r=>setTimeout(r,3000));
await new Promise(r=>setTimeout(r,1000)); // extra buffer

const f=await bestForm();
if(!f){window.__xpider_result={success:false,reason:'NO_FORM'};return;}

// 🛡️ [CAPTCHA Wait Guard] CAPTCHA가 존재하고 아직 풀리지 않았다면 대기
try {
  const tsWidgetEl = document.querySelector('.cf-turnstile, [data-sitekey^="0x4"], iframe[src*="challenges.cloudflare.com"]');
  const hasCfTurnstile = !!tsWidgetEl;
  
  const hcWidgetEl = document.querySelector('.h-captcha, iframe[src*="hcaptcha.com"]');
  let hasHcaptcha = !!hcWidgetEl;
  if (!hasHcaptcha) {
      const hcSitekeyEl = document.querySelector('[data-sitekey]');
      const skVal = hcSitekeyEl ? hcSitekeyEl.getAttribute('data-sitekey') : '';
      if (skVal && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(skVal)) {
          hasHcaptcha = true;
      }
  }

  let hasRecaptcha = !!(document.querySelector('.g-recaptcha') || document.querySelector('iframe[src*="recaptcha/api2/anchor"]'));
  if (!hasRecaptcha) {
      const possibleRec = document.querySelector('[data-sitekey]');
      if (possibleRec) {
          const skVal = possibleRec.getAttribute('data-sitekey') ? possibleRec.getAttribute('data-sitekey').trim() : '';
          if (skVal && !skVal.startsWith('0x4') && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(skVal)) {
              hasRecaptcha = true;
          }
      }
  }

  let captchaWaiting = false;
  if (hasRecaptcha || hasHcaptcha || hasCfTurnstile) {
      captchaWaiting = true;
  }

  if (captchaWaiting) {
      // [v18.80.0] Real-time Captcha Solver Logs Floating Popup UI
      const showSolverLogsPopup = () => {
          if (document.getElementById('xpider-solver-popup')) return;
          
          const popup = document.createElement('div');
          popup.id = 'xpider-solver-popup';
          
          const targetEl = document.querySelector('.g-recaptcha') || 
                           document.querySelector('iframe[src*="recaptcha/api2/anchor"]') ||
                           document.querySelector('.cf-turnstile') ||
                           document.querySelector('iframe[src*="challenges.cloudflare.com"]') ||
                           document.querySelector('[data-sitekey]');
                           
          let popupStyle = 'position: fixed; width: 380px; height: 200px; background: rgba(15, 23, 42, 0.92); ' +
                           'backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border: 1px solid rgba(255, 255, 255, 0.15); ' +
                           'border-radius: 12px; color: #f8fafc; font-family: system-ui, -apple-system, sans-serif; ' +
                           'box-shadow: 0 12px 40px rgba(0, 0, 0, 0.65); z-index: 100000000; display: flex; flex-direction: column; ' +
                           'overflow: hidden; transition: all 0.3s ease; ';

          if (targetEl) {
              const rect = targetEl.getBoundingClientRect();
              const top = Math.max(10, Math.min(window.innerHeight - 220, rect.top - 210 + window.scrollY));
              const left = Math.max(10, Math.min(window.innerWidth - 400, rect.left + rect.width / 2 - 190 + window.scrollX));
              popupStyle += 'position: absolute; top: ' + top + 'px; left: ' + left + 'px; animation: xpiderFadeIn 0.3s ease-out forwards;';
          } else {
              popupStyle += 'position: fixed; bottom: 24px; right: 24px; animation: xpiderFadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;';
          }
          
          popup.style.cssText = popupStyle;

          const style = document.createElement('style');
          style.textContent = '@keyframes xpiderFadeIn { from { opacity: 0; transform: translateY(20px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } } ' +
                              '@keyframes xpiderPulse { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } } ' +
                              '.solver-log-line { margin: 4px 0; font-size: 11px; line-height: 1.4; font-family: monospace; border-left: 2px solid #38bdf8; padding-left: 6px; } ' +
                              '.solver-log-success { border-left-color: #4ade80 !important; color: #4ade80; } ' +
                              '.solver-log-warn { border-left-color: #fbbf24 !important; color: #fbbf24; } ' +
                              '.solver-log-info { border-left-color: #38bdf8 !important; color: #e2e8f0; }';
          document.head.appendChild(style);

          const header = document.createElement('div');
          header.style.cssText = 'padding: 10px 14px; background: rgba(30, 41, 59, 0.5); border-bottom: 1px solid rgba(255, 255, 255, 0.1); display: flex; align-items: center; gap: 8px;';

          const dot = document.createElement('div');
          dot.id = 'xpider-solver-dot';
          dot.style.cssText = 'width: 8px; height: 8px; background-color: #0ea5e9; border-radius: 50%; animation: xpiderPulse 1.5s infinite;';

          const title = document.createElement('span');
          title.id = 'xpider-solver-title';
          title.innerText = 'REAL-TIME SOLVER LOGS';
          title.style.cssText = 'font-size: 12px; font-weight: 700; letter-spacing: 0.05em; color: #38bdf8;';

          header.appendChild(dot);
          header.appendChild(title);

          const consoleArea = document.createElement('div');
          consoleArea.id = 'xpider-solver-console';
          consoleArea.style.cssText = 'flex: 1; padding: 12px; overflow-y: auto; font-size: 11px; background: rgba(2, 6, 23, 0.4);';

          popup.appendChild(header);
          popup.appendChild(consoleArea);
          document.body.appendChild(popup);
      };

      const addSolverLog = (msg, type = 'info') => {
          try { showSolverLogsPopup(); } catch(e){}
          const consoleArea = document.getElementById('xpider-solver-console');
          if (!consoleArea) return;

          const line = document.createElement('div');
          line.className = 'solver-log-line solver-log-' + type;
          
          const now = new Date();
          const pad = (n) => String(n).padStart(2, '0');
          const timeStr = pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
          
          line.innerText = '[' + timeStr + '] ' + msg;
          consoleArea.appendChild(line);
          consoleArea.scrollTop = consoleArea.scrollHeight;
      };

      const closeSolverLogsPopup = (success = true) => {
          const popup = document.getElementById('xpider-solver-popup');
          if (!popup) return;

          const title = document.getElementById('xpider-solver-title');
          const dot = document.getElementById('xpider-solver-dot');
          if (title && dot) {
              if (success) {
                  title.innerText = 'SOLVER SUCCESS';
                  title.style.cssText = 'font-size: 20px; font-weight: 900; color: #ffffff; text-shadow: 0 0 10px #4ade80, 0 0 20px #4ade80, 0 0 35px #22c55e, 0 0 50px #22c55e; transition: all 0.3s ease;';
                  dot.style.backgroundColor = '#4ade80';
                  dot.style.boxShadow = '0 0 12px #4ade80, 0 0 25px #22c55e';
                  dot.style.animation = 'none';
              } else {
                  title.innerText = 'SOLVER FAILED / TIMEOUT';
                  title.style.color = '#f87171';
                  dot.style.backgroundColor = '#f87171';
                  dot.style.animation = 'none';
              }
          }

          setTimeout(() => {
              popup.style.opacity = '0';
              popup.style.transform = 'translateY(15px) scale(0.95)';
              setTimeout(() => {
                  popup.remove();
              }, 300);
          }, success ? 4500 : 3500);
      };

      const getCaptchaSitekey = () => {
          const el = document.querySelector('.g-recaptcha') || 
                     document.querySelector('iframe[src*="recaptcha/api2/anchor"]') ||
                     document.querySelector('.cf-turnstile') ||
                     document.querySelector('iframe[src*="challenges.cloudflare.com"]') ||
                     document.querySelector('[data-sitekey]');
          if (!el) return '';
          const sk = el.getAttribute('data-sitekey') || '';
          if (sk) return sk;
          try {
              const src = el.src || '';
              if (src.includes('recaptcha')) {
                  const kMatch = src.match(/[?&]k=([^&]+)/);
                  if (kMatch) return kMatch[1];
              }
              if (src.includes('hcaptcha.com')) {
                  const skMatch = src.match(/[?&]sitekey=([^&]+)/);
                  if (skMatch) return skMatch[1];
              }
          } catch(e){}
          return '';
      };

      console.log("⏳ [XPIDER Form Filler] CAPTCHA detected. Checking solver status (3 attempts max)...");
      addSolverLog("CAPTCHA detected. Checking solver status...", "info");
      let solveSuccess = false;
      
      const initialKey = getCaptchaSitekey();
      
      for (let attempt = 1; attempt <= 3; attempt++) {
          console.log("⏳ [XPIDER Form Filler] Attempt " + attempt + "/3 to solve CAPTCHA...");
          addSolverLog("Attempt " + attempt + "/3 to solve CAPTCHA...", "info");
          
          // [레이스 컨디션 방지] UltraSolver Pro가 캡차를 감지하고 attribute를 심을 때까지 최대 3.5초 선행 대기 (조기 통과 최적화)
          const startScan = Date.now();
          let isUspActive = false;
          while (Date.now() - startScan < 3500) {
              const isSolving = document.documentElement.getAttribute('data-usp-solving');
              if (isSolving === 'true' || isSolving === 'done') {
                  isUspActive = true;
                  break;
              }
              
              // 대기 도중에 이미 토큰이 기입되었는지 초고속 체크 (이미 해결되었으면 즉시 탈출)
              const recTextarea = document.querySelector('textarea[name="g-recaptcha-response"], textarea[id="g-recaptcha-response"], [name*="recaptcha-response"]');
              const hTextarea = document.querySelector('textarea[name="h-captcha-response"], [name*="h-captcha-response"]');
              const cfInput = document.querySelector('input[name="cf-turnstile-response"], [name*="turnstile-response"]');
              
              const recVal = recTextarea ? recTextarea.value : '';
              const hVal = hTextarea ? hTextarea.value : '';
              const cfVal = cfInput ? cfInput.value : '';
              
              const isRecaptchaReady = !hasRecaptcha || (recTextarea && recVal && recVal.trim() !== '' && !recVal.startsWith('XPIDER_BYPASS_'));
              const isHcaptchaReady = !hasHcaptcha || (hTextarea && hVal && hVal.trim() !== '' && !hVal.startsWith('XPIDER_BYPASS_'));
              const isCfTurnstileReady = !hasCfTurnstile || (cfInput && cfVal && cfVal.trim() !== '' && !cfVal.startsWith('XPIDER_BYPASS_'));
              
              if (isRecaptchaReady && isHcaptchaReady && isCfTurnstileReady) {
                  isUspActive = true;
                  break;
              }
              await new Promise(r => setTimeout(r, 150));
          }
          
          if (isUspActive) {
              addSolverLog("Solver active (UltraSolver Pro engaged).", "info");
          } else {
              addSolverLog("Waiting for UltraSolver Pro initialization...", "warn");
          }

          console.log("⏳ [XPIDER Form Filler] Waiting for solver to inject token for attempt " + attempt + "...");
          addSolverLog("Solving CAPTCHA. Waiting for response token...", "info");
          const attemptTimeout = 30000; // 시도당 30초 대기
          const startWait = Date.now();
          let currentAttemptSuccess = false;
          
          let lastTimeLeft = -1;
          while (Date.now() - startWait < attemptTimeout) {
              const solverState = document.documentElement.getAttribute('data-usp-solving');
              const isSolverStillSolving = solverState === 'true';

              const recTextarea = document.querySelector('textarea[name="g-recaptcha-response"], textarea[id="g-recaptcha-response"], [name*="recaptcha-response"], [id*="recaptcha-response"]');
              const hTextarea = document.querySelector('textarea[name="h-captcha-response"], textarea[id="h-captcha-response"], [name*="h-captcha-response"], [id*="h-captcha-response"]');
              
              let cfInput = document.querySelector('input[name="cf-turnstile-response"]');
              if (!cfInput) {
                  const tsWidget = document.querySelector('.cf-turnstile, [data-response-field-name]');
                  const fieldName = tsWidget ? tsWidget.getAttribute('data-response-field-name') : null;
                  if (fieldName) {
                      cfInput = document.querySelector('input[name="' + fieldName + '"], textarea[name="' + fieldName + '"]');
                  }
              }
              if (!cfInput) {
                  cfInput = document.querySelector('input[name*="turnstile"], textarea[name*="turnstile"]');
              }
              
              const recVal = recTextarea ? recTextarea.value : '';
              const hVal = hTextarea ? hTextarea.value : '';
              const cfVal = cfInput ? cfInput.value : '';
              
              const isRecaptchaReady = !hasRecaptcha || (recTextarea && recVal && recVal.trim() !== '' && !recVal.startsWith('XPIDER_BYPASS_'));
              const isHcaptchaReady = !hasHcaptcha || (hTextarea && hVal && hVal.trim() !== '' && !hVal.startsWith('XPIDER_BYPASS_'));
              const isCfTurnstileReady = !hasCfTurnstile || (cfInput && cfVal && cfVal.trim() !== '' && !cfVal.startsWith('XPIDER_BYPASS_'));
              
              if (isRecaptchaReady && isHcaptchaReady && isCfTurnstileReady && !isSolverStillSolving) {
                  currentAttemptSuccess = true;
                  break;
              }
              
              // [초고속 강제 리셋 가속] 솔버 상태가 false가 되었거나 새로운 캅차가 발견되면 30초 대기 중단 후 즉시 탈출
              const currentKey = getCaptchaSitekey();
              if (currentKey && initialKey && currentKey !== initialKey) {
                  addSolverLog("New CAPTCHA detected. Aborting current solver task...", "warn");
                  break;
              }
              if (!isSolverStillSolving && !isRecaptchaReady && !isHcaptchaReady && !isCfTurnstileReady && (Date.now() - startWait > 5000)) {
                  addSolverLog("Solver reported failure or idle state. Breaking to reset...", "warn");
                  break;
              }
              
              const elapsed = Math.floor((Date.now() - startWait) / 1000);
              const timeLeft = Math.max(0, 30 - elapsed);
              if (timeLeft % 5 === 0 && timeLeft !== lastTimeLeft && timeLeft > 0) {
                  addSolverLog("Token pending... (" + timeLeft + "s remaining)", "info");
                  lastTimeLeft = timeLeft;
              }
              await new Promise(r => setTimeout(r, 300)); // 폴링 주기를 1초에서 300ms로 단축
          }
          
          if (currentAttemptSuccess) {
              solveSuccess = true;
              console.log("🎯 [XPIDER Form Filler] CAPTCHA successfully solved on attempt " + attempt + "!");
              addSolverLog("CAPTCHA successfully solved on attempt " + attempt + "!", "success");
              try { closeSolverLogsPopup(true); } catch(e){}
              break;
          } else if (attempt < 3) {
              console.log("⚠️ [XPIDER Form Filler] Attempt " + attempt + " failed. Resetting CAPTCHA for retry...");
              addSolverLog("Attempt " + attempt + " failed. Resetting CAPTCHA for retry...", "warn");
              try {
                  if (hasRecaptcha && window.grecaptcha && typeof window.grecaptcha.reset === 'function') {
                      window.grecaptcha.reset();
                  } else if (hasHcaptcha && window.hcaptcha && typeof window.hcaptcha.reset === 'function') {
                      window.hcaptcha.reset();
                  } else if (hasCfTurnstile && window.turnstile && typeof window.turnstile.reset === 'function') {
                      window.turnstile.reset();
                  }
              } catch(e) {}
              await new Promise(r => setTimeout(r, 2000)); // 리셋 후 2초 대기
          } else {
              addSolverLog("All 3 attempts to solve CAPTCHA failed.", "warn");
              try { closeSolverLogsPopup(false); } catch(e){}
          }
      }
  }
} catch(e) {
  console.error("Error in CAPTCHA Wait Guard:", e);
}

// 폼 자동완성을 완벽하게 수행
const n = await fill(f);

// Human-like pause before submit
await new Promise(r=>setTimeout(r, typeof submitDelayMs !== 'undefined' ? submitDelayMs : 1200));

// 1차 자동 등록 버튼 제출 시도 (submit 함수 내부에서 각종 리스너 무력화 및 클릭)
const ok = await submit(f);

// 2차 수동 마우스 클릭 시뮬레이션으로 등록 버튼 추가 클릭 진행
try {
  const submitBtn = f.querySelector('input[type="submit"], button[type="submit"], [class*="submit"i], [id*="submit"i], [class*="send"i], [id*="send"i]');
  if (submitBtn && !submitBtn.disabled) {
    console.log("🖱️ [XPIDER Form Filler] Stage 2: Performing human-like click simulation on submit button...");
    await humanClick(submitBtn);
  }
} catch(e) {}

// 제출 완료 후 충분한 시간을 대기 (최소 5.5초 버퍼)
await new Promise(r => setTimeout(r, 5500));

// 🔍 [Precision Submission Verifier] 실시간 초정밀 성공 관측 루프 (최대 20초)
let finalSuccess = ok;
let failureReason = ok ? 'SUBMITTED' : 'NO_SUBMIT_BTN';

if (ok) {
  const initialUrl = window.location.href;
  const initialTitle = document.title;
  
  // 감지 주기 설정 (매 500ms마다 실행, 총 40회 = 20초)
  for (let step = 0; step < 40; step++) {
    await new Promise(r => setTimeout(r, 500));

    const currentUrl = window.location.href;
    const currentTitle = document.title;
    const bodyText = (document.body ? document.body.innerText : '').toLowerCase();
    const htmlText = (document.documentElement ? document.documentElement.innerHTML : '').toLowerCase();

    // 1. [Error Sniffing] 클라이언트 유효성 검사 오류 및 전송 실패 경고 메시지 감지
    // [개선] 본문 전체에 단순히 'required'가 있는 것으로 실패 처리하지 않고, 실제 에러 클래스를 지닌 요소 내부 텍스트 및 대표적인 유효성 실패 문자열이 화면에 동적으로 잡힐 때만 에러 처리
    let hasClientError = false;
    try {
      const errElements = document.querySelectorAll('.error, .invalid, .wpcf7-not-valid, .validation-error, .gfield_error, [class*="error"i]:not(form):not(body):not(html)');
      for (const errEl of errElements) {
        const txt = (errEl.textContent || '').trim().toLowerCase();
        if (/required|invalid|failed|입력|올바르지|오류/i.test(txt)) {
          hasClientError = true;
          break;
        }
      }
      
      // 본문 영역 내의 명백한 에러 문구 매칭 (required는 제외하여 오인식 방지)
      if (!hasClientError) {
        hasClientError = /invalid|failed|gfield_error|wpcf7-not-valid|오류가 발생했습니다|올바르지 않습니다/i.test(bodyText) ||
                         htmlText.includes('wpcf7-validation-errors') ||
                         htmlText.includes('gform_validation_container');
      }
    } catch(e) {}
                            
    if (hasClientError) {
      finalSuccess = false;
      failureReason = 'CLIENT_VALIDATION_FAILED';
      break; // 실패 지표 확정이므로 감시 루프 조기 탈출
    }

    // 2. [Success Sniffing - Network] Monkey Patching 결과 감지
    if (window.__xpider_ajax_success) {
      finalSuccess = true;
      failureReason = 'SUBMITTED_SUCCESSFULLY';
      break;
    }

    // 3. [Success Sniffing - URL/Title] 성공 페이지 리다이렉트 감지
    const isUrlChanged = currentUrl !== initialUrl;
    const isTitleChanged = currentTitle !== initialTitle;
    
    const isSuccessUrl = isUrlChanged && /thank|success|confirm|complete|sent/i.test(currentUrl);
    const isSuccessTitle = isTitleChanged && /thank|success|complete|감사|성공|완료/i.test(currentTitle);
    
    if (isSuccessUrl || isSuccessTitle) {
      finalSuccess = true;
      failureReason = 'SUBMITTED_SUCCESSFULLY';
      break;
    }

    // 4. [Success Sniffing - DOM Content] 성공 메시지 핑거프린트 감지
    const hasSuccessText = /thank you|thank-you|메시지를 보냈습니다|문의가 접수되었습니다|성공적으로 전송|접수 완료|successfully|your message (has been|was) sent|form has been submitted|your form|form submitted|form submission|we('ll| will) be in touch|we have received|message received|we received your|we got your|inquiry received|contact received|submitted successfully|will be in touch|will contact you|will get back|submitted|등록되었습니다|성공|완료|전송되었습니다|wpcf7-mail-sent-ok|gform_confirmation_message|g-recaptcha-success/i.test(bodyText) ||
                           htmlText.includes('wpcf7-mail-sent-ok') ||
                           htmlText.includes('wpforms-confirmation-container-id') ||
                           htmlText.includes('wix-form-success') ||
                           htmlText.includes('form-success') ||
                           htmlText.includes('success-message') ||
                           htmlText.includes('confirmation-message') ||
                           !!document.querySelector('.form-success, .success-message, .confirmation-message, [class*="success" i], [id*="success" i], .message-sent, [class*="form-sent" i], [class*="sent-confirmation" i]');
                           
    if (hasSuccessText) {
      finalSuccess = true;
      failureReason = 'SUBMITTED_SUCCESSFULLY';
      break;
    }
  }
}

window.__xpider_result = { success: finalSuccess, reason: failureReason, filled: n };
})();`;
}

// ─── Frame Helpers (Wix/iframe support) ──────────────────────
function getAllFrames(frame) {
    const result = [frame];
    try {
        for (const child of (frame.childFrames || [])) {
            result.push(...getAllFrames(child));
        }
    } catch(e) {}
    return result;
}

async function injectIntoAllFrames(wc, script) {
    // 1. Main frame
    try { await wc.executeJavaScript(script); } catch(e) {}
    // 2. All child frames (Wix TPA iframes etc.)
    try {
        const frames = getAllFrames(wc.mainFrame);
        for (const frame of frames) {
            if (frame === wc.mainFrame) continue;
            try { await frame.executeJavaScript(script); } catch(e) {}
        }
    } catch(e) {}
}

async function pollAllFrames(wc) {
    if (!wc || wc.isDestroyed()) return null;
    
    let allResults = [];
    let hasPending = false;
    
    const pollScript = `(async function() {
        if (window.__xpider_result) return window.__xpider_result;
        
        // 폼 자동 입력이 아직 실행 중이고 결과가 없다면 계속 대기(null)
        if (window.__xpider_filling && !window.__xpider_result) {
            if (window.__xpider_ajax_success) {
                return { success: true, reason: 'SUBMITTED_SUCCESSFULLY' };
            }
            return null;
        }
        
        // 현재 프레임 DOM 상태를 통한 실시간 성공/실패 여부 직접 판정
        const bodyText = (document.body ? document.body.innerText : '').toLowerCase();
        const htmlText = (document.documentElement ? document.documentElement.innerHTML : '').toLowerCase();
        
        // 1. 에러 감지 (에러가 있으면 실패)
        let hasClientError = false;
        try {
          const errElements = document.querySelectorAll('.error, .invalid, .wpcf7-not-valid, .validation-error, .gfield_error, [class*="error"i]:not(form):not(body):not(html)');
          for (const errEl of errElements) {
            const txt = (errEl.textContent || '').trim().toLowerCase();
            if (/required|invalid|failed|입력|올바르지|오류/i.test(txt)) {
              hasClientError = true;
              break;
            }
          }
          if (!hasClientError) {
            hasClientError = /invalid|failed|gfield_error|wpcf7-not-valid|오류가 발생했습니다|올바르지 않습니다/i.test(bodyText) ||
                             htmlText.includes('wpcf7-validation-errors') ||
                             htmlText.includes('gform_validation_container');
          }
        } catch(e) {}
        
        if (hasClientError) {
            return { success: false, reason: 'CLIENT_VALIDATION_FAILED' };
        }
        
        // 2. AJAX 성공 이력
        if (window.__xpider_ajax_success) {
            return { success: true, reason: 'SUBMITTED_SUCCESSFULLY' };
        }
        
        // 3. URL 리다이렉트 성공 감지
        const currentUrl = window.location.href.toLowerCase();
        if (currentUrl.includes('thank-you') || currentUrl.includes('thankyou') || currentUrl.includes('/success') || currentUrl.includes('submission-success') || currentUrl.includes('form-success')) {
            return { success: true, reason: 'SUBMITTED_SUCCESSFULLY' };
        }
        
        // 4. 성공 문구 감지
        const hasSuccessText = /thank you|thank-you|thank.?you|메시지를 보냈습니다|문의가 접수되었습니다|성공적으로 전송|접수 완료|successfully|your message (has been|was) sent|form has been submitted|your form|form submitted|form submission|we('ll| will) be in touch|we have received|message received|we received your|we got your|inquiry received|contact received|submitted successfully|will be in touch|will contact you|will get back|submitted|등록되었습니다|성공|완료|전송되었습니다|wpcf7-mail-sent-ok|gform_confirmation_message|g-recaptcha-success/i.test(bodyText) ||
                               htmlText.includes('wpcf7-mail-sent-ok') ||
                               htmlText.includes('wpforms-confirmation-container-id') ||
                               htmlText.includes('wix-form-success') ||
                               htmlText.includes('form-success') ||
                               htmlText.includes('success-message') ||
                               htmlText.includes('confirmation-message') ||
                               !!document.querySelector('.form-success, .success-message, .confirmation-message, [class*="success" i], [id*="success" i], .message-sent, [class*="form-sent" i], [class*="sent-confirmation" i]');
                               
        if (hasSuccessText) {
            return { success: true, reason: 'SUBMITTED_SUCCESSFULLY' };
        }
        
        return null;
    })()`;
    
    // Check main frame
    try {
        const r = await wc.executeJavaScript(pollScript);
        if (r && r.success) return r; // Immediate success overrides everything
        if (r) {
            allResults.push(r);
        }
        else hasPending = true;
    } catch(e) {
        hasPending = true;
    }
    
    // Check child frames
    try {
        if (wc.mainFrame) {
            const frames = getAllFrames(wc.mainFrame);
            for (const frame of frames) {
                if (frame === wc.mainFrame) continue;
                try {
                    const r = await frame.executeJavaScript(pollScript);
                    if (r && r.success) return r; // Any child success overrides everything
                    if (r) allResults.push(r);
                    else hasPending = true;
                } catch(e) {
                    hasPending = true;
                }
            }
        }
    } catch(e) {}
    
    // If any frame is still processing (null), we must wait
    if (hasPending) return null;
    
    // If all frames finished and none succeeded
    if (allResults.length > 0) {
        // Find if any frame actually found a form but failed to fill/submit
        const fillFailed = allResults.find(r => r.reason !== 'NO_FORM');
        if (fillFailed) return fillFailed;
        
        // Otherwise they all returned NO_FORM
        return allResults[0];
    }
    
    return null;
}

async function checkFormPresenceInAllFrames(wc) {
    if (!wc || wc.isDestroyed()) return false;
    
    const checkScript = `(function(){
        // 일반적인 입력 필드 탐색 (숨겨진 필드, 체크박스, 라디오, 제출/버튼류 제외)
        const inputs = document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=submit]):not([type=button]):not([type=reset]), textarea, select');
        
        // 커스텀 입력이나 contenteditable 등도 입력 폼으로 판단할 수 있음
        const editables = document.querySelectorAll('[contenteditable="true"]');
        
        // 실질적인 입력 가능한 필드 총합
        const totalFields = inputs.length + editables.length;
        
        // 3개 이상의 폼 필드가 존재할 때만 폼이 있는 것으로 간주 (메시지 전송 목적의 유효 폼 필터)
        if (totalFields >= 3) return true;

        // [외부 폼 서비스 iframe 감지] HubSpot / Marketo / Pardot / Typeform 등은
        // 별도 iframe 안에 폼을 렌더링하므로 iframe src 패턴으로 감지
        const externalFormIframes = document.querySelectorAll(
            'iframe[src*="hsforms"], iframe[src*="hubspot"], iframe[src*="hs-scripts"],' +
            'iframe[src*="marketo"], iframe[src*="typeform"], iframe[src*="jotform"],' +
            'iframe[src*="formstack"], iframe[src*="pardot"],' +
            '[class*="hubspot-form" i], [class*="hs-form" i], .hubspot-form, .EPiServerForms,' +
            '[class*="hbspt"], [id*="hbspt"], .hbspt-form'
        );
        if (externalFormIframes.length > 0) return true;

        // [외부 폼 서비스 스크립트 감지] DOM에 hbspt/mkto/Pardot 스크립트가 로드되었으면 폼 렌더링 예정으로 간주
        const hasHubspotScript = !!(window.hbspt || document.querySelector('script[src*="hsforms.net"], script[src*="hs-scripts"]'));
        const hasMarketoScript = !!(window.MktoForms2 || document.querySelector('script[src*="marketo"], script[src*="munchkin"]'));
        const hasPardotScript  = !!(window.piAId || document.querySelector('script[src*="pardot"]'));
        if (hasHubspotScript || hasMarketoScript || hasPardotScript) return true;
        
        return false;
    })()`;

    // 1. Main frame (외부 폼 서비스 포함 감지)
    try {
        const hasForm = await wc.executeJavaScript(checkScript);
        if (hasForm) return true;
    } catch(e) {}
    
    // 2. Child frames
    try {
        if (wc.mainFrame) {
            const frames = getAllFrames(wc.mainFrame);
            for (const frame of frames) {
                if (frame === wc.mainFrame) continue;
                try {
                    const hasForm = await frame.executeJavaScript(checkScript);
                    if (hasForm) return true;
                } catch(e) {}
            }
        }
    } catch(e) {}
    
    return false;
}

// ─── Cloudflare Turnstile / 전체 페이지 CF 인터스티셜 강력 바이패스 엔진 ──────────
async function waitForCloudflareChallenge(tabWC, maxWaitMs = 25000) {
    if (!tabWC || tabWC.isDestroyed()) return false;

    // ─── CF 감지 스크립트 ───
    const detectScript = `(function() {
        const hasTurnstile = !!(document.querySelector('iframe[src*="challenges.cloudflare.com"]') ||
            document.querySelector('iframe[src*="turnstile"]') ||
            document.querySelector('.cf-turnstile') ||
            document.querySelector('[data-sitekey]') ||
            document.querySelector('cf-turnstile') ||
            document.querySelector('[id*="turnstile"]') ||
            document.querySelector('[class*="turnstile"]') ||
            document.querySelector('#challenge-running') ||
            document.querySelector('#cf-challenge-running') ||
            document.querySelector('.cf-browser-verification') ||
            document.querySelector('#challenge-form') ||
            document.querySelector('#cf-wrapper') ||
            document.querySelector('#cf-error-details'));
        const bodyText = (document.body ? document.body.innerText : '').toLowerCase();
        const htmlText = (document.documentElement ? document.documentElement.innerHTML : '').toLowerCase();
        const title = document.title.toLowerCase();
        const hasCfChallenge = hasTurnstile ||
            bodyText.includes('checking your browser') ||
            bodyText.includes('보안 확인 수행 중') ||
            bodyText.includes('security check') ||
            bodyText.includes('verifying you are human') ||
            bodyText.includes('just a moment') ||
            bodyText.includes('enable javascript and cookies') ||
            (bodyText.includes('please wait') && bodyText.includes('cloudflare')) ||
            title.includes('just a moment') ||
            title.includes('attention required') ||
            title.includes('security check') ||
            title.includes('보안 확인') ||
            htmlText.includes('ray id:') ||
            htmlText.includes('cloudflare.com/cdn-cgi') ||
            htmlText.includes('cf_clearance') ||
            !!window.__cf_chl_opt ||
            !!window._cf_chl_opt;
        const cfResolved = !hasCfChallenge && !hasTurnstile;
        return { hasCfChallenge, hasTurnstile, cfResolved, title, bodySnippet: bodyText.substring(0, 200) };
    })()`;

    // ─── CF 바이패스 공격 스크립트 (멀티-패스) ───
    const bypassScript = `(async function cfBypass() {
        // [Pass 1] 스텔스 패치: 봇 탐지 시그니처 완전 제거
        try {
            Object.defineProperty(navigator, 'webdriver', { get: () => false, configurable: true });
            Object.defineProperty(navigator, 'plugins', { get: () => [1,2,3,4,5], configurable: true });
            Object.defineProperty(navigator, 'languages', { get: () => ['ko-KR','ko','en-US','en'], configurable: true });
            Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8, configurable: true });
            Object.defineProperty(navigator, 'deviceMemory', { get: () => 8, configurable: true });
            Object.defineProperty(screen, 'colorDepth', { get: () => 24, configurable: true });
            if (!window.chrome) window.chrome = {};
            if (!window.chrome.runtime) window.chrome.runtime = {};
        } catch(e) {}

        // [Pass 2] __cf_chl_opt 강제 처리 + 챌린지 완료 이벤트 발사
        try {
            if (window.__cf_chl_opt || window._cf_chl_opt) {
                const opt = window.__cf_chl_opt || window._cf_chl_opt;
                opt.cNounce = Math.floor(Math.random() * 9999999);
                opt.p = 1; // passed flag
                ['cf-challenge-success','cf-challenge-complete','turnstile-callback'].forEach(evt => {
                    try { window.dispatchEvent(new CustomEvent(evt, { detail: { token: 'xpider' + Date.now() } })); } catch(e) {}
                });
            }
        } catch(e) {}

        // [Pass 3] Managed Challenge (#challenge-form) 폼 강제 제출 시도
        try {
            const cfForm = document.querySelector('#challenge-form');
            if (cfForm) {
                // 숨겨진 input들 채우기
                cfForm.querySelectorAll('input[type="hidden"]').forEach(inp => {
                    if (!inp.value) inp.value = 'bypass_' + Math.random().toString(36).substr(2);
                });
                // 제출 버튼 클릭 시도
                const submitBtn = cfForm.querySelector('[type="submit"], button');
                if (submitBtn) submitBtn.click();
            }
        } catch(e) {}

        // [Pass 4] window.turnstile SDK 강제 실행
        try {
            if (window.turnstile) {
                const containers = document.querySelectorAll('.cf-turnstile, [data-sitekey], cf-turnstile, [id*="turnstile"], [class*="turnstile"]');
                for (const container of containers) {
                    const sitekey = container.getAttribute('data-sitekey') || '';
                    const cbName = container.getAttribute('data-callback');
                    // data-callback 함수 강제 호출
                    if (cbName && typeof window[cbName] === 'function') {
                        try { window[cbName]('XPIDER_TOKEN_' + Date.now()); } catch(e) {}
                    }
                    // render 재시도
                    if (sitekey && typeof window.turnstile.render === 'function') {
                        try {
                            window.turnstile.render(container, {
                                sitekey,
                                callback: (token) => {
                                    const inp = document.querySelector('[name="cf-turnstile-response"]');
                                    if (inp) { inp.value = token; inp.dispatchEvent(new Event('change', {bubbles:true})); }
                                }
                            });
                        } catch(e) {}
                    }
                    // execute() 강제 호출
                    if (typeof window.turnstile.execute === 'function') {
                        try { window.turnstile.execute(container); } catch(e) {}
                    }
                }
                // getResponse로 기존 토큰 수집
                if (typeof window.turnstile.getResponse === 'function') {
                    const tok = window.turnstile.getResponse();
                    if (tok) {
                        ['cf-turnstile-response','turnstile-response','g-recaptcha-response'].forEach(n => {
                            const inp = document.querySelector('[name="'+n+'"]');
                            if (inp && !inp.value) { inp.value = tok; inp.dispatchEvent(new Event('change', {bubbles:true})); }
                        });
                    }
                }
            }
        } catch(e) {}

        // [Pass 5] 모든 hidden input(Turnstile/reCAPTCHA 응답 필드)에 더미 토큰 주입
        try {
            ['cf-turnstile-response','h-captcha-response','g-recaptcha-response'].forEach(n => {
                document.querySelectorAll('[name="'+n+'"], textarea[name="'+n+'"]').forEach(inp => {
                    if (!inp.value || inp.value.trim() === '') {
                        inp.value = 'xpider_bypass_' + Math.random().toString(36).substr(2, 22);
                        ['input','change'].forEach(t => inp.dispatchEvent(new Event(t, {bubbles:true})));
                    }
                });
            });
        } catch(e) {}

        // [Pass 6] 사용자 행동 마우스 이벤트 시뮬레이션 (Managed Challenge 트리거용)
        try {
            const targets = document.querySelectorAll('body, #challenge-running, .cf-browser-verification, .cf-turnstile');
            for (const t of targets) {
                ['mousemove','mousedown','mouseup','click'].forEach(evtType => {
                    t.dispatchEvent(new MouseEvent(evtType, {
                        bubbles: true, cancelable: true,
                        clientX: Math.floor(Math.random() * 400) + 100,
                        clientY: Math.floor(Math.random() * 300) + 100,
                        screenX: Math.floor(Math.random() * 1920),
                        screenY: Math.floor(Math.random() * 1080)
                    }));
                });
            }
        } catch(e) {}

        return 'bypass_applied';
    })()`;

    let detected = false;
    let result = null;

    // 1단계: CF 챌린지 감지
    try {
        result = await tabWC.executeJavaScript(detectScript);
        if (!result || !result.hasCfChallenge) return false;
        detected = true;
    } catch(e) { return false; }

    if (!detected) return false;

    sendLog(`🛡️ [CF Bypass] Cloudflare 보안 챌린지 감지 (${result.hasTurnstile ? 'Turnstile 위젯' : '전체 페이지 인터스티셜'})! 강력 바이패스 엔진 가동...`, 'info');

    // 2단계: 바이패스 공격 즉시 실행 (최초 1회)
    try {
        await tabWC.executeJavaScript(bypassScript);
        sendLog(`⚡ [CF Bypass] Pass 1~6 공격 완료. 자동 해결 대기 중...`, 'debug');
    } catch(e) {}
    await new Promise(r => setTimeout(r, 2000));

    // 3단계: 폴링 루프 — 해결될 때까지 재공격 반복
    const startTime = Date.now();
    let attackCount = 1;
    while (Date.now() - startTime < maxWaitMs) {
        if (!tabWC || tabWC.isDestroyed() || state.cancelled) break;
        await new Promise(r => setTimeout(r, 1500));

        try {
            const checkResult = await tabWC.executeJavaScript(detectScript);
            if (checkResult && checkResult.cfResolved) {
                sendLog(`✅ [CF Bypass] Cloudflare 챌린지 통과 성공! (${attackCount}회 공격 후 해결) 페이지 안정화 대기...`, 'success');
                await new Promise(r => setTimeout(r, 2500));
                return true;
            }
            // 3초마다 바이패스 재공격
            if (attackCount % 2 === 0) {
                try { await tabWC.executeJavaScript(bypassScript); } catch(e) {}
                sendLog(`⚡ [CF Bypass] 재공격 #${attackCount} 실행 중...`, 'debug');
            }
            attackCount++;
            const remaining = Math.ceil((maxWaitMs - (Date.now() - startTime)) / 1000);
            if (remaining % 5 === 0 && remaining > 0) {
                sendLog(`⏳ [CF Bypass] 챌린지 통과 대기 중... 남은 시간: ${remaining}초`, 'debug');
            }
        } catch(e) { break; }
    }

    sendLog(`⚠️ [CF Bypass] ${maxWaitMs/1000}초 내 챌린지 통과 실패. 폼 처리를 계속 시도합니다.`, 'warning');
    return false;
}


// ─── Close XPIDER Browser Tab ──────────────────────────────────
async function closeXpiderTab(tabWC) {
    if (!tabWC || tabWC.isDestroyed()) return;
    const mw = _getMainWindow ? _getMainWindow() : null;
    if (!mw || mw.isDestroyed()) return;

    try {
        const targetId = tabWC.id;
        await mw.webContents.executeJavaScript(`
            (async function() {
                const targetId = ${JSON.stringify(targetId)};
                const allWvs = document.querySelectorAll('webview');
                for (const wv of allWvs) {
                    try {
                        const wcId = typeof wv.getWebContentsId === 'function' ? wv.getWebContentsId() : -1;
                        if (wcId == targetId) {
                            const tabUiId = wv.id ? wv.id.replace('webview-', '') : null;
                            if (tabUiId && typeof window.closeTab === 'function') {
                                window.closeTab(tabUiId);
                                return 'closed';
                            }
                        }
                    } catch(e) {}
                }
                return 'not-found';
            })()
        `).catch(() => {});
    } catch (e) {
        console.error('[CampaignEngine] closeXpiderTab error:', e.message);
    }
}

// ─── Cleanup All Campaign Tabs (Bulk Purge) ──────────────────────
async function cleanupAllCampaignTabs() {
    const mw = _getMainWindow ? _getMainWindow() : null;
    if (!mw || mw.isDestroyed()) return;

    try {
        await mw.webContents.executeJavaScript(`
            (async function() {
                let closedCount = 0;
                
                // 1. data-xpider-campaign="true" 속성이 명시된 모든 웹뷰 닫기
                const campaignWvs = document.querySelectorAll('webview[data-xpider-campaign="true"]');
                for (const wv of campaignWvs) {
                    try {
                        const tabUiId = wv.id ? wv.id.replace('webview-', '') : null;
                        if (tabUiId && typeof window.closeTab === 'function') {
                            window.closeTab(tabUiId);
                            closedCount++;
                        }
                    } catch(e) {}
                }

                // 2. data-xpider-campaign 마크가 유실되었을 수 있으므로 추가 안전망 검사:
                //    전체 탭 목록에서 첫 번째 탭(보통 홈/대시보드)을 제외한 외부 사이트 대상 모든 서브 웹뷰 강제 일괄 정밀 폐쇄
                if (window.tabs && Array.isArray(window.tabs)) {
                    // 뒤에서부터 순회하여 인덱스 변형 방지
                    for (let i = window.tabs.length - 1; i >= 0; i--) {
                        const tab = window.tabs[i];
                        if (!tab || !tab.id) continue;
                        
                        // 첫 번째로 생성된 대시보드/메인 홈 탭(i === 0 이거나 start_page.html)은 안전하게 보존
                        if (i === 0 || tab.url.includes('start_page.html')) {
                            continue;
                        }
                        
                        const wv = document.getElementById('webview-' + tab.id);
                        if (wv) {
                            // 로컬 file:// 프로토콜이 아닌 외부 도메인을 서핑하고 있는 잔여 캠페인 후보 웹뷰 감지
                            const isCampaignOrExternal = wv.hasAttribute('data-xpider-campaign') || 
                                                         (!tab.url.startsWith('file://') && !tab.url.includes('start_page.html') && tab.url !== 'about:blank');
                            
                            if (isCampaignOrExternal) {
                                try {
                                    if (typeof window.closeTab === 'function') {
                                        window.closeTab(tab.id);
                                        closedCount++;
                                    }
                                } catch(e) {}
                            }
                        }
                    }
                }
                return closedCount;
            })()
        `).catch(() => {});
    } catch (e) {
        console.error('[CampaignEngine] cleanupAllCampaignTabs error:', e.message);
    }
}

// ─── Open URL in XPIDER Browser as New Tab ────────────────────
async function openInXpiderTab(contactUrl) {
    const mw = _getMainWindow ? _getMainWindow() : null;
    if (!mw || mw.isDestroyed()) return null;

    return new Promise(resolve => {
        let resolved = false;

        const timer = setTimeout(() => {
            if (!resolved) { 
                resolved = true; 
                app.removeListener('web-contents-created', wcHandler); 
                resolve(null); 
            }
        }, 12000);

        const wcHandler = (event, wc) => {
            if (resolved) return;
            try {
                if (wc && !wc.isDestroyed() && wc.getType() === 'webview') {
                    resolved = true;
                    clearTimeout(timer);
                    app.removeListener('web-contents-created', wcHandler);
                    resolve(wc);
                }
            } catch(e) {}
        };
        app.on('web-contents-created', wcHandler);

        // Ask renderer to open new tab
        mw.webContents.executeJavaScript(`
            (function(){
                const url=${JSON.stringify(contactUrl)};
                
                // 1. If window.createNewTab exists, call it and tag the last webview
                if (typeof window.createNewTab === 'function') {
                    window.createNewTab(url, true);
                    setTimeout(() => {
                        const wv = document.querySelector('webview:last-of-type');
                        if (wv) {
                            wv.setAttribute('data-xpider-campaign', 'true');
                        }
                    }, 100);
                    return 'createNewTab';
                }
                
                // 2. Generic function scan fallback
                const fns=['openNewTab','newTab','addTab','createTab','openTab','_xpiderNewTab'];
                for(const fn of fns){
                    if(typeof window[fn]==='function'){
                        window[fn](url);
                        setTimeout(() => {
                            const wv = document.querySelector('webview:last-of-type');
                            if (wv) {
                                wv.setAttribute('data-xpider-campaign', 'true');
                            }
                        }, 100);
                        return fn;
                    }
                }
                
                // 3. Circular button click fallback
                const btn=document.querySelector('#new-tab-btn,[data-action="new-tab"],[class*="new-tab"],[id*="new-tab"],#add-tab');
                if(btn){
                    btn.click();
                    setTimeout(()=>{
                        const wv=document.querySelector('webview:last-of-type');
                        if(wv) {
                            wv.src=url;
                            wv.setAttribute('data-xpider-campaign', 'true');
                        }
                    },300);
                    return 'btn-click';
                }
                
                // 4. Message relay fallback
                window.postMessage({type:'XPIDER_SEND',channel:'xpider-open-new-tab',data:{url}},'*');
                return 'postmessage';
            })()
        `).catch(() => {});
    });
}

// ─── Process One Target URL ───────────────────────────────────
async function processTarget(targetUrl, template, fillMode = 'instant') {
    return new Promise(async resolve => {
        let resolved = false;
        let tabWC = null;

        const done = (result) => {
            if (resolved) return;
            resolved = true;
            clearTimeout(globalTimer);
            resolve(result);
        };

        const globalTimer = setTimeout(() => {
            sendLog(`⏱️ Timeout limit reached: ${targetUrl}`, 'warning');
            if (state.currentTabWC && !state.currentTabWC.isDestroyed()) {
                const tempTabWC = state.currentTabWC;
                closeXpiderTab(tempTabWC);
            }
            done({ success: false, reason: 'TIMEOUT' });
        }, state.globalTimeoutMs || 360000);

        try {
            // [블랙리스트 필터] 관공서 및 대기업/IT 유명 도메인 차단
            const targetHostname = new URL(targetUrl).hostname.toLowerCase();
            if (EXCLUDED_DOMAINS.test(targetHostname)) {
                sendLog(`⏭️ [Skip] 관공서 및 유명 웹사이트 도메인 자동 제외: ${targetUrl}`, 'warn');
                done({ success: true, reason: 'EXCLUDED_DOMAIN' });
                return;
            }

            const baseUrl = new URL(targetUrl).origin;
            sendLog(`🔍 [Step 1/4] Scanning target domain: ${baseUrl}...`, 'info');

            const paths = await findContactPages(targetUrl);
            sendLog(`✅ [Step 1/4] Discovery completed. Candidates found (${paths.length}): ${paths.join(', ')}`, 'info');

            if (state.cancelled) { done({ success: false, reason: 'CANCELLED' }); return; }

            // [가속화 패치] 백그라운드 비동기 자동스캔(Probing)으로 실제 폼이 있는 유효 경로 필터링
            sendLog(`🔍 [Step 1.5/4] Probing candidates in background to filter out dead pages...`, 'info');
            const probedPaths = await Promise.all(paths.map(async path => {
                const contactUrl = baseUrl + path;
                const hasForm = await probeFormPresence(contactUrl);
                if (hasForm) {
                    sendLog(`🎯 [Auto-Scan] Verified form presence on: ${path}`, 'debug');
                } else {
                    sendLog(`❌ [Auto-Scan] No form elements detected on: ${path} (Skipped)`, 'debug');
                }
                return hasForm ? path : null;
            }));
            
            let validPaths = probedPaths.filter(Boolean);
            if (validPaths.length === 0) {
                sendLog(`⚠️ [Auto-Scan] No valid forms found in background probe. Falling back to all candidates...`, 'warning');
                validPaths = paths; // 폴백: 아무것도 감지 안 됐을 때는 기존 후보군 전부 대입
            } else {
                sendLog(`✨ [Auto-Scan] Selected ${validPaths.length} active contact page(s) for browser automation.`, 'success');
            }

            let lightboxTimer = null;
            for (const path of validPaths) {
                if (state.cancelled) break;
                const contactUrl = baseUrl + path;

                // [v4.12.42] 새 URL을 열기 전에 기존의 모든 캠페인 잔여 탭을 확실하게 일괄 강제 폐쇄
                sendLog(`🧹 [Cleanup] Purging any residual tabs before opening new URL...`, 'debug');
                await cleanupAllCampaignTabs();

                sendLog(`🔗 [Step 2/4] Navigating to page: ${contactUrl}...`, 'visit');

                // Try to open in XPIDER browser tab (100% inner tabs routing)
                tabWC = await openInXpiderTab(contactUrl);

                if (!tabWC) {
                    sendLog(`⚠️ [Step 2/4] XPIDER tab creation timed out for ${contactUrl}. Trying next path...`, 'warning');
                    continue; // 새 창을 절대 띄우지 않고 즉시 다음 path로 패스!
                } else {
                    state.currentTabWC = tabWC;
                }

                if (!tabWC || tabWC.isDestroyed()) {
                    sendLog(`⚠️ [Step 2/4] Connection lost for ${contactUrl}. Attempting next path...`, 'warning');
                    continue;
                }

                // [v4.13.0] 6초 맹목적 대기 대신, 실시간 폼 존재 감지 루프 시작 (최대 7초)
                // [v4.12.55] Cloudflare Turnstile 챌린지 감지 후 자동 통과 대기 먼저 실행
                sendLog(`⏳ [Step 2/4] Detecting form elements on the page...`, 'debug');

                // ★ [Lightbox Guard] 라이트박스(광고/동의 모달) 자동 닫기 백그라운드 스레드 시뮬레이션 개시
                lightboxTimer = setInterval(async () => {
                    if (!tabWC || tabWC.isDestroyed()) { clearInterval(lightboxTimer); return; }
                    try {
                        await tabWC.executeJavaScript(`(function(){
                            // 1. 대표적인 라이트박스/모달/광고 팝업 컨테이너 셀렉터 정의
                            const popups = document.querySelectorAll(
                                '[class*="lightbox" i], [id*="lightbox" i], ' +
                                '[class*="modal" i], [id*="modal" i], ' +
                                '[class*="popup" i], [id*="popup" i], ' +
                                '[class*="overlay" i], [id*="overlay" i], ' +
                                '[class*="cookie" i], [id*="cookie" i], ' +
                                '[class*="dialog" i], [id*="dialog" i], ' +
                                'div[role="dialog"], dialog'
                            );
                            
                            let closedCount = 0;
                            popups.forEach(popup => {
                                // 화면에 실제 보이고 있고 폼 요소 자체가 아닌 껍데기 레이어만 타겟팅
                                const rect = popup.getBoundingClientRect();
                                if (rect.width > 50 && rect.height > 50 && popup.offsetParent !== null) {
                                    // 폼 태그 또는 메인 입력창을 담은 중요한 노드가 아닐 경우에만
                                    if (!popup.querySelector('form') && !popup.querySelector('textarea')) {
                                        // 닫기 버튼으로 추론되는 자식 노드를 찾음
                                        const closeBtn = popup.querySelector(
                                            '[class*="close" i], [id*="close" i], ' +
                                            '[aria-label*="close" i], [title*="close" i], ' +
                                            '[class*="dismiss" i], [class*="reject" i], ' +
                                            'button, [role="button"]'
                                        );
                                        if (closeBtn) {
                                            closeBtn.click();
                                            closedCount++;
                                        } else {
                                            // 닫기 버튼이 없는 성가신 오버레이는 임시 제거 처리
                                            popup.style.display = 'none';
                                            closedCount++;
                                        }
                                    }
                                }
                            });
                            if (closedCount > 0) {
                                console.log('🧹 [Lightbox Guard] Closed ' + closedCount + ' popups/overlays.');
                            }
                        })()`).catch(() => {});
                    } catch(e) {}
                }, 2000);

                // ★ [Turnstile Guard] 먼저 Cloudflare 보안 체크 페이지인지 확인하고 통과 대기
                const cfPassed = await waitForCloudflareChallenge(tabWC, 20000);
                if (cfPassed) {
                    sendLog(`🌐 [Turnstile] 챌린지 통과 후 폼 재감지를 시작합니다...`, 'debug');
                    // 챌린지 통과 후 추가 대기 (페이지 전환 완료 보장)
                    await new Promise(r => setTimeout(r, 1500));
                }

                let formDetected = false;
                const detectStartTime = Date.now();
                const detectTimeout = 9000; // Turnstile 통과 후 여유 시간 포함 최대 9초
                
                while (Date.now() - detectStartTime < detectTimeout) {
                    if (state.cancelled || !tabWC || tabWC.isDestroyed()) break;
                    
                    formDetected = await checkFormPresenceInAllFrames(tabWC);
                    if (formDetected) {
                        sendLog(`🎯 Form elements detected on ${contactUrl}! Proceeding immediately.`, 'success');
                        break;
                    }

                    // 폼 감지 루프 중에도 Cloudflare 챌린지가 새로 나타날 수 있으므로 재확인
                    try {
                        const cfCheck = await tabWC.executeJavaScript(`(function(){
                            const bodyText = (document.body ? document.body.innerText : '').toLowerCase();
                            return bodyText.includes('checking your browser') || bodyText.includes('보안 확인 수행 중') ||
                                   document.title.toLowerCase().includes('just a moment') ||
                                   !!document.querySelector('.cf-turnstile, [id*="turnstile"], #challenge-running, #cf-challenge-running');
                        })()`);
                        if (cfCheck) {
                            sendLog(`🛡️ [Turnstile] 폼 로딩 중 Cloudflare 챌린지 감지. 추가 대기...`, 'debug');
                            await new Promise(r => setTimeout(r, 3000));
                            continue;
                        }
                    } catch(e) {}

                    await new Promise(r => setTimeout(r, 500));
                }

                if (state.cancelled) {
                    clearInterval(lightboxTimer);
                    done({ success: false, reason: 'CANCELLED' });
                    return;
                }

                // [v4.12.55] 탭이 파괴된 경우 (갑자기 닫힘) → 즉시 다음 path로 스킵 (3분 대기 없음)
                if (!tabWC || tabWC.isDestroyed()) {
                    clearInterval(lightboxTimer);
                    sendLog(`⚠️ [Step 2/4] 탭이 예기치 않게 닫혔습니다. 다음 경로로 이동합니다.`, 'warning');
                    continue;
                }

                if (!formDetected) {
                    clearInterval(lightboxTimer);
                    sendLog(`🛑 No form found on ${contactUrl}. Skipping this page without delay.`, 'warning');
                    const tempTab = tabWC;
                    if (tempTab && !tempTab.isDestroyed()) {
                        await closeXpiderTab(tempTab);
                    }
                    continue; // 3분 대기 지연 없이 즉각 스킵하여 다음 path로 패스!
                }

                sendLog(`✏️ [Step 3/4] Injecting Super-Intelligent Form Filler v3.0 into all active frames...`, 'info');
                sendLog(`👉 Analyzing DOM: text/email/tel, SELECT dropdowns, radio groups, checkboxes, custom widgets...`, 'debug');
                sendLog(`🔗 Matching template variables + human-like mouse simulation engaged... ...`, 'debug');
                try {
                    await injectIntoAllFrames(tabWC, getFormFillerScript(template, fillMode));
                    sendLog(`🚀 [Step 3/4] Smart Form Filler Engine successfully injected. Data population started.`, 'info');
                } catch(e) {
                    clearInterval(lightboxTimer);
                    sendLog(`⚠️ [Step 3/4] Injection failure: ${e.message}. Purging tab...`, 'warning');
                    const tempTab = tabWC;
                    // [v4.12.55] 탭이 이미 파괴된 경우 closeXpiderTab 호출 생략
                    setTimeout(() => {
                        if (tempTab && !tempTab.isDestroyed()) closeXpiderTab(tempTab);
                    }, 500);
                    continue;
                }

                // Poll for result in ALL frames (Wix may be in iframe, up to 20s)
                sendLog(`🔄 [Step 4/4] Monitoring form submission & reCAPTCHA state...`, 'debug');
                sendLog(`🛡️ CAPTCHA bypass engine monitoring...`, 'debug');
                let result = null;
                let tabClosedDuringPoll = false;
                for (let i = 0; i < 40; i++) {
                    await new Promise(r => setTimeout(r, 500));
                    // [v4.12.55] 탭 파괴 감지 → TAB_CLOSED로 정확히 처리 (갑자기 닫히는 버그 수정)
                    if (!tabWC || tabWC.isDestroyed()) {
                        tabClosedDuringPoll = true;
                        break;
                    }
                    result = await pollAllFrames(tabWC);
                    if (result) break;
                }

                // [v4.12.55] 폼 처리 중 탭이 갑자기 닫힌 경우 → 3분 대기 없이 다음으로
                if (tabClosedDuringPoll) {
                    sendLog(`⚠️ [Step 4/4] 폼 처리 중 탭이 예기치 않게 닫혔습니다. 다음 경로로 이동합니다.`, 'warning');
                    tabWC = null;
                    continue;
                }

                if (result && result.success) {
                    // 폼 발송 1회 성공 시 ➡️ 30 토큰 소진
                    const userId = authService.getCurrentUserId();
                    if (userId) {
                        const deductResult = await authService.deductToken(userId, 30, 'XPIDER AutoForm Sender Pro', 'Send Contact Form', `Submitted form on: ${contactUrl}`);
                        if (!deductResult.success) {
                            sendLog(`❌ 토큰이 부족하여 발송이 중단되었습니다.`, 'error');
                            // 렌더러로 토큰 부족 모달 브로드캐스트
                            const mw = _getMainWindow ? _getMainWindow() : null;
                            if (mw && !mw.isDestroyed()) {
                                mw.webContents.send('xpider-token-depleted', { error: deductResult.error });
                            }
                            done({ success: false, reason: 'TOKEN_DEPLETED' });
                            return;
                        }
                    } else {
                        sendLog(`❌ 로그인이 필요합니다.`, 'error');
                        done({ success: false, reason: 'LOGIN_REQUIRED' });
                        return;
                    }

                    sendLog(`✅ [Step 4/4] Success! Form submitted (${result.filled} fields matched & filled).`, 'success');
                    sendLog(`🎯 Contact action definitively completed on ${contactUrl}.`, 'debug');
                    
                    // [v4.12.43] 성공 시 즉시 탭 닫기 진행 (500ms 후 즉각 폐쇄)
                    const tempTab = tabWC;
                    setTimeout(() => {
                        if (tempTab && !tempTab.isDestroyed()) closeXpiderTab(tempTab);
                    }, 500);
                    clearInterval(lightboxTimer);
                    done({ success: true });
                    return;
                } else {
                    const reason = result ? result.reason : 'NO_RESULT';
                    sendLog(`⚠️ [Step 4/4] Path ${path} unsuccessful (Reason: ${reason}).`, 'warning');
                    
                    // [v4.12.44] 폼이 아예 존재하지 않거나('NO_FORM') 없는 페이지(404, 500, Failed 등)인 경우 3분 대기 없이 바로 탭 닫기!
                    let isNotFoundOrNoForm = (reason === 'NO_FORM');
                    
                    if (!isNotFoundOrNoForm) {
                        try {
                            const tabTitle = tabWC ? (tabWC.getTitle() || '').toLowerCase() : '';
                            const tabUrl = tabWC ? (tabWC.getURL() || '').toLowerCase() : '';
                            
                            // 404, Not Found, 500, error, 없는 페이지 핑거프린트 감지
                            if (tabTitle.includes('404') || tabTitle.includes('not found') || tabTitle.includes('error') || 
                                tabTitle.includes('failed') || tabTitle.includes('디렉터리') || tabTitle.includes('site cant be reached') ||
                                tabUrl.includes('error') || tabUrl.includes('404')) {
                                isNotFoundOrNoForm = true;
                            }
                        } catch(e) {}
                    }
                    
                    if (isNotFoundOrNoForm) {
                        sendLog(`🛑 없는 페이지거나 폼이 존재하지 않는 탭입니다. 대기 없이 탭을 즉시 닫고 다음 타겟으로 이동합니다.`, 'info');
                        const tempTab = tabWC;
                        if (tempTab && !tempTab.isDestroyed()) {
                            await closeXpiderTab(tempTab);
                        }
                    } else {
                        // [v4.15.0] 성공 미확인 시 33초 대기 후 에러 메시지가 없으면 성공으로 간주
                        clearTimeout(globalTimer);
                        
                        sendLog(`⏳ 등록/성공 미확인: 33초간 에러 여부를 감시하며 대기합니다. (에러가 없으면 성공 간주)`, 'info');
                        const holdDuration = 33000; // 33초
                        const holdStart = Date.now();
                        let hasErrorDuringHold = false;
                        let errorReason = '';
                        
                        while (Date.now() - holdStart < holdDuration && !state.cancelled) {
                            // 탭이 파괴되었는지 먼저 체크
                            if (!tabWC || tabWC.isDestroyed()) {
                                sendLog(`⚠️ 탭이 닫혀 대기 상태가 종료되었습니다.`, 'warning');
                                break;
                            }
                            
                            // 성공/실패 메시지 실시간 재확인
                            try {
                                const recheckResult = await pollAllFrames(tabWC);
                                if (recheckResult) {
                                    if (recheckResult.success) {
                                        sendLog(`✅ [Hold] 성공 메시지 감지! 탭을 닫고 다음 URL로 이동합니다.`, 'success');
                                        
                                        // 토큰 차감 진행
                                        const userId = authService.getCurrentUserId();
                                        if (userId) {
                                            const deductResult = await authService.deductToken(userId, 30, 'XPIDER AutoForm Sender Pro', 'Send Contact Form', `Submitted form on: ${contactUrl}`);
                                            if (!deductResult.success) {
                                                sendLog(`❌ 토큰이 부족하여 발송이 중단되었습니다.`, 'error');
                                                const mw = _getMainWindow ? _getMainWindow() : null;
                                                if (mw && !mw.isDestroyed()) {
                                                    mw.webContents.send('xpider-token-depleted', { error: deductResult.error });
                                                }
                                                clearInterval(lightboxTimer);
                                                done({ success: false, reason: 'TOKEN_DEPLETED' });
                                                return;
                                            }
                                        } else {
                                            sendLog(`❌ 로그인이 필요합니다.`, 'error');
                                            clearInterval(lightboxTimer);
                                            done({ success: false, reason: 'LOGIN_REQUIRED' });
                                            return;
                                        }

                                        const tempTab = tabWC;
                                        setTimeout(() => { if (tempTab && !tempTab.isDestroyed()) closeXpiderTab(tempTab); }, 500);
                                        clearInterval(lightboxTimer);
                                        done({ success: true });
                                        return;
                                    } else if (recheckResult.success === false && recheckResult.reason === 'CLIENT_VALIDATION_FAILED') {
                                        hasErrorDuringHold = true;
                                        errorReason = recheckResult.reason;
                                        sendLog(`❌ [Hold] 실패 메시지(오류) 감지! 실패로 처리하고 대기를 종료합니다.`, 'error');
                                        break;
                                    }
                                }
                            } catch(e) {}
                            
                            const remainingSec = Math.ceil((holdDuration - (Date.now() - holdStart)) / 1000);
                            sendLog(`⏳ [Hold] 성공 및 오류 감시 중... 남은 시간: ${remainingSec}초`, 'debug');
                            await new Promise(r => setTimeout(r, 3000));
                        }
                        
                        if (state.cancelled) {
                            sendLog(`🛑 대기 중 사용자가 캠페인을 취소했습니다.`, 'stop');
                            const tempTab = tabWC;
                            if (tempTab && !tempTab.isDestroyed()) await closeXpiderTab(tempTab);
                            clearInterval(lightboxTimer);
                            done({ success: false, reason: 'CANCELLED' });
                            return;
                        } else if (hasErrorDuringHold) {
                            sendLog(`❌ [Hold End] 실패 메시지(오류)가 감지되어 실패로 처리합니다.`, 'warning');
                            const tempTab = tabWC;
                            if (tempTab && !tempTab.isDestroyed()) await closeXpiderTab(tempTab);
                            clearInterval(lightboxTimer);
                            done({ success: false, reason: errorReason || 'CLIENT_VALIDATION_FAILED' });
                            return;
                        } else {
                            sendLog(`✅ [Hold End] 33초 경과. 실패 메시지가 발견되지 않아 성공으로 간주하고 다음 타겟으로 이동합니다.`, 'success');
                            
                            // 토큰 차감 진행
                            const userId = authService.getCurrentUserId();
                            if (userId) {
                                const deductResult = await authService.deductToken(userId, 30, 'XPIDER AutoForm Sender Pro', 'Send Contact Form', `Submitted form on: ${contactUrl} (Assumed success)`);
                                if (!deductResult.success) {
                                    sendLog(`❌ 토큰이 부족하여 발송이 중단되었습니다.`, 'error');
                                    const mw = _getMainWindow ? _getMainWindow() : null;
                                    if (mw && !mw.isDestroyed()) {
                                        mw.webContents.send('xpider-token-depleted', { error: deductResult.error });
                                    }
                                    const tempTab = tabWC;
                                    if (tempTab && !tempTab.isDestroyed()) await closeXpiderTab(tempTab);
                                    clearInterval(lightboxTimer);
                                    done({ success: false, reason: 'TOKEN_DEPLETED' });
                                    return;
                                }
                            } else {
                                sendLog(`❌ 로그인이 필요합니다.`, 'error');
                                const tempTab = tabWC;
                                if (tempTab && !tempTab.isDestroyed()) await closeXpiderTab(tempTab);
                                clearInterval(lightboxTimer);
                                done({ success: false, reason: 'LOGIN_REQUIRED' });
                                return;
                            }

                            const tempTab = tabWC;
                            if (tempTab && !tempTab.isDestroyed()) await closeXpiderTab(tempTab);
                            clearInterval(lightboxTimer);
                            done({ success: true, reason: 'ASSUMED_SUCCESS_NO_ERROR' });
                            return;
                        }
                    }
                }
            }

            if (lightboxTimer) clearInterval(lightboxTimer);
            sendLog(`❌ [Step 4/4] Campaign failed for ${baseUrl} (all paths exhausted).`, 'error');
            done({ success: false, reason: 'EXHAUSTED' });
        } catch(e) {
            if (lightboxTimer) clearInterval(lightboxTimer);
            sendLog(`❌ [System Error] Campaign crashed: ${e.message}`, 'error');
            done({ success: false, reason: e.message });
        }
    });
}

// ─── Main Campaign Loop ───────────────────────────────────────
async function runCampaign(urls, template, delayMs, fillDelayMs = 300, submitDelayMs = 1500, fillMode = 'instant', globalTimeoutMs = 360000) {
    state.active = true; state.cancelled = false; state.paused = false;
    
    // [초기 필터링] 관공서 및 유명 사이트, 비즈니스 목적이 아닌 웹사이트를 큐 진입 시점에 사전 배제
    const filteredUrls = urls.filter(url => {
        try {
            const tempUrl = url.startsWith('http') ? url : 'https://' + url;
            const hostname = new URL(tempUrl).hostname.toLowerCase();
            if (EXCLUDED_DOMAINS.test(hostname)) {
                sendLog(`⏭️ [Skip] 관공서 및 유명 웹사이트 도메인 사전 배제: ${url}`, 'warn');
                return false;
            }
            return true;
        } catch (e) {
            return false;
        }
    });

    state.queue = [...filteredUrls];
    state.template = template;
    state.delayMs = delayMs || 10000;
    state.fillDelayMs = fillDelayMs || 300;
    state.submitDelayMs = submitDelayMs || 1500;
    state.fillMode = fillMode || 'instant';
    state.globalTimeoutMs = globalTimeoutMs || 360000;
    state.successCount = 0; state.completedCount = 0; state.totalTargets = filteredUrls.length; state.sessionId++;

    sendLog(`🚀 Native Engine v3.0 (Super-Intelligent Form Filler) starting: ${filteredUrls.length} target(s)`, 'start');
    sendStats();

    const visited = new Set();
    while (state.queue.length > 0 && state.active) {
        while (state.paused && state.active) await new Promise(r => setTimeout(r, 1000));
        if (!state.active || state.cancelled) break;

        const url = state.queue.shift();
        let normalized;
        try { normalized = new URL(url.startsWith('http') ? url : 'https://' + url).origin; }
        catch(e) { sendLog(`⚠️ Invalid URL: ${url}`, 'warning'); continue; }

        if (visited.has(normalized)) { sendLog(`⏭️ Skipping duplicate: ${url}`, 'info'); continue; }
        visited.add(normalized);

        const targetUrl = url.startsWith('http') ? url : 'https://' + url;
        const result = await processTarget(targetUrl, template, fillMode).catch(e => ({ success: false, reason: e.message }));
        if (result.success) { state.successCount++; }
        state.completedCount++;
        sendStats();

        // [v4.10.13] 매 웹사이트 발송 과정이 일단락될 때마다 탭을 강제 일괄 청소
        sendLog(`🧹 [Cleanup] Purging all residual campaign tabs for ${normalized}...`, 'debug');
        await cleanupAllCampaignTabs();

        if (state.queue.length > 0 && state.active) {
            sendLog(`⏳ Waiting ${state.delayMs}ms before next target...`, 'debug');
            await new Promise(r => setTimeout(r, state.delayMs));
        }
    }

    state.active = false;
    sendLog(`🏁 Campaign complete! Sent: ${state.successCount} / ${state.totalTargets}`, 'complete');
    sendStats();
}

function start(urls, template, delayMs, fillDelayMs, submitDelayMs, fillMode, globalTimeoutMs) {
    if (state.active) { sendLog('⚠️ Already running. Stop first.', 'warning'); return { success: false, error: 'Already running' }; }
    runCampaign(urls, template, delayMs, fillDelayMs, submitDelayMs, fillMode, globalTimeoutMs).catch(e => sendLog(`❌ Engine crash: ${e.message}`, 'error'));
    return { success: true, status: 'acknowledged' };
}

function stop() {
    state.active = false; state.cancelled = true; state.queue = [];
    if (state.currentTabWC && !state.currentTabWC.isDestroyed()) {
        try { if (state.currentTabWC._campaignCleanup) state.currentTabWC._campaignCleanup(); } catch(e) {}
        // 사용자 수동 정지 시 현재 구동 중인 XPIDER 탭을 즉시 강제 닫기
        const tempTab = state.currentTabWC;
        closeXpiderTab(tempTab);
        state.currentTabWC = null;
    }
    // 사용자 수동 정지 시 열린 모든 캠페인 탭을 전수 조사하여 즉각 일괄 정리
    cleanupAllCampaignTabs();
    sendLog('🛑 Campaign stopped by user.', 'stop');
}

function pause() { state.paused = true; sendLog('⏸️ Campaign paused.', 'info'); }
function resume() { state.paused = false; sendLog('▶️ Campaign resumed.', 'info'); }
function isActive() { return state.active; }
function getState() {
    return {
        isActive: state.active,
        isPaused: state.paused,
        successCount: state.successCount,
        completedCount: state.completedCount || 0,
        totalTargets: state.totalTargets,
        remainingCount: state.queue.length
    };
}

module.exports = { init, start, stop, pause, resume, isActive, getState };

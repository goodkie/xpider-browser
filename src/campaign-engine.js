/**
 * XPIDER Native Campaign Engine v3.0 — Super-Intelligent Form Filler
 * - Opens contact pages in XPIDER browser NEW TAB (not separate window)
 * - Smart form filling: infers values for unmatched fields from template
 * - [v3.0] Full support: SELECT dropdowns, radio buttons, checkboxes, custom widgets
 * - [v3.0] Human-like mouse simulation (mousemove→mousedown→mouseup→click)
 */

const { app, BrowserWindow } = require('electron');
const authService = require('./auth/auth-service');

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

    // 1. targetUrl 자체가 서브패스를 포함하고 있고 contact 관련 키워드가 있는 경우 우선순위 1위로 추가
    const targetPath = targetUrl.replace(baseUrl, '');
    const isContactKeyword = /contact|inquiry|support|feedback|write|customer|문의|연락|about/i;
    
    if (targetPath && targetPath !== '/' && isContactKeyword.test(targetPath)) {
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
                
                // contact 관련 키워드가 포함되었는지 확인
                if (isContactKeyword.test(href)) {
                    try {
                        const resolvedUrl = new URL(href, targetUrl);
                        if (resolvedUrl.origin === baseUrl) {
                            extractedPaths.add(resolvedUrl.pathname + resolvedUrl.search);
                        }
                    } catch(e) {
                        // 상대경로 형식 (/contact-us 등)인 경우 직접 삽입
                        if (href.startsWith('/') || !href.includes('://')) {
                            const normalizedPath = href.startsWith('/') ? href : '/' + href;
                            extractedPaths.add(normalizedPath);
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

    const finalResults = [...new Set(results)].filter(Boolean);
    return finalResults.length > 0 ? finalResults : ['/contact', '/contact-us'];
}


// ─── Smart Form Filler Script ─────────────────────────────────
function getFormFillerScript(template) {
    const tplJson = JSON.stringify(template);
    const fillDelay = state.fillDelayMs || 300;
    const submitDelay = state.submitDelayMs || 1500;
    return `(async function xpiderFill(){
if(window.__xpider_filling)return;
window.__xpider_filling=true;

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
      'input[name="cf-turnstile-response"], input[name="h-captcha-response"], ' +
      'input[name="g-recaptcha-response"], textarea[name="g-recaptcha-response"]'
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

// Primary field patterns (v4.12.40 - Multi-lingual Supreme Matchers)
const P={
  firstName:[/\bfirst.?name\b/i,/\bgiven.?name\b/i,/\bforename\b/i,/\bfname\b/i,/\bfirst\b/i,/\bgiven\b/i,/이름/i,/성함/i,/名前/i,/名/i,/given/i,/\bnombre\b/i,/\bprenom\b/i,/\bvorname\b/i],
  lastName:[/\blast.?name\b/i,/\bfamily.?name\b/i,/\bsurname\b/i,/\blname\b/i,/\blast\b/i,/\bfamily\b/i,/성(?!명|함)/i,/苗字/i,/姓/i,/\bapellido\b/i,/\bnom\b/i,/\bnachname\b/i],
  name:[/\bname\b/i,/\bfull.?name\b/i,/\byour.*name\b/i,/\bcontact.*name\b/i,/\bcustomer.*name\b/i,/\bsender.*name\b/i,/성함/i,/氏名/i,/姓名/i,/성명/i,/이름/i,/user/i,/fullname/i,/\bcontact.*person\b/i,/\bclient.*name\b/i],
  email:[/e.?mail/i,/이메일/i,/メール/i,/邮箱/i],
  subject:[/subject/i,/title(?!.*name)/i,/제목/i,/件名/i,/主题/i,/topic/i,/heading/i],
  phone:[/phone/i,/mobile/i,/tel(?!eg)/i,/전화/i,/手机/i,/电话/i,/fax/i],
  message:[/message/i,/content/i,/body/i,/comment/i,/inquiry/i,/description/i,/내용/i,/本文/i,/内容/i,/detail/i,/note/i,/\bmessage.*text\b/i,/\bbody.*text\b/i]
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
  const parts = trimmed.split(/\s+/);
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
    if (templateVals.length > 0) return templateVals[Math.floor(Math.random() * templateVals.length)];
    return "Inquiry";
  };
  
  if (/company|회사|org/i.test(c)) {
    return (tpl.name || getRandomTemplateVal()) + ' Inc.';
  }
  if (/address|주소/i.test(c)) {
    return '123 Business Rd, New York, NY';
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
    const baseDelay = Math.max(10, Math.floor((typeof fillDelayMs !== 'undefined' ? fillDelayMs : 300) / 6.6));
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
  if(/country|region|location|지역|국가|地域|国家/i.test(id)){
    // Try to pick a sensible country
    const prefs=['united states','us','usa','united kingdom','uk','canada','australia'];
    for(const pref of prefs){
      const idx=opts.findIndex(o=>o.text.toLowerCase().includes(pref));
      if(idx>0){bestIdx=idx;break;}
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
    const mrIdx=opts.findIndex(o=>/^mr\.?$/i.test(o.text.trim())||/^ms\.?$/i.test(o.text.trim()));
    if(mrIdx>0)bestIdx=mrIdx;
  }
  if(bestIdx<0 && /how.*hear|how.*find|referral|알게/i.test(id)){
    const webIdx=opts.findIndex(o=>/internet|website|web|search|google|online/i.test(o.text));
    if(webIdx>0)bestIdx=webIdx;
  }
  // Fallback: pick first non-empty option
  if(bestIdx<0){
    bestIdx=opts.findIndex((o,i)=>i>0 && o.value && o.value.trim()!=='' && !o.disabled);
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
    // Skip if already selected
    if(items.some(r=>r.checked))continue;
    let chosen=null;
    // Prefer positive/agreeable options
    for(const r of items){
      const lt=(lbl(r)+' '+(r.value||'')).toLowerCase();
      if(/^yes$|agree|accept|confirm|동의|はい|同意|other|기타/i.test(lt)){chosen=r;break;}
    }
    // Prefer 'general' or first option
    if(!chosen){
      for(const r of items){
        const lt=(lbl(r)+' '+(r.value||'')).toLowerCase();
        if(/general|inquiry|info|문의|お問い合わせ|咨询/i.test(lt)){chosen=r;break;}
      }
    }
    if(!chosen)chosen=items[0];
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

// [v4.12.25] Smart checkbox filler
async function fillCheckboxes(container){
  const cbs=Array.from(container.querySelectorAll('input[type=checkbox]'));
  if(cbs.length===0)return 0;
  let filled=0;
  for(const cb of cbs){
    if(cb.checked||cb.disabled)continue;
    const lt=(getFieldId(cb)+' '+lbl(cb)).toLowerCase();
    // Must-check: required, terms, privacy, agree
    const mustCheck=cb.required || cb.getAttribute('required')!==null || /agree|terms|privacy|policy|consent|accept|필수|동의|약관|同意|規約|条款|confirm|acknowledge/i.test(lt);
    // Skip opt-in marketing/newsletter
    const isOptIn=/newsletter|subscribe|marketing|promo|offer|수신|구독|メルマガ|订阅/i.test(lt);
    if(mustCheck && !isOptIn){
      await humanClick(cb);
      cb.checked=true;
      ['input','change','click'].forEach(t=>cb.dispatchEvent(new Event(t,{bubbles:true})));
      filled++;
      await new Promise(r=>setTimeout(r,80+Math.random()*80));
    }
  }
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
  for(let i=0;i<5&&p;i++){
    const lEl=p.querySelector('label,p[class*="label"],span[class*="label"],div[class*="label"]');
    if(lEl&&lEl!==el){parentLbl=lEl.textContent||'';break;}
    p=p.parentElement;
  }
  // Previous sibling label
  let prevLbl='';
  let sib=el.previousElementSibling;
  for(let i=0;i<3&&sib;i++){
    if(['LABEL','SPAN','P','DIV'].includes(sib.tagName)&&(sib.textContent||'').length<80){prevLbl=sib.textContent||'';break;}
    sib=sib.previousElementSibling;
  }
  return (ls+' '+al+' '+albt+' '+hook+' '+parentLbl+' '+prevLbl).toLowerCase().trim();
}

function getFieldId(el){
  const hook=el.getAttribute('data-hook')||'';
  return [el.name||'',el.id||'',el.placeholder||'',lbl(el),el.className||'',hook].join(' ').toLowerCase();
}

// [v4.12.46] High-Precision Name Field Detector (scans surrounding DOM text for hash-based fields)
function detectNameField(el) {
  const c = getFieldId(el).toLowerCase();
  
  if (/\bfirst.?name\b|\bgiven.?name\b|\bforename\b|\bfname\b|\bfirst\b|\bgiven\b|given|\bnombre\b|\bprenom\b|\bvorname\b/.test(c)) {
    return 'first';
  }
  if (/\blast.?name\b|\bfamily.?name\b|\bsurname\b|\blname\b|\blast\b|\bfamily\b|\bapellido\b|\bnom\b|\bnachname\b/.test(c)) {
    return 'last';
  }
  if (/\bname\b|\bfull.?name\b|\byour.*name\b|\bcontact.*name\b|\bcustomer.*name\b|\bsender.*name\b|user|fullname|\bcontact.*person\b|\bclient.*name\b/.test(c)) {
    return 'full';
  }
  
  // Korean keyword fallback
  if (/이름|성함|성명|성(?!명|함)/i.test(c)) {
    if (/성(?!명|함)/i.test(c)) return 'last';
    if (/이름|성함|성명/i.test(c)) return 'full';
  }
  
  // Shadow DOM & parent wrapper text scanning safety fallback
  let parentText = '';
  let p = el.parentElement;
  for (let i = 0; i < 3 && p; i++) {
    parentText += ' ' + (p.textContent || '');
    p = p.parentElement;
  }
  parentText = parentText.toLowerCase();
  
  if (parentText.includes('first name') || parentText.includes('given name') || parentText.includes('fname') || parentText.includes('이름') || parentText.includes('성함')) {
    if (!parentText.includes('last name') && !parentText.includes('surname')) {
      return 'first';
    }
  }
  if (parentText.includes('last name') || parentText.includes('family name') || parentText.includes('lname') || parentText.includes('surname') || (parentText.includes('성') && !parentText.includes('성명') && !parentText.includes('성함'))) {
    if (!parentText.includes('first name') && !parentText.includes('given name')) {
      return 'last';
    }
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
        const val = tpl.firstName || s.first || tpl.name;
        if (val && val.trim() !== '') {
          if (await tv(el, val)) { used.add('firstName'); n++; continue; }
        }
      }
      if (nameType === 'last' && !used.has('lastName')) {
        const s = splitName(tpl.name);
        const val = tpl.lastName || s.last || '';
        if (val && val.trim() !== '') {
          if (await tv(el, val)) { used.add('lastName'); n++; continue; }
        }
      }
      if (nameType === 'full' && !used.has('name')) {
        const val = tpl.name || tpl.firstName || '';
        if (val && val.trim() !== '') {
          if (await tv(el, val)) { used.add('name'); n++; continue; }
        }
      }
    }
    
    // Default matching fallback for other primary fields
    for(const k of['firstName','lastName','name','email','phone','subject','message']){
      if(used.has(k)&&k!=='message')continue;
      
      let val = tpl[k];
      if (k === 'firstName' && (!val || val.trim() === '')) {
        const s = splitName(tpl.name);
        val = tpl.firstName || s.first || tpl.name;
      }
      if (k === 'lastName' && (!val || val.trim() === '')) {
        const s = splitName(tpl.name);
        val = tpl.lastName || s.last || '';
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
  
  // ═══ Pass 2: Text field fallbacks ═══
  if(!used.has('message')&&tpl.message){
    const ta=c.querySelectorAll('textarea');
    if(ta.length>0){await tv(ta[ta.length-1],tpl.message);n++;used.add('message');await new Promise(r=>setTimeout(r, Math.floor((typeof fillDelayMs !== 'undefined' ? fillDelayMs : 300) * 0.5)));}
  }
  if(!used.has('name')&&tpl.name){
    const ti=c.querySelector('input[type=text],input:not([type])');
    if(ti&&!ti.value){await tv(ti,tpl.name);n++;used.add('name');}
  }
  
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
  try {
    const finalInputs = Array.from(c.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]),textarea,select'));
    for (const el of finalInputs) {
      if (el.disabled || el.readOnly) continue;
      
      const currentVal = el.tagName === 'SELECT' ? el.value : (el.contentEditable === 'true' ? el.textContent : el.value);
      if (currentVal && currentVal.trim() !== '') {
        setNativeValue(el, currentVal);
        ['input', 'change', 'blur'].forEach(t => el.dispatchEvent(new Event(t, { bubbles: true, cancelable: true })));
        
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

function submit(c){
  // [v4.12.50] Force Enable Submit Buttons (Bypass client-side disabled state)
  c.querySelectorAll('button, input[type="submit"], input[type="button"], a.button, div.button, [role="button"]').forEach(b => {
    try {
      b.disabled = false;
      b.removeAttribute('disabled');
      b.removeAttribute('aria-disabled');
      b.classList.remove('disabled', 'is-disabled');
      if (b.style.pointerEvents === 'none') b.style.pointerEvents = 'auto';
    } catch(e) {}
  });

  const sels=['button[type=submit]','input[type=submit]','[class*="submit"i]','[id*="submit"i]',
    '[name*="submit"i]','[value*="submit"i]','[value*="send"i]','[class*="send"i]','[id*="send"i]',
    'button.btn-primary','button.primary','button:not([type=button]):not([type=reset])'];
    
  for(const s of sels){
    const b=c.querySelector(s);
    if(b&&b.offsetParent!==null){b.click();return true;}
  }
  
  // Text-based fallback for complex/custom UI buttons
  const allBtns = Array.from(c.querySelectorAll('button, div[role="button"], a[role="button"], input[type="submit"], input[type="button"], a[class*="btn"i], div[class*="btn"i]'));
  for (const b of allBtns) {
    if (b.offsetParent === null) continue;
    const txt = (b.textContent || b.value || '').toLowerCase();
    if (txt.includes('submit') || txt.includes('send') || txt.includes('전송') || txt.includes('등록') || txt.includes('보내기') || txt.includes('확인') || txt.includes('완료') || txt.includes('메시지 남기기') || txt.includes('문의하기') || txt.includes('접수')) {
      b.click();
      return true;
    }
  }

  if(c.tagName==='FORM'){try{c.submit();return true;}catch(e){}}
  const f=c.closest?c.closest('form'):null;
  if(f){
    try{f.submit();return true;}catch(e){}
    const b=f.querySelector('button,input[type=submit]');
    if(b){b.click();return true;}
  }
  return false;
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
const n=await fill(f);
if(n===0){window.__xpider_result={success:false,reason:'FILL_FAILED'};return;}
// Human-like pause before submit
await new Promise(r=>setTimeout(r, typeof submitDelayMs !== 'undefined' ? submitDelayMs : 1200));
const ok=submit(f);
await new Promise(r=>setTimeout(r,3000));
window.__xpider_result={success:ok,reason:ok?'SUBMITTED':'NO_SUBMIT_BTN',filled:n};
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
    
    // Check main frame
    try {
        const r = await wc.executeJavaScript('window.__xpider_result || null');
        if (r && r.success) return r; // Immediate success overrides everything
        if (r) allResults.push(r);
        else hasPending = true;
    } catch(e) {}
    
    // Check child frames
    try {
        if (wc.mainFrame) {
            const frames = getAllFrames(wc.mainFrame);
            for (const frame of frames) {
                if (frame === wc.mainFrame) continue;
                try {
                    const r = await frame.executeJavaScript('window.__xpider_result || null');
                    if (r && r.success) return r; 
                    if (r) allResults.push(r);
                    else hasPending = true;
                } catch(e) {}
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
        // 일반적인 입력 필드 탐색
        const inputs = document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea, select');
        if (inputs.length > 0) return true;
        
        // 커스텀 입력이나 contenteditable 등도 입력 폼으로 판단할 수 있음
        const editables = document.querySelectorAll('[contenteditable="true"]');
        if (editables.length > 0) return true;
        
        // iframe 내부나 form 태그 자체
        const forms = document.querySelectorAll('form');
        if (forms.length > 0) return true;
        
        return false;
    })()`;

    // 1. Main frame
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
async function processTarget(targetUrl, template) {
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
        }, 120000);

        try {
            const baseUrl = new URL(targetUrl).origin;
            sendLog(`🔍 [Step 1/4] Scanning target domain: ${baseUrl}...`, 'info');

            const paths = await findContactPages(targetUrl);
            sendLog(`✅ [Step 1/4] Discovery completed. Candidates found (${paths.length}): ${paths.join(', ')}`, 'info');

            if (state.cancelled) { done({ success: false, reason: 'CANCELLED' }); return; }

            for (const path of paths) {
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
                    done({ success: false, reason: 'CANCELLED' });
                    return;
                }

                // [v4.12.55] 탭이 파괴된 경우 (갑자기 닫힘) → 즉시 다음 path로 스킵 (3분 대기 없음)
                if (!tabWC || tabWC.isDestroyed()) {
                    sendLog(`⚠️ [Step 2/4] 탭이 예기치 않게 닫혔습니다. 다음 경로로 이동합니다.`, 'warning');
                    continue;
                }

                if (!formDetected) {
                    sendLog(`🛑 No form found on ${contactUrl}. Skipping this page without delay.`, 'warning');
                    const tempTab = tabWC;
                    if (tempTab && !tempTab.isDestroyed()) {
                        await closeXpiderTab(tempTab);
                    }
                    continue; // 3분 대기 지연 없이 즉각 스킵하여 다음 path로 패스!
                }

                sendLog(`✏️ [Step 3/4] Injecting Super-Intelligent Form Filler v3.0 into all active frames...`, 'info');
                sendLog(`👉 Analyzing DOM: text/email/tel, SELECT dropdowns, radio groups, checkboxes, custom widgets...`, 'debug');
                sendLog(`🔗 Matching template variables + human-like mouse simulation engaged...`, 'debug');
                try {
                    await injectIntoAllFrames(tabWC, getFormFillerScript(template));
                    sendLog(`🚀 [Step 3/4] Smart Form Filler Engine successfully injected. Data population started.`, 'info');
                } catch(e) {
                    sendLog(`⚠️ [Step 3/4] Injection failure: ${e.message}. Purging tab...`, 'warning');
                    const tempTab = tabWC;
                    // [v4.12.55] 탭이 이미 파괴된 경우 closeXpiderTab 호출 생략
                    setTimeout(() => {
                        if (tempTab && !tempTab.isDestroyed()) closeXpiderTab(tempTab);
                    }, 500);
                    continue;
                }

                // Poll for result in ALL frames (Wix may be in iframe, up to 25s)
                sendLog(`🔄 [Step 4/4] Monitoring form submission & reCAPTCHA state...`, 'debug');
                sendLog(`🛡️ CAPTCHA bypass engine monitoring...`, 'debug');
                let result = null;
                let tabClosedDuringPoll = false;
                for (let i = 0; i < 50; i++) {
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
                        // [v4.12.43] 실질적 제출 오류 또는 캡챠 대기 등으로 결과 성공 미확인 시에만 3분 인터벌 대기 가동
                        clearTimeout(globalTimer);
                        
                        sendLog(`⏳ 등록/성공 미확인: 3분(180초) 대기 지연(인터벌)을 시작합니다. 탭을 열어둔 상태로 대기합니다.`, 'info');
                        const holdStart = Date.now();
                        const holdDuration = 180000; // 3분 (180,000ms)
                        while (Date.now() - holdStart < holdDuration && !state.cancelled) {
                            const remainingSec = Math.ceil((holdDuration - (Date.now() - holdStart)) / 1000);
                            if (remainingSec % 30 === 0) { // 30초마다 남은 대기 지연 카운트 노출
                                sendLog(`⏳ [Hold] 탭 유지 중... 다음 프로세싱까지 ${remainingSec}초 대기 중...`, 'debug');
                            }
                            await new Promise(r => setTimeout(r, 1000));
                        }
                        
                        if (state.cancelled) {
                            sendLog(`🛑 대기 중 사용자가 캠페인을 취소했습니다.`, 'stop');
                        } else {
                            sendLog(`🧹 [Hold End] 3분 대기가 만료되었습니다. 탭을 닫고 다음 단계로 이동합니다.`, 'info');
                        }

                        // 3분 대기 완료 혹은 중지 시 탭 강제 닫기
                        const tempTab = tabWC;
                        if (tempTab && !tempTab.isDestroyed()) {
                            await closeXpiderTab(tempTab);
                        }
                    }
                }
            }

            sendLog(`❌ [Step 4/4] Campaign failed for ${baseUrl} (all paths exhausted).`, 'error');
            done({ success: false, reason: 'EXHAUSTED' });
        } catch(e) {
            sendLog(`❌ [System Error] Campaign crashed: ${e.message}`, 'error');
            done({ success: false, reason: e.message });
        }
    });
}

// ─── Main Campaign Loop ───────────────────────────────────────
async function runCampaign(urls, template, delayMs, fillDelayMs = 300, submitDelayMs = 1500) {
    state.active = true; state.cancelled = false; state.paused = false;
    state.queue = [...urls]; state.template = template;
    state.delayMs = delayMs || 10000;
    state.fillDelayMs = fillDelayMs || 300;
    state.submitDelayMs = submitDelayMs || 1500;
    state.successCount = 0; state.completedCount = 0; state.totalTargets = urls.length; state.sessionId++;

    sendLog(`🚀 Native Engine v3.0 (Super-Intelligent Form Filler) starting: ${urls.length} target(s)`, 'start');
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
        const result = await processTarget(targetUrl, template).catch(e => ({ success: false, reason: e.message }));
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

function start(urls, template, delayMs, fillDelayMs, submitDelayMs) {
    if (state.active) { sendLog('⚠️ Already running. Stop first.', 'warning'); return { success: false, error: 'Already running' }; }
    runCampaign(urls, template, delayMs, fillDelayMs, submitDelayMs).catch(e => sendLog(`❌ Engine crash: ${e.message}`, 'error'));
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

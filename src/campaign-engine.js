/**
 * XPIDER Native Campaign Engine v2.0
 * - Opens contact pages in XPIDER browser NEW TAB (not separate window)
 * - Smart form filling: infers values for unmatched fields from template
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

async function findContactPages(baseUrl) {
    const results = [];
    const batchSize = 6;
    for (let i = 0; i < CONTACT_PROBES.length; i += batchSize) {
        if (state.cancelled) break;
        const batch = CONTACT_PROBES.slice(i, i + batchSize);
        const checks = await Promise.all(batch.map(async path => {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 3000);
            try {
                await fetch(baseUrl + path, { method: 'HEAD', signal: controller.signal, mode: 'no-cors' });
                clearTimeout(timer);
                return path;
            } catch(e) { clearTimeout(timer); return null; }
        }));
        results.push(...checks.filter(Boolean));
        if (results.length >= 3) break;
    }
    return results.length > 0 ? results : ['/contact', '/contact-us'];
}

// ─── Smart Form Filler Script ─────────────────────────────────
function getFormFillerScript(template) {
    const tplJson = JSON.stringify(template);
    return `(async function xpiderFill(){
if(window.__xpider_filling)return;
window.__xpider_filling=true;
const tpl=${tplJson};

// [Auto-Name Synthesis] 이름 필드 상호 보완 자가 합성
const processedTpl = { ...tpl };
const rawName = (processedTpl.name || '').trim();
const rawFirst = (processedTpl.firstName || '').trim();
const rawLast = (processedTpl.lastName || '').trim();

if (rawName && !rawFirst && !rawLast) {
    if (rawName.includes(' ')) {
        const parts = rawName.split(/\\s+/);
        processedTpl.firstName = parts.slice(1).join(' ');
        processedTpl.lastName = parts[0];
    } else if (rawName.length === 3) {
        processedTpl.lastName = rawName.substring(0, 1);
        processedTpl.firstName = rawName.substring(1);
    } else if (rawName.length === 2) {
        processedTpl.lastName = rawName.substring(0, 1);
        processedTpl.firstName = rawName.substring(1);
    } else {
        processedTpl.firstName = rawName;
        processedTpl.lastName = rawName;
    }
} else if (!rawName && (rawFirst || rawLast)) {
    if (/[a-zA-Z]/.test(rawFirst || rawLast)) {
        processedTpl.name = [rawFirst, rawLast].filter(Boolean).join(' ');
    } else {
        processedTpl.name = [rawLast, rawFirst].filter(Boolean).join('');
    }
} else if (rawFirst && !rawLast) {
    processedTpl.lastName = rawFirst;
} else if (rawLast && !rawFirst) {
    processedTpl.firstName = rawLast;
}

// Primary field patterns
const P={
  firstName:[/first.*name/i,/given.*name/i,/이름/i,/名前/i,/名/i,/nombre/i,/vorname/i,/prénom/i],
  lastName:[/last.*name/i,/family.*name/i,/surname/i,/성(?!명)/i,/苗字/i,/姓/i,/apellido/i,/nachname/i,/nom.*famille/i],
  name:[/^name$/i,/full.?name/i,/성함/i,/your.?name/i,/contact.?name/i,/氏명/i,/姓名/i,/성명/i,/user/i,/contact.*person/i,/nombre.*completo/i],
  email:[/e.?mail/i,/이메일/i,/メール/i,/邮箱/i,/correo/i,/courriel/i,/correo.*electrónico/i],
  subject:[/^subject$/i,/title(?!.*name)/i,/제목/i,/件명/i,/主题/i,/topic/i,/heading/i,/asunto/i,/betreff/i,/objet/i],
  phone:[/phone/i,/mobile/i,/tel(?!eg)/i,/전화/i,/手机/i,/전화/i,/fax/i,/teléfono/i,/telefon/i,/téléphone/i],
  message:[/message/i,/content/i,/body/i,/comment/i,/inquiry/i,/description/i,/내용/i,/本文/i,/内容/i,/text/i,/detail/i,/note/i,/mensaje/i,/nachricht/i]
};

// Human-like value setter — execCommand first (best reCAPTCHA score)
async function tv(el,v){
  if(!v||!el||el.disabled||el.readOnly)return false;
  
  if (el.tagName === 'SELECT') {
    if (el.options.length > 1) {
      if (el.selectedIndex <= 0) {
        const randomIndex = Math.floor(Math.random() * (el.options.length - 1)) + 1;
        el.selectedIndex = randomIndex;
        el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
        return true;
      }
    }
  } else {
    await simulateHumanClick(el);
    await new Promise(r=>setTimeout(r,120));
    
    // Method 1: execCommand (most human-like — Wix reCAPTCHA friendly)
    let setOk = false;
    try{
      el.select&&el.select();
      document.execCommand('selectAll',false,null);
      setOk = document.execCommand('insertText',false,v);
    }catch(e){}
    
    // Method 2: Native value setter + React fiber
    if (!setOk || el.value !== v) {
      try{
        const proto=el.tagName==='TEXTAREA'?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype;
        const d=Object.getOwnPropertyDescriptor(proto,'value');
        if(d&&d.set)d.set.call(el,v);else el.value=v;
      }catch(e){el.value=v;}
    }
    
    // Method 3: 7-stage event dispatch for Wix & Deep DOM sync
    const events = [
      new Event('focus', { bubbles: true, cancelable: true }),
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: v.slice(-1) }),
      new KeyboardEvent('keypress', { bubbles: true, cancelable: true, key: v.slice(-1) }),
      new InputEvent('input', { bubbles: true, cancelable: true, data: v }),
      new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key: v.slice(-1) }),
      new Event('change', { bubbles: true, cancelable: true }),
      new Event('blur', { bubbles: true, cancelable: true })
    ];
    
    events.forEach(evt => {
      try { el.dispatchEvent(evt); } catch(e) {}
    });
    
    // React fiber
    try{
      const rk=Object.keys(el).find(k=>k.startsWith('__reactFiber')||k.startsWith('__reactInternalInstance'));
      if(rk){
        const props=(el[rk]?.memoizedProps||el[rk]?.pendingProps||el[rk]);
        if(typeof props?.onChange==='function')props.onChange({target:el,currentTarget:el,type:'change',bubbles:true});
      }
    }catch(e){}
    
    el.blur&&el.blur();
    return !!el.value;
  }
  return false;
}

function lbl(el){
  const ls=el.labels?Array.from(el.labels).map(l=>l.textContent).join(' '):'';
  const al=el.getAttribute('aria-label')||'';
  const alb=el.getAttribute('aria-labelledby');
  const albt=alb?(document.getElementById(alb)||{}).textContent||'':'';
  const hook=el.getAttribute('data-hook')||'';
  let parentLbl='';
  let p=el.parentElement;
  for(let i=0;i<5&&p;i++){
    const lEl=p.querySelector('label,p[class*="label"],span[class*="label"],div[class*="label"]');
    if(lEl&&lEl!==el){parentLbl=lEl.textContent||'';break;}
    p=p.parentElement;
  }
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

// Smart inference for unmatched fields
function inferValue(el){
  const c=getFieldId(el);
  const emailDomain=processedTpl.email?processedTpl.email.split('@')[1]||'':'';
  const emailUser=processedTpl.email?processedTpl.email.split('@')[0]||'':'';
  const domainName=emailDomain.split('.')[0]||'';
  
  if(/company|organization|firm|business|brand|corp/i.test(c)){
    return domainName||processedTpl.name||'';
  }
  if(/website|url|homepage|web.?address/i.test(c)){
    return emailDomain?'https://'+emailDomain:'';
  }
  if(/username|user.?id|login|account/i.test(c)){
    return emailUser||processedTpl.name||'';
  }
  if(/(your.?)?(re.?)?enter.*email|confirm.*email|email.*confirm/i.test(c)){
    return processedTpl.email||'';
  }
  if(/interest|reason|purpose|how.*can|service.*need|what.*help/i.test(c)){
    return processedTpl.message?processedTpl.message.substring(0,100):'General inquiry';
  }
  if(/salutation|gender|title/i.test(c)&&el.tagName==='SELECT'){
    return ''; 
  }
  if(el.tagName==='TEXTAREA'&&!el.value){
    return processedTpl.message||'';
  }
  if(/text|input/i.test(el.type||'text')&&/required/i.test(el.getAttribute('required')||'')){
    return processedTpl.name||'';
  }
  return null;
}

function bestForm(){
  const wixForm=document.querySelector('[data-hook="wix-form"],[data-hook="cf-form"],form[class*="form"],[class*="contact-form"],[id*="contact-form"],[class*="wix-form"]');
  if(wixForm)return wixForm;
  const fs=Array.from(document.querySelectorAll('form'));
  if(fs.length>0)return fs.sort((a,b)=>b.querySelectorAll('input:not([type=hidden]),textarea').length-a.querySelectorAll('input:not([type=hidden]),textarea').length)[0];
  const ins=Array.from(document.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]),textarea'));
  if(ins.length>=2){
    let ancestor=ins[0].parentElement;
    let tries=0;
    while(ancestor&&ancestor!==document.body&&tries++<10){
      const c=ancestor.querySelectorAll('input:not([type=hidden]):not([type=submit]),textarea').length;
      if(c>=ins.length)return ancestor;
      ancestor=ancestor.parentElement;
    }
    return document.body;
  }
  return null;
}

async function fill(c){
  let n=0;
  
  // [Helper] 휴먼 마우스 시뮬레이션 엔진 (v6.0)
  const simulateHumanClick = async (element) => {
    if (!element) return;
    try {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await new Promise(r => setTimeout(r, 80));
      const rect = element.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const baseEventInit = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy };
      
      element.dispatchEvent(new MouseEvent('mousemove', baseEventInit));
      await new Promise(r => setTimeout(r, 20));
      element.dispatchEvent(new MouseEvent('mouseover', baseEventInit));
      element.dispatchEvent(new MouseEvent('mouseenter', baseEventInit));
      await new Promise(r => setTimeout(r, 30));
      element.dispatchEvent(new PointerEvent('pointerdown', baseEventInit));
      element.dispatchEvent(new MouseEvent('mousedown', baseEventInit));
      await new Promise(r => setTimeout(r, Math.floor(Math.random() * 40) + 20));
      element.dispatchEvent(new PointerEvent('pointerup', baseEventInit));
      element.dispatchEvent(new MouseEvent('mouseup', baseEventInit));
      element.click();
      element.dispatchEvent(new MouseEvent('click', baseEventInit));
      element.focus && element.focus();
    } catch (e) {
      element.click && element.click();
    }
  };
  // [Helper] 난수 데이터 생성기 (v5.0)
  const generateRandomEmail = () => {
    const domains = ['gmail.com', 'naver.com', 'daum.net', 'outlook.com', 'yahoo.com'];
    const randomStr = Math.random().toString(36).substring(2, 8);
    return 'user_' + randomStr + '@' + domains[Math.floor(Math.random() * domains.length)];
  };
  const generateRandomPhone = () => {
    const prefix = ['010', '011', '016', '017', '019'];
    const mid = Math.floor(1000 + Math.random() * 9000);
    const end = Math.floor(1000 + Math.random() * 9000);
    return prefix[Math.floor(Math.random() * prefix.length)] + '-' + mid + '-' + end;
  };
  const generateRandomText = () => {
    const words = ['inquiry', 'support', 'business', 'request', 'details', 'general', 'message'];
    const randomWord = words[Math.floor(Math.random() * words.length)];
    return randomWord + '_' + Math.floor(100 + Math.random() * 900);
  };

  const templateVals = [
    processedTpl.firstName, processedTpl.lastName, processedTpl.name, processedTpl.email, 
    processedTpl.phone, processedTpl.subject, processedTpl.message
  ].filter(v => typeof v === 'string' && v.trim() !== '');
  const getRandomTplVal = () => templateVals.length > 0 ? templateVals[Math.floor(Math.random() * templateVals.length)] : "Inquiry";

  // 3-Pass Multi-Stage Loop (v5.0)
  for (let pass = 1; pass <= 3; pass++) {
    const els = Array.from(c.querySelectorAll(
      'input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]):not([type=checkbox]):not([type=radio]),textarea,select'
    ));
    const used = new Set();
    
    // (1) 가상 DOM / ARIA 커스텀 컨트롤 스캔 & 채우기
    try {
      // 가상 드롭다운 (role="combobox", select/dropdown 유사 클래스)
      const virtualDropdowns = Array.from(c.querySelectorAll('[role="combobox"], [class*="select"i], [class*="dropdown"i]')).filter(el => {
        return el.tagName !== 'SELECT' && el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA';
      });
      for (const dropdown of virtualDropdowns) {
        const selectedText = (dropdown.textContent || '').trim();
        if (selectedText && selectedText.length > 0 && !/select|choose|dropdown|click/i.test(selectedText)) continue;
        
        await simulateHumanClick(dropdown);
        
        await new Promise(r => setTimeout(r, 120));
        
        const options = Array.from(document.querySelectorAll('[role="option"], li, [class*="option"i], [class*="item"i]')).filter(opt => {
          return opt.offsetParent !== null; 
        });
        if (options.length > 0) {
          const chosen = options[Math.floor(Math.random() * options.length)];
          await simulateHumanClick(chosen);
          chosen.dispatchEvent(new Event('change', { bubbles: true }));
          n++;
        }
        dropdown.dispatchEvent(new Event('blur', { bubbles: true }));
      }
      
      // 가상 체크박스 (role="checkbox")
      const virtualCheckboxes = Array.from(c.querySelectorAll('[role="checkbox"]')).filter(el => el.tagName !== 'INPUT');
      for (const cb of virtualCheckboxes) {
        const ariaChecked = cb.getAttribute('aria-checked') === 'true' || cb.classList.contains('checked') || cb.classList.contains('active');
        const text = (cb.textContent || cb.parentElement?.textContent || '').toLowerCase();
        const termsKeywords = ['agree', 'terms', 'policy', 'consento', '동의', '규정', '약관'];
        
        if (termsKeywords.some(k => text.includes(k))) {
          if (!ariaChecked) {
            await simulateHumanClick(cb);
            cb.dispatchEvent(new Event('change', { bubbles: true }));
            n++;
          }
        } else if (!ariaChecked && Math.random() > 0.2) {
          await simulateHumanClick(cb);
          cb.dispatchEvent(new Event('change', { bubbles: true }));
          n++;
        }
      }
      
      // 가상 라디오 (role="radio")
      const virtualRadios = Array.from(c.querySelectorAll('[role="radio"]')).filter(el => el.tagName !== 'INPUT');
      for (const rd of virtualRadios) {
        const ariaChecked = rd.getAttribute('aria-checked') === 'true' || rd.classList.contains('checked') || rd.classList.contains('active');
        if (!ariaChecked) {
          await simulateHumanClick(rd);
          rd.dispatchEvent(new Event('change', { bubbles: true }));
          n++;
        }
      }
    } catch(e) {}

    // (2) Pass 1: Primary matches
    for (const el of els) {
      if (el.value || el.tagName === 'SELECT') continue;
      for (const k of ['firstName', 'lastName', 'name', 'email', 'phone', 'subject', 'message']) {
        if (used.has(k) && k !== 'message') continue;
        const c2 = getFieldId(el);
        if (processedTpl[k] && P[k].some(r => r.test(c2))) {
          if (await tv(el, processedTpl[k])) { used.add(k); n++; await new Promise(r => setTimeout(r, 150)); break; }
        }
      }
    }
    
    // (3) Pass 2: Fallbacks
    if (!used.has('message') && processedTpl.message) {
      const ta = c.querySelectorAll('textarea');
      if (ta.length > 0 && !ta[ta.length - 1].value) { await tv(ta[ta.length - 1], processedTpl.message); n++; used.add('message'); await new Promise(r => setTimeout(r, 150)); }
    }
    if (!used.has('name') && processedTpl.name) {
      const ti = c.querySelector('input[type=text],input:not([type])');
      if (ti && !ti.value) { await tv(ti, processedTpl.name); n++; used.add('name'); }
    }
    
    // (4) Pass 3: Smart inference for unmatched/empty fields
    for (const el of els) {
      if (el.value || el.tagName === 'SELECT') continue;
      const inferred = inferValue(el);
      if (inferred) { await tv(el, inferred); n++; await new Promise(r => setTimeout(r, 100)); }
    }

    // (5) Pass 4: Radio and Checkbox Safe Handling
    try {
      c.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        if (!cb.checked && !cb.disabled) {
          const lblText = lbl(cb);
          if (/agree|terms|policy|동의|규정|약관/i.test(lblText)) {
            await simulateHumanClick(cb);
            cb.dispatchEvent(new Event('change', { bubbles: true }));
          } else if (Math.random() > 0.2) {
            await simulateHumanClick(cb);
            cb.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
      });
    } catch(e) {}

    // (6) Pass 5: Ultimate Required Fields Guard (v6.0 - 100% 무결점 보완 시스템 탑재)
    // contenteditable 요소 스캔 및 텍스트 강제 주입
    const editors = Array.from(c.querySelectorAll('[contenteditable="true"]'));
    for (const editor of editors) {
      if (!editor.textContent || editor.textContent.trim() === '') {
        await simulateHumanClick(editor);
        editor.textContent = processedTpl.message || generateRandomText();
        editor.dispatchEvent(new Event('input', { bubbles: true }));
        editor.dispatchEvent(new Event('blur', { bubbles: true }));
        n++;
      }
    }

    // 모든 요소 중 required 속성이 있는 것들 (els 배열에 국한되지 않음)
    const allReqs = Array.from(c.querySelectorAll('*[required], *[aria-required="true"], .required, .essential'));
    for (const el of allReqs) {
      if (el.disabled || el.readOnly || el.type === 'hidden') continue;
      
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        if (!el.value) {
          let fbVal = "";
          const fid = getFieldId(el);
          if (fid.includes('email')) fbVal = processedTpl.email || generateRandomEmail();
          else if (fid.includes('phone') || fid.includes('tel') || fid.includes('mobile')) fbVal = processedTpl.phone || generateRandomPhone();
          else if (fid.includes('subject') || fid.includes('title')) fbVal = processedTpl.subject || generateRandomText();
          else if (fid.includes('name')) fbVal = processedTpl.name || processedTpl.firstName || "User";
          else fbVal = getRandomTplVal() !== 'Inquiry' ? getRandomTplVal() : generateRandomText();
          
          try { el.removeAttribute('required'); el.removeAttribute('aria-required'); } catch(e) {}
          await tv(el, fbVal);
          n++;
        }
      } else if (el.tagName === 'SELECT') {
        if (el.selectedIndex <= 0 && el.options.length > 1) {
          const validOptions = [];
          for (let i = 1; i < el.options.length; i++) {
            if (el.options[i].value && !el.options[i].disabled) validOptions.push(i);
          }
          const finalIdx = validOptions.length > 0 ? validOptions[Math.floor(Math.random() * validOptions.length)] : 1;
          await simulateHumanClick(el);
          el.selectedIndex = finalIdx;
          el.dispatchEvent(new Event('change', { bubbles: true }));
          try { el.removeAttribute('required'); el.removeAttribute('aria-required'); } catch(e) {}
          n++;
        }
      } else if (el.tagName === 'DIV' || el.tagName === 'SPAN') {
        try { el.removeAttribute('required'); el.removeAttribute('aria-required'); } catch(e) {}
      }
    }

    if (pass < 3) {
      await new Promise(r => setTimeout(r, 200));
    }
  }
  
  return n;
}

function submit(c){
  const sels=['button[type=submit]','input[type=submit]','[class*="submit"i]','[id*="submit"i]',
    'button.btn-primary','button.primary','button:not([type=button]):not([type=reset])'];
  for(const s of sels){
    const b=c.querySelector(s);
    if(b&&b.offsetParent!==null&&!b.disabled){b.click();return true;}
  }
  if(c.tagName==='FORM'){try{c.submit();return true;}catch(e){}}
  const f=c.closest?c.closest('form'):null;
  if(f){const b=f.querySelector('button,input[type=submit]');if(b){b.click();return true;}}
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

const f=bestForm();
if(!f){window.__xpider_result={success:false,reason:'NO_FORM'};return;}
const n=await fill(f);
if(n===0){window.__xpider_result={success:false,reason:'FILL_FAILED'};return;}
// Human-like pause before submit
await new Promise(r=>setTimeout(r,1200));
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
    // Check main frame
    try {
        const r = await wc.executeJavaScript('window.__xpider_result || null');
        if (r) return r;
    } catch(e) {}
    // Check child frames
    try {
        if (wc.mainFrame) {
            const frames = getAllFrames(wc.mainFrame);
            for (const frame of frames) {
                if (frame === wc.mainFrame) continue;
                try {
                    const r = await frame.executeJavaScript('window.__xpider_result || null');
                    if (r) return r;
                } catch(e) {}
            }
        }
    } catch(e) {}
    return null;
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
                const allWvs = document.querySelectorAll('webview[data-xpider-campaign="true"]');
                let closedCount = 0;
                for (const wv of allWvs) {
                    try {
                        const tabUiId = wv.id ? wv.id.replace('webview-', '') : null;
                        if (tabUiId && typeof window.closeTab === 'function') {
                            window.closeTab(tabUiId);
                            closedCount++;
                        }
                    } catch(e) {}
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

            const paths = await findContactPages(baseUrl);
            sendLog(`✅ [Step 1/4] Discovery completed. Candidates found (${paths.length}): ${paths.join(', ')}`, 'info');

            if (state.cancelled) { done({ success: false, reason: 'CANCELLED' }); return; }

            for (const path of paths) {
                if (state.cancelled) break;
                const contactUrl = baseUrl + path;
                sendLog(`🔗 [Step 2/4] Navigating to page: ${contactUrl}...`, 'visit');

                // Try to open in XPIDER browser tab (100% inner tabs routing)
                tabWC = await openInXpiderTab(contactUrl);

                if (!tabWC) {
                    sendLog(`⚠️ [Step 2/4] XPIDER tab creation timed out for ${contactUrl}. Trying next path...`, 'warning');
                    continue; // 새 창을 절대 띄우지 않고 즉시 다음 path로 패스!
                } else {
                    // Wait for the XPIDER tab to finish loading (Wix needs ~6s)
                    sendLog(`⏳ [Step 2/4] Waiting 6s for XPIDER tab scripts and frames initialization...`, 'debug');
                    await new Promise(r => setTimeout(r, 6000));
                    state.currentTabWC = tabWC;
                }

                if (!tabWC || tabWC.isDestroyed()) {
                    sendLog(`⚠️ [Step 2/4] Connection lost for ${contactUrl}. Attempting next path...`, 'warning');
                    continue;
                }

                sendLog(`✏️ [Step 3/4] Injecting Smart Form Filler Engine into all active frames...`, 'info');
                sendLog(`👉 Analyzing DOM to locate valid form elements...`, 'debug');
                sendLog(`🔗 Matching configured template variables to form fields...`, 'debug');
                try {
                    await injectIntoAllFrames(tabWC, getFormFillerScript(template));
                    sendLog(`🚀 [Step 3/4] Smart Form Filler Engine successfully injected. Data population started.`, 'info');
                } catch(e) {
                    sendLog(`⚠️ [Step 3/4] Injection failure: ${e.message}. Purging tab...`, 'warning');
                    const tempTab = tabWC;
                    setTimeout(() => {
                        if (tempTab && !tempTab.isDestroyed()) closeXpiderTab(tempTab);
                    }, 500);
                    continue;
                }

                // Poll for result in ALL frames (Wix may be in iframe, up to 25s)
                sendLog(`🔄 [Step 4/4] Monitoring form submission & reCAPTCHA state...`, 'debug');
                sendLog(`🛡️ CAPTCHA bypass engine monitoring...`, 'debug');
                let result = null;
                for (let i = 0; i < 50; i++) {
                    await new Promise(r => setTimeout(r, 500));
                    if (tabWC.isDestroyed()) break;
                    result = await pollAllFrames(tabWC);
                    if (result) break;
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
                    // Keep the tab open briefly so user can see the confirmation
                    const tempTab = tabWC;
                    setTimeout(() => {
                        if (tempTab && !tempTab.isDestroyed()) closeXpiderTab(tempTab);
                    }, 5000);
                    done({ success: true });
                    return;
                } else {
                    const reason = result ? result.reason : 'NO_RESULT';
                    sendLog(`⚠️ [Step 4/4] Path ${path} unsuccessful (Reason: ${reason}). Retrying next...`, 'warning');
                    // ✅ Close tab immediately on failure
                    const tempTab = tabWC;
                    setTimeout(() => {
                        if (tempTab && !tempTab.isDestroyed()) closeXpiderTab(tempTab);
                    }, 500);
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
async function runCampaign(urls, template, delayMs) {
    state.active = true; state.cancelled = false; state.paused = false;
    state.queue = [...urls]; state.template = template;
    state.delayMs = delayMs || 10000;
    state.successCount = 0; state.completedCount = 0; state.totalTargets = urls.length; state.sessionId++;

    sendLog(`🚀 Native Engine v2.0 starting: ${urls.length} target(s)`, 'start');
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

function start(urls, template, delayMs) {
    if (state.active) { sendLog('⚠️ Already running. Stop first.', 'warning'); return { success: false, error: 'Already running' }; }
    runCampaign(urls, template, delayMs).catch(e => sendLog(`❌ Engine crash: ${e.message}`, 'error'));
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

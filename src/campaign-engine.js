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

// 🛡️ [Stealth Shield v4.0] Main-world patch inside form frame to completely hide automation traces
try {
  if (navigator.webdriver !== false) {
    try { delete Navigator.prototype.webdriver; } catch(e) {}
    try { Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false, configurable: true }); } catch(e) {}
  }
  if (!window.chrome) window.chrome = { app: {} };
  Object.defineProperty(navigator, 'languages', { get: () => ['ko-KR', 'ko', 'en-US', 'en'], configurable: true });
} catch(e) {}

const tpl=${tplJson};

// Primary field patterns
const P={
  firstName:[/first.?name/i,/given.?name/i,/이름/i,/名前/i],
  lastName:[/last.?name/i,/family.?name/i,/surname/i,/성(?!명|함)/i],
  name:[/\bname\b/i,/full.?name/i,/your.*name/i,/contact.*name/i,/성함/i,/氏名/i,/姓名/i,/성명/i,/이름/i,/user/i],
  email:[/e.?mail/i,/이메일/i,/メール/i,/邮箱/i],
  subject:[/subject/i,/title(?!.*name)/i,/제목/i,/件名/i,/主题/i,/topic/i,/heading/i],
  phone:[/phone/i,/mobile/i,/tel(?!eg)/i,/전화/i,/手机/i,/电话/i,/fax/i],
  message:[/message/i,/content/i,/body/i,/comment/i,/inquiry/i,/description/i,/내용/i,/本文/i,/内容/i,/text/i,/detail/i,/note/i]
};

// [v4.12.26] Stealth Human-like typing simulation — types character by character with delays and mistake corrections
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
  } catch(e) { el.value = ''; }
  
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
      el.value = currentVal;
      el.dispatchEvent(new InputEvent('input', {bubbles:true, data:typo}));
      await new Promise(r=>setTimeout(r, 100 + Math.random()*120));
      
      // Delete typo (Backspace simulation)
      currentVal = currentVal.slice(0, -1);
      el.value = currentVal;
      el.dispatchEvent(new InputEvent('input', {bubbles:true, inputType: 'deleteContentBackward'}));
      await new Promise(r=>setTimeout(r, 120 + Math.random()*80));
    }
    
    currentVal += char;
    el.value = currentVal;
    
    // Dispatch rich keyboard and input events
    const keyOpts = {bubbles:true, cancelable:true, key:char, charCode:char.charCodeAt(0)};
    el.dispatchEvent(new KeyboardEvent('keydown', keyOpts));
    el.dispatchEvent(new KeyboardEvent('keypress', keyOpts));
    el.dispatchEvent(new InputEvent('input', {bubbles:true, data:char}));
    el.dispatchEvent(new KeyboardEvent('keyup', keyOpts));
    
    // Standard typist delay: 45ms to 95ms per keystroke (slowing down on punctuation)
    const delay = /[.,!?;:]/.test(char) ? (180 + Math.random()*220) : (45 + Math.random()*50);
    await new Promise(r=>setTimeout(r, delay));
  }
  
  // React / Framework synchronization
  ['change', 'blur'].forEach(t=>
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

function bestForm(){
  // Wix-specific form containers
  const wixForm=document.querySelector('[data-hook="wix-form"],[data-hook="cf-form"],form[class*="form"],[class*="contact-form"],[id*="contact-form"],[class*="wix-form"]');
  if(wixForm)return wixForm;
  const fs=Array.from(document.querySelectorAll('form'));
  // [v4.12.25] Count ALL interactive elements including select, radio, checkbox
  const countFields=(el)=>el.querySelectorAll('input:not([type=hidden]),textarea,select,[role=combobox]').length;
  if(fs.length>0)return fs.sort((a,b)=>countFields(b)-countFields(a))[0];
  // No <form> tag (common in Wix): find input cluster common ancestor
  const ins=Array.from(document.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]),textarea,select'));
  if(ins.length>=2){
    let ancestor=ins[0].parentElement;
    let tries=0;
    while(ancestor&&ancestor!==document.body&&tries++<10){
      const c=ancestor.querySelectorAll('input:not([type=hidden]):not([type=submit]),textarea,select').length;
      if(c>=ins.length)return ancestor;
      ancestor=ancestor.parentElement;
    }
    return document.body;
  }
  return null;
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
    if(el.tagName==='SELECT')continue; // SELECTs handled in Pass 3
    for(const k of['firstName','lastName','name','email','phone','subject','message']){
      if(used.has(k)&&k!=='message')continue;
      
      let val = tpl[k];
      if (k === 'firstName' && (!val || val.trim() === '')) val = tpl.name;
      if (k === 'lastName' && (!val || val.trim() === '')) val = '';
      
      const c2=getFieldId(el);
      if(val && val.trim() !== '' && P[k].some(r=>r.test(c2))){
        if(await tv(el,val)){used.add(k);n++;await new Promise(r=>setTimeout(r,150));break;}
      }
    }
  }
  
  // ═══ Pass 2: Text field fallbacks ═══
  if(!used.has('message')&&tpl.message){
    const ta=c.querySelectorAll('textarea');
    if(ta.length>0){await tv(ta[ta.length-1],tpl.message);n++;used.add('message');await new Promise(r=>setTimeout(r,150));}
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
    if(inferred){await tv(el,inferred);n++;await new Promise(r=>setTimeout(r,100));}
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

                sendLog(`✏️ [Step 3/4] Injecting Super-Intelligent Form Filler v3.0 into all active frames...`, 'info');
                sendLog(`👉 Analyzing DOM: text/email/tel, SELECT dropdowns, radio groups, checkboxes, custom widgets...`, 'debug');
                sendLog(`🔗 Matching template variables + human-like mouse simulation engaged...`, 'debug');
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

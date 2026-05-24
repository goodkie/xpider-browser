/**
 * XPIDER Native Campaign Engine v2.0
 * - Opens contact pages in XPIDER browser NEW TAB (not separate window)
 * - Smart form filling: infers values for unmatched fields from template
 */

const { app, BrowserWindow } = require('electron');

let _getAllWebContents = null;
let _log = null;
let _getMainWindow = null;  // Function that returns the current mainWindow

const state = {
    active: false, paused: false, cancelled: false,
    queue: [], template: null, delayMs: 10000,
    successCount: 0, totalTargets: 0,
    currentTabWC: null, sessionId: 0
};

function init(getAllWebContentsFn, logFn, getMainWindowFn) {
    _getAllWebContents = getAllWebContentsFn;
    _log = logFn;
    _getMainWindow = getMainWindowFn;
}

function broadcast(message) {
    if (!_getAllWebContents) return;
    _getAllWebContents().forEach(wc => {
        try { wc.send('xpider-ext-runtime-on-message', message); } catch(e) {}
    });
}

function sendLog(msg, type = 'info') {
    if (_log) _log(msg);
    broadcast({ action: 'SENDER_LOG', message: msg, logType: type });
}

function sendStats() {
    broadcast({ action: 'UPDATE_STATS', data: {
        successCount: state.successCount,
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

// Primary field patterns
const P={
  firstName:[/first.?name/i,/given.?name/i,/이름/i,/名前/i],
  lastName:[/last.?name/i,/family.?name/i,/surname/i,/성(?!명)/i],
  name:[/^name$/i,/full.?name/i,/성함/i,/your.?name/i,/contact.?name/i,/氏名/i,/姓名/i,/성명/i],
  email:[/e.?mail/i,/이메일/i,/メール/i,/邮箱/i],
  subject:[/subject/i,/title(?!.*name)/i,/제목/i,/件名/i,/主题/i,/topic/i,/heading/i],
  phone:[/phone/i,/mobile/i,/tel(?!eg)/i,/전화/i,/手机/i,/电话/i,/fax/i],
  message:[/message/i,/content/i,/body/i,/comment/i,/inquiry/i,/description/i,/내용/i,/本文/i,/内容/i,/text/i,/detail/i,/note/i]
};

// Human-like value setter — execCommand first (best reCAPTCHA score)
async function tv(el,v){
  if(!v||!el||el.disabled||el.readOnly)return false;
  el.click&&el.click();
  el.focus&&el.focus();
  await new Promise(r=>setTimeout(r,80));
  // Method 1: execCommand (most human-like — Wix reCAPTCHA friendly)
  try{
    el.select&&el.select();
    document.execCommand('selectAll',false,null);
    const ok=document.execCommand('insertText',false,v);
    if(ok&&el.value){
      el.dispatchEvent(new Event('blur',{bubbles:true}));
      return true;
    }
  }catch(e){}
  // Method 2: Native value setter + React fiber
  try{
    const proto=el.tagName==='TEXTAREA'?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype;
    const d=Object.getOwnPropertyDescriptor(proto,'value');
    if(d&&d.set)d.set.call(el,v);else el.value=v;
  }catch(e){el.value=v;}
  ['input','change','keyup','blur'].forEach(t=>
    el.dispatchEvent(new Event(t,{bubbles:true,cancelable:true}))
  );
  // React fiber
  try{
    const rk=Object.keys(el).find(k=>k.startsWith('__reactFiber')||k.startsWith('__reactInternalInstance'));
    if(rk){
      const props=(el[rk]?.memoizedProps||el[rk]?.pendingProps||el[rk]);
      if(typeof props?.onChange==='function')props.onChange({target:el,currentTarget:el,type:'change',bubbles:true});
    }
  }catch(e){}
  try{el.dispatchEvent(new InputEvent('input',{bubbles:true,cancelable:true,data:v}));}catch(e){}
  return !!el.value;
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
  if(fs.length>0)return fs.sort((a,b)=>b.querySelectorAll('input:not([type=hidden]),textarea').length-a.querySelectorAll('input:not([type=hidden]),textarea').length)[0];
  // No <form> tag (common in Wix): find input cluster common ancestor
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
  const els=Array.from(c.querySelectorAll(
    'input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]):not([type=checkbox]):not([type=radio]),textarea,select'
  ));
  const used=new Set();
  let n=0;
  
  // Pass 1: Primary matches (with delay between fields for human-like behavior)
  for(const el of els){
    if(el.tagName==='SELECT')continue;
    for(const k of['firstName','lastName','name','email','phone','subject','message']){
      if(used.has(k)&&k!=='message')continue;
      const c2=getFieldId(el);
      if(tpl[k]&&P[k].some(r=>r.test(c2))){
        if(await tv(el,tpl[k])){used.add(k);n++;await new Promise(r=>setTimeout(r,150));break;}
      }
    }
  }
  
  // Pass 2: Fallbacks
  if(!used.has('message')&&tpl.message){
    const ta=c.querySelectorAll('textarea');
    if(ta.length>0){await tv(ta[ta.length-1],tpl.message);n++;used.add('message');await new Promise(r=>setTimeout(r,150));}
  }
  if(!used.has('name')&&tpl.name){
    const ti=c.querySelector('input[type=text],input:not([type])');
    if(ti&&!ti.value){await tv(ti,tpl.name);n++;used.add('name');}
  }
  
  // Pass 3: Smart inference for unmatched/empty fields
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
    // Check main frame
    try {
        const r = await wc.executeJavaScript('window.__xpider_result || null');
        if (r) return r;
    } catch(e) {}
    // Check child frames
    try {
        const frames = getAllFrames(wc.mainFrame);
        for (const frame of frames) {
            if (frame === wc.mainFrame) continue;
            try {
                const r = await frame.executeJavaScript('window.__xpider_result || null');
                if (r) return r;
            } catch(e) {}
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

// ─── Open URL in XPIDER Browser as New Tab ────────────────────
async function openInXpiderTab(contactUrl) {
    const mw = _getMainWindow ? _getMainWindow() : null;
    if (!mw || mw.isDestroyed()) return null;

    return new Promise(resolve => {
        let resolved = false;
        const parsedUrl = new URL(contactUrl);
        const hostname = parsedUrl.hostname;
        const targetPath = parsedUrl.pathname.replace(/\/+$/, '') || '/';

        // Domains/patterns that indicate CDN/worker frames - NOT the actual page
        const CDN_BLOCKS = [
            'parastorage.com', 'wixstatic.com', 'wix.com/_api',
            'tpaWorker', 'worker?pageId', 'static.', '/_api/'
        ];

        const isRealPage = (u) => {
            if (!u) return false;
            try {
                const parsed = new URL(u);
                // Must be same hostname
                if (!parsed.hostname.endsWith(hostname.replace(/^www\./, '')) &&
                    !hostname.endsWith(parsed.hostname.replace(/^www\./,''))) return false;
                // Must NOT be a CDN/worker URL
                if (CDN_BLOCKS.some(b => u.includes(b))) return false;
                return true;
            } catch(e) { return false; }
        };

        const timer = setTimeout(() => {
            if (!resolved) { resolved = true; app.removeListener('web-contents-created', wcHandler); resolve(null); }
        }, 8000);

        const wcHandler = (event, wc) => {
            const checkMatch = () => {
                if (resolved) return;
                try {
                    const u = wc.getURL();
                    if (isRealPage(u)) {
                        resolved = true;
                        clearTimeout(timer);
                        app.removeListener('web-contents-created', wcHandler);
                        resolve(wc);
                    }
                } catch(e) {}
            };
            wc.on('did-navigate', checkMatch);
            wc.on('did-finish-load', checkMatch);
        };
        app.on('web-contents-created', wcHandler);

        // Ask renderer to open new tab
        mw.webContents.executeJavaScript(`
            (function(){
                const url=${JSON.stringify(contactUrl)};
                const fns=['openNewTab','createNewTab','newTab','addTab','createTab','openTab','_xpiderNewTab'];
                for(const fn of fns){if(typeof window[fn]==='function'){window[fn](url);return fn;}}
                const btn=document.querySelector('#new-tab-btn,[data-action="new-tab"],[class*="new-tab"],[id*="new-tab"],#add-tab');
                if(btn){btn.click();setTimeout(()=>{const wv=document.querySelector('webview:last-of-type');if(wv)wv.src=url;},300);return 'btn-click';}
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
            sendLog(`⏱️ Timeout: ${targetUrl}`, 'warning');
            if (state.currentTabWC && !state.currentTabWC.isDestroyed()) {
                const tempTabWC = state.currentTabWC;
                closeXpiderTab(tempTabWC);
            }
            done({ success: false, reason: 'TIMEOUT' });
        }, 120000);

        try {
            const baseUrl = new URL(targetUrl).origin;
            sendLog(`🔍 Step 1: Searching contact page for ${baseUrl}...`, 'info');

            const paths = await findContactPages(baseUrl);
            sendLog(`✅ Found ${paths.length} candidate path(s)`, 'info');

            if (state.cancelled) { done({ success: false, reason: 'CANCELLED' }); return; }

            const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';

        for (const path of paths) {
                if (state.cancelled) break;
                const contactUrl = baseUrl + path;
                sendLog(`🔗 Step 2: Opening ${contactUrl} in new tab...`, 'visit');

                let win = null; // Track BrowserWindow for cleanup

                // Try to open in XPIDER browser tab
                tabWC = await openInXpiderTab(contactUrl);

                if (!tabWC) {
                    // Fallback: BrowserWindow
                    sendLog(`⚙️ Using background window (tab API unavailable)`, 'debug');
                    try {
                        win = new BrowserWindow({
                            width: 1280, height: 800, show: true,
                            title: `XPIDER → ${baseUrl}`,
                            webPreferences: { nodeIntegration: false, contextIsolation: true, webSecurity: false }
                        });
                        state.currentTabWC = win.webContents;
                        await win.loadURL(contactUrl, { userAgent: UA });
                        await new Promise(r => setTimeout(r, 8000)); // Wix needs extra time
                        tabWC = win.webContents;
                    } catch(e) {
                        sendLog(`⚠️ Window load error: ${e.message}`, 'warning');
                        if (win && !win.isDestroyed()) try { win.close(); } catch(e2) {}
                        continue; // Try next path immediately
                    }
                } else {
                    // Wait for the XPIDER tab to finish loading (Wix needs ~6s)
                    await new Promise(r => setTimeout(r, 6000));
                    state.currentTabWC = tabWC;
                }

                if (!tabWC || tabWC.isDestroyed()) {
                    sendLog(`⚠️ Tab lost for ${contactUrl}. Skipping.`, 'warning');
                    if (win && !win.isDestroyed()) try { win.close(); } catch(e2) {}
                    continue;
                }

                sendLog(`✏️ Step 3: Injecting smart form engine into all frames...`, 'info');
                try {
                    await injectIntoAllFrames(tabWC, getFormFillerScript(template));
                } catch(e) {
                    sendLog(`⚠️ Injection error: ${e.message}. Closing tab...`, 'warning');
                    if (win && !win.isDestroyed()) setTimeout(() => { try { win.close(); } catch(e2) {} }, 500);
                    continue;
                }

                // Poll for result in ALL frames (Wix may be in iframe, up to 25s)
                let result = null;
                for (let i = 0; i < 50; i++) {
                    await new Promise(r => setTimeout(r, 500));
                    if (tabWC.isDestroyed()) break;
                    result = await pollAllFrames(tabWC);
                    if (result) break;
                }

                if (result && result.success) {
                    sendLog(`✅ Step 4: Form submitted! (${result.filled} fields filled)`, 'success');
                    // Keep the tab open briefly so user can see the confirmation
                    const tempWin = win;
                    const tempTab = tabWC;
                    setTimeout(() => {
                        if (tempWin && !tempWin.isDestroyed()) try { tempWin.close(); } catch(e) {}
                        if (tempTab && !tempTab.isDestroyed()) closeXpiderTab(tempTab);
                    }, 5000);
                    done({ success: true });
                    return;
                } else {
                    const reason = result ? result.reason : 'NO_RESULT';
                    sendLog(`⚠️ Path ${path}: ${reason}. Closing tab and trying next...`, 'warning');
                    // ✅ Close tab/window immediately on failure
                    const tempWin = win;
                    const tempTab = tabWC;
                    setTimeout(() => {
                        if (tempWin && !tempWin.isDestroyed()) try { tempWin.close(); } catch(e) {}
                        if (tempTab && !tempTab.isDestroyed()) closeXpiderTab(tempTab);
                    }, 500);
                }
            }

            sendLog(`❌ No form submitted for ${baseUrl}`, 'error');
            done({ success: false, reason: 'EXHAUSTED' });
        } catch(e) {
            sendLog(`❌ Error: ${e.message}`, 'error');
            done({ success: false, reason: e.message });
        }
    });
}

// ─── Main Campaign Loop ───────────────────────────────────────
async function runCampaign(urls, template, delayMs) {
    state.active = true; state.cancelled = false; state.paused = false;
    state.queue = [...urls]; state.template = template;
    state.delayMs = delayMs || 10000;
    state.successCount = 0; state.totalTargets = urls.length; state.sessionId++;

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
        if (result.success) { state.successCount++; sendStats(); }

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
    sendLog('🛑 Campaign stopped by user.', 'stop');
}

function pause() { state.paused = true; sendLog('⏸️ Campaign paused.', 'info'); }
function resume() { state.paused = false; sendLog('▶️ Campaign resumed.', 'info'); }
function isActive() { return state.active; }

module.exports = { init, start, stop, pause, resume, isActive };

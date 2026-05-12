// background.js - Bing Maps Business Finder: Stage 2 Contact-First Discovery Engine
try {
  importScripts('business_filters.js', 'captcha_solver.js');
} catch (e) {
  console.error("Worker import failed:", e);
}

let scrapedData = [];
let isFindingEmails = false;
let isCancelled = false;
let isSolvedCaptcha = false;

// Initialize
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.storage.local.get(['scrapedData'], (result) => {
  if (result.scrapedData) scrapedData = result.scrapedData;
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log(`[BACKGROUND] Action Received: ${request.action}`, request);

  if (request.action === 'foundBusiness') {
    handleNewLead(request.data);
  }

  else if (request.action === 'startScraping') {
    chrome.storage.local.set({ scrapingActive: true });
  }

  else if (request.action === 'stopScraping') {
    chrome.storage.local.set({ scrapingActive: false });
  }

  else if (request.action === 'startEmailCheck') {
    console.log('[BACKGROUND] Starting Email Check process...');
    chrome.storage.local.get(['scrapedData', 'language'], (res) => {
      if (chrome.runtime.lastError) {
        console.error('[BACKGROUND] Storage Load Error:', chrome.runtime.lastError);
        return;
      }
      scrapedData = res.scrapedData || [];
      const hl = res.language || 'en';
      console.log(`[BACKGROUND] Loaded ${scrapedData.length} leads for Stage 2 (Lang: ${hl})`);
      startDeepSearch(hl).catch(err => {
        console.error('[BACKGROUND] startDeepSearch failed:', err);
        isFindingEmails = false;
      });
    });
  }

  else if (request.action === 'stopEmailCheck') {
    isCancelled = true;
    isFindingEmails = false;
    sendLog('Stage 2: Stopped by user.');
  }

  else if (request.action === 'clearData') {
    scrapedData = [];
    isFindingEmails = false;
    isCancelled = true;
    chrome.storage.local.set({ scrapedData: [], scrapingActive: false, emailCheckActive: false }, () => {
      console.log('[BACKGROUND] clearData: storage reset to []');
    });
    sendLog('Data memory cleared. scrapedData = []');
  }

  else if (request.action === 'START_NATIVE_STT') {
    createOffscreen().then(() => {
      chrome.runtime.sendMessage({ ...request, action: 'START_NATIVE_STT' });
    });
    return true;
  }
  
  return true; // Keep channel open for async responses if needed
});

// ─── 업체명 블랙리스트 ───────────────────────────────────────────────────────
// Bing Maps UI 컨트롤 버튼명이 업체명으로 잘못 수집되는 것을 방지
const BUSINESS_NAME_BLACKLIST = new Set([
  // Bing Maps 한국어 UI 컨트롤
  '피치 감소', '기본 피치로 초기화', '피치 증가',
  '왼쪽으로 회전', '기본 회전으로 초기화', '오른쪽으로 회전',
  '축소', '확대', '지오체인 확장/축소',
  '내 위치 찾기', '교통', '스타일 선택',
  '카드 확장/축소', '검색',
  // Bing Maps 영어 UI 컨트롤 (혹시 언어 설정에 따라 영어로 표시될 경우 대비)
  'Decrease pitch', 'Reset pitch', 'Increase pitch',
  'Rotate left', 'Reset rotation', 'Rotate right',
  'Zoom out', 'Zoom in', 'Expand/Collapse geocode',
  'Find my location', 'Traffic', 'Select style',
  'Expand/Collapse card', 'Search',
  // 기타 흔한 잘못된 캡처
  'N/A', 'undefined', 'null', '', ' '
]);

function isBlacklisted(name) {
  if (!name || typeof name !== 'string') return true;
  const trimmed = name.trim();
  if (trimmed.length < 2) return true;
  if (BUSINESS_NAME_BLACKLIST.has(trimmed)) return true;
  // 숫자만으로 이루어진 이름 제외
  if (/^\d+$/.test(trimmed)) return true;
  return false;
}

function handleNewLead(lead) {
  // ★ 블랙리스트 필터링: UI 컨트롤 버튼명 등 잘못된 업체명 제외
  if (isBlacklisted(lead.name)) {
    console.log(`[BACKGROUND] 블랙리스트 필터: "${lead.name}" 제외됨`);
    return;
  }

  const exists = scrapedData.find(b => {
    if (lead.placeId && b.placeId === lead.placeId) return true;
    if (b.name === lead.name && (b.website === lead.website || b.address === lead.address)) return true;
    return false;
  });
  if (exists) return;

  scrapedData.push({
    ...lead,
    id: Date.now() + Math.random().toString(36).substr(2, 9),
    email: 'Pending Stage 2',
    status: 'captured'
  });

  updateStorage();
}

function updateStorage() {
  chrome.storage.local.set({ scrapedData });
  chrome.runtime.sendMessage({ action: 'dataUpdated', data: scrapedData }).catch(() => {});
}

async function sendLog(msg) {
  console.log(`[STAGE2] ${msg}`);
  chrome.runtime.sendMessage({ action: 'log', message: msg }).catch(() => {});
}

async function handleTranscription(audioData, audioUrl, sendResponse) {
  const keys = await chrome.storage.local.get(['witKey', 'captchaMethod']);
  try {
    const text = await CAPTCHA_SOLVER.transcribeAudio(audioUrl, { audioSttKey: keys.witKey }, audioData);
    sendResponse({ text });
  } catch (err) {
    sendResponse({ error: err.message });
  }
}

async function createOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['WORKERS'],
    justification: 'OCR and Audio support'
  });
}

// ─── STAGE 2: 페이지 스캔 엔진 ────────────────────────────────────────────────
async function scanPageInBrowser(targetUrl, waitMs = 5000) {
  console.log(`[STAGE2] scanPageInBrowser starting for: ${targetUrl}`);
  
  return new Promise((resolve) => {
    chrome.storage.local.get(['isXpider'], (settings) => {
      const isXpider = settings && settings.isXpider === true;

      if (isXpider) {
        // ★ 각 요청마다 고유 requestId → 동시 요청 간섭 방지
        const requestId = 'scan_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
        const timeoutHandle = setTimeout(() => {
          chrome.runtime.onMessage.removeListener(listener);
          console.warn(`[STAGE2] PROXY_SCAN timeout for ${targetUrl}`);
          resolve({});
        }, Math.min(waitMs + 20000, 40000));

        const listener = (m) => {
          if (m.action === 'PROXY_SCAN_RESULT' && m.requestId === requestId) {
            clearTimeout(timeoutHandle);
            chrome.runtime.onMessage.removeListener(listener);
            resolve(m.result || {});
          }
        };
        chrome.runtime.onMessage.addListener(listener);
        chrome.runtime.sendMessage({ action: 'PROXY_SCAN', url: targetUrl, waitMs, requestId });
      } else {
        standardScan(targetUrl, waitMs).then(resolve);
      }
    });
  });
}

async function standardScan(targetUrl, waitMs) {
  let tab = null;
  try {
    tab = await chrome.tabs.create({ url: targetUrl, active: false });
    await new Promise(r => setTimeout(r, Math.max(waitMs, 3000)));

    // Extra wait if page not fully loaded
    try {
      const isReady = await new Promise(res => {
        chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => document.readyState }, (r) => res(r?.[0]?.result));
      });
      if (isReady !== 'complete') await new Promise(r => setTimeout(r, 2000));
    } catch (_) {}

    const result = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractionScript
    });
    return result?.[0]?.result || {};
  } catch (e) {
    console.error('[STAGE2] Standard scan error:', e);
    return {};
  } finally {
    if (tab) chrome.tabs.remove(tab.id).catch(() => {});
  }
}

// Extraction logic (Shared by background and sidepanel)
function extractionScript() {
  const text = document.body ? document.body.innerText : '';
  const html = document.body ? document.body.innerHTML : '';

  // 1. Email extraction
  const emails = new Set();
  const emailRegex = /([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/gi;
  
  (text.match(emailRegex) || []).forEach(e => {
    const email = e.toLowerCase();
    if (!email.match(/\.(png|jpg|jpeg|gif|svg|webp|css|js)$/)) emails.add(email);
  });
  
  (html.match(emailRegex) || []).forEach(e => {
    const email = e.toLowerCase();
    if (!email.match(/\.(png|jpg|jpeg|gif|svg|webp|css|js)$/)) emails.add(email);
  });

  document.querySelectorAll('a[href^="mailto:" i]').forEach(a => {
    try {
      const email = decodeURIComponent(a.href.replace(/^mailto:/i, '').split('?')[0].trim()).toLowerCase();
      if (email.includes('@')) emails.add(email);
    } catch(e){}
  });

  const obfuscatedRegex = /[a-zA-Z0-9._%+\-]+(?:\s*\[\s*at\s*\]\s*|\s*\(\s*at\s*\)\s*|\s*@\s*| {1,3}at {1,3})[a-zA-Z0-9.\-]+\s*(?:\[\s*dot\s*\]|\(\s*dot\s*\)|\.| {1,3}dot {1,3})\s*[a-zA-Z]{2,}/gi;
  (text.match(obfuscatedRegex) || []).forEach(e => {
    const clean = e.replace(/\[\s*at\s*\]|\(\s*at\s*\)| at /gi, '@').replace(/\[\s*dot\s*\]|\(\s*dot\s*\)| dot /gi, '.').replace(/\s+/g, '');
    if (clean.includes('@') && clean.includes('.')) emails.add(clean.toLowerCase());
  });

  const filteredEmails = [...emails].filter(e => 
    !e.includes('example') && !e.includes('domain') && !e.includes('yourname') && !e.includes('email@') && e.length < 80 && e.length > 5
  );

  // 2. Phone extraction
  const phoneRegex = /(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g;
  const phones = text.match(phoneRegex) || [];

  // 3. Contact page detection
  const CONTACT_SEGMENTS = ['contact', 'contact-us', 'contactus', 'about', 'about-us', 'aboutus', 'get-in-touch', 'connect', 'reach-us', 'kontakt', 'impressum', 'company', '연락처', '문의', '고객센터', '오시는길', 'support', 'help', 'team', 'legal', 'privacy', 'terms', 'info', 'service', 'location', 'find-us', 'directorio', 'contacto', 'nous-joindre', 'coordonnees', 'staff', 'meet-us', 'our-story'];
  const CONTACT_BLOCKLIST = ['contact-lens', 'contacts-app', 'contactless', 'contact-form7', 'contact-allergy', 'login', 'signup', 'cart', 'checkout'];
  const contactLinks = new Set();
  document.querySelectorAll('a[href]').forEach(a => {
    try {
      const href = (a.href || '').toLowerCase();
      const aText = (a.innerText || '').trim().toLowerCase();
      const aTitle = (a.title || '').toLowerCase();
      const aAria = (a.getAttribute('aria-label') || '').toLowerCase();
      if (!href.startsWith('http') || CONTACT_BLOCKLIST.some(bl => href.includes(bl))) return;
      const urlObj = new URL(href);
      const pathSegments = urlObj.pathname.split('/').filter(Boolean);
      if (pathSegments.some(seg => CONTACT_SEGMENTS.includes(seg)) || CONTACT_SEGMENTS.some(kw => aText.includes(kw) || aTitle.includes(kw) || aAria.includes(kw)) || a.querySelector('img[src*="contact" i], img[alt*="contact" i], svg[class*="contact" i]')) {
        contactLinks.add(a.href);
      }
    } catch (_) {}
  });

  // 4. Social media
  const SOCIAL_PLATFORMS = ['facebook.com', 'instagram.com', 'twitter.com', 'x.com', 'linkedin.com', 'youtube.com', 'tiktok.com', 'pinterest.com', 'yelp.com', 'linktr.ee', 'wa.me', 't.me', 'discord.gg', 'snapchat.com'];
  const SOCIAL_BLOCKLIST = ['/embed/', '/share', '/intent', '/shout', 'shoutout.wix', '/like', '/pixel', '/tr?', '/login', '/signup', 'google.com/search'];
  const socialLinks = new Set();
  document.querySelectorAll('a[href]').forEach(a => {
    try {
      const href = a.href;
      if (!SOCIAL_PLATFORMS.some(p => href.toLowerCase().includes(p))) return;
      if (SOCIAL_BLOCKLIST.some(bl => href.toLowerCase().includes(bl))) return;
      
      const urlObj = new URL(href);
      if (urlObj.hostname.includes('youtube.com') && urlObj.pathname === '/watch') {
        socialLinks.add(href);
      } else {
        socialLinks.add(urlObj.origin + urlObj.pathname);
      }
    } catch(e) {}
  });

  // 5. Address extraction
  const koAddressRegex = /([가-힣]+(?:특별시|광역시|특별자치시|도|특별자치도)\s*[가-힣]+(?:시|군|구)\s*[가-힣0-9\-\s]+(?:로|길|대로|가)\s*\d+[가-힣0-9\-\s,]*)/;
  const caAddressRegex = /\d{1,5}[,\s]+[A-Za-zÀ-ÿ0-9\s.'-]+(?:Avenue|Ave|Street|St|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Way|Court|Ct|Plaza|Square|Suite|Ste|Unit|Rue|Boul|Route|Chemin|Montée|Rang)[.,\s]+[A-Za-zÀ-ÿ\s]+[.,\s]+(?:[A-Z]{2}[,\s]+)?(?:[A-Z]\d[A-Z]\s*\d[A-Z]\d|\d{5}(?:-\d{4})?)/i;
  let detectedAddress = null;
  const koMatch = text.match(koAddressRegex);
  if (koMatch) detectedAddress = koMatch[0];
  else {
    const caMatch = text.match(caAddressRegex);
    if (caMatch) detectedAddress = caMatch[0];
  }

  // 6. Homepage extraction
  let homepage = null;
  if (window.location.hostname.includes('bing.com') || window.location.hostname.includes('google.com')) {
    const resultLinks = document.querySelectorAll('h2 a, .b_algo h2 a, #search .g a');
    for (const a of resultLinks) {
      const href = a.href;
      if (!href || href.includes('bing.com') || href.includes('google.com') || href.includes('microsoft.com') || href.includes('facebook.com') || href.includes('yelp.com')) continue;
      homepage = href;
      break;
    }
  }

  return {
    emails: filteredEmails.join(', '),
    phone: phones[0] || null,
    socials: [...socialLinks].slice(0, 10),
    contactLinks: [...contactLinks].slice(0, 10),
    address: detectedAddress,
    homepage: homepage,
    pageText: text.substring(0, 3000)
  };
}

// ─── STAGE 2: Contact-First 순차 탐색 오케스트레이터 ─────────────────────────
async function startDeepSearch(hl) {
  if (isFindingEmails) return;
  isFindingEmails = true;
  isCancelled = false;

  const leadsToProcess = scrapedData.filter(b =>
    b.status === 'captured' ||
    b.email === 'Pending Stage 2' ||
    b.email === 'Not Found' ||
    !b.email || b.email === 'N/A'
  );

  if (leadsToProcess.length === 0) {
    sendLog('처리할 리드가 없습니다.');
    isFindingEmails = false;
    chrome.runtime.sendMessage({ action: 'emailCheckStatus', finished: true }).catch(() => {});
    return;
  }

  sendLog(`Stage 2 시작: ${leadsToProcess.length}개 웹사이트 순차 처리...`);
  chrome.runtime.sendMessage({ action: 'emailCheckStatus', total: leadsToProcess.length, current: 0 }).catch(() => {});

  let processedCount = 0;

  for (const lead of leadsToProcess) {
    if (isCancelled || !isFindingEmails) break;
    processedCount++;

    try {
      sendLog(`\n[${processedCount}/${leadsToProcess.length}] ▶ 처리 중: "${lead.name}"`);

      // ══ STEP 1: 웹사이트가 없으면 Bing 검색으로 찾기 ══
      if (!lead.website || lead.website === 'N/A') {
        sendLog(`  → [STEP 1] 웹사이트 탐색 중 (Bing 검색)...`);
        chrome.runtime.sendMessage({
          action: 'emailCheckStatus',
          total: leadsToProcess.length, current: processedCount,
          statusText: `[${processedCount}/${leadsToProcess.length}] 웹사이트 탐색 중... "${lead.name}"`
        }).catch(() => {});

        const searchKw = hl === 'ko'
          ? `${lead.name} 공식 홈페이지 이메일 주소`
          : `${lead.name} official website contact email`;
        const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(searchKw)}`;
        const searchResult = await scanPageInBrowser(searchUrl, 4000);

        if (searchResult.homepage) {
          lead.website = searchResult.homepage;
          sendLog(`  → 웹사이트 발견: ${lead.website}`);
        }
        if (searchResult.emails && (!lead.email || lead.email === 'Pending Stage 2')) lead.email = searchResult.emails;
        if (searchResult.phone && (!lead.phone || lead.phone === 'N/A')) lead.phone = searchResult.phone;
        if (searchResult.address && (!lead.address || lead.address === 'N/A')) lead.address = searchResult.address;
      }

      // 데이터 누적용 Set
      const allEmails = new Set();
      const allSocials = new Set();

      const addEmails = (emailStr) => {
        if (!emailStr || ['N/A', 'Pending Stage 2', 'Not Found'].includes(emailStr)) return;
        emailStr.split(',').forEach(e => { const c = e.trim(); if (c && c.includes('@')) allEmails.add(c); });
      };
      const addSocials = (src) => {
        if (!src) return;
        if (Array.isArray(src)) src.forEach(s => { const c = s.trim(); if (c) allSocials.add(c); });
        else if (typeof src === 'string' && src !== 'N/A') src.split(',').forEach(s => { const c = s.trim(); if (c) allSocials.add(c); });
      };

      // 기존 유효 데이터 보존
      addEmails(lead.email);
      addSocials(lead.social);

      // ══ STEP 2: 홈페이지 로드 → 콘텍트 페이지 링크 탐색 ══
      let contactLinksToVisit = [];

      if (lead.website && lead.website !== 'N/A') {
        sendLog(`  → [STEP 2] 홈페이지 로드: ${lead.website}`);
        chrome.runtime.sendMessage({
          action: 'emailCheckStatus',
          total: leadsToProcess.length, current: processedCount,
          statusText: `[${processedCount}/${leadsToProcess.length}] 홈페이지 스캔 중... "${lead.name}"`
        }).catch(() => {});

        const homepageData = await scanPageInBrowser(lead.website, 5000);

        // 홈페이지에서 바로 발견된 데이터 수집
        addEmails(homepageData.emails);
        addSocials(homepageData.socials);
        if (homepageData.phone && (!lead.phone || lead.phone === 'N/A')) lead.phone = homepageData.phone;
        if (homepageData.address && (!lead.address || lead.address === 'N/A')) lead.address = homepageData.address;

        // 홈페이지에서 찾은 콘텍트 링크
        const foundLinks = (homepageData.contactLinks || []).slice(0, 5);
        sendLog(`  → 홈페이지 결과: 이메일(${allEmails.size}개), 콘텍트링크(${foundLinks.length}개), 소셜(${allSocials.size}개)`);

        if (foundLinks.length > 0) {
          contactLinksToVisit = foundLinks;
        } else {
          // ★ 홈페이지에서 못 찾으면 공통 콘텍트 URL 패턴으로 후보 생성
          const base = lead.website.replace(/\/+$/, '').split('?')[0];
          const candidates = ['/contact', '/contact-us', '/contactus', '/about', '/about-us', '/get-in-touch', '/info'];
          contactLinksToVisit = candidates.map(p => base + p);
          sendLog(`  → 콘텍트 링크 미발견 → 공통 URL 패턴 ${contactLinksToVisit.length}개 시도`);
        }
      }

      // ══ STEP 3: 콘텍트 페이지 순차 방문 → 이메일/주소/소셜 수집 → 다음 웹사이트 ══
      if (contactLinksToVisit.length > 0) {
        sendLog(`  → [STEP 3] 콘텍트 페이지 ${contactLinksToVisit.length}개 순차 방문 시작`);
      }

      for (let i = 0; i < contactLinksToVisit.length; i++) {
        if (isCancelled) break;

        // 이미 이메일 발견 시 2개 이상이면 추가 방문 생략
        if (allEmails.size >= 1 && i >= 2) {
          sendLog(`  → 이메일 수집 완료. 나머지 콘텍트 페이지 스킵.`);
          break;
        }

        const contactUrl = contactLinksToVisit[i];
        sendLog(`  → [STEP 3-${i + 1}/${contactLinksToVisit.length}] 콘텍트 페이지 방문: ${contactUrl}`);
        chrome.runtime.sendMessage({
          action: 'emailCheckStatus',
          total: leadsToProcess.length, current: processedCount,
          statusText: `[${processedCount}/${leadsToProcess.length}] 콘텍트 페이지 스캔 (${i + 1}/${contactLinksToVisit.length})... "${lead.name}"`
        }).catch(() => {});

        const contactData = await scanPageInBrowser(contactUrl, 5000);

        if (contactData) {
          const prevEmailCount = allEmails.size;
          addEmails(contactData.emails);
          addSocials(contactData.socials);
          if (contactData.phone && (!lead.phone || lead.phone === 'N/A')) lead.phone = contactData.phone;
          if (contactData.address && (!lead.address || lead.address === 'N/A')) lead.address = contactData.address;

          if (allEmails.size > prevEmailCount) {
            sendLog(`  → ✅ 콘텍트 페이지에서 이메일 발견! 총 ${allEmails.size}개`);
          } else {
            sendLog(`  → 콘텍트 페이지에서 이메일 없음 (소셜: ${allSocials.size}개)`);
          }
        }

        // 콘텍트 페이지 방문 간 1초 대기
        if (i < contactLinksToVisit.length - 1) {
          await new Promise(r => setTimeout(r, 1000));
        }
      }

      // ══ 최종 결과 저장 ══
      if (allEmails.size > 0) {
        lead.email = Array.from(allEmails).join(', ');
      } else if (!lead.email || lead.email === 'Pending Stage 2') {
        lead.email = 'Not Found';
      }

      if (allSocials.size > 0) lead.social = Array.from(allSocials).join(', ');
      lead.status = 'complete';

      sendLog(`  → [완료] "${lead.name}" | 이메일: ${lead.email} | 소셜: ${allSocials.size}개`);
      updateStorage();

      chrome.runtime.sendMessage({
        action: 'emailCheckStatus',
        total: leadsToProcess.length,
        current: processedCount
      }).catch(() => {});

    } catch (err) {
      sendLog(`오류 발생 "${lead.name}": ${err.message}`);
    }

    // ★ 다음 웹사이트로 넘어가기 전 1.5초 대기
    await new Promise(r => setTimeout(r, 1500));
  }

  isFindingEmails = false;
  sendLog('\n✅ Stage 2 Discovery 완료!');

  // ★ 완료 신호 전 최종 데이터를 사이드패널에 명시적으로 전송 (캐시 보장)
  // emailCheckStatus finished보다 먼저 전송하여 캐시가 준비된 후 완료 UI가 업데이트되게 함
  chrome.runtime.sendMessage({ action: 'dataUpdated', data: scrapedData }).catch(() => {});
  updateStorage();

  // 짧은 딜레이 후 완료 신호 (dataUpdated가 먼저 처리되도록)
  setTimeout(() => {
    chrome.runtime.sendMessage({ action: 'emailCheckStatus', finished: true }).catch(() => {});
  }, 300);
}

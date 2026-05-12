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

function handleNewLead(lead) {
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
  const keys = await chrome.storage.local.get(['witKey', 'solverKey', 'captchaMethod']);
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
      console.log(`[STAGE2] scanPageInBrowser: isXpider=${isXpider}`);

      if (isXpider) {
        const requestId = Date.now().toString() + Math.random().toString(36).substring(7);
        const listener = (m) => {
          if (m.action === 'PROXY_SCAN_RESULT' && m.requestId === requestId) {
            console.log(`[STAGE2] PROXY_SCAN_RESULT received for ${targetUrl}`);
            chrome.runtime.onMessage.removeListener(listener);
            resolve(m.result || {});
          }
        };
        chrome.runtime.onMessage.addListener(listener);
        console.log(`[STAGE2] Sending PROXY_SCAN to sidepanel for ${targetUrl}`);
        chrome.runtime.sendMessage({ action: 'PROXY_SCAN', url: targetUrl, waitMs, requestId });
        
        setTimeout(() => {
          chrome.runtime.onMessage.removeListener(listener);
          console.warn(`[STAGE2] PROXY_SCAN timeout for ${targetUrl}`);
          resolve({});
        }, 35000);
      } else {
        // Standard mode: Use chrome.tabs.create
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

// ─── STAGE 2: Contact-First 5단계 오케스트레이터 ──────────────────────────────
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
    sendLog('No leads to process.');
    isFindingEmails = false;
    chrome.runtime.sendMessage({ action: 'emailCheckStatus', finished: true }).catch(() => {});
    return;
  }

  sendLog(`Starting Deep Search Pipeline for ${leadsToProcess.length} leads...`);
  chrome.runtime.sendMessage({ action: 'emailCheckStatus', total: leadsToProcess.length, current: 0 }).catch(() => {});

  let processedCount = 0;
  for (const lead of leadsToProcess) {
    if (isCancelled || !isFindingEmails) break;
    processedCount++;

    try {
      sendLog(`[${processedCount}/${leadsToProcess.length}] Processing: "${lead.name}"`);

      // STEP 1: Website Search
      if (!lead.website || lead.website === 'N/A') {
        sendLog(`  -> Finding website for "${lead.name}" via Bing Search...`);
        chrome.runtime.sendMessage({
          action: 'emailCheckStatus',
          total: leadsToProcess.length, current: processedCount,
          statusText: `Finding website... (${lead.name})`
        }).catch(() => {});

        const searchContext = hl === 'ko' ? ' 전화번호 주소 홈페이지' : ' phone address official website';
        const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(lead.name + searchContext)}`;
        const enrichment = await scanPageInBrowser(searchUrl, 4000);

        if (enrichment.homepage) lead.website = enrichment.homepage;
        if (enrichment.emails && (!lead.email || lead.email === 'Pending Stage 2')) lead.email = enrichment.emails;
        if (enrichment.phone && (!lead.phone || lead.phone === 'N/A')) lead.phone = enrichment.phone;
        if (enrichment.address && (!lead.address || lead.address === 'N/A')) lead.address = enrichment.address;
      }

      // STEP 2: Homepage Load
      if (lead.website && lead.website !== 'N/A') {
        sendLog(`  -> [STEP 2] Loading homepage: ${lead.website}`);
        chrome.runtime.sendMessage({
          action: 'emailCheckStatus',
          total: leadsToProcess.length, current: processedCount,
          statusText: `Scanning homepage... (${lead.name})`
        }).catch(() => {});

        const homepageData = await scanPageInBrowser(lead.website, 5000);
        sendLog(`  -> Homepage: Emails(${homepageData.emails ? 1 : 0}), ContactLinks(${(homepageData.contactLinks || []).length}), Socials(${(homepageData.socials || []).length})`);

        let allEmails = new Set();
        let allSocials = new Set();

        const addEmails = (emailStr) => {
          if (emailStr && emailStr !== 'N/A' && emailStr !== 'Pending Stage 2' && emailStr !== 'Not Found') {
            emailStr.split(',').forEach(e => {
              const cleaned = e.trim();
              if (cleaned) allEmails.add(cleaned);
            });
          }
        };

        const addSocials = (socialArr) => {
          if (Array.isArray(socialArr)) {
            socialArr.forEach(s => {
              const cleaned = s.trim();
              if (cleaned) allSocials.add(cleaned);
            });
          } else if (typeof socialArr === 'string' && socialArr && socialArr !== 'N/A') {
            socialArr.split(',').forEach(s => {
              const cleaned = s.trim();
              if (cleaned) allSocials.add(cleaned);
            });
          }
        };

        // Add existing lead data if it's valid
        addEmails(lead.email);
        addSocials(lead.social);

        // Add homepage data
        addEmails(homepageData.emails);
        addSocials(homepageData.socials);
        
        if (homepageData.phone && (!lead.phone || lead.phone === 'N/A')) lead.phone = homepageData.phone;
        if (homepageData.address && (!lead.address || lead.address === 'N/A')) lead.address = homepageData.address;

        // STEP 3: Contact Pages (Enhanced sequential visit & data aggregation)
        const contactLinks = (homepageData.contactLinks || []).slice(0, 5); // Visit up to 5 contact pages
        
        if (contactLinks.length > 0) {
          sendLog(`  -> Found ${contactLinks.length} contact pages. Visiting them sequentially to maximize data extraction...`);
        }

        for (let i = 0; i < contactLinks.length; i++) {
          const contactUrl = contactLinks[i];
          if (isCancelled) break;
          
          sendLog(`  -> [STEP 3] (${i+1}/${contactLinks.length}) Scanning contact page: ${contactUrl}`);
          chrome.runtime.sendMessage({
            action: 'emailCheckStatus',
            total: leadsToProcess.length, current: processedCount,
            statusText: `Scanning contact page ${i+1}/${contactLinks.length}... (${lead.name})`
          }).catch(() => {});

          const contactData = await scanPageInBrowser(contactUrl, 4000);

          addEmails(contactData.emails);
          addSocials(contactData.socials);
          
          if (contactData.phone && (!lead.phone || lead.phone === 'N/A')) lead.phone = contactData.phone;
          if (contactData.address && (!lead.address || lead.address === 'N/A')) lead.address = contactData.address;
          
          // Note: No early break. We visit all contact pages to gather every possible email and social link.
        }

        // Apply aggregated, unique results back to lead
        if (allEmails.size > 0) {
          lead.email = Array.from(allEmails).join(', ');
        }
        
        if (allSocials.size > 0) {
          lead.social = Array.from(allSocials).join(', ');
        }
      }

      if (!lead.email || lead.email === 'Pending Stage 2') {
        lead.email = 'Not Found';
      }
      lead.status = 'complete';

      sendLog(`  -> [DONE] ${lead.name}`);
      updateStorage();
      chrome.runtime.sendMessage({
        action: 'emailCheckStatus',
        total: leadsToProcess.length,
        current: processedCount
      }).catch(() => {});

    } catch (err) {
      sendLog(`Pipeline Error for "${lead.name}": ${err.message}`);
    }

    await new Promise(r => setTimeout(r, 1500));
  }

  isFindingEmails = false;
  sendLog('Discovery Engine Finished.');
  chrome.runtime.sendMessage({ action: 'emailCheckStatus', finished: true }).catch(() => {});
}

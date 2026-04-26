// background.js - Bing Maps Business Finder: Stage 2 (On-Demand Email Finder)
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
  if (request.action === 'foundBusiness') {
    handleNewLead(request.data);
  }

  if (request.action === 'startScraping') {
    chrome.storage.local.set({ scrapingActive: true });
  }

  if (request.action === 'stopScraping') {
    chrome.storage.local.set({ scrapingActive: false });
  }

  if (request.action === 'startEmailCheck') {
    chrome.storage.local.get(['language'], (res) => {
      const hl = res.language || 'en';
      startDeepSearch(hl);
    });
  }

  if (request.action === 'clearData') {
      scrapedData = [];
      isFindingEmails = false;
      isCancelled = true;
      sendLog("🧹 Data memory cleared.");
  }
});

function handleNewLead(lead) {
  // Deduplicate
  const exists = scrapedData.find(b => b.placeId === lead.placeId || (b.name === lead.name && b.url === lead.url));
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
  chrome.runtime.sendMessage({ action: 'dataUpdated', data: scrapedData });
}

async function sendLog(msg) {
  console.log(`[Background] ${msg}`);
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

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'START_NATIVE_STT') {
    createOffscreen().then(() => {
      chrome.runtime.sendMessage({ ...request, action: 'START_NATIVE_STT' });
    });
    return true; 
  }
});

async function scanPageInBrowser(targetUrl, waitMs = 5000) {
    // Check if we are in XPIDER environment (set by sidepanel)
    const settings = await chrome.storage.local.get(['isXpider']);
    if (settings.isXpider) {
        return new Promise((resolve) => {
            const requestId = Date.now().toString() + Math.random().toString(36).substring(7);
            const listener = (m) => {
                if (m.action === 'PROXY_SCAN_RESULT' && m.requestId === requestId) {
                    chrome.runtime.onMessage.removeListener(listener);
                    resolve(m.result || {});
                }
            };
            chrome.runtime.onMessage.addListener(listener);
            chrome.runtime.sendMessage({ action: 'PROXY_SCAN', url: targetUrl, waitMs, requestId });
            
            // Timeout safety for the proxy
            setTimeout(() => {
                chrome.runtime.onMessage.removeListener(listener);
                resolve({});
            }, 30000);
        });
    }

    let tab = null;
    try {
        tab = await chrome.tabs.create({ url: targetUrl, active: false });
        await new Promise(r => setTimeout(r, waitMs));

        const result = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                const text = document.body ? document.body.innerText : '';
                const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
                const emails = text.match(emailRegex) || [];
                const phoneRegex = /(\+?\d{1,4}?[-.\s]?\(?\d{1,3}?\)?[-.\s]?\d{1,4}[-.\s]?\d{1,4})/g;
                const phones = text.match(phoneRegex) || [];
                
                const socialRegex = /(?:facebook|instagram|twitter|x|linkedin|youtube|tiktok)\.com\/([a-zA-Z0-9._%+-]+)/gi;
                const socials = text.match(socialRegex) || [];
                const socialLinks = [];
                document.querySelectorAll('a').forEach(a => {
                    const href = a.href || '';
                    if (href.match(/(facebook|instagram|twitter|linkedin|youtube|tiktok|x\.com)/i)) {
                        socialLinks.push(href);
                    }
                });

                // Extract Website from Search Result (Heuristic for "Official Site")
                let homepage = null;
                const cite = document.querySelector('cite');
                if (cite) {
                    const parts = cite.innerText.split(' ');
                    if (parts[0].includes('http')) homepage = parts[0];
                }

                // Contact/About Links
                const contactKeywords = ['contact', 'about', '연락처', '오시는길', '고객센터', '문의', 'team', 'company', 'get-in-touch', 'impressum', 'kontakt'];
                let contactLinks = [];
                document.querySelectorAll('a').forEach(a => {
                    const href = (a.href || '').toLowerCase();
                    const text = (a.innerText || '').toLowerCase();
                    if (href.startsWith('http') && contactKeywords.some(kw => href.includes(kw) || text.includes(kw))) {
                        contactLinks.push(a.href);
                    }
                });

                return {
                    emails: [...new Set(emails)].join(', '),
                    phone: phones[0] || null,
                    socials: [...new Set([...socials.map(s => 'https://' + s), ...socialLinks])].join(', '),
                    website: homepage,
                    contactLinks: [...new Set(contactLinks)].slice(0, 4),
                    pageText: text.substring(0, 3000)
                };
            }
        });

        return result[0].result;
    } catch (e) {
        console.error("Scan failed:", e);
        return {};
    } finally {
        if (tab) chrome.tabs.remove(tab.id).catch(() => {});
    }
}

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

    sendLog(`📋 Starting Deep Search Pipeline for ${leadsToProcess.length} leads...`);
    chrome.runtime.sendMessage({ action: 'emailCheckStatus', total: leadsToProcess.length, current: 0 });

    let processedCount = 0;
    for (const lead of leadsToProcess) {
        if (isCancelled || !isFindingEmails) break;
        processedCount++;

        try {
            sendLog(`🔎 [${processedCount}/${leadsToProcess.length}] Processing: "${lead.name}"`);
            
            // Stage 2: Enrichment via Bing Search
            if (!lead.website || lead.website === 'N/A') {
                sendLog(`🔎 Stage 2: Finding website for "${lead.name}" via Bing Search...`);
                chrome.runtime.sendMessage({ 
                    action: 'emailCheckStatus', 
                    total: leadsToProcess.length, 
                    current: processedCount,
                    statusText: `Finding website... (${lead.name})`
                });

                const searchContext = hl === 'ko' ? ' 전화번호 주소 홈페이지' : ' phone address official website';
                const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(lead.name + searchContext)}`;
                
                const enrichment = await scanPageInBrowser(searchUrl, 4000);
                
                if (enrichment.website) lead.website = enrichment.website;
                if (enrichment.phone && (!lead.phone || lead.phone === 'N/A')) lead.phone = enrichment.phone;
                if (enrichment.socials) lead.socials = enrichment.socials;
                if (enrichment.emails) lead.email = enrichment.emails;
            }

            // Stage 3: Deep Website Scan if website exists
            if (lead.website && lead.website !== 'N/A') {
                sendLog(`🌐 Stage 3: Deep scanning ${lead.website}`);
                chrome.runtime.sendMessage({ 
                    action: 'emailCheckStatus', 
                    total: leadsToProcess.length, 
                    current: processedCount,
                    statusText: `Scraping details... (${lead.name})`
                });

                const webScan = await scrapeBusinessWebsite(lead.website);
                if (webScan) {
                    if (webScan.emails) lead.email = webScan.emails;
                    if (webScan.socials) lead.socials = webScan.socials;
                    if (webScan.phone && (!lead.phone || lead.phone === 'N/A')) lead.phone = webScan.phone;
                }
            }

            if (!lead.email || lead.email === 'Pending Stage 2') {
                lead.email = 'Not Found';
            }
            
            lead.status = 'complete';
            updateStorage();
            chrome.runtime.sendMessage({ action: 'emailCheckStatus', total: leadsToProcess.length, current: processedCount });

        } catch (err) {
            sendLog(`⚠️ Pipeline Error: ${err.message}`);
        }
        
        await new Promise(r => setTimeout(r, 2000));
    }

    isFindingEmails = false;
    sendLog(`🏁 Search Pipeline Finished.`);
    chrome.runtime.sendMessage({ action: 'emailCheckStatus', finished: true });
}

async function scrapeBusinessWebsite(url) {
    if (!url || url === 'N/A') return null;
    try {
        const result = await scanPageInBrowser(url, 5000);
        return result;
    } catch (e) {
        return null;
    }
}


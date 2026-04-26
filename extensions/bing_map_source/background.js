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

  if (request.action === 'stopEmailCheck') {
    isFindingEmails = false;
    isCancelled = true;
  }

  // Captcha & Solver Actions
  if (request.action === 'PERFORM_TRANSCRIPTION') {
      handleTranscription(request.audioData, request.url, sendResponse);
      return true; // async
  }
  if (request.action === 'CAPTCHA_LOG') {
      sendLog(request.message);
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
                
                // Social Media Links
                const socialRegex = /(?:https?:\/\/)?(?:www\.)?(?:facebook|instagram|linkedin|twitter|x|youtube|tiktok)\.com\/[a-zA-Z0-9._\-\/]+/g;
                const socials = Array.from(document.querySelectorAll('a'))
                    .map(a => a.href)
                    .filter(href => href.match(socialRegex));

                // Extract Website from Search Result (Heuristic for "Official Site")
                const webLinks = Array.from(document.querySelectorAll('a'))
                    .map(a => a.href)
                    .filter(href => href && !href.includes('bing.com') && !href.includes('microsoft.com') && !href.includes('google.com') && href.startsWith('http'));

                // Contact/About Links (Improved Heuristic with Domain Validation)
                const currentDomain = window.location.hostname.replace('www.', '');
                const contactLinks = Array.from(document.querySelectorAll('a'))
                    .map(a => a.href)
                    .filter(href => {
                        try {
                            const h = href.toLowerCase();
                            const urlObj = new URL(href);
                            const isSameDomain = urlObj.hostname.includes(currentDomain);
                            if (!isSameDomain) return false;

                            const isExternalSocial = h.includes('facebook.com') || h.includes('twitter.com') || h.includes('instagram.com') || h.includes('linkedin.com') || h.includes('x.com') || h.includes('youtube.com');
                            if (isExternalSocial) return false;

                            const isLikelyContact = h.includes('contact') || h.includes('about') || h.includes('support') || h.includes('tel') || h.includes('mail') || h.includes('info') || h.includes('help') || h.includes('inquiry') || h.includes('location') || h.includes('policy') || h.includes('term');
                            return isLikelyContact && !h.endsWith('.pdf') && !h.endsWith('.jpg') && !h.endsWith('.png');
                        } catch(e) { return false; }
                    });

                return {
                    emails: [...new Set(emails)].join(', '),
                    phone: phones[0] || null,
                    socials: [...new Set(socials)].join(', '),
                    website: webLinks[0] || null,
                    contactLinks: [...new Set(contactLinks)].slice(0, 8), // Inspect up to 8 potential pages internally
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
    
    sendLog(`📋 Starting Dynamic Search Pipeline...`);

    while (isFindingEmails && !isCancelled) {
        // Find the next lead that needs processing
        const lead = scrapedData.find(b => b.status === 'captured' || b.email === 'Pending Stage 2');
        
        if (!lead) {
            // Check if we should keep waiting (if scraping/cruising is still active)
            const activeState = await chrome.storage.local.get(['scrapingActive']);
            if (!activeState.scrapingActive) {
                // No more items and scraping stopped
                break;
            }
            // Still scraping, wait for new leads to appear
            await new Promise(r => setTimeout(r, 3000));
            continue;
        }

        try {
            sendLog(`🔎 Processing Pipeline: "${lead.name}"`);
            
            // Temporary status to avoid re-selection
            lead.email = 'Exploring...';
            lead.status = 'processing';

            // Stage 2: Enrichment via Bing Search
            const searchContext = hl === 'ko' ? ' 전화번호 주소 홈페이지' : ' phone address official website';
            const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(lead.name + searchContext)}`;
            
            const enrichment = await scanPageInBrowser(searchUrl, 4000);
            
            if (enrichment.phone && (!lead.phone || lead.phone === 'N/A')) lead.phone = enrichment.phone;
            if (enrichment.website && (!lead.website || lead.website === 'N/A')) lead.website = enrichment.website;
            if (enrichment.socials && (!lead.socials || lead.socials === 'N/A')) lead.socials = enrichment.socials;

            // Stage 3: Deep Website Scan if website exists
            if (lead.website && lead.website !== 'N/A') {
                sendLog(`🌐 External Domain Scan: ${lead.website}`);
                const webScan = await scrapeBusinessWebsite(lead.website);
                if (webScan) {
                    if (webScan.emails) lead.email = webScan.emails;
                    if (webScan.socials) lead.socials = webScan.socials;
                    if (webScan.phone && (!lead.phone || lead.phone === 'N/A')) lead.phone = webScan.phone;
                }
            }

            if (!lead.email || lead.email === 'Exploring...') {
                lead.email = enrichment.emails || 'Not Found';
            }
            
            lead.status = 'complete';
            updateStorage();
            
            const total = scrapedData.length;
            const completed = scrapedData.filter(b => b.status === 'complete').length;
            chrome.runtime.sendMessage({ action: 'emailCheckStatus', total, current: completed });

        } catch (err) {
            sendLog(`⚠️ Pipeline Error: ${err.message}`);
            lead.status = 'error';
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
        sendLog(`🌐 [Main Scan] ${url}`);
        const mainResult = await scanPageInBrowser(url, 5000);
        if (!mainResult) return null;

        let combinedResult = { ...mainResult };
        
        // Parallel Sub-page Scanning (Advanced)
        if (mainResult.contactLinks && mainResult.contactLinks.length > 0) {
            const subPagesToScan = mainResult.contactLinks.filter(l => l !== url).slice(0, 3); // Take top 3 most relevant sub-pages
            
            sendLog(`🔗 Found ${subPagesToScan.length} sub-pages (Contact/About). Scanning in parallel...`);
            
            const subResults = await Promise.all(subPagesToScan.map(async (link) => {
                try {
                    const res = await scanPageInBrowser(link, 4000);
                    if (res) sendLog(`✅ Sub-page scan complete: ${link}`);
                    return res;
                } catch(e) { return null; }
            }));

            // Smart Data Integration
            subResults.forEach(secResult => {
                if (secResult) {
                    if (secResult.emails) {
                        const existing = combinedResult.emails ? combinedResult.emails.split(', ') : [];
                        const newEmails = secResult.emails.split(', ');
                        combinedResult.emails = [...new Set([...existing, ...newEmails])].join(', ');
                    }
                    if (secResult.socials) {
                        const existing = combinedResult.socials ? combinedResult.socials.split(', ') : [];
                        const newSocials = secResult.socials.split(', ');
                        combinedResult.socials = [...new Set([...existing, ...newSocials])].join(', ');
                    }
                    if (secResult.phone && (!combinedResult.phone || combinedResult.phone === 'N/A')) {
                        combinedResult.phone = secResult.phone;
                    }
                }
            });
        }
        
        const totalEmails = combinedResult.emails ? combinedResult.emails.split(', ').length : 0;
        const totalSocials = combinedResult.socials ? combinedResult.socials.split(', ').length : 0;
        sendLog(`🏁 Website Scan Detail: Found ${totalEmails} Emails, ${totalSocials} Socials.`);
        
        return combinedResult;
    } catch (e) {
        sendLog(`⚠️ Website Scan Error: ${e.message}`);
        return null;
    }
}

// background.js - GMaps Business Finder: Stage 2 (On-Demand Email Finder)
try {
  importScripts('business_filters.js', 'captcha_solver.js');
} catch (e) {
  console.error("Worker import failed:", e);
}

let scrapedData = [];
let isFindingEmails = false;
let isCancelled = false;
let isPaused = false;
let isHardBlocked = false;
let isPausedByCaptcha = false;
let isSolvingCaptcha = false;

// Initialize
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.storage.local.get(['scrapedData'], (result) => {
  if (result.scrapedData) scrapedData = result.scrapedData;
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[BACKGROUND.JS] Received message:', request.action, request);
  if (request.action === 'foundBusiness') {
    handleNewLead(request.data);
  }

  if (request.action === 'startEmailCheck') {
    chrome.storage.local.get(['language'], (res) => {
      const hl = res.language || 'en';
      startDeepSearch(hl);     // Deep Search for ALL environments now
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
  if (request.action === 'RESOLVE_HARD_BLOCK') {
      if (request.choice === 'wait') {
          // Logic for starting wait countdown
      }
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

// startEmailDiscovery and findEmailsFromWebsite have been removed in favor of startDeepSearch

function updateStorage() {
  chrome.storage.local.set({ scrapedData });
  console.log('[BACKGROUND.JS] Sending dataUpdated to UI with', scrapedData.length, 'items');
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

async function checkLockdown(tabId) {
    if (isSolvingCaptcha) return;
    
    // Simple check: is the tab redirected to /sorry/?
    try {
        const tab = await chrome.tabs.get(tabId);
        if (tab.url && tab.url.includes('/sorry/')) {
            sendLog("🚫 CAPTCHA Detected! Attempting to solve...");
            await solveCaptcha(tabId);
        }
    } catch (e) {}
}

async function solveCaptcha(tabId) {
    if (isSolvingCaptcha) return;
    isSolvingCaptcha = true;
    try {
        const keys = await chrome.storage.local.get(['captchaMethod', 'witKey', 'solverKey']);
        if (keys.captchaMethod === 'audio' && keys.witKey) {
            await CAPTCHA_SOLVER.solveAudioBypass(tabId);
        }
        // Wait bit for resolve
        await new Promise(r => setTimeout(r, 5000));
    } catch (e) {
        sendLog(`❌ Solver error: ${e.message}`);
    } finally {
        isSolvingCaptcha = false;
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

// Add these to the message listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'START_NATIVE_STT') {
    createOffscreen().then(() => {
      chrome.runtime.sendMessage({ ...request, action: 'START_NATIVE_STT' });
    });
    return true; 
  }
  if (request.action === 'NATIVE_STT_RESULT') {
    // This is handled by the caller waiting for storage or a global map
  }
  
  if (request.action === 'CHECK_OCEAN') {
    checkIfOcean(sender.tab.windowId).then(isOcean => {
        sendResponse({ isOcean: isOcean });
    });
    return true; // async
  }
});

async function checkIfOcean(windowId) {
    return new Promise(async (resolve) => {
        try {
            await createOffscreen();
            const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'jpeg', quality: 50 });
            
            const reqId = Date.now().toString();
            
            const listener = (m) => {
                if (m.action === 'SEA_RESULT' && m.requestId === reqId) {
                    chrome.runtime.onMessage.removeListener(listener);
                    resolve(m.isOcean);
                }
            };
            chrome.runtime.onMessage.addListener(listener);
            
            chrome.runtime.sendMessage({
                action: 'ANALYZE_SEA_SCREENSHOT',
                dataUrl: dataUrl,
                requestId: reqId
            });
            
            // Timeout safety
            setTimeout(() => {
                chrome.runtime.onMessage.removeListener(listener);
                resolve(false);
            }, 3000);
        } catch (e) {
            console.error("Ocean check failed", e);
            resolve(false);
        }
    });
}

async function scanPageInBrowser(targetUrl, waitMs = 5000) {
    let tab = null;
    try {
        tab = await chrome.tabs.create({ url: targetUrl, active: false });
        // Poll for target content or captcha
        let elapsed = 0;
        while (elapsed < 15000 && !isCancelled) {
            await checkLockdown(tab.id);
            await new Promise(r => setTimeout(r, 1000));
            elapsed += 1000;
            if (elapsed >= waitMs) break; 
        }

        const result = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                const text = document.body ? document.body.innerText : '';
                const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
                const emails = text.match(emailRegex) || [];
                const phoneRegex = /\d{2,4}-\d{3,4}-\d{4}/g;
                const phones = text.match(phoneRegex) || [];
                
                // Try to find official website link in search results if it was a search
                let homepage = null;
                const cite = document.querySelector('cite');
                if (cite) {
                    const parts = cite.innerText.split(' ');
                    if (parts[0].includes('http')) homepage = parts[0];
                }

                // Find potential contact page links
                const contactKeywords = ['contact', 'about', '연락처', '오시는길', '고객센터', '문의', 'team', 'company', 'get-in-touch', 'impressum', 'kontakt'];
                let contactLinks = [];
                document.querySelectorAll('a').forEach(a => {
                    const href = a.href || '';
                    const text = (a.innerText || '').toLowerCase();
                    if (href.startsWith('http') && contactKeywords.some(kw => href.toLowerCase().includes(kw) || text.includes(kw))) {
                        contactLinks.push(href);
                    }
                });

                // Social Media detection
                const socialRegex = /(?:facebook|instagram|twitter|x|linkedin|youtube|tiktok)\.com\/([a-zA-Z0-9._%+-]+)/gi;
                const socials = text.match(socialRegex) || [];
                const socialLinks = [];
                document.querySelectorAll('a').forEach(a => {
                    const href = a.href || '';
                    if (href.match(/(facebook|instagram|twitter|linkedin|youtube|tiktok|x\.com)/i)) {
                        socialLinks.push(href);
                    }
                });

                return {
                    emails: [...new Set(emails)].join(', '),
                    phone: phones[0] || null,
                    homepage: homepage,
                    socials: [...new Set([...socials.map(s => 'https://' + s), ...socialLinks])].slice(0, 5),
                    contactLinks: [...new Set(contactLinks)].slice(0, 2), // Keep up to 2 unique contact pages
                    pageText: text.substring(0, 2000)
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
    
    // Only process leads that haven't been through the Deep Search yet (captured)
    // or are explicitly pending discovery. Skip leads marked as 'complete'.
    const leadsToProcess = scrapedData.filter(b => b.status === 'captured' || b.email === 'Pending Stage 2');
    
    sendLog(`📋 Starting Deep Search for ${leadsToProcess.length} leads (Lang: ${hl})`);
    chrome.runtime.sendMessage({ action: 'emailCheckStatus', total: leadsToProcess.length, current: 0 });

    let processedCount = 0;
    for (const lead of leadsToProcess) {
        if (isCancelled || !isFindingEmails) break;
        processedCount++;

        try {
            sendLog(`🔎 [${processedCount}/${leadsToProcess.length}] Processing: "${lead.name}"`);
            
            let enrichment = { emails: '' };

            if (hl === 'en') {
                sendLog(`⚡ [EN Mode] Skipping Google Search. Using direct URL for "${lead.name}"`);
            } else {
                // Stage 2: Enrichment via Google (Finding Official Website)
                sendLog(`🔎 [${processedCount}/${leadsToProcess.length}] Stage 2: Finding website for "${lead.name}"`);
                chrome.runtime.sendMessage({ 
                    action: 'emailCheckStatus', 
                    total: leadsToProcess.length, 
                    current: processedCount,
                    stage: 2,
                    statusText: hl === 'ko' ? `웹사이트 찾는 중... (${lead.name})` : `Finding website... (${lead.name})`
                });

                const searchContext = hl === 'ko' ? ' 전화번호 주소 홈페이지' : ' phone address official website';
                const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(lead.name + searchContext)}&hl=${hl}`;
                
                enrichment = await scanPageInBrowser(searchUrl, 4000);
                
                if (enrichment.homepage) lead.website = enrichment.homepage;
                if (enrichment.phone && (!lead.phone || lead.phone === 'N/A')) lead.phone = enrichment.phone;
                if (enrichment.address && (!lead.address || lead.address === 'N/A')) lead.address = enrichment.address;
                if (enrichment.socials && enrichment.socials.length > 0) {
                    lead.social = enrichment.socials.join(', ');
                }
            }

            // Stage 3: Deep Website Scan if website exists
            if (lead.website && lead.website !== 'N/A') {
                sendLog(`🌐 [${processedCount}/${leadsToProcess.length}] Stage 3: Deep scanning details on ${lead.website}`);
                chrome.runtime.sendMessage({ 
                    action: 'emailCheckStatus', 
                    total: leadsToProcess.length, 
                    current: processedCount,
                    stage: 3,
                    statusText: hl === 'ko' ? `상세정보 수집 중... (${lead.name})` : `Scraping details... (${lead.name})`
                });

                const webScan = await scrapeBusinessWebsite(lead.website);
                if (webScan) {
                    let finalEmails = webScan.emails ? webScan.emails.split(', ') : [];
                    let finalPhone = webScan.phone;
                    
                    // Stage 3.5: Contact Page Autopilot
                    // If no email/phone on homepage, but contact links exist, visit them!
                    if ((!finalEmails.length || !finalPhone) && webScan.contactLinks && webScan.contactLinks.length > 0) {
                        for (const contactUrl of webScan.contactLinks) {
                            sendLog(`🌐 Navigating to contact page: ${contactUrl}`);
                            const subScan = await scrapeBusinessWebsite(contactUrl);
                            if (subScan) {
                                if (subScan.emails) finalEmails.push(...subScan.emails.split(', '));
                                if (!finalPhone && subScan.phone) finalPhone = subScan.phone;
                                if (subScan.socials && subScan.socials.length > 0) {
                                    const existingSocials = lead.social ? lead.social.split(', ') : [];
                                    const combinedSocials = [...new Set([...existingSocials, ...subScan.socials])];
                                    lead.social = combinedSocials.join(', ');
                                }
                            }
                            if (finalEmails.length > 0 && finalPhone) break; // found what we need, stop crawling
                        }
                    }

                    const uniqueEmails = [...new Set(finalEmails)].filter(e => e).join(', ');
                    if (uniqueEmails) {
                        lead.email = uniqueEmails;
                        sendLog(`✅ Found emails: ${uniqueEmails}`);
                    }
                    if (finalPhone && (!lead.phone || lead.phone === 'N/A')) {
                        lead.phone = finalPhone;
                    }
                    if (webScan.socials && webScan.socials.length > 0) {
                        const existingSocials = lead.social ? lead.social.split(', ') : [];
                        const combinedSocials = [...new Set([...existingSocials, ...webScan.socials])];
                        lead.social = combinedSocials.join(', ');
                    }
                }
            }

            if (!lead.email || lead.email === 'Pending Stage 2') {
                lead.email = enrichment.emails || 'Not Found';
            }
            
            lead.status = 'complete';
            updateStorage();
            chrome.runtime.sendMessage({ action: 'emailCheckStatus', total: leadsToProcess.length, current: processedCount });

        } catch (err) {
            sendLog(`⚠️ Error during deep search for "${lead.name}": ${err.message}`);
        }
        
        await new Promise(r => setTimeout(r, 2000));
    }

    isFindingEmails = false;
    sendLog(`🏁 Deep Search Complete.`);
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

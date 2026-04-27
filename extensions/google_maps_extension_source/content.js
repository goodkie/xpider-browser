// content.js - GMaps Business Finder: Bulletproof Stage 1 Scraper with Precision AutoCruiser

console.log('[CONTENT.JS] Script loaded and initialized!');

class GMapsBulletproofScraper {
  constructor() {
    this.active = false;
    this.processedUrls = new Set();
    this.rootObserver = null;
    this.feedObserver = null;
    this.scrollInterval = null;
    this.autopilotInterval = null;
    this.lastCount = 0;
  }

  start() {
    if (this.active) {
        console.log('[CONTENT.JS] Scraper already active, ignoring start request.');
        return;
    }
    this.active = true;
    console.log('[CONTENT.JS] GMaps Business Finder: Bulletproof Stage 1 Started');
    this.initRootObserver();
    this.startMapAutopilot();
  }

  stop() {
    console.log('[CONTENT.JS] GMaps Business Finder: Stopping scraper.');
    this.active = false;
    if (this.rootObserver) this.rootObserver.disconnect();
    if (this.feedObserver) this.feedObserver.disconnect();
    clearInterval(this.scrollInterval);
    clearInterval(this.autopilotInterval);
  }

  initRootObserver() {
    const sidebar = document.querySelector('div.m6QErb.W67uab') || document.body;
    console.log('[CONTENT.JS] initRootObserver: binding to', sidebar);
    this.rootObserver = new MutationObserver(() => {
      this.rebindFeedObserver();
    });
    this.rootObserver.observe(sidebar, { childList: true, subtree: false });
    this.rebindFeedObserver();
  }

  rebindFeedObserver() {
    if (!this.active) return;
    const feed = document.querySelector('div[role="feed"]');
    if (!feed) {
        // console.log('[CONTENT.JS] rebindFeedObserver: No feed found yet.'); // Too noisy
        return;
    }
    if (this.feedObserver) this.feedObserver.disconnect();
    console.log('[CONTENT.JS] rebindFeedObserver: Feed found! Binding observer.');
    this.feedObserver = new MutationObserver(() => {
      this.scrapeVisibleCards();
    });
    this.feedObserver.observe(feed, { childList: true, subtree: true });
    this.scrapeVisibleCards();
  }

  scrapeVisibleCards() {
    if (!this.active) return;
    const cards = document.querySelectorAll('div[role="article"], .Nv2Ybe, .THS69c, .Ua67Yy');
    if (cards.length > 0 && cards.length !== this.lastCount) {
        console.log(`[CONTENT.JS] scrapeVisibleCards: Found ${cards.length} cards.`);
        this.lastCount = cards.length;
    }
    
    let scrapedCount = 0;
    cards.forEach((card, index) => {
      const link = card.querySelector('a.hfpxzc, a.bm892c, a[href*="/maps/place/"]');
      if (!link) {
          console.log(`[CONTENT.JS] Card ${index}: No link found. Skipped.`);
          return;
      }
      const url = link.href;
      if (!url || this.processedUrls.has(url)) {
          // console.log(`[CONTENT.JS] Card ${index}: URL already processed or missing. Skipped.`);
          return;
      }

      const nameEl = card.querySelector('.fontHeadlineSmall, .qBF1Pd, [role="heading"]');
      if (!nameEl) {
          console.log(`[CONTENT.JS] Card ${index}: No name element found. Skipped.`);
          return;
      }
      
      this.processedUrls.add(url);
      scrapedCount++;
      const data = {
        name: nameEl.innerText.trim(),
        url: url,
        placeId: this.extractPlaceId(url),
        rating: card.querySelector('.MW4etd')?.innerText || 'N/A',
        reviews: card.querySelector('.UY7F9')?.innerText?.replace(/[()]/g, '') || '0'
      };

      let websiteLink = card.querySelector('a[aria-label*="Website"], a[aria-label*="웹사이트"], a.lcr4fd, a[data-item-id="authority"]');
      
      // English-specific fix: Attempt deeper scan if website not found in English UI
      if (!websiteLink && (document.documentElement.lang.startsWith('en') || window.location.href.includes('hl=en'))) {
          websiteLink = card.querySelector('a[aria-label*="website" i], a[aria-label*="Visit" i], a[data-tooltip*="Website" i]');
          if (!websiteLink) {
              const allLinks = card.querySelectorAll('a[href]');
              for (const a of allLinks) {
                  const h = a.href;
                  if (h && !h.includes('google.com/maps') && !h.includes('google.co.kr/maps') && !h.includes('javascript:') && !h.includes('googleadservices')) {
                      websiteLink = a;
                      break;
                  }
              }
          }
      }
      data.website = websiteLink ? websiteLink.href : 'N/A';
      const phoneMatch = card.innerText.match(/(\+?\d{1,4}?[-.\s]?\(?\d{1,3}?\)?[-.\s]?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{1,9})/);
      data.phone = phoneMatch ? phoneMatch[0] : 'N/A';

      const details = card.querySelectorAll('.W4E7P, .AJ7S2, .Ua67Yy');
      details.forEach(detail => {
        const text = detail.innerText;
        if (text.length > 2 && !text.includes('·') && !text.match(/\d/)) {
          data.category = text.trim();
        }
        if (text.includes('·')) data.address = text.trim();
      });

      console.log(`[CONTENT.JS] Card ${index}: Found Business! Sending to background.`, data);
      chrome.runtime.sendMessage({ action: 'foundBusiness', data });
    });
    if (scrapedCount > 0) {
        console.log(`[CONTENT.JS] scrapeVisibleCards: Successfully scraped and sent ${scrapedCount} businesses!`);
    }
  }

  /**
   * Precision Synchronization: Wait until the entire current feed is loaded and scraped
   */
  async waitUntilFinished() {
    console.log("🔍 Scraper: Waiting for feed completion...");
    const feed = document.querySelector('div[role="feed"]');
    if (!feed) return;

    let noChangeCount = 0;
    let lastScrollHeight = 0;

    while (this.active) {
      feed.scrollTop = feed.scrollHeight;
      await this.sleep(1500);
      
      this.scrapeVisibleCards(); // Force scrape after scroll

      const reachedEnd = document.querySelector('.HlvSq, .m6QErb.tL679e.ecceSd.fontBodyMedium');
      if (reachedEnd && reachedEnd.innerText.match(/reached the end|마지막 항목|끝입니다/i)) {
          console.log("🏁 Scraper: End of feed detected.");
          break;
      }

      if (feed.scrollHeight === lastScrollHeight) {
        noChangeCount++;
        if (noChangeCount > 3) {
          console.log("⌛ Scraper: Feed stabilized. Assuming completion.");
          break;
        }
      } else {
        noChangeCount = 0;
      }
      lastScrollHeight = feed.scrollHeight;
    }
    await this.sleep(1000);
  }

  startMapAutopilot() {
    this.autopilotInterval = setInterval(() => {
      if (!this.active) return;
      const refreshBtn = document.querySelector('button.NlVald, button.X69Czc');
      if (refreshBtn && refreshBtn.offsetParent) refreshBtn.click();
      const moveCheckbox = document.querySelector('button.D6NGZc[role="checkbox"]');
      if (moveCheckbox && !moveCheckbox.classList.contains('rqRiAc')) moveCheckbox.click();
    }, 2500);
  }

  extractPlaceId(url) {
    const match = url.match(/!1s([^!]+)!/);
    return match ? match[1] : url;
  }

  sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
}

class BingMapsBulletproofScraper {
  constructor() {
    this.active = false;
    this.processedUrls = new Set();
    this.rootObserver = null;
    this.feedObserver = null;
  }

  start() {
    if (this.active) return;
    this.active = true;
    console.log('[CONTENT.JS] Bing Maps Scraper Activated');
    this.initRootObserver();
  }

  stop() {
    this.active = false;
    if (this.rootObserver) this.rootObserver.disconnect();
    if (this.feedObserver) this.feedObserver.disconnect();
  }

  initRootObserver() {
    const sidebar = document.querySelector('#bm_listing_container') || document.querySelector('.bm_listing_card_container') || document.body;
    this.rootObserver = new MutationObserver(() => this.rebindFeedObserver());
    this.rootObserver.observe(sidebar, { childList: true, subtree: true });
    this.rebindFeedObserver();
  }

  rebindFeedObserver() {
    if (!this.active) return;
    const feed = document.querySelector('.bm_listing_card_container') || document.querySelector('[aria-label*="Search results"]');
    if (!feed) return;
    if (this.feedObserver) this.feedObserver.disconnect();
    this.feedObserver = new MutationObserver(() => this.scrapeVisibleCards());
    this.feedObserver.observe(feed, { childList: true, subtree: true });
    this.scrapeVisibleCards();
  }

  scrapeVisibleCards() {
    if (!this.active) return;
    const cards = document.querySelectorAll('button[class*="listingContent"], .bm_listing_card, [data-bm-id]');
    cards.forEach((card) => {
      const nameEl = card.querySelector('h3, .bm_listing_card_title, button[title], [role="heading"]');
      if (!nameEl) return;
      const name = nameEl.innerText.trim();
      
      const id = card.getAttribute('data-bm-id') || name;
      if (this.processedUrls.has(id)) return;
      this.processedUrls.add(id);

      const data = {
        name: name,
        url: window.location.href,
        rating: card.querySelector('.bm_listing_card_rating, [aria-label*="rating"]')?.innerText || 'N/A',
        reviews: 'N/A'
      };

      const cardText = card.innerText;
      const phoneMatch = cardText.match(/(\+?\d{1,4}?[-.\s]?\(?\d{1,3}?\)?[-.\s]?\d{3,4}[-.\s]?\d{4})/);
      data.phone = phoneMatch ? phoneMatch[0] : 'N/A';
      
      const krAddrRegex = /(([가-힣]+(시|도|특별자치시|특별자치도)\s+)?([가-힣]+(시|군|구)\s+)?([가-힣\d]+(읍|면|동|가|리)\s+)?([가-힣A-Za-z\d]+(로|길|대로)\s+[\d-]+|[가-힣\d]+(동|가|리|읍|면)\s+[\d-]+)(\s*번지)?(\s*,?\s*(지하\s*)?[\d가-힣A-Za-z]+(층|호|동|빌딩|센터|타워|アパート|상가|프라자|스퀘어|파크|관|단지))?(\s*[\d가-힣A-Za-z]+(호|층))?)/;
      const addrMatch = cardText.match(krAddrRegex);
      data.address = addrMatch ? addrMatch[0] : 'N/A';

      chrome.runtime.sendMessage({ action: 'foundBusiness', data });
    });
  }

  async waitUntilFinished() {
    const feed = document.querySelector('.bm_listing_card_container') || document.querySelector('[aria-label*="Search results"]');
    if (feed) {
        feed.scrollTop = feed.scrollHeight;
    } else {
        window.scrollTo(0, document.body.scrollHeight);
    }
    await new Promise(r => setTimeout(r, 2000));
    this.scrapeVisibleCards();
  }
}

const isBing = window.location.hostname.includes('bing.com');
const scraper = isBing ? new BingMapsBulletproofScraper() : new GMapsBulletproofScraper();

chrome.runtime.onMessage.addListener((req) => {
  console.log('[CONTENT.JS] Received chrome.runtime message:', req);
  if (req.action === 'start') scraper.start();
  else if (req.action === 'stop') scraper.stop();
  else if (req.action === 'startCruiser') cruiser.start(req.range, req.stepSize || 9.0, req.speedMult || 1.0);
  else if (req.action === 'stopCruiser') cruiser.stop();
});

window.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'XPIDER_CONTENT_MSG') {
    const req = e.data.message;
    console.log('[CONTENT.JS] Received XPIDER_CONTENT_MSG:', req);
    if (req.action === 'start') scraper.start();
    else if (req.action === 'stop') scraper.stop();
    else if (req.action === 'startCruiser') cruiser.start(req.range, req.stepSize || 9.0, req.speedMult || 1.0);
    else if (req.action === 'stopCruiser') cruiser.stop();
  }
});

/**
 * MissionHUD - High-performance Floating Dashboard for Google Maps
 */
class MissionHUD {
    constructor() {
        this.container = null;
        this.statusEl = null;
        this.distanceEl = null;
        this.leadsEl = null;
        this.dirEl = null;
    }

    create() {
        if (this.container) return;
        this.container = document.createElement('div');
        this.container.id = 'autocruiser-hud';
        this.container.innerHTML = `
            <div class="hud-header">
                <span class="hud-icon">🚀</span>
                <span class="hud-title">AUTOCRUISER PRO CONTROL</span>
            </div>
            <div class="hud-body">
                <div class="hud-stat">
                    <span class="hud-label">MISSION STATUS</span>
                    <span id="hud-status" class="hud-value">INITIALIZING...</span>
                </div>
                <div class="hud-grid">
                    <div class="hud-stat">
                        <span class="hud-label">DISTANCE</span>
                        <span id="hud-distance" class="hud-value">0.0 Mi</span>
                    </div>
                    <div class="hud-stat">
                        <span class="hud-label">NEW LEADS</span>
                        <span id="hud-leads" class="hud-value">0</span>
                    </div>
                </div>
                <div class="hud-stat">
                    <span class="hud-label">VECTOR DIRECTION</span>
                    <span id="hud-dir" class="hud-value">SCANNING</span>
                </div>
            </div>
            <div class="hud-radar">
                <div class="radar-beam"></div>
            </div>
        `;

        const style = document.createElement('style');
        style.id = 'hud-styles';
        style.textContent = `
            #autocruiser-hud {
                position: fixed; top: 20px; right: 70px; width: 260px;
                background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(12px);
                border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 16px;
                padding: 16px; color: white; font-family: 'Segoe UI', Roboto, sans-serif;
                z-index: 9999999; box-shadow: 0 10px 30px rgba(0,0,0,0.5);
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            }
            .hud-header { display: flex; align-items: center; gap: 10px; margin-bottom: 15px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 10px; }
            .hud-title { font-size: 11px; font-weight: 800; color: #60a5fa; letter-spacing: 1.5px; }
            .hud-stat { margin-bottom: 12px; }
            .hud-label { display: block; font-size: 9px; color: #94a3b8; text-transform: uppercase; margin-bottom: 4px; }
            .hud-value { font-size: 14px; font-weight: 600; color: #f8fafc; }
            .hud-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
            .hud-radar { height: 4px; background: rgba(255,255,255,0.05); border-radius: 2px; overflow: hidden; position: relative; }
            .radar-beam { position: absolute; height: 100%; width: 40%; background: linear-gradient(90deg, transparent, #3b82f6, transparent); animation: hudScan 2s linear infinite; }
            @keyframes hudScan { 0% { left: -50%; } 100% { left: 150%; } }
        `;
        document.head.appendChild(style);
        document.body.appendChild(this.container);
        this.statusEl = document.getElementById('hud-status');
        this.distanceEl = document.getElementById('hud-distance');
        this.leadsEl = document.getElementById('hud-leads');
        this.dirEl = document.getElementById('hud-dir');
    }

    update(data) {
        if (!this.container) this.create();
        if (data.status) this.statusEl.innerText = data.status.toUpperCase();
        if (data.distance !== undefined) this.distanceEl.innerText = `${data.distance.toFixed(2)} Mi`;
        if (data.newLeads !== undefined) this.leadsEl.innerText = data.newLeads;
        if (data.direction) this.dirEl.innerText = data.direction.toUpperCase();
    }

    destroy() {
        if (this.container) this.container.remove();
        const style = document.getElementById('hud-styles');
        if (style) style.remove();
        this.container = null;
    }
}

/**
 * MapCruiser - Advanced Zig-Zag Map Exploration Engine for GMaps
 */
class MapCruiser {
    constructor() {
        this.active = false;
        this.rangeMiles = 5;
        this.totalDistance = 0;
        this.leadsAtStart = 0;
        this.currentXSteps = 0;
        this.currentYSteps = 0;
        this.dirX = 1;
        this.maxSteps = 0;
        this.hud = new MissionHUD();
    }

    async start(range, stepSize, speedMult) {
        if (this.active) return;
        this.active = true;
        this.rangeMiles = range;
        this.stepSize = stepSize;
        this.speedMult = speedMult || 1.0;
        this.baseDelay = 2000 / this.speedMult;
        this.oceanCount = 0;
        this.currentXSteps = 0;
        this.currentYSteps = 0;
        this.dirX = 1;
        this.totalDistance = 0;
        this.maxSteps = Math.ceil(range / stepSize); 
        
        const res = await chrome.storage.local.get(['scrapedData']);
        this.leadsAtStart = (res.scrapedData || []).length;
        this.hud.create();
        this.hud.update({ status: 'Engaging Precision Scan', direction: 'Calibrating' });
        this.run();
    }

    stop() {
        this.active = false;
        this.hud.destroy();
        console.log('🛑 GMaps Cruiser: Stopped.');
    }

    async run() {
        while (this.active) {
            const zoom = this.getZoomLevel();
            const lat = this.getLat();
            const metersPerPx = this.getMetersPerPixel(zoom, lat);
            // 1 mile ≈ 1609.34 meters
            const stepMeters = this.stepSize * 1609.34; 
            const pxOffset = Math.floor(stepMeters / metersPerPx);
            
            let moveKey = '';
            let moveName = '';
            const rowWidth = (this.currentYSteps === 0) ? this.maxSteps : this.maxSteps * 2;

            if (this.currentXSteps < rowWidth) {
                moveKey = this.dirX === 1 ? 'ArrowRight' : 'ArrowLeft';
                moveName = this.dirX === 1 ? 'Scanning East' : 'Scanning West';
                this.currentXSteps++;
            } else {
                moveKey = 'ArrowDown';
                moveName = 'Stepping Down';
                this.currentXSteps = 0; 
                this.dirX *= -1; 
                this.currentYSteps++;
            }

            if (this.currentYSteps > this.maxSteps * 2) {
                this.hud.update({ status: 'Mission Complete' });
                this.stop();
                break;
            }

            // 1. Move Map with PointerEvents
            console.log(`🚀 Cruiser: Moving ${moveName} (${pxOffset}px)`);
            this.hud.update({ direction: moveName, status: 'Moving...' });
            await this.moveMapPointer(moveKey, pxOffset);
            this.totalDistance += this.stepSize;
            await scraper.sleep(this.baseDelay);

            // 2. Trigger Search
            const refreshBtn = document.querySelector('button.NlVald');
            if (refreshBtn) refreshBtn.click();
            
            this.hud.update({ status: 'Scanning sector...' });
            const hasResults = await this.checkResultsWithTimeout();

            if (!hasResults) {
                this.hud.update({ status: 'Empty Area. Inspecting Screen...' });
                const seaCheckRes = await chrome.runtime.sendMessage({ action: 'CHECK_OCEAN' });
                
                if (seaCheckRes && seaCheckRes.isOcean) {
                    this.oceanCount++;
                    console.log(`🌊 Cruiser: Ocean Detected! [Count: ${this.oceanCount}/3]`);
                    
                    if (this.oceanCount >= 3) {
                        this.hud.update({ status: 'Wide Ocean: Skipping Row' });
                        this.currentXSteps = rowWidth; // Fast-forward
                        this.oceanCount = 0; // reset
                        await scraper.sleep(1500 / this.speedMult);
                    } else {
                        this.hud.update({ status: `Ocean (${this.oceanCount}/3): Moving On` });
                        await scraper.sleep(1000 / this.speedMult);
                    }
                } else {
                    this.oceanCount = 0;
                    console.log("🏜️ Cruiser: Empty Land Detected. Moving On.");
                    this.hud.update({ status: 'Empty Land: Moving On' });
                }
                
                continue; 
            }
            
            // Reset ocean count if results are found
            this.oceanCount = 0;

            // 3. Wait for Scraper to finish current view
            this.hud.update({ status: 'Scraping results...' });
            await scraper.waitUntilFinished();

            const res = await chrome.storage.local.get(['scrapedData']);
            const newLeads = (res.scrapedData || []).length - this.leadsAtStart;
            this.hud.update({ distance: this.totalDistance, newLeads: newLeads });
            
            chrome.runtime.sendMessage({ 
                action: 'cruiserUpdate', 
                data: { direction: moveName, distance: this.totalDistance, newLeads: newLeads } 
            });
        }
    }

    getZoomLevel() {
        const match = window.location.href.match(/@.*,(\d+\.?\d*)z/);
        return match ? parseFloat(match[1]) : 15;
    }

    async checkResultsWithTimeout() {
        for (let i = 0; i < 10; i++) { 
            if (this.hasResults()) return true;
            await scraper.sleep(500);
        }
        return false;
    }

    hasResults() {
        const cards = document.querySelectorAll('div[role="article"], .Nv2Ybe, .THS69c, .Ua67Yy');
        if (cards.length > 0) return true;

        const noResults = document.querySelector('.Q27Ybe, .header-title-text, .HlvSq');
        if (noResults && (noResults.innerText.includes('can\'t find') || noResults.innerText.includes('찾을 수 없습니다') || noResults.innerText.includes('결과가 없습니다'))) return false;

        return false;
    }

    getMetersPerPixel(zoom, lat) {
        return 156543.03392 * Math.cos(lat * Math.PI / 180) / Math.pow(2, zoom);
    }

    getLat() {
        const match = window.location.href.match(/@(-?\d+\.?\d*),/);
        return match ? parseFloat(match[1]) : 40;
    }

    async moveMapPointer(key, px) {
        // Find the interactive layer dynamically
        const centerX = window.innerWidth / 2 + 100; // Offset from sidebar
        const centerY = window.innerHeight / 2;
        const target = document.elementFromPoint(centerX, centerY) || 
                      document.querySelector('canvas.widget-scene-canvas') || 
                      document.body;

        const rect = target.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        
        let dx = 0, dy = 0;
        if (key === 'ArrowRight') dx = -px;
        if (key === 'ArrowLeft') dx = px;
        if (key === 'ArrowDown') dy = -px;
        if (key === 'ArrowUp') dy = px;

        console.log(`🖱️ Ultimate Drag: Starting ${key} move on`, target);

        const dispatchEvents = (element, type, curX, curY, buttons = 1) => {
            const eventProps = {
                bubbles: true,
                cancelable: true,
                composed: true,
                view: window,
                clientX: curX,
                clientY: curY,
                screenX: curX,
                screenY: curY,
                buttons: buttons,
                button: buttons !== 0 ? 0 : -1,
                pointerId: 1,
                isPrimary: true,
                pointerType: 'mouse',
                pressure: buttons !== 0 ? 0.5 : 0
            };
            
            // Dispatch Pointer Event first
            element.dispatchEvent(new PointerEvent(`pointer${type}`, eventProps));
            // Dispatch Mouse Event next to bypass legacy filters
            element.dispatchEvent(new MouseEvent(`mouse${type}`, eventProps));
        };

        // 1. Initial Contact on Target Element
        dispatchEvents(target, 'over', x, y, 0);
        dispatchEvents(target, 'enter', x, y, 0);
        await scraper.sleep(50);
        dispatchEvents(target, 'down', x, y, 1);
        await scraper.sleep(100); 

        // 2. Granular Movement on Window (to prevent losing focus)
        const steps = 40;
        for (let i = 1; i <= steps; i++) {
            const currentX = x + (dx * i) / steps;
            const currentY = y + (dy * i) / steps;
            
            // Google Maps engines track window movement during a drag
            dispatchEvents(window, 'move', currentX, currentY, 1);
            
            // Smooth human-like delay (~800ms total)
            await scraper.sleep(20); 
        }

        await scraper.sleep(100);

        // 3. Final Release on Window
        dispatchEvents(window, 'up', x + dx, y + dy, 0);
        dispatchEvents(target, 'out', x + dx, y + dy, 0);
        dispatchEvents(target, 'leave', x + dx, y + dy, 0);
        
        console.log("✅ Ultimate Drag: Sequence Complete.");
    }
}

const cruiser = new MapCruiser();

class BingMapsBulletproofScraper {
  constructor() {
    this.active = false;
    this.processedUrls = new Set();
    this.queue = [];
    this.isProcessing = false;
    this.rootObserver = null;
    this.listObserver = null;
    this.currentList = null;
    this.scrollInterval = null;
    this.lastScrollHeight = 0;
    this.scrollStuckCount = 0;
    
    console.log('BingMaps Scraper: Content Script Loaded');
    
    // Sync active state from storage
    chrome.storage.local.get(['scrapingActive'], (res) => {
        if (res.scrapingActive) this.start();
    });

    this.initInstantAutorefresh();
    this.initXpiderBanner();
  }

  initXpiderBanner() {
      const lang = document.documentElement.lang.split('-')[0] || 'en';
      this.showXpiderBanner(lang);
      
      window.addEventListener('message', (e) => {
          if (e.data && e.data.type === 'XPIDER_EVENT' && e.data.name === 'language-change') {
              this.showXpiderBanner(e.data.data.lang);
          }
      });
  }

  showXpiderBanner(lang) {
      const existing = document.getElementById('xpider-onboarding-banner');
      if (existing) existing.remove();

      const dict = {
          ko: { title: '비즈니스 탐색 준비 완료!', desc: '사이드바에서 [탐색 시작] 버튼을 눌러 데이터를 수집하세요.' },
          en: { title: 'Ready to Find Businesses!', desc: 'Click [Start Scraper] in the side panel to collect data.' },
          ja: { title: 'ビジネス検索の準備ができました！', desc: 'サイドパネルの [探索開始] ボタンをクリックしてデータを収集します。' },
          zh: { title: '准备好查找商家了！', desc: '点击侧边栏中的 [开始抓取] 按钮收集数据。' }
      };

      const text = dict[lang] || dict['en'];
      const banner = document.createElement('div');
      banner.id = 'xpider-onboarding-banner';
      banner.innerHTML = `
          <div style="font-weight: 800; font-size: 14px; color: #f5a623; margin-bottom: 4px;">XPIDER: ${text.title}</div>
          <div style="font-size: 12px; opacity: 0.9;">${text.desc}</div>
      `;
      Object.assign(banner.style, {
          position: 'fixed', bottom: '30px', left: '50%', transform: 'translateX(-50%)',
          backgroundColor: '#1a1a1a', color: 'white', padding: '15px 25px', borderRadius: '12px',
          boxShadow: '0 10px 40px rgba(0,0,0,0.6)', zIndex: '10001', textAlign: 'center',
          border: '1px solid #f5a623', pointerEvents: 'none', animation: 'xpider-fade-up 0.5s ease-out'
      });

      const style = document.createElement('style');
      style.textContent = `
          @keyframes xpider-fade-up {
              from { transform: translate(-50%, 20px); opacity: 0; }
              to { transform: translate(-50%, 0); opacity: 1; }
          }
      `;
      document.head.appendChild(style);
      document.body.appendChild(banner);

      setTimeout(() => {
          banner.style.opacity = '0';
          banner.style.transition = 'opacity 1s ease';
          setTimeout(() => banner.remove(), 1000);
      }, 8000);
  }


  start() {
    if (this.active) return;
    this.active = true;
    console.log('BingMaps: SCRAPER ACTIVE - LEADS WILL ACCUMULATE IN STORAGE');
    this.initObserver();
    this.scrapeVisibleCards();
  }

  stop() {
    this.active = false;
    this.queue = [];
    if (this.rootObserver) this.rootObserver.disconnect();
    if (this.listObserver) this.listObserver.disconnect();
    clearInterval(this.scrollInterval);
    console.log('BingMaps: SCRAPER PAUSED');
  }

  initObserver() {
    this.rebindListObserver();
    this.rootObserver = new MutationObserver(() => this.rebindListObserver());
    this.rootObserver.observe(document.body, { childList: true, subtree: true });

    // INTELLIGENT AUTO-SCROLL (Optimized for Bing)
    if (!this.scrollInterval) {
      this.scrollInterval = setInterval(() => {
        if (!this.active || this.isProcessing) return; 
        
        const scrollContainer = document.querySelector('div.b_lstcards') || 
                                document.querySelector('#bm_results') || 
                                document.querySelector('.scrollable') ||
                                document.querySelector('.b_lstcards_container');
                                
        if (scrollContainer) {
          scrollContainer.scrollTop += 800;
          
          if (scrollContainer.scrollTop === this.lastScrollHeight) {
              this.scrollStuckCount++;
              scrollContainer.scrollTop += 50; 
          } else {
              this.scrollStuckCount = 0;
          }
          this.lastScrollHeight = scrollContainer.scrollTop;

          if (this.scrollStuckCount > 3) {
              const moreBtn = document.querySelector('a.b_more, .b_showMore, [aria-label*="Next"]');
              if (moreBtn && moreBtn.offsetParent) {
                  moreBtn.click();
                  this.scrollStuckCount = 0;
              }
          }
        }
      }, 3000);
    }
  }

  rebindListObserver() {
    const list = document.querySelector('div.b_lstcards') || document.querySelector('.b_lstcards_container');
    if (!list || this.currentList === list) return;
    
    if (this.listObserver) this.listObserver.disconnect();
    this.currentList = list;
    this.listObserver = new MutationObserver(() => this.scrapeVisibleCards());
    this.listObserver.observe(list, { childList: true, subtree: true });
    this.scrapeVisibleCards();
  }

  scrapeVisibleCards() {
    if (!this.active) return;

    const cards = document.querySelectorAll('button.listingContent_fjvwG, div.b_split_card[role="listitem"], .b_algo, .entity-card');
    
    cards.forEach(card => {
      const nameEl = card.querySelector('h3, .b_entityTitle, [title], [role="heading"]');
      if (!nameEl) return;
      const name = nameEl.innerText.trim();
      const infoText = card.innerText.trim();
      const uniqueId = `${name}-${infoText.substring(0, 50)}`; 
      
      if (this.processedUrls.has(uniqueId)) return;
      
      if (!this.queue.some(item => item.id === uniqueId)) {
          this.queue.push({ id: uniqueId, element: card, name: name });
      }
    });

    if (!this.isProcessing) {
        this.processNextCard();
    }
  }

  async processNextCard() {
    if (!this.active || this.queue.length === 0) {
        this.isProcessing = false;
        return;
    }

    this.isProcessing = true;
    const item = this.queue.shift();
    
    try {
        if (this.processedUrls.has(item.id)) return this.processNextCard();
        this.processedUrls.add(item.id);

        console.log(`📍 Scraping Details: ${item.name}`);
        
        // 1. Click the card to open detail panel
        item.element.click();
        
        // 2. Wait for panel to load
        await new Promise(r => setTimeout(r, 1500));

        // 3. Extract from Detail Panel (Targeting data-tags for stability)
        const detailPanel = document.querySelector('.singleEntityWrapper_srJlN, #entity_ans, .b_entity_detail, .slide_card, .entity_panel') || document;
        
        const titleEl = detailPanel.querySelector('[data-tag="title"], h2, .b_entityTitle, [role="heading"]');
        const cleanedName = titleEl ? titleEl.innerText.trim() : item.name;

        const data = {
          name: cleanedName,
          url: window.location.href,
          placeId: item.id,
          rating: detailPanel.querySelector('.b_rating, .stars, [aria-label*="rating"]')?.innerText || 'N/A',
          reviews: detailPanel.querySelector('.b_rev_Count, .b_rating + span, [aria-label*="reviews"]')?.innerText?.replace(/[()]/g, '') || '0',
          website: 'N/A',
          phone: 'N/A',
          category: detailPanel.querySelector('.b_entitySubtitle, .listingSubtitle_srJlN')?.innerText || 'N/A',
          address: 'N/A'
        };

        // Website extraction (Priority on decoding redirects)
        const allLinks = Array.from(detailPanel.querySelectorAll('a[href]'));
        let actualWebsite = 'N/A';
        const websiteLink = allLinks.find(a => a.href.includes('alink/link?url=') || 
                                              (a.href.startsWith('http') && !a.href.includes('bing.com') && !a.href.includes('microsoft.com')));
        
        if (websiteLink) {
            let rawUrl = websiteLink.href;
            if (rawUrl.includes('alink/link?url=')) {
                try {
                    const urlObj = new URL(rawUrl);
                    const decoded = urlObj.searchParams.get('url');
                    if (decoded) rawUrl = decoded;
                } catch (e) {}
            }
            // Second layer of cleaning for Bing Place links hidden in redirects
            if (!rawUrl.includes('bing.com/places') && !rawUrl.includes('bing.com/maps')) {
                actualWebsite = rawUrl;
            }
        }
        data.website = actualWebsite;

        // Phone extraction
        const phoneEl = detailPanel.querySelector('a[data-tag="phone"], a[href^="tel:"], .b_phone');
        if (phoneEl) {
            data.phone = phoneEl.innerText.trim() || phoneEl.href.replace('tel:', '');
        }

        // Address extraction
        const addressEl = detailPanel.querySelector('[data-tag="address"], .b_address, .b_factrow [title="Address"] + div');
        if (addressEl) {
            data.address = addressEl.innerText.trim();
        } else {
            // Check secondary information blocks
            const facts = detailPanel.innerText;
            const addressMatch = facts.match(/\d+[ ](?:[A-Za-z0-9.-]+[ ]?)+(?:Avenue|Lane|Road|Boulevard|Drive|Street|Way|Ave|Dr|St|Rd|Blvd)[, ]+[A-Za-z ]+[, ]+[A-Z]{2}[ ]+\d{5}/i);
            if (addressMatch) data.address = addressMatch[0];
            else {
                const cardSub = item.element.querySelector('.b_entitySubtitle, .listingSubtitle_srJlN');
                if (cardSub) data.address = cardSub.innerText.trim();
            }
        }

        chrome.runtime.sendMessage({ action: 'foundBusiness', data });

    } catch (err) {
        console.error("Card processing error:", err);
    }

    setTimeout(() => this.processNextCard(), 500);
  }

  initInstantAutorefresh() {
    const findAndClickRefreshButton = () => {
        // 1. Target specific modern selector first
        const refreshBtn = document.querySelector('.searchThisAreaButton_KCAj0');
        if (refreshBtn && refreshBtn.offsetParent) {
            refreshBtn.click();
            return true;
        }

        // 2. Legacy text-based search fallback
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
            const text = btn.innerText;
            if (text.includes('이 지역 검색') || text.includes('Search this area')) {
                const style = window.getComputedStyle(btn);
                if (style.display !== 'none' && style.visibility !== 'hidden' && btn.offsetHeight > 0) {
                    btn.click();
                    return true;
                }
            }
        }
        return false;
    };

    window.addEventListener('mouseup', () => setTimeout(findAndClickRefreshButton, 300));
    window.addEventListener('wheel', () => setTimeout(findAndClickRefreshButton, 300), { passive: true });
    
    // Dynamic interval: faster during cruiser
    const pulseRefresh = () => {
        findAndClickRefreshButton();
        const interval = (window.cruiser && window.cruiser.active) ? 700 : 1500;
        setTimeout(pulseRefresh, interval);
    };
    pulseRefresh();
  }
}


/**
 * MissionHUD - High-performance Floating Dashboard for Bing Maps
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
                position: fixed;
                top: 20px;
                right: 20px;
                width: 260px;
                background: rgba(15, 23, 42, 0.85);
                backdrop-filter: blur(12px);
                border: 1px solid rgba(255, 255, 255, 0.15);
                border-radius: 16px;
                padding: 16px;
                color: white;
                font-family: 'Segoe UI', Roboto, sans-serif;
                z-index: 9999999;
                box-shadow: 0 10px 30px rgba(0,0,0,0.5), inset 0 1px 1px rgba(255,255,255,0.1);
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                animation: slideIn 0.5s ease-out;
            }
            @keyframes slideIn {
                from { transform: translateX(300px); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            .hud-header {
                display: flex;
                align-items: center;
                gap: 10px;
                margin-bottom: 15px;
                border-bottom: 1px solid rgba(255,255,255,0.1);
                padding-bottom: 10px;
            }
            .hud-icon { font-size: 20px; }
            .hud-title {
                font-size: 11px;
                font-weight: 800;
                letter-spacing: 1.5px;
                color: #60a5fa;
            }
            .hud-stat { margin-bottom: 12px; }
            .hud-label {
                display: block;
                font-size: 9px;
                color: #94a3b8;
                text-transform: uppercase;
                margin-bottom: 4px;
                font-weight: 700;
            }
            .hud-value {
                font-size: 14px;
                font-weight: 600;
                color: #f8fafc;
                text-shadow: 0 0 10px rgba(96, 165, 250, 0.3);
            }
            .hud-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 10px;
            }
            .hud-radar {
                height: 4px;
                background: rgba(255,255,255,0.05);
                border-radius: 2px;
                overflow: hidden;
                position: relative;
            }
            .radar-beam {
                position: absolute;
                height: 100%;
                width: 40%;
                background: linear-gradient(90deg, transparent, #3b82f6, transparent);
                animation: scan 2s linear infinite;
            }
            @keyframes scan {
                0% { left: -50%; }
                100% { left: 150%; }
            }
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
 * MapCruiser - Advanced Zig-Zag Map Exploration Engine (Upgraded)
 */
class MapCruiser {
    constructor() {
        this.active = false;
        this.rangeMiles = 5;
        this.interval = null;
        this.totalDistance = 0;
        this.leadsAtStart = 0;
        
        // ZIG-ZAG (SNAKE) STATE
        this.currentXSteps = 0;
        this.currentYSteps = 0;
        this.dirX = 1; // 1: Right, -1: Left
        this.maxSteps = 0;
        this.emptyStepCount = 0; // Track consecutive steps without results
        
        this.hud = new MissionHUD();
    }

    async start(range, stepSize = 9.0, speedMult = 1.0) {
        if (this.active) return;
        this.active = true;
        this.rangeMiles = range;
        this.stepSize = stepSize;
        this.speedMult = speedMult;
        
        // Reset Snake Progress
        this.currentXSteps = 0;
        this.currentYSteps = 0;
        this.dirX = 1;
        this.totalDistance = 0;
        this.maxSteps = Math.ceil(range / (stepSize / 15)); // Adjust steps based on stepSize
        
        const res = await chrome.storage.local.get(['scrapedData']);
        this.leadsAtStart = (res.scrapedData || []).length;

        console.log(`🚀 Cruiser: Mission Start - ${range} Mi Radius (Step: ${stepSize}, Speed: ${speedMult}x)`);
        this.hud.create();
        this.hud.update({ status: 'Engaging Snake Scan...', direction: 'Initializing' });
        this.run();
    }

    stop() {
        this.active = false;
        clearTimeout(this.interval);
        this.hud.destroy();
        console.log('🛑 Cruiser: Emergency Stop Engaged.');
    }

    async run() {
        if (!this.active) return;

        // 1. Determine Movement
        let moveKey = '';
        let moveName = '';
        
        // Calculate max width for the current row (simple snake: use full diameter)
        const rowWidth = (this.currentYSteps === 0) ? this.maxSteps : this.maxSteps * 2;

        if (this.currentXSteps < rowWidth) {
            // Move horizontally
            moveKey = this.dirX === 1 ? 'ArrowRight' : 'ArrowLeft';
            moveName = this.dirX === 1 ? 'Scanning East' : 'Scanning West';
            this.currentXSteps++;
        } else {
            // Reached end of row, move down and switch direction
            moveKey = 'ArrowDown';
            moveName = 'Stepping Down';
            this.currentXSteps = 0; 
            this.dirX *= -1; // Flip horizontal direction
            this.currentYSteps++;
        }

        // 2. Perform Movement
        this.moveMap(moveKey);
        this.totalDistance += 0.25;

        // 3. Intelligent Avoidance Integration
        const resultsFound = await this.checkResultsWithTimeout();
        
        if (!resultsFound) {
            this.emptyStepCount++;
            console.log(`⚠️ Cruiser: No results found (${this.emptyStepCount}/2)`);
            
            if (this.emptyStepCount >= 2 && this.currentXSteps < rowWidth) {
                console.log("🌊 Cruiser: Empty zone detected. Skipping the rest of this row.");
                this.hud.update({ status: 'Avoiding Empty Area' });
                this.currentXSteps = rowWidth; // Force move to next row on next step
                this.emptyStepCount = 0;
                
                // Speed up transition to next row
                this.interval = setTimeout(() => this.run(), 2000); 
                return;
            }
        } else {
            this.emptyStepCount = 0;
        }

        // 4. Status Report
        const res = await chrome.storage.local.get(['scrapedData']);
        const currentLeads = (res.scrapedData || []).length;
        const newLeads = currentLeads - this.leadsAtStart;

        const updateData = {
            direction: moveName,
            status: `Row ${this.currentYSteps + 1} (${this.currentXSteps}/${rowWidth})`,
            distance: this.totalDistance,
            newLeads: newLeads
        };

        this.hud.update(updateData);
        chrome.runtime.sendMessage({ action: 'cruiserUpdate', data: updateData });

        // 5. Termination Check (Scan until bottom of the diameter)
        if (this.currentYSteps > this.maxSteps * 2) { 
             this.hud.update({ status: 'Mission Complete' });
             setTimeout(() => {
                this.stop();
                chrome.runtime.sendMessage({ action: 'cruiserUpdate', data: { status: 'Mission Complete', finished: true } });
             }, 3000);
             return;
        }

        // 6. Timing (Base 5.5s, adjusted by speedMult)
        const baseDelay = 5500;
        const actualDelay = Math.max(1000, baseDelay / this.speedMult);
        this.interval = setTimeout(() => this.run(), actualDelay);
    }

    async checkResultsWithTimeout() {
        // Wait up to 3.5s for results to potentially appear
        for (let i = 0; i < 7; i++) { 
            if (this.hasResults()) return true;
            await new Promise(r => setTimeout(r, 500));
        }
        return false;
    }

    hasResults() {
        // Detection Logic for Bing Results
        const cards = document.querySelectorAll('button.listingContent_fjvwG, div.b_split_card[role="listitem"], .b_algo, .entity-card');
        if (cards.length > 0) return true;

        // Check for specific "No results found" container/text
        const noResults = document.querySelector('.b_no_results, .message_Nzk1N, #empty_results');
        if (noResults && noResults.offsetParent) return false;

        // Check list container
        const container = document.querySelector('div.b_lstcards, .b_lstcards_container');
        if (container && container.innerText.includes('결과가 없습니다') || container?.innerText.includes('No results')) return false;

        return false;
    }

    moveMap(key) {
        // Targeted selection for modern Bing Maps (MapLibre GL)
        const canvas = document.querySelector('canvas.maplibregl-canvas');
        const fallbackArea = document.querySelector('.MapControl') || 
                            document.getElementById('bm_map') ||
                            document.getElementById('MapControl_Parent') ||
                            document.body;
        
        const target = canvas || fallbackArea;
        
        // 1. Ensure Focus
        target.focus();
        
        // Strategy A: Physical Keyboard Simulation (For legacy support)
        const options = { 
            bubbles: true, 
            cancelable: true, 
            key: key, 
            code: key, 
            view: window,
            which: key.includes('Up')?38:key.includes('Down')?40:key.includes('Left')?37:39,
            keyCode: key.includes('Up')?38:key.includes('Down')?40:key.includes('Left')?37:39
        };
        
        const repeatCount = Math.ceil((this.stepSize || 9.0) * 1.5); // Heuristic
        for (let i = 0; i < repeatCount; i++) {
            target.dispatchEvent(new KeyboardEvent('keydown', options));
            target.dispatchEvent(new KeyboardEvent('keyup', options));
        }

        // Strategy B: Robust Mouse Drag (For Modern Canvas)
        const rect = target.getBoundingClientRect();
        const startX = rect.left + rect.width / 2;
        const startY = rect.top + rect.height / 2;
        
        const moveOffset = 250; // Increased for better range
        let dx = 0, dy = 0;
        if (key === 'ArrowRight') dx = -moveOffset;
        if (key === 'ArrowLeft') dx = moveOffset;
        if (key === 'ArrowDown') dy = -moveOffset;
        if (key === 'ArrowUp') dy = moveOffset;

        if (dx !== 0 || dy !== 0) {
            this.simulateDrag(target, startX, startY, startX + dx, startY + dy);
        }
    }

    simulateDrag(element, startX, startY, endX, endY) {
        const createMouseEvent = (type, x, y) => {
            return new MouseEvent(type, {
                bubbles: true,
                cancelable: true,
                clientX: x,
                clientY: y,
                buttons: 1, // Primary button
                button: 0,
                view: window
            });
        };

        // 1. Mouse Down
        element.dispatchEvent(createMouseEvent('mousedown', startX, startY));
        
        // 2. Multiple Steps for Mouse Move (MapLibre recognition fix)
        const steps = 8;
        for (let i = 1; i <= steps; i++) {
            const currentX = startX + (endX - startX) * (i / steps);
            const currentY = startY + (endY - startY) * (i / steps);
            element.dispatchEvent(createMouseEvent('mousemove', currentX, currentY));
        }
        
        // 3. Mouse Up
        element.dispatchEvent(createMouseEvent('mouseup', endX, endY));
    }
}

// ==========================================
// XPIDER MESSAGE BRIDGE (CONTENT)
// ==========================================
window.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'XPIDER_CONTENT_MSG') {
    const req = event.data.message;
    console.log('[BING-CONTENT] Bridge received signal:', req.action);
    if (req.action === 'start') scraper.start();
    else if (req.action === 'stop') scraper.stop();
    else if (req.action === 'startCruiser') cruiser.start(req.range, req.stepSize, req.speedMult);
    else if (req.action === 'stopCruiser') cruiser.stop();
  }
});
// ==========================================

const scraper = new BingMapsBulletproofScraper();
const cruiser = new MapCruiser();
window.cruiser = cruiser; // Global reference for pulseRefresh

chrome.storage.onChanged.addListener((changes) => {
    if (changes.scrapingActive) {
        if (changes.scrapingActive.newValue) scraper.start();
        else scraper.stop();
    }
});

chrome.runtime.onMessage.addListener((req) => {
  if (req.action === 'start') scraper.start();
  else if (req.action === 'stop') scraper.stop();
  else if (req.action === 'startCruiser') cruiser.start(req.range, req.stepSize, req.speedMult);
  else if (req.action === 'stopCruiser') cruiser.stop();
});

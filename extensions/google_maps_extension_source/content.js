// content.js - XPIDER AutoCruiser Pro v3 - ULTRA SCRAPE ENGINE
// BUILD: 2026-04-28 | PATH: browser/extensions/google_maps_extension_source/
'use strict';

const _XPIDER_VER = '3.1.0';
const _XPIDER_BUILD = '2026-04-28';
console.log(`[XPIDER] ✅ content.js v${_XPIDER_VER} (${_XPIDER_BUILD}) PATH=browser/extensions/google_maps_extension_source/ URL=${location.href.substring(0, 60)}`);

// ═══════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function sendToXpider(message) {
  // 1. Native chrome.runtime (if available)
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    try { chrome.runtime.sendMessage(message); } catch(e) {}
  }
  // 2. XPIDER postMessage bridge (always sent for relay)
  window.postMessage({ type: 'XPIDER_BRIDGE_RELAY', message }, '*');
}

// ═══════════════════════════════════════════════════════════════════════
// ULTRA SCRAPE ENGINE — GMapsBulletproofScraper
// ═══════════════════════════════════════════════════════════════════════
class GMapsBulletproofScraper {
  constructor() {
    this.active       = false;
    this.collecting   = false;      // true while scrolling/collecting
    this.processedIds = new Set();  // placeId or href dedup set
    this.totalLeads   = 0;
    this.rootObserver = null;
    this.feedObserver = null;
    this._autopilotTimer = null;
  }

  // ── Start / Stop ──────────────────────────────────────────────
  start() {
    if (this.active) return;
    this.active = true;
    console.log('[SCRAPER] Ultra Scrape Engine STARTED');
    this._bindObservers();
    this._startAutopilot();
  }

  stop() {
    this.active     = false;
    this.collecting = false;
    clearInterval(this._autopilotTimer);
    if (this.rootObserver) this.rootObserver.disconnect();
    if (this.feedObserver) this.feedObserver.disconnect();
    console.log('[SCRAPER] Stopped. Total leads this session:', this.totalLeads);
    sendToXpider({ action: 'scrapingFinished', totalLeads: this.totalLeads });
  }

  // ── Observer Binding ──────────────────────────────────────────
  _bindObservers() {
    // Root observer: watches for sidebar DOM changes (after new search results load)
    const root =
      document.querySelector('div[role="main"]') ||
      document.querySelector('div.m6QErb.W67uab') ||
      document.body;

    this.rootObserver = new MutationObserver(() => this._rebindFeedObserver());
    this.rootObserver.observe(root, { childList: true, subtree: true });
    this._rebindFeedObserver();
  }

  _rebindFeedObserver() {
    if (!this.active) return;
    const feed = this._getFeed();
    if (!feed || feed === this._lastFeed) return;
    this._lastFeed = feed;

    if (this.feedObserver) this.feedObserver.disconnect();
    this.feedObserver = new MutationObserver(() => this._onFeedChanged());
    this.feedObserver.observe(feed, { childList: true, subtree: true });
    console.log('[SCRAPER] Feed observer bound:', feed.className || feed.tagName);
  }

  _onFeedChanged() {
    // Lightweight immediate scrape on DOM change (no scroll)
    this._scrapeCards();
  }

  // ── Feed Locator ──────────────────────────────────────────────
  _getFeed() {
    return (
      document.querySelector('div[role="feed"]') ||
      document.querySelector('.m6QErb.DxyBCb.klm67c') ||
      document.querySelector('.m6QErb[tabindex="-1"]') ||
      document.querySelector('div[aria-label*="Results for"]') ||
      document.querySelector('.m6QErb')
    );
  }

  // ── Card Extraction ───────────────────────────────────────────
  _extractCardData(card) {
    const link = card.querySelector('a.hfpxzc, a[href*="/maps/place/"]');
    if (!link) return null;

    const url  = link.href || '';
    const name = (
      card.querySelector('.fontHeadlineSmall')?.innerText ||
      card.querySelector('.qBF1Pd')?.innerText ||
      card.querySelector('[role="heading"]')?.innerText ||
      ''
    ).trim();
    if (!name || !url) return null;

    // Dedup by URL
    const id = url.split('?')[0];
    if (this.processedIds.has(id)) return null;
    this.processedIds.add(id);

    // Rating & reviews
    const rating  = card.querySelector('.MW4etd')?.innerText?.trim() || 'N/A';
    const reviews = card.querySelector('.UY7F9')?.innerText?.replace(/[()]/g, '').trim() || '0';

    // Category & address (from subtitle spans)
    let category = 'N/A', address = 'N/A';
    card.querySelectorAll('.W4E7P, .AJ7S2, .Ua67Yy, .lqhpnc, .rllt__details div').forEach(el => {
      const t = el.innerText?.trim() || '';
      if (!t) return;
      if (t.includes('·')) { address = t; }
      else if (category === 'N/A' && !t.match(/^\d/) && t.length > 2) { category = t; }
    });

    // Website
    const websiteEl = card.querySelector(
      'a[aria-label*="Website"], a[aria-label*="웹사이트"], a[data-item-id="authority"], a.lcr4fd'
    );
    const website = websiteEl?.href || 'N/A';

    // Phone (regex from full card text)
    const phoneMatch = (card.innerText || '').match(
      /(\+?\d[\d\s\-().]{6,18}\d)/
    );
    const phone = phoneMatch ? phoneMatch[0].trim() : 'N/A';

    // PlaceId from URL
    const pidMatch = url.match(/!1s([^!]+)!/);
    const placeId  = pidMatch ? pidMatch[1] : id;

    return { name, url, placeId, rating, reviews, category, address, website, phone };
  }

  // ── Scrape Currently Visible Cards ───────────────────────────
  _scrapeCards() {
    if (!this.active) return 0;

    const cardSelectors = [
      'div[role="article"]',
      '.Nv2Ybe', '.THS69c', '.lqhpnc',
      '.VkpSff', '.hQ9O4b',
    ];
    const cards = document.querySelectorAll(cardSelectors.join(','));
    let newCount = 0;

    cards.forEach(card => {
      const data = this._extractCardData(card);
      if (!data) return;
      newCount++;
      this.totalLeads++;
      sendToXpider({ action: 'foundBusiness', data });
    });

    if (newCount > 0) {
      console.log(`[SCRAPER] +${newCount} new leads (session total: ${this.totalLeads})`);
      sendToXpider({ action: 'cruiserUpdate', data: { newLeads: this.totalLeads } });
    }
    return newCount;
  }

  // ══════════════════════════════════════════════════════════════
  // _getScrollContainer: 실제 스크롤 가능한 컨테이너 탐색
  // ══════════════════════════════════════════════════════════════
  _getScrollContainer() {
    // 0순위: 현재 화면에 보이는 비즈니스 카드의 직계 부모 체인 탐색 (가장 확실함)
    const card = document.querySelector('div[role="article"], .Nv2Ybe, .THS69c, .Ua67Yy');
    if (card) {
      let curr = card.parentElement;
      for (let i = 0; i < 10 && curr && curr !== document.body; i++) {
        const s = window.getComputedStyle(curr);
        if ((s.overflowY === 'auto' || s.overflowY === 'scroll') && curr.scrollHeight > curr.clientHeight) {
          console.log('[SCRAPER] Found container via card parent chain:', curr.className?.substring(0, 50));
          return curr;
        }
        curr = curr.parentElement;
      }
    }

    // 1순위: role="feed" 자체가 스크롤 가능한지 확인
    const feed = document.querySelector('div[role="feed"]');
    if (feed && feed.scrollHeight > feed.clientHeight) return feed;

    // 2순위: feed의 부모 체인 탐색
    if (feed) {
      let parent = feed.parentElement;
      for (let i = 0; i < 6 && parent; i++) {
        if (parent.scrollHeight > parent.clientHeight) return parent;
        parent = parent.parentElement;
      }
    }

    // 3순위: 알려진 클래스명 및 속성
    const candidates = [
      '.m6QErb.DxyBCb.klm67c',
      'div[aria-label*="Results for"]',
      'div[aria-label*="결과"]',
      '.m6QErb[tabindex="-1"]',
      '#qa0fg', // 특정 버전 ID
    ];
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (el && el.scrollHeight > el.clientHeight) return el;
    }

    // 4순위: 최후의 수단 - 가장 큰 스크롤 가능한 영역
    const allDivs = [...document.querySelectorAll('div')];
    const scrollable = allDivs
      .filter(d => {
        const s = window.getComputedStyle(d);
        return (s.overflowY === 'auto' || s.overflowY === 'scroll') &&
               d.scrollHeight > d.clientHeight + 100 &&
               d.clientWidth > 200 && d.clientWidth < 800;
      })
      .sort((a, b) => b.scrollHeight - a.scrollHeight);

    if (scrollable.length > 0) return scrollable[0];

    return null;
  }

  // ══════════════════════════════════════════════════════════════
  // waitUntilFinished: 맨 아래까지 스크롤하며 모든 항목 수집
  // ══════════════════════════════════════════════════════════════
  async waitUntilFinished() {
    if (this.collecting) return;
    this.collecting = true;

    // HUD 업데이트 (크루저가 실행 중인 경우)
    if (typeof cruiser !== 'undefined' && cruiser.hud) {
      cruiser.hud.update({ status: 'SCROLLING...' });
    }

    console.log('[SCRAPER] >>> Waiting for results to scroll...');
    
    let container = null;
    for (let i = 0; i < 8; i++) {
      container = this._getScrollContainer();
      if (container) break;
      await sleep(500);
    }

    if (!container) {
      console.error('[SCRAPER] ❌ SCROLL CONTAINER NOT FOUND. Diagnosing DOM...');
      const scrollableEls = [...document.querySelectorAll('div')].filter(d => {
        const s = window.getComputedStyle(d);
        return (s.overflowY === 'auto' || s.overflowY === 'scroll') && d.scrollHeight > d.clientHeight;
      });
      console.warn(`[SCRAPER] 스크롤 가능 요소 ${scrollableEls.length}개:`,
        scrollableEls.slice(0, 5).map(d => `${d.className?.substring(0,30)} scrollH=${d.scrollHeight} clientH=${d.clientHeight}`)
      );
      this.collecting = false;
      return;
    }

    console.log(`[SCRAPER] ✅ Container: "${container.className?.substring(0,50)}" scrollH=${container.scrollHeight} clientH=${container.clientHeight} tabindex=${container.tabIndex}`);

    // 포커스 주기 (이벤트 수신 확률 높임)
    container.focus();
    
    let lastHeight = container.scrollHeight;
    let lastCount = this.processedIds.size;
    let stagnant = 0;
    let round = 0;

    while (this.active && round < 100) {
      round++;
      
      // 스크롤 수행 (4단계 - 초강력 콤보)
      container.dispatchEvent(new WheelEvent('wheel', { deltaY: 800, bubbles: true }));
      container.scrollBy({ top: 800, behavior: 'smooth' });
      container.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', keyCode: 34, bubbles: true }));
      container.scrollTop = container.scrollHeight;

      await sleep(1000);
      
      this._scrapeCards();

      const progress = Math.min(100, Math.round(
        (container.scrollTop / Math.max(1, container.scrollHeight - container.clientHeight)) * 100
      ));
      console.log(`[SCRAPER] 📊 Round ${round} | scroll=${container.scrollTop}/${container.scrollHeight} | ${progress}% | leads=${this.totalLeads}`);
      
      if (this._isEndOfList(container)) {
        console.log('[SCRAPER] ✅ "마지막 항목" 감지 — 수집 완료!');
        break;
      }

      const h = container.scrollHeight;
      const c = this.processedIds.size;
      
      if (h === lastHeight && c === lastCount) {
        stagnant++;
        console.log(`[SCRAPER] ⏸ Stagnant ${stagnant}/5 | scrollH변화없음=${h} leads변화없음=${c}`);
        if (stagnant >= 5) {
          // 강제 자극: 살짝 위로 올렸다가 다시 바닥으로
          container.scrollTop -= 300;
          await sleep(500);
          container.scrollTop = container.scrollHeight + 500;
          await sleep(1500);
          if (container.scrollHeight === h && this.processedIds.size === lastCount) {
            console.log('[SCRAPER] 🏁 Final stagnation — 수집 완료.');
            break; 
          }
          stagnant = 0;
        }
      } else {
        stagnant = 0;
      }
      
      lastHeight = h;
      lastCount = c;
      
      if (this.processedIds.size >= 500) break;
    }

    console.log(`[SCRAPER] 🏁 Collection complete. Total leads: ${this.totalLeads}`);
    this.collecting = false;
    sendToXpider({ action: 'scrapingFinished', totalLeads: this.totalLeads });
  }

  _isEndOfList(container) {
    const text = (container?.innerText || document.body.innerText || '').toLowerCase();
    const markers = [
      '마지막 항목', '끝입니다', '결과가 더 없습니다', '결과가 더 없습',
      '더 이상 결과가 없습니다', '마지막 항목입니다', '결과 끝',
      'end of results', "reached the end", 'no more results',
      'you have reached the end', 'fin de la liste', 'no hay más resultados'
    ];
    if (markers.some(m => text.includes(m.toLowerCase()))) return true;

    // 바닥 도달 체크 (로딩 중이 아니어야 함)
    if (container) {
      const atBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 30;
      const loader = document.querySelector('.qjESne, .loading-spinner, [role="progressbar"], .Ip09S');
      if (atBottom && !loader) {
        // 바닥에서 2초간 변화 없으면 종료로 간주
        return false; // 실제 stagnation 로직에서 처리하도록 유보
      }
    }
    return false;
  }

  // ── "이 지역 검색" Autopilot ──────────────────────────────────
  _startAutopilot() {
    this._autopilotTimer = setInterval(() => {
      if (!this.active || this.collecting) return;
      this.forceSearchThisArea();
    }, 3000);
  }

  async forceSearchThisArea() {
    const TEXTS = [
      'Search this area', '이 지역 검색', '현재 화면에서 검색',
      '현재 지도에서 검색', 'Search here', 'このエリアを検索',
      '여기 검색', '재검색', 'Redo search here', '재검색하기',
      'Buscar en esta área', 'Rechercher ici', 'Hier suchen',
      '이 영역 검색', '지도에서 검색',
    ];

    const click = (el) => {
      ['mousedown','mouseup','click'].forEach(type =>
        el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }))
      );
      console.log('[SCRAPER] ✔ Clicked search button:', el.innerText?.trim() || el.getAttribute('aria-label') || el.tagName);
      return true;
    };

    // Attempt 1: CSS selectors (fastest)
    const CSS = [
      'button.NlVald', 'button.X69Czc', '.Hz7p5c button', '.L6Bbsd',
      'button[aria-label*="이 지역"]', 'button[aria-label*="Search this"]',
      'button[aria-label*="Redo search"]', 'button[jsaction*="searchThisArea"]',
      '[role="button"][aria-label*="이 지역"]', 'div.s6Hshc button',
      '.search-here-button', '.YzWBM button', 'button[jsaction*="dg_search"]',
    ];
    for (const sel of CSS) {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null) return click(el);
    }

    // Attempt 2: Text walk
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.offsetParent === null) continue;
      const t = (node.innerText || node.textContent || '').trim();
      if (!t || t.length > 40) continue;
      if (TEXTS.some(tx => t.includes(tx))) {
        const btn = node.closest('button,[role="button"]') || (node.tagName === 'BUTTON' ? node : null);
        if (btn) return click(btn);
      }
    }

    return false;
  }

  extractPlaceId(url) {
    const m = url.match(/!1s([^!]+)!/);
    return m ? m[1] : url;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// BING SCRAPER (unchanged, lightweight)
// ═══════════════════════════════════════════════════════════════════════
class BingMapsBulletproofScraper {
  constructor() {
    this.active = false;
    this.processedIds = new Set();
    this.totalLeads   = 0;
  }
  start() {
    this.active = true;
    this._timer = setInterval(() => this._scrape(), 2000);
  }
  stop() {
    this.active = false;
    clearInterval(this._timer);
    sendToXpider({ action: 'scrapingFinished', totalLeads: this.totalLeads });
  }
  _scrape() {
    if (!this.active) return;
    document.querySelectorAll('.listingContent_fjvwG,.b_split_card,.bm_listing_card').forEach((card, i) => {
      const nameEl = card.querySelector('h3,.title,.name');
      if (!nameEl) return;
      const key = nameEl.innerText.trim() + i;
      if (this.processedIds.has(key)) return;
      this.processedIds.add(key);
      this.totalLeads++;
      sendToXpider({
        action: 'foundBusiness',
        data: {
          name: nameEl.innerText.trim(),
          url: window.location.href,
          placeId: 'bing_' + Date.now() + '_' + i,
          rating: card.querySelector('.ovr_star,[aria-label*="star"]')?.innerText || 'N/A',
          reviews: 'N/A',
          address: card.querySelector('.address,[class*="address"]')?.innerText || 'N/A',
          phone: (card.innerText.match(/(\+?\d[\d\s\-().]{6,18}\d)/) || ['N/A'])[0],
          website: card.querySelector('a[aria-label*="Website"],a[href*="http"]:not([href*="bing.com"])')?.href || 'N/A',
        }
      });
    });
  }
  async forceSearchThisArea() { return false; }
  async waitUntilFinished() {}
}

// ═══════════════════════════════════════════════════════════════════════
// INIT SCRAPER
// ═══════════════════════════════════════════════════════════════════════
let scraper = window.location.href.includes('bing.com/maps')
  ? new BingMapsBulletproofScraper()
  : new GMapsBulletproofScraper();

// ═══════════════════════════════════════════════════════════════════════
// MISSION HUD (Heads-Up Display on the map)
// ═══════════════════════════════════════════════════════════════════════
class MissionHUD {
  constructor() { this.el = null; }

  create() {
    if (this.el) return;
    this.el = Object.assign(document.createElement('div'), {
      id: 'xpider-hud',
      innerHTML: `
        <div style="font-weight:bold;border-bottom:1px solid #0f0;margin-bottom:8px;font-size:13px;">⚡ XPIDER AUTOCRUISER</div>
        <div style="font-size:11px;line-height:1.8;">
          STATUS <span id="h-status" style="color:#fff">ACTIVE</span><br>
          DIR    <span id="h-dir"    style="color:#fff">—</span><br>
          DIST   <span id="h-dist"   style="color:#fff">0.00 Mi</span><br>
          LEADS  <span id="h-leads"  style="color:#0f8;font-size:14px;font-weight:bold">0</span><br>
          STREAK <span id="h-streak" style="color:#ff0">0</span>
        </div>
      `,
    });
    Object.assign(this.el.style, {
      position: 'fixed', top: '16px', right: '72px',
      background: 'rgba(0,0,0,0.88)', color: '#0f0',
      padding: '12px 16px', borderRadius: '10px',
      border: '1px solid #0f0', boxShadow: '0 0 12px #0f04',
      fontFamily: 'monospace', zIndex: '999999',
      minWidth: '210px', pointerEvents: 'none', lineHeight: '1.5',
    });
    document.body.appendChild(this.el);
  }

  set(id, val) {
    if (!this.el || val === undefined) return;
    const el = document.getElementById(id);
    if (el) el.innerText = val;
  }

  update({ status, direction, distance, newLeads, streak } = {}) {
    this.set('h-status', status);
    this.set('h-dir',    direction);
    this.set('h-dist',   distance !== undefined ? `${distance.toFixed(2)} Mi` : undefined);
    this.set('h-leads',  newLeads);
    this.set('h-streak', streak);
  }

  destroy() { this.el?.remove(); this.el = null; }
}

// ═══════════════════════════════════════════════════════════════════════
// MAP CRUISER — AutoCruiser Pro
// ═══════════════════════════════════════════════════════════════════════
class MapCruiser {
  constructor() {
    this.active      = false;
    this.hud         = new MissionHUD();
    this.stepSize    = 9.0;   // miles
    this.range       = 5;     // miles
    this.speedMult   = 0.3;
    this.dist        = 0;
    this.direction   = 1;
    this.lineSteps   = 0;
    this.totalLines  = 0;
    this.noResStreak = 0;
  }

  start(config = {}) {
    if (this.active) return;
    this.active    = true;
    this.stepSize  = config.stepSize  || 9.0;
    this.range     = config.range     || 5;
    this.speedMult = config.speedMult || 0.3;
    this.dist = this.lineSteps = this.totalLines = this.noResStreak = 0;
    this.direction = 1;

    this.hud.create();
    this.hud.update({ status: 'ACTIVE', direction: 'EAST', newLeads: 0, streak: 0 });

    // Signal renderer to start hardware drag engine
    sendToXpider({ action: 'startHardwareCruiser', config });

    this._loop();
  }

  stop() {
    this.active = false;
    this.hud.destroy();
    sendToXpider({ action: 'stopHardwareCruiser' });
    sendToXpider({ action: 'cruiserStopped' });
    console.log('[CRUISER] Stopped. Leads this session:', scraper?.totalLeads ?? 0);
  }

  _delay() {
    // 0.1x → 80s, 0.3x → 26.7s, 1.0x → 8s, 3.0x → 2.7s
    return Math.max(2000, 8000 / Math.min(this.speedMult, 3.0));
  }

  async _loop() {
    console.log('[CRUISER] Starting main cruise loop...');
    
    while (this.active) {
      // ── 1. MOVE: Trigger hardware drag ──
      const isStart = (this.lineSteps === 0 && this.totalLines === 0);
      if (!isStart) {
        this.dist += this.stepSize;
        this.lineSteps++;
        this.hud.update({ status: 'MOVING...' });
        sendToXpider({ action: 'performHardwareMove', direction: 'HORIZONTAL' });
        await sleep(2000); // Wait for drag to finish
      } else {
        // First time: just initialize
        this.lineSteps = 1; 
      }

      const dir = this.direction > 0 ? 'EAST' : 'WEST';
      const leads = scraper?.totalLeads ?? 0;
      this.hud.update({ status: 'ACTIVE', direction: dir, distance: this.dist, newLeads: leads, streak: this.noResStreak });
      sendToXpider({ action: 'cruiserUpdate', data: { direction: dir, distance: this.dist, newLeads: leads } });

      if (!this.active) break;

      // ── 2. SEARCH ──
      this.hud.update({ status: 'SEARCHING...' });
      await scraper.forceSearchThisArea();
      await sleep(2500); 

      // ── 3. ULTRA COLLECT: scroll to bottom & harvest ALL cards ──
      if (scraper.active) {
        this.hud.update({ status: 'COLLECTING...' });
        await scraper.waitUntilFinished();
      }

      // ── 4. Ocean / No-results detection ──
      const zone = this._detectEmptyZone();
      if (zone) {
        this.noResStreak++;
        this.hud.update({ status: zone, streak: this.noResStreak });
      } else {
        this.noResStreak = 0;
      }

      // ── 5. Reversal / South Turn ──
      const thresh = zone === 'OCEAN' ? 2 : 3;
      if (this.noResStreak >= thresh) {
        this.noResStreak = 0;
        this.lineSteps = 0;
        this.hud.update({ status: 'REVERSING' });
        sendToXpider({ action: 'skipHardwareCruiserLine' });
        await sleep(4000);
        continue;
      }

      if (this.lineSteps * this.stepSize >= this.range) {
        this.lineSteps = 0;
        this.totalLines++;
        this.hud.update({ status: 'TURNING SOUTH' });
        sendToXpider({ action: 'performHardwareMove', direction: 'SOUTH' });
        await sleep(4000);
      }

      // ── 6. Speed Delay ──
      const waitTime = this._delay();
      this.hud.update({ status: 'WAITING...' });
      await sleep(waitTime);
    }
  }

  _detectEmptyZone() {
    const cards = document.querySelectorAll('div[role="article"],.Nv2Ybe,.THS69c');
    if (cards.length > 0) return null;

    const txt = document.body.innerText;
    if (/\bOcean\b|\bSea\b|바다|해상|대양|海洋|Oceano|Océan|Meer/i.test(txt)) return 'OCEAN';
    if (/찾을 수 없|결과가 없|No results|can't find|No places found/i.test(txt))  return 'EMPTY';

    const btn = document.querySelector('button.NlVald,button.X69Czc,button[aria-label*="이 지역"]');
    if (btn && btn.offsetParent !== null) return 'EMPTY';

    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// INIT CRUISER
// ═══════════════════════════════════════════════════════════════════════
const cruiser = new MapCruiser();

// ═══════════════════════════════════════════════════════════════════════
// MESSAGE DISPATCHER
// ═══════════════════════════════════════════════════════════════════════
function dispatch(req) {
  if (!req?.action) return;
  console.log('[XPIDER] dispatch:', req.action);

  switch (req.action) {
    case 'start':
      scraper.start();
      // 즉시 스크롤 수집 시도 (이미 검색 결과가 있는 경우 대응)
      setTimeout(() => scraper.waitUntilFinished(), 1000);
      break;
    case 'stop':
      scraper.stop();
      break;
    case 'startCruiser':
      if (!scraper.active) scraper.start();
      cruiser.start({
        range:     req.range     ?? 5,
        stepSize:  req.stepSize  ?? 9.0,
        speedMult: req.speedMult ?? 0.3,
      });
      break;
    case 'stopCruiser':
      cruiser.stop();
      scraper.stop();
      break;
  }
}

// Chrome extension runtime listener
if (typeof chrome !== 'undefined' && chrome?.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener(req => dispatch(req));
}

// XPIDER postMessage listener (bridge)
window.addEventListener('message', e => {
  if (e.data?.type === 'XPIDER_CONTENT_MSG') dispatch(e.data.message);
});

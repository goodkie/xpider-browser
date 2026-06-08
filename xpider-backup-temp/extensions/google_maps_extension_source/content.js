// ─── XPIDER EXCLUSIVE SECURE LOCK (UI Script) ───────────────────────────
(function _initSecureLock() {
  function lockExtensionForever() {
    console.error('[SECURITY] This extension is exclusively compiled for XPIDER Browser. Termination sequence initiated.');
    if (typeof document !== 'undefined') {
      const injectWarning = () => {
        if (document.getElementById('xpider-unauthorized-overlay')) return;
        const overlay = document.createElement('div');
        overlay.id = 'xpider-unauthorized-overlay';
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100vw';
        overlay.style.height = '100vh';
        overlay.style.backgroundColor = '#1a0000';
        overlay.style.color = '#ff3333';
        overlay.style.display = 'flex';
        overlay.style.flexDirection = 'column';
        overlay.style.justifyContent = 'center';
        overlay.style.alignItems = 'center';
        overlay.style.zIndex = '2147483647';
        overlay.style.fontFamily = 'sans-serif';
        overlay.style.fontSize = '16px';
        overlay.style.fontWeight = 'bold';
        overlay.style.textAlign = 'center';
        overlay.style.padding = '20px';
        overlay.style.boxSizing = 'border-box';
        overlay.innerHTML = `
          <div style="border: 2px solid #ff3333; padding: 25px; border-radius: 8px; background-color: #000; box-shadow: 0 0 15px rgba(255,0,0,0.5); max-width: 100%;">
            <h2 style="margin: 0 0 15px 0; font-size: 20px; color: #ff3333;">⚠️ [SECURITY BLOCK]</h2>
            <p style="margin: 0 0 10px 0; line-height: 1.4; font-size: 13px;">Unauthorized browser environment detected.</p>
            <p style="margin: 0 0 15px 0; font-size: 11px; color: #aaaaaa; line-height: 1.4;">This premium extension is exclusively designed to run inside the official XPIDER Browser.</p>
            <div style="font-size: 10px; color: #666; line-height: 1.4;">Use on standard Chromium browsers (Chrome, Edge, Whale) is strictly restricted.</div>
          </div>
        `;
        document.body ? document.body.prepend(overlay) : document.documentElement.prepend(overlay);
      };
      if (document.body) { injectWarning(); } else { document.addEventListener('DOMContentLoaded', injectWarning); }
    }
    const blockError = () => { throw new Error('XPIDER SECURE LOCK: UNAUTHORIZED BROWSER ENV.'); };
    setInterval(blockError, 50);
  }

  let verified = false;
  function tryLocalFileFallback() {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
        const tokenUrl = chrome.runtime.getURL('security-token.json');
        fetch(tokenUrl)
          .then(r => r.json())
          .then(data => {
            if (data && data.token === 'XPIDER_SECURE_SESSION_v4_17_5') {
              verified = true;
              console.log('[SECURITY] XPIDER 3-Layer Host verified via Local File Fallback.');
            } else {
              lockExtensionForever();
            }
          })
          .catch(() => { lockExtensionForever(); });
      } else {
        lockExtensionForever();
      }
    } catch(e) { lockExtensionForever(); }
  }

  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      const safetyTimeout = setTimeout(() => { if (!verified) tryLocalFileFallback(); }, 300);
      chrome.runtime.sendMessage({ action: 'xpider-check-security-status' }, (response) => {
        clearTimeout(safetyTimeout);
        if (response && response.verified === true) {
          verified = true;
          console.log('[SECURITY] XPIDER 3-Layer Host verified via Background.');
        } else {
          tryLocalFileFallback();
        }
      });
    } else {
      tryLocalFileFallback();
    }
  } catch(e) { lockExtensionForever(); }
})();
// ─── END XPIDER EXCLUSIVE SECURE LOCK ──────────────────────────────────────

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
    
    // [강화된 로직] 맵 드래그 등으로 새로운 검색 결과가 로드되면, 맨 아래까지 차례로 자동 스크롤 트리거
    if (!this.collecting) {
        setTimeout(() => {
            if (this.active && !this.collecting) {
                console.log('[SCRAPER] 새 검색 결과 감지 -> 차례로 자동 스크롤 시작!');
                this.waitUntilFinished();
            }
        }, 2000); // 새 결과가 렌더링될 시간을 충분히 줌
    }
  }

  _onFeedChanged() {
    // Lightweight immediate scrape on DOM change
    this._scrapeCards();
    
    // [강화] 수동 맵 드래그 시 피드 내용이 바뀌면 자동으로 맨아래까지 스크롤하도록 연계
    if (this.active && !this.collecting) {
        clearTimeout(this._scrollDebounce);
        this._scrollDebounce = setTimeout(() => {
            if (this.active && !this.collecting) {
                console.log('[SCRAPER] 리스트 업데이트 감지 -> 차례로 자동 스크롤 시작!');
                this.waitUntilFinished();
            }
        }, 1500);
    }
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
    if (!link) {
        // console.debug('[SCRAPER-DEBUG] No link found in card', card.className);
        return null;
    }

    const url  = link.href || '';
    const name = (
      card.querySelector('.fontHeadlineSmall')?.innerText ||
      card.querySelector('.qBF1Pd')?.innerText ||
      card.querySelector('[role="heading"]')?.innerText ||
      card.getAttribute('aria-label') ||
      ''
    ).trim();
    
    if (!name || !url) {
        console.warn('[SCRAPER] Missing name or url:', { name, url });
        return null;
    }

    // Dedup by URL
    const id = url.split('?')[0];
    if (this.processedIds.has(id)) return null;
    this.processedIds.add(id);

    // Rating & reviews
    const rating  = card.querySelector('.MW4etd')?.innerText?.trim() || 'N/A';
    const reviews = card.querySelector('.UY7F9, .fontBodyMedium .e4rVHe .muMOJe')?.innerText?.replace(/[()]/g, '').trim() || '0';

    // Category & address (from subtitle spans)
    let category = 'N/A', address = 'N/A';
    const subLines = card.querySelectorAll('.W4E7P, .AJ7S2, .Ua67Yy, .lqhpnc, .rllt__details div, .W4Efsd span');
    subLines.forEach(el => {
      const t = el.innerText?.trim() || '';
      if (!t || t.length < 2) return;
      if (t.includes('·')) { 
          // address often contains dots or follows a dot
          const parts = t.split('·');
          if (parts[1]) address = parts[1].trim();
      } else if (category === 'N/A' && !t.match(/^\d/) && t.length > 2) { 
          category = t; 
      } else if (t.match(/\d+/) && address === 'N/A') {
          address = t;
      }
    });

    // Website - Google Maps List view now hides Website button often.
    const websiteEl = card.querySelector(
      'a[aria-label*="Website"], a[aria-label*="웹사이트"], a[data-item-id="authority"], a.lcr4fd'
    );
    const website = websiteEl?.href || 'N/A';

    // Phone
    const phoneMatch = (card.innerText || '').match(/(\+?\d[\d\s\-().]{6,18}\d)/);
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
      '.Nv2PK', '.THOPZb', '.CpccDe', // New selectors from 2026 UI
      '.Nv2Ybe', '.THS69c', '.lqhpnc',
      '.VkpSff', '.hQ9O4b',
    ];
    const cards = document.querySelectorAll(cardSelectors.join(','));
    let newCount = 0;

    if (cards.length === 0) {
        console.debug('[SCRAPER] No cards found with current selectors.');
    }

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
    // 1. role="feed" (가장 표준적인 결과 목록 영역)
    const feed = document.querySelector('div[role="feed"]');
    if (feed && feed.scrollHeight > feed.clientHeight) return feed;

    // 2. 검색결과 카드들의 공통 부모를 역추적 (가장 확실한 방법)
    const card = document.querySelector('div[role="article"], .Nv2Ybe, .THS69c, .Ua67Yy');
    if (card) {
      let el = card.parentElement;
      for (let i = 0; i < 15 && el && el !== document.body; i++) {
        const st = window.getComputedStyle(el);
        if ((st.overflowY === 'auto' || st.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 20) {
          console.log('[SCRAPER] Found scroll container via parent chain:', el.className?.substring(0, 30));
          return el;
        }
        el = el.parentElement;
      }
    }

    // 3. 알려진 클래스명 및 속성
    const candidates = [
      '.m6QErb.DxyBCb.klm67c',
      'div[aria-label*="Results for"]',
      'div[aria-label*="결과"]',
      '.m6QErb[tabindex="-1"]',
    ];
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (el && el.scrollHeight > el.clientHeight) return el;
    }

    return null;
  }

  // ══════════════════════════════════════════════════════════════
  // waitUntilFinished: 맨 아래까지 스크롤하며 모든 항목 수집
  // ══════════════════════════════════════════════════════════════
  async waitUntilFinished() {
    if (this.collecting) return;
    this.collecting = true;

    // ★ [핵심 수정] 컨테이너 검색 전 바다/빈 구역 사전 검사
    // 바다 위에서는 어떤 컨테이너도 찾을 필요 없이 즉시 반환
    if (typeof cruiser !== 'undefined') {
      const preCheck = cruiser._detectEmptyZone();
      if (preCheck) {
        console.log(`[SCRAPER] 🚫 Pre-check: ${preCheck} detected — skipping collection loop instantly.`);
        this.collecting = false;
        return;
      }
    }

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
      
      const step = Math.max(container.clientHeight * 0.8, 600);
      container.dispatchEvent(new WheelEvent('wheel', { deltaY: step, bubbles: true }));
      container.scrollBy({ top: step, behavior: 'smooth' });
      container.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', keyCode: 40, bubbles: true }));

      await sleep(1000);
      
      const newFound = this._scrapeCards();

      // [조기 종료 강화] 첫 라운드에서 결과가 없고 "결과 없음" 텍스트가 명확하면 즉시 종료
      if (round === 1 && this.processedIds.size === lastCount) {
         const emptyZone = cruiser._detectEmptyZone();
         if (emptyZone) {
            console.log(`[SCRAPER] ⚡ Early exit: ${emptyZone} detected in round 1`);
            break;
         }
      }

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
        
        // [강화] 데이터가 아예 없는 상태에서의 정체는 더 빨리 포기
        const emptyThresh = (c === 0) ? 2 : 5;
        if (stagnant >= emptyThresh) {
          if (c === 0) {
              console.log('[SCRAPER] 🏁 No data stagnant exit.');
              break;
          }
          // 데이터가 있는 경우만 강제 자극 시도
          container.scrollBy({ top: -400, behavior: 'smooth' });
          await sleep(500);
          container.scrollBy({ top: 600, behavior: 'smooth' });
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
    const SELS = [
      'button.NlVald', 
      'button.X69Czc', 
      'button[jsaction*="searchThisArea"]',
      'button[aria-label*="이 지역 검색"]',
      'button[aria-label*="Search this area"]'
    ];

    const click = (el) => {
      ['mousedown','mouseup','click'].forEach(type =>
        el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }))
      );
      console.log('[SCRAPER] ✔ Clicked Search Button:', el.innerText?.trim() || el.tagName);
      return true;
    };

    for (const sel of SELS) {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null) {
        // 평점 버튼 오클릭 방지: 화면 상단 중앙 영역인지 확인
        const rect = el.getBoundingClientRect();
        if (rect.top < 200) return click(el);
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
    this.targetSteps = 0;  // 방향 반전 후 이동해야 할 목표 스텔 수
  }

  start(config = {}) {
    if (this.active) return;
    this.active    = true;
    this.stepSize  = config.stepSize  || 9.0;
    this.range     = config.range     || 5;
    this.speedMult = config.speedMult || 0.3;
    this.dist = this.lineSteps = this.totalLines = this.noResStreak = this.targetSteps = 0;
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
    const base = Math.max(2000, 8000 / Math.min(this.speedMult, 3.0));
    // ★ [핵심 수정] 빈 구역 연속 감지 중에는 딜레이를 최소화 (빠른 스킵을 위해)
    if (this.noResStreak > 0) return 2000;
    return base;
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
        // ★ [핀스] 현재 this.direction 값을 메시지에 포함하여 렌더러에서 직접 사용
        sendToXpider({ action: 'performHardwareMove', direction: 'HORIZONTAL', cruiserDir: this.direction });
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
      // ★ targetSteps: 방향 반전 후 채워야 할 스텝 수 (이전 줄 스텝 수)
      //    targetSteps > 0 이면 아직 "반전 귀환" 중이므로 감지 건너뜀
      if (this.targetSteps > 0 && this.lineSteps < this.targetSteps) {
        // 귀환 중 — noResStreak 초기화하고 감지 스킵
        this.noResStreak = 0;
        this.hud.update({ status: `↩ RETURNING (${this.lineSteps}/${this.targetSteps})`, streak: 0 });
        // Speed Delay 스킵 없이 계속 이동
        const waitTime = this._delay();
        await sleep(waitTime);
        continue;
      }
      // 목표 스텝에 도달했으면 targetSteps 초기화
      if (this.targetSteps > 0 && this.lineSteps >= this.targetSteps) {
        console.log(`[CRUISER] ✅ Return complete (${this.lineSteps} steps). Resuming normal scan.`);
        this.targetSteps = 0;
      }

      const zone = this._detectEmptyZone();
      if (zone) {
        this.noResStreak++;
        this.hud.update({ status: zone, streak: this.noResStreak });
      } else {
        this.noResStreak = 0;
      }

      // ── 5. 다음 줄 이동 판정 (바다/빈 구역 3회 연속) ──
      const thresh = 3;
      if (this.noResStreak >= thresh) {
        // ★ 이전 줄에서 이동한 스텝 수를 기억 (반전 후 동일 거리 진행)
        const prevSteps = this.lineSteps;
        this.noResStreak = 0;
        this.lineSteps = 0;
        this.totalLines++;

        // 방향 반전
        this.direction *= -1;
        const newDir = this.direction > 0 ? 'EAST' : 'WEST';
        const skipMsg = zone === 'OCEAN'
          ? `🌊 바다 ${thresh}회 감지 — ${newDir}으로 반전 (목표: ${prevSteps}스텝)`
          : `⚠️ 빈구역 ${thresh}회 감지 — ${newDir}으로 반전 (목표: ${prevSteps}스텝)`;
        console.log(`[CRUISER] ${skipMsg}`);

        // 반전 후 이전 줄 스텝 수만큼 이동할 목표 설정
        this.targetSteps = prevSteps;

        this.hud.update({
          status: zone === 'OCEAN' ? '🌊 REVERSE+SOUTH' : '⚠️ REVERSE+SOUTH',
          direction: newDir, streak: 0
        });

        // renderer에 방향 반전 + 남쪽 이동 신호를 전송 (newDirection 포함)
        sendToXpider({ action: 'reverseAndMoveSouth', newDirection: this.direction });
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
    const cards = document.querySelectorAll('div[role="article"],.Nv2Ybe,.THS69c,.Nv2PK,.O099S');
    const txt = (document.body.innerText || '').toLowerCase();
    const html = (document.body.innerHTML || '').toLowerCase();
    
    // ── 1. 비즈니스 카드 존재 확인 ──
    if (cards.length > 0) {
      return null;
    }

    // ── 2. 바다/해양 텍스트 감지 (다국어 확장) ──
    const oceanRegex = /ocean|sea|gulf|bay|pacific|atlantic|mediterranean|바다|해상|대양|해양|태평양|대서양|海洋|oceano|oc\u00e9an|meer|mar\b|mer\b/i;
    if (oceanRegex.test(txt)) {
      console.log('[CRUISER] 🌊 Detection: OCEAN (via keywords)');
      return 'OCEAN';
    }

    // ── 3. 빈 결과 텍스트 감지 (다국어 확장) ──
    const noResultsRegex = /찾을 수 없|결과가 없|no results|can't find|no places found|aucun r\u00e9sultat|keine ergebnisse|no se ha|no se ha podido|no hay resultados/i;
    if (noResultsRegex.test(txt)) {
      console.log('[CRUISER] ⚠️ Detection: EMPTY (via "No Results" text)');
      return 'EMPTY';
    }

    // ── 4. 검색 버튼 존재 확인 (중요: 카드는 없는데 버튼만 떠있는 경우) ──
    const searchBtn = document.querySelector('button.NlVald, button.X69Czc, button[aria-label*="이 지역"], button[aria-label*="Search this area"], button[aria-label*="rechercher"]');
    if (searchBtn && (searchBtn.offsetParent !== null || searchBtn.offsetWidth > 0)) {
      console.log('[CRUISER] ⚠️ Detection: EMPTY (Search button visible but 0 cards)');
      return 'EMPTY';
    }

    // ── 5. HTML 인디케이터 ( water, coast 등 배경 요소 분석 ) ──
    if (html.includes('ocean') || html.includes('water-mask') || html.includes('water_layer')) {
       console.log('[CRUISER] 🌊 Detection: OCEAN (via HTML indicators)');
       return 'OCEAN';
    }

    // ── 6. 최종 판별 ──
    // 아무런 비즈니스 카드도 없고, 위 지표들도 없는데 "결과 리스트" 자체가 렌더링되지 않은 상태라면 EMPTY로 간주
    const feed = scraper._getFeed();
    if (!feed || feed.innerText.length < 50) {
        console.log('[CRUISER] ⚠️ Detection: EMPTY (No feed content found)');
        return 'EMPTY';
    }

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

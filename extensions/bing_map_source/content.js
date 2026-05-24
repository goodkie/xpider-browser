// content.js - Business Finder Pro: Bulletproof Scraper with Precision AutoCruiser (XPIDER Edition)

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
          ja: { title: 'ビジネス検索の準備ができました！', desc: 'サイドパネル의 [探索開始] ボタンをクリックしてデータを収集します。' },
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

      // Korean Address Fallback
      if (!data.address || data.address === 'N/A') {
          const krAddrRegex = /(([가-힣]+(시|도|특별자치시|특별자치도)\s+)?([가-힣]+(시|군|구)\s+)?([가-힣\d]+(읍|면|동|가|리)\s+)?([가-힣A-Za-z\d]+(로|길|대로)\s+[\d-]+|[가-힣\d]+(동|가|리|읍|면)\s+[\d-]+)(\s*번지)?(\s*,?\s*(지하\s*)?[\d가-힣A-Za-z]+(층|호|동|빌딩|센터|타워|아파트|상가|프라자|스퀘어|파크|관|단지))?(\s*[\d가-힣A-Za-z]+(호|층))?)/;
          const krMatch = card.innerText.match(krAddrRegex);
          if (krMatch) data.address = krMatch[0];
      }

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

// ── XPIDER 환경 안전 메시지 전송 ──────────────────────────────────────
// XPIDER의 Bing Maps 웹뷰에는 preload가 없어 chrome.runtime이 없을 수 있음.
// 3중 폴백 체계로 반드시 메인 프로세스에 도달하도록 보장.
function sendMessageSafe(message) {
  // Method 1: chrome.runtime 직접 호출 (Electron native extension 또는 polyfill)
  if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.sendMessage === 'function') {
    try {
      chrome.runtime.sendMessage(message);
    } catch(e) {
      // 실패 시 Method 2로 폴백
    }
  }
  // Method 2: XPIDER_BRIDGE_RELAY — ext-preload.js가 동일 윈도우 컨텍스트에 있을 때 동작
  try {
    window.postMessage({ type: 'XPIDER_BRIDGE_RELAY', message, id: null }, '*');
  } catch(e) {}
  // Method 3: 글로벌 큐에 저장 (renderer_ui.js 또는 sidepanel.js가 executeJavaScript 폴링 가능)
  try {
    window.__xpiderQueue = window.__xpiderQueue || [];
    window.__xpiderQueue.push(message);
    // 큐 최대 200개 유지
    if (window.__xpiderQueue.length > 200) window.__xpiderQueue.splice(0, window.__xpiderQueue.length - 200);
  } catch(e) {}
}

class BingMapsBulletproofScraper {
  constructor() {
    this.active = false;
    this.processedUrls = new Set();
    this.rootObserver = null;
    this.feedObserver = null;
    this._tileObserver = null;
    this._autoSearchInterval = null;
    this._dragMouseDown = null;
    this._dragMouseUp   = null;
    this.lastCount = 0;
    this.initXpiderBanner();
  }

  initXpiderBanner() {
    const lang = document.documentElement.lang.split('-')[0] || 'en';
    this.showXpiderBanner(lang);
    window.addEventListener('message', (e) => {
      if (e.data && e.data.type === 'XPIDER_EVENT' && e.data.name === 'language-change')
        this.showXpiderBanner(e.data.data.lang);
    });
  }

  showXpiderBanner(lang) {
    const existing = document.getElementById('xpider-onboarding-banner');
    if (existing) existing.remove();
    const dict = {
      ko: { title: 'Bing Maps Business Finder Ready!', desc: 'Click [Start Scraping] in the side panel.' },
      en: { title: 'Bing Maps Business Finder Ready!', desc: 'Click [Start Scraping] in the side panel.' },
    };
    const text = dict[lang] || dict['en'];
    const banner = document.createElement('div');
    banner.id = 'xpider-onboarding-banner';
    banner.innerHTML = `<div style="font-weight:800;font-size:14px;color:#f5a623;margin-bottom:4px;">XPIDER: ${text.title}</div><div style="font-size:12px;opacity:.9;">${text.desc}</div>`;
    Object.assign(banner.style, {
      position:'fixed', bottom:'30px', left:'50%', transform:'translateX(-50%)',
      backgroundColor:'#1a1a1a', color:'white', padding:'15px 25px', borderRadius:'12px',
      boxShadow:'0 10px 40px rgba(0,0,0,.6)', zIndex:'10001', textAlign:'center',
      border:'1px solid #f5a623', pointerEvents:'none'
    });
    document.body.appendChild(banner);
    setTimeout(() => { banner.style.transition='opacity 1s'; banner.style.opacity='0'; setTimeout(() => banner.remove(), 1000); }, 6000);
  }

  start() {
    if (this.active) return;
    this.active = true;
    console.log('[BING] Business Finder: Started');
    this.watchListingContainer();
    this.startAutoSearchLoop();
  }

  stop() {
    this.active = false;
    if (this.rootObserver)  this.rootObserver.disconnect();
    if (this.feedObserver)  this.feedObserver.disconnect();
    if (this._tileObserver) this._tileObserver.disconnect();
    if (this._autoSearchInterval) clearInterval(this._autoSearchInterval);
    if (this._dragMouseDown) document.removeEventListener('mousedown', this._dragMouseDown, true);
    if (this._dragMouseUp)   document.removeEventListener('mouseup',   this._dragMouseUp,   true);
    console.log('[BING] Business Finder: Stopped.');
  }

  // ── 리스팅 컨테이너 감시 (Body 전체 감시로 강화) ──
  watchListingContainer() {
    if (this.rootObserver) this.rootObserver.disconnect();
    
    this.rootObserver = new MutationObserver((mutations) => {
      if (!this.active) return;
      // 너무 빈번한 호출 방지 (Debounce 효과)
      if (this._scrapeTimer) clearTimeout(this._scrapeTimer);
      this._scrapeTimer = setTimeout(() => {
        this.scrapeVisibleCards();
        this.scrapeEntityPanel();
      }, 500);
    });

    this.rootObserver.observe(document.body, { childList: true, subtree: true });
    console.log('[BING-POWER] Deep Body Observer engaged.');
    
    // 초기 실행
    this.scrapeVisibleCards();
    this.scrapeEntityPanel();
  }

  // ── 카드 스크랩 — 실제 Bing Maps DOM 구조 기반 (다중 폴백 셀렉터) ──
  // ── 패널 고속 로딩 동적 폴링 대기 (초고속 딥서치 엔진) ──
  async waitForPanelUpdate(targetName) {
    const PANEL_SELS = [
      '.singleEntityWrapper_srJlN', '.b_magInfoCard.b_isf', '.b_magInfoCard', '#bnp_content', '.entity-page', 
      '[class*="entityPanel"]', '[class*="overlayPanel"]', '[class*="sidePanel"]', 
      '[class*="detailPanel"]', '.b_entityTP', '#b_context'
    ];
    let waitTime = 0;
    while (waitTime < 2500) { // 최대 2.5초 대기 (실제론 0.1~0.3초 컷)
      for (const sel of PANEL_SELS) {
        const panel = document.querySelector(sel);
        if (panel && panel.offsetParent !== null) {
           const nameEl = panel.querySelector('h2, h1, [class*="title"], [class*="name"], [class*="entityName"]');
           const panelName = (nameEl ? nameEl.innerText : '').trim().split('\n')[0];
           if (panelName && (panelName.includes(targetName) || targetName.includes(panelName))) {
               return true; // 로딩 확인! 즉시 통과
           }
        }
      }
      await this.sleep(100); // 100ms 간격 초정밀 폴링
      waitTime += 100;
    }
    return false;
  }

  // ── 카드 스크랩 — 실제 Bing Maps DOM 구조 기반 (다중 폴백 셀렉터) ──
  async scrapeVisibleCards() {
    if (!this.active) return;

    // ★ Bing Maps 비즈니스 카드 셀렉터 (우선순위 순)
    // Bing Maps 지도 결과 패널의 실제 구조에 맞게 작성
    const CARD_SELECTORS = [
      // Bing Maps 특화 — 리스트 아이템 및 컨테이너
      '.b-lisItem', '[class*="EntityCard"]', '[class*="entityCard"]',
      '[class*="listingCard"]', '[class*="listing-card"]',
      '.bm_listing_card', '.anyEntity',
      // 검색 결과 내 카드
      '.b_algo', '.b_ans', '.rc_listing',
      // 구조적 셀렉터
      '#b_results > li', 'li.b-li', '[role="listitem"]',
      // 클릭 가능한 요소 폴백
      'button.listingContent_fjvwG', 'button[title]:not([title=""])',
      '[data-entity-id]'
    ];

    let cards = [];
    for (const sel of CARD_SELECTORS) {
      const found = document.querySelectorAll(sel);
      if (found.length > 0) {
        // 유효한 비즈니스 카드만 필터링 (텍스트가 일정 길이 이상인 것)
        cards = Array.from(found).filter(c => (c.innerText || '').length > 10);
        if (cards.length > 0) {
          if (cards.length !== this.lastCount) {
             console.log(`[BING-POWER] Detected ${cards.length} candidates via [${sel}]`);
             this.lastCount = cards.length;
          }
          break;
        }
      }
    }

    if (cards.length === 0) {
      // 최종 폴백: Bing Maps에서 title 속성 있는 모든 클릭 가능 요소
      this.scrapeCardsFallback();
      return;
    }

    let scrapedCount = 0;
    for (const card of cards) {
      if (!this.active) break;
      // ── 이름 추출 (title > h2/h3/[heading] > 첫 줄 텍스트) ──
      let name = (card.getAttribute('title') || '').trim();
      if (!name || name.length < 2) {
        const nameEl = card.querySelector('h2, h3, [class*="title"], [class*="name"], [class*="heading"], [aria-label]');
        name = nameEl ? (nameEl.getAttribute('aria-label') || nameEl.innerText || '').trim().split('\n')[0] : '';
      }
      if (!name || name.length < 2) {
        const firstLine = (card.innerText || '').trim().split('\n')[0].trim();
        if (firstLine.length >= 2 && firstLine.length <= 80) name = firstLine;
      }
      if (!name || name.length < 2) continue;

      const cardText = (card.innerText || '').replace(/\r/g, '').trim();
      const lines = cardText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

      // ── 중복 방지 ──
      const key = name + '_' + (lines[1] || cardText.substring(0, 40));
      if (this.processedUrls.has(key)) continue;
      this.processedUrls.add(key);
      scrapedCount++;

      // ★ 6개 필드 완전 추출 엔진 호출
      const extracted = this._extractAllFields(card, name, lines, cardText);

      const data = {
        name,
        category: extracted.category,
        address: extracted.address,
        phone: extracted.phone,
        rating: extracted.rating,
        website: extracted.website,
        email: extracted.email !== 'N/A' ? extracted.email : 'Pending Stage 2',
        social: extracted.social,
        reviews: extracted.reviews,
        placeId: 'bing_' + btoa(unescape(encodeURIComponent(name + extracted.address))).substring(0, 16)
      };

      // ★ 초고속 딥서치 강제 트리거: 웹사이트나 전화번호가 없으면 정보 티켓을 열어본다.
      let needsDeepSearch = (data.website === 'N/A' || data.phone === 'N/A' || data.address === 'N/A');
      if (needsDeepSearch) {
        const clickable = card.querySelector('button.listingContent_fjvwG, a, button, h2, [role="button"], .b_title') || card;
        if (clickable) {
           console.log('[BING-POWER] 🚀 딥서치 진입 (카드 고속 클릭): ' + name);
           try { clickable.click(); } catch(e) {}
           await this.waitForPanelUpdate(name); // 패널 동적 고속 폴링 대기
           this.scrapeEntityPanel();
        } else {
           console.log('[BING-POWER] Collected (No Panel): "' + name + '" | tel:' + data.phone + ' | web:' + (data.website !== 'N/A' ? 'YES' : 'NO') + ' | email:' + (data.email !== 'Pending Stage 2' ? data.email : '-') + ' | addr:' + (data.address !== 'N/A' ? 'YES' : 'NO'));
           sendMessageSafe({ action: 'foundBusiness', data });
        }
      } else {
        console.log('[BING-POWER] Collected (Full): "' + name + '" | tel:' + data.phone + ' | web:' + (data.website !== 'N/A' ? 'YES' : 'NO') + ' | email:' + (data.email !== 'Pending Stage 2' ? data.email : '-') + ' | addr:' + (data.address !== 'N/A' ? 'YES' : 'NO'));
        sendMessageSafe({ action: 'foundBusiness', data });
      }
    }

    if (scrapedCount > 0) {
      console.log('[BING] Successfully sent ' + scrapedCount + ' new leads.');
    }
  }

  // ═══════════════════════════════════════════════════════════
  // ★★★ 핵심: 6개 필드 완전 추출 엔진 ★★★
  // 이름, 웹사이트, 전화번호, 이메일, 우편주소, 소셜미디어
  // ═══════════════════════════════════════════════════════════
  _extractAllFields(card, name, lines, cardText) {
    let rating = 'N/A', phone = 'N/A', category = 'N/A', address = 'N/A';
    let website = 'N/A', email = 'N/A', social = 'N/A', reviews = '0';

    // ── 1. 웹사이트 (3중 레이어) ──────────────────────────────
    const WS_SELS = [
      'a[class*="website"]', 'a[class*="Website"]', 'a[class*="webUrl"]',
      'a[class*="siteLink"]', 'a[class*="homepage"]', 'a[class*="web-link"]',
      '[data-type="website"] a', 'a[aria-label*="website" i]',
      'a[aria-label*="websiteUrl" i]', 'a[class*="visitLink"]'
    ];
    const WS_BLACKLIST = ['bing.com', 'microsoft.com', 'yelp.com', 'bingplaces.com', 'tripadvisor.com', 'facebook.com', 'instagram.com', 'twitter.com', 'x.com', 'linkedin.com'];
    for (const sel of WS_SELS) {
      try {
        const el = card.querySelector(sel);
        if (el && el.href && !WS_BLACKLIST.some(d => el.href.includes(d))) {
          website = el.href; break;
        }
      } catch(e) {}
    }
    if (website === 'N/A') {
      const allLinks = card.querySelectorAll('a[href]');
      for (const a of allLinks) {
        const h = a.href || '';
        if (h.startsWith('http') && !WS_BLACKLIST.some(d => h.includes(d))
            && !h.includes('maps.live.com') && !h.includes('javascript:')
            && !h.match(/\.(jpg|png|gif|pdf|ico)$/i)) {
          website = h; break;
        }
      }
    }
    if (website === 'N/A') {
      const urlMatch = cardText.match(/https?:\/\/(?!(?:www\.)?(?:bing|microsoft|yelp|bingplaces|tripadvisor|facebook|instagram|twitter|x|linkedin)\.com)[^\s<>"]{5,80}/);
      if (urlMatch) website = urlMatch[0].replace(/[.,;)]+$/, '');
    }

    // ── 2. 이메일 (2중 레이어) ────────────────────────────────
    try {
      const mailtoEl = card.querySelector('a[href^="mailto:"]');
      if (mailtoEl) {
        email = mailtoEl.href.replace('mailto:', '').split('?')[0].trim();
      }
    } catch(e) {}
    if (email === 'N/A') {
      const emailMatch = cardText.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
      if (emailMatch) {
        const em = emailMatch[0];
        if (!em.match(/\.(png|jpg|gif|svg|js|css)$/i) && !em.includes('sentry') && !em.includes('example') && !em.includes('noreply')) {
          email = em;
        }
      }
    }

    // ── 3. 전화번호 (강화 국제 패턴) ────────────────────────────
    try {
      const telEl = card.querySelector('a[href^="tel:"]');
      if (telEl) phone = telEl.href.replace('tel:', '').trim();
    } catch(e) {}
    if (phone === 'N/A') {
      const phonePatterns = [
        /(\+82[\s\-]?|0)(?:2|1[0-9]|[3-9][0-9])[\s\-]?\d{3,4}[\s\-]?\d{4}/,
        /(?:\+1[\s.\-]?)?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/,
        /\+\d{1,3}[\s.\-]?\(?\d{1,4}\)?[\s.\-]?\d{3,4}[\s.\-]?\d{3,4}/,
        /\(?\d{2,4}\)?[\s.\-]?\d{3,4}[\s.\-]?\d{4}/
      ];
      for (const pat of phonePatterns) {
        const m = cardText.match(pat);
        if (m) {
          const clean = m[0].replace(/\D/g, '');
          if (clean.length >= 7 && clean.length <= 15) { phone = m[0].trim(); break; }
        }
      }
    }

    // ── 4. 우편주소 (다국어 3중 패턴) ───────────────────────────
    const krAddrMatch = cardText.match(
      /([가-힣]+(?:특별시|광역시|특별자치시|도|특별자치도)?\s*[가-힣]+(?:시|군|구)\s*[가-힣\d\-\s]+(?:로|길|대로|가)\s*\d+[가-힣\d\-\s,번길]*)/
    );
    if (krAddrMatch) address = krAddrMatch[0].trim();

    if (address === 'N/A') {
      const enAddrMatch = cardText.match(
        /\d{1,5}[\s,]+[A-Za-z0-9\s.'\-]+(?:Avenue|Ave|Street|St|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Way|Court|Ct|Place|Pl|Plaza|Square|Suite|Ste|Unit|Pkwy|Highway|Hwy|Boul|Rue|Route)[\s,]+[A-Za-z\s]+(?:[A-Z]{2}[\s,]+\d{5}(?:\-\d{4})?|[A-Z]\d[A-Z]\s?\d[A-Z]\d)?/i
      );
      if (enAddrMatch) address = enAddrMatch[0].trim().replace(/\n/g, ', ');
    }
    if (address === 'N/A') {
      for (const line of lines) {
        if (line === name || line.length < 5 || line.length > 150) continue;
        const isAddr = /^\d+\s/.test(line) ||
                       /[가-힣]+(시|구|동|로|길|도|군)/.test(line) ||
                       /\b(St|Ave|Blvd|Dr|Rd|Way|Ln|Pl|Pkwy|Street|Avenue|Road|Boulevard|Unit|Suite)\b/i.test(line) ||
                       /,[^,]{2,}\s+[A-Z]{2}\s+\d{5}/.test(line);
        if (isAddr) { address = line; break; }
      }
    }

    // ── 5. 소셜미디어 ──────────────────────────────────────────
    const SOCIAL_DOMAINS = ['facebook.com', 'instagram.com', 'twitter.com', 'x.com',
                            'linkedin.com', 'youtube.com', 'tiktok.com', 'pinterest.com'];
    const SOCIAL_BLOCK = ['/embed/', '/share/', 'intent/tweet', '/hashtag/'];
    const socialLinks = [];
    try {
      card.querySelectorAll('a[href]').forEach(a => {
        const h = a.href || '';
        if (!SOCIAL_DOMAINS.some(d => h.includes(d))) return;
        if (h.includes('bing.com') || h.includes('google.com') || h.includes('microsoft.com')) return; // No search result social links
        if (SOCIAL_BLOCK.some(b => h.includes(b))) return;
        try {
          const u = new URL(h);
          const parts = u.pathname.split('/').filter(Boolean);
          if (parts.length >= 1) socialLinks.push(h);
        } catch(e) {}
      });
    } catch(e) {}
    if (socialLinks.length === 0) {
      const socialMatch = cardText.match(/(?:facebook|instagram|twitter|linkedin|youtube|tiktok)\.com\/[^\s<>"']{2,40}/gi);
      if (socialMatch) socialLinks.push(...socialMatch.map(s => 'https://' + s));
    }
    if (socialLinks.length > 0) social = [...new Set(socialLinks)].slice(0, 5).join(', ');

    // ── 6. 평점 / 리뷰수 / 카테고리 ──────────────────────────
    for (const line of lines) {
      if (rating === 'N/A') {
        const rm = line.match(/(\d\.?\d?)\s*(?:\/5|out of 5|stars?|★|☆)/i);
        if (rm) rating = rm[1] + '/5';
      }
      if (reviews === '0') {
        const rvm = line.match(/([\d,]+)\s*(?:reviews?|ratings?|리뷰|평가)/i);
        if (rvm) reviews = rvm[1].replace(/,/g, '');
      }
    }
    const catLine = lines.find(l =>
      l.length > 2 && l.length < 40 &&
      l !== name && l !== phone && l !== address &&
      !l.includes('/5') && !l.match(/^\d/) && !l.match(/https?:\/\//)
    );
    if (catLine) category = catLine;

    return { website, email, phone, address, social, rating, reviews, category };
  }

  // ── 상세 정보 패널(Entity Panel) 스크랩 ──
  scrapeEntityPanel() {
    if (!this.active) return;
    
    const PANEL_SELS = [
      '.singleEntityWrapper_srJlN', '.b_magInfoCard.b_isf', '.b_magInfoCard', '#bnp_content', '.entity-page', 
      '[class*="entityPanel"]', '[class*="overlayPanel"]', '[class*="sidePanel"]', 
      '[class*="detailPanel"]', '.b_entityTP', '#b_context'
    ];
    let panel = null;
    for (const sel of PANEL_SELS) {
      try {
        const el = document.querySelector(sel);
        if (el && el.offsetParent !== null && (el.innerText || '').length > 20) { panel = el; break; }
      } catch(e) {}
    }
    if (!panel) return;

    const nameEl = panel.querySelector('h2, h1, [class*="title"], [class*="name"], [class*="entityName"]');
    const name = (nameEl ? nameEl.innerText : '').trim().split('\n')[0];
    if (!name || name.length < 2) return;

    const cardText = panel.innerText || '';
    const key = 'entity:' + name;
    if (this.processedUrls.has(key)) return;
    this.processedUrls.add(key);

    const lines = cardText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    // 1. 기본 6개 필드 추출 엔진 실행
    const extracted = this._extractAllFields(panel, name, lines, cardText);

    // 2. ★ Bing Maps 특화 (b_magInfoCard .b_factrow) 정밀 추출 보완
    const factRows = panel.querySelectorAll('.b_factrow');
    if (factRows.length > 0) {
      factRows.forEach(row => {
        const text = (row.innerText || '').trim();
        const a = row.querySelector('a');
        
        // 웹사이트 (링크가 있거나 텍스트가 웹사이트 문맥일 때)
        if (a && a.href && !a.href.includes('bing.com')) {
          const lowerText = text.toLowerCase();
          if (lowerText.includes('website') || lowerText.includes('웹사이트') || lowerText.includes('site') || a.href.startsWith('http')) {
            extracted.website = a.href;
          }
        } else if (a && a.href && a.href.includes('alink/link?url=')) {
          // 인코딩된 빙맵 외부 링크 직접 추출
          try {
             const u = new URL(a.href);
             const targetUrl = u.searchParams.get('url');
             if (targetUrl) extracted.website = decodeURIComponent(targetUrl);
          } catch(e) {}
        }
        
        // 전화번호 (아이콘이나 전화번호 형식)
        if (extracted.phone === 'N/A') {
          const pm = text.match(/(\+?[0-9(][\d()\s.\-]{8,20})/);
          if (pm) {
            const clean = pm[0].replace(/\D/g, '');
            if (clean.length >= 7) extracted.phone = pm[0].trim();
          }
        }
        
        // 주소 (팩트로우 내에 우편번호/주소 패턴이 명확히 있을 때)
        if (extracted.address === 'N/A' && text.length > 5) {
          const isAddr = /^\d+\s/.test(text) || /[가-힣]+(시|구|동|로|길|도)/.test(text) || /\b(St|Ave|Blvd|Dr|Rd|Way|Ln|Pl|Pkwy|Street)\b/i.test(text);
          if (isAddr && !text.includes(name) && !text.match(/(\+?[0-9(][\d()\s.\-]{8,20})/)) {
            extracted.address = text;
          }
        }
      });
    }

    // 3. 전역 길찾기 버튼을 통한 우회 주소 추출 및 전역 인코딩 링크 검사
    const dirBtn = panel.querySelector('.b_directionBtn, [data-is-directions="true"]');
    if (dirBtn && extracted.address === 'N/A') {
       const dirTitle = dirBtn.getAttribute('title') || dirBtn.getAttribute('aria-label') || '';
       if (dirTitle.includes('도착:') || dirTitle.includes('To:')) {
           extracted.address = dirTitle.replace(/도착:|To:/gi, '').trim();
       }
    }
    
    if (extracted.website === 'N/A') {
       const aLinks = panel.querySelectorAll('a[href*="alink/link?url="]');
       if (aLinks.length > 0) {
          try {
             const u = new URL(aLinks[0].href);
             const targetUrl = u.searchParams.get('url');
             if (targetUrl) extracted.website = decodeURIComponent(targetUrl);
          } catch(e) {}
       }
    }

    const data = {
      name,
      category: extracted.category,
      address: extracted.address,
      phone: extracted.phone,
      rating: extracted.rating,
      website: extracted.website,
      email: extracted.email !== 'N/A' ? extracted.email : 'Pending Stage 2',
      social: extracted.social,
      reviews: extracted.reviews,
      placeId: 'bing_ent_' + btoa(unescape(encodeURIComponent(name))).substring(0, 12)
    };

    console.log('[BING-POWER] 💎 Entity Panel (' + (factRows.length > 0 ? 'FactRow' : 'Basic') + '): "' + name + '" | tel:' + data.phone + ' | email:' + (data.email !== 'Pending Stage 2' ? data.email : '-') + ' | addr:' + (data.address !== 'N/A' ? 'YES' : 'NO') + ' | web:' + (data.website !== 'N/A' ? 'YES' : 'NO'));
    sendMessageSafe({ action: 'foundBusiness', data });
  }

  // ── 폴백: button title로만 긁기 (listingContent 못 찾을 때) ──
  scrapeCardsFallback() {
    if (!this.active) return;
    const btns = document.querySelectorAll('button[title]:not([title=""])');
    let scrapedCount = 0;
    btns.forEach((btn) => {
      const name = (btn.getAttribute('title') || '').trim();
      if (!name || name.length < 2 || name.length > 100
          || /zoom|pan|map|close|search|directions|layer|satellite|terrain|street view/i.test(name)) return;
      const key = 'fb:' + name;
      if (this.processedUrls.has(key)) return;
      this.processedUrls.add(key);
      scrapedCount++;
      const cardText = btn.innerText || '';
      const lines = cardText.split('\n').map(l => l.trim()).filter(l => l);
      const extracted = this._extractAllFields(btn, name, lines, cardText);
      const data = {
        name,
        category: extracted.category,
        address: extracted.address,
        phone: extracted.phone,
        rating: extracted.rating,
        website: extracted.website,
        email: extracted.email !== 'N/A' ? extracted.email : 'Pending Stage 2',
        social: extracted.social,
        reviews: '0'
      };
      sendMessageSafe({ action: 'foundBusiness', data });
    });
  }


  // ── 결과가 끝날 때까지 스크롤다운 후 스크랩 ──
  async waitUntilFinished() {
    console.log('[BING] waitUntilFinished: scrolling to collect all results...');

    // 실제 Bing Maps 스크롤 컨테이너
    const getContainer = () => document.querySelector(
      'div.b_lstcards, #b_results, [class*="lstcards"]'
    );

    let container = getContainer();
    if (!container) {
      // 최대 5초 대기
      for (let i = 0; i < 10; i++) {
        await this.sleep(500);
        container = getContainer();
        if (container) break;
      }
    }
    if (!container) {
      console.warn('[BING] No scroll container found.');
      await this.scrapeVisibleCards();
      return;
    }

    let lastHeight = 0;
    let stableCount = 0;
    const MAX = 30; // 최대 30회 스크롤

    for (let i = 0; i < MAX && this.active; i++) {
      // 스크롤 다운
      container.scrollTop = container.scrollHeight;
      // window도 함께 스크롤 (일부 레이아웃)
      window.scrollTo(0, document.body.scrollHeight);
      await this.sleep(1000);

      await this.scrapeVisibleCards();

      // 종료 조건: 높이 변화 없으면 완료
      if (container.scrollHeight === lastHeight) {
        stableCount++;
        if (stableCount >= 3) {
          console.log('[BING] Scroll stabilized. Collection complete.');
          break;
        }
      } else {
        stableCount = 0;
      }
      lastHeight = container.scrollHeight;

      // 명시적 종료 표시
      const endEl = document.querySelector(
        '[class*="endof"], [class*="nomore"], [class*="end-of-results"], .b_no'
      );
      if (endEl && endEl.offsetParent) {
        console.log('[BING] End-of-results element detected. Done.');
        break;
      }
    }

    await this.sleep(500);
    await this.scrapeVisibleCards(); // 마지막 한 번 더
  }

  // ── 드래그 감지 3중 체계 + '이 지역 검색' 자동 클릭 ──
  startAutoSearchLoop() {
    let searchPending = false;
    let lastHref = window.location.href;

    const triggerSearch = async (reason) => {
      if (!this.active || searchPending) return;
      searchPending = true;
      console.log(`[BING] Drag detected (${reason}). Triggering 'Search this area'...`);

      // 지도 로딩 대기
      await this.sleep(1200);
      const result = this.clickSearchThisArea();
      console.log('[BING] Search button result:', result);

      // 결과 패널 로딩 대기 후 스크롤 수집
      await this.sleep(2500);
      await this.waitUntilFinished();
      searchPending = false;
    };

    // Layer 1: mouseup 드래그 감지 (가장 빠름)
    let dragStart = null;
    const onMouseDown = (e) => { if (e.button === 0) dragStart = { x: e.clientX, y: e.clientY }; };
    const onMouseUp   = (e) => {
      if (!dragStart || !this.active) return;
      const dist = Math.hypot(e.clientX - dragStart.x, e.clientY - dragStart.y);
      dragStart = null;
      if (dist > 20) triggerSearch('mouseup-drag');
    };
    document.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('mouseup',   onMouseUp,   true);
    this._dragMouseDown = onMouseDown;
    this._dragMouseUp   = onMouseUp;

    // Layer 2: URL 폴링 — Bing URL 변화 감지 (500ms)
    this._autoSearchInterval = setInterval(() => {
      if (!this.active) return;
      const href = window.location.href;
      if (href !== lastHref) { lastHref = href; triggerSearch('url-change'); }
    }, 500);

    // 초기 실행: Start 클릭 즉시 현재 화면 수집
    setTimeout(async () => {
      if (!this.active) return;
      console.log('[BING] Initial collection on start.');
      await this.sleep(800);
      await this.waitUntilFinished();
    }, 500);
  }

  // ── '이 지역 검색' 버튼 클릭 ──
  // 실제 Bing Maps DOM 조사로 확인된 셀렉터
  clickSearchThisArea() {
    const SELS = [
      // ★ 라이브 조사로 확인된 실제 클래스
      'button.searchThisAreaButton_KCAj0',
      '[class*="searchThisArea"]',
      '[class*="SearchThisArea"]',
      // aria-label 기반
      'button[aria-label*="Search this area"]',
      'button[aria-label*="이 지역 검색"]',
      'button[aria-label*="Redo search"]',
      'button[aria-label*="在此区域搜索"]',
      // title 기반
      'button[title*="Search this area"]',
      'button[title*="이 지역"]',
      // 기타 Bing 셀렉터
      '.bm_redoSearch',
      '[class*="redoSearch"]',
    ];

    for (const sel of SELS) {
      try {
        const btn = document.querySelector(sel);
        if (btn && (btn.offsetWidth > 0 || btn.offsetHeight > 0)) {
          const rect = btn.getBoundingClientRect();
          console.log(`[BING] ✅ Clicking '이 지역 검색' [${sel}]`);
          ['mousedown', 'mouseup', 'click'].forEach(t =>
            btn.dispatchEvent(new MouseEvent(t, {
              bubbles: true, cancelable: true, view: window,
              clientX: rect.left + rect.width / 2,
              clientY: rect.top + rect.height / 2
            }))
          );
          return 'CLICKED:' + sel;
        }
      } catch(e) {}
    }

    // 폴백: 검색창 재입력
    const input = document.querySelector('#sb_form_q, input[name="q"], input[type="search"]');
    if (input && input.value.trim()) {
      console.log('[BING] Fallback: re-submit search input');
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
      return 'FORM_ENTER';
    }

    // 디버그: 모든 버튼 덤프
    console.warn('[BING] ❌ "이 지역 검색" button not found. All visible buttons:');
    document.querySelectorAll('button, [role="button"]').forEach(b => {
      if (b.offsetWidth > 0 || b.offsetHeight > 0)
        console.log(`  class="${b.className.substring(0,50)}" aria="${b.getAttribute('aria-label')}" title="${b.title}" text="${b.innerText?.substring(0,30)}"`);
    });
    return 'NOT_FOUND';
  }

  sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
} // end BingMapsBulletproofScraper (duplicate removed)

console.log('[CONTENT.JS] Environment:', window.location.href);
let scraper = null;
if (window.location.host.includes('bing.com')) {
    console.log('[CONTENT.JS] Initializing BingMapsBulletproofScraper');
    scraper = new BingMapsBulletproofScraper();
} else {
    console.log('[CONTENT.JS] Initializing GMapsBulletproofScraper');
    scraper = new GMapsBulletproofScraper();
}

chrome.runtime.onMessage.addListener((req) => {
  console.log('[CONTENT.JS] Received chrome.runtime message:', req);
  if (req.action === 'start') scraper.start();
  else if (req.action === 'stop') scraper.stop();
  else if (req.action === 'clearData') {
    if (scraper.processedUrls) scraper.processedUrls.clear();
    scraper.lastCount = 0;
    console.log('[CONTENT.JS] Scraper memory cleared.');
  }
  else if (req.action === 'startCruiser') cruiser.start(req.range, req.stepSize || 9.0, req.speedMult || 1.0);
  else if (req.action === 'stopCruiser') cruiser.stop();
});

window.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'XPIDER_CONTENT_MSG') {
    const req = e.data.message;
    console.log('[CONTENT.JS] Received XPIDER_CONTENT_MSG:', req);
    if (req.action === 'start') scraper.start();
    else if (req.action === 'stop') scraper.stop();
    else if (req.action === 'clearData') {
      // scraper 내부 메모리 완전 초기화
      if (scraper.processedUrls) scraper.processedUrls.clear();
      scraper.lastCount = 0;
      scraper.active = false;
      // cruiser도 중지
      if (cruiser && cruiser.active) cruiser.stop();
      console.log('[CONTENT.JS] ✅ Scraper + Cruiser memory cleared via clearData.');
    }
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
        this.lineSteps = 0;     // Steps taken in current line
        this.targetSteps = 0;    // Target steps to return after reverse
        this.dirX = 1;          // 1 = East, -1 = West
        this.maxSteps = 0;
        this.oceanCount = 0;    // Consecutive empty zones
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
        this.lineSteps = 0;
        this.targetSteps = 0;
        this.dirX = 1;
        this.totalDistance = 0;
        this.maxSteps = Math.ceil(range / stepSize);
        // ★ XPIDER Storage로부터 초기 리드 수 동기화
        this.leadsAtStart = 0;
        try {
            chrome.storage.local.get(['scrapedData'], (res) => {
                this.leadsAtStart = (res.scrapedData || []).length;
                console.log(`[BINGCRUISER] Base lead count synced: ${this.leadsAtStart}`);
            });
        } catch(e) {
            this.leadsAtStart = scraper ? scraper.processedUrls.size : 0;
        }
        this.hud.create();
        this.hud.update({ status: 'Engaging Precision Scan', direction: 'Calibrating' });
        this.run();
    }

    stop() {
        this.active = false;
        this.hud.destroy();
        console.log('🛑 GMaps Cruiser: Stopped.');
    }

    // ★ 스토리지 동기화로부터 실제 증가분 계산
    updateLeadsFromStorage(totalCount) {
        if (!this.active) return;
        const delta = Math.max(0, totalCount - this.leadsAtStart);
        console.log(`[BINGCRUISER] HUD Sync: Total=${totalCount} Start=${this.leadsAtStart} Delta=${delta}`);
        this.hud.update({ newLeads: delta });
    }

    async sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    async run() {
        console.log('[BINGCRUISER] ▶ Zig-zag exploration loop started.');
        while (this.active) {
            let moveKey = '';
            let moveName = '';
            const rowWidth = (this.currentYSteps === 0) ? this.maxSteps : this.maxSteps * 2;

            // ─── SNAKE MOVEMENT LOGIC ───
            if (this.targetSteps > 0 && this.lineSteps < this.targetSteps) {
                // 반전 귀환 중: 바다 감지를 스킵하고 목표 지점까지 고속 이동
                moveKey = this.dirX === 1 ? 'ArrowRight' : 'ArrowLeft';
                moveName = this.dirX === 1 ? '↩ RETURNING EAST' : '↩ RETURNING WEST';
                this.lineSteps++;
                this.currentXSteps++;
                this.hud.update({ status: `↩ RETURNING (${this.lineSteps}/${this.targetSteps})` });
            } else {
                if (this.targetSteps > 0) {
                    console.log(`[BingCruiser] ✅ Return complete (${this.lineSteps} steps). Resuming normal scan.`);
                    this.targetSteps = 0;
                }

                if (this.currentXSteps < rowWidth) {
                    moveKey = this.dirX === 1 ? 'ArrowRight' : 'ArrowLeft';
                    moveName = this.dirX === 1 ? 'Scanning East ▶' : 'Scanning West ◀';
                    this.currentXSteps++;
                    this.lineSteps++;
                } else {
                    moveKey = 'ArrowDown';
                    moveName = 'Stepping South ▼';
                    this.currentXSteps = 0;
                    this.lineSteps = 0;
                    this.dirX *= -1;
                    this.currentYSteps++;
                }
            }

            if (this.currentYSteps > this.maxSteps * 2) {
                this.hud.update({ status: 'Mission Complete ✅' });
                this.stop();
                sendMessageSafe({ action: 'cruiserUpdate', data: { finished: true, status: 'Mission Complete' } });
                break;
            }

            // ─── 1. 지도 이동: renderer_ui.js의 simulateHardwareDrag에 위임 ───────
            console.log(`🚀 BingCruiser: Moving ${moveName}`);
            this.hud.update({ direction: moveName, status: 'Moving...' });

            const isSouth = moveKey === 'ArrowDown';

            if (isSouth) {
                // 남쪽 이동: renderer_ui.js에 reverseAndMoveSouth 요청
                sendMessageSafe({
                    action: 'reverseAndMoveSouth',
                    newDirection: this.dirX,
                    cruiserDir: this.dirX
                });
            } else {
                // 수평 이동: renderer_ui.js에 performHardwareMove 요청
                sendMessageSafe({
                    action: 'performHardwareMove',
                    direction: 'HORIZONTAL',
                    cruiserDir: this.dirX
                });
            }

            // 드래그 + 지도 로딩 대기 (속도 설정 반영)
            const moveDelay = Math.max(this.baseDelay, 2500);
            await this.sleep(moveDelay);

            // ─── 2. '이 지역 검색' 버튼 클릭 시도 (Bing Maps) ────────────
            // BingMapsBulletproofScraper의 clickSearchThisArea 메서드 사용
            if (scraper && typeof scraper.clickSearchThisArea === 'function') {
                const clicked = scraper.clickSearchThisArea();
                console.log('[BingCruiser] Search area click result:', clicked);
            }
            await this.sleep(2000);

            // ─── 3. 결과 확인 ──────────────────────────────────────────────────
            this.hud.update({ status: 'Scanning sector...' });
            const hasResults = await this.checkResultsWithTimeout();

            if (!hasResults) {
                this.hud.update({ status: 'Empty Area. Inspecting...' });
                const isEmpty = await this._detectEmptyZone();

                if (isEmpty) {
                    this.oceanCount++;
                    console.log(`[BingCruiser] 🌊 Empty/Ocean Zone [${this.oceanCount}/3]`);
                    if (this.oceanCount >= 3) {
                        const prevSteps = this.lineSteps;
                        this.hud.update({ status: '🌊 Wide Ocean: Snaking Reverse' });
                        this.dirX *= -1;
                        this.targetSteps = prevSteps;
                        this.currentXSteps = 0;
                        this.lineSteps = 0;
                        this.oceanCount = 0;
                        this.currentYSteps++;
                        
                        // 신호 전송 (남쪽 이동 포함)
                        sendMessageSafe({
                            action: 'reverseAndMoveSouth',
                            newDirection: this.dirX,
                            cruiserDir: this.dirX
                        });
                        await this.sleep(4000);
                        continue;
                    } else {
                        this.hud.update({ status: `Empty (${this.oceanCount}/3): Moving On` });
                        await this.sleep(800 / this.speedMult);
                    }
                } else {
                    this.oceanCount = 0;
                    this.hud.update({ status: 'Empty Land: Moving On' });
                }
                continue;
            }

            // 결과 발견 시 초기화
            this.oceanCount = 0;

            // ─── 4. 스크래퍼 완료 대기 ─────────────────────────────────────────
            this.hud.update({ status: 'Scraping results...' });
            await scraper.waitUntilFinished();

            this.totalDistance += this.stepSize;
            const newLeads = scraper ? scraper.processedUrls.size - this.leadsAtStart : 0;
            this.hud.update({ distance: this.totalDistance, newLeads: newLeads });

            // ─── 5. UI 업데이트 ─────────────────────────────────────────────────
            sendMessageSafe({
                action: 'cruiserUpdate',
                data: { direction: moveName, distance: this.totalDistance, newLeads: newLeads, status: 'Scanning...' }
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
            await this.sleep(500);
        }
        return false;
    }

    hasResults() {
        // scrapeVisibleCards와 동일한 셀렉터 배열로 결과 유무 확인
        const CARD_SELECTORS = [
          '[class*="listingCard"]', '[class*="listing-card"]',
          '[class*="entityCard"]', '[class*="entity-card"]',
          '.rc_listing', '[class*="rc_listing"]',
          '[role="listitem"]', '#b_results li',
          '.b_algo'
        ];
        for (const sel of CARD_SELECTORS) {
          if (document.querySelectorAll(sel).length > 0) return true;
        }
        // 명시적 "no results" 표시가 있으면 false
        const noResults = document.querySelector(
          '.bm_noResults, [class*="noResults"], .no-results-message, [class*="noresult"]'
        );
        if (noResults && noResults.offsetParent) return false;
        return false;
    }

    /**
     * ★ Bing Maps 전용: 빈 구역(바다/미입력 지역) 감지
     * Bing은 GMaps의 파란 바다 픽셀 감지 대신 DOM 기반으로 판단합니다.
     */
    async _detectEmptyZone() {
        // Wait for Bing to settle after map move
        await this.sleep(1500);

        const txt = (document.body.innerText || '').toLowerCase();
        
        // 1) Ocean/Sea detection using keyword analysis (GMaps port)
        const oceanRegex = /ocean|sea|gulf|bay|pacific|atlantic|mediterranean|바다|해상|대양|해양|태평양|대서양|海洋|oceano|oc\u00e9an|meer|mar\b|mer\b|lake|river|강물|호수/i;
        if (oceanRegex.test(txt)) {
            console.log('[BingCruiser] 🌊 Detection: OCEAN (via keywords)');
            return true;
        }

        // 2) 명시적 "no results" 요소
        const noResultsEl = document.querySelector(
          '.bm_noResults, [class*="noResults"], .bm_listing_noresults, .no-results-message'
        );
        if (noResultsEl && noResultsEl.offsetParent) return true;

        // 3) 리스팅 컨테이너가 비었는지 확인
        const feed = document.querySelector(
          'div[aria-label*="Search results"], .bm_listing_card_container, #bm_listing_container'
        );
        if (!feed) return true;

        const cards = feed.querySelectorAll(
          'button[class*="listingContent"], .bm_listing_card'
        );
        if (cards.length === 0) return true;

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
                      document.querySelector('#bm_mapSurface') ||
                      document.querySelector('.MicrosoftMap') ||
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
        await this.sleep(50);
        dispatchEvents(target, 'down', x, y, 1);
        await this.sleep(100); 

        // 2. Granular Movement on Window (to prevent losing focus)
        const steps = 40;
        for (let i = 1; i <= steps; i++) {
            const currentX = x + (dx * i) / steps;
            const currentY = y + (dy * i) / steps;
            
            // Google Maps engines track window movement during a drag
            dispatchEvents(window, 'move', currentX, currentY, 1);
            
            // Smooth human-like delay (~800ms total)
            await this.sleep(20); 
        }

        await this.sleep(100);

        // 3. Final Release on Window
        dispatchEvents(window, 'up', x + dx, y + dy, 0);
        dispatchEvents(target, 'out', x + dx, y + dy, 0);
        dispatchEvents(target, 'leave', x + dx, y + dy, 0);
        
        console.log("✅ Ultimate Drag: Sequence Complete.");
    }
}

const cruiser = new MapCruiser();

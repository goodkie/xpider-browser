(function () {
    // 🛡️ [Stealth] DOM Injection to override navigator.webdriver directly in the page context
    try {
        const injectScript = document.createElement('script');
        injectScript.textContent = `
            try {
                Object.defineProperty(navigator, 'webdriver', {
                    get: () => undefined,
                    configurable: true
                });
            } catch (e) {}
            try {
                const newProto = navigator.__proto__;
                delete newProto.webdriver;
                navigator.__proto__ = newProto;
            } catch (e) {}
        `;
        (document.head || document.documentElement).appendChild(injectScript);
        injectScript.remove();
        console.log("🛡️ [Stealth] DOM injection applied successfully.");
    } catch (e) {
        console.warn("🛡️ [Stealth] DOM injection failed:", e);
    }

    /**
     * [v4.0] Secure Stealth & Behavior Mimicry
     */
    async function applyStealth() {
        try {
            const storage = await chrome.storage.local.get(['stealthModeEnabled']);
            // If stealthModeEnabled is not set yet, default to true for crawlers
            const stealthEnabled = (storage.stealthModeEnabled !== false);
            if (!stealthEnabled) return;

            console.log("🛡️ [Stealth] Behavioral Jitter Enabled.");
            
            // 1. Mask navigator.webdriver where possible
            try {
                Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            } catch (e) {}

            // 2. Add organic behavioral jitter
            window.addEventListener('load', () => {
                setTimeout(() => {
                    if (Math.random() > 0.5 && window.top === window) {
                        window.scrollBy({ top: Math.random() * 200, behavior: 'smooth' });
                    }
                }, 2000 + Math.random() * 3000);
            });
        } catch (e) {
            console.warn("🛡️ [Stealth] Error applying behavioral masking:", e);
        }
    }
    applyStealth();

    // [v17.4] Global Listener MUST be registered BEFORE any early return
    // This ensures even re-injected frames can receive 'extract' commands.
    if (!window.__COLLECT_LISTENER_REGISTERED__) {
        chrome.runtime.onMessage.addListener((m, s, sendResponse) => {
            if (m.action === 'extract') {
                _currentKeyword = m.keyword || "";
                _hl = m.hl || 'en';
                performExtraction(0, m, m.targetOption);
                if (sendResponse) sendResponse({ status: 'received' });
            } else if (m.action === 'ping') {
                if (sendResponse) sendResponse({ status: 'pong' });
            }
            return true;
        });
        window.__COLLECT_LISTENER_REGISTERED__ = true;
    }

    // [v16.1] Prevent Duplicate Logic Execution while keeping communication open
    if (window.__COLLECT_LOADED__) {
        console.log(`[Content] Already loaded in frame: ${window.location.href}. Re-syncing...`);
        try { chrome.runtime.sendMessage({ action: 'engineStatus', status: 'ready' }); } catch (e) { }
        return;
    }
    window.__COLLECT_LOADED__ = true;

    // [v34.5] Early exit for empty-hostname iframes (ad trackers, about:blank, etc.)
    if (!window.location.hostname && window.self !== window.top) {
        return;
    }

    
    // [v17.3] Global asynchronous storage getter to avoid ReferenceError in applyJPFilter
    const storagePromise = chrome.storage.local.get(['language', 'keyword', 'region']);

    console.log(`[Content] Script Loaded in Frame: ${window.location.href} (Top: ${window.top === window})`);
    
    // Send READY signal with retries for late-loading frames
    let readyRetries = 0;
    const sendReady = () => {
        try { 
            chrome.runtime.sendMessage({ action: 'engineStatus', status: 'ready' }); 
            if (readyRetries < 3) {
                readyRetries++;
                setTimeout(sendReady, 1500); // Retry every 1.5s
            }
        } catch (e) { }
    };
    sendReady();

    const hostname = window.location.hostname;
    const url = window.location.href;
    const isMainFrame = (window.self === window.top);

    // [v34.5] Extraction-done flag to prevent repeated extraction on the same page
    let _extractionDone = false;

    // ==========================================
    // [Web Link Collector v8.3]
    // Iframe-Aware Communication & Robust Selectors
    // ==========================================

    const filterOut = [
        '.gov', '.go.kr', '.mil', '.edu', '.ac.kr', 'facebook.com', 'instagram.com', 'twitter.com', 'x.com',
        'youtube.com', 'tiktok.com', 'linkedin.com', 'pinterest.com', 'reddit.com', 'amazon.', 'ebay.',
        'aliexpress.com', 'walmart.com', 'coupang.com',
        'wikipedia.org'
    ];

    const portalDomains = [
        'blog.naver.com', 'cafe.naver.com', 'blog.daum.net', 'tistory.com', 'brunch.co.kr',
        'modoo.at', 'instagram.com', 'facebook.com', 'youtube.com', 'twitter.com', 'x.com',
        'line.me', 'post.naver.com', 'myplace.naver.com'
    ];

    const krAddrRegex = /(([가-힣]+(시|도|특별자치시|특별자치도)\s+)?([가-힣]+(시|군|구)\s+)?([가-힣\d]+(읍|면|동|가|리)\s+)?([가-힣A-Za-z\d]+(로|길|대로)\s+[\d-]+|[가-힣\d]+(동|가|리|읍|면)\s+[\d-]+)(\s*번지)?(\s*,?\s*(지하\s*)?[\d가-힣A-Za-z]+(층|호|동|빌딩|센터|타워|아파트|상가|프라자|스퀘어|파크|관|단지))?(\s*[\d가-힣A-Za-z]+(호|층))?)/;

    // ==========================================
    // [Localization System]
    // ==========================================
    let _hl = 'en';
    const LOG = {
        naverFound: { ko: '[네이버지도] {n}개의 리스트 아이템 발견', ja: '[ネイバー地図] {n}件のリストアイテムを検出', en: '[Naver Maps] {n} list items found' },
        yahooFound: { ko: '[야후검색] {n}개의 결과 발견', ja: '[Yahoo検索] {n}件の結果を検出', en: '[Yahoo Search] {n} results found' },
        googleMapFound: { ko: '[구글지도] {n}개의 리스트 아이템 발견', ja: '[Googleマップ] {n}件のリストアイテムを検出', en: '[Google Maps] {n} list items found' },
        generalFound: { ko: '[일반검색] {n}개의 결과 발견', ja: '[一般検索] {n}件の結果を検出', en: '[General Search] {n} results found' },
        itemOk: { ko: '✅ [{i}] {name} | {addr}', ja: '✅ [{i}] {name} | {addr}', en: '✅ [{i}] {name} | {addr}' },
        placeholder_text_input: { ko: "업체명이 포함된 텍스트를 붙여넣으세요...", ja: "企業名を含むテキストを貼り付けてください...", en: "Paste text containing business names..." },
        engineStart: { ko: '{brand} 엔진 가동 중... (프레임: {frame})', ja: '{brand} エンジン稼働中... (Frame: {frame})', en: '{brand} engine running... (Frame: {frame})' },
        routeNaver: { ko: '[라우팅] 네이버 검색 → {n}개 추출', ja: '[ルーティング] Naver検索 → {n}件抽出', en: '[Routing] Naver search → {n} items' },
        routeYahoo: { ko: '[라우팅] 야후 검색 → {n}개 추출', ja: '[ルーティング] Yahoo検索 → {n}件抽出', en: '[Routing] Yahoo search → {n} items' },
        routeGoogle: { ko: '[라우팅] 구글 지도 → {n}개 추출', ja: '[ルーティング] Googleマップ → {n}件抽出', en: '[Routing] Google Maps → {n} items' },
        routeGeneral: { ko: '[라우팅] 일반 검색 → {n}개 추출', ja: '[ルーティング] 一般検索 → {n}件抽出', en: '[Routing] General search → {n} items' },
        detailMode: { ko: '[라우팅] 상세 페이지 모드 → {n}개 추출', ja: '[ルーティング] 詳細ページモード → {n}件抽出', en: '[Routing] Detail page mode → {n} items' }
    };

    function tl(key, vars = {}) {
        const template = (LOG[key] && LOG[key][_hl]) || (LOG[key] && LOG[key]['en']) || key;
        return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] !== undefined ? vars[k] : `{${k}}`);
    }

    let _currentKeyword = "";
    // [v66.5] No more manual storage get: Wait for background injection
    function log(msg) {
        try { chrome.runtime.sendMessage({ action: 'log', message: `🔍 [${hostname}] ${msg}` }); } catch (e) { }
    }

    const portalHostnameRegex = /baidu\.com|naver\.com|yahoo\.co\.jp|yahoo\.com|google\.|bing\.com|yelp\.com|linkedin\.com|facebook\.com|amazon\.|etsy\.com/;
    // [v12.3] Enhanced Domain Detection for iframe-heavy environments
    // [v34.6] Disable engine detection mode if in Enrichment phase (identified by _enrich marker)
    let isEngine = false;
    if (!url.includes('_enrich')) {
        isEngine = portalHostnameRegex.test(hostname) || 
                         hostname.includes('naver.com') || 
                         hostname.includes('yahoo.co.jp') ||
                         hostname.includes('yahoo.com') ||
                         hostname.includes('bing.com') ||
                         url.includes('place.naver.com') || 
                         url.includes('map.yahoo.co.jp');
    }

    // ======================
    // [JP] Japanese Search Engine Configuration
    // ======================
    const JP_ENGINE_CONFIG = {
        'baidu.com': {
            web: {
                container: '.result, .c-container, div[class*="result"]',
                name: 'h3.t a, h3, a[class*="title"], [class*="title"] a, .t a',
                address: '[class*="address"], .c-row .c-span-last, div[class*="addr"], .op-map-address',
                phone: '[class*="tel"], [class*="phone"]'
            },
            map: {
                container: 'div.SN-WEB-list-view-wrap, div#poi_list > li, [class*="list-view-wrap"] > li, .poi-item, .search-item, div.search-result > div',
                name: '.poi-name, h3, a[class*="poi-name"], div.name, span[class*="name"]',
                address: '.poi-address, .addr, div.address',
                phone: '.tel, .phone-btn, [class*="tel"]'
            }
        },
        'yahoo.co.jp': {
            web: {
                container: '.sw-CustomMap__item, .sw-Card, .sw-Result, .result, .sw-CardList__item, .searchCenterMiddle li, div.ov-b, .algo-sr, div.compTitle, #contents .w, #WS2m .dd, .sw-CustomFormatContainer, .AnswerGourmetListLocoMain__listItem, .sw-GourmetGLLoco, .sw-BrandCard, .sw-BusinessInfo, .sw-LocalPack, .AnswerLocalList__facilitiesFacility, .AnswerLocalList__listItem, .SearchResult, .sw-Result__item, .AnswerLocalList__facilitiesFacilityTitle, .AnswerLocalList__listItemTitle, .sw-CardList',
                name: '.sw-CustomMap__name, .sw-Card__titleInner, .sw-Card__title, .sw-Result__titleInner, .sw-Result__title, h4 span, h4, h3, h2, .sw-BusinessInfo__title, .AnswerGourmetListLocoMain__title, .sw-BrandCard__title, .AnswerLocalList__facilitiesFacilityTitle, .sw-CustomFormatContainer__title, .AnswerLocalList__listItemTitle a, h1',
                address: '.sw-CustomMap__address, .sw-Card__address, .sw-BusinessInfo__address, .sw-Card__snippet, .address, .sw-BusinessInfo__subText, .sw-Result__address, .AnswerLocalList__facilitiesFacilityAddress, .AnswerLocalList__listItemAddress, .sw-Card__subText',
                phone: '.sw-Card__phone, .sw-BusinessInfo__phone, .sw-Result__phone, .AnswerLocalList__facilitiesFacilityTel, .AnswerLocalList__listItemTel, .sw-Card__tel',
                url: 'a.sw-CustomMap__name, .sw-Card__titleInner a, .sw-Card__title a, .sw-Result__titleInner a, .sw-Result__title a, a.sw-BusinessInfo__link, a[href*="profile.yahoo.co.jp"], a.AnswerLocalList__facilitiesFacilityTitle, a.AnswerLocalList__listItemTitle'
            },
            map: {
                container: 'section.sw-Card, li.SearchKeywordResults__listItem, button.SearchKeywordResults__listItemButton, .SearchKeywordResults__listItem, [class*="listItemButton"], li[class*="listItem"], [data-listing-id], .SearchKeywordResults__itemInfo, .AnswerLocalList__facilitiesFacility, .AnswerLocalList__listItem',
                name: 'div.SearchKeywordResults__listItemTitle, h4 span, h4, .sw-Card__titleInner, .SearchKeywordResults__listItemBusinessTitle, .SearchKeywordResults__itemInfoTitle, [class*="listItemName"], h3, strong, .SearchKeywordResults__itemTitle, .AnswerLocalList__facilitiesFacilityTitle',
                address: '.sw-Card__address, .SearchKeywordResults__itemInfoAddress, [class*="itemInfoAddress"]',
                phone: '.sw-Card__phone'
            }
        },
        'yahoo.com': {
            web: {
                container: '.algo, .compTitle, .ov-b, .algo-sr, .searchCenterMiddle li, [data-area="local_pack"], .dd.algo, li.algo-sr',
                name: 'h3 a, h3, .compTitle h3, [role="heading"], .title a',
                address: '.compAddress, .algo-sr cite, [data-feedback-id="maps_address"], .compInfo .fc-smoke',
                phone: '.compTel, [data-feedback-id="maps_phone"], .compInfo .fc-smoke'
            }
        },
        'google.': {
            web: {
                container: '.MjjYud:not(:has(div[data-hveid] .CIVr4d)), div.tF2Cxc, a.vwVdIc.wzN8Ac.rllt__link, div[role="listitem"], .yuRUbf, div.g, .ixGEHf, div.v7W49e, .mnr-c, .PYvS2b, .commercial-unit-desktop-top, .commercial-unit-desktop-rhs, .C89S9b, div.Nv2Ybe, [data-result-index], a.hfpxzc, .Tz5X9, .WwS6pf, .ULSxyf, .hlcw0c, .VkpSff, div[data-async-context] .g, div[data-feature-id="local-pack"] .uO797e, .L78S9c, .G88S9c, .Vj9S9b, .rllt__details',
                name: 'h3, .LC20lb, div.dbg0pd, div.dbg0pd span, .V8y49e, .bVj5Zb, .OSrXXb, .yK7X9b, .X69S9b, [role="heading"], .m768ob, .rllt__details h2, .rllt__details h3, a.zReHs h3, a.vwVdIc div.dbg0pd, .q7S9y h3, .yU7X9b, .V8y49e span, .tH672c, .rllt__details div:first-child, .X69S9b span, .OSrXXb span, [data-attrid="title"] span, .uO797e .A78S9b, .N69S9b, .V06Sdb, .qBF1Pd',
                url: 'a[href]',
                address: '[data-local-attribute="d3adr"] .Lrzca, .VwiC3b, .address, cite, .l_ecrd_txt_addr, .Lrzyb, [data-atp], .L78S9c, .y35z8c, .rllt__details div:nth-child(3), .W4P4ne, .uO797e, div.Lrzca, .xX7Y2a, .yU7X9b .Z26q7c, .VwiC3b span, .VwiC3b div, .Lrzca span, .rllt__details > div:nth-child(2), .dv-priv',
                phone: '[data-local-attribute="d3ph"] .Lrzca, .L_ecrd_txt_tel, .Lrzyb, [data-dtype="d3ph"] span, .uO797e, .yU7X9b .Z26q7c:last-child, .Lrzca span, .rllt__details span, [data-local-attribute="d3ph"] span',
                snippet: '.VwiC3b, .st, .MUwY0b, .yU7X9b span'
            },
            map: {
                container: 'a.vwVdIc.wzN8Ac.rllt__link, div[role="article"], [data-result-index], div[role="feed"] > div, a.hfpxzc, .m6QErb, div.Nv2Ybe, .section-result, .UaP9ae, .bfV2D, .T7S9b, .VkpSff, .C89S9b, .vwVdIc.wzN8Ac.rllt__link, div.IsZ6hd, div.X69S9b, .rllt__details, .VkpSff, [role="listitem"], .m6QErb .V06Sdb, [aria-label="Results for"] div',
                name: 'h1.DUwDvf, a.hfpxzc[aria-label], .fontHeadlineSmall, div.dbg0pd, div.dbg0pd span, .OSrXXb, .tH672c, .V06Sdb, [role="heading"], div.qBF1Pd, a.hfpxzc, .rllt__details h2, .rllt__details h3, .section-result-title span, .A78S9b, .X69S9b, .rllt__details div:first-child, .rllt__details span, [role="heading"] span, .NR70f',
                address: '[data-local-attribute="d3adr"] .Lrzca, button[data-item-id="address"], button[aria-label^="Address:"], .fontBodyMedium, .rllt__details div:nth-child(3), .Lrzyb, .W4P4ne, .uO797e, .address, .Io6YTe, .xX7Y2a, .section-result-location, .section-result-street-address, .Lrzca span, .fontBodyMedium div, .rllt__details > div:nth-child(2), .WpE96c',
                phone: '[data-local-attribute="d3ph"] .Lrzca, button[data-item-id^="phone:tel:"], button[aria-label^="Phone:"], .L_ecrd_txt_tel, .Lrzyb, [data-dtype="d3ph"] span, .uO797e, .section-result-phone-number, .Lrzca span, .rllt__details span, [data-local-attribute="d3ph"] span',
                rating: 'span.ceNzR, .MWY9ec .Aq14f, .MWY9ec .fontBodyMedium span, .cards-rating-score',
                category: 'button.DkEaL, div.rllt__details div:nth-child(2), .W4P4ne .fontBodyMedium, .section-result-details'
            }
        },
        'bing.com': {
            web: {
                container: 'li.b_algo, .b_algo[data-bm-id], .b_entityTP, .b_localpack, .b_localpack i, .b_scard, .l_stcl, .b_p_ll_item, [role="listitem"].b_vlist_item, [class*="PlaceList"] li, li.b_listing, [data-area="local_pack"], .b_place_card, .b_vList_vertical li, .b_vList li, .b_tp_container, .b_ans, .b_vlist_row, .b_vList_overlay, .b_image_container, .b_ans.b_map, .local_pack, [aria-label*="Listing"], .sb_add, [id^="vg_"], .pa_item, .b_ad, div.b_entitySubTitle, div.bm_listing_card, .b_algo, .b_vlist_item',
                name: 'h2 a, h3 a, h2, h3, .b_scardh, .l_sttitle, .b_p_ll_title, .b_entityTitle a, .b_vlist_title a, .b_vlist_title, .sb_exp_title, .b_adtitle a, [role="heading"] a, .l_ecrd_txt_title, .listing-title, [class*="title"]:not(cite), [role="heading"], .b_factrow a[href], .b_vlist_title p span, .b_scardh p span, [aria-label*="Listing"], .b_entityTitle, .b_lpo h2, .b_lpo a, .ad_title, .b_algo span, .b_entitySubTitle span, .b_vlist_title span',
                address: '.b_address, .l_staddr, .b_p_ll_address, .b_vlist_address, .b_caption, .b_factrow, cite, [class*="address"], .l_ecrd_txt_addr, .b_place_card_address, [data-feedback-id="maps_address"], .b_h_adr, .b_factrow div, .b_vlist_subtitle, .b_vList_subtitle, .b_entitySubTitle, .b_address span, .b_adaddress, [role="heading"] + div, .b_factCards address',
                phone: '.b_phone, .l_sttel, .tel, [data-feedback-id="maps_phone"], .b_h_ph, .b_factrow span, .b_vlist_tel, .b_vList_tel, .b_entitySubTitle > span, .b_adtel, .b_address + div, [data-event-id="phone_click"]',
                website: 'a[aria-label="Website"], a[aria-label="WEBSITE"], .l_stweb, .ent_site, .b_place_card_website, a.b_wide_pill[href*="http"], a.b_btn_action[title*="Website"], .b_adurl, .b_vlist_website'
            },
            map: {
                container: 'button[class*="listingContent"], .overlayContainer:not(.sb_vheader), [role="listitem"]:not(.sb_vheader), .b_place_card, [data-entity-id], .sc_place_card, .sc_lst_card, .sc_lst_item, [aria-label*="Listing"], .b_algo, div.l_stcl, .b_vList li, [class*="EntityCard"], [class*="TitleContent"], .entityCardContainer, [data-id*="listing"], [class*="ListingItem"], div#bm_listing_container li, div.bm_listing_card, .b_vList > li, .bm_listing_card_container, div[data-bm-id], [aria-label*="Search results"] > div, .b_search_result_item, .ls_item_wrapper',
                name: 'button[title], [role="heading"]:not(.sb_vheader), .title:not(.sb_vheader), .name, .listing-title, h2:not(.sb_vheader), h3:not(.sb_vheader), h2, h3, .b_scardh, .b_entityTitle, .b_ad_title, .listing-item-title, .overlay-title, .b_vlist_title, [class*="title"] li p, .b_scardh2, .b_pcardtitle, .sc_title, [aria-label*="Listing"], .b_factrow h2, .b_lpo h2, .b_lpo a, [class*="title"], [class*="NameContent"], .b_vlist_title span, .bm_listing_card_title, .bm_listing_card_name, .b_listing_title, .b_vlist_title p span',
                address: '.address, .addr, .location, [class*="address"], .b_address, .b_factrow, .b_caption, .overlay-address, .b_vlist_address, .l_staddr, .b_adr, .b_vlist_subtitle, .sc_address, .sc_location, .b_vList_subtitle, [data-feedback-id="maps_address"], [class*="Address"], .b_address span, .bm_listing_card_address, .b_listing_address, .b_vlist_subtitle span',
                phone: '.phone, .tel, .b_phone, .b_factrow, .overlay-phone, .l_sttel, .b_vlist_tel, .sc_phone, .sc_tel, .b_vList_tel, [data-feedback-id="maps_phone"], [class*="Phone"], .b_phone span, .bm_listing_card_phone, .b_listing_phone, [data-event-id="phone_click"]'
            }
        },
        'naver.com': {
            web: {
                container: 'li.UE79T, div.n_smart_block li, li[data-ssc*="sc.web"], [data-place-id], div[class*="fender-ui"] li, li[data-ssc], li.Hb6SA, div.UEzoS, li.UEzoS, div.Ryr1F li, .VL7Z_, .UE7vM',
                name: 'a.YTJkH span, span.TYp9e, a.MVx6e span, a.kcGpfndGIq5CMShAt6FA, a.IwVftgCjwVRwFonNoMko, a[role="heading"], h3, .api_title, .title, a > span.TYaxT, .place_bluelink, .YU86f, .C89S9b',
                address: '.place_address, .address, .fds-vlist-base-item-sub-title, .fds-list-item-sub-title, .addr, [class*="address"], .LDgIH, span.Pb4bU, .VwiC3b, .UaP9ae',
                phone: '.fds-vlist-base-item-tel, .fds-list-item-tel, .tel, [class*="tel"], .place_list_item_tel, .xl88P'
            },
            map: {
                container: 'li.UE79T, li.Hb6SA, div.UEzoS, li.UEzoS, div.Ryr1F li, [class*="PlaceList"] li, .item_place, ._place_list_item, div.Ryr1F, .view_wrap, li.UE7vM, li.VL7Z_, [data-place-id], .C89S9b',
                name: 'a.YTJkH span, span.TYp9e, .TYaxT, a.MVx6e span, span.TY79e, .place_bluelink, .place_list_item_name, h3, .api_title, span.TYW96, span.Y_uST, .fontHeadlineSmall',
                address: '.LDgIH, span.Pb4bU, .place_address, span.LDvAH, .fontBodyMedium',
                phone: '.place_list_item_tel, [class*="tel"], span.xl88P, button[data-item-id^="phone:tel:"]'
            }
        }
    };

    function stripRanking(name) {
        if (!name) return "";
        let n = name.trim();

        const noisePrefixRegex = /^([【\[\(（［「『].*?[】\]\)］）」』]|\s*(公式|PR|광고|広告|AD|予約|無料|限定|おすすめ)\s*[:：]?\s*|[①-⑳][\s\n]*|[・．]\s*)+/gi;
        let prev;
        do {
            prev = n;
            n = n.replace(noisePrefixRegex, "");
        } while (n !== prev && n.length > 0);

        const splitMatch = n.match(/^(.{2,12})\s*[:：]\s*(.+)$/);
        if (splitMatch) {
            const cat = splitMatch[1].trim();
            const shop = splitMatch[2].trim();
            if (/(ヨガ|ピラティス|ジム|レストラン|カフェ|居酒屋|病院|塾|スクール|教室)/.test(cat) || cat.length <= 5) {
                n = shop;
            }
        }

        n = n.replace(/^[\d０-９]{1,3}([．\.\s\n\)\-］\]：:／/]|[^\w\s\u3040-\u30ff\u4e00-\u9faf])+\s*/, "");
        n = n.replace(/^(\d+|[A-Z])\.?\s+/, ""); // [v28.2] Handle "1. ", "A. " prefixes for generic lists

        if (/^[【\[\(（［\「\『]/.test(n) && /[】\]\)］）\」\』]$/.test(n)) {
            const inner = n.slice(1, -1);
            if (!/[【\[\(（［\「\『]/.test(inner) && !/[】\]\)］）\」\』]/.test(inner)) {
                n = inner;
            }
        }

        n = n.replace(/[\s|｜\-：:／/]+(の検索結果|の一覧|について|に関連하는|의 예약|핫페퍼|타베로그|구루나비|Yahoo!検索|Google 検索|Bing 検索|TripAdvisor|Yelp|Tabelog|Hot Pepper|Official Site|Official Website|사이트|홈페이지|위치|지도|의(추천|가이드|상세|리뷰|예약|메뉴|정보|액세스|평가|특집|정리|비교)|の(おすすめ|ランキング|人気|詳細|情報|口コミ|アクセス|評価|ガイド|特集|まとめ|比較|메뉴)).*$/i, "");
        n = n.replace(/\s*[\|｜\-：:／/]\s*$/, "");
        n = n.replace(/\s*[·・\s]\s*([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}.*$/, ""); // [v42.0] Strip " · domain.com"
        // [v49.0] English exclusion is now handled in the validator, but we can do a preemptive check here too if needed.
        n = n.replace(/\s*-\s*(Yahoo!検索|Google 検索|Bing 検索|TripAdvisor|Yelp|Tabelog|Hot Pepper|Official Site|Official Website)$/i, "");
        n = n.replace(/\s+의 (상세|추천|인기|정보|액세스|예약|리뷰|랭킹|메뉴)$/i, "");

        return n.trim();
    }


    async function applyJPFilter(results) {
        // [v17.2] Wait for storage initialization
        const storage = await storagePromise;
        const hl = storage.language || 'en';
        // [v66.9] Priority to passed _currentKeyword if available, else fallback to storage
        const keyword = _currentKeyword || storage.keyword || '';
        const blacklist = (typeof GLOBAL_BLACKLIST_SET !== 'undefined' ? Array.from(GLOBAL_BLACKLIST_SET) : []);
        
        if (typeof isViableBusinessName !== 'function') {
            log(`Critical: isViableBusinessName missing!`);
            return results;
        }
        const filtered = results.filter(r => {
            // [v17.2] CRITICAL: Pass source: 'search_engine' to protect CJK names in EN locale
            const feedback = { ruleId: '', reason: '', pass: false, source: 'search_engine' };
            const ok = isViableBusinessName(r.name, hl, blacklist, keyword, feedback);
            
            // [v31.3-v34.4] Force allow search engine results if they have basic integrity, 
            // BUT UNCONDITIONALLY REJECT if they fail the new Ultra-Strict rules (KO-UL or JA-UL)
            // AND Also REJECT if they fail the new Search Engine Noise rules (KO-NOISE) [v34.4]
            // AND MUST REJECT if they fail the new Keyword Match rule (KO-STRICT-KW) [v66.9]
            if (!ok) {
                const isUltraStrictFail = feedback.ruleId && (feedback.ruleId.startsWith('KO-UL') || feedback.ruleId.startsWith('JA-UL'));
                const isEngineNoiseFail = feedback.ruleId === 'KO-NOISE';
                const isStrictKWMismatch = feedback.ruleId === 'KO-STRICT-KW';
                
                // [v66.9] Strongly apply filter: No Forced Accepted if Keyword match failed or if HL is KO/KR/ZH/JA
                const isKorean = (hl === 'ko' || hl === 'kr');
                const isChinese = (hl === 'zh' || hl === 'cn');
                const isJapanese = (hl === 'ja');
                const isNoiseFail = feedback.ruleId && (feedback.ruleId.includes('NOISE') || feedback.ruleId === 'GEN-03' || feedback.ruleId === 'GEN-LOGIC-NOISE');
                
                if (isKorean || isChinese || isJapanese || isUltraStrictFail || isNoiseFail || isStrictKWMismatch) {
                    log(`[Filter] Rejected: "${r.name}" -> Reason: ${feedback.reason || 'Unknown'} (Rule ${feedback.ruleId || 'N/A'})`);
                    return false;
                }

                // [v36.6] Final manual safety net - expanded with countries and global UI noise
                const manualNoiseRegex = /^(ads|광고|지도|결과|추천|메뉴|홈|设置|语言选择|无障碍|帮助|反馈|导航|页脚|Settings|Accessibility|Privacy|Terms|Menu|Help|Feedback|Login|Signup|Search|China|UK|USA|Japan|Korea|Australia|Canada|France|Germany|Italy|Spain|Africa|Asia|Europe|America|Services|Products|Portfolio|About|Careers|Contact|FAQ)$/i;
                if (r.name && r.name.length >= 2 && !manualNoiseRegex.test(r.name)) {
                    log(`[Filter] Forced Accepted (Search Engine): "${r.name}" (Even if Rule ${feedback.ruleId} failed)`);
                    return true;
                }
                log(`[Filter] Rejected: "${r.name}" -> Reason: ${feedback.reason || 'Unknown'} (Rule ${feedback.ruleId || 'N/A'})`);
                return false;
            } else {
                log(`[Filter] Accepted: "${r.name}"`);
                return true;
            }
        });
        log(`Filter: ${results.length} -> ${filtered.length} items`);
        return filtered;
    }

    function extractByConfig(items, config) {
        let results = [];
        items.forEach(item => {
            try {
                let nameEl = item.querySelector(config.name);
                // [v29.0] Tightened fallback: Only search for h3/heading, not generic strong/title/span
                if (!nameEl) {
                    nameEl = item.querySelector('a[href*="place.naver.com"] span, h3, [role="heading"]');
                }
                if (!nameEl) {
                    log(`  ❌ No name element in item container.`);
                    return;
                }
                
                let nameHtml = "";
                if (nameEl) {
                    nameHtml = nameEl.getAttribute('aria-label') || nameEl.innerText || nameEl.textContent || nameEl.getAttribute('title') || "";
                }
                
                // [v66.1] Priority 1 Fallback: Recursive find if element found but empty
                if (!nameHtml.trim() && nameEl) {
                    const spanMatch = nameEl.querySelector('span');
                    if (spanMatch) nameHtml = spanMatch.innerText || "";
                }

                // [v66.1] Priority 2 Fallback: Check container itself for title (Common in Bing result buttons)
                if (!nameHtml.trim()) {
                    nameHtml = item.getAttribute('title') || item.getAttribute('aria-label') || "";
                }
                let name = stripRanking(nameHtml.trim().split('\n')[0]);
                if (!name || name.length < 2) {
                    log(`  ❌ Invalid name length: "${name}"`);
                    return;
                }
                const anchor = item.querySelector('a[href]');
                let href = anchor ? anchor.href : '';
                if (nameEl.tagName === 'A') href = nameEl.href;
                if (filterOut.some(f => href.toLowerCase().includes(f))) return;
                let address = '-';
                if (config.address) {
                    const addrEl = item.querySelector(config.address);
                    if (addrEl) {
                        address = addrEl.innerText.trim().replace(/^Address:\s*/i, '');
                    }
                }
                if (address === '-') {
                    const enAddrMatch = item.innerText.match(/\d+[\w\s,]+(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct|Place|Pl|Square|Sq|Circle|Cir|Highway|Hwy|Pkwy|Loop|Trail|Parkway)[\w\s,]+[A-Z]{2}\s*(\d{5})?/i);
                    const jpMatch = item.innerText.match(/[都道府県].{1,8}[市区町村].{1,12}([\d-]+)|([市区町村].{1,12}[\d-]+(丁目|番地|号))/);
                    if (enAddrMatch) address = enAddrMatch[0];
                    else if (jpMatch) address = jpMatch[0];
                }
                const phoneEl = config.phone ? item.querySelector(config.phone) : null;
                let phone = phoneEl ? phoneEl.innerText.trim().replace(/^(Phone|Tel):\s*/i, '') : '';
                if (!phone) {
                    const phoneMatch = item.innerText.match(/(?:\+|)\d{0,3}[\s.-]?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{4}/) || item.innerText.match(/0\d{1,4}-\d{1,4}-\d{4}/);
                    phone = phoneMatch ? phoneMatch[0] : '';
                }

                // [v17.0] Rich Metadata (Rating, Category, Social)
                let rating = '';
                if (config.rating) {
                    const ratingEl = item.querySelector(config.rating);
                    if (ratingEl) rating = ratingEl.innerText.trim();
                }

                let category = '';
                if (config.category) {
                    const catEl = item.querySelector(config.category);
                    if (catEl) category = catEl.innerText.trim();
                }

                // Social Links Extraction
                let sns = [];
                const socialAnchors = item.querySelectorAll('a[href*="facebook.com"], a[href*="instagram.com"], a[href*="twitter.com"], a[href*="x.com"], a[href*="youtube.com"], a[href*="line.me"]');
                socialAnchors.forEach(a => {
                    if (!sns.includes(a.href)) sns.push(a.href);
                });

                results.push({
                    name,
                    url: href || url,
                    address,
                    note: phone,
                    rating: rating,
                    category: category,
                    sns: sns.join(', ')
                });
            } catch (e) { log(`Extraction Error @ item: ${e.message}`); }
        });
        log(`Extracted ${results.length} candidates from DOM before filters.`);
        return results;
    }

    async function extractNaverMapResults() {
        const results = [];
        let items = Array.from(document.querySelectorAll('li.Hb6SA, div.UEzoS, li.UEzoS, div.Ryr1F li, [class*="PlaceList"] li, .item_place, ._place_list_item, .q_X49, .C89S9b'));
        if (items.length === 0) {
            items = Array.from(document.querySelectorAll('li')).filter(li => li.querySelector('.TYaxT, span.TY79e, .place_bluelink, .place_list_item_name, .YTJkH, .MVx6e'));
        }
        items.forEach((item) => {
            try {
                const nameEl = item.querySelector('.TYaxT, span.TY79e, .place_bluelink, h3, [role="heading"], strong, .fds-vlist-base-item-title, .fds-list-item-title, .YTJkH, .MVx6e, a > span:first-child');
                if (!nameEl) return;
                const name = stripRanking(nameEl.innerText.trim().split('\n')[0]);
                if (!name || name.length < 2) return;

                const anchor = item.querySelector('a.place_bluelink, a[class*="place_bluelink"], a[href*="place.naver.com"], a[href*="http"], .fds-vlist-base-item-title a');
                let placeUrl = anchor ? anchor.href : `https://search.naver.com/search.naver?query=${encodeURIComponent(name)}`;
                
                const addrEl = item.querySelector('.LDgIH, span.Pb4bU, .place_address, .fds-vlist-base-item-sub-title, .fds-list-item-sub-title');
                let address = addrEl ? addrEl.innerText.trim() : '-';
                
                const phoneEl = item.querySelector('.fds-vlist-base-item-tel, .fds-list-item-tel, [class*="tel"]');
                let phone = phoneEl ? phoneEl.innerText.trim() : '';
                if (!phone) {
                    const pMatch = item.innerText.match(/(02|0\d{1,2})-\d{3,4}-\d{4}/);
                    phone = pMatch ? pMatch[0] : '';
                }
                
                results.push({ name, url: placeUrl, address, note: phone });
            } catch (e) { }
        });
        return await applyJPFilter(results);
    }

    async function extractGeneralResults() {
        const engine = Object.keys(JP_ENGINE_CONFIG).find(h => hostname.includes(h));
        if (engine) {
            const isMapUrl = url.includes('/maps/') || url.includes('place.naver.com') || url.includes('/maps?') || url.includes('tbm=lcl');
            const maxWait = isMapUrl ? 22000 : 12000;
            const pollInterval = 1000;
            const config = isMapUrl ? (JP_ENGINE_CONFIG[engine].map || JP_ENGINE_CONFIG[engine].web) : JP_ENGINE_CONFIG[engine].web;

            let items = [];
            try {
                items = Array.from(document.querySelectorAll(config.container));
                log(`[DOM] Found ${items.length} containers using selector: ${config.container}`);
                if (items.length === 0) {
                    // [v51.1] Aggressive Fallback for Google (div.g no longer exists, use .MjjYud)
                    if (hostname.includes('google.')) {
                        items = Array.from(document.querySelectorAll('.MjjYud, div.tF2Cxc, .yuRUbf, a.vwVdIc, .rllt__link, div[role="listitem"], [role="article"], div.g'));
                        log(`[DOM] Fallback: Found ${items.length} items using secondary selectors.`);
                    }
                }
            } catch (e) {
                log(`Selector error: ${e.message}`);
                items = [];
            }
            
            // [v25.2] Deep Link Recovery (Naver/Google) - Always run for Naver to ensure Fender UI coverage
            if (items.length === 0 || hostname.includes('naver.com')) {
                try {
                    if (hostname.includes('naver.com')) {
                        const links = document.querySelectorAll('a[href*="place.naver.com"], a[role="heading"], a.YTJkH.CtW3e, a.MVx6e.CtW3e, a[class*="IwVftg"], a[class*="kcGpfnd"]');
                        links.forEach(a => {
                            const container = a.closest('li, section, article, div.api_subject_bx > div, ._lp_item, .bx, .n_smart_block, div[class*="fender-ui"], .view_wrap, div');
                            if (container && !items.includes(container)) items.push(container);
                        });
                    } else if (hostname.includes('google.')) {
                        const links = document.querySelectorAll('a[href*="/maps/place/"], a.vwVdIc, .rllt__link, a.hfpxzc, .MjjYud a[href]');
                        links.forEach(a => {
                            const container = a.closest('.MjjYud, div.tF2Cxc, .yuRUbf, div[data-hveid], a.vwVdIc, div[role="listitem"]');
                            if (container && !items.includes(container)) items.push(container);
                        });
                    }
                } catch (e) { log(`Recovery Error: ${e.message}`); }
            }

            if (items.length > 0) {
                log(`Raw items found: ${items.length}`);
            }
            let results = [];
            try {
                results = extractByConfig(items, config);
            } catch (e) { log(`Extraction Loop Error: ${e.message}`); }

            // Yahoo JP Local Pack/Gourmet Fallback
            if (results.length === 0 && engine === 'yahoo.co.jp') {
                const subItems = document.querySelectorAll('.AnswerLocalList__facilitiesFacilityTitle, .AnswerLocalList__listItemTitle a, h4.AnswerGourmetListLocoMain__title a');
                subItems.forEach(el => {
                    const n = stripRanking(el.innerText.trim());
                    if (n && n.length >= 2) {
                        const parent = el.closest('a, .AnswerLocalList__facilitiesFacility, .AnswerLocalList__listItem, .AnswerGourmetListLocoMain__listItem');
                        let h = (parent && parent.href) ? parent.href : (el.tagName === 'A' ? el.href : '');
                        results.push({ name: n, url: h || url, address: '-', note: '' });
                    }
                });
            }
            // [v66.4] Ultimate Safety Net: Regex Fallback if Selectors fail
            if (results.length === 0) {
                log(`[Fallback] Selectors found 0 items. Starting Regex-based Text Scan...`);
                const bodyText = document.body.innerText || "";
                const lines = bodyText.split(/[\n\r]+/).map(l => l.trim()).filter(l => l.length > 2 && l.length < 100);
                
                lines.forEach(line => {
                    // Try to identify business-like lines using dictionary & heuristics
                    const ok = isViableBusinessName(line, _hl, [], _currentKeyword);
                    if (ok) {
                        const finalName = (typeof ok === 'string') ? ok : line;
                        results.push({ name: finalName, url: url, address: '-', note: '[TextScan]' });
                    }
                });
                log(`[Fallback] Regex Scan found ${results.length} candidates.`);
            }
            return await applyJPFilter(results);
        }

        // Generic fallback
        let items = document.querySelectorAll('div.g, [role="article"], .result, li.bx, .b_algo');
        let results = [];
        items.forEach(item => {
            try {
                const nameEl = item.querySelector('h3, h2, [role="heading"], strong, .title');
                const anchor = item.querySelector('a[href]');
                if (!anchor || !nameEl) return;
                const name = stripRanking(nameEl.innerText.trim());
                results.push({ name, url: anchor.href, address: '-', note: '' });
            } catch (e) { }
        });
        return await applyJPFilter(results);
    }


    async function performExtraction(retryCount = 0, injectedData = null, targetOption = 'all') {
        // [v34.5] Skip if extraction already completed on this page (prevents infinite repeat)
        if (_extractionDone && !injectedData) {
            return;
        }

        // [v34.6] Ultimate iframe protection: Block ALL extraction from iframes except specific map frames
        if (!isMainFrame) {
            const isMapIframe = window.location.href.includes('map.naver.com') || window.location.href.includes('place.naver.com') || window.location.href.includes('google.com/maps');
            if (!isMapIframe) {
                 return;
            }
        }
        
        if (injectedData) {
            if (injectedData.hl) _hl = injectedData.hl;
            if (injectedData.keyword) _currentKeyword = injectedData.keyword;
        }

        // [v61.0] Early Auto-Scroll for Naver to load infinite lists
        if (retryCount === 0 && (hostname.includes('search.naver.com') || hostname.includes('place.naver.com'))) {
            await autoScroll();
        }

        // [v28.3] Smart Polling for Dynamic Containers
        const engine = Object.keys(JP_ENGINE_CONFIG).find(h => hostname.includes(h));
        if (engine && retryCount === 0) {
            const isMap = url.includes('/maps/') || url.includes('/maps?') || url.includes('/maps/search') || url.includes('tbm=lcl') || url.includes('tbs=lrf') || url.includes('map.naver') || url.includes('map.yahoo');
            const config = isMap ? (JP_ENGINE_CONFIG[engine].map || JP_ENGINE_CONFIG[engine].web) : JP_ENGINE_CONFIG[engine].web;
            
            log(`[Polling] Waiting for container: ${config.container}...`);
            let found = false;
            for (let i = 0; i < 15; i++) { // Max 7.5s polling
                if (document.querySelector(config.container)) {
                    found = true;
                    log(`[Polling] Container found! Starting extraction.`);
                    break;
                }
                await new Promise(r => setTimeout(r, 500));
            }
            if (!found) log(`[Polling] Container not found after timeout. Proceeding anyway.`);
        }

        let engineBrand = 'General Search';
        if (hostname.includes('google.')) engineBrand = 'Google';
        else if (hostname.includes('yahoo.co.jp')) engineBrand = 'Yahoo Japan';
        else if (hostname.includes('bing.com')) engineBrand = 'Bing';
        else if (hostname.includes('naver.com')) engineBrand = 'Naver';

        let engineLabel = 'general';
        if (hostname.includes('google.')) {
            if (hostname.includes('accounts.google.')) return; // Skip auth frames
            engineLabel = (url.includes('/maps') || url.includes('tbm=lcl') || url.includes('tbs=lrf')) ? 'google_maps' : 'google';
        }
        else if (hostname.includes('yahoo.co.jp')) engineLabel = 'yahoojp';
        else if (hostname.includes('naver.com')) engineLabel = 'naver';
        else if (hostname.includes('bing.com')) {
            engineLabel = url.includes('/maps') ? 'bing_maps' : 'bing';
        }

        const isGoogle = hostname.includes('google.');
        if (isGoogle && document.querySelector('.CIVr4d, [data-lmd]')) {
            log(`[SGE] AI Overview detected. Priority extraction initiated.`);
        }

        try {
            // [v28.1] Check for Naver Map specifically (Before extraction)
            if (hostname.includes('map.naver.com') || url.includes('place.naver.com')) {
                // [v66.8] Increased indicators: a.YTJkH is the main one now
                const count = document.querySelectorAll('li.UE7vM, li.VL7Z_, a.YTJkH, .Ryr1F, .UEzoS, li.Hb6SA').length;
                if (count === 0 && retryCount < 8) {
                    log(`Naver Map results not yet loaded (Count: 0). Retrying in 4s... (Attempt ${retryCount + 1}/8)`);
                    setTimeout(() => performExtraction(retryCount + 1), 4000);
                    return;
                }
                if (count > 0) log(`Naver Map detected ${count} indicators. Proceeding...`);
            }

            let bizNames = [];
            if (hostname.includes('map.naver.com') || url.includes('place.naver.com')) {
               bizNames = await extractNaverMapResults();
            } else {
               bizNames = await extractGeneralResults();
            }

            // [v13.5] Targeted Extraction Supplement: Scan for specific formats if requested
            if (['email', 'phone', 'sns', 'address'].includes(targetOption)) {
                log(`[Targeted] Supplemental scan for ${targetOption}...`);
                const fullText = document.body.innerText;
                let matches = [];
                if (targetOption === 'email') {
                    matches = fullText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
                } else if (targetOption === 'phone') {
                    const phoneRegex = (_hl === 'ko') ? /(0\d{1,4})-\d{3,4}-\d{4}/g : /(?:\+?1[-. ]?)?\(?[2-9][0-8][0-9]\)?[-. ]?[2-9][0-9]{2}[-. ]?[0-9]{4}/g;
                    matches = fullText.match(phoneRegex) || [];
                } else if (targetOption === 'sns') {
                    matches = fullText.match(/(facebook\.com|instagram\.com|twitter\.com|x\.com|youtube\.com|linkedin\.com)\/[a-zA-Z0-9._-]+/g) || [];
                } else if (targetOption === 'address' && _hl === 'ko') {
                    matches = fullText.match(/(([가-힣]+(시|도|특별자치시|특별자치도)\s+)?([가-힣]+(시|군|구)\s+)?([가-힣\d]+(읍|면|동|가|리)\s+)?([가-힣A-Za-z\d]+(로|길|대로)\s+[\d-]+|[가-힣\d]+(동|가|리|읍|면)\s+[\d-]+)(\s*번지)?(\s*,?\s*(지하\s*)?[\d가-힣A-Za-z]+(층|호|동|빌딩|센터|타워|아파트|상가|프라자|스퀘어|파크|관|단지))?(\s*[\d가-힣A-Za-z]+(호|층))?)/g) || [];
                }

                if (matches.length > 0) {
                    const unique = [...new Set(matches)];
                    log(`[Targeted] Found ${unique.length} direct matches.`);
                    unique.forEach(m => {
                        // Check if this match is already part of a found business to avoid duplicates
                        const alreadyFound = bizNames.some(b => (b.note && b.note.includes(m)) || (b.address && b.address.includes(m)));
                        if (!alreadyFound) {
                            bizNames.push({ name: "-", url: url, address: (targetOption === 'address' ? m : '-'), note: (targetOption !== 'address' ? m : ''), isTargetOnly: true });
                        }
                    });
                }
            }
            
            // [v13.0] Final Fallback: If CSS selectors found nothing, scan the entire page text for business-like patterns
            if (bizNames.length === 0) {
                log(`[Fallback] Selected engine found 0. Running literal text scan...`);
                const bodyText = document.body.innerText || "";
                const lines = bodyText.split(/[\n\r]+/).map(l => l.trim()).filter(l => l.length > 2 && l.length < 100);
                lines.forEach(line => {
                    const feedback = { ruleId: '', reason: '', pass: false, source: 'search_engine' };
                    const ok = isViableBusinessName(line, _hl, [], _currentKeyword, feedback);
                    if (ok) {
                        const finalName = (typeof ok === 'string') ? ok : line;
                        bizNames.push({ name: finalName, url: url, address: '-', note: '[TextScan]' });
                    }
                });
                if (bizNames.length > 0) {
                    log(`[Fallback] Literal text scan recovered ${bizNames.length} items!`);
                } else {
                    log(`[Fallback] Zero results after text scan. (Check console for rejection reasons)`);
                }
            }

            // [v36.0] Dynamic Scroll Fallback for Google Search
            if (isGoogle && bizNames.length < 3 && !url.includes('/maps')) {
                log(`[Scroll] Low results (${bizNames.length}). Scrolling down to reveal more...`);
                window.scrollTo(0, 1500);
                await new Promise(r => setTimeout(r, 1500));
                
                let extraRes = await extractGeneralResults();

                const existingNames = new Set(bizNames.map(r => r.name));
                extraRes.forEach(r => {
                    if (!existingNames.has(r.name)) {
                        bizNames.push(r);
                        existingNames.add(r.name);
                    }
                });
                log(`[Scroll] After scroll: ${bizNames.length} total items.`);
            }

            // [v24.0] Improved Polling/Heartbeat for dynamic engines (Bing/Maps)
            const isDynamic = engineLabel.includes('map') || engineLabel === 'bing';
            if (bizNames.length === 0 && isDynamic && retryCount < 4) {
                chrome.runtime.sendMessage({
                    action: 'engineStatus',
                    status: 'waiting',
                    engine: engineLabel,
                    retry: retryCount + 1,
                    isMainFrame: isMainFrame
                });
                setTimeout(() => performExtraction(retryCount + 1, injectedData, targetOption), 3000);
                return;
            }

            log(tl('engineStart', { brand: engineBrand + ' v12.1', frame: isMainFrame ? 'Main' : 'Iframe' }));

            // [v34.5] Mark extraction as done to prevent repeated extraction
            _extractionDone = true;

            chrome.runtime.sendMessage({
                action: 'engineSearchResult',
                results: bizNames,
                engine: engineLabel,
                frameUrl: url,
                isMainFrame: isMainFrame,
                status: bizNames.length > 0 ? 'success' : 'empty'
            });
        } catch (e) {
            log(`Extraction Error: ${e.message}`);
            // Send empty result on error to prevent hang
            chrome.runtime.sendMessage({
                action: 'engineSearchResult',
                results: [],
                engine: engineLabel,
                error: e.message,
                isMainFrame: isMainFrame,
                status: 'error'
            });
        }
    }

    if (isEngine) {
        // [v24.0] Heartbeat on load
        chrome.runtime.sendMessage({
            action: 'engineStatus',
            status: 'loaded',
            hostname,
            isMainFrame: isMainFrame
        });

        let delay = 1500;
        const isBing = hostname.includes('bing.com');

        if (hostname.includes('yahoo.co.jp') || hostname.includes('map.') || hostname.includes('naver.com')) delay = 5000;
        else if (hostname.includes('yahoo.com')) delay = 7000; // [v12.3] Yahoo US delay for English local pack loading
        else if (hostname.includes('google.')) delay = 3500;
        else if (isBing) delay = 10000; // [v12.3] Increased Bing delay for slow English systems in US/UK

        // Bing/Naver is now explicitly triggered from background OR uses a fallback timer
        setTimeout(() => performExtraction(0), delay);
    }

    async function autoScroll(maxScrolls = 5) {
        return new Promise((resolve) => {
            let count = 0;
            const interval = setInterval(() => {
                window.scrollTo(0, document.body.scrollHeight);
                // Trigger a slight movement to ensure lazy-loading fires
                window.scrollBy(0, -10);
                count++;
                if (count >= maxScrolls) {
                    clearInterval(interval);
                    resolve();
                }
            }, 500);
        });
    }

    // [v17.4] Global Listener moved to top of IIFE
    
    // chrome.runtime.onMessage.addListener((request, sender, sendResponse) => { ... });

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "GET_PAGE_TEXT") {
            // [v46.0] Ultra-Literal Visibility Capture (Copy All style)
            (async () => {
                try {
                    if (isEngine && isMainFrame) {
                        log("Ultra-Literal Mode: Scrolling and Stabilizing...");
                        await autoScroll(12);
                        await new Promise(r => setTimeout(r, 2000));
                    }
                    
                    // Priority 1: Mandatory structural headings
                    const headings = Array.from(document.querySelectorAll('h3, h2, [role="heading"], a.kcGpfndGIq5CMShAt6FA, a.IwVftgCjwVRwFonNoMko'))
                        .map(el => `[HEADING] ${el.innerText.trim()}`)
                        .join('\n');
                    
                    // Priority 2: Literal Selection Capture (The core of "Select All & Copy")
                    let selectionText = "";
                    try {
                        const selection = window.getSelection();
                        const range = document.createRange();
                        range.selectNodeContents(document.body);
                        selection.removeAllRanges();
                        selection.addRange(range);
                        selectionText = selection.toString();
                        selection.removeAllRanges(); 
                    } catch (e) { }

                    // Priority 3: Visual innerText fallback
                    let bodyText = document.body.innerText || "";
                    
                    const combinedText = `
### STRUCTURED ELEMENTS ###
${headings}

### LITERAL PAGE DUMP (SELECTION) ###
${selectionText}

### RENDERED TEXT DUMP ###
${bodyText}
`.substring(0, 95000);

                    sendResponse({ text: combinedText });
                } catch (e) {
                    sendResponse({ text: "" });
                }
            })();
            return true;
        }
    });

    // [v13.0] Double Handshake: Signal readiness instantly AND after 2 seconds to ensure background listener is active
    const signalReady = () => {
        chrome.runtime.sendMessage({ 
            action: 'engineStatus', 
            status: 'ready', 
            hostname, 
            isMainFrame: isMainFrame 
        }).catch(() => {});
    };
    
    signalReady();
    setTimeout(signalReady, 2000);

})();

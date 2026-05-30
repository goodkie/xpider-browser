/**
 * X PIDER Sender Pro - Content Script (V2.0 Advanced Engine)
 * Borrowing high-performance patterns from XSpider Pro core.
 */

(function() {
    console.log("🚀 [XpiderSender] Advanced Engine Loaded: " + window.location.href);

    // [v2.8.6] Concurrency Lock: Prevent multiple parallel processing cycles in the same tab
    const alreadyInitialized = window.__xpider_initialized;
    window.__xpider_initialized = true;

    // Initial signal to background that we are ready
    // [v6.0.0] Signal Flooding: Send READY multiple times to ensure sync on slow loads
    for (let i = 0; i < 6; i++) {
        setTimeout(() => {
            chrome.runtime.sendMessage({ action: 'SENDER_READY' });
        }, i * 500);
    }

    if (alreadyInitialized) {
        logDev("⚠️ [Engine] Suppressing duplicate setup (Signals re-sent).", "debug");
        return;
    }

    // [v1.6.2] Bulletproof Heartbeat - Keep background alive during slow operations
    function startHeartbeat() {
        setInterval(() => {
            logDev("💓 [Heartbeat] Engine active and processing...", "debug");
        }, 5000); // [v18.9.0] 5s Heartbeat for MV3 Service Worker survival
    }

    function logDev(msg, type = 'info') {
        try {
            chrome.runtime.sendMessage({
                action: 'SENDER_LOG',
                message: msg,
                logType: type
            });
            console.log(`[XpiderLog] ${msg}`);
        } catch (e) {}
    }

    // [XSpider Pro Pattern] High-priority contact candidates
    const CONTACT_KEYWORDS = {
        high: ['contact', 'inquiry', 'support', 'message', '문의', '연락', 'お問い合わせ', '留言', '联系', 'customer-service', 'write-to-us', 'feedback', 'help-center'],
        mid: ['about', 'help', 'company', 'service', 'info', 'directions', 'location', '오시는길', '회사소개', '고객센터', '도움말'],
        low: ['get-in-touch', 'mail', 'form', 'account', 'sign-up']
    };

    const FIELD_PATTERNS = {
        firstName: [/first.*name/i, /given.*name/i, /이름/i, /名前/i, /名/i, /nombre/i, /vorname/i, /prénom/i],
        lastName: [/last.*name/i, /family.*name/i, /surname/i, /성(?!명|함)/i, /苗字/i, /姓/i, /apellido/i, /nachname/i, /nom.*famille/i],
        name: [/name/i, /fullname/i, /성함/i, /氏名/i, /姓名/i, /user/i, /contact.*person/i, /nombre.*completo/i],
        email: [/email/i, /e-mail/i, /이메일/i, /メール/i, /邮箱/i, /correo/i, /courriel/i, /correo.*electrónico/i],
        subject: [/subject/i, /title/i, /제목/i, /件名/i, /主题/i, /topic/i, /asunto/i, /betreff/i, /objet/i],
        phone: [/phone/i, /tel/i, /mobile/i, /contact/i, /전화/i, /연락처/i, /電話/i, /手机/i, /电话/i, /teléfono/i, /telefon/i, /téléphone/i],
        message: [/message/i, /content/i, /body/i, /내용/i, /本文/i, /内容/i, /comment/i, /description/i, /text/i, /inquiry/i, /mensaje/i, /nachricht/i]
    };

    const DOMAIN_BLACKLIST = [
        'facebook.com', 'instagram.com', 'twitter.com', 'x.com', 'linkedin.com', 'youtube.com', 
        'tiktok.com', 'pinterest.com', 'whatsapp.com', 't.me', 'wa.me',
        'google.com', 'naver.com', 'daum.net', 'yahoo.com', 'bing.com',
        '.gov', '.go.kr', '.mil', '.edu', 'wikipedia.org',
        'github.com', 'wordpress.org', 'squarespace.com', 'wix.com', 'weebly.com', 'medium.com'
    ];

    // [v2.5.0] Branch Discovery Keywords
    const BRANCH_KEYWORDS = ['location', 'branch', 'office', 'direction', '지점', '위치', '오시는길', '찾아오시는길', '약도', '본사', '사업소'];

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'START_SENDING') {
            if (window.__xpider_running) {
                logDev("⚠️ [Engine] Already processing. Ignoring duplicate START_SENDING.", "warning");
                return;
            }
            window.__xpider_running = true;
            
            // [v17.6.0] Redirect Recovery
            const isVerificationMode = sessionStorage.getItem('xpider_pending_verify') === 'true';
            if (isVerificationMode) {
                logDev("🔄 [Engine] Post-Redirect Recovery active. Verifying previous attempt...", "info");
                detectSubmissionResult(null, request.template);
                return;
            }
            
            processCampaign(request.template, request.delayMs, request.triedUrl);
        }
    });

    function getSpeedProfile(delayMs) {
        const d = parseInt(delayMs) || 10000;
        return {
            field: Math.max(100, Math.floor(d / 20)), // [v18.7.5] 10s delay -> 500ms between fields
            hold: Math.max(500, Math.floor(d / 5))    // [v18.7.5] 10s delay -> 2000ms visual hold
        };
    }

    function normalizeUrl(url) {
        if (!url) return '';
        try {
            const u = new URL(url);
            return (u.origin + u.pathname).replace(/\/$/, '').toLowerCase();
        } catch (e) {
            return url.split('#')[0].replace(/\/$/, '').toLowerCase();
        }
    }

    async function discoverBranchLinks() {
        logDev("🔍 [Supreme-X 5.0] Scanning for multi-location / branch links...", "info");
        const links = queryAllDeep('a');
        const results = [];
        const currentOrigin = window.location.origin;
        const normalizedCurrent = normalizeUrl(window.location.href);

        for (const link of links) {
            const href = link.href || '';
            const text = (link.textContent || '').toLowerCase().trim();
            
            if (!href.startsWith(currentOrigin)) continue; // Keep within same domain
            
            // [v2.8.7] Normalize and avoid current page loop
            const normalizedHref = normalizeUrl(href);
            if (normalizedHref === normalizedCurrent) continue; 
            
            // [v2.9.1] Strict Domain Isolation for branch discovery
            try {
                if (new URL(href).origin !== currentOrigin) continue;
            } catch(e) { continue; }
            
            const isBranchLink = BRANCH_KEYWORDS.some(k => text.includes(k) || href.toLowerCase().includes(k)) && 
                                 !CONTACT_KEYWORDS.high.some(k => text.includes(k)); // Exclude main contact

            if (isBranchLink && results.length < 5) {
                if (!results.includes(href)) {
                    results.push(href);
                    logDev(`📍 [Supreme-X 5.0] Branch discovered: ${text} -> ${href}`);
                }
            }
        }
        return results;
    }

    async function safeNavigate(target, template) {
        const currentUrl = window.location.href;
        const currentPath = normalizeUrl(currentUrl);
        const targetPath = normalizeUrl(target);
        
        // [v2.9.6] Internal log for tracing
        console.log(`[Xpider] Navigating to: ${target}`);

        if (currentPath === targetPath && target.includes('#')) {
            logDev("🔗 [Engine] Hash-only (SPA) navigation detected. Re-triggering discovery...", "info");
            window.location.hash = target.split('#')[1] || '';
            setTimeout(() => {
                window.__xpider_running = false;
                processCampaign(template);
            }, 1500);
            return false; 
        } else {
            window.location.href = target;
            return true;
        }
    }

    async function guessDirectContactPaths(template) {
        // [v18.26.0] Logic Deprecated: Orchestration moved to background engine for persistence.
        return null;
    }

    // [v1.3.7] Shadow DOM Deep Search Utility
    function queryAllDeep(selector, root = document) {
        let nodes = [];
        try {
            nodes = Array.from(root.querySelectorAll(selector));
        } catch (e) {}

        const scan = (node) => {
            try {
                if (node.shadowRoot) {
                    try {
                        nodes = nodes.concat(Array.from(node.shadowRoot.querySelectorAll(selector)));
                    } catch (e) {}
                    Array.from(node.shadowRoot.children).forEach(scan);
                }
                Array.from(node.children || []).forEach(scan);
            } catch (e) {} // [v2.8.5] Resilience: Don't crash on protected components
        };
        
        try {
            Array.from(root.children || []).forEach(scan);
        } catch (e) {}
        return nodes;
    }

    async function cleanPageEnvironment() {
        logDev("🧹 [Cleaner] Scanning for intrusive overlays/popups...", "info");
        
        // [v17.7.0] Protected Elements: Never remove containers that contain actual inputs/forms
        const intrusiveSelectors = [
            '.wix-instant-popup', '.modal-overlay', '.cookie-banner', '#cookie-notice',
            '.sqs-announcement-bar', '.sp-popup-wrapper', '[class*="popup"]', '[id*="popup"]'
        ];
        
        // [v18.0.0] Protected Elements: Squarespace Modal & Lightbox Shield
        const isFormProtected = (el) => {
            const id = (el.id || '').toLowerCase();
            const cls = (el.className || '').toString().toLowerCase();
            const identifier = `${id} ${cls}`;
            return el.querySelector('input, textarea, select, canvas, iframe, .wpcf7-form, .gform_wrapper') || 
                   identifier.includes('sqs-modal') || identifier.includes('lightbox') || identifier.includes('yui3-');
        };

        intrusiveSelectors.forEach(sel => {
            document.querySelectorAll(sel).forEach(el => {
                if (isFormProtected(el)) return; // Protection logic
                const style = window.getComputedStyle(el);
                if (style.position === 'fixed' || style.zIndex > 1000) {
                    el.style.display = 'none';
                    logDev(`   - [Removed] Blocked intrusive element: ${sel}`);
                }
            });
        });
        
        // Remove high z-index blank overlays (with form protection)
        document.querySelectorAll('div').forEach(el => {
            if (isFormProtected(el)) return;
            const style = window.getComputedStyle(el);
            if (parseInt(style.zIndex) > 500 && (el.innerText || '').length < 10) {
                el.style.display = 'none';
            }
        });
    }

    async function triggerContactInteraction() {
        logDev("🔘 [Supreme-Scan] No form found. Attempting to trigger hidden contact containers...", "info");
        const triggerKeywords = [
            'contact', 'write', 'message', '문의', '연락', '보내기', 'inquiry',
            'escríbenos', 'contacto', // Spanish
            'kontakt', 'schreiben', // German
            'contattaci', // Italian
            'contacter', // French
            'お問い合わせ', '連絡', // Japanese
            '联系', '留言', // Chinese
            'tribeca', 'canarsie', 'marine park', 'location' // [v18.0.0] Regional location buttons
        ];
        
        // Search for buttons, links, and action-oriented spans/divs
        const possibleTriggers = queryAllDeep('button, a, div[role="button"], span.btn, .contact-btn, #contact-trigger, [class*="chat"], [id*="chat"], .support-trigger, .lightbox-handle, .sqs-block-button, .sqs-editable-button');
        
        for (const btn of possibleTriggers) {
            const text = (btn.textContent || btn.ariaLabel || '').toLowerCase().trim();
            const cls = (btn.className || '').toString().toLowerCase();
            const isIconTrigger = /chat|message|contact|support|mail/i.test(cls) || /chat|message|support/i.test(btn.id) || cls.includes('lightbox-handle');
            
            if (triggerKeywords.some(k => text.includes(k) && text.length < 25) || isIconTrigger) {
                logDev(`🎯 [Supreme-Scan 3.0] Activating high-probability trigger: "${text}" | Class: ${btn.className}`);
                try {
                    btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    // [v18.27.0] Navigation Signal: Alert background that a navigation is likely
                    chrome.runtime.sendMessage({ action: 'SENDER_LOG', message: "🚀 [Engine] Trigger clicked. Expecting navigation...", logType: "info" });
                    
                    btn.click();
                    // Multi-event firing for heavy JS frameworks
                    ['mouseenter', 'mousedown', 'mouseup', 'click'].forEach(evt => {
                        btn.dispatchEvent(new MouseEvent(evt, { bubbles: true, cancelable: true }));
                    });
                } catch(e) {}
                
                await new Promise(r => setTimeout(r, 1500)); 
                return true;
            }
        }
        return false;
    }

    async function closeIntrusivePopups() {
        logDev("🧹 [Cleaner] Scanning for intrusive overlays/popups...");
        const closeSelectors = [
            '.close', '.dismiss', '.X', '[aria-label*="close"]', '[class*="close"]', 
            '[id*="close"]', '.modal-close', '.popup-close', '.et_pb_close_button',
            '.happyforms-close'
        ];
        
        const buttons = queryAllDeep('button, a, span, div[role="button"]');
        let closedCount = 0;
        
        for (const btn of buttons) {
            const isMatch = closeSelectors.some(s => {
                try { return btn.matches(s); } catch(e) { return false; }
            });
            const text = (btn.textContent || '').toLowerCase().trim();
            if (isMatch || ['x', 'close', '닫기', '閉じる', '关闭'].includes(text)) {
                const style = window.getComputedStyle(btn);
                if (style.display !== 'none' && style.visibility !== 'hidden') {
                    btn.click();
                    closedCount++;
                }
            }
        }
        if (closedCount > 0) logDev(`✅ [Cleaner] Suppressed ${closedCount} intrusive elements.`);
    }

    async function checkAndRecoverPage() {
        const bodyText = document.body.textContent.toLowerCase();
        const errorKeywords = ['404 not found', 'page not found', 'forbidden', 'error 403', 'connection refused'];
        
        if (errorKeywords.some(k => bodyText.includes(k) && bodyText.length < 500)) {
            logDev("⚠️ [Recovery] Error page detected. Aborting path.", "error");
            finishCampaign(false, "Server Error / 404");
            return true;
        }
        return false;
    }

    async function processCampaign(template, delayMs = 10000, triedUrl = '') {
        try {
            const speed = getSpeedProfile(delayMs);
            const currentUrl = window.location.href;
            
            // [v2.9.8] Navigation Registry: Mark background-opened and current pages as visited
            const visited = JSON.parse(sessionStorage.getItem('xpider_guessed_paths') || '[]');
            const normalizedTried = normalizeUrl(triedUrl);
            const normalizedCurrent = normalizeUrl(currentUrl);

            if (normalizedTried && !visited.includes(normalizedTried)) visited.push(normalizedTried);
            if (normalizedCurrent && !visited.includes(normalizedCurrent)) visited.push(normalizedCurrent);
            sessionStorage.setItem('xpider_guessed_paths', JSON.stringify(visited));

            // [v1.6.5] Loop Protection: Check for recent successful submission on this path
            const lastSubmittedPath = sessionStorage.getItem('xpider_last_submit_path');
            const lastSubmitTime = parseInt(sessionStorage.getItem('xpider_last_submit_time') || '0');
            const now = Date.now();
            const submitCount = parseInt(sessionStorage.getItem('xpider_submit_count') || '0');
            
            // If we are on a path that was just submitted (within 20s)
            if (submitCount === 0 && lastSubmittedPath && currentUrl.includes(lastSubmittedPath) && (now - lastSubmitTime) < 20000) {
                logDev("🔄 [LoopGuard] Self-refresh detected. Waiting for actual success indicator...", "info");
                setTimeout(() => detectSubmissionResult(null, template), 500); 
                return;
            }

            logDev("🚀 [Engine] Ultra-Mode process started", "start");
            startHeartbeat();
            
            await closeIntrusivePopups();
            if (await checkAndRecoverPage()) return;

            const recursionDebt = parseInt(sessionStorage.getItem('xpider_recursion_debt') || '0');

            logDev(`🔍 [Discovery] URL: ${currentUrl} | Recursion: ${recursionDebt}`);
            
            // 1. [v1.3.7] Ultra Polling Form Discovery
            await cleanPageEnvironment();
            
            let currentForm = null;
            for (let i = 1; i <= 3; i++) {
                logDev(`🧐 [Discovery] Polling attempt ${i}/3... | URL: ${window.location.href} | Recursion: ${recursionDebt}`);
                currentForm = await findOptimalForm();
                
                if (currentForm) break;
                
                // [Ultra-Mode] Try scrolling to reveal lazy-loaded forms
                if (i === 1) {
                    logDev("🚀 [Engine] Ultra-Mode: Scrolling to reveal lazy-loaded content...");
                    window.scrollBy({ top: 400, behavior: 'smooth' });
                } else if (i === 2) {
                    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
                    await triggerContactInteraction();
                }
                
                await new Promise(r => setTimeout(r, 1500)); 
            }

            if (currentForm) {
                logDev("🎯 Step 2: Contact form discovered. Preparing submission...", "success");
                sessionStorage.removeItem('xpider_recursion_debt');
                sessionStorage.removeItem('xpider_guessed_paths');
                
                // [v2.5.0] Multi-Branch Search: Scan for other regional branches on this domain
                const branches = await discoverBranchLinks();
                if (branches.length > 0) {
                    chrome.runtime.sendMessage({ action: 'QUEUE_BRANCHES', links: branches });
                    logDev(`🌐 [Supreme-X 5.0] ${branches.length} additional branch targets queued for traversal.`, "success");
                }

                const fillResult = await fillAndSubmit(currentForm, template, speed);
                if (fillResult) {
                    logDev("✅ [Engine] Campaign step successfully executed.", "success");
                    return; // EXIT: Step complete
                } else {
                    logDev("⚠️ [Engine] Mapping incomplete or form hidden. Retrying alternative discovery...", "warning");
                    // Continue to next discovery steps...
                }
            }

            // 2. [v1.3.4] Direct Path Guessing (Before expensive link scanning)
            if (recursionDebt === 0) {
                logDev("⚡ [Discovery] No form on current page. Trying common paths...");
                const directPath = await guessDirectContactPaths(template);
                if (directPath) return; // Navigation handled inside
            }

            // 3. Search for Links (Optimized Scoring)
            logDev("🕵️ [Discovery] Scanning DOM for contact links...");
            const bestLink = findBestContactLink();
            if (bestLink && normalizeUrl(bestLink) !== normalizeUrl(currentUrl)) {
                logDev(`🎯 Step 1: Contact page link found! Navigating to: ${bestLink}`, "success");
                await safeNavigate(bestLink, template);
                return;
            }

            // 4. Recursive Search (Deep Form Hunting)
            if (recursionDebt < 1) {
                logDev("🔦 [DeepSearch] No obvious links. Searching secondary pages...");
                const secondaryLinks = findSecondaryLinks();
                for (let link of secondaryLinks) {
                    const visited = JSON.parse(sessionStorage.getItem('xpider_visited_subs') || '[]');
                    if (!visited.includes(link)) {
                        logDev(`🌍 [DeepSearch] Visiting secondary: ${link}`);
                        visited.push(link);
                        sessionStorage.setItem('xpider_visited_subs', JSON.stringify(visited));
                        sessionStorage.setItem('xpider_recursion_debt', (recursionDebt + 1).toString());
                        window.location.href = link;
                        return;
                    }
                }
            }

            logDev("❌ [Discovery] No valid forms or links found. Jumping to root/next candidate...", "warning");
            sessionStorage.removeItem('xpider_recursion_debt');
            sessionStorage.removeItem('xpider_guessed_paths');
            sessionStorage.removeItem('xpider_visited_subs');
            finishCampaign(false, "NO_FORM_ON_PAGE");
        } catch (e) {
            logDev(`🚨 [Engine] Fatal runtime error: ${e.message}`, "error");
            finishCampaign(false, e.message);
        }
    }

    function findSecondaryLinks() {
        const links = Array.from(document.querySelectorAll('a'));
        const currentOrigin = window.location.origin;

        return links
            .map(a => ({ href: a.href, text: a.textContent.toLowerCase(), score: 0 }))
            .filter(l => {
                try {
                    const u = new URL(l.href);
                    // [v2.9.0] Strict Domain Isolation: ONLY visit links of the same origin
                    return u.origin === currentOrigin && !DOMAIN_BLACKLIST.some(d => l.href.includes(d));
                } catch(e) { return false; }
            })
            .map(l => {
                if (CONTACT_KEYWORDS.mid.some(k => l.text.includes(k) || l.href.toLowerCase().includes(k))) l.score = 50;
                return l;
            })
            .filter(l => l.score >= 50)
            .sort((a, b) => b.score - a.score)
            .map(l => l.href)
            .slice(0, 3);
    }

    async function fillAndSubmit(form, template, speed) {
        try {
            logDev("🛠️ Step 3: Registering message template to form fields...", "info");
            // [v4.1] 300ms 실시간 공란 자동 메꾸기 감시 크롤러 작동 개시
            startActiveEmptyFieldSweeper(form, template);

            const result = await fillFormIntelligent(form, template, speed);
            if (!result.filledAny) throw new Error("Zero-mapping: No usable fields found.");
            
            // [v1.5.7] Math Captcha Handling (Divi & Others)
            await solveMathCaptcha(form);

            logDev(`✅ [Action] Sequence complete: ${result.filledAny ? 'Success' : 'Fail'}`, "success");
            
            if (await checkForCaptcha()) {
                logDev("🤖 [Security] CAPTCHA detected. Engine paused for solver.", "info");
                const solved = await waitForCaptchaSolved();
                if (!solved) throw new Error("Security Timeout: CAPTCHA unsolved.");
                logDev("🔑 [Security] Bypass verified", "success");
            }
            
            // [v18.7.5] Visual Hold: Pause so user can confirm mapped fields
            logDev(`⏳ [Engine] Holding for visual confirmation (${speed.hold}ms)...`, "info");
            await new Promise(r => setTimeout(r, speed.hold));
            
            logDev("📤 [Action] Triggering submission sequence...");
            
            // [v18.6.0] Take Snapshot of existing success indicators to avoid false positives
            const currentSuccessSnapshot = takeSuccessSnapshot();
            
            // [v1.6.5] Record submission attempt to prevent loops AND store initial state for persistence
            sessionStorage.setItem('xpider_last_submit_path', window.location.pathname);
            sessionStorage.setItem('xpider_last_submit_time', Date.now().toString());
            sessionStorage.setItem('xpider_initial_url', window.location.href);
            sessionStorage.setItem('xpider_initial_form_present', 'true');
            sessionStorage.setItem('xpider_pending_verify', 'true'); // [v17.6.0]

            submitForm(form);
            return await detectSubmissionResult(form, template, currentSuccessSnapshot);
        } catch (e) {
            logDev(`❌ [Action] Sequence aborted: ${e.message}`, "error");
            return false;
        }
    }

    async function solveMathCaptcha(form) {
        const questionEl = form.querySelector('.et_pb_contact_captcha_question, .captcha-question, #captcha_text');
        const inputEl = form.querySelector('input.et_pb_contact_captcha, input[name*="captcha"], #captcha_input');
        
        if (questionEl && inputEl) {
            const text = (questionEl.textContent || '').trim();
            logDev(`🧩 [Action] Math Captcha detected: "${text}"`);
            
            // Extract numbers and operator (e.g. "2 + 10 =")
            const match = text.match(/(\d+)\s*([\+\-\*])\s*(\d+)/);
            if (match) {
                const n1 = parseInt(match[1]);
                const op = match[2];
                const n2 = parseInt(match[3]);
                let answer = 0;
                
                if (op === '+') answer = n1 + n2;
                else if (op === '-') answer = n1 - n2;
                else if (op === '*') answer = n1 * n2;
                
                logDev(`💡 [Action] Calculated answer: ${n1} ${op} ${n2} = ${answer}`);
                inputEl.value = answer.toString();
                inputEl.dispatchEvent(new Event('input', { bubbles: true }));
                inputEl.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
    }

    function isContactPage() {
        const url = window.location.href.toLowerCase();
        const title = document.title.toLowerCase();
        
        // Direct match in URL or Title
        const isMatch = (arr) => arr.some(k => url.includes(k) || title.includes(k));
        return isMatch(CONTACT_KEYWORDS.high);
    }

    function findBestContactLink() {
        const links = Array.from(document.querySelectorAll('a[href]'));
        let candidates = [];

        for (const link of links) {
            const href = link.href.toLowerCase();
            const text = link.textContent.toLowerCase().trim();
            const title = (link.title || '').toLowerCase();
            const aria = (link.getAttribute('aria-label') || '').toLowerCase();
            const cls = (link.className || '').toString().toLowerCase();
            
            if (href.startsWith('mailto:') || href.startsWith('tel:') || href.includes('javascript:')) continue;
            if (DOMAIN_BLACKLIST.some(d => href.includes(d))) continue;
            if (href.length < window.location.origin.length + 2) continue; // Skip home links
            
            let score = 0;
            const combined = `${text} ${href} ${title} ${aria} ${cls}`;
            
            const matchScore = (keywords, weight) => {
                if (keywords.some(k => combined.includes(k))) score += weight;
            };

            matchScore(CONTACT_KEYWORDS.high, 100);
            matchScore(CONTACT_KEYWORDS.mid, 30);
            matchScore(CONTACT_KEYWORDS.low, 10);

            // [v1.3.6] Icon class analysis (Envelope, mail, etc.)
            const icons = Array.from(link.querySelectorAll('i, span, svg'));
            const hasContactIcon = icons.some(icon => {
                const cls = (icon.className || '').toString().toLowerCase();
                return ['envelope', 'mail', 'message', 'paper-plane', 'chat'].some(k => cls.includes(k));
            });
            if (hasContactIcon) score += 50;

            if (score > 40) {
                candidates.push({ href: link.href, score });
            }
        }

        if (candidates.length === 0) return null;
        return candidates.sort((a, b) => b.score - a.score || a.href.length - b.href.length)[0].href;
    }

    function queryAllInputs(container = document) {
        // [Supreme-Scan 3.0] Standard + Non-Standard (div-based) inputs
        const standard = 'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select';
        const nonStandard = '[contenteditable="true"], [role="textbox"], [role="searchbox"], [role="combobox"]';
        return queryAllDeep(`${standard}, ${nonStandard}`, container);
    }
    async function findOptimalForm() {
        // [v2.9.3] Micro-Scoping Engine: High sensitivity mapping
        let bestTarget = null;
        let maxScore = -999; 
        
        // Define broad candidate types including content areas
        const candidates = queryAllDeep('form, fieldset, .form-wrapper, .sqs-block-form, #contact-form, [id*="contact-form"], [class*="contact-form"], main, section, article');
        
        // If few candidates, add potential clusters as candidates
        const allPotentialInputs = queryAllInputs();
        if (candidates.length < 5 && allPotentialInputs.length > 2) {
            allPotentialInputs.forEach(inp => {
                const parent = inp.parentElement;
                if (parent && !candidates.includes(parent)) candidates.push(parent);
                const grandparent = parent?.parentElement;
                if (grandparent && !candidates.includes(grandparent)) candidates.push(grandparent);
            });
        }

        const evaluateElement = (root, source = 'Main', pageLabels = []) => {
            const elements = [root];
            if (root.querySelectorAll) {
                elements.push(...Array.from(root.querySelectorAll('form, div, section, article, aside, [class*="form"], [id*="form"]')));
            }
            const threshold = isContactPage() ? 10 : 35;
            let currentBestInRoot = null;
            let currentMaxInRoot = -999;

            elements.forEach((el) => {
                if (!el || !el.tagName) return; // [v17.3.0] Element Safety: Skip document/shadowRoot headers
                let score = 0;
                const textareas = el.querySelectorAll('textarea');
                const emails = el.querySelectorAll('input[type="email"], input[name*="email"], input[id*="email"]');
                const phones = el.querySelectorAll('input[type="tel"], input[name*="phone"], input[id*="phone"]');
                const names = el.querySelectorAll('input[name*="name"], input[id*="name"], input[placeholder*="name"], input[placeholder*="이름"]');
                const allInputs = queryAllInputs(el);

                // 1. Structural Weighting (Supreme-X 3.0)
                if (textareas.length > 0) score += 70;
                if (emails.length > 0) score += 50;
                if (phones.length > 0) score += 40;
                if (names.length > 0) score += 25;
                if (allInputs.length >= 2 && allInputs.length <= 45) score += 30;
                
                // [v17.4.0] Strict Exclusion: Penalize Body/HTML or Zero-Input containers
                if (['BODY', 'HTML'].includes(el.tagName)) score -= 500;
                if (allInputs.length < 1) score = -999;
                
                // [v17.4.0] Priority Boost for real Forms
                if (el.tagName === 'FORM') score += 200;
                
                const id = (el.id || '').toLowerCase();
                const cls = (el.className || '').toString().toLowerCase();
                const identifier = `${id} ${cls}`;

                // [v17.0.0] Platform & Plugin Fingerprinting...
                const builderBoosts = {
                    wix: identifier.includes('wixui') || identifier.includes('input_comp-') || identifier.includes('textarea_comp-'),
                    shopify: identifier.includes('shopify-') || identifier.includes('contact-form'),
                    squarespace: identifier.includes('sqs-') || identifier.includes('form-wrapper'),
                    wp: identifier.includes('wpcf7') || identifier.includes('gform') || identifier.includes('nf-') || identifier.includes('ninja')
                };

                if (builderBoosts.wix) score += 250; 
                if (builderBoosts.shopify) score += 150;
                if (builderBoosts.squarespace) score += 300; 
                if (builderBoosts.wp) score += 350; // Boosted for CF7 (v17.0)
                
                // [v17.2.0] Direct CF7 Fingerprint on IDENTIFIER
                if (identifier.includes('wpcf7-form') || identifier.includes('wpcf7-init')) score += 500;
                
                if (['contact', 'message', 'inquiry', 'form', 'contact-form'].some(k => identifier.includes(k))) score += 70;
                
                // [v17.7.0] Higher Penalty for generic wrapping IDs/Classes
                if (['root', 'container', 'wrapper', 'main', 'sticky', 'header', 'footer'].some(k => identifier.includes(k)) && el.tagName !== 'FORM') score -= 250;

                // [v18.0.0] Modal & Lightbox Focus: Catastrophic boost for active overlays
                if (identifier.includes('sqs-modal-item') || identifier.includes('lightbox-content') || identifier.includes('active-modal')) score += 450;
                
                // [v17.6.0] Search Shield: Catastrophic penalty for search forms
                if (identifier.includes('search')) score -= 850;
                
                // 3. Button / Submit presence...
                const submitBtn = el.querySelector('input[type="submit"], button[type="submit"], button:not([type="button"]), [role="button"], .form-submit-button, .sqs-button-element, .wixui-button, [class*="submit"], [id*="submit"]');
                if (submitBtn) {
                    const btnText = (submitBtn.textContent || submitBtn.value || '').toLowerCase();
                    const btnKeywords = ['send', 'submit', 'message', 'inquiry', '전송', '보내기', '문의', '접수', '送信', '提交', 'enviar', 'envoyer'];
                    if (btnKeywords.some(k => new RegExp(k, 'i').test(btnText))) score += 70;
                }

                // 4. Field Clustering (Supreme Strategy 3.0)
                if (allInputs.length >= 3) score += 50;
                if (allInputs.length >= 6) score += 25;

                // [v2.8.5] Optimized Visual Context: Use pre-scanned labels to avoid O(N^3) bottleneck
                const inputsArray = Array.from(allInputs);
                const contextText = inputsArray.map(inp => {
                    const rect = inp.getBoundingClientRect();
                    let nearestLabelText = "";
                    let minDist = 150; // Max search distance
                    
                    // Use pageLabels cache instead of repeated queryAllDeep calls
                    pageLabels.forEach(lblObj => {
                        const dist = Math.sqrt(Math.pow(rect.top - lblObj.rect.top, 2) + Math.pow(rect.left - lblObj.rect.left, 2));
                        if (dist < minDist) {
                            minDist = dist;
                            nearestLabelText = lblObj.text;
                        }
                    });
                    
                    if (nearestLabelText.length > 2) score += 5; // Bonus for paired inputs
                    return (inp.placeholder || '') + ' ' + (inp.name || '') + ' ' + nearestLabelText;
                }).join(' ').toLowerCase();
                
                if (['@', 'email', 'mail'].some(k => contextText.includes(k))) score += 10;
                if (['message', 'subject', '제목', '내용'].some(k => contextText.includes(k))) score += 10;

                // Supreme Penalty for large page sections
                if (el.tagName !== 'FORM' && allInputs.length < 1) score = -250;
                const parentText = (el.parentElement?.innerText || '').substring(0, 100).toLowerCase();
                if (['search', 'sign in', 'login', '로그인', '검색'].some(k => parentText.includes(k))) score -= 40;

                if (score > currentMaxInRoot) {
                    currentMaxInRoot = score;
                    currentBestInRoot = el;
                }
            });

            if (currentMaxInRoot > maxScore && currentMaxInRoot >= threshold) {
                maxScore = currentMaxInRoot;
                bestTarget = currentBestInRoot;
            }
            return elements.length;
        };

        // 1. Recursive Shadow DOM & Main DOM Scan
        logDev("🕵️ [UltraFinder] Scanning complex structures (ShadowDOM & Multi-Root)...", "info");
        const allRoots = [document];
        const collectRoots = (node) => {
            try {
                if (node.shadowRoot) {
                    allRoots.push(node.shadowRoot);
                    Array.from(node.shadowRoot.children || []).forEach(collectRoots);
                }
                Array.from(node.children || []).forEach(collectRoots);
            } catch(e) {} // [v2.8.5] Resilience: Don't crash on cross-origin iframe boundaries
        };
        try {
            Array.from(document.children || []).forEach(collectRoots);
        } catch(e) {}

        // [v2.8.5] Optimized: Pre-scan all potential labels once to cache their geometry
        logDev("🕵️ [Supreme-Scan 5.0] Pre-scanning labels and context...", "info");
        const rawLabels = queryAllDeep('label, p, span, div.label');
        const pageLabels = rawLabels.map(lbl => ({
            text: lbl.textContent.trim(),
            rect: lbl.getBoundingClientRect()
        })).filter(l => l.text.length > 2); // Filter out noise

        let totalElementsScanned = 0;
        allRoots.forEach((root, i) => {
            totalElementsScanned += evaluateElement(root, `Root#${i}`, pageLabels);
        });

        // 2. Scan iframes (Cross-origin safe check)
        const iframes = queryAllDeep('iframe');
        for (const frame of iframes) {
            try {
                if (frame.contentDocument) {
                    totalElementsScanned += evaluateElement(frame.contentDocument, 'Iframe', pageLabels);
                }
            } catch (e) {}
        }

        logDev(`🔍 [Scan] Scanned ${totalElementsScanned} elements. Highest score: ${maxScore}`, "info");

        if (bestTarget) {
            const tagName = (bestTarget.tagName || 'UNKNOWN').toLowerCase();
            const id = bestTarget.id || 'N/A';
            logDev(`🎯 [Scan] Optimal target found: Score(${maxScore}) Tag(<${tagName}>) ID(#${id})`, "success");
            return bestTarget;
        } else {
            logDev(`⚠️ [Scan] No valid forms reached threshold score (Target Score: ${isContactPage() ? 10 : 35})`, "warning");
        }
        return null;
    }

    async function fillFormIntelligent(form, tpl, speed) {
        logDev("🛠️ [Action][HyperEngine v4.0] 초강력 폼 자동 등록기 시작...");
        let filledFields = 0;

        // ============================================================
        // [HyperEngine v4.0] React/Vue/Angular 네이티브 값 세터 유틸
        // ============================================================
        function setNativeValue(el, val) {
            try {
                const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype
                            : el.tagName === 'SELECT' ? HTMLSelectElement.prototype
                            : HTMLInputElement.prototype;
                const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value');
                if (nativeSetter && nativeSetter.set) {
                    nativeSetter.set.call(el, val);
                } else {
                    el.value = val;
                }
            } catch (e) {
                el.value = val;
            }
        }

        // ============================================================
        // [v4.0] 전체 이벤트 시퀀스 디스패처 - 사람처럼 행동
        // ============================================================
        // ============================================================
        // [v4.12.26] 초강력 스텔스 마우스 궤적 Bezier Curve 시뮬레이터 및 디스패처
        // ============================================================
        async function dispatchHumanEvents(el, eventNames) {
            // Track last mouse location globally to simulate cohesive drag/hover paths
            if (typeof window.__xpider_last_mouse_x === 'undefined') {
                window.__xpider_last_mouse_x = Math.random() * window.innerWidth;
                window.__xpider_last_mouse_y = Math.random() * window.innerHeight;
            }

            const rect = el.getBoundingClientRect();
            const randomOffsetX = (Math.random() - 0.5) * (rect.width * 0.3);
            const randomOffsetY = (Math.random() - 0.5) * (rect.height * 0.3);
            const targetX = rect.left + rect.width / 2 + randomOffsetX;
            const targetY = rect.top + rect.height / 2 + randomOffsetY;

            // 만약 mousemove 나 click 계열이 포함되어 있다면 마우스 실제 움직임(Bezier Curve)을 시뮬레이션
            const hasMovement = eventNames.some(name => name.includes('move') || name.includes('over') || name === 'click');
            if (hasMovement) {
                const startX = window.__xpider_last_mouse_x;
                const startY = window.__xpider_last_mouse_y;

                // Bezier Curve 중간 좌표 계산
                const steps = 6 + Math.floor(Math.random() * 5); // 6 ~ 10 steps
                const cp1x = startX + (targetX - startX) * 0.25 + (Math.random() * 50 - 25);
                const cp1y = startY + (targetY - startY) * 0.25 + (Math.random() * 50 - 25);
                const cp2x = startX + (targetX - startX) * 0.75 + (Math.random() * 50 - 25);
                const cp2y = startY + (targetY - startY) * 0.75 + (Math.random() * 50 - 25);

                for(let i = 1; i <= steps; i++) {
                    const t = i / steps;
                    const x = Math.round((1-t)**3 * startX + 3*(1-t)**2*t * cp1x + 3*(1-t)*t**2 * cp2x + t**3 * targetX);
                    const y = Math.round((1-t)**3 * startY + 3*(1-t)**2*t * cp1y + 3*(1-t)*t**2 * cp2y + t**3 * targetY);

                    try {
                        el.dispatchEvent(new MouseEvent('mousemove', {
                            bubbles: true, cancelable: true, view: window,
                            clientX: x, clientY: y, screenX: x, screenY: y
                        }));
                        el.dispatchEvent(new PointerEvent('pointermove', {
                            bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse',
                            clientX: x, clientY: y, screenX: x, screenY: y
                        }));
                    } catch(e) {}
                    await new Promise(r => setTimeout(r, 10 + Math.random()*15)); // 자연스러운 이동 딜레이
                }

                window.__xpider_last_mouse_x = targetX;
                window.__xpider_last_mouse_y = targetY;
            }

            for (const evtName of eventNames) {
                try {
                    if (evtName.startsWith('pointer')) {
                        el.dispatchEvent(new PointerEvent(evtName, { 
                            bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse',
                            clientX: targetX, clientY: targetY
                        }));
                    } else if (evtName.startsWith('mouse') || evtName === 'click') {
                        el.dispatchEvent(new MouseEvent(evtName, {
                            bubbles: true, cancelable: true, view: window,
                            clientX: targetX, clientY: targetY
                        }));
                    } else if (evtName.startsWith('key')) {
                        el.dispatchEvent(new KeyboardEvent(evtName, { bubbles: true, cancelable: true }));
                    } else if (evtName.startsWith('focus') || evtName === 'blur') {
                        el.dispatchEvent(new FocusEvent(evtName, { bubbles: true }));
                    } else {
                        el.dispatchEvent(new Event(evtName, { bubbles: true, cancelable: true }));
                    }
                } catch(e) {}
                // 이벤트간 미세 딜레이
                await new Promise(r => setTimeout(r, 10 + Math.random() * 20));
            }
        }

        const FULL_CLICK_SEQUENCE = [
            'pointerover', 'pointerenter', 'mouseover', 'mouseenter',
            'pointermove', 'mousemove',
            'pointerdown', 'mousedown', 'focus',
            'pointerup', 'mouseup', 'click'
        ];

        // ============================================================
        // [v4.0] SELECT 드롭다운 강제 선택 - 네이티브 <select>
        // ============================================================
        async function applySelect(el, preferredKeywords = []) {
            if (!el || el.tagName !== 'SELECT') return false;
            if (el.options.length <= 1) return false;
            // 이미 유효한 값이 선택된 경우 스킵
            if (el.selectedIndex > 0 && el.options[el.selectedIndex].value) {
                logDev(`   - [Select-Skip] 이미 선택됨: "${el.options[el.selectedIndex].text}"`);
                return false;
            }

            const contactKeywords = [...(preferredKeywords || []),
                'inquiry', 'general', 'other', 'contact', 'question', 'sales', 'business',
                '문의', '일반', '기타', '고객', '상담', 'info', 'support', 'partnership',
                'お問い合わせ', '質問', '提案', '咨询', '合作',
                'consulta', 'información', 'anfrage', 'demande'
            ];

            let targetIdx = -1;

            // 1순위: 키워드 매칭
            for (let i = 1; i < el.options.length; i++) {
                if (el.options[i].disabled) continue;
                const optText = (el.options[i].text || '').toLowerCase();
                const optVal = (el.options[i].value || '').toLowerCase();
                if (contactKeywords.some(k => optText.includes(k) || optVal.includes(k))) {
                    targetIdx = i;
                    break;
                }
            }

            // 2순위: 유효한 첫 번째 옵션
            if (targetIdx < 0) {
                for (let i = 1; i < el.options.length; i++) {
                    if (!el.options[i].disabled && el.options[i].value && el.options[i].value !== '') {
                        targetIdx = i;
                        break;
                    }
                }
            }
            if (targetIdx < 0 && el.options.length > 1) targetIdx = 1;
            if (targetIdx < 0) return false;

            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await new Promise(r => setTimeout(r, Math.floor(speed.field * 0.4)));

            el.focus();
            dispatchHumanEvents(el, ['mousedown']);
            await new Promise(r => setTimeout(r, 60));

            // 네이티브 setter를 사용해 React 등의 controlled component 우회
            const nativeSelectSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
            if (nativeSelectSetter && nativeSelectSetter.set) {
                nativeSelectSetter.set.call(el, el.options[targetIdx].value);
            }
            el.selectedIndex = targetIdx;

            dispatchHumanEvents(el, ['input', 'change', 'mouseup', 'click']);
            el.blur();

            logDev(`   - [Select✅] 드롭다운 선택: "${el.options[targetIdx].text}"`);
            filledFields++;
            return true;
        }

        // ============================================================
        // [v4.0] 커스텀 드롭다운 처리 (React Select, MUI, Ant Design 등)
        // div/span 기반 커스텀 셀렉트를 실제 마우스 클릭으로 조작
        // ============================================================
        async function applyCustomDropdown(container) {
            if (!container) return false;
            
            const CUSTOM_SELECTORS = [
                // React Select
                '[class*="react-select"]', '[class*="css-"][class*="control"]',
                // MUI / Material UI
                '[class*="MuiSelect"]', '[class*="MuiInputBase"]', '.MuiSelect-select',
                // Ant Design
                '.ant-select', '.ant-select-selector',
                // Generic custom selects
                '[class*="custom-select"]', '[class*="dropdown"]', '[class*="select-wrapper"]',
                '[role="listbox"]', '[role="combobox"]',
                // Wix
                '[data-testid*="dropdown"]', '[class*="dropdown"]'
            ];

            const customSelects = [];
            CUSTOM_SELECTORS.forEach(sel => {
                try {
                    const found = container.querySelectorAll(sel);
                    found.forEach(el => {
                        if (elementIsVisible(el) && !customSelects.includes(el)) {
                            customSelects.push(el);
                        }
                    });
                } catch(e) {}
            });

            let handled = 0;
            for (const csEl of customSelects) {
                try {
                    // 이미 값이 선택되어 있는지 체크
                    const currentText = (csEl.textContent || '').toLowerCase().trim();
                    const placeholders = ['select', 'choose', '선택', '選択', '请选择', '--', '...'];
                    const isPlaceholder = placeholders.some(p => currentText.startsWith(p)) || currentText.length < 2;
                    if (!isPlaceholder) continue; // 이미 선택됨

                    csEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    await new Promise(r => setTimeout(r, 100));

                    // 드롭다운 열기 (트리거 클릭)
                    const trigger = csEl.querySelector('[class*="indicator"], [class*="arrow"], svg, [class*="trigger"]') || csEl;
                    dispatchHumanEvents(trigger, FULL_CLICK_SEQUENCE);
                    await new Promise(r => setTimeout(r, 400));

                    // 옵션 리스트 탐색 (전역 검색 - 포탈 렌더링 대응)
                    const optionSelectors = [
                        '[class*="option"]', '[role="option"]',
                        '[class*="menu-item"]', '[class*="MenuItem"]',
                        'li[class*="item"]', '.ant-select-item',
                        '[data-value]', '[class*="listbox"] > *'
                    ];

                    let options = [];
                    // 먼저 드롭다운 컨테이너 내부 탐색
                    optionSelectors.forEach(sel => {
                        try {
                            const found = csEl.querySelectorAll(sel);
                            found.forEach(o => { if (elementIsVisible(o) && !options.includes(o)) options.push(o); });
                        } catch(e) {}
                    });

                    // 포탈 렌더링 대응: body 직하의 최근 열린 메뉴 탐색
                    if (options.length === 0) {
                        const portalMenus = document.querySelectorAll(
                            '[class*="menu"], [class*="dropdown-list"], [class*="listbox"], [role="listbox"], .ant-select-dropdown'
                        );
                        for (const menu of portalMenus) {
                            if (!elementIsVisible(menu)) continue;
                            optionSelectors.forEach(sel => {
                                try {
                                    const found = menu.querySelectorAll(sel);
                                    found.forEach(o => { if (elementIsVisible(o) && !options.includes(o)) options.push(o); });
                                } catch(e) {}
                            });
                        }
                    }

                    if (options.length === 0) {
                        // 드롭다운 닫기 시도
                        dispatchHumanEvents(trigger, ['click']);
                        continue;
                    }

                    // 키워드 매칭으로 최적 옵션 선택
                    const preferredKeywords = ['inquiry', 'general', 'other', 'contact', '문의', '일반', '기타', '고객', 'sales', 'business', 'info'];
                    let targetOption = null;

                    for (const opt of options) {
                        const optText = (opt.textContent || '').toLowerCase().trim();
                        if (preferredKeywords.some(k => optText.includes(k))) {
                            targetOption = opt;
                            break;
                        }
                    }

                    // 키워드 매칭 실패 시 첫 번째 유효 옵션
                    if (!targetOption) {
                        targetOption = options.find(opt => {
                            const text = (opt.textContent || '').trim();
                            return text.length > 0 && !placeholders.some(p => text.toLowerCase().startsWith(p));
                        }) || options[0];
                    }

                    if (targetOption) {
                        dispatchHumanEvents(targetOption, FULL_CLICK_SEQUENCE);
                        await new Promise(r => setTimeout(r, 200));
                        logDev(`   - [CustomSelect✅] 커스텀 드롭다운 선택: "${(targetOption.textContent || '').trim().substring(0, 30)}"`);
                        filledFields++;
                        handled++;
                    }
                } catch (e) {
                    logDev(`   - [CustomSelect⚠️] 처리 실패: ${e.message}`, 'warning');
                }
            }
            return handled > 0;
        }

        // ============================================================
        // [v4.0] 라디오 버튼 강제 선택 - label/wrapper 클릭 포함
        // ============================================================
        async function applyRadio(radioEl) {
            if (!radioEl) return;
            // 이미 체크된 경우 스킵
            if (radioEl.checked) return;

            radioEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await new Promise(r => setTimeout(r, 50));

            // 1차: 네이티브 라디오 직접 클릭
            radioEl.focus();
            dispatchHumanEvents(radioEl, FULL_CLICK_SEQUENCE);

            // 네이티브 checked setter
            const nativeCheckedSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked');
            if (nativeCheckedSetter && nativeCheckedSetter.set) {
                nativeCheckedSetter.set.call(radioEl, true);
            } else {
                radioEl.checked = true;
            }
            dispatchHumanEvents(radioEl, ['input', 'change']);

            // 2차: 직접 클릭으로 안 됐으면 label 클릭 시도
            if (!radioEl.checked) {
                const label = radioEl.id
                    ? document.querySelector(`label[for="${radioEl.id}"]`)
                    : radioEl.closest('label');
                if (label) {
                    dispatchHumanEvents(label, FULL_CLICK_SEQUENCE);
                    await new Promise(r => setTimeout(r, 50));
                }
            }

            // 3차: 부모 wrapper 클릭 (Material UI 등)
            if (!radioEl.checked) {
                const wrapper = radioEl.closest('[class*="radio"], [class*="Radio"], [role="radio"]');
                if (wrapper && wrapper !== radioEl) {
                    dispatchHumanEvents(wrapper, FULL_CLICK_SEQUENCE);
                }
            }

            radioEl.blur();
            logDev(`   - [Radio✅] 라디오 클릭: name="${radioEl.name}" value="${radioEl.value}"`);
        }

        // ============================================================
        // [v4.0] 체크박스 강제 체크 - label/wrapper 클릭 포함
        // ============================================================
        async function applyCheckbox(cbEl) {
            if (!cbEl) return;
            if (cbEl.checked) return;

            cbEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await new Promise(r => setTimeout(r, 40));

            // 1차: 네이티브 체크박스 직접 클릭
            cbEl.focus();
            dispatchHumanEvents(cbEl, FULL_CLICK_SEQUENCE);

            const nativeCheckedSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked');
            if (nativeCheckedSetter && nativeCheckedSetter.set) {
                nativeCheckedSetter.set.call(cbEl, true);
            } else {
                cbEl.checked = true;
            }
            dispatchHumanEvents(cbEl, ['input', 'change']);

            // 2차: label 클릭
            if (!cbEl.checked) {
                const label = cbEl.id
                    ? document.querySelector(`label[for="${cbEl.id}"]`)
                    : cbEl.closest('label');
                if (label) {
                    dispatchHumanEvents(label, FULL_CLICK_SEQUENCE);
                    await new Promise(r => setTimeout(r, 40));
                }
            }

            // 3차: wrapper 클릭 (MUI Checkbox 등)
            if (!cbEl.checked) {
                const wrapper = cbEl.closest('[class*="checkbox"], [class*="Checkbox"], [role="checkbox"]');
                if (wrapper && wrapper !== cbEl) {
                    dispatchHumanEvents(wrapper, FULL_CLICK_SEQUENCE);
                }
            }

            cbEl.blur();
            logDev(`   - [Checkbox✅] 체크박스 체크: "${cbEl.name || cbEl.id || ''}"`);
        }

        // ============================================================
        // [v4.0] 커스텀 체크박스/라디오 (div/span 기반) 클릭
        // ============================================================
        async function applyCustomCheckableElements(container) {
            const CUSTOM_CHECK_SELECTORS = [
                '[role="checkbox"]:not([aria-checked="true"])',
                '[role="radio"]:not([aria-checked="true"])',
                '[role="switch"]:not([aria-checked="true"])',
                '[class*="custom-checkbox"]:not(.checked)',
                '[class*="custom-radio"]:not(.checked)'
            ];

            let handled = 0;
            for (const sel of CUSTOM_CHECK_SELECTORS) {
                try {
                    const elements = container.querySelectorAll(sel);
                    for (const el of elements) {
                        if (!elementIsVisible(el)) continue;

                        // 약관/동의 관련 체크박스만 자동 체크
                        const context = (el.textContent || el.getAttribute('aria-label') || '').toLowerCase();
                        const parentText = (el.parentElement?.textContent || '').toLowerCase().substring(0, 200);
                        const combined = context + ' ' + parentText;

                        const isTerms = ['agree', 'terms', 'policy', 'consent', 'accept', 'privacy',
                            '동의', '약관', '규정', '개인정보', '수집', '이용약관', 'gdpr'
                        ].some(k => combined.includes(k));

                        // role="radio" 는 그룹 내 첫 번째를 선택
                        const isRadio = el.getAttribute('role') === 'radio';

                        if (isTerms || isRadio) {
                            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            await new Promise(r => setTimeout(r, 60));
                            dispatchHumanEvents(el, FULL_CLICK_SEQUENCE);

                            // aria-checked 업데이트 시도
                            if (el.getAttribute('aria-checked') !== 'true') {
                                el.setAttribute('aria-checked', 'true');
                            }

                            await new Promise(r => setTimeout(r, 100));
                            logDev(`   - [CustomCheck✅] ${isRadio ? '라디오' : '체크박스'} 클릭: "${context.substring(0, 30)}"`);
                            filledFields++;
                            handled++;

                            // role="radio"는 그룹 당 하나만
                            if (isRadio) break;
                        }
                    }
                } catch(e) {}
            }
            return handled;
        }

        // ============================================================
        // [v4.12.26] 인간 키보드 입력 인터랙션 모사 엔진 (Stealth Human Keyboard Simulator)
        // ============================================================
        async function typeHumanlike(el, val) {
            if (!el || !val) return;
            
            // 1. 엘리먼트 가시성 확보 및 부드러운 스크롤 & 초점 잡기
            try {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await new Promise(r => setTimeout(r, 450 + Math.random()*150)); // 시선 이동 딜레이
            } catch(e) {}
            
            // 2. 포커스 및 마우스 클릭 이벤트 디스패치 (Bezier 마우스 궤적 자동 기동)
            el.focus();
            await dispatchHumanEvents(el, ['pointerover', 'pointerenter', 'mouseover', 'mouseenter', 'pointerdown', 'mousedown', 'focusin', 'pointerup', 'mouseup', 'click']);
            await new Promise(r => setTimeout(r, 100 + Math.random()*100));
            
            // 3. 한 글자씩 순차적 타이핑 (오타 및 백스페이스 인간미 포함)
            let accumulatedValue = '';
            for (let i = 0; i < val.length; i++) {
                const char = val[i];
                const key = char;
                const keyCode = char.charCodeAt(0);
                
                // 3a. 간헐적 오타 발생 및 지우기 시뮬레이션 (1.2% 확률)
                if (Math.random() < 0.012 && i > 0 && i < val.length - 1) {
                    const alphabet = 'abcdefghijklmnopqrstuvwxyz';
                    const typo = alphabet.charAt(Math.floor(Math.random() * alphabet.length));
                    
                    // 오타 삽입
                    accumulatedValue += typo;
                    if (el.contentEditable === 'true') {
                        el.textContent = accumulatedValue;
                    } else {
                        setNativeValue(el, accumulatedValue);
                    }
                    el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                    await new Promise(r => setTimeout(r, 100 + Math.random()*120));
                    
                    // 지우기 (Backspace)
                    accumulatedValue = accumulatedValue.slice(0, -1);
                    if (el.contentEditable === 'true') {
                        el.textContent = accumulatedValue;
                    } else {
                        setNativeValue(el, accumulatedValue);
                    }
                    el.dispatchEvent(new Event('input', { bubbles: true, inputType: 'deleteContentBackward' }));
                    await new Promise(r => setTimeout(r, 120 + Math.random()*80));
                }

                // 3b. keydown 이벤트 발생 (인간미 있는 keydown 설정)
                el.dispatchEvent(new KeyboardEvent('keydown', {
                    key: key,
                    code: `Key${key.toUpperCase()}`,
                    keyCode: keyCode,
                    which: keyCode,
                    bubbles: true,
                    cancelable: true
                }));
                
                // 3c. keypress 이벤트 발생
                el.dispatchEvent(new KeyboardEvent('keypress', {
                    key: key,
                    keyCode: keyCode,
                    which: keyCode,
                    bubbles: true,
                    cancelable: true
                }));
                
                // 3d. 엘리먼트 속성에 따라 실제 값을 순차 대입
                if (el.contentEditable === 'true') {
                    accumulatedValue += char;
                    el.textContent = accumulatedValue;
                } else {
                    accumulatedValue += char;
                    setNativeValue(el, accumulatedValue);
                }
                
                // 3e. input 이벤트 발생
                el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                
                // 3f. keyup 이벤트 발생
                el.dispatchEvent(new KeyboardEvent('keyup', {
                    key: key,
                    keyCode: keyCode,
                    which: keyCode,
                    bubbles: true,
                    cancelable: true
                }));
                
                // 3g. 글자 간 불규칙한 인간 타이핑 딜레이 모사 (문장 부호는 느리게)
                const isPunctuation = /[.,!?;:]/.test(char);
                const randomDelay = isPunctuation ? (180 + Math.random() * 220) : (45 + Math.random() * 50);
                await new Promise(r => setTimeout(r, randomDelay));
            }
            
            // 4. 최종 값 2중 안전 장치 (Dual-Layer Sync Safeguard)
            if (el.contentEditable === 'true') {
                el.textContent = val;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
            } else {
                setNativeValue(el, val);
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
            }
            
            // 5. 블러 처리 및 포커스 아웃
            el.blur();
            await dispatchHumanEvents(el, ['blur', 'focusout']);
            await new Promise(r => setTimeout(r, 40));
        }

        // ============================================================
        // [v4.1] 텍스트/이메일/전화 필드 값 입력 (초지능 인간 타이핑 연계)
        // ============================================================
        const applyVal = async (el, val, matchedAttr) => {
            if (!val || !el) return;
            if (el.tagName === 'SELECT') {
                await applySelect(el);
                return;
            }

            // 이미 값이 있으면 스킵
            const currentVal = el.contentEditable === 'true' ? (el.textContent || '') : (el.value || '');
            if (currentVal.trim() !== '') return;

            await new Promise(r => setTimeout(r, speed.field));

            // 초지능 인간 타이핑 시뮬레이터 실행!
            await typeHumanlike(el, val);

            logDev(`   - [Input✅] "${(matchedAttr || '').toString().substring(0,20)}" | Val: ${val.substring(0, 20)}...`);
            filledFields++;
        };

        // 패턴 매칭 함수
        const matchField = async (patterns, val, el) => {
            if (!val) return false;
            const label = getLabelFor(el).toLowerCase();
            const placeholder = (el.placeholder || '').toLowerCase();
            const name = (el.name || '').toLowerCase();
            const id = (el.id || '').toLowerCase();
            const cls = (el.className || '').toString().toLowerCase();
            const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
            const autocomplete = (el.getAttribute('autocomplete') || '').toLowerCase();
            const isGenericId = !id || id === 'null-field' || /^\d+$/.test(id) || id.includes('input');
            const combined = isGenericId
                ? `${label} ${placeholder} ${cls} ${ariaLabel} ${autocomplete}`
                : `${label} ${placeholder} ${name} ${id} ${cls} ${ariaLabel} ${autocomplete}`;

            if (isGenericId && label && patterns.some(p => p.test(label))) {
                await applyVal(el, val, patterns.find(p => p.test(label)));
                return true;
            }
            if (patterns.some(p => p.test(combined))) {
                await applyVal(el, val, patterns.find(p => p.test(combined)));
                return true;
            }
            return false;
        };

        // [v4.12.27] Smart Name Splitter
        function splitName(fullName) {
            if (!fullName) return { first: 'John', last: 'Doe' };
            const trimmed = fullName.trim();
            const hangulRegex = /^[가-힣]+$/;
            if (hangulRegex.test(trimmed)) {
                if (trimmed.length === 3) {
                    return { last: trimmed.charAt(0), first: trimmed.substring(1) };
                } else if (trimmed.length === 2) {
                    return { last: trimmed.charAt(0), first: trimmed.charAt(1) };
                } else if (trimmed.length === 4) {
                    const doubleSurnames = ['황보', '독고', '사공', '남궁', '제갈', '서문'];
                    const prefix2 = trimmed.substring(0, 2);
                    if (doubleSurnames.includes(prefix2)) {
                        return { last: prefix2, first: trimmed.substring(2) };
                    }
                    return { last: trimmed.charAt(0), first: trimmed.substring(1) };
                }
            }
            const parts = trimmed.split(/\s+/);
            if (parts.length > 1) {
                const last = parts.pop();
                const first = parts.join(' ');
                return { first, last };
            }
            return { first: trimmed, last: trimmed };
        }

        // [v4.12.27] Smart Value Generator for BruteForce fallback
        function generateSmartRandomValue(el) {
            const label = getLabelFor(el).toLowerCase();
            const placeholder = (el.placeholder || '').toLowerCase();
            const name = (el.name || '').toLowerCase();
            const id = (el.id || '').toLowerCase();
            const cls = (el.className || '').toString().toLowerCase();
            const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
            const autocomplete = (el.getAttribute('autocomplete') || '').toLowerCase();
            const c = `${label} ${placeholder} ${name} ${id} ${cls} ${ariaLabel} ${autocomplete}`.toLowerCase();
            
            const type = (el.type || 'text').toLowerCase();
            
            // 1. 숫자 전용 필드 판정
            const isNumeric = type === 'number' || type === 'tel' || 
                              el.getAttribute('inputmode') === 'numeric' ||
                              /zip|postal|phone|tel|fax|mobile|number|qty|quantity|code|digit/i.test(c);
            
            if (isNumeric) {
                if (/phone|tel|mobile|fax|전화|연락처|휴대폰/i.test(c)) {
                    if (tpl.phone && tpl.phone.trim() !== '') return tpl.phone;
                    const rand8 = Math.floor(10000000 + Math.random() * 90000000);
                    return '010-' + String(rand8).substring(0, 4) + '-' + String(rand8).substring(4);
                }
                if (/zip|postal|우편/i.test(c)) {
                    const rand5 = Math.floor(10000 + Math.random() * 90000);
                    return String(rand5);
                }
                const rand2 = Math.floor(1 + Math.random() * 98);
                return String(rand2);
            }
            
            // 2. 이메일 필드 판정
            const isEmail = type === 'email' || /email|mail/i.test(c);
            if (isEmail) {
                if (tpl.email && tpl.email.trim() !== '') return tpl.email;
                const randChars = Math.random().toString(36).substring(2, 8);
                return randChars + '@gmail.com';
            }
            
            // 3. 텍스트 / 일반 글자 필드
            if (/company|회사|org/i.test(c)) {
                return (tpl.name || getRandomTemplateVal()) + ' Inc.';
            }
            if (/address|주소/i.test(c)) {
                return '123 Business Rd, New York, NY';
            }
            if (/subject|제목|title/i.test(c)) {
                return tpl.subject || 'Business Inquiry';
            }
            if (el.tagName === 'TEXTAREA' || /message|content|body|내용/i.test(c)) {
                return tpl.message || 'Hello, I would like to inquire about your services. Please contact me back.';
            }
            
            // 성/이름 필드 스마트 스플리터 적용
            if (/last.?name|family.?name|surname|성(?!명)/i.test(c)) {
                const s = splitName(tpl.name);
                return tpl.lastName || s.last || 'Kim';
            }
            if (/first.?name|given.?name/i.test(c)) {
                const s = splitName(tpl.name);
                return tpl.firstName || s.first || 'Gildong';
            }
            if (/name|이름|성함|성명/i.test(c)) {
                return tpl.name || 'Gildong Hong';
            }
            
            return getRandomTemplateVal();
        }

        // 템플릿 유효값 수집
        const templateVals = [
            tpl.firstName, tpl.lastName, tpl.name, tpl.email,
            tpl.phone, tpl.subject, tpl.message
        ].filter(v => typeof v === 'string' && v.trim() !== '');

        const getRandomTemplateVal = () => {
            if (templateVals.length > 0) return templateVals[Math.floor(Math.random() * templateVals.length)];
            return "Inquiry";
        };

        // ── 확장된 honeypot 판정 (v4.0: 오탐 방지 강화) ──
        function isHoneypotV4(el) {
            // 1. 명시적 허니팟 표지 검사
            const idOrName = ((el.id || '') + ' ' + (el.name || '')).toLowerCase();
            const honeypotKeywords = ['honeypot', 'website_url', 'trap', 'bottom_field', 'h-captcha-response', 'g-recaptcha-response'];
            if (honeypotKeywords.some(k => idOrName.includes(k))) return true;

            // 2. 물리적 크기가 0x0인 극단적인 경우에만 허니팟으로 강력 판정
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) {
                const style = window.getComputedStyle(el);
                if (style.display === 'none' || style.visibility === 'hidden') return true;
            }

            // 3. input/textarea/select 등 네이티브 포커스 가능한 태그이며 물리적 크기가 있는 경우 100% 정상 필드로 판정
            const tagName = el.tagName.toLowerCase();
            if ((tagName === 'input' || tagName === 'textarea' || tagName === 'select') && rect.width > 0 && rect.height > 0) {
                return false;
            }

            // 4. 시각적 비가시 판정 (안전하게 display:none, visibility:hidden, opacity:0 인 경우만 기본 판정)
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
                return true;
            }

            return false;
        }

        // ── 1단계: 모든 입력란 수집 (form 내부 + 확장 탐색) ──
        logDev("🎯 [HyperEngine v4.0] Phase 0 - 입력 필드 전수 수집...");
        let inputs = Array.from(queryAllInputs(form));

        // form 태그 외부에 있는 관련 필드 추가 탐색
        if (form.tagName !== 'BODY' && form.tagName !== 'HTML') {
            // form 근처의 형제/부모 요소에서 추가 필드 탐색
            const formParent = form.parentElement;
            if (formParent) {
                const nearbyInputs = Array.from(queryAllInputs(formParent));
                nearbyInputs.forEach(inp => {
                    if (!inputs.includes(inp)) inputs.push(inp);
                });
            }
        }

        // 라디오/체크박스 명시적 수집 (queryAllInputs가 누락할 수 있으므로)
        const allRadios = Array.from(queryAllDeep('input[type="radio"]', form));
        const allCheckboxes = Array.from(queryAllDeep('input[type="checkbox"]', form));
        allRadios.forEach(r => { if (!inputs.includes(r)) inputs.push(r); });
        allCheckboxes.forEach(c => { if (!inputs.includes(c)) inputs.push(c); });

        logDev(`   [v4.0] 총 ${inputs.length}개 입력 필드 발견 (radio: ${allRadios.length}, checkbox: ${allCheckboxes.length})`);

        // ── 2단계: 네이티브 SELECT 드롭다운 전수 처리 ──
        logDev("🎯 [HyperEngine v4.0] Phase 1 - 네이티브 드롭다운 전수 처리...");
        for (const el of inputs) {
            if (isHoneypotV4(el)) continue;
            if (el.tagName === 'SELECT') await applySelect(el);
        }

        // ── 3단계: 커스텀 드롭다운 처리 (div/span 기반) ──
        logDev("🎯 [HyperEngine v4.0] Phase 2 - 커스텀 드롭다운 처리...");
        await applyCustomDropdown(form);

        // ── 4단계: 약관/동의 체크박스 우선 처리 ──
        logDev("🎯 [HyperEngine v4.0] Phase 3 - 약관/동의 체크박스 처리...");
        for (const el of inputs) {
            if (isHoneypotV4(el)) continue;
            if (el.type === 'checkbox') {
                const labelText = getLabelFor(el).toLowerCase();
                const containerText = (el.closest('div, label, span, p')?.textContent || '').toLowerCase().substring(0, 300);
                const combined = labelText + ' ' + containerText;
                const termsKeywords = [
                    'agree', 'terms', 'policy', 'consent', 'accept', 'privacy',
                    '동의', '규정', '약관', '개인정보', '수집', '이용',
                    'gdpr', 'einwilligung', 'datenschutz', 'consentement', 'aceptar'
                ];
                if (termsKeywords.some(k => combined.includes(k))) {
                    await applyCheckbox(el);
                    filledFields++;
                }
            }
        }

        // ── 5단계: 텍스트 필드 패턴 매칭 ──
        logDev("🎯 [HyperEngine v4.0] Phase 4 - 텍스트 필드 패턴 매칭...");
        for (const el of inputs) {
            if (isHoneypotV4(el)) continue;
            if (el.type === 'checkbox' || el.type === 'radio' || el.tagName === 'SELECT') continue;
            if (el.type === 'hidden' || el.type === 'submit' || el.type === 'button' || el.type === 'image' || el.type === 'file') continue;

            const sName = splitName(tpl.name);
            const fNameVal = tpl.firstName || sName.first || tpl.name;
            const lNameVal = tpl.lastName || sName.last || '';

            if (await matchField(FIELD_PATTERNS.firstName, fNameVal, el)) continue;
            if (await matchField(FIELD_PATTERNS.lastName, lNameVal, el)) continue;
            if (await matchField(FIELD_PATTERNS.name, tpl.name, el)) continue;
            if (await matchField(FIELD_PATTERNS.email, tpl.email, el)) continue;
            if (await matchField(FIELD_PATTERNS.phone, tpl.phone, el)) continue;
            if (await matchField(FIELD_PATTERNS.subject, tpl.subject, el)) continue;
            if (await matchField(FIELD_PATTERNS.message, tpl.message, el)) continue;
        }

        // ── 6단계: 텍스트 폴백 - 여전히 빈 필드 강제 채우기 ──
        logDev("🎯 [HyperEngine v4.0] Phase 5 - 빈 필드 강제 채우기...");
        for (const el of inputs) {
            if (isHoneypotV4(el)) continue;
            if (el.type === 'checkbox' || el.type === 'radio' || el.tagName === 'SELECT') continue;
            if (el.type === 'hidden' || el.type === 'submit' || el.type === 'button' || el.type === 'image' || el.type === 'file') continue;

            const currentVal = el.contentEditable === 'true' ? (el.textContent || '') : (el.value || '');
            if (currentVal.trim() !== '') continue;

            if (el.tagName === 'TEXTAREA' || el.contentEditable === 'true') {
                await applyVal(el, tpl.message || getRandomTemplateVal(), 'Fallback-Message');
            } else {
                const ph = (el.placeholder || '').toLowerCase();
                const nm = (el.name || '').toLowerCase();
                const tp = (el.type || '').toLowerCase();
                const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
                const autocomp = (el.getAttribute('autocomplete') || '').toLowerCase();
                const label = getLabelFor(el).toLowerCase();
                const hint = `${ph} ${nm} ${ariaLabel} ${autocomp} ${label}`;

                let val;
                if (tp === 'email' || hint.includes('email') || hint.includes('mail')) val = tpl.email;
                else if (tp === 'tel' || hint.includes('phone') || hint.includes('tel') || hint.includes('mobile') || hint.includes('전화') || hint.includes('연락처')) val = tpl.phone;
                else if (tp === 'number' && (hint.includes('zip') || hint.includes('postal') || hint.includes('우편'))) val = '00000';
                else if (hint.includes('first')) val = tpl.firstName || tpl.name;
                else if (hint.includes('last') || hint.includes('surname') || hint.includes('family')) val = tpl.lastName || tpl.name;
                else if (hint.includes('name') || hint.includes('이름') || hint.includes('성함') || hint.includes('氏名')) val = tpl.name;
                else if (hint.includes('subject') || hint.includes('제목') || hint.includes('title') || hint.includes('件名')) val = tpl.subject;
                else if (hint.includes('company') || hint.includes('회사') || hint.includes('org') || hint.includes('회사명')) val = (tpl.name || 'Company') + ' Inc.';
                else if (hint.includes('address') || hint.includes('주소')) val = 'N/A';
                else if (hint.includes('zip') || hint.includes('postal') || hint.includes('우편')) val = '00000';
                else if (hint.includes('city') || hint.includes('도시') || hint.includes('시/군/구')) val = 'Seoul';
                else if (hint.includes('state') || hint.includes('province') || hint.includes('시/도')) val = 'Seoul';
                else if (hint.includes('country') || hint.includes('국가')) val = 'Korea';
                else if (hint.includes('website') || hint.includes('url') || hint.includes('homepage') || hint.includes('홈페이지')) val = '';  // 웹사이트 필드는 빈칸 허용
                else if (tp === 'url') val = ''; // URL 필드는 건너뛰기
                else val = getRandomTemplateVal().substring(0, 100);

                if (val) await applyVal(el, val, 'Fallback-SmartHint');
            }
        }

        // ── 7단계: 라디오 버튼 전수 - 미선택 그룹 처리 ──
        logDev("🎯 [HyperEngine v4.0] Phase 6 - 라디오 버튼 미선택 그룹 처리...");
        try {
            const radioElements = Array.from(queryAllDeep('input[type="radio"]', form)).filter(r => !isHoneypotV4(r));
            const radioGroups = {};
            radioElements.forEach(radio => {
                const grpKey = radio.name || `_unnamed_${radio.id || Math.random()}`;
                if (!radioGroups[grpKey]) radioGroups[grpKey] = [];
                radioGroups[grpKey].push(radio);
            });

            for (const name in radioGroups) {
                const group = radioGroups[name];
                const isChecked = group.some(r => r.checked);
                if (!isChecked && group.length > 0) {
                    const validRadios = group.filter(r => !r.disabled);
                    if (validRadios.length === 0) continue;

                    // 키워드 매칭으로 최적 라디오 선택
                    const preferredKeywords = ['inquiry', 'general', 'other', 'yes', '문의', '일반', '기타', '예', 'oui', 'ja', 'はい', '是'];
                    let target = null;
                    for (const radio of validRadios) {
                        const radioLabel = getLabelFor(radio).toLowerCase();
                        const radioVal = (radio.value || '').toLowerCase();
                        if (preferredKeywords.some(k => radioLabel.includes(k) || radioVal.includes(k))) {
                            target = radio;
                            break;
                        }
                    }
                    // 키워드 매칭 실패 시 첫 번째 선택
                    if (!target) target = validRadios[0];
                    if (target) {
                        await applyRadio(target);
                        filledFields++;
                    }
                }
            }
        } catch (e) {
            logDev(`⚠️ [Radio Phase] Error: ${e.message}`, 'warning');
        }

        // ── 8단계: 일반 체크박스 전수 처리 (필수 필드만) ──
        logDev("🎯 [HyperEngine v4.0] Phase 7 - 필수 체크박스 처리...");
        try {
            const checkboxElements = Array.from(queryAllDeep('input[type="checkbox"]', form)).filter(cb => !isHoneypotV4(cb));
            for (const cb of checkboxElements) {
                if (cb.checked) continue;

                // 필수 체크박스 판별 (required 속성 또는 asterisk 표시)
                const isRequired = cb.required || cb.getAttribute('aria-required') === 'true';
                const labelText = getLabelFor(cb).toLowerCase();
                const containerText = (cb.closest('div, label, span, li')?.textContent || '').toLowerCase().substring(0, 300);
                const hasAsterisk = containerText.includes('*') || containerText.includes('필수');

                // 뉴스레터/마케팅 체크박스는 스킵
                const marketingKeywords = ['newsletter', 'marketing', 'subscribe', 'promotion', 'offer', '뉴스레터', '광고', '마케팅', '프로모션'];
                const isMarketing = marketingKeywords.some(k => labelText.includes(k) || containerText.includes(k));

                if ((isRequired || hasAsterisk) && !isMarketing) {
                    await applyCheckbox(cb);
                    filledFields++;
                }
            }
        } catch (e) {
            logDev(`⚠️ [Checkbox Phase] Error: ${e.message}`, 'warning');
        }

        // ── 9단계: 커스텀 체크박스/라디오 (div/span 기반 ARIA) 처리 ──
        logDev("🎯 [HyperEngine v4.0] Phase 8 - 커스텀 ARIA 체크박스/라디오 처리...");
        await applyCustomCheckableElements(form);

        // ── 10단계: 브루트포스 - contentEditable / role=textbox 탐색 ──
        logDev("🛠️ [HyperEngine v4.0] Phase 9 - BruteForce contentEditable/role=textbox...");
        try {
            const contentEditables = Array.from(queryAllDeep('[contenteditable="true"], [role="textbox"], [role="searchbox"], [role="combobox"]', form));
            for (const inp of contentEditables) {
                if (isHoneypotV4(inp)) continue;
                const text = (inp.textContent || '').trim();
                if (text === '' || text === inp.getAttribute('placeholder')) {
                    await applyVal(inp, tpl.message || getRandomTemplateVal(), 'BruteForce-ContentEditable');
                    filledFields++;
                }
            }
        } catch (e) {
            logDev(`⚠️ [Phase 9] Error: ${e.message}`, 'warning');
        }

        // ── 11단계: [NEW] Super-BruteForce Final Target Sweeper ──
        logDev("🎯 [HyperEngine v4.0] Phase 10 - Super-BruteForce Sweeper (초강력 입력기) 가동...");
        try {
            // 다시 한 번 폼 내의 모든 입력 요소를 전수 수집
            const finalInputs = Array.from(queryAllInputs(form));
            for (const el of finalInputs) {
                // 타입 검사: 비입력용 타입들은 무조건 스킵
                if (el.type === 'hidden' || el.type === 'submit' || el.type === 'button' || el.type === 'image' || el.type === 'file' || el.type === 'reset') continue;
                
                // 이미 체크되었거나 값이 적힌 것들은 스킵
                if (el.type === 'checkbox' && el.checked) continue;
                if (el.type === 'radio' && el.checked) continue;
                
                // 텍스트/셀렉트 박스 값 검사
                const currentVal = el.contentEditable === 'true' ? (el.textContent || '') : (el.value || '');
                if (currentVal.trim() !== '') continue;

                if (el.tagName === 'SELECT') {
                    await applySelect(el);
                    filledFields++;
                } else if (el.type === 'checkbox') {
                    await applyCheckbox(el);
                    filledFields++;
                } else if (el.type === 'radio') {
                    await applyRadio(el);
                    filledFields++;
                } else {
                    // [v4.12.27] 숫자/글자를 정밀 구별하여 똑똑하게 랜덤 주입
                    const val = generateSmartRandomValue(el);
                    if (val) {
                        await applyVal(el, val, 'SuperSweeper-Smart');
                        filledFields++;
                    }
                }
            }
        } catch (e) {
            logDev(`⚠️ [SuperSweeper] Error: ${e.message}`, 'warning');
        }

        // ── 11단계: 멀티 단계 폼(wizard) 감지 ──
        try {
            const nextBtnKeywords = ['next', 'continue', '다음', '次へ', '下一步', 'weiter', 'suivant', 'siguiente', 'step'];
            const allButtons = Array.from(form.querySelectorAll('button, [role="button"], input[type="button"]'));
            const nextBtn = allButtons.find(btn => {
                const text = (btn.textContent || btn.value || '').toLowerCase().trim();
                return nextBtnKeywords.some(k => text.includes(k)) && text.length < 20;
            });

            if (nextBtn && filledFields > 0) {
                logDev("🔄 [HyperEngine v4.0] 멀티 단계 폼 감지! 'Next' 버튼 클릭...");
                nextBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await new Promise(r => setTimeout(r, 200));
                dispatchHumanEvents(nextBtn, FULL_CLICK_SEQUENCE);
                await new Promise(r => setTimeout(r, 800));

                // 새로운 필드가 나타났으면 재귀적으로 채우기
                const newInputs = Array.from(queryAllInputs(form)).filter(inp => !isHoneypotV4(inp));
                const emptyNewInputs = newInputs.filter(inp => {
                    if (inp.type === 'checkbox' || inp.type === 'radio' || inp.tagName === 'SELECT') return false;
                    const val = inp.contentEditable === 'true' ? (inp.textContent || '') : (inp.value || '');
                    return val.trim() === '';
                });

                if (emptyNewInputs.length > 0) {
                    logDev(`   [v4.0] 2단계 폼에서 ${emptyNewInputs.length}개 빈 필드 발견. 추가 입력 진행...`);
                    for (const el of emptyNewInputs) {
                        if (el.type === 'hidden' || el.type === 'submit' || el.type === 'button') continue;
                        if (await matchField(FIELD_PATTERNS.email, tpl.email, el)) continue;
                        if (await matchField(FIELD_PATTERNS.name, tpl.name, el)) continue;
                        if (await matchField(FIELD_PATTERNS.phone, tpl.phone, el)) continue;
                        if (await matchField(FIELD_PATTERNS.message, tpl.message, el)) continue;

                        // 폴백
                        if (el.tagName === 'TEXTAREA' || el.contentEditable === 'true') {
                            await applyVal(el, tpl.message || getRandomTemplateVal(), 'Step2-Fallback');
                        } else {
                            const hint = `${(el.placeholder || '')} ${(el.name || '')} ${getLabelFor(el)}`.toLowerCase();
                            let val = tpl.name;
                            if (hint.includes('email')) val = tpl.email;
                            else if (hint.includes('phone') || hint.includes('tel')) val = tpl.phone;
                            if (val) await applyVal(el, val, 'Step2-SmartHint');
                        }
                    }
                }
            }
        } catch (e) {
            logDev(`⚠️ [Wizard Phase] Error: ${e.message}`, 'warning');
        }

        logDev(`✅ [HyperEngine v4.0] 폼 작성 완료 - 입력 필드 ${filledFields}개 처리됨`);
        return { filledAny: filledFields > 0 };
    }

    function getLabelFor(el) {
        // [v2.1.0] Supreme Proximity Search
        if (el.id && el.id !== 'null-field') {
            const label = document.querySelector(`label[for="${el.id}"]`);
            if (label) return label.textContent;
        }

        // Check Squarespace/Build style labels (title class or preceding span)
        const parent = el.parentElement;
        if (parent) {
            const labelChild = parent.querySelector('label, .title, .caption, .label');
            if (labelChild && labelChild !== el) return labelChild.textContent;
            
            // Look at parent's preceding sibling (Squarespace Pattern)
            const prevSibling = parent.previousElementSibling;
            if (prevSibling && (prevSibling.tagName === 'LABEL' || prevSibling.classList.contains('title'))) {
                return prevSibling.textContent;
            }
        }
        
        // Search the immediate ancestors until we find a label or meaningful text
        let runner = el;
        for (let i = 0; i < 3; i++) {
            runner = runner.parentElement;
            if (!runner) break;
            const labelSub = runner.querySelector('label');
            if (labelSub) return labelSub.textContent;
        }

        return el.getAttribute('aria-label') || el.title || '';
    }

    function elementIsVisible(el) {
        if (!el) return false;
        try {
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
            
            // Handle cases where a parent is hidden
            if (el.offsetParent === null && style.position !== 'fixed') return false;

            const rect = el.getBoundingClientRect();
            return rect.width > 2 && rect.height > 2; // [v18.6.0] Threshold for visibility
        } catch(e) { return false; }
    }

    function isHoneypot(el) {
        if (!elementIsVisible(el)) return true;
        
        // Common Honeypot identifiers
        const honeypotKeywords = ['honeypot', 'website_url', 'trap', 'bottom_field'];
        const idOrName = (el.id + ' ' + el.name).toLowerCase();
        return honeypotKeywords.some(k => idOrName.includes(k));
    }

    function takeSuccessSnapshot() {
        const selectors = '[data-testid*="success"], [class*="success"], [id*="success"], .font_8 span, .wixui-rich-text, h1, h2, .status-msg';
        const elementsSnapshot = new Set();
        document.querySelectorAll(selectors).forEach(el => {
            if (elementIsVisible(el)) {
                elementsSnapshot.add(el.textContent.trim().toLowerCase());
            }
        });
        return {
            elements: Array.from(elementsSnapshot),
            bodyText: document.body.textContent.toLowerCase()
        };
    }

    async function checkForCaptcha() {
        // Detect reCAPTCHA, hCaptcha, Turnstile, etc.
        const captchaSelectors = [
            'iframe[src*="recaptcha"]',
            'iframe[src*="hcaptcha"]',
            'iframe[src*="turnstile"]',
            '.g-recaptcha iframe',
            '.h-captcha iframe',
            '#turnstile-container iframe',
            'div[class*="captcha"] iframe',
            'iframe[title*="captcha"]'
        ];
        
        // [v17.5.0] Active Widget Check: A div with "captcha" in its ID is only a challenge if it contains an iframe
        return captchaSelectors.some(s => document.querySelector(s) !== null);
    }

    function extractCaptchaSitekey() {
        const turnstileFrame = document.querySelector('iframe[src*="turnstile"]');
        if (turnstileFrame) {
            const match = turnstileFrame.src.match(/sitekey=([^&]+)/) || turnstileFrame.src.match(/k=([^&]+)/);
            if (match) return { type: 'turnstile', sitekey: match[1] };
            const wrapper = turnstileFrame.closest('.cf-turnstile') || document.querySelector('.cf-turnstile');
            if (wrapper && wrapper.dataset.sitekey) return { type: 'turnstile', sitekey: wrapper.dataset.sitekey };
        }

        const recaptchaFrame = document.querySelector('iframe[src*="recaptcha"]');
        if (recaptchaFrame) {
            const match = recaptchaFrame.src.match(/k=([^&]+)/);
            if (match) return { type: 'recaptcha', sitekey: match[1] };
            const gDiv = document.querySelector('.g-recaptcha');
            if (gDiv && gDiv.dataset.sitekey) return { type: 'recaptcha', sitekey: gDiv.dataset.sitekey };
        }
        
        const hcaptchaFrame = document.querySelector('iframe[src*="hcaptcha"]');
        if (hcaptchaFrame) {
            const match = hcaptchaFrame.src.match(/sitekey=([^&]+)/);
            if (match) return { type: 'hcaptcha', sitekey: match[1] };
            const hDiv = document.querySelector('.h-captcha');
            if (hDiv && hDiv.dataset.sitekey) return { type: 'hcaptcha', sitekey: hDiv.dataset.sitekey };
        }
        return null;
    }

    async function tryAutoSolveCaptcha() {
        const captchaData = extractCaptchaSitekey();
        if (!captchaData) return false;

        return new Promise((resolve) => {
            logDev(`🤖 [Security] Attempting auto-solve for ${captchaData.type}...`, 'info');
            chrome.runtime.sendMessage({
                action: 'SOLVE_CAPTCHA',
                sitekey: captchaData.sitekey,
                url: window.location.href,
                type: captchaData.type
            }, (response) => {
                if (chrome.runtime.lastError || !response || !response.success) {
                    logDev(`❌ Auto-solve failed: ${(response && response.error) ? response.error : 'Unknown'}`, 'error');
                    resolve(false);
                } else {
                    logDev(`✅ Challenge solved! Injecting token...`, 'success');
                    if (captchaData.type === 'turnstile') {
                        const input = document.querySelector('[name="cf-turnstile-response"]');
                        if (input) input.value = response.token;
                    } else if (captchaData.type === 'recaptcha') {
                        const input = document.querySelector('[name="g-recaptcha-response"]');
                        if (input) input.value = response.token;
                    } else if (captchaData.type === 'hcaptcha') {
                        const input = document.querySelector('[name="h-captcha-response"]');
                        if (input) input.value = response.token;
                    }
                    
                    const injectedInput = document.querySelector(`[name*="-response"]`);
                    if(injectedInput) injectedInput.dispatchEvent(new Event('change', { bubbles: true }));

                    resolve(true);
                }
            });
        });
    }

    async function waitForCaptchaSolved() {
        const MAX_WAIT = 120; // 2분(120초) 대기 시간 안정적으로 유지
        
        let autoSolveAttempted = false;

        for (let i = 0; i < MAX_WAIT; i++) {
            await new Promise(r => setTimeout(r, 1000));
            
            const stillHasCaptcha = await checkForCaptcha();
            
            // 모든 프레임과 폼 영역에서 캡챠 토큰 응답 필드 탐색
            const gResponse = document.querySelector('[name="g-recaptcha-response"]') || document.querySelector('#g-recaptcha-response');
            const hResponse = document.querySelector('[name="h-captcha-response"]') || document.querySelector('#h-captcha-response');
            const tResponse = document.querySelector('[name="cf-turnstile-response"]') || document.querySelector('#cf-turnstile-response') || document.querySelector('[name="cf_challenge_response"]');
            
            // Auto-solve injection trigger
            if (stillHasCaptcha && !autoSolveAttempted) {
                autoSolveAttempted = true;
                const solved = await tryAutoSolveCaptcha();
                if (solved) continue; // Will be picked up by the next iteration's early exit check
            }

            // [Early Exit] 캡챠가 해결되었거나, 캡챠 창이 제거되었거나, 정답 토큰이 확보된 경우 즉각 복귀
            const hasToken = (gResponse && gResponse.value && gResponse.value.trim() !== '') || 
                             (hResponse && hResponse.value && hResponse.value.trim() !== '') || 
                             (tResponse && tResponse.value && tResponse.value.trim() !== '');

            if (!stillHasCaptcha || hasToken) {
                logDev("🔑 [Security] Challenge solved or removed. Resuming sequence immediately.", "success");
                // 0.5초(500ms)의 최소 안전 딜레이 후 즉각 복귀
                await new Promise(r => setTimeout(r, 500));
                return true;
            }
        }
        return false;
    }

    // ============================================================
    // [v4.2] 에러 하이라이트 감지 자가 복구기 (Self-Healing Validation Recovery Engine)
    // ============================================================
    async function selfHealErrorFields(form, tpl) {
        if (!form) return 0;
        let healedCount = 0;
        try {
            const candidates = Array.from(queryAllInputs(form));
            const errorFields = [];

            // 폼 내부 및 주변의 에러 메시지 텍스트 미리 확보 (Wix의 .Z0mg9X 등 포함)
            const errorContainers = Array.from(document.querySelectorAll('.Z0mg9X, .TTK5ZL, [class*="error"], [id*="error"], .invalid-feedback, .error-notice, .error-message'));
            const visibleErrorTexts = errorContainers
                .filter(el => elementIsVisible(el))
                .map(el => (el.textContent || '').trim().toLowerCase())
                .filter(txt => txt.length > 0);

            for (const el of candidates) {
                // 특수 버튼/파일 타입은 에러 판정에서 제외
                if (el.type === 'hidden' || el.type === 'submit' || el.type === 'button' || el.type === 'image' || el.type === 'file' || el.type === 'reset') continue;
                
                let isError = false;
                
                // 1. HTML5 native :invalid 체크 및 aria-invalid 체크
                try {
                    if (el.matches(':invalid') || el.getAttribute('aria-invalid') === 'true' || el.getAttribute('data-state') === 'invalid') {
                        isError = true;
                    }
                } catch(e) {}
                
                // 2. 조상 래퍼 클래스 트래버스 (최대 5레벨 위 조상까지 검사하여 invalid 클래스 마킹 확인 - Wix .tkHMZu 등 감지)
                if (!isError) {
                    let ancestor = el.parentElement;
                    const errorKeywords = ['error', 'invalid', 'failed', 'danger', 'required', 'warning', 'err-', 'tkhmzu'];
                    for (let depth = 0; depth < 5 && ancestor; depth++) {
                        const ancestorClass = (ancestor.className || '').toString().toLowerCase();
                        const ancestorId = (ancestor.id || '').toString().toLowerCase();
                        const combinedAttr = `${ancestorClass} ${ancestorId}`;
                        
                        if (errorKeywords.some(k => combinedAttr.includes(k))) {
                            isError = true;
                            break;
                        }
                        ancestor = ancestor.parentElement;
                    }
                }
                
                // 3. 동적 에러 텍스트 연계 및 형제 노드 (.Z0mg9X) 검사
                if (!isError) {
                    // Wix 에러 텍스트 컴포넌트가 인풋 주변에 가시적으로 렌더링되어 있는지 검사
                    const siblings = el.parentElement ? Array.from(el.parentElement.children) : [];
                    const hasVisibleErrorSibling = siblings.some(sib => {
                        const isErrorContainer = sib.classList.contains('Z0mg9X') || (sib.className || '').toString().toLowerCase().includes('error');
                        return isErrorContainer && elementIsVisible(sib);
                    });
                    if (hasVisibleErrorSibling) {
                        isError = true;
                    }
                }

                // 4. 에러 메시지 텍스트 파싱을 통한 타깃 필드 매칭 (예: "email" 단어가 에러창에 보이면 이메일 인풋을 즉시 에러로 매핑)
                if (!isError && visibleErrorTexts.length > 0) {
                    const label = getLabelFor(el).toLowerCase();
                    const ph = (el.placeholder || '').toLowerCase();
                    const nm = (el.name || '').toLowerCase();
                    const type = (el.type || '').toLowerCase();
                    const hint = `${label} ${ph} ${nm} ${type}`;

                    const keywordsToTest = ['email', 'phone', 'tel', 'name', 'message', 'subject', '이메일', '전화', '이름', '메시지', '제목', 'mail'];
                    const matchedKeyword = keywordsToTest.find(k => hint.includes(k));
                    
                    if (matchedKeyword) {
                        // 페이지 전반의 가시적 에러 메시지 중 해당 필드 명칭을 담은 에러 텍스트가 1개라도 존재하는 경우
                        if (visibleErrorTexts.some(errText => errText.includes(matchedKeyword) || errText.includes('필수') || errText.includes('required') || errText.includes('invalid'))) {
                            isError = true;
                        }
                    }
                }
                
                // 5. 시각적 빨간색 border/box-shadow/background 변색 검사
                if (!isError) {
                    const style = window.getComputedStyle(el);
                    const parentStyle = el.parentElement ? window.getComputedStyle(el.parentElement) : null;
                    
                    const isRedColor = (colorStr) => {
                        if (!colorStr) return false;
                        const match = colorStr.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
                        if (match) {
                            const r = parseInt(match[1], 10);
                            const g = parseInt(match[2], 10);
                            const b = parseInt(match[3], 10);
                            return r > 150 && g < 90 && b < 90;
                        }
                        return colorStr.includes('#ff0000') || colorStr.includes('red') || colorStr.includes('rgb(255, 64, 64)');
                    };
                    
                    if (isRedColor(style.borderColor) || isRedColor(style.boxShadow) || isRedColor(style.outlineColor) ||
                        (parentStyle && (isRedColor(parentStyle.borderColor) || isRedColor(parentStyle.boxShadow)))) {
                        isError = true;
                    }
                }

                if (isError) {
                    errorFields.push(el);
                }
            }

            if (errorFields.length > 0) {
                logDev(`⚠️ [Healer] 정밀 에러 자가 복구 가동! 대상 필드 ${errorFields.length}개 발견.`, 'warning');
                
                for (const el of errorFields) {
                    // 1. 완벽한 값 초기화 (React/Vue 가상 DOM 내부까지 값 세터를 리셋)
                    if (el.contentEditable === 'true') {
                        el.textContent = '';
                    } else {
                        setNativeValue(el, '');
                        el.value = '';
                    }
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    await new Promise(r => setTimeout(r, 80));

                    // 2. 복구용 다변화된 100% 새로운 스마트 무작위 값 대입
                    const label = getLabelFor(el).toLowerCase();
                    const ph = (el.placeholder || '').toLowerCase();
                    const nm = (el.name || '').toLowerCase();
                    const type = (el.type || '').toLowerCase();
                    const hint = `${label} ${ph} ${nm}`;

                    const templateVals = [
                        tpl.firstName, tpl.lastName, tpl.name, tpl.email,
                        tpl.phone, tpl.subject, tpl.message
                    ].filter(v => typeof v === 'string' && v.trim() !== '');

                    const getRandomTemplateVal = () => {
                        if (templateVals.length > 0) return templateVals[Math.floor(Math.random() * templateVals.length)];
                        return "Inquiry";
                    };

                    let val = getRandomTemplateVal();
                    if (type === 'email' || hint.includes('email') || hint.includes('mail')) {
                        // 이메일 패턴 완전 재생성
                        const domains = ['gmail.com', 'outlook.com', 'yahoo.com', 'hotmail.com', 'naver.com', 'daum.net'];
                        const randomUser = 'contact_pro_' + Math.random().toString(36).substring(2, 8);
                        val = `${randomUser}@${domains[Math.floor(Math.random() * domains.length)]}`;
                    } else if (type === 'tel' || hint.includes('phone') || hint.includes('tel') || hint.includes('mobile') || hint.includes('전화') || hint.includes('연락처')) {
                        // 전화번호 패턴 재생성 (해외/국내 규격 유연 대조)
                        val = '010' + Math.floor(20000000 + Math.random() * 80000000);
                    } else if (hint.includes('name') || hint.includes('이름') || hint.includes('氏') || hint.includes('성함')) {
                        val = (tpl.name || 'User') + '_' + Math.floor(100 + Math.random() * 900);
                    } else if (hint.includes('subject') || hint.includes('제목') || hint.includes('title')) {
                        val = (tpl.subject || 'Inquiry') + ' ' + Math.random().toString(36).substring(2, 6).toUpperCase();
                    }

                    // 3. 진짜 인간의 1자 단위 불규칙 타이핑 모사로 다시 재입력!
                    await typeHumanlike(el, val);
                    healedCount++;
                }
            }
        } catch (e) {
            logDev(`⚠️ [Healer] 에러 복구 루틴 중 오류 발생: ${e.message}`, 'error');
        }
        return healedCount;
    }

    // ============================================================
    // [v4.2] 150ms 융단폭격형 실시간 공란 자동 메꾸기 크롤러 (Active Empty Field Sweeper)
    // ============================================================
    let _activeSweeperTimer = null;
    function startActiveEmptyFieldSweeper(form, tpl) {
        if (_activeSweeperTimer) clearInterval(_activeSweeperTimer);
        
        const templateVals = [
            tpl.firstName, tpl.lastName, tpl.name, tpl.email,
            tpl.phone, tpl.subject, tpl.message
        ].filter(v => typeof v === 'string' && v.trim() !== '');

        const getRandomTemplateVal = () => {
            if (templateVals.length > 0) return templateVals[Math.floor(Math.random() * templateVals.length)];
            return "Inquiry";
        };

        // 150ms 초고속 주기로 단축하여 동적 렌더링에 실시간 대응
        _activeSweeperTimer = setInterval(async () => {
            try {
                if (!form || !document.body.contains(form)) {
                    clearInterval(_activeSweeperTimer);
                    return;
                }

                // 폼 내의 모든 타깃 요소 수집
                const candidates = Array.from(queryAllInputs(form));
                
                // 라디오 버튼 그룹들을 묶어서 체크 상태 조사
                const radioGroups = {};

                for (const el of candidates) {
                    if (el.type === 'hidden' || el.type === 'submit' || el.type === 'button' || el.type === 'image' || el.type === 'file' || el.type === 'reset') continue;
                    
                    // A. 라디오 버튼 실시간 공란 탐지 (동일 name 그룹 내에 아무도 체크되지 않은 경우 검출)
                    if (el.type === 'radio') {
                        const grpKey = el.name || `_unnamed_${el.id || Math.random()}`;
                        if (!radioGroups[grpKey]) radioGroups[grpKey] = [];
                        radioGroups[grpKey].push(el);
                        continue; // 라디오 처리는 루프 아래에서 일괄 수행
                    }

                    // B. 필수 체크박스 미체크 상태 실시간 검출
                    if (el.type === 'checkbox') {
                        if (el.checked) continue;
                        
                        const isRequired = el.required || el.getAttribute('aria-required') === 'true';
                        const containerText = (el.closest('div, label, span, li')?.textContent || '').toLowerCase();
                        const hasAsterisk = containerText.includes('*') || containerText.includes('필수') || containerText.includes('agree');
                        
                        if (isRequired || hasAsterisk) {
                            logDev(`⚡ [Sweeper] 필수 체크박스 미체크 감지 및 실시간 체크: <input type="checkbox" id="${el.id}">`);
                            await applyCheckbox(el);
                        }
                        continue;
                    }
                    
                    // C. 셀렉트 박스 미선택 상태 실시간 검출
                    if (el.tagName === 'SELECT') {
                        if (el.selectedIndex > 0) continue;
                        logDev(`⚡ [Sweeper] 미선택 드롭다운 감지 및 실시간 선택: <select id="${el.id}">`);
                        await applySelect(el);
                        continue;
                    }

                    // D. 텍스트 / contentEditable / role=textbox 실시간 검출
                    const currentVal = el.contentEditable === 'true' ? (el.textContent || '') : (el.value || '');
                    if (currentVal.trim() !== '') continue;

                    // 공란 발견 시 즉시 극사실주의적 인간 타이핑 주입!
                    logDev(`⚡ [Sweeper] 공란 자동 감지 및 충전 개시: <${el.tagName} id="${el.id}" name="${el.name}">`);
                    
                    if (el.tagName === 'TEXTAREA' || el.contentEditable === 'true' || el.getAttribute('role') === 'textbox') {
                        await applyVal(el, tpl.message || getRandomTemplateVal(), 'Sweeper-Message');
                    } else {
                        await applyVal(el, getRandomTemplateVal(), 'Sweeper-Text');
                    }
                }

                // 미선택 라디오 그룹 처리
                for (const grpName in radioGroups) {
                    const group = radioGroups[grpName];
                    const isAnyChecked = group.some(r => r.checked);
                    if (!isAnyChecked && group.length > 0) {
                        const validRadios = group.filter(r => !r.disabled);
                        if (validRadios.length > 0) {
                            const targetRadio = validRadios[0];
                            logDev(`⚡ [Sweeper] 미선택 라디오 그룹 [${grpName}] 감지 및 실시간 체크: <input type="radio" id="${targetRadio.id}">`);
                            await applyRadio(targetRadio);
                        }
                    }
                }

            } catch(e) {}
        }, 150);
    }

    function stopActiveEmptyFieldSweeper() {
        if (_activeSweeperTimer) {
            clearInterval(_activeSweeperTimer);
            _activeSweeperTimer = null;
            logDev("⚡ [Sweeper] 공란 감시 크롤링 엔진 안전 정지 완료.", "info");
        }
    }

    function submitForm(form) {
        // [v18.6.5] Ultra-Robust Button Discovery
        const submitBtn = form.querySelector('button[type="submit"]') || 
                          form.querySelector('input[type="submit"]') ||
                          form.querySelector('[class*="submit"], [id*="submit"]') ||
                          Array.from(form.querySelectorAll('button, a, input[type="button"], div[role="button"]')).find(b => {
                             const text = (b.textContent || b.value || '').toLowerCase();
                             return ['send', 'submit', '전송', '보내기', '送信', '등록', '确定', '提交', '입력', '접수'].some(k => text.includes(k));
                          });
        
        if (submitBtn) {
            logDev(`📤 [Action] Clicking discovered button: ${submitBtn.tagName} | Text: ${(submitBtn.textContent || submitBtn.value || '').substring(0, 10)}`);
            submitBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
            submitBtn.click();
            
            // Fallback for custom JS components that need manual trigger
            ['mousedown', 'mouseup', 'click'].forEach(evt => {
                submitBtn.dispatchEvent(new MouseEvent(evt, { bubbles: true, cancelable: true }));
            });
        } else {
            // [v18.6.5] Bruteforce: If no clear "Submit" button, click the LAST primary-looking button in the container
            const allBtns = Array.from(form.querySelectorAll('button, .btn, [class*="button"]')).filter(b => elementIsVisible(b));
            if (allBtns.length > 0) {
                const lastBtn = allBtns[allBtns.length - 1];
                logDev("🛠️ [Action] No specific submit button. Triggering last visible button as fallback.");
                lastBtn.click();
            } else if (form.tagName === 'FORM') {
                try {
                    HTMLFormElement.prototype.submit.call(form);
                } catch(e) {
                    form.submit();
                }
            } else {
                throw new Error("No valid interaction point found for non-FORM container.");
            }
        }
    }

    async function detectSubmissionResult(originalForm, tpl = {}, preSnapshot = { elements: [], bodyText: "" }) {
        logDev("🕵️ [Result] Verifying submission status (Multi-Polling)...", "info");
        
        const confirmSuccess = async (reason) => {
            logDev(`🎉 [Result] ${reason}`, "success");
            // [v4.1] 성공 시 실시간 공란 감시 스위퍼 정지
            stopActiveEmptyFieldSweeper();

            // [Double Submit] 이중 전송 모드 체크
            const config = await chrome.storage.local.get(['xpider_double_submit']);
            if (config && config.xpider_double_submit === true) {
                const submitCount = parseInt(sessionStorage.getItem('xpider_submit_count') || '0');
                if (submitCount === 0) {
                    logDev("✨ [Engine] Double Submit Active: 1st submission confirmed. Preparing 2nd submission...", "info");
                    sessionStorage.setItem('xpider_submit_count', '1');
                    
                    // Loop Guard 무력화를 위해 제출 기록 일시 삭제
                    sessionStorage.removeItem('xpider_last_submit_path');
                    sessionStorage.removeItem('xpider_last_submit_time');
                    sessionStorage.setItem('xpider_initial_form_present', 'false');
                    sessionStorage.setItem('xpider_pending_verify', 'false');

                    await new Promise(r => setTimeout(r, 2500));
                    window.location.reload();
                    return true;
                } else {
                    logDev("✨ [Engine] Double Submit Complete: 2nd submission confirmed.", "success");
                    sessionStorage.removeItem('xpider_submit_count');
                }
            }

            // [v18.7.0] Success Visibility Buffer: Wait 3.5s so user can see the confirmation UI
            logDev("✨ [Engine] Submission confirmed. Holding tab for visual check...", "info");
            await new Promise(r => setTimeout(r, 3500));
            finishCampaign(true);
            return true;
        };

        const initialUrl = sessionStorage.getItem('xpider_initial_url') || window.location.href;
        const initialFormPresent = sessionStorage.getItem('xpider_initial_form_present') === 'true';

        // [v18.6.7] Keyword Tiers: Distinguish between ultra-strict (anywhere) and scoped (only in success containers)
        const commonSuccessKeywords = [
            'thank you', 'thanks', '완료되었습니다', '성공적으로', '전송되었습니다', '접수되었습니다',
            'ありがとうございます', '送信完了', '受け付けました', '提交成功', 'Success! Message received.',
            'vielen dank', 'gesendet', 'erfolgreich', 'merci', 'envoyé'
        ];
        
        const strictSuccessKeywords = ['success', 'sent', 'received', '성공', '確認', '확인', 'done'];

        // [v18.5.0] Multi-Polling loop: up to 10 seconds
        for (let attempt = 1; attempt <= 10; attempt++) {
            const currentUrl = window.location.href;
            const pageText = document.body.textContent.toLowerCase();
            const formStillThere = originalForm && document.body.contains(originalForm);

            logDev(`🔎 [Result] [Attempt ${attempt}/10] Status -> URL_Changed: ${currentUrl !== initialUrl}, Form_Gone: ${!formStillThere}`, "debug");

            // [v4.1] 폼 에러 자가 복구기 (Self-Healing Engine) 작동 확인
            if (formStillThere) {
                // 한 번의 제출 당 자가 복구는 최대 1회만 시도하여 무한루프 방지
                window._xpider_healed = window._xpider_healed || false;
                if (!window._xpider_healed) {
                    const healed = await selfHealErrorFields(originalForm, tpl);
                    if (healed > 0) {
                        logDev(`🔄 [Healer] 에러 필드 ${healed}개 자가 복구 기입 완료! 폼 재제출을 가동합니다.`, 'success');
                        window._xpider_healed = true;
                        // 실시간 공란 스위퍼 재가동
                        startActiveEmptyFieldSweeper(originalForm, tpl);
                        // 다시 폼 재제출 트리거
                        submitForm(originalForm);
                        // 시도 횟수를 리셋하여 결과를 대기
                        attempt = 1;
                        await new Promise(r => setTimeout(r, 1000));
                        continue;
                    }
                }
            }

            // 1. Wix / Platform Specific success containers (High Accuracy)
            const successContainers = document.querySelectorAll('[data-testid*="success"], [class*="success"], [id*="success"], .font_8 span, .wixui-rich-text, .status-msg, .message-success');
            for (const container of successContainers) {
                if (!elementIsVisible(container)) continue;
                const text = container.textContent.trim().toLowerCase();
                
                // [v18.6.0] Snapshot Comparison: Skip if this exact text was already visible before submission
                if (preSnapshot.elements && preSnapshot.elements.includes(text)) continue;

                if ([...commonSuccessKeywords, ...strictSuccessKeywords].some(k => text.includes(k))) {
                    return await confirmSuccess("Positive confirmation found in UI element!");
                }
            }

            // 2. Check for URL change (Redirection to success page)
            if (currentUrl !== initialUrl && (currentUrl.includes('thank') || currentUrl.includes('success') || currentUrl.includes('confirm') || currentUrl.includes('sent'))) {
                return await confirmSuccess("Redirected to success page!");
            }

            // 3. [v18.6.7] Text Delta Detection: Check for NEW keywords in page content
            const allKeywords = [...commonSuccessKeywords, ...strictSuccessKeywords];
            const foundKeywords = allKeywords.filter(k => pageText.includes(k));
            
            if (foundKeywords.length > 0) {
                const newKeywords = foundKeywords.filter(k => !preSnapshot.bodyText.includes(k));
                
                if (newKeywords.length > 0) {
                    return await confirmSuccess(`New success indicator appeared: "${newKeywords[0]}"`);
                }
                
                // If no NEW keywords, but the form is GONE and we see common keywords on Attempt 2+
                if (attempt > 1 && !formStillThere && foundKeywords.some(k => commonSuccessKeywords.includes(k))) {
                    return await confirmSuccess("Form disappeared and success keywords verified (Logic Match)!");
                }
            }

            // 4. Check if Form is gone (AJAX Success flow) - Only trust if no generic errors
            if (initialFormPresent && originalForm && !document.body.contains(originalForm)) {
                if (!pageText.includes('error') && !pageText.includes('failed') && attempt > 2) {
                    return await confirmSuccess("Form disappeared (AJAX Success confirmed by latency)!");
                }
            }

            // 5. Check for Field Reset (Clear form)
            if (originalForm) {
                const textarea = originalForm.querySelector('textarea');
                if (textarea && textarea.value === '' && attempt > 2) { // latency guard
                    return await confirmSuccess("Form fields cleared (AJAX Reset detected)!");
                }
            }

            // Wait 1 second before next poll
            await new Promise(r => setTimeout(r, 1000));
        }

        // [v4.1] 실패/타임아웃 시 스위퍼 안전 정지 및 복구 플래그 초기화
        stopActiveEmptyFieldSweeper();
        window._xpider_healed = false;

        logDev("❌ [Result] Submission verification timed out after 10s.", "error");
        sessionStorage.removeItem('xpider_submit_count'); // 실패 시 이중 제출 세션도 정리
        finishCampaign(false, "Submission verification failed (Timeout - No success indicator found).");
        return false;
    }

    function finishCampaign(success, error = null) {
        sessionStorage.removeItem('xpider_pending_verify'); // [v17.6.0] Clear recovery flag
        chrome.runtime.sendMessage({
            action: 'SENDER_FINISHED',
            result: { success: success, error: error }
        });
    }
})();

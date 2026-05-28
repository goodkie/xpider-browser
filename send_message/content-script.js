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
        lastName: [/last.*name/i, /family.*name/i, /surname/i, /성/i, /苗字/i, /姓/i, /apellido/i, /nachname/i, /nom.*famille/i],
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
            
            // If we are on a path that was just submitted (within 20s)
            if (lastSubmittedPath && currentUrl.includes(lastSubmittedPath) && (now - lastSubmitTime) < 20000) {
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
                logDev("🎯 [Discovery] Optimal form secured (Ultra Polling)", "success");
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
                logDev(`🎯 [Discovery] Best contact link found: ${bestLink}`, "success");
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
            logDev("📝 [Action] Initiating hyper-mapping sequence...");
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
        logDev("🛠️ [Supreme-X 5.0] Initiating Multi-Stage 3-Pass Loop for maximum coverage...");
        let filledFields = 0;

        // [Helper] 난수 데이터 생성기 (v5.0)
        const generateRandomEmail = () => {
            const domains = ['gmail.com', 'naver.com', 'daum.net', 'outlook.com', 'yahoo.com'];
            const randomStr = Math.random().toString(36).substring(2, 8);
            return `user_${randomStr}@${domains[Math.floor(Math.random() * domains.length)]}`;
        };
        const generateRandomPhone = () => {
            const prefix = ['010', '011', '016', '017', '019'];
            const mid = Math.floor(1000 + Math.random() * 9000);
            const end = Math.floor(1000 + Math.random() * 9000);
            return `${prefix[Math.floor(Math.random() * prefix.length)]}-${mid}-${end}`;
        };
        const generateRandomText = (labelOrId) => {
            const words = ['inquiry', 'support', 'business', 'request', 'details', 'general', 'message'];
            const randomWord = words[Math.floor(Math.random() * words.length)];
            return `${randomWord}_${Math.floor(100 + Math.random() * 900)}`;
        };

        // [Auto-Name Synthesis] 이름 필드 상호 보완 자가 합성
        const processedTpl = { ...tpl };
        const rawName = (processedTpl.name || '').trim();
        const rawFirst = (processedTpl.firstName || '').trim();
        const rawLast = (processedTpl.lastName || '').trim();

        if (rawName && !rawFirst && !rawLast) {
            if (rawName.includes(' ')) {
                const parts = rawName.split(/\s+/);
                processedTpl.firstName = parts.slice(1).join(' ');
                processedTpl.lastName = parts[0];
            } else if (rawName.length === 3) {
                processedTpl.lastName = rawName.substring(0, 1);
                processedTpl.firstName = rawName.substring(1);
            } else if (rawName.length === 2) {
                processedTpl.lastName = rawName.substring(0, 1);
                processedTpl.firstName = rawName.substring(1);
            } else {
                processedTpl.firstName = rawName;
                processedTpl.lastName = rawName;
            }
        } else if (!rawName && (rawFirst || rawLast)) {
            if (/[a-zA-Z]/.test(rawFirst || rawLast)) {
                processedTpl.name = [rawFirst, rawLast].filter(Boolean).join(' ');
            } else {
                processedTpl.name = [rawLast, rawFirst].filter(Boolean).join('');
            }
        } else if (rawFirst && !rawLast) {
            processedTpl.lastName = rawFirst;
        } else if (rawLast && !rawFirst) {
            processedTpl.firstName = rawLast;
        }

        // 템플릿의 실존 유효 값들 수집
        const templateVals = [
            processedTpl.firstName, processedTpl.lastName, processedTpl.name, processedTpl.email, 
            processedTpl.phone, processedTpl.subject, processedTpl.message
        ].filter(v => typeof v === 'string' && v.trim() !== '');

        const getRandomTemplateVal = () => {
            if (templateVals.length > 0) {
                return templateVals[Math.floor(Math.random() * templateVals.length)];
            }
            return "Inquiry";
        };

        const matchField = async (patterns, val, el) => {
            if (!val) return false;
            
            const label = getLabelFor(el).toLowerCase();
            const placeholder = (el.placeholder || '').toLowerCase();
            const name = (el.name || '').toLowerCase();
            const id = (el.id || '').toLowerCase();
            const cls = (el.className || '').toString().toLowerCase();
            
            const isGenericId = !id || id === 'null-field' || /^\d+$/.test(id) || id.includes('input');
            const combined = isGenericId ? `${label} ${placeholder} ${cls}` : `${label} ${placeholder} ${name} ${id} ${cls}`;
            
            if (isGenericId && label) {
                if (patterns.some(p => p.test(label))) {
                    await applyVal(el, val, patterns.find(p => p.test(label)));
                    return true;
                }
            }

            if (patterns.some(p => p.test(combined))) {
                await applyVal(el, val, patterns.find(p => p.test(combined)));
                return true;
            }
            return false;
        };

        const applyVal = async (el, val, matchedAttr) => {
            if (!el || el.disabled || el.readOnly) return false;

            if (el.tagName === 'SELECT') {
                if (el.options.length > 1) {
                    if (el.selectedIndex <= 0) {
                        const randomIndex = Math.floor(Math.random() * (el.options.length - 1)) + 1;
                        el.selectedIndex = randomIndex;
                        el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
                        logDev(`   - [Select] Matched "${matchedAttr}" | Picked: ${el.options[randomIndex].text}`);
                        filledFields++;
                        return true;
                    }
                }
            } else {
                // Intelligent Pacing
                await new Promise(r => setTimeout(r, speed.field || 150));
                
                // 1. Focus
                el.click && el.click();
                el.focus && el.focus();
                
                // 2. Insert text via execCommand (Highest trust, best for reCAPTCHA/Wix)
                let setOk = false;
                try {
                    el.select && el.select();
                    document.execCommand('selectAll', false, null);
                    setOk = document.execCommand('insertText', false, val);
                } catch(e) {}
                
                // 3. Fallback direct setter + descriptor bypass for framework tracking
                if (!setOk || el.value !== val) {
                    try {
                        const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
                        const d = Object.getOwnPropertyDescriptor(proto, 'value');
                        if (d && d.set) {
                            d.set.call(el, val);
                        } else {
                            el.value = val;
                        }
                    } catch(e) {
                        el.value = val;
                    }
                }
                
                // 4. 7-Stage event dispatch for Wix & deep DOM syncing
                const events = [
                    new Event('focus', { bubbles: true, cancelable: true }),
                    new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: val.slice(-1) }),
                    new KeyboardEvent('keypress', { bubbles: true, cancelable: true, key: val.slice(-1) }),
                    new InputEvent('input', { bubbles: true, cancelable: true, data: val }),
                    new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key: val.slice(-1) }),
                    new Event('change', { bubbles: true, cancelable: true }),
                    new Event('blur', { bubbles: true, cancelable: true })
                ];
                
                events.forEach(evt => {
                    try { el.dispatchEvent(evt); } catch(e) {}
                });
                
                // React Fiber Sync
                try {
                    const rk = Object.keys(el).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
                    if (rk) {
                        const props = el[rk]?.memoizedProps || el[rk]?.pendingProps || el[rk];
                        if (typeof props?.onChange === 'function') {
                            props.onChange({ target: el, currentTarget: el, type: 'change', bubbles: true });
                        }
                    }
                } catch(e) {}
                
                el.blur && el.blur();
                logDev(`   - [Input] Matched "${matchedAttr}" | Val: ${val.substring(0, 15)}...`);
                filledFields++;
                return true;
            }
            return false;
        };

        // 3-Pass Multi-Stage Loop (v5.0)
        for (let pass = 1; pass <= 3; pass++) {
            logDev(`🔄 [Supreme-X 5.0] Executing Fill Pass ${pass}/3...`, "info");
            
            // 1. 실시간 입력 필드 스캔 (매 패스마다 최신 DOM 스캔)
            const inputs = Array.from(form.querySelectorAll('input:not([type="hidden"]), textarea, select'));
            
            // 2. 가상 DOM / ARIA 커스텀 컨트롤 스캔 & 채우기
            try {
                // (1) 가상 드롭다운 (role="combobox", select/dropdown 유사 클래스)
                const virtualDropdowns = Array.from(form.querySelectorAll('[role="combobox"], [class*="select"i], [class*="dropdown"i]')).filter(el => {
                    return el.tagName !== 'SELECT' && el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA';
                });
                
                for (const dropdown of virtualDropdowns) {
                    const selectedText = (dropdown.textContent || '').trim();
                    // 이미 선택되어 있는 것으로 보이면 스킵
                    if (selectedText && selectedText.length > 0 && !/select|choose|dropdown|click/i.test(selectedText)) continue;
                    
                    logDev(`   - [Virtual Dropdown] Detected dropdown: ${dropdown.className}. Triggering options...`);
                    dropdown.click();
                    dropdown.dispatchEvent(new Event('click', { bubbles: true }));
                    dropdown.dispatchEvent(new Event('mousedown', { bubbles: true }));
                    dropdown.focus && dropdown.focus();
                    
                    await new Promise(r => setTimeout(r, 120)); // 옵션 렌더링 시간 지연
                    
                    const options = Array.from(document.querySelectorAll('[role="option"], li, [class*="option"i], [class*="item"i]')).filter(opt => {
                        return opt.offsetParent !== null; 
                    });
                    
                    if (options.length > 0) {
                        const chosen = options[Math.floor(Math.random() * options.length)];
                        chosen.click();
                        chosen.dispatchEvent(new Event('click', { bubbles: true }));
                        chosen.dispatchEvent(new Event('mousedown', { bubbles: true }));
                        chosen.dispatchEvent(new Event('change', { bubbles: true }));
                        logDev(`   - [Virtual Dropdown] Selected option text: "${chosen.textContent.trim()}"`);
                        filledFields++;
                    }
                    dropdown.dispatchEvent(new Event('blur', { bubbles: true }));
                }
                
                // (2) 가상 체크박스 (role="checkbox")
                const virtualCheckboxes = Array.from(form.querySelectorAll('[role="checkbox"]')).filter(el => el.tagName !== 'INPUT');
                for (const cb of virtualCheckboxes) {
                    const ariaChecked = cb.getAttribute('aria-checked') === 'true' || cb.classList.contains('checked') || cb.classList.contains('active');
                    const text = (cb.textContent || cb.parentElement?.textContent || '').toLowerCase();
                    const termsKeywords = ['agree', 'terms', 'policy', 'consento', '동의', '규정', '약관'];
                    
                    if (termsKeywords.some(k => text.includes(k))) {
                        if (!ariaChecked) {
                            cb.click();
                            cb.dispatchEvent(new Event('click', { bubbles: true }));
                            cb.dispatchEvent(new Event('change', { bubbles: true }));
                            logDev(`   - [Virtual Checkbox] Checked required terms.`);
                            filledFields++;
                        }
                    } else if (!ariaChecked && Math.random() > 0.2) { // 80% 확률로 무작위 체크
                        cb.click();
                        cb.dispatchEvent(new Event('click', { bubbles: true }));
                        cb.dispatchEvent(new Event('change', { bubbles: true }));
                        logDev(`   - [Virtual Checkbox] Randomly checked.`);
                        filledFields++;
                    }
                }
                
                // (3) 가상 라디오 (role="radio")
                const virtualRadios = Array.from(form.querySelectorAll('[role="radio"]')).filter(el => el.tagName !== 'INPUT');
                for (const rd of virtualRadios) {
                    const ariaChecked = rd.getAttribute('aria-checked') === 'true' || rd.classList.contains('checked') || rd.classList.contains('active');
                    if (!ariaChecked) {
                        rd.click();
                        rd.dispatchEvent(new Event('click', { bubbles: true }));
                        rd.dispatchEvent(new Event('change', { bubbles: true }));
                        logDev(`   - [Virtual Radio] Checked.`);
                        filledFields++;
                    }
                }
            } catch (err) {
                logDev(`⚠️ [Virtual Control Scanner] Error: ${err.message}`, "warning");
            }

            // 3. Primary matches
            for (const el of inputs) {
                if (isHoneypot(el) || el.disabled || el.readOnly) continue;
                if (el.value && el.value.trim() !== '') continue; // 이미 값이 들어있다면 스킵

                if (el.type === 'checkbox' || el.type === 'radio') {
                    const labelText = getLabelFor(el).toLowerCase();
                    const containerText = (el.parentElement?.textContent || '').toLowerCase();
                    const termsKeywords = ['agree', 'terms', 'policy', 'consento', '동의', '규정', '약관'];
                    
                    if (termsKeywords.some(k => labelText.includes(k) || containerText.includes(k))) {
                        if (!el.checked) {
                            el.click();
                            el.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                    }
                    continue;
                }

                if (el.tagName === 'SELECT') {
                    if (el.options.length > 1 && (el.selectedIndex <= 0)) {
                        const validOptions = [];
                        for (let i = 1; i < el.options.length; i++) {
                            const opt = el.options[i];
                            if (opt.value && !opt.disabled) {
                                validOptions.push({ opt, idx: i });
                            }
                        }
                        if (validOptions.length > 0) {
                            const chosen = validOptions[Math.floor(Math.random() * validOptions.length)];
                            el.selectedIndex = chosen.idx;
                            el.dispatchEvent(new Event('change', { bubbles: true }));
                            logDev(`   - [Select-Random] Picked option: ${chosen.opt.text}`);
                            filledFields++;
                        }
                    }
                    continue;
                }

                if (await matchField(FIELD_PATTERNS.firstName, processedTpl.firstName || processedTpl.name, el)) continue;
                if (await matchField(FIELD_PATTERNS.lastName, processedTpl.lastName, el)) continue;
                if (await matchField(FIELD_PATTERNS.name, processedTpl.name, el)) continue;
                if (await matchField(FIELD_PATTERNS.email, processedTpl.email, el)) continue;
                if (await matchField(FIELD_PATTERNS.phone, processedTpl.phone, el)) continue;
                if (await matchField(FIELD_PATTERNS.subject, processedTpl.subject, el)) continue;
                if (await matchField(FIELD_PATTERNS.message, processedTpl.message, el)) continue;
            }

            // 4. Fallback 일반 입력란 무작위 대답을 템플릿 중 한 입력값으로 대체
            for (const el of inputs) {
                if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                    if (!el.value && !isHoneypot(el) && el.type !== 'hidden' && el.type !== 'checkbox' && el.type !== 'radio' && el.type !== 'submit') {
                        if (el.tagName === 'TEXTAREA') {
                            const val = processedTpl.message || getRandomTemplateVal();
                            await applyVal(el, val, "Fallback-MessageVal");
                        } else {
                            const val = getRandomTemplateVal();
                            await applyVal(el, val.substring(0, 100), "Fallback-RandomTemplateVal");
                        }
                    }
                }
            }

            // 5. Fallback 라디오 버튼 그룹 무작위 자동 체크
            try {
                const radioGroups = {};
                form.querySelectorAll('input[type="radio"]').forEach(radio => {
                    if (isHoneypot(radio) || radio.disabled) return;
                    const name = radio.name || 'unnamed-radio';
                    if (!radioGroups[name]) radioGroups[name] = [];
                    radioGroups[name].push(radio);
                });
                
                for (const name in radioGroups) {
                    const group = radioGroups[name];
                    const isChecked = group.some(r => r.checked);
                    if (!isChecked && group.length > 0) {
                        const randomRadio = group[Math.floor(Math.random() * group.length)];
                        randomRadio.click();
                        randomRadio.dispatchEvent(new Event('change', { bubbles: true }));
                        logDev(`   - [Fallback-Radio] Randomly checked radio in group "${name}"`);
                    }
                }
            } catch (e) {}

            // 6. Fallback 체크박스 중 체크되지 않은 빈 항목 무작위 자동 체크 (80%의 높은 확률)
            try {
                form.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                    if (!cb.checked && !isHoneypot(cb) && !cb.disabled) {
                        if (Math.random() > 0.2) {
                            cb.click();
                            cb.dispatchEvent(new Event('change', { bubbles: true }));
                            logDev(`   - [Fallback-Checkbox] Checked checkbox "${cb.name || cb.id || ''}"`);
                        }
                    }
                });
            } catch (e) {}

            // 7. Brute-force Injector
            if (filledFields < 2) {
                logDev("🛠️ [Supreme-X 5.0] High-confidence matching limited. Engaging Brute-Force Injector...");
                const allFieldTypes = queryAllInputs(form); 
                for (const inp of allFieldTypes) {
                    if (inp.value || inp.disabled || inp.readOnly) continue;
                    
                    const role = inp.getAttribute('role') || '';
                    const isText = inp.tagName === 'TEXTAREA' || role === 'textbox' || inp.contentEditable === 'true';
                    
                    if (isText) {
                        await applyVal(inp, processedTpl.message || getRandomTemplateVal(), "BruteForce-Message");
                    } else {
                        const ph = (inp.placeholder || '').toLowerCase();
                        const n = (inp.name || '').toLowerCase();
                        const combined = `${ph} ${n}`;
                        
                        if (combined.includes('email')) await applyVal(inp, processedTpl.email || generateRandomEmail(), "BruteForce-Email");
                        else if (combined.includes('name')) await applyVal(inp, (processedTpl.firstName || processedTpl.name || getRandomTemplateVal()), "BruteForce-Name");
                    }
                }
            }

            // 8. Ultimate Required Fields Guard (100% 무결성 무작위 난수 보완 시스템 탑재)
            logDev("🛡️ [Guard] Final checking for empty required fields before submission...");
            for (const el of inputs) {
                if (isHoneypot(el) || el.type === 'hidden' || el.disabled || el.readOnly) continue;
                
                const isRequired = el.hasAttribute('required') || 
                                   el.getAttribute('aria-required') === 'true' ||
                                   /required|essential|star|\*/i.test(el.className || '') ||
                                   /required|essential|star/i.test(el.id || '');
                
                if (isRequired) {
                    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                        if (!el.value) {
                            logDev(`⚠️ [Guard] Empty required input detected! name: ${el.name || el.id || 'unnamed'}. Injecting fallback/random...`, "warning");
                            
                            const fieldId = [el.name || '', el.id || '', getLabelFor(el)].join(' ').toLowerCase();
                            let fallbackVal = "";
                            
                            if (fieldId.includes('email')) {
                                fallbackVal = processedTpl.email || generateRandomEmail();
                            } else if (fieldId.includes('phone') || fieldId.includes('tel') || fieldId.includes('mobile')) {
                                fallbackVal = processedTpl.phone || generateRandomPhone();
                            } else if (fieldId.includes('subject') || fieldId.includes('title')) {
                                fallbackVal = processedTpl.subject || generateRandomText('subject');
                            } else if (fieldId.includes('name')) {
                                fallbackVal = processedTpl.name || processedTpl.firstName || "User";
                            } else {
                                fallbackVal = getRandomTemplateVal() !== 'Inquiry' ? getRandomTemplateVal() : generateRandomText('general');
                            }
                            
                            await applyVal(el, fallbackVal, "Guard-RequiredFallback");
                        }
                    } else if (el.tagName === 'SELECT') {
                        if (el.selectedIndex <= 0 && el.options.length > 1) {
                            logDev(`⚠️ [Guard] Empty required select detected! name: ${el.name || el.id || 'unnamed'}. Picking option...`, "warning");
                            const validOptions = [];
                            for (let i = 1; i < el.options.length; i++) {
                                const opt = el.options[i];
                                if (opt.value && !opt.disabled) {
                                    validOptions.push(i);
                                }
                            }
                            const finalIdx = validOptions.length > 0 ? validOptions[Math.floor(Math.random() * validOptions.length)] : 1;
                            el.selectedIndex = finalIdx;
                            el.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                    }
                }
            }

            if (pass < 3) {
                await new Promise(r => setTimeout(r, 200));
            }
        }

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

    async function waitForCaptchaSolved() {
        const MAX_WAIT = 120; // [v17.7.0] Fixed: Re-defined missing constant
        for (let i = 0; i < MAX_WAIT; i++) {
            await new Promise(r => setTimeout(r, 1000));
            
            const stillHasCaptcha = await checkForCaptcha();
            const gResponse = document.querySelector('[name="g-recaptcha-response"]');
            const hResponse = document.querySelector('[name="h-captcha-response"]');
            
            // [v17.5.0] Early Exit: If the response is filled OR the widget is gone, resume immediately
            if (!stillHasCaptcha || (gResponse && gResponse.value) || (hResponse && hResponse.value)) {
                logDev("🔑 [Security] Challenge solved or removed. Resuming sequence.", "success");
                await new Promise(r => setTimeout(r, 1500));
                return true;
            }
        }
        return false;
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

        logDev("❌ [Result] Submission verification timed out after 10s.", "error");
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

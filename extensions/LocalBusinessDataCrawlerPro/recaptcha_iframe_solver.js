/**
 * [Mac OS Stealth v4.9.80] XPIDER reCAPTCHA iframe 전용 솔버
 * 
 * ✅ 역할: google.com/recaptcha/* 내부 iframe에서만 실행
 *    - reCAPTCHA 체크박스 Human-like 클릭
 *    - 오디오 챌린지로 전환
 *    - 오디오 파일 URL 추출 → background.js로 전달하여 STT 처리 요청
 * 
 * ❌ 이 파일에서 절대 하지 말아야 할 것:
 *    - Hard Block 모달 생성 (부모 프레임 전용)
 *    - 페이지 텍스트에서 "automated queries" 감지
 *    - sorry 페이지에 관한 DOM 조작
 */

(function() {
    'use strict';

    const LOG_PREFIX = '[reCAPTCHA-Solver v4.9.80]';
    let lastCheckboxClickTime = 0;
    let solving = false;
    let waitCycles = 0;

    function log(msg) {
        console.log(LOG_PREFIX, msg);
        try {
            chrome.runtime.sendMessage({ action: 'CAPTCHA_LOG', message: '[V36.9] ' + msg }).catch(() => {});
        } catch(e) {}
    }

    // ── Human-like 마우스 클릭 시뮬레이션 ──
    function triggerHumanLikeClick(el) {
        try {
            const rect = el.getBoundingClientRect();
            const x = rect.left + rect.width / 2 + (Math.random() * 10 - 5);
            const y = rect.top + rect.height / 2 + (Math.random() * 10 - 5);

            const mousedown = new MouseEvent('mousedown', {
                bubbles: true, cancelable: true, view: window,
                clientX: x, clientY: y, button: 0, buttons: 1
            });
            const mouseup = new MouseEvent('mouseup', {
                bubbles: true, cancelable: true, view: window,
                clientX: x, clientY: y, button: 0, buttons: 1
            });
            const click = new MouseEvent('click', {
                bubbles: true, cancelable: true, view: window,
                clientX: x, clientY: y, button: 0
            });

            el.dispatchEvent(mousedown);
            setTimeout(() => {
                el.dispatchEvent(mouseup);
                setTimeout(() => {
                    el.dispatchEvent(click);
                }, Math.floor(Math.random() * 50) + 30);
            }, Math.floor(Math.random() * 80) + 50);
        } catch(e) {
            try { el.click(); } catch(e2) {}
        }
    }

    function findButtonByKeyword(keywords, selectors) {
        for (const s of selectors) {
            const el = document.querySelector(s);
            if (el) return el;
        }
        const allBtns = document.querySelectorAll('button, div[role="button"], span[role="button"]');
        for (const btn of allBtns) {
            const text = (btn.innerText + ' ' + (btn.title || '') + ' ' + (btn.getAttribute('aria-label') || '')).toLowerCase();
            if (keywords.some(k => text.includes(k))) return btn;
        }
        return null;
    }

    function findAudioUrl() {
        const el = document.querySelector('a[href*="payload"]') ||
                   document.querySelector('.rc-audiochallenge-tdownload-link') ||
                   document.querySelector('audio source') ||
                   document.querySelector('audio[src]');
        const url = el?.href || el?.src;
        return (url && url.startsWith('http')) ? url : null;
    }

    async function fetchAudioAsBase64(url) {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    function clickReload() {
        const btn = findButtonByKeyword(['reload', '새로', '업데이트'], ['#recaptcha-reload-button', '.rc-button-reload']);
        if (btn) btn.click();
    }

    function submitFinalAnswer(input, text) {
        const cleanText = text
            .replace(/[\[\]]/g, '')
            .replace(/[.,!?;:]+$/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();

        if (!cleanText) {
            log('🔄 Speech not recognized. Requesting new audio...');
            setTimeout(clickReload, 1000);
            return;
        }

        input.value = cleanText;
        input.dispatchEvent(new Event('input', { bubbles: true }));

        setTimeout(() => {
            const verifyBtn = findButtonByKeyword(
                ['verify', '확인'],
                ['#recaptcha-verify-button', '.rc-button-verify']
            );
            if (verifyBtn) {
                log('➡️ Final verifying...');
                verifyBtn.click();
            }
        }, 500);
    }

    async function trySolveAudio(audioInput) {
        if (solving || audioInput.value) return;

        const audioUrl = findAudioUrl();
        if (!audioUrl) {
            waitCycles++;
            if (waitCycles > 20) clickReload();
            return;
        }

        solving = true;
        log('📦 Packaging audio data...');

        try {
            const base64Audio = await fetchAudioAsBase64(audioUrl);
            log('🎙️ Requesting server analysis...');

            chrome.runtime.sendMessage({
                action: 'PERFORM_TRANSCRIPTION',
                audioData: base64Audio,
                url: audioUrl
            }, (resp) => {
                solving = false;

                if (chrome.runtime.lastError) {
                    log('❌ SW Disconnect');
                    return;
                }
                if (!resp) {
                    log('❌ No server response');
                    return;
                }
                if (resp.text) {
                    log('✅ Analysis success: [' + resp.text + ']');
                    submitFinalAnswer(audioInput, resp.text);
                } else {
                    log('❌ Analysis failed: ' + (resp.error || 'Unknown'));
                    setTimeout(clickReload, 1500);
                }
            });
        } catch(err) {
            solving = false;
            log('❌ Data error: ' + err.message);
        }
    }

    async function runSolver() {
        try {
            // ── 1. 체크박스 확인 ──
            const cb = document.querySelector('#recaptcha-anchor') || document.querySelector('.recaptcha-checkbox');
            if (cb) {
                if (cb.getAttribute('aria-checked') === 'false') {
                    const now = Date.now();
                    // 최소 4초 간격으로 클릭 (너무 빠른 반복 클릭 방지)
                    if (now - lastCheckboxClickTime > 4000) {
                        log('✅ Clicking checkbox...');
                        lastCheckboxClickTime = now;
                        triggerHumanLikeClick(cb);
                    }
                } else {
                    log('🎉 Checkbox checked!');
                }
                return;
            }

            // ── 2. 오디오 버튼 전환 ──
            const audioInput = document.querySelector('#audio-response') || document.querySelector('input[id*="audio"]');
            const audioBtn = findButtonByKeyword(
                ['audio', '음성', '헤드셋'],
                ['#recaptcha-audio-button', '.rc-button-audio']
            );

            if (audioBtn && !audioInput) {
                log('🎧 Switching to audio challenge...');
                audioBtn.click();
                waitCycles = 0;
                return;
            }

            // ── 3. 오디오 챌린지 풀기 ──
            if (audioInput) {
                // 공용 무료 폴백 키 확인 및 자동 적용
                const keys = await chrome.storage.local.get(['witKey', 'audioSttKey']);
                let activeKey = keys.witKey || keys.audioSttKey;
                if (!activeKey || activeKey.trim() === '') {
                    activeKey = '3T7NUX6UUPXHXGMDQLB7P23JSHYI2C7O';
                    await chrome.storage.local.set({ witKey: activeKey, audioSttKey: activeKey, captchaSolveEnabled: true });
                    log('🔑 [Auto STT] 공용 무료 우회 API 키 적용됨');
                }
                await trySolveAudio(audioInput);
            }

        } catch(e) {
            console.error(LOG_PREFIX, 'Error:', e);
        }
    }

    // ── 시작 딜레이: iframe이 완전히 로딩된 후 1.5초 대기 후 솔버 시작 ──
    setTimeout(() => {
        log('🚀 reCAPTCHA iframe solver started');
        setInterval(runSolver, 1200);
    }, 1500);

})();

/**
 * [v1.0.0 Pro] CAPTCHA Solver Module
 * Supports 2Captcha API and Audio Bypass.
 */

const CAPTCHA_SOLVER = {
    /**
     * Solve using NopeCHA API
     */
    async solveNopeCHA(siteKey, pageUrl, apiKey) {
        if (!apiKey) throw new Error("NopeCHA API Key missing");
        console.log("[Solver] Sending request to NopeCHA...");
        const res = await fetch(`https://api.nopecha.com/token?key=${apiKey}&type=recaptcha&sitekey=${siteKey}&url=${pageUrl}`);
        const data = await res.json();
        if (!data || data.error) {
            throw new Error(`NopeCHA Error: ${data ? data.message : 'Unknown'}`);
        }
        return data.data;
    },

    /**
     * Solve Image Grid using NopeCHA
     */
    async solveImageGridNopeCHA(imageB64, taskText, apiKey) {
        if (!apiKey) throw new Error("NopeCHA API Key missing");
        console.log("[Solver] Analyzing Image Grid with NopeCHA...");
        const res = await fetch(`https://api.nopecha.com/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                key: apiKey,
                type: "recaptcha",
                image_urls: [imageB64],
                task: taskText
            })
        });
        const data = await res.json();
        if (!data || data.error) throw new Error(data ? data.message : "NopeCHA Fail");
        return data.data; // Array of indices [0, 2, 5]
    },

    /**
     * Solve using 2Captcha API
     */
    async solve2Captcha(siteKey, pageUrl, apiKey) {
        if (!apiKey) throw new Error("API Key missing");
        
        console.log("[Solver] Sending request to 2Captcha...");
        const res = await fetch(`https://2captcha.com/in.php?key=${apiKey}&method=userrecaptcha&googlekey=${siteKey}&pageurl=${pageUrl}&json=1`);
        const data = await res.json();
        
        if (data.status !== 1) {
            throw new Error(`2Captcha Error: ${data.request}`);
        }
        
        const taskId = data.request;
        console.log(`[Solver] Task created: ${taskId}. Waiting for solution...`);
        
        // Polling loop
        for (let i = 0; i < 60; i++) { // Max 2 minutes
            await new Promise(r => setTimeout(r, 5000));
            const checkRes = await fetch(`https://2captcha.com/res.php?key=${apiKey}&action=get&id=${taskId}&json=1`);
            const checkData = await checkRes.json();
            
            if (checkData.status === 1) {
                console.log("[Solver] CAPTCHA Solved!");
                return checkData.request;
            }
            if (checkData.request === "CAPCHA_NOT_READY") {
                console.log(`[Solver] Still waiting... (${i * 5}s)`);
                continue;
            }
            throw new Error(`2Captcha Polling Error: ${checkData.request}`);
        }
        throw new Error("2Captcha Timeout");
    },

    /**
     * Solve using Audio Bypass (Advanced STT Script)
     */
    async solveAudioBypass(tabId) {
        console.log("[Solver] 🤖 고급 음성 우회 시작...");
        
        try {
            // STEP 1: 음성 모드 전환 버튼 클릭
            await chrome.scripting.executeScript({
                target: { tabId, allFrames: true },
                func: () => {
                    const btn = document.querySelector('#recaptcha-audio-button') || document.querySelector('.rc-button-audio');
                    if (btn) btn.click();
                }
            });

            await new Promise(r => setTimeout(r, 800));

            // STEP 2: 음성 파일 URL 추출
            const results = await chrome.scripting.executeScript({
                target: { tabId, allFrames: true },
                func: () => {
                    const link = document.querySelector('.rc-audiochallenge-download-link');
                    return link ? link.href : null;
                }
            });

            let audioUrl = null;
            for (const r of results) { if (r.result) { audioUrl = r.result; break; } }

            if (!audioUrl) {
                console.warn("[Solver] 음성 URL을 찾을 수 없습니다. (이미 해결되었거나 차단됨)");
                return false;
            }

            console.log(`[Solver] 음성 파일 분석 중: ${audioUrl}`);

            // STEP 3: 음성 파일을 텍스트로 변환 (Wit.ai API 활용)
            // 참고: 실제 구현 시에는 안정적인 STT 서버를 경유하는 것이 좋음
            const transcript = await this.transcribeAudio(audioUrl);
            if (!transcript) throw new Error("음성 인식 실패");

            console.log(`[Solver] 인식된 텍스트: ${transcript}`);

            // STEP 4: 정답 입력 및 확인 클릭
            await chrome.scripting.executeScript({
                target: { tabId, allFrames: true },
                func: (text) => {
                    const input = document.querySelector('#audio-response');
                    const verifyBtn = document.querySelector('#recaptcha-verify-button');
                    if (input) {
                        input.value = text;
                        setTimeout(() => { if (verifyBtn) verifyBtn.click(); }, 500);
                    }
                },
                args: [transcript]
            });

            return true;
        } catch (err) {
            console.error("[Solver] Audio Bypass Error:", err);
            return false;
        }
    },

    /**
     * [v18.0] Stable Base64 Decoder
     * Replaces fetch() for data URLs to avoid instability with large blobs.
     */
    dataURLtoBlob(dataurl) {
        try {
            const arr = dataurl.split(',');
            const mime = arr[0].match(/:(.*?);/)[1];
            const bstr = atob(arr[1]);
            let n = bstr.length;
            const u8arr = new Uint8Array(n);
            while (n--) {
                u8arr[n] = bstr.charCodeAt(n);
            }
            return new Blob([u8arr], { type: mime });
        } catch (e) {
            console.error("[v18.0] Base64 Decode Error:", e);
            throw new Error("오디오 데이터 디코딩 실패");
        }
    },

    /**
     * [v18.0] Core Transcription Logic (Port-Resilient)
     * @param {string} audioUrl - URL of the audio file (fallback)
     * @param {object} keys - API keys (audioSttKey, etc.)
     * @param {string} [audioData] - Optional Base64 encoded audio data from content script
     */
    async transcribeAudio(audioUrl, keys, audioData = null) {
        let errors = [];

        // Priority 3: Wit.ai (Free - Target User Key)
        if (keys.audioSttKey) {
            try {
                let audioBlob;

                if (audioData) {
                    console.log("[v18.0] Using direct Base64 audio data (Manual Decode)...");
                    audioBlob = this.dataURLtoBlob(audioData);
                } else {
                    console.log("[v18.0] Fetching audio from URL with robust headers...");
                    const audioResponse = await fetch(audioUrl, {
                        headers: {
                            'Referer': 'https://www.google.com/recaptcha/api2/',
                            'User-Agent': navigator.userAgent,
                            'Accept': '*/*',
                            'Origin': 'https://www.google.com'
                        }
                    });

                    if (!audioResponse.ok) {
                        throw new Error(`Google Audio Access Denied (${audioResponse.status})`);
                    }
                    audioBlob = await audioResponse.blob();
                }

                if (!audioBlob || audioBlob.size < 100) {
                    throw new Error("오디오 데이터가 너무 작거나 비어있음");
                }

                const apiRes = await fetch("https://api.wit.ai/speech", {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${keys.audioSttKey}`,
                        "Content-Type": "audio/mpeg3"
                    },
                    body: audioBlob
                });

                if (!apiRes.ok) {
                    const errData = await apiRes.json().catch(() => ({}));
                    throw new Error(`Wit.ai Error (${apiRes.status}): ${errData.error || 'Request Failed'}`);
                }

                // [v25.0] Wit.ai returns streaming NDJSON or chunked JSON.
                // Try multiple parsing strategies.
                const rawText = await apiRes.text();
                console.log("[v25.0] Wit.ai raw response:", rawText.substring(0, 500));
                
                let result = null;
                
                // Strategy 1: Find "text" field via regex (most robust)
                const textMatch = rawText.match(/"text"\s*:\s*"([^"]+)"/g);
                if (textMatch && textMatch.length > 0) {
                    // Get the LAST match (final transcription)
                    const lastMatch = textMatch[textMatch.length - 1];
                    const valueMatch = lastMatch.match(/"text"\s*:\s*"([^"]+)"/);
                    if (valueMatch && valueMatch[1]) {
                        result = valueMatch[1];
                    }
                }
                
                // Strategy 2: Try line-by-line JSON parsing
                if (!result) {
                    const lines = rawText.trim().split(/[\r\n]+/).filter(l => l.trim());
                    for (let i = lines.length - 1; i >= 0; i--) {
                        try {
                            const parsed = JSON.parse(lines[i]);
                            if (parsed.text) { result = parsed.text; break; }
                            if (parsed._text) { result = parsed._text; break; }
                        } catch (e) { continue; }
                    }
                }
                
                // Strategy 3: Try parsing entire response as single JSON
                if (!result) {
                    try {
                        const parsed = JSON.parse(rawText);
                        result = parsed.text || parsed._text;
                    } catch (e) { /* not single JSON */ }
                }
                
                if (result) {
                    console.log("[v25.0] Wit.ai SUCCESS:", result);
                    return result;
                }
                else throw new Error("Wit.ai 파싱실패. Raw[0:200]: " + rawText.substring(0, 200));
            } catch (e) { 
                errors.push(`Wit.ai: ${e.message}`); 
                console.warn("[v18.0] Wit.ai failed:", e.message);
            }
        }

        // Priority 4: [v6.0] Native Browser Solver (Zero-Key Backup)
        try {
            console.log("[v6.0] Trying Native Browser STT (Zero-Key Mode)...");
            const nativeResult = await this.transcribeNative(audioUrl, audioData);
            if (nativeResult) return nativeResult;
            else throw new Error("Native STT 결과 없음");
        } catch (e) { errors.push(`Native: ${e.message}`); }

        console.error("[v18.0] All solvers failed or no keys provided.", errors);
        throw new Error("모든 엔진 실패: " + errors.join(" / "));
    },

    /**
     * [v23.0] Bridge to Offscreen Native STT (Promise-Based)
     * Uses global nativeSttRequests map registered in background.js
     */
    async transcribeNative(audioUrl, audioData = null) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                resolve(null);
            }, 25000); // Native STT can be slow
            
            chrome.runtime.sendMessage({ 
                action: 'START_NATIVE_STT', 
                audioUrl, 
                audioData // Pass the pre-fetched Base64 data
            }, (response) => {
                clearTimeout(timeout);
                if (chrome.runtime.lastError) {
                    console.error("[v23.0] Native STT Connect Error:", chrome.runtime.lastError);
                    resolve(null);
                    return;
                }
                if (response && response.text) {
                    console.log("[v23.0] Native STT Success:", response.text);
                    resolve(response.text);
                } else {
                    if (response && response.error) console.warn("[v23.0] Native STT Error:", response.error);
                    resolve(null);
                }
            });
        });
    },
    /**
     * [v1.1.0] Solve generic Text/Image CAPTCHA (OCR)
     */
    async solveNormalImage(imageB64, keys) {
        // Priority 1: 2Captcha (Method: base64) - Highest Accuracy
        if (keys.twoCaptchaKey) {
            console.log("[Solver] Sending Image OCR to 2Captcha...");
            const cleanB64 = imageB64.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");
            const res = await fetch(`https://2captcha.com/in.php?key=${keys.twoCaptchaKey}&method=base64&body=${encodeURIComponent(cleanB64)}&json=1`);
            const data = await res.json();
            if (data.status === 1) {
                const taskId = data.request;
                for (let i = 0; i < 30; i++) {
                    await new Promise(r => setTimeout(r, 3000));
                    const checkRes = await fetch(`https://2captcha.com/res.php?key=${keys.twoCaptchaKey}&action=get&id=${taskId}&json=1`);
                    const checkData = await checkRes.json();
                    if (checkData.status === 1) return checkData.request;
                    if (checkData.request !== "CAPCHA_NOT_READY") break;
                }
            }
        }

        // Priority 2: NopeCHA (Type: text)
        if (keys.nopeChaKey) {
            console.log("[Solver] Sending Image OCR to NopeCHA...");
            const res = await fetch(`https://api.nopecha.com/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    key: keys.nopeChaKey,
                    type: "text",
                    image_urls: [imageB64]
                })
            });
            const data = await res.json();
            if (data && data.data) return data.data; // Usually returns the text directly
        }

        return null; // Fallback to local OCR handled in background.js
    }
};

// Export for background.js
if (typeof module !== 'undefined') module.exports = CAPTCHA_SOLVER;

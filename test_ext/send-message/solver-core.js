/**
 * X PIDER CAPTCHA Solver Core v1.0.0
 * Backend / Orchestration Module
 */

export class XpiderSolverCore {
    constructor(config = {}) {
        this.config = {
            witAiKey: config.witAiKey || null,
            twoCaptchaKey: config.twoCaptchaKey || null,
            nopeChaKey: config.nopeChaKey || null,
            ...config
        };
    }

    /**
     * Transcribe reCAPTCHA audio challenge using Wit.ai
     */
    async transcribeAudio(audioData, audioUrl = null) {
        if (!this.config.witAiKey) throw new Error("Wit.ai API Key missing in configuration.");

        try {
            const audioBlob = this._dataURLtoBlob(audioData);
            
            const apiRes = await fetch("https://api.wit.ai/speech", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${this.config.witAiKey}`,
                    "Content-Type": "audio/mpeg3"
                },
                body: audioBlob
            });

            if (!apiRes.ok) throw new Error(`Wit.ai Error (${apiRes.status})`);

            const rawText = await apiRes.text();
            
            // [v25.0] Wit.ai returns streaming NDJSON or chunked JSON.
            // Try multiple parsing strategies (Ported from validated collect-list_v2 core)
            let result = null;
            
            // Strategy 1: Find "text" field via regex (most robust for streaming)
            const textMatch = rawText.match(/"text"\s*:\s*"([^"]+)"/g);
            if (textMatch && textMatch.length > 0) {
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
                } catch (e) {}
            }
            
            if (result) return result;
            throw new Error("Failed to parse Wit.ai response.");
        } catch (e) {
            console.error("[XpiderSolverCore] Transcription failed:", e.message);
            throw e;
        }
    }

    /**
     * Solve via NopeCHA Token API
     */
    async solveNopeCha(siteKey, pageUrl) {
        if (!this.config.nopeChaKey) throw new Error("NopeCHA API Key missing.");
        const res = await fetch(`https://api.nopecha.com/token?key=${this.config.nopeChaKey}&type=recaptcha&sitekey=${siteKey}&url=${pageUrl}`);
        const data = await res.json();
        if (!data || data.error) throw new Error(`NopeCHA Error: ${data?.message || 'Unknown'}`);
        return data.data;
    }

    /**
     * Solve via 2Captcha API
     */
    async solve2Captcha(siteKey, pageUrl) {
        if (!this.config.twoCaptchaKey) throw new Error("2Captcha API Key missing.");
        const res = await fetch(`https://2captcha.com/in.php?key=${this.config.twoCaptchaKey}&method=userrecaptcha&googlekey=${siteKey}&pageurl=${pageUrl}&json=1`);
        const data = await res.json();
        if (data.status !== 1) throw new Error(`2Captcha Error: ${data.request}`);
        
        const taskId = data.request;
        for (let i = 0; i < 40; i++) {
            await new Promise(r => setTimeout(r, 5000));
            const checkRes = await fetch(`https://2captcha.com/res.php?key=${this.config.twoCaptchaKey}&action=get&id=${taskId}&json=1`);
            const checkData = await checkRes.json();
            if (checkData.status === 1) return checkData.request;
            if (checkData.request !== "CAPCHA_NOT_READY") throw new Error(`2Captcha Error: ${checkData.request}`);
        }
        throw new Error("2Captcha Timeout");
    }

    _dataURLtoBlob(dataurl) {
        const arr = dataurl.split(',');
        const mime = arr[0].match(/:(.*?);/)[1];
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) u8arr[n] = bstr.charCodeAt(n);
        return new Blob([u8arr], { type: mime });
    }
}



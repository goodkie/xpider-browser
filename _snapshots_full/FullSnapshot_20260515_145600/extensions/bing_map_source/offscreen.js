// Offscreen document for Tesseract.js (MV3 Service Worker replacement)
// Tesseract.js is not directly usable in Service Workers due to 'eval()' and Blob limitations.

importScripts('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');

chrome.runtime.onMessage.addListener((m) => {
    if (m.action === 'START_OCR') {
        runOCR(m.dataUrl, m.lang, m.requestId);
    } else if (m.action === 'START_NATIVE_STT') {
        runNativeSTT(m.audioUrl, m.requestId, m.audioData);
    }
});

async function runOCR(dataUrl, lang, requestId) {
    try {
        const worker = await Tesseract.createWorker(lang);
        const { data: { text } } = await worker.recognize(dataUrl);
        await worker.terminate();
        
        chrome.runtime.sendMessage({
            action: 'OCR_RESULT',
            text: text,
            requestId: requestId
        }).catch(() => {});
    } catch (e) {
        chrome.runtime.sendMessage({
            action: 'OCR_RESULT',
            text: "",
            error: e.message,
            requestId: requestId
        }).catch(() => {});
    }
}

/**
 * [v6.0] Zero-Key Native STT Solver
 * Uses the browser's built-in Web Speech API.
 */
async function runNativeSTT(audioUrl, requestId, audioData = null) {
    try {
        console.log("[Offscreen] Starting Native STT for:", audioUrl || "Direct Blob");
        const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
        recognition.lang = 'en-US';
        recognition.interimResults = false;
        const finalAudioSrc = audioData || audioUrl;
        const audio = new Audio(finalAudioSrc);
        audio.crossOrigin = "anonymous";
        audio.volume = 1.0; 
        
        let resultText = "";
        
        recognition.onresult = (event) => {
            resultText = event.results[0][0].transcript;
            console.log("[Offscreen] Native STT Success:", resultText);
        };

        recognition.onend = () => {
            chrome.runtime.sendMessage({
                action: 'NATIVE_STT_RESULT',
                text: resultText,
                requestId: requestId
            }).catch(() => {});
        };

        recognition.onerror = (e) => {
            console.error("[Offscreen] Native STT Error:", e.error);
            chrome.runtime.sendMessage({
                action: 'NATIVE_STT_RESULT',
                text: "",
                error: e.error,
                requestId: requestId
            }).catch(() => {});
        };

        // Start recognition then play audio
        recognition.start();
        setTimeout(() => {
            console.log("[Offscreen] Playing audio sample for recognition...");
            audio.play().catch(err => {
                console.error("[Offscreen] Audio Play Error (Permission?):", err);
                chrome.runtime.sendMessage({
                    action: 'NATIVE_STT_RESULT',
                    text: "",
                    error: "Audio playback blocked: " + err.message,
                    requestId: requestId
                }).catch(() => {});
            });
        }, 600);
        
    } catch (e) {
        console.error("[Offscreen] Native STT Failure:", e);
        chrome.runtime.sendMessage({
            action: 'NATIVE_STT_RESULT',
            text: "",
            error: e.message,
            requestId: requestId
        }).catch(() => {});
    }
}

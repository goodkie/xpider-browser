// Offscreen document for Tesseract.js (MV3 Service Worker replacement)
// Tesseract.js is not directly usable in Service Workers due to 'eval()' and Blob limitations.

importScripts('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');

chrome.runtime.onMessage.addListener((m) => {
    if (m.action === 'START_OCR') {
        runOCR(m.dataUrl, m.lang, m.requestId);
    } else if (m.action === 'START_NATIVE_STT') {
        runNativeSTT(m.audioUrl, m.requestId);
    } else if (m.action === 'ANALYZE_SEA_SCREENSHOT') {
        countSeaPixels(m.dataUrl, m.requestId);
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

async function countSeaPixels(dataUrl, reqId) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
        let canvas = document.getElementById('ocr-canvas');
        if (!canvas) {
            canvas = document.createElement('canvas');
        }
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let seaPixelCount = 0;
        
        // Gmaps ocean blue RGB ranges (approx):
        for (let i = 0; i < imgData.length; i += 4) {
            const r = imgData[i];
            const g = imgData[i+1];
            const b = imgData[i+2];
            
            // Check if color is within the Google Maps "sea" range
            if (r >= 130 && r <= 190 && g >= 190 && g <= 245 && b >= 220 && b <= 255) {
                seaPixelCount++;
            }
        }
        
        // Threshold: 3 times the user image (572x222) = ~380k pixels
        const isOcean = seaPixelCount > 380000;
        
        chrome.runtime.sendMessage({
            action: 'SEA_RESULT',
            isOcean: isOcean,
            count: seaPixelCount,
            requestId: reqId
        }).catch(() => {});
    };
    img.onerror = () => {
        chrome.runtime.sendMessage({ action: 'SEA_RESULT', isOcean: false, count: 0, requestId: reqId }).catch(() => {});
    };
    img.src = dataUrl;
}

/**
 * [v6.0] Zero-Key Native STT Solver
 * Uses the browser's built-in Web Speech API.
 */
async function runNativeSTT(audioUrl, requestId) {
    try {
        console.log("[Offscreen] Starting Native STT for:", audioUrl);
        const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
        recognition.lang = 'en-US';
        recognition.interimResults = false;

        const audio = new Audio(audioUrl);
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

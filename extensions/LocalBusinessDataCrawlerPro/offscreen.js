// Offscreen document for Tesseract.js (MV3 Service Worker replacement)
// Tesseract.js is not directly usable in Service Workers due to 'eval()' and Blob limitations.

importScripts('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');

chrome.runtime.onMessage.addListener((m) => {
    if (m.action === 'START_OCR') {
        runOCR(m.dataUrl, m.lang, m.requestId);
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

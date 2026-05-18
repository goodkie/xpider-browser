/**
 * SDK Integration Example: background.js
 */

// 1. Import or load the solver core
// importScripts('solver-core.js');

const solver = new XpiderSolverCore({
    witAiKey: "YOUR_WIT_AI_KEY",
    twoCaptchaKey: "YOUR_2CAPTCHA_KEY",
    nopeChaKey: "YOUR_NOPECHA_KEY"
});

chrome.runtime.onMessage.addListener((m, sender, sendResponse) => {
    if (m.action === 'PERFORM_TRANSCRIPTION') {
        solver.transcribeAudio(m.audioData)
            .then(text => sendResponse({ text }))
            .catch(err => sendResponse({ error: err.message }));
        return true; // Keep channel open for async response
    }

    if (m.action === 'XPIDER_LOG') {
        console.log(`[XpiderSDK] ${m.message}`);
    }
});

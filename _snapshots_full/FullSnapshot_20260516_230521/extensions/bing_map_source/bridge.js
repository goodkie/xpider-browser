// bridge.js - XPIDER Extension Bridge for Background Workers
if (typeof chrome !== 'undefined') {
    const originalStorage = chrome.storage;
    const originalRuntime = chrome.runtime;

    // We don't override if we are in a real Chrome environment where storage works
    // But in Electron webviews, we need the bridge for content scripts.
    // For background workers, they usually work, but let's ensure consistency.

    // If we are in Electron and need to talk to the main process:
    // (Background workers in manifest v3 don't have easy access to IPC unless we use a specific trick)

    // Actually, let's keep it simple.
    // If the content script is bridged, it sends data to the main process.
    // The sidepanel is also bridged, so it sees the main process data.
    // The background worker is ONLY for Stage 2 (Emails).
    // It can also be bridged if we want it to see the same 'scrapedData'.
}

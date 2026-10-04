console.log("[LCW-FIXTURE] Background Service Worker initialized at", new Date().toISOString());

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log("[LCW-FIXTURE] onInstalled triggered, reason:", details.reason);
  await chrome.storage.local.set({
    installed_at: Date.now(),
    install_reason: details.reason,
    ping_count: 0
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[LCW-FIXTURE] onMessage received:", message, "from:", sender);
  if (message && message.type === "PING") {
    chrome.storage.local.get(["ping_count"]).then((res) => {
      const nextCount = (res.ping_count || 0) + 1;
      chrome.storage.local.set({ ping_count: nextCount });
      sendResponse({
        type: "PONG",
        alive: true,
        ping_count: nextCount,
        sender_id: chrome.runtime.id,
        context_type: "SERVICE_WORKER",
        timestamp: Date.now()
      });
    });
    return true; // asynchronous response
  }

  if (message && message.type === "GET_ACTIVE_TAB") {
    chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      sendResponse({
        active_tab: tabs[0] || null,
        tab_count: tabs.length
      });
    });
    return true;
  }
});

console.log("[LCW-FIXTURE] Background Service Worker initialized at", new Date().toISOString());

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log("[LCW-FIXTURE] onInstalled triggered, reason:", details.reason);
  await chrome.storage.local.set({
    installed_at: Date.now(),
    install_reason: details.reason,
    ping_count: 0
  });
});

async function handleMessage(message, sender) {
  console.log("[LCW-FIXTURE] Message received:", message, "from:", sender);
  if (message && message.type === "PING") {
    const res = await chrome.storage.local.get(["ping_count", "instance_marker"]);
    const nextCount = (res.ping_count || 0) + 1;
    const marker = message.instance_marker || res.instance_marker || "unassigned";
    await chrome.storage.local.set({
      ping_count: nextCount,
      instance_marker: marker,
      last_ping_at: Date.now()
    });
    return {
      type: "PONG",
      alive: true,
      ping_count: nextCount,
      instance_marker: marker,
      sender_id: chrome.runtime.id,
      context_type: "SERVICE_WORKER",
      timestamp: Date.now()
    };
  }

  if (message && message.type === "GET_STORAGE") {
    const all = await chrome.storage.local.get(null);
    return {
      type: "STORAGE_DATA",
      data: all,
      extension_id: chrome.runtime.id
    };
  }

  if (message && message.type === "EXECUTE_SCRIPT_TEST") {
    // Test executeScript in target tab
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs || tabs.length === 0) {
        return { error: "No active tab found" };
      }
      const tabId = tabs[0].id;
      const scriptResult = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: () => {
          return {
            title: document.title,
            url: window.location.href,
            evaluated_at: Date.now()
          };
        }
      });
      return {
        type: "SCRIPT_RESULT",
        tab_id: tabId,
        result: scriptResult[0]?.result || null
      };
    } catch (e) {
      return { error: e.message || String(e) };
    }
  }

  return { error: "Unknown message type" };
}

// Internal extension messages (e.g. from popup or sidepanel)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse);
  return true;
});

// External messages from authorized web pages (e.g. http://127.0.0.1:*/*)
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse);
  return true;
});

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
  if (!message || typeof message !== "object") {
    return { error: "Invalid message payload" };
  }

  // 1. SEED phase: write unique run/instance markers and nonce
  if (message.type === "SEED") {
    const marker = message.instance_marker || "unassigned";
    const nonce = message.nonce || "none";
    await chrome.storage.local.set({
      instance_marker: marker,
      seed_nonce: nonce,
      seeded_at: Date.now(),
      ping_count: 1
    });
    return {
      type: "SEED_ACK",
      alive: true,
      instance_marker: marker,
      seed_nonce: nonce,
      sender_id: chrome.runtime.id,
      context_type: "SERVICE_WORKER"
    };
  }

  // 2. READ phase: read storage WITHOUT mutation (strictly read-only)
  if (message.type === "READ" || message.type === "GET_STORAGE") {
    const all = await chrome.storage.local.get(null);
    return {
      type: "STORAGE_DATA",
      alive: true,
      data: all,
      instance_marker: all.instance_marker,
      seed_nonce: all.seed_nonce,
      sender_id: chrome.runtime.id,
      context_type: "SERVICE_WORKER"
    };
  }

  // 3. PING (backward-compatible; does NOT overwrite marker if none provided)
  if (message.type === "PING") {
    const res = await chrome.storage.local.get(["ping_count", "instance_marker", "seed_nonce"]);
    const nextCount = (res.ping_count || 0) + 1;
    const marker = message.instance_marker || res.instance_marker || "unassigned";
    const updateData = {
      ping_count: nextCount,
      last_ping_at: Date.now()
    };
    if (message.instance_marker) {
      updateData.instance_marker = marker;
    }
    await chrome.storage.local.set(updateData);
    return {
      type: "PONG",
      alive: true,
      ping_count: nextCount,
      instance_marker: marker,
      seed_nonce: res.seed_nonce,
      sender_id: chrome.runtime.id,
      context_type: "SERVICE_WORKER",
      timestamp: Date.now()
    };
  }

  // 4. executeScript test: tests script execution into active tab and returns URL, title, evaluated_at
  if (message.type === "EXECUTE_SCRIPT_TEST") {
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

  return { error: "Unknown message type: " + message.type };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse);
  return true;
});

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse);
  return true;
});

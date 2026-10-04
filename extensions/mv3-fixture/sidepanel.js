const diagOutput = document.getElementById("diagOutput");

function log(data) {
  diagOutput.textContent = typeof data === "string" ? data : JSON.stringify(data, null, 2);
}

document.getElementById("btnCheckContext").addEventListener("click", async () => {
  try {
    if (chrome.runtime.getContexts) {
      const contexts = await chrome.runtime.getContexts({});
      log({
        has_getContexts: true,
        count: contexts.length,
        contexts: contexts
      });
    } else {
      log({ has_getContexts: false, error: "chrome.runtime.getContexts not available" });
    }
  } catch (err) {
    log({ error: err.message });
  }
});

document.getElementById("btnQueryTab").addEventListener("click", async () => {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const currentWin = await chrome.windows.getCurrent();
    log({
      current_window_id: currentWin.id,
      active_tab: tabs[0] || null,
      tabs_found: tabs.length
    });
  } catch (err) {
    log({ error: err.message });
  }
});

document.getElementById("btnPingWorker").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "PING" }, (res) => {
    log(res || { error: "No response from service worker" });
  });
});

document.getElementById("btnStorage").addEventListener("click", async () => {
  const current = await chrome.storage.local.get(["test_counter"]);
  const next = (current.test_counter || 0) + 1;
  await chrome.storage.local.set({ test_counter: next, last_updated: Date.now() });
  const updated = await chrome.storage.local.get(null);
  log(updated);
});

// Auto-run context diagnostic on load
(async () => {
  try {
    const currentWin = await chrome.windows.getCurrent();
    const contexts = chrome.runtime.getContexts ? await chrome.runtime.getContexts({}) : [];
    log({
      status: "SidePanel Loaded",
      window_id: currentWin.id,
      extension_id: chrome.runtime.id,
      contexts_count: contexts.length,
      contexts: contexts
    });
  } catch (e) {
    log({ error: e.message });
  }
})();

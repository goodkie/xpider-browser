const badgeCounts = new Map();

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    await chrome.storage.local.set({
      autosearch: true,
      collectEmails: true,
      allEmailsList: []
    });
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete") {
    const { autosearch } = await chrome.storage.local.get("autosearch");
    if (!autosearch) return;

    try {
      if (tab.url && !tab.url.startsWith("http")) return;

      const response = await chrome.tabs.sendMessage(tabId, { method: "getEmails" });
      
      if (response && response.data && response.data.length > 0) {
        const { collectEmails, allEmailsList = [] } = await chrome.storage.local.get(["collectEmails", "allEmailsList"]);
        
        if (collectEmails !== false) {
          const newEmails = response.data.filter(email => !allEmailsList.includes(email));
          if (newEmails.length > 0) {
            await chrome.storage.local.set({ allEmailsList: [...allEmailsList, ...newEmails] });
          }
        }
      }
    } catch (error) {
      console.error("Error in tab update handler:", error);
    }
  } else if (changeInfo.status === "loading") {
      badgeCounts.delete(tabId);
      chrome.action.setBadgeText({ text: "", tabId: tabId });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "UPDATE_BADGE") {
    const tabId = sender.tab ? sender.tab.id : null;
    if (tabId) {
      badgeCounts.set(tabId, message.count);
      chrome.action.setBadgeText({ 
        text: message.count > 0 ? message.count.toString() : "", 
        tabId: tabId 
      });
      chrome.action.setBadgeBackgroundColor({ color: "#ff2a5f", tabId: tabId });
    }
  }

  if (message.method === "updateSettings") {
    chrome.storage.local.set(message.data).catch(err => console.error(err));
  } else if (message.method === "clearAllEmails") {
    chrome.storage.local.set({ allEmailsList: [] }).catch(err => console.error(err));
    sendResponse({ success: true });
  }

  return true;
});

chrome.tabs.onActivated.addListener(activeInfo => {
  const count = badgeCounts.get(activeInfo.tabId);
  chrome.action.setBadgeText({ 
    text: count ? count.toString() : "", 
    tabId: activeInfo.tabId 
  });
  if (count) {
    chrome.action.setBadgeBackgroundColor({ color: "#ff2a5f", tabId: activeInfo.tabId });
  }
});

chrome.tabs.onRemoved.addListener(tabId => {
  badgeCounts.delete(tabId);
});

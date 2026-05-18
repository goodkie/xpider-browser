// offscreen.js
setInterval(() => {
  chrome.runtime.sendMessage({ action: 'heartbeat' });
}, 20000); // Pulse every 20s

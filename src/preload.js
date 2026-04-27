const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // ── 단방향 송신 ─────────────────────────────────────────────
  send: (channel, data) => {
    const allowed = [
      'restart_app', 'window-control', 'auth-logout',
      'check-for-updates', 'open-release-url', 'reload-extensions',
      'xpider-ext-notify-tab-updated', 'log-from-renderer',
      'xpider-ext-update-badge'
    ];
    if (allowed.includes(channel)) ipcRenderer.send(channel, data);
  },

  // ── 수신 ────────────────────────────────────────────────────
  on: (channel, func) => {
    const allowed = [
      'extensions_loaded', 'profile_id', 'app_version',
      'app-update-result', 'ext-sync-progress',
      'xpider-renderer-update-active-tab', 'open-new-tab',
      'xpider-renderer-update-badge'
    ];
    if (allowed.includes(channel)) {
      ipcRenderer.on(channel, (_, ...args) => func(...args));
    }
  },

  // ── 단발성 수신 ──────────────────────────────────────────────
  once: (channel, func) => {
    const allowed = ['app-update-result'];
    if (allowed.includes(channel)) {
      ipcRenderer.once(channel, (_, ...args) => func(...args));
    }
  },

  // ── 어드민 ──────────────────────────────────────────────────
  getAllProfiles: ()                       => ipcRenderer.invoke('admin-get-all-profiles'),
  setUserActive:  (userId, isActive)      => ipcRenderer.invoke('admin-set-active', { userId, isActive }),
  forceLogout:    (userId)                => ipcRenderer.invoke('admin-force-logout', { userId }),
  getExtensionScript: (extId, scriptPath) => ipcRenderer.invoke('xpider-ext-get-script', { extId, scriptPath }),
});

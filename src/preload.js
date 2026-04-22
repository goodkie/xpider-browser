const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 기존 채널
  send: (channel, data) => {
    const allowed = [
      'restart_app', 'open-extension-popup', 'window-control',
      'check-for-updates', 'auth-logout'
    ];
    if (allowed.includes(channel)) ipcRenderer.send(channel, data);
  },
  on: (channel, func) => {
    const allowed = [
      'update_available', 'update_downloaded', 'extensions_loaded',
      'profile_id'
    ];
    if (allowed.includes(channel)) ipcRenderer.on(channel, (event, ...args) => func(...args));
  },
  // 어드민 기능
  getAllProfiles: () => ipcRenderer.invoke('admin-get-all-profiles'),
  setUserActive:  (userId, isActive) => ipcRenderer.invoke('admin-set-active', { userId, isActive }),
});

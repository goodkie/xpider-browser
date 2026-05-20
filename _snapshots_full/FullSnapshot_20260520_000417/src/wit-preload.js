const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('witAPI', {
  getStorage: (keys) => ipcRenderer.invoke('xpider-ext-storage-get', { keys }),
  setStorage: (items) => ipcRenderer.invoke('xpider-ext-storage-set', { items }),
  closeWindow: () => ipcRenderer.send('close-wit-settings-window'),
  openExternal: (url) => ipcRenderer.send('open-wit-external-link', url),
});

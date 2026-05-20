const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');

contextBridge.exposeInMainWorld('splashAPI', {
  onProgress: (callback) => {
    ipcRenderer.on('splash-progress', (_, msg) => callback(msg));
  },
  onVersion: (callback) => {
    ipcRenderer.on('splash-version', (_, ver) => callback(ver));
  }
});

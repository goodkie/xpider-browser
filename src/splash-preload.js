const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('splashAPI', {
  onProgress: (callback) => {
    ipcRenderer.on('splash-progress', (_, msg) => callback(msg));
  },
  onVersion: (callback) => {
    ipcRenderer.on('splash-version', (_, ver) => callback(ver));
  },
  // [v4.9.75] Mac 패키징 경로 불일치 해결: 절대 file:// URL 수신 → img src 교체
  onIcon: (callback) => {
    ipcRenderer.on('splash-icon', (_, url) => callback(url));
  }
});


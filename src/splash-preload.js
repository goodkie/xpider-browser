const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');

contextBridge.exposeInMainWorld('splashAPI', {
  onProgress: (callback) => {
    ipcRenderer.on('splash-progress', (_, msg) => callback(msg));
  },
  onVersion: (callback) => {
    ipcRenderer.on('splash-version', (_, ver) => callback(ver));
  },
  // 로고 이미지 절대 경로 반환 (ASAR 내부 경로 포함)
  getIconPath: () => {
    return 'file://' + path.join(__dirname, 'assets', 'icon.png').replace(/\\/g, '/');
  }
});

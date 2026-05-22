const { contextBridge, ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

let iconBase64 = '';
try {
  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  if (fs.existsSync(iconPath)) {
    const buffer = fs.readFileSync(iconPath);
    iconBase64 = `data:image/png;base64,${buffer.toString('base64')}`;
  }
} catch (e) {
  console.error('[Splash Preload] Failed to load icon.png as base64:', e);
}

contextBridge.exposeInMainWorld('splashAPI', {
  getIcon: () => iconBase64,
  onProgress: (callback) => {
    ipcRenderer.on('splash-progress', (_, msg) => callback(msg));
  },
  onVersion: (callback) => {
    ipcRenderer.on('splash-version', (_, ver) => callback(ver));
  }
});

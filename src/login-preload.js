const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('authAPI', {
  login:          (email, pw)       => ipcRenderer.invoke('auth-login',   { email, password: pw }),
  signup:         (email, pw, name) => ipcRenderer.invoke('auth-signup',  { email, password: pw, username: name }),
  checkSession:   ()                => ipcRenderer.invoke('auth-check-session'),
  getNoAutoLogin: ()                => ipcRenderer.invoke('auth-get-no-auto-login'),
  success:        ()                => ipcRenderer.send('auth-success'),
  closeApp:       ()                => ipcRenderer.send('auth-close-app'),
  openExternal:   (url)             => ipcRenderer.send('auth-open-external', url),
});


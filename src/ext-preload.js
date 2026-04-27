const { ipcRenderer } = require('electron');

console.log('[EXT-PRELOAD] PostMessage Bridge Active');

window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'XPIDER_INVOKE') {
        const { channel, args, id } = event.data;
        ipcRenderer.invoke(channel, args).then(result => {
            window.postMessage({ type: 'XPIDER_RESPONSE', id, result }, '*');
        }).catch(error => {
            window.postMessage({ type: 'XPIDER_RESPONSE', id, error: error.message }, '*');
        });
    }
    if (event.data && event.data.type === 'XPIDER_SEND') {
        const { channel, data } = event.data;
        ipcRenderer.send(channel, data);
    }
});

// Forward events from Main to Guest
ipcRenderer.on('xpider-ext-tab-updated-event', (event, data) => {
    window.postMessage({ type: 'XPIDER_EVENT', name: 'tab-updated', data }, '*');
});

ipcRenderer.on('xpider-renderer-update-badge', (event, data) => {
    window.postMessage({ type: 'XPIDER_EVENT', name: 'update-badge', data }, '*');
});

ipcRenderer.on('xpider-ext-storage-changed', (event, data) => {
    window.postMessage({ type: 'XPIDER_EVENT', name: 'storage-changed', data }, '*');
});

ipcRenderer.on('xpider-ext-runtime-on-message', (event, data) => {
    window.postMessage({ type: 'XPIDER_EVENT', name: 'runtime-on-message', data }, '*');
});

// ─── CHROME STORAGE BRIDGE ──────────────────────────────────
// This allows content scripts to use chrome.storage.local
if (!window.chrome) window.chrome = {};
if (!window.chrome.storage) {
    window.chrome.storage = {
        local: {
            get: (keys, callback) => {
                ipcRenderer.invoke('xpider-ext-storage-get', { keys }).then(callback);
            },
            set: (items, callback) => {
                ipcRenderer.invoke('xpider-ext-storage-set', { items }).then(() => {
                    if (callback) callback();
                });
            },
            clear: (callback) => {
                ipcRenderer.invoke('xpider-ext-storage-clear').then(() => {
                    if (callback) callback();
                });
            },
            onChanged: {
                addListener: (callback) => {
                    ipcRenderer.on('xpider-ext-storage-changed', (event, changes) => callback(changes));
                }
            }
        }
    };
}

// ─── CHROME RUNTIME BRIDGE ──────────────────────────────────
if (!window.chrome.runtime) {
    window.chrome.runtime = {
        sendMessage: (message, callback) => {
            ipcRenderer.invoke('xpider-ext-runtime-send-message', { message }).then(callback);
        },
        onMessage: {
            addListener: (callback) => {
                ipcRenderer.on('xpider-ext-runtime-on-message', (event, message) => {
                    callback(message, {}, () => {});
                });
            }
        }
    };
}

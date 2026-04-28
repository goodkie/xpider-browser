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
if (!window.chrome) window.chrome = {};
if (!window.chrome.storage) window.chrome.storage = {};
if (!window.chrome.storage.local) {
    window.chrome.storage.local = {
        get: (keys, callback) => {
            ipcRenderer.invoke('xpider-ext-storage-get', { keys })
                .then(result => callback(result || {}))
                .catch(() => callback({}));
        },
        set: (items, callback) => {
            ipcRenderer.invoke('xpider-ext-storage-set', { items }).then(() => {
                if (callback) callback();
            }).catch(() => { if (callback) callback(); });
        },
        remove: (keys, callback) => {
            ipcRenderer.invoke('xpider-ext-storage-remove', { keys }).then(() => {
                if (callback) callback();
            }).catch(() => { if (callback) callback(); });
        },
        clear: (callback) => {
            ipcRenderer.invoke('xpider-ext-storage-clear').then(() => {
                if (callback) callback();
            }).catch(() => { if (callback) callback(); });
        },
        onChanged: {
            addListener: (callback) => {
                // Listen via IPC (for ext-webview context)
                ipcRenderer.on('xpider-ext-storage-changed', (event, changes) => callback(changes));
            }
        }
    };
}
// Also expose chrome.storage.onChanged at the top level
if (!window.chrome.storage.onChanged) {
    window.chrome.storage.onChanged = {
        addListener: (callback) => {
            // Listen via postMessage XPIDER_EVENT (for pages where IPC is indirect)
            window.addEventListener('message', (e) => {
                if (e.data && e.data.type === 'XPIDER_EVENT' && e.data.name === 'storage-changed') {
                    callback(e.data.data);
                }
            });
            // Also listen directly via IPC
            ipcRenderer.on('xpider-ext-storage-changed', (event, changes) => callback(changes));
        }
    };
}

// ─── CHROME RUNTIME BRIDGE ──────────────────────────────────
if (!window.chrome) window.chrome = {};
if (!window.chrome.runtime) window.chrome.runtime = {};

// 1. Direct Shim (for scripts in the same world as this preload)
window.chrome.runtime.sendMessage = (message, callback) => {
    return ipcRenderer.invoke('xpider-ext-runtime-send-message', { message }).then(callback);
};

// 2. PostMessage Relay (to bridge from OTHER isolated worlds, like content scripts)
window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'XPIDER_BRIDGE_RELAY') {
        const { message, id } = event.data;
        ipcRenderer.invoke('xpider-ext-runtime-send-message', { message }).then(result => {
            if (id) window.postMessage({ type: 'XPIDER_BRIDGE_RESPONSE', id, result }, '*');
        });
    }
});

if (!window.chrome.runtime.onMessage) {
    window.chrome.runtime.onMessage = {
        addListener: (callback) => {
            ipcRenderer.on('xpider-ext-runtime-on-message', (event, message) => {
                try {
                    callback(message, { id: 'xpider-ext' }, () => {});
                } catch(e) {
                    console.error('[XPIDER-BRIDGE] Error in onMessage listener:', e);
                }
            });
        }
    };
}

// ─── CHROME TABS BRIDGE ─────────────────────────────────────
if (!window.chrome.tabs) {
    window.chrome.tabs = {
        query: (queryInfo, callback) => {
            ipcRenderer.invoke('xpider-ext-get-active-tab').then(tab => {
                callback(tab ? [tab] : []);
            });
        },
        update: (tabId, props, callback) => {
            ipcRenderer.invoke('xpider-ext-update-tab', props).then(callback);
        },
        onUpdated: {
            addListener: (callback) => {
                ipcRenderer.on('xpider-ext-tab-updated-event', (event, data) => {
                    callback(data.tabId, data.changeInfo, data.tab);
                });
            }
        },
        onActivated: {
            addListener: (callback) => {
                // onUpdated 이벤트 중 status=complete 인 경우에만 트리거
                // (별도 채널로 분리하여 onUpdated 2중 수신 방지)
                ipcRenderer.on('xpider-ext-tab-activated-event', (event, data) => {
                    callback({ tabId: data.tabId, windowId: data.windowId || 1 });
                });
            }
        },
        sendMessage: (tabId, message, options, callback) => {
            if (typeof options === 'function') { callback = options; options = {}; }
            ipcRenderer.invoke('xpider-ext-send-message', { tabId, message }).then(callback);
        }
    };
}

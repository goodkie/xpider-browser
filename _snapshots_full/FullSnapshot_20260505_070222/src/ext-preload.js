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
// Always force-override with IPC bridge (prevents LevelDB LOCK errors)
// Supports BOTH: await chrome.storage.local.get() AND chrome.storage.local.get(keys, callback)
try { delete window.chrome.storage.local; } catch(e) {}

const customStorageLocal = {
    get: (keys, callback) => {
        const promise = ipcRenderer.invoke('xpider-ext-storage-get', { keys })
            .then(result => result || {})
            .catch(() => ({}));
        if (typeof callback === 'function') {
            promise.then(result => callback(result)).catch(() => callback({}));
        }
        return promise;
    },
    set: (items, callback) => {
        const promise = ipcRenderer.invoke('xpider-ext-storage-set', { items })
            .then(() => undefined)
            .catch(() => undefined);
        if (typeof callback === 'function') {
            promise.then(() => callback()).catch(() => callback());
        }
        return promise;
    },
    remove: (keys, callback) => {
        const promise = ipcRenderer.invoke('xpider-ext-storage-remove', { keys })
            .then(() => undefined)
            .catch(() => undefined);
        if (typeof callback === 'function') {
            promise.then(() => callback()).catch(() => callback());
        }
        return promise;
    },
    clear: (callback) => {
        const promise = ipcRenderer.invoke('xpider-ext-storage-clear')
            .then(() => undefined)
            .catch(() => undefined);
        if (typeof callback === 'function') {
            promise.then(() => callback()).catch(() => callback());
        }
        return promise;
    },
    onChanged: {
        addListener: (callback) => {
            ipcRenderer.on('xpider-ext-storage-changed', (event, changes) => callback(changes));
        }
    }
};

try {
    Object.defineProperty(window.chrome.storage, 'local', {
        value: customStorageLocal,
        writable: true,
        configurable: true
    });
} catch (e) {
    window.chrome.storage.local = customStorageLocal;
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

// chrome.runtime.lastError support
Object.defineProperty(window.chrome.runtime, 'lastError', {
    get: () => window.__xpiderLastError || null,
    set: (v) => { window.__xpiderLastError = v; },
    configurable: true
});

// 1. Direct Shim - supports BOTH callback and await
window.chrome.runtime.sendMessage = (message, callback) => {
    const promise = ipcRenderer.invoke('xpider-ext-runtime-send-message', { message })
        .then(result => {
            window.__xpiderLastError = null;
            return result;
        })
        .catch(err => {
            window.__xpiderLastError = { message: err.message };
            return null;
        });
    if (typeof callback === 'function') {
        promise.then(result => callback(result));
    }
    return promise;
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
        create: (createProperties, callback) => {
            // Open a new URL in the main browser webview
            ipcRenderer.invoke('xpider-ext-tabs-create', createProperties).then(tab => {
                if (callback) callback(tab || { id: Date.now() });
            }).catch(() => {
                if (callback) callback({ id: Date.now() });
            });
        },
        remove: (tabId, callback) => {
            ipcRenderer.invoke('xpider-ext-tabs-remove', { tabId }).then(() => {
                if (callback) callback();
            }).catch(() => {
                if (callback) callback();
            });
        },
        update: (tabId, props, callback) => {
            ipcRenderer.invoke('xpider-ext-tabs-update', props).then(callback);
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

// ─── CHROME RUNTIME EXTRAS ───────────────────────────────────
// chrome.runtime.connect (used by popup to detect closure)
if (!window.chrome.runtime.connect) {
    window.chrome.runtime.connect = (connectInfo) => {
        // Return a mock Port object
        return {
            name: connectInfo ? connectInfo.name : '',
            onDisconnect: { addListener: () => {} },
            onMessage: { addListener: () => {} },
            postMessage: () => {},
            disconnect: () => {}
        };
    };
}
// chrome.runtime.reload (used for hard-reset feature)
if (!window.chrome.runtime.reload) {
    window.chrome.runtime.reload = () => {
        ipcRenderer.send('xpider-ext-reload');
    };
}


// ─── CHROME DOWNLOADS BRIDGE ─────────────────────────────────
if (!window.chrome.downloads) {
    window.chrome.downloads = {
        download: (options, callback) => {
            const url = options.url || '';
            const filename = options.filename || 'download';
            
            // Handle Data URLs: decode and send as content directly
            if (url.startsWith('data:')) {
                try {
                    const arr = url.split(',');
                    const mimeMatch = arr[0].match(/:(.*?);/);
                    const mime = mimeMatch ? mimeMatch[1] : 'text/plain';
                    const isBase64 = arr[0].includes(';base64');
                    let content;
                    if (isBase64) {
                        content = atob(arr[1]);
                    } else {
                        content = decodeURIComponent(arr[1]);
                    }
                    ipcRenderer.invoke('xpider-download-file', {
                        content,
                        filename,
                        saveAs: options.saveAs !== false
                    }).then(result => {
                        const id = result ? result.downloadId : Date.now();
                        if (callback) callback(id);
                    }).catch(() => {
                        if (callback) callback(0);
                    });
                } catch (e) {
                    console.error('[Downloads Bridge] DataURL decode error:', e);
                    if (callback) callback(0);
                }
                return;
            }

            // Handle blob: and http: URLs normally
            ipcRenderer.invoke('xpider-download-file', {
                url,
                filename,
                saveAs: options.saveAs !== false
            }).then(result => {
                if (callback) callback(result ? result.downloadId : 0);
            }).catch(() => {
                if (callback) callback(0);
            });
        }
    };
}

// ─── CHROME ACTION BRIDGE ─────────────────────────────────────
if (!window.chrome.action) {
    window.chrome.action = {
        setBadgeText: (details) => {
            ipcRenderer.send('xpider-ext-update-badge', details);
        },
        setBadgeBackgroundColor: (details) => {
            // No-op (visual only, handled by renderer)
        }
    };
}

// ─── EMAIL COLLECTOR IPC EVENTS ───────────────────────────────
// Forward email-collected events from main to extension popup
ipcRenderer.on('xpider-email-collected-event', (event, data) => {
    const eventName = data.name || 'email-collected';
    const eventData = data.data || data;
    window.postMessage({ type: 'XPIDER_EVENT', name: eventName, data: eventData }, '*');
});

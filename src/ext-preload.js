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

// Also forward events from Main to Guest
ipcRenderer.on('xpider-ext-tab-updated-event', (event, data) => {
    window.postMessage({ type: 'XPIDER_EVENT', name: 'tab-updated', data }, '*');
});

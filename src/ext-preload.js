// ═══════════════════════════════════════════════════════════════════
// [Stealth v4.9.67] 봇 탐지 완전 우회 — ext-preload.js
// ═══════════════════════════════════════════════════════════════════
;(function _stealthInit() {
  'use strict';

  // ── 1. Navigator.prototype.webdriver 프로토타입 체인 완전 제거 ───
  try {
    if ('webdriver' in Navigator.prototype) {
      delete Navigator.prototype.webdriver;
    }
  } catch(e) {}
  try {
    if (navigator.hasOwnProperty('webdriver')) {
      delete navigator.webdriver;
    }
  } catch(e) {}
  try {
    const _desc = Object.getOwnPropertyDescriptor(Navigator.prototype, 'webdriver');
    if (_desc) {
      Object.defineProperty(Navigator.prototype, 'webdriver', {
        ..._desc,
        get: () => false,
        configurable: true
      });
    }
  } catch(e) {}

  // ── 2. window.chrome 기본 객체 생성 (app / csi / loadTimes 모킹) ─
  try {
    if (!window.chrome) window.chrome = {};

    if (!window.chrome.app) {
      window.chrome.app = {
        isInstalled: false,
        InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
        RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' },
        getDetails:     function getDetails()     { return null; },
        getIsInstalled: function getIsInstalled() { return false; },
        installState:   function installState(cb) { cb && cb('not_installed'); },
        runningState:   function runningState()   { return 'cannot_run'; }
      };
    }
    if (!window.chrome.csi) {
      window.chrome.csi = function csi() {
        return {
          startE:  (window.performance && performance.timing && performance.timing.navigationStart) || Date.now(),
          onloadT: (window.performance && performance.timing && performance.timing.loadEventStart)  || Date.now(),
          pageT:   (window.performance && performance.now) ? performance.now() : 0,
          tran:    15
        };
      };
    }
    if (!window.chrome.loadTimes) {
      window.chrome.loadTimes = function loadTimes() {
        const t  = (window.performance && performance.timing) || {};
        const ns = t.navigationStart || Date.now();
        return {
          requestTime:             ns / 1000,
          startLoadTime:           ns / 1000,
          commitLoadTime:          (t.domLoading            || ns) / 1000,
          finishDocumentLoadTime:  (t.domContentLoadedEventEnd || ns) / 1000,
          finishLoadTime:          (t.loadEventEnd          || ns) / 1000,
          firstPaintTime:          0,
          firstPaintAfterLoadTime: 0,
          navigationType:          'Other',
          wasFetchedViaSpdy:       false,
          wasNpnNegotiated:        true,
          npnNegotiatedProtocol:   'h2',
          wasAlternateProtocolAvailable: false,
          connectionInfo:          'h2'
        };
      };
    }
  } catch(e) {}

  // ── 3. Function.prototype.toString Native Code 마스킹 ────────────
  try {
    const _origToString = Function.prototype.toString;
    const _nativeFns    = new WeakSet();
    if (window.chrome) {
      [window.chrome.csi, window.chrome.loadTimes].forEach(fn => {
        if (typeof fn === 'function') _nativeFns.add(fn);
      });
      if (window.chrome.app) {
        ['getDetails','getIsInstalled','installState','runningState'].forEach(m => {
          if (typeof window.chrome.app[m] === 'function') _nativeFns.add(window.chrome.app[m]);
        });
      }
    }
    Function.prototype.toString = function toString() {
      if (_nativeFns.has(this)) return `function ${this.name || ''}() { [native code] }`;
      return _origToString.call(this);
    };
  } catch(e) {}
})();

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
    // [v1.1.2] xpider-scan-page: Extension Service Worker → Main Process 페이지 스캔
    if (event.data && event.data.type === 'XPIDER_SCAN_PAGE') {
        const { url, waitMs, showTab, id } = event.data;
        ipcRenderer.invoke('xpider-scan-page', { url, waitMs, showTab }).then(result => {
            window.postMessage({ type: 'XPIDER_SCAN_PAGE_RESULT', id, result }, '*');
        }).catch(error => {
            window.postMessage({ type: 'XPIDER_SCAN_PAGE_RESULT', id, error: error.message, result: { emails:[], phone:'', address:'', homepage:'', sns:[], pageText:'' } }, '*');
        });
    }
    // [v1.1.2] xpider-contact-page: 홈페이지에서 컨텍트 링크 추출
    if (event.data && event.data.type === 'XPIDER_CONTACT_PAGE') {
        const { url, waitMs, showTab, id } = event.data;
        ipcRenderer.invoke('xpider-contact-page', { url, waitMs, showTab }).then(result => {
            window.postMessage({ type: 'XPIDER_CONTACT_RESULT', id, result }, '*');
        }).catch(error => {
            window.postMessage({ type: 'XPIDER_CONTACT_RESULT', id, error: error.message, result: { contactLinks: [] } }, '*');
        });
    }
    // [v1.1.2] xpider-scan-full: 홈페이지 정보+컨텍트링크 통합 (탭 1회)
    if (event.data && event.data.type === 'XPIDER_SCAN_FULL') {
        const { url, waitMs, showTab, id } = event.data;
        ipcRenderer.invoke('xpider-scan-full', { url, waitMs, showTab }).then(result => {
            window.postMessage({ type: 'XPIDER_SCAN_FULL_RESULT', id, result }, '*');
        }).catch(error => {
            window.postMessage({ type: 'XPIDER_SCAN_FULL_RESULT', id, error: error.message, result: null }, '*');
        });
    }
    // [v2.2] xpider-crawl-with-scroll: URL 탭 스크롤+페이지네이션 크롤러
    if (event.data && event.data.type === 'XPIDER_CRAWL_SCROLL') {
        const { url, scrollSteps, scrollWaitMs, pageWaitMs, id } = event.data;
        ipcRenderer.invoke('xpider-crawl-with-scroll', { url, scrollSteps, scrollWaitMs, pageWaitMs }).then(result => {
            window.postMessage({ type: 'XPIDER_CRAWL_SCROLL_RESULT', id, result }, '*');
        }).catch(error => {
            window.postMessage({ type: 'XPIDER_CRAWL_SCROLL_RESULT', id, error: error.message, result: { allText: '', nextPageUrl: null } }, '*');
        });
    }
    // [v3.0] CAPTCHA 수동 재개 버튼 브릿지
    if (event.data && event.data.type === 'XPIDER_CAPTCHA_RESUME') {
        ipcRenderer.invoke('xpider-captcha-resume').then(result => {
            window.postMessage({ type: 'XPIDER_CAPTCHA_RESUME_RESULT', result }, '*');
        }).catch(() => {
            window.postMessage({ type: 'XPIDER_CAPTCHA_RESUME_RESULT', result: { success: false } }, '*');
        });
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

// ─── [v4.1] Email Extractor 이벤트 → 팝업으로 포워딩 ──────────────────────────
// main.js → renderer_ui.js → extensionWebview → ext-preload.js → popup.js (XPIDER_EVENT)
ipcRenderer.on('xpider-email-collected-event', (event, payload) => {
    // payload = { name: 'email-collected'|'update-badge', data: {...} }
    const name = (payload && payload.name) ? payload.name : 'email-collected';
    const data = (payload && payload.data) ? payload.data : payload;
    window.postMessage({ type: 'XPIDER_EVENT', name, data }, '*');
});

// ─── [VPN] VPN 상태 이벤트 → 팝업으로 포워딩 ─────────────────────────────────
// main.js xpider-vpn-connect/disconnect → mainWindow.send('xpider-vpn-state')
// → renderer_ui.js → extensionWebview.executeJavaScript → ext-preload → popup.js
ipcRenderer.on('xpider-vpn-state', (event, state) => {
    window.postMessage({ type: 'XPIDER_EVENT', name: 'vpn-state', data: state }, '*');
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

// Always override onMessage to ensure our custom IPC bridge is used instead of any half-implemented native onMessage APIs
window.chrome.runtime.onMessage = {
    addListener: (callback) => {
        // 1. Direct IPC listener
        ipcRenderer.on('xpider-ext-runtime-on-message', (event, message) => {
            try {
                callback(message, { id: 'xpider-ext' }, () => {});
            } catch(e) {
                console.error('[XPIDER-BRIDGE] Error in onMessage listener:', e);
            }
        });
        // 2. PostMessage bridge listener (relayed from renderer_ui.js via executeJavaScript)
        window.addEventListener('message', (e) => {
            if (e.data && e.data.type === 'XPIDER_EVENT' && e.data.name === 'runtime-on-message') {
                try {
                    callback(e.data.data, { id: 'xpider-ext' }, () => {});
                } catch(err) {
                    console.error('[XPIDER-BRIDGE] Error in postMessage runtime listener:', err);
                }
            }
        });
    }
};

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
            ipcRenderer.invoke('xpider-ext-create-tab', createProperties).then(tab => {
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

// ─── [v3.3] CAPTCHA 모달 강제 닫기 직접 채널 ─────────────────────────────────
// main.js → mainWindow.executeJavaScript → extensionWebview.send('xpider-captcha-force-close')
// → ipcRenderer.on → window.postMessage → popup.js window.addEventListener
ipcRenderer.on('xpider-captcha-force-close', () => {
    window.postMessage({ type: 'XPIDER_CAPTCHA_FORCE_CLOSE' }, '*');
});

// ─── [v4.1] AUTO EMAIL SCANNER (browsing webview 전용) ───────────────────────
// session.defaultSession.setPreloads()로 모든 webview/iframe에서 실행됨
;(function startEmailAutoScan() {
    const url = window.location.href;
    // 익스텐션 내부 페이지나 빈 페이지는 스캔하지 않음
    if (!url ||
        url.startsWith('chrome-extension://') ||
        url.startsWith('file://') ||
        url.startsWith('about:') ||
        url.startsWith('data:') ||
        url.includes('start_page.html')) return;

    // 더 정교한 이메일 정규식 (TPA 및 복잡한 도메인 대응)
    const EMAIL_RX = /([a-zA-Z0-9._+%-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]{2,10})/gi;
    const SKIP_EXT = new Set(['png','jpg','jpeg','gif','svg','webp','css','js','ico','bmp','tiff','woff','woff2','ttf','mp4','webm']);
    
    // 페이지별 수집 상태 (메모리 내 유지)
    if (!window.__xpiderCollected) window.__xpiderCollected = new Set();
    const _collected = window.__xpiderCollected;

    function scanAndSend() {
        try {
            const bodyText = document.body ? document.body.innerText : '';
            const htmlText = document.documentElement ? document.documentElement.innerHTML : '';
            const combined = bodyText + ' ' + htmlText;
            
            const matches = combined.match(EMAIL_RX);
            let addedCount = 0;

            if (matches) {
                matches.forEach(e => {
                    const em = e.toLowerCase().trim().replace(/['"`;,>]+$/g, '').replace(/\.$/, '');
                    if (em.includes('@') && !_collected.has(em)) {
                        const parts = em.split('.');
                        const ext = parts[parts.length - 1];
                        if (SKIP_EXT.has(ext)) return;
                        
                        // 기본 필터링 (너무 짧거나 긴 경우 제외)
                        const prefix = em.split('@')[0];
                        if (prefix.length < 2 || prefix.length > 64) return;

                        _collected.add(em);
                        addedCount++;
                    }
                });
            }

            // mailto 링크 추가 스캔
            document.querySelectorAll('a[href^="mailto:" i]').forEach(a => {
                const em = a.href.replace(/^mailto:/i,'').split('?')[0].trim().toLowerCase();
                if (em && em.includes('@') && !_collected.has(em)) {
                    _collected.add(em);
                    addedCount++;
                }
            });

            if (addedCount > 0) {
                ipcRenderer.send('xpider-email-collected', {
                    emails: [..._collected].sort(),
                    url:    window.location.href,
                    count:  _collected.size
                });
            }
        } catch(e) {
            // 조용한 실패 (크로스 도메인 iframe 등)
        }
    }

    // 1. 초기 스캔 (즉시 + 지연)
    scanAndSend();
    setTimeout(scanAndSend, 1500);
    setTimeout(scanAndSend, 5000);

    // 2. 동적 콘텐츠 감시 (MutationObserver)
    const obs = new MutationObserver((mutations) => {
        let shouldScan = false;
        for (const m of mutations) {
            if (m.addedNodes.length > 0) { shouldScan = true; break; }
        }
        if (shouldScan) scanAndSend();
    });
    if (document.body) obs.observe(document.body, { childList: true, subtree: true });

    // 3. 폴링 스캔 (마지막 방어선 - 3초마다)
    setInterval(scanAndSend, 3000);
    
    console.log(`[XPIDER-SCAN] Active on: ${url.substring(0, 50)}...`);
})();



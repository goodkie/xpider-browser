// UltraSolver Pro - Popup Script
// Controls the extension dashboard UI, displays credit balances and solver status in English.

document.addEventListener('DOMContentLoaded', () => {
    const balanceVal = document.getElementById('balance-val');
    const solvesVal = document.getElementById('solves-val');
    const xpiderTokensVal = document.getElementById('xpider-tokens-val');
    const statusText = document.getElementById('status-text');
    const statusDot = document.getElementById('status-dot');
    const btnRefresh = document.getElementById('btn-refresh');
    const toast = document.getElementById('toast');
    const logBox = document.getElementById('log-box');

    // Electron IPC Bridge Helper
    function invokeXpiderIpc(channel, args = {}) {
        return new Promise((resolve, reject) => {
            const id = Math.random().toString(36).substring(2);
            const listener = (event) => {
                if (event.data && event.data.type === 'XPIDER_RESPONSE' && event.data.id === id) {
                    window.removeEventListener('message', listener);
                    if (event.data.error) {
                        reject(new Error(event.data.error));
                    } else {
                        resolve(event.data.result);
                    }
                }
            };
            window.addEventListener('message', listener);
            window.postMessage({ type: 'XPIDER_INVOKE', channel, args, id }, '*');
        });
    }

    // 1. Initial State Load
    chrome.storage.local.get(['solvesCount', 'solverStatus', 'solverState', 'solverLogs'], (storage) => {
        solvesVal.textContent = storage.solvesCount || 0;
        
        if (storage.solverStatus) {
            updateStatusUI(storage.solverStatus, storage.solverState || 'idle');
        } else {
            updateStatusUI('Ready (Idle)', 'idle');
        }

        if (storage.solverLogs) {
            updateLogsUI(storage.solverLogs);
        }

        // Fetch XPIDER Tokens on startup
        refreshBalances();
    });

    // 2. Refresh Button Click
    btnRefresh.addEventListener('click', () => {
        btnRefresh.disabled = true;
        btnRefresh.innerText = 'Refreshing...';
        
        refreshBalances().then(function() {
            btnRefresh.disabled = false;
            btnRefresh.innerText = '🔄 Refresh';
            showToast('✅ Refreshed successfully!');
        }).catch(function() {
            btnRefresh.disabled = false;
            btnRefresh.innerText = '🔄 Refresh';
            showToast('✅ Refreshed successfully!');
        });
    });

    // 3. Copy Logs Button Click
    const btnCopyLogs = document.getElementById('btn-copy-logs');
    if (btnCopyLogs) {
        btnCopyLogs.addEventListener('click', () => {
            chrome.storage.local.get('solverLogs', (res) => {
                const logs = res.solverLogs || [];
                if (logs.length === 0) {
                    showToast('⚠️ No logs available to copy');
                    return;
                }
                const logText = logs.join('\n');
                navigator.clipboard.writeText(logText)
                    .then(() => {
                        showToast('📋 Logs copied to clipboard!');
                    })
                    .catch(err => {
                        console.error('Failed to copy logs:', err);
                        showToast('❌ Copy failed');
                    });
            });
        });
    }



    // Listen for background state changes in real time
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace && namespace !== 'local') return;

        if (changes.solvesCount) {
            solvesVal.textContent = changes.solvesCount.newValue || 0;
        }

        if (changes.solverStatus || changes.solverState) {
            const status = changes.solverStatus ? changes.solverStatus.newValue : statusText.textContent;
            const state = changes.solverState ? changes.solverState.newValue : 'idle';
            updateStatusUI(status, state);
        }

        if (changes.solverLogs) {
            updateLogsUI(changes.solverLogs.newValue || []);
        }
    });

    // Helper: Update log container in real time
    function updateLogsUI(logs) {
        if (!logs || logs.length === 0) {
            logBox.textContent = 'No logs available.';
            return;
        }
        // Show recent 15 logs
        const recentLogs = logs.slice(-15);
        logBox.textContent = recentLogs.join('\n');
        // Auto scroll to bottom
        logBox.scrollTop = logBox.scrollHeight;
    }

    // Helper: Refresh XPIDER Tokens & USP Credit Balance
    async function refreshBalances() {
        try {
            // Request XPIDER tokens from Main process via window.postMessage bridge
            const remaining = await invokeXpiderIpc('xpider-token-get-remaining');
            const tokens = remaining || 0;
            
            // Format XPIDER tokens
            xpiderTokensVal.textContent = Number(tokens).toLocaleString() + ' Tokens';
            
            // Convert: 1 USP = 3 XPIDER Tokens
            const uspBalance = (tokens / 3).toFixed(2);
            balanceVal.textContent = uspBalance + ' USP';
        } catch (e) {
            console.error("Failed to refresh balances:", e);
            xpiderTokensVal.textContent = "Error";
            balanceVal.textContent = "Error";
        }
    }

    // Helper: update status panel UI (in English)
    function updateStatusUI(message, state) {
        // Map Korean statuses to English if they come from old background logs
        let englishMsg = message;
        if (message.includes('준비 완료')) englishMsg = 'Ready (Idle)';
        else if (message.includes('설정 완료 대기')) englishMsg = 'Waiting for setup';
        else if (message.includes('작업 생성 중')) englishMsg = 'Creating task...';
        else if (message.includes('해결 중')) englishMsg = 'Solving...';
        else if (message.includes('성공')) englishMsg = 'Solved successfully!';
        else if (message.includes('실패')) englishMsg = 'Solve failed';

        statusText.textContent = englishMsg;
        
        // Remove status indicator classes
        statusDot.className = 'status-dot';
        
        if (state === 'solving' || state === 'processing') {
            statusDot.classList.add('solving');
        } else if (state === 'success') {
            statusDot.classList.add('success');
        } else if (state === 'error') {
            statusDot.classList.add('error');
        } else {
            // idle
        }
    }

    // Helper: show toast notification
    function showToast(message) {
        if (message) {
            toast.textContent = message;
        }
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
        }, 2000);
    }

    // Keep-Alive Connection to Extension Service Worker (prevents termination in Electron 22 / Win7)
    try {
        chrome.runtime.connect({ name: "ultrasolver-keepalive" });
        console.log("🤖 [UltraSolver Pro] Keep-alive port connected from Popup.");
    } catch (e) {
        console.warn("🤖 [UltraSolver Pro] Keep-alive connection from popup failed:", e.message);
    }
});

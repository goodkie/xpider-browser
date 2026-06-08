// popup.js
import { getProxyList } from './api.js';

// ─── DOM refs ─────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const connectBtn     = $('connect-btn');
const statusBadge    = $('connection-status');
const ipDisplay      = $('current-ip');
const locationDisplay= $('current-location');
const actionHint     = $('action-hint');
const serverTrigger  = $('server-list-trigger');
const selectedName   = $('selected-server-name');
const serverModal    = $('server-modal');
const closeModal     = $('close-modal');
const serverListEl   = $('server-list');
const logEl          = $('debug-log');

// ─── State ────────────────────────────────────────────────────────────────
let servers  = [];
let selected = null;   // currently selected server object
let connected = false;

// ─── Logging ─────────────────────────────────────────────────────────────
function log(msg, color = '#a0a0c0') {
  if (!logEl) return;
  const t = new Date().toLocaleTimeString('en-US', { hour12: false });
  const row = document.createElement('div');
  row.innerHTML = `<span style="color:#555">[${t}]</span> <span style="color:${color}">${msg}</span>`;
  logEl.prepend(row);
  // Keep log short
  while (logEl.children.length > 20) logEl.removeChild(logEl.lastChild);
}

// ─── UI update ────────────────────────────────────────────────────────────
function setUI(state) {
  // state: 'disconnected' | 'connecting' | 'connected'
  connectBtn.className = `power-btn ${state === 'connected' ? 'active' : ''}`;
  statusBadge.textContent = state === 'connected' ? 'Connected' :
                            state === 'connecting' ? 'Connecting…' : 'Disconnected';
  statusBadge.className   = `status-badge ${state === 'connected' ? 'connected' : 'disconnected'}`;
  actionHint.textContent  = state === 'connected' ? 'Protected' :
                            state === 'connecting' ? 'Please wait…' : 'Tap to Connect';
  if (state !== 'connected') {
    ipDisplay.textContent = '— — — —';
    locationDisplay.textContent = 'None';
  }
}

// ─── Server rendering ─────────────────────────────────────────────────────
function renderServers() {
  serverListEl.innerHTML = '';
  servers.forEach((s) => {
    const el = document.createElement('div');
    el.className = `server-item${selected?.id === s.id ? ' active' : ''}`;
    el.innerHTML = `
      <span style="font-size:1.3em">${s.name.split('—')[0].trim()}</span>
      <div class="server-info">
        <span class="server-name">${s.country} — ${s.host}</span>
        <span class="server-meta">Port ${s.port}</span>
      </div>`;
    el.onclick = () => {
      selected = s;
      selectedName.textContent = s.name;
      serverModal.classList.add('hidden');
      renderServers();
      // If already connected, switch server immediately
      if (connected) handleConnect();
    };
    serverListEl.appendChild(el);
  });
}

// ─── Connect ──────────────────────────────────────────────────────────────
async function handleConnect() {
  if (!selected) {
    log('No server selected.', '#f39c12');
    return;
  }

  setUI('connecting');
  log(`Connecting → ${selected.host}:${selected.port}`);

  chrome.runtime.sendMessage({ type: 'CONNECT', server: selected }, async (res) => {
    if (chrome.runtime.lastError || !res?.ok) {
      log(`Failed: ${res?.error ?? chrome.runtime.lastError?.message}`, '#e74c3c');
      setUI('disconnected');
      connected = false;
      return;
    }

    log('Proxy set. Verifying tunnel…');

    // ── Verify that internet actually works through the proxy ──────────
    const ok = await verifyTunnel();
    if (ok) {
      connected = true;
      setUI('connected');
      ipDisplay.textContent = selected.host;
      locationDisplay.textContent = selected.country;
      log('Connected ✓', '#2ecc71');
    } else {
      log('Tunnel failed — retrying once…', '#f39c12');
      // One automatic retry after 3 s
      await sleep(3000);
      const ok2 = await verifyTunnel();
      if (ok2) {
        connected = true;
        setUI('connected');
        ipDisplay.textContent = selected.host;
        locationDisplay.textContent = selected.country;
        log('Connected ✓', '#2ecc71');
      } else {
        log('Could not verify tunnel. Check server or try another.', '#e74c3c');
        handleDisconnect();
      }
    }
  });
}

// ─── Disconnect ───────────────────────────────────────────────────────────
function handleDisconnect() {
  chrome.runtime.sendMessage({ type: 'DISCONNECT' }, () => {
    connected = false;
    setUI('disconnected');
    log('Disconnected.');
  });
}

// ─── Tunnel verification ──────────────────────────────────────────────────
async function verifyTunnel() {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch('https://httpbin.org/ip', {
      signal: ctrl.signal,
      cache: 'no-store'
    });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Init ─────────────────────────────────────────────────────────────────
async function init() {
  log('Loading servers…');

  // Restore state from background
  chrome.runtime.sendMessage({ type: 'GET_STATE' }, (state) => {
    if (state?.connected && state?.server) {
      connected = true;
      selected  = state.server;
      selectedName.textContent = state.server.name || state.server.host;
      ipDisplay.textContent    = state.server.host;
      locationDisplay.textContent = state.server.country || '—';
      setUI('connected');
    }
  });

  try {
    servers = await getProxyList();
    log(`${servers.length} servers ready.`, '#2ecc71');

    // Auto-select first server if none chosen
    if (!selected && servers.length > 0) {
      selected = servers[0];
      selectedName.textContent = selected.name;
    }

    renderServers();
  } catch (err) {
    log(`Server load failed: ${err.message}`, '#e74c3c');
  }
}

// ─── Events ───────────────────────────────────────────────────────────────
connectBtn.onclick   = () => connected ? handleDisconnect() : handleConnect();
serverTrigger.onclick= () => serverModal.classList.remove('hidden');
closeModal.onclick   = () => serverModal.classList.add('hidden');

// Close modal on backdrop click
serverModal.onclick = (e) => { if (e.target === serverModal) serverModal.classList.add('hidden'); };

init();

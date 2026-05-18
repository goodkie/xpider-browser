// popup.js
import { getProxyList } from './api.js';
import { getTranslation, languages } from './i18n.js';

// ─── DOM refs ─────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const connectBtn      = $('connect-btn');
const statusBadge     = $('connection-status');
const ipDisplay       = $('current-ip');
const locationDisplay = $('current-location');
const actionHint      = $('action-hint');
const serverTrigger   = $('server-list-trigger');
const selectedName    = $('selected-server-name');
const serverModal     = $('server-modal');
const closeModal      = $('close-modal');
const serverListEl    = $('server-list');
const settingsTrigger = $('settings-trigger');
const settingsPanel   = $('settings-panel');
const closeSettings   = $('close-settings');
const langGrid        = $('lang-grid');

// ─── State ────────────────────────────────────────────────────────────────
let servers   = [];
let selected  = null;
let connected = false;
let currentLang = 'en';

// ─── i18n Apply ──────────────────────────────────────────────────────────
function applyLanguage() {
  const t = (key) => getTranslation(currentLang, key);
  
  $('tagline').textContent = t('tagline');
  $('label-ip').textContent = t('label_ip');
  $('label-loc').textContent = t('label_loc');
  $('label-server').textContent = t('label-server');
  $('modal-title-server').textContent = t('modal_server');
  $('modal-title-set').textContent = t('modal_set');
  
  if (connected) {
    statusBadge.textContent = t('status_con');
    actionHint.textContent = t('hint_con');
  } else {
    statusBadge.textContent = t('status_dis');
    actionHint.textContent = t('hint_idle');
  }

  if (locationDisplay.textContent === 'None' || locationDisplay.textContent === '없음' || locationDisplay.textContent === 'None') {
    locationDisplay.textContent = t('none');
  }

  renderLangGrid();
  renderServers();
}

function renderLangGrid() {
  langGrid.innerHTML = '';
  languages.forEach(lang => {
    const el = document.createElement('div');
    el.className = `lang-opt ${currentLang === lang.code ? 'active' : ''}`;
    el.textContent = lang.name;
    el.onclick = async () => {
      currentLang = lang.code;
      await chrome.storage.local.set({ language: currentLang });
      applyLanguage();
    };
    langGrid.appendChild(el);
  });
}

// ─── UI update ────────────────────────────────────────────────────────────
function setUI(state) {
  const t = (key) => getTranslation(currentLang, key);
  
  if (state === 'connected') {
    connectBtn.classList.add('active');
    statusBadge.textContent = t('status_con');
    statusBadge.className = 'status-badge connected';
    actionHint.textContent = t('hint_con');
  } else if (state === 'connecting') {
    statusBadge.textContent = '...';
    actionHint.textContent = t('hint_connecting') || '...';
  } else {
    connectBtn.classList.remove('active');
    statusBadge.textContent = t('status_dis');
    statusBadge.className = 'status-badge';
    actionHint.textContent = t('hint_idle');
    ipDisplay.textContent = '— — — —';
    locationDisplay.textContent = t('none');
  }
}

// ─── Server rendering ─────────────────────────────────────────────────────
function renderServers() {
  const t = (key) => getTranslation(currentLang, key);
  serverListEl.innerHTML = '';
  
  if (servers.length === 0) {
    serverListEl.innerHTML = `<div class="loading">${t('loading')}</div>`;
    return;
  }

  servers.forEach((s) => {
    const el = document.createElement('div');
    el.className = `server-item${selected?.id === s.id ? ' active' : ''}`;
    el.innerHTML = `
      <span style="font-size:1.5rem">${s.name.split('—')[0].trim()}</span>
      <div class="server-info" style="margin-left:15px">
        <span style="display:block; font-weight:700; font-size:0.9rem">${s.country}</span>
        <span style="color:rgba(255,255,255,0.3); font-size:0.7rem">${s.host}</span>
      </div>`;
    el.onclick = () => {
      selected = s;
      selectedName.textContent = s.name;
      serverModal.classList.remove('active');
      renderServers();
      if (connected) handleConnect();
    };
    serverListEl.appendChild(el);
  });
}

// ─── Connect ──────────────────────────────────────────────────────────────
async function handleConnect() {
  if (!selected) return;
  setUI('connecting');

  chrome.runtime.sendMessage({ type: 'CONNECT', server: selected }, async (res) => {
    if (res?.ok) {
      connected = true;
      setUI('connected');
      ipDisplay.textContent = selected.host;
      locationDisplay.textContent = selected.country;
    } else {
      setUI('disconnected');
    }
  });
}

function handleDisconnect() {
  chrome.runtime.sendMessage({ type: 'DISCONNECT' }, () => {
    connected = false;
    setUI('disconnected');
  });
}

// ─── Init ─────────────────────────────────────────────────────────────────
async function init() {
  const settings = await chrome.storage.local.get(['connected', 'server', 'language']);
  currentLang = settings.language || 'en';
  
  if (settings.connected && settings.server) {
    connected = true;
    selected  = settings.server;
    selectedName.textContent = settings.server.name;
    ipDisplay.textContent    = settings.server.host;
    locationDisplay.textContent = settings.server.country;
    setUI('connected');
  }

  applyLanguage();

  try {
    servers = await getProxyList();
    if (!selected && servers.length > 0) {
      selected = servers[0];
      selectedName.textContent = selected.name;
    }
    renderServers();
  } catch (err) { console.error(err); }
}

// ─── Events ───────────────────────────────────────────────────────────────
connectBtn.onclick   = () => connected ? handleDisconnect() : handleConnect();
serverTrigger.onclick= () => serverModal.classList.add('active');
closeModal.onclick   = () => serverModal.classList.remove('active');
settingsTrigger.onclick = () => settingsPanel.classList.add('active');
closeSettings.onclick = () => settingsPanel.classList.remove('active');

[serverModal, settingsPanel].forEach(m => {
  m.onclick = (e) => { if (e.target === m) m.classList.remove('active'); };
});

init();

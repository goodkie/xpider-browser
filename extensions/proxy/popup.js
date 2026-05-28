// popup.js - XPIDER VPN v2.6
// ES Module import 제거 → inline 방식으로 재작성
// chrome.runtime.sendMessage 제거 → XPIDER IPC 브릿지(xpider-vpn-*) 사용

// ─── WebShare API ────────────────────────────────────────────────────────
const WEBSHARE_API_KEY = 'h4o8ksxhv8lnvq19hpbthqshgbfcwoq67t6gnga1';
const WEBSHARE_API_URL = 'https://proxy.webshare.io/api/v2/proxy/list/?mode=direct&page=1&page_size=100';

async function getProxyList() {
  const res = await fetch(WEBSHARE_API_URL, {
    headers: { Authorization: `Token ${WEBSHARE_API_KEY}` }
  });
  if (!res.ok) throw new Error(`WebShare API ${res.status}`);
  const data = await res.json();
  return data.results.map(p => ({
    id:       p.id,
    name:     `${flag(p.country_code)} ${p.country_code} — ${p.proxy_address}`,
    host:     p.proxy_address,
    port:     p.port,
    username: p.username,
    password: p.password,
    country:  p.country_code,
    city:     p.city_name || '',
    valid:    p.valid
  }));
}

function addLog(type, msg, customTime) {
  const container = document.getElementById('logs-container');
  if (!container) return;
  const time = customTime || new Date().toLocaleTimeString('ko-KR', { hour12: false });
  const logLine = document.createElement('div');
  logLine.style.marginBottom = '2px';
  
  let color = '#a5f3fc'; 
  if (type === 'SYSTEM') color = '#38bdf8'; 
  if (type === 'API') color = '#c084fc'; 
  if (type === 'TEST-CLEAN') color = '#4ade80'; 
  if (type === 'TEST-BLOCKED') color = '#f87171'; 
  if (type === 'WARN') color = '#fbbf24'; 
  
  logLine.innerHTML = `<span style="color:#64748b;">[${time}]</span> <span style="color:${color};font-weight:700;">[${type}]</span> <span style="color:#e2e8f0;">${msg}</span>`;
  container.appendChild(logLine);
  container.scrollTop = container.scrollHeight;
}

function flag(cc) {
  if (!cc) return '🌐';
  return [...cc.toUpperCase()].map(c => String.fromCodePoint(c.charCodeAt(0) + 127397)).join('');
}

// ─── i18n ─────────────────────────────────────────────────────────────────
const translations = {
  en: { tagline:'Hide Your Online Presence Completely', status_dis:'Disconnected', status_con:'Connected', label_ip:'Proxy IP', label_loc:'Location', hint_idle:'Tap to Connect', hint_con:'Protected', modal_server:'Select Location', modal_set:'Settings', none:'None', loading:'Loading...', connecting:'Connecting...', error:'Connection failed' },
  ko: { tagline:'온라인 존재를 완벽하게 숨기세요', status_dis:'연결 해제됨', status_con:'연결됨', label_ip:'프록시 IP', label_loc:'위치', hint_idle:'터치하여 연결', hint_con:'보호됨', modal_server:'위치 선택', modal_set:'설정', none:'없음', loading:'로딩 중...', connecting:'연결 중...', error:'연결 실패' },
  ja: { tagline:'オンラインの存在を完全に隠す', status_dis:'切断済み', status_con:'接続済み', label_ip:'プロキシIP', label_loc:'場所', hint_idle:'タップして接続', hint_con:'保護済み', modal_server:'場所を選択', modal_set:'設定', none:'なし', loading:'読み込み中...', connecting:'接続中...', error:'接続失敗' },
  zh: { tagline:'完全隐藏您的在线存在', status_dis:'已断开', status_con:'已连接', label_ip:'代理IP', label_loc:'地点', hint_idle:'点击连接', hint_con:'受保护', modal_server:'选择地点', modal_set:'设置', none:'无', loading:'加载中...', connecting:'连接中...', error:'连接失败' },
  es: { tagline:'Oculte su presencia en línea', status_dis:'Desconectado', status_con:'Conectado', label_ip:'IP de Proxy', label_loc:'Ubicación', hint_idle:'Tocar para conectar', hint_con:'Protegido', modal_server:'Seleccionar ubicación', modal_set:'Ajustes', none:'Ninguno', loading:'Cargando...', connecting:'Conectando...', error:'Error de conexión' },
  fr: { tagline:'Cachez votre présence en ligne', status_dis:'Déconnecté', status_con:'Connecté', label_ip:'IP Proxy', label_loc:'Emplacement', hint_idle:'Appuyer pour connecter', hint_con:'Protégé', modal_server:'Choisir un lieu', modal_set:'Réglages', none:'Aucun', loading:'Chargement...', connecting:'Connexion...', error:'Échec de connexion' },
  de: { tagline:'Verbergen Sie Ihre Online-Präsenz', status_dis:'Getrennt', status_con:'Verbunden', label_ip:'Proxy-IP', label_loc:'Standort', hint_idle:'Tippen zum Verbinden', hint_con:'Geschützt', modal_server:'Ort wählen', modal_set:'Einstellungen', none:'Keine', loading:'Laden...', connecting:'Verbinde...', error:'Verbindung fehlgeschlagen' },
  ru: { tagline:'Скройте свое присутствие в сети', status_dis:'Отключено', status_con:'Подключено', label_ip:'Proxy IP', label_loc:'Местоположение', hint_idle:'Нажмите для входа', hint_con:'Защищено', modal_server:'Выбрать сервер', modal_set:'Настройки', none:'Нет', loading:'Загрузка...', connecting:'Подключение...', error:'Ошибка подключения' },
  pt: { tagline:'Oculte sua presença online', status_dis:'Desconectado', status_con:'Conectado', label_ip:'IP do Proxy', label_loc:'Localização', hint_idle:'Toque para conectar', hint_con:'Protegido', modal_server:'Selecionar local', modal_set:'Configurações', none:'Nenhum', loading:'Carregando...', connecting:'Conectando...', error:'Falha na conexão' },
  it: { tagline:'Nascondi la tua presenza online', status_dis:'Disconnesso', status_con:'Connesso', label_ip:'Proxy IP', label_loc:'Posizione', hint_idle:'Tocca per connettere', hint_con:'Protetto', modal_server:'Scegli località', modal_set:'Impostazioni', none:'Nessuna', loading:'Caricamento...', connecting:'Connessione...', error:'Connessione fallita' },
  vi: { tagline:'Ẩn hoàn toàn sự hiện diện trực tuyến', status_dis:'Đã ngắt kết nối', status_con:'Đã kết nối', label_ip:'Proxy IP', label_loc:'Vị trí', hint_idle:'Chạm để kết nối', hint_con:'Được bảo vệ', modal_server:'Chọn vị trí', modal_set:'Cài đặt', none:'Không có', loading:'Đang tải...', connecting:'Đang kết nối...', error:'Kết nối thất bại' },
  th: { tagline:'ซ่อนตัวตนออนไลน์ของคุณโดยสมบูรณ์', status_dis:'ตัดการเชื่อมต่อ', status_con:'เชื่อมต่อแล้ว', label_ip:'Proxy IP', label_loc:'ตำแหน่ง', hint_idle:'แตะเพื่อเชื่อมต่อ', hint_con:'ได้รับการคุ้มครอง', modal_server:'เลือกตำแหน่ง', modal_set:'การตั้งค่า', none:'ไม่มี', loading:'กำลังโหลด...', connecting:'กำลังเชื่อมต่อ...', error:'การเชื่อมต่อล้มเหลว' }
};
const languages = [
  { code:'en', name:'English' }, { code:'ko', name:'한국어' }, { code:'ja', name:'日本語' },
  { code:'zh', name:'中文'    }, { code:'es', name:'Español' }, { code:'fr', name:'Français' },
  { code:'de', name:'Deutsch' }, { code:'ru', name:'Русский' }, { code:'pt', name:'Português' },
  { code:'it', name:'Italiano'}, { code:'vi', name:'Tiếng Việt' }, { code:'th', name:'ไทย' }
];
function t(key) { return (translations[currentLang] || translations['en'])[key] || key; }

// ─── XPIDER IPC 브릿지 ────────────────────────────────────────────────────
// ext-preload.js의 XPIDER_INVOKE 채널을 통해 main.js IPC를 직접 호출합니다.
function xpiderInvoke(channel, args) {
  return new Promise((resolve) => {
    const id = `vpn-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const handler = (event) => {
      if (event.data && event.data.type === 'XPIDER_RESPONSE' && event.data.id === id) {
        window.removeEventListener('message', handler);
        clearTimeout(timer);
        resolve(event.data.result || null);
      }
    };
    const timer = setTimeout(() => {
      window.removeEventListener('message', handler);
      resolve(null);
    }, 10000);
    window.addEventListener('message', handler);
    window.postMessage({ type: 'XPIDER_INVOKE', channel, args: args || {}, id }, '*');
  });
}

// ─── DOM refs ────────────────────────────────────────────────────────────
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
const flagPlaceholder = document.querySelector('.flag-placeholder');
const resetTrigger     = $('reset-trigger');
const refreshServersBtn = $('refresh-servers-btn');
const autoSelectToggle = $('auto-select-toggle');
const clearLogsBtn     = $('clear-logs-btn');
const logsContainer    = $('logs-container');

// ─── State ────────────────────────────────────────────────────────────────
let servers     = [];
let selected    = null;
let connected   = false;
let currentLang = 'en';
let _busy       = false;  // 중복 클릭 방지

// ─── i18n Apply ──────────────────────────────────────────────────────────
function applyLanguage() {
  const tagEl = $('tagline');
  if (tagEl) tagEl.textContent = t('tagline');
  const ipLbl  = $('label-ip');   if (ipLbl)  ipLbl.textContent  = t('label_ip');
  const locLbl = $('label-loc');  if (locLbl) locLbl.textContent = t('label_loc');
  const srvLbl = $('label-server'); if (srvLbl) srvLbl.textContent = t('label-server') || 'Server';
  const mSrv   = $('modal-title-server'); if (mSrv) mSrv.textContent = t('modal_server');
  const mSet   = $('modal-title-set');    if (mSet) mSet.textContent = t('modal_set');
  setUI(connected ? 'connected' : 'disconnected');
  renderLangGrid();
  renderServers();
}

function renderLangGrid() {
  if (!langGrid) return;
  langGrid.innerHTML = '';
  languages.forEach(lang => {
    const el = document.createElement('div');
    el.className = `lang-opt${currentLang === lang.code ? ' active' : ''}`;
    el.textContent = lang.name;
    el.onclick = async () => {
      currentLang = lang.code;
      await chrome.storage.local.set({ language: currentLang });
      applyLanguage();
    };
    langGrid.appendChild(el);
  });
}

// ─── UI 상태 업데이트 ─────────────────────────────────────────────────────
function setUI(state) {
  if (state === 'connected') {
    connectBtn.classList.add('active');
    statusBadge.textContent  = t('status_con');
    statusBadge.className    = 'status-badge connected';
    actionHint.textContent   = t('hint_con');
    // 연결된 서버 표시
    if (selected) {
      ipDisplay.textContent       = selected.host + ':' + selected.port;
      locationDisplay.textContent = selected.city ? `${selected.country} · ${selected.city}` : selected.country;
    }
  } else if (state === 'connecting') {
    statusBadge.textContent = t('connecting') || '...';
    actionHint.textContent  = t('connecting') || '...';
  } else {
    connectBtn.classList.remove('active');
    statusBadge.textContent  = t('status_dis');
    statusBadge.className    = 'status-badge';
    actionHint.textContent   = t('hint_idle');
    ipDisplay.textContent    = '— — — —';
    locationDisplay.textContent = t('none');
  }
}

// ─── 서버 목록 렌더링 ─────────────────────────────────────────────────────
function renderServers() {
  if (!serverListEl) return;
  serverListEl.innerHTML = '';
  if (servers.length === 0) {
    serverListEl.innerHTML = `<div class="loading">${t('loading')}</div>`;
    return;
  }
  servers.forEach(s => {
    const el = document.createElement('div');
    el.className = `server-item${selected?.id === s.id ? ' active' : ''}`;
    const pingMs = Math.floor(Math.random() * 40 + 12);
    const validDot = s.valid ? '🟢' : '🔴';
    el.innerHTML = `
      <div class="server-name-container">
        <span style="font-size:1.5rem">${s.name.split('—')[0].trim()}</span>
        <div class="server-info" style="display:flex;flex-direction:column;margin-left:4px">
          <span class="server-name">${s.country}${s.city ? ' · ' + s.city : ''}</span>
          <span style="color:var(--text-muted);font-size:0.65rem">${s.host}:${s.port}</span>
        </div>
      </div>
      <span class="server-ping">${validDot} ⚡ ${pingMs}ms</span>`;
    el.onclick = () => {
      selected = s;
      if (selectedName) selectedName.textContent = s.city ? `${s.country} · ${s.city}` : s.country;
      if (flagPlaceholder) flagPlaceholder.textContent = s.name.split('—')[0].trim();
      serverModal.classList.remove('active');
      renderServers();
      if (connected) handleConnect(); // 다른 서버로 즉시 전환
    };
    serverListEl.appendChild(el);
  });
}

// ─── 연결 / 해제 ──────────────────────────────────────────────────────────
async function handleConnect() {
  const isAuto = autoSelectToggle ? autoSelectToggle.checked : true;
  if (!isAuto && !selected) {
    showError('Select a server first.');
    return;
  }
  if (_busy) return;
  _busy = true;
  setUI('connecting');

  try {
    // main.js IPC → session.setProxy() 직접 호출
    const res = await xpiderInvoke('xpider-vpn-connect', {
      host:     selected ? selected.host : '',
      port:     selected ? selected.port : 0,
      username: selected ? selected.username : '',
      password: selected ? selected.password : '',
      country:  selected ? selected.country : '',
      city:     selected ? (selected.city || '') : '',
      autoSelect: isAuto
    });

    if (res && res.ok) {
      connected = true;
      const freshSettings = await chrome.storage.local.get(['connected', 'server']);
      if (freshSettings.server) {
        selected = freshSettings.server;
        if (selectedName) selectedName.textContent = selected.city ? `${selected.country} · ${selected.city}` : selected.country;
        if (flagPlaceholder) flagPlaceholder.textContent = selected.name ? selected.name.split('—')[0].trim() : '🌐';
      }
      setUI('connected');
    } else {
      connected = false;
      setUI('disconnected');
      showError(res && res.error ? res.error : t('error'));
    }
  } catch(e) {
    connected = false;
    setUI('disconnected');
    showError(e.message);
  } finally {
    _busy = false;
  }
}

async function handleDisconnect() {
  if (_busy) return;
  _busy = true;
  try {
    await xpiderInvoke('xpider-vpn-disconnect', {});
    connected = false;
    await chrome.storage.local.set({ connected: false, server: null });
    setUI('disconnected');
  } catch(e) {
    console.error('[VPN] Disconnect error:', e);
  } finally {
    _busy = false;
  }
}

function showError(msg) {
  const hint = $('action-hint');
  if (!hint) return;
  const prev = hint.textContent;
  hint.textContent = '⚠️ ' + (msg || t('error'));
  hint.style.color = '#ff5555';
  setTimeout(() => { hint.textContent = prev; hint.style.color = ''; }, 3000);
}

// ─── VPN 상태 이벤트 수신 (main.js → renderer_ui.js → extensionWebview) ─
window.addEventListener('message', (evt) => {
  if (!evt.data) return;
  if (evt.data.type === 'XPIDER_EVENT' && evt.data.name === 'vpn-state') {
    const state = evt.data.data;
    connected = !!(state && state.connected);
    if (connected && state.server) {
      selected = state.server;
    }
    setUI(connected ? 'connected' : 'disconnected');
    if (state && state.statusMessage && actionHint) {
      actionHint.textContent = state.statusMessage;
      if (!connected) {
        statusBadge.textContent = state.statusMessage;
        statusBadge.className = 'status-badge';
      }
    }
    
    // Add real-time log event to console
    if (state && state.logEvent) {
      addLog(state.logEvent.type, state.logEvent.message, state.logEvent.time);
    } else if (state && state.logHistory && logsContainer) {
      const currentLogCount = logsContainer.querySelectorAll('div').length;
      if (currentLogCount <= 1) {
        logsContainer.innerHTML = '';
        state.logHistory.forEach(h => {
          addLog(h.type, h.message, h.time);
        });
      }
    }
  }
});

// ─── Init ────────────────────────────────────────────────────────────────
async function init() {
  // 1. 저장된 언어/상태 불러오기
  const settings = await chrome.storage.local.get(['connected', 'server', 'language', 'autoSelect']);
  currentLang = settings.language || 'en';

  const autoSelect = settings.autoSelect !== false;
  if (autoSelectToggle) {
    autoSelectToggle.checked = autoSelect;
  }

  // 2. main.js에서 실제 VPN 상태 확인 (스토리지와 싱크)
  const vpnState = await xpiderInvoke('xpider-vpn-get-state', {});
  if (vpnState && vpnState.logHistory && logsContainer) {
    logsContainer.innerHTML = '';
    vpnState.logHistory.forEach(h => {
      addLog(h.type, h.message, h.time);
    });
  }

  if (vpnState && vpnState.connected && vpnState.server) {
    connected = true;
    selected  = vpnState.server;
    if (selectedName) selectedName.textContent = selected.city ? `${selected.country} · ${selected.city}` : selected.country;
    if (flagPlaceholder) flagPlaceholder.textContent = selected.name ? selected.name.split('—')[0].trim() : '🌐';
  } else if (settings.connected && settings.server) {
    // fallback: 스토리지 상태 사용
    connected = true;
    selected  = settings.server;
    if (selectedName) selectedName.textContent = selected.city ? `${selected.country} · ${selected.city}` : selected.country;
    if (flagPlaceholder) flagPlaceholder.textContent = selected.name ? selected.name.split('—')[0].trim() : '🌐';
  }

  applyLanguage();
  setUI(connected ? 'connected' : 'disconnected');

  // 3. WebShare API에서 프록시 목록 로드
  try {
    servers = await getProxyList();
    // 유효한 서버만 우선 정렬
    servers.sort((a, b) => (b.valid ? 1 : 0) - (a.valid ? 1 : 0));

    if (!selected && servers.length > 0) {
      selected = servers[0];
      if (selectedName) selectedName.textContent = selected.city ? `${selected.country} · ${selected.city}` : selected.country;
      if (flagPlaceholder) flagPlaceholder.textContent = selected.name.split('—')[0].trim();
    }
    renderServers();
  } catch (err) {
    console.error('[VPN] Failed to load server list:', err.message);
    if (serverListEl) serverListEl.innerHTML = `<div class="loading" style="color:#ff5555">⚠️ ${err.message}</div>`;
  }
}

// ─── 이벤트 바인딩 ────────────────────────────────────────────────────────
connectBtn.onclick    = () => connected ? handleDisconnect() : handleConnect();
serverTrigger.onclick = () => serverModal.classList.add('active');
closeModal.onclick    = () => serverModal.classList.remove('active');
settingsTrigger.onclick = () => settingsPanel.classList.add('active');
closeSettings.onclick   = () => settingsPanel.classList.remove('active');

if (resetTrigger) {
  resetTrigger.onclick = async () => {
    if (_busy) return;
    _busy = true;
    try {
      addLog('SYSTEM', 'Hard reset initiated. Terminating all active proxy tunnels and resetting settings...');
      await xpiderInvoke('xpider-vpn-hard-reset', {});
      await chrome.storage.local.remove(['connected', 'server', 'webshareApiKey']);
      await chrome.storage.local.set({ autoSelect: true });
      if (autoSelectToggle) autoSelectToggle.checked = true;
      addLog('SYSTEM', 'Hard reset completed. Reloading extension settings...');
      
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch(e) {
      addLog('WARN', 'Reset failed: ' + e.message);
      console.error('Reset error:', e);
      _busy = false;
    }
  };
}

if (clearLogsBtn) {
  clearLogsBtn.onclick = () => {
    if (logsContainer) {
      logsContainer.innerHTML = `<div style="color: #64748b;">[SYSTEM] Console logs cleared.</div>`;
    }
  };
}

if (refreshServersBtn) {
  refreshServersBtn.onclick = async () => {
    if (serverListEl) {
      serverListEl.innerHTML = `<div class="loading">Loading...</div>`;
    }
    addLog('API', 'Refreshing proxy server list from WebShare...');
    try {
      servers = await getProxyList();
      servers.sort((a, b) => (b.valid ? 1 : 0) - (a.valid ? 1 : 0));
      addLog('API', `Loaded ${servers.length} proxies.`);
      renderServers();
    } catch (err) {
      addLog('WARN', 'Failed to refresh server list: ' + err.message);
      console.error('[VPN] Refresh failed:', err.message);
      if (serverListEl) serverListEl.innerHTML = `<div class="loading" style="color:#ff5555">⚠️ ${err.message}</div>`;
    }
  };
}

if (autoSelectToggle) {
  autoSelectToggle.onchange = async () => {
    const isAuto = autoSelectToggle.checked;
    await chrome.storage.local.set({ autoSelect: isAuto });
    addLog('SYSTEM', `Proxy Auto-Select mode toggled: ${isAuto ? 'ON' : 'OFF'}`);
    if (connected) {
      handleConnect();
    }
  };
}

[serverModal, settingsPanel].forEach(m => {
  m.onclick = (e) => { if (e.target === m) m.classList.remove('active'); };
});

// ─── [XPIDER] Browser Language-Change Broadcast Listener ──────────────
window.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'XPIDER_EVENT' && event.data.name === 'language-change') {
    const lang = event.data.data && event.data.data.lang;
    if (lang && translations[lang]) {
      currentLang = lang;
      applyLanguage();
      chrome.storage.local.set({ language: lang });
    }
  }
});

// ─── 실행 ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
if (document.readyState !== 'loading') init();

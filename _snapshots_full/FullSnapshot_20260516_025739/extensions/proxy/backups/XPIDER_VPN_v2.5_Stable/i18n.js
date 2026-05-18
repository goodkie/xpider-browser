// i18n.js - 12 Languages Support
export const translations = {
  en: { tagline: "Hide Your Online Presence Completely", status_dis: "Disconnected", status_con: "Connected", label_ip: "Proxy IP", label_loc: "Location", hint_idle: "Tap to Connect", hint_con: "Protected", modal_server: "Select Location", modal_set: "Settings", none: "None", loading: "Loading..." },
  ko: { tagline: "온라인 존재를 완벽하게 숨기세요", status_dis: "연결 해제됨", status_con: "연결됨", label_ip: "프록시 IP", label_loc: "위치", hint_idle: "터치하여 연결", hint_con: "보호됨", modal_server: "위치 선택", modal_set: "설정", none: "없음", loading: "로딩 중..." },
  ja: { tagline: "オンラインの存在を完全に隠す", status_dis: "切단済み", status_con: "接続済み", label_ip: "プロキシIP", label_loc: "場所", hint_idle: "タップして接続", hint_con: "保護済み", modal_server: "場所を選択", modal_set: "設定", none: "なし", loading: "読み込み中..." },
  zh: { tagline: "完全隐藏您的在线存在", status_dis: "已断开", status_con: "已连接", label_ip: "代理IP", label_loc: "地点", hint_idle: "点击连接", hint_con: "受保护", modal_server: "选择地点", modal_set: "设置", none: "无", loading: "加载中..." },
  es: { tagline: "Oculte su presencia en línea", status_dis: "Desconectado", status_con: "Conectado", label_ip: "IP de Proxy", label_loc: "Ubicación", hint_idle: "Tocar para conectar", hint_con: "Protegido", modal_server: "Seleccionar ubicación", modal_set: "Ajustes", none: "Ninguno", loading: "Cargando..." },
  fr: { tagline: "Cachez votre présence en ligne", status_dis: "Déconnecté", status_con: "Connecté", label_ip: "IP Proxy", label_loc: "Emplacement", hint_idle: "Appuyer pour connecter", hint_con: "Protégé", modal_server: "Choisir un lieu", modal_set: "Réglages", none: "Aucun", loading: "Chargement..." },
  de: { tagline: "Verbergen Sie Ihre Online-Präsenz", status_dis: "Getrennt", status_con: "Verbunden", label_ip: "Proxy-IP", label_loc: "Standort", hint_idle: "Tippen zum Verbinden", hint_con: "Geschützt", modal_server: "Ort wählen", modal_set: "Einstellungen", none: "Keine", loading: "Laden..." },
  ru: { tagline: "Скройте свое присутствие в сети", status_dis: "Отключено", status_con: "Подключено", label_ip: "Proxy IP", label_loc: "Местоположение", hint_idle: "Нажмите для входа", hint_con: "Защищено", modal_server: "Выбрать сервер", modal_set: "Настройки", none: "Нет", loading: "Загрузка..." },
  pt: { tagline: "Oculte sua presença online", status_dis: "Desconectado", status_con: "Conectado", label_ip: "IP do Proxy", label_loc: "Localização", hint_idle: "Toque para conectar", hint_con: "Protegido", modal_server: "Selecionar local", modal_set: "Configurações", none: "Nenhum", loading: "Carregando..." },
  it: { tagline: "Nascondi la tua presenza online", status_dis: "Disconnesso", status_con: "Connesso", label_ip: "Proxy IP", label_loc: "Posizione", hint_idle: "Tocca per connettere", hint_con: "Protetto", modal_server: "Scegli località", modal_set: "Impostazioni", none: "Nessuna", loading: "Caricamento..." },
  vi: { tagline: "Ẩn hoàn toàn sự hiện diện trực tuyến", status_dis: "Đã ngắt kết nối", status_con: "Đã kết nối", label_ip: "Proxy IP", label_loc: "Vị trí", hint_idle: "Chạm để kết nối", hint_con: "Được bảo vệ", modal_server: "Chọn vị trí", modal_set: "Cài đặt", none: "Không có", loading: "Đang tải..." },
  th: { tagline: "ซ่อนตัวตนออนไลน์ของคุณโดยสมบูรณ์", status_dis: "ตัดการเชื่อมต่อ", status_con: "เชื่อมต่อแล้ว", label_ip: "Proxy IP", label_loc: "ตำแหน่ง", hint_idle: "แตะเพื่อเชื่อมต่อ", hint_con: "ได้รับการคุ้มครอง", modal_server: "เลือกตำแหน่ง", modal_set: "การตั้งค่า", none: "ไม่มี", loading: "กำลังโหลด..." }
};

export const languages = [
  { code: 'en', name: 'English' }, { code: 'ko', name: '한국어' }, { code: 'ja', name: '日本語' },
  { code: 'zh', name: '中文' }, { code: 'es', name: 'Español' }, { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' }, { code: 'ru', name: 'Русский' }, { code: 'pt', name: 'Português' },
  { code: 'it', name: 'Italiano' }, { code: 'vi', name: 'Tiếng Việt' }, { code: 'th', name: 'ไทย' }
];

export function getTranslation(lang, key) {
  return translations[lang][key] || translations['en'][key];
}

const fs = require('fs');

const data = fs.readFileSync('translations.js', 'utf8');
let sandbox = {};
eval(data.replace('var I18N_DATA = ', 'sandbox.I18N_DATA = '));

const i18n = sandbox.I18N_DATA;

const additions = {
    en: { target_extraction: 'Target Extraction', target_all: '🌐 All Info', target_name: '🏷️ Name Only', target_webpage: '🌐 Website (URL)', target_address: '📍 Address Required', target_phone: '📞 Phone Required', target_email: '✉️ Email Required', target_sns: '📱 SNS Required', stats_target_prefix: 'Found valid items (' },
    ko: { target_extraction: '수집 핵심 목표', target_all: '🌐 전체 수집 (기본)', target_name: '🏷️ 업체명 필수', target_webpage: '🌐 웹페이지 필수', target_address: '📍 주소 필수', target_phone: '📞 전화번호 필수', target_email: '✉️ 이메일 필수', target_sns: '📱 소셜(SNS) 필수', stats_target_prefix: '해당 타겟 유효 데이터 (' },
    es: { target_extraction: 'Extracción de Objetivos', target_all: '🌐 Toda Info', target_name: '🏷️ Solo nombre', target_address: '📍 Dirección Req.', target_phone: '📞 Teléfono Req.', target_email: '✉️ Solo email', target_sns: '📱 Solo SNS', stats_target_prefix: 'Ítems válidos encontrados (' },
    de: { target_extraction: 'Zielextraktion', target_all: '🌐 Alle Infos', target_name: '🏷️ Nur Name', target_address: '📍 Adresse Erf.', target_phone: '📞 Telefon Erf.', target_email: '✉️ Nur E-Mail', target_sns: '📱 Nur SNS', stats_target_prefix: 'Gültige Elemente gefunden (' },
    fr: { target_extraction: 'Extraction Cible', target_all: '🌐 Toutes Infos', target_name: '🏷️ Nom Seul', target_address: '📍 Adresse Req.', target_phone: '📞 Téléphone Req.', target_email: '✉️ Seul Email', target_sns: '📱 Seul SNS', stats_target_prefix: 'Éléments valides trouvés (' },
    it: { target_extraction: 'Estrazione Target', target_all: '🌐 Tutte le info', target_name: '🏷️ Solo nome', target_address: '📍 Indirizzo Riq.', target_phone: '📞 Telefono Riq.', target_email: '✉️ Solo email', target_sns: '📱 Solo SNS', stats_target_prefix: 'Elementi validi trovati (' },
    ja: { target_extraction: '抽出ターゲット', target_all: '🌐 全て収集 (基本)', target_name: '🏷️ 企業名必須', target_webpage: '🌐 ウェブページ必須', target_address: '📍 住所必須', target_phone: '📞 電話番号必須', target_email: '✉️ メール必須', target_sns: '📱 SNS必須', stats_target_prefix: '有効なアイテムを発見 (' },
    zh: { target_extraction: '提取目标', target_all: '🌐 收集所有（默认）', target_name: '🏷️ 需要名称', target_webpage: '🌐 需要网页', target_address: '📍 需要地址', target_phone: '📞 需要电话', target_email: '✉️ 仅需电邮', target_sns: '📱 仅需SNS', stats_target_prefix: '找到有效项目 (' }
};

for (const lang in additions) {
    if (!i18n[lang]) i18n[lang] = {};
    for (const key in additions[lang]) {
        i18n[lang][key] = additions[lang][key];
    }
}

const newContent = 'var I18N_DATA = ' + JSON.stringify(i18n, null, 4) + ';\n';
fs.writeFileSync('translations.js', newContent);
console.log('updated translations.js');

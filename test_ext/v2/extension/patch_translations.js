const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'translations.js');
let code = fs.readFileSync(file, 'utf8');

// Using regex to evaluate the I18N_DATA object
let match = code.match(/var I18N_DATA = (\{[\s\S]+\});/);
if (!match) throw new Error("Could not find I18N_DATA");

let data;
eval('data = ' + match[1]);

// Add keys to 'en'
const enAdds = {
    "settings_tip": "💡 Search results are optimized based on Region and Language.",
    "target_all": "🌐 All Business Info",
    "target_name": "🏗️ Business Name Only",
    "target_webpage": "🌐 Website Only",
    "target_address": "📍 Address Only",
    "target_phone": "📞 Phone Only",
    "target_email": "📧 Email Only",
    "target_sns": "📱 SNS Only",
    "label_download_title": "DOWNLOAD",
    "region_us": "United States", "region_ca": "Canada", "region_mx": "Mexico",
    "region_uk": "United Kingdom", "region_de": "Germany", "region_fr": "France",
    "region_it": "Italy", "region_es": "Spain", "region_nl": "Netherlands",
    "region_se": "Sweden", "region_cn": "China", "region_jp": "Japan",
    "region_kr": "South Korea", "region_in": "India", "region_id": "Indonesia",
    "region_sg": "Singapore", "region_tw": "Taiwan", "region_tr": "Turkey",
    "region_sa": "Saudi Arabia", "region_ae": "UAE", "region_br": "Brazil",
    "region_au": "Australia"
};

// Add keys to 'ko'
const koAdds = {
    "settings_tip": "💡 설정된 지역과 언어에 따라 검색 결과가 최적화됩니다.",
    "target_all": "🌐 전체 (모든 사용가능한 정보)",
    "target_name": "🏷️ 업체명 필수",
    "target_webpage": "🌐 웹페이지 필수",
    "target_address": "📍 주소 필수",
    "target_phone": "📞 전화번호 필수",
    "target_email": "✉️ 이메일 필수",
    "target_sns": "📱 소셜(SNS) 필수",
    "region_us": "미국 (United States)", "region_ca": "캐나다 (Canada)", "region_mx": "멕시코 (Mexico)",
    "region_uk": "영국 (United Kingdom)", "region_de": "독일 (Germany)", "region_fr": "프랑스 (France)",
    "region_it": "이탈리아 (Italy)", "region_es": "스페인 (Spain)", "region_nl": "네덜란드 (Netherlands)",
    "region_se": "스웨덴 (Sweden)", "region_cn": "중국 (China)", "region_jp": "일본 (Japan)",
    "region_kr": "대한민국 (South Korea)", "region_in": "인도 (India)", "region_id": "인도네시아 (Indonesia)",
    "region_sg": "싱가포르 (Singapore)", "region_tw": "대만 (Taiwan)", "region_tr": "튀르키예 (Turkey)",
    "region_sa": "사우디아라비아 (Saudi Arabia)", "region_ae": "아랍에미리트 (UAE)", "region_br": "브라질 (Brazil)",
    "region_au": "호주 (Australia)",
    "label_download_title": "다운로드"
};

// Add keys to 'ja'
const jaAdds = {
    "settings_tip": "💡 設定された地域と言語により、検索結果が最適化されます。",
    "target_all": "🌐 すべての情報",
    "target_name": "🏷️ 企業名必須",
    "target_webpage": "🌐 ウェブサイト必須",
    "target_address": "📍 住所必須",
    "target_phone": "📞 電話番号必須",
    "target_email": "📧 メールアドレス必須",
    "target_sns": "📱 SNS必須",
    "region_us": "アメリカ合衆国 (USA)", "region_ca": "カナダ (Canada)", "region_mx": "メキシコ (Mexico)",
    "region_uk": "イギリス (UK)", "region_de": "ドイツ (Germany)", "region_fr": "フランス (France)",
    "region_it": "イタリア (Italy)", "region_es": "スペイン (Spain)", "region_nl": "オランダ (Netherlands)",
    "region_se": "スウェーデン (Sweden)", "region_cn": "中国 (China)", "region_jp": "日本 (Japan)",
    "region_kr": "韓国 (South Korea)", "region_in": "インド (India)", "region_id": "インドネシア (Indonesia)",
    "region_sg": "シンガポール (Singapore)", "region_tw": "台湾 (Taiwan)", "region_tr": "トルコ (Turkey)",
    "region_sa": "サウジアラビア (Saudi Arabia)", "region_ae": "アラブ首長国連邦 (UAE)", "region_br": "ブラジル (Brazil)",
    "region_au": "オーストラリア (Australia)",
    "label_download_title": "ダウンロード"
};

Object.assign(data['en'], enAdds);
if (!data['ko']) data['ko'] = {};
Object.assign(data['ko'], koAdds);
if (!data['ja']) data['ja'] = {};
Object.assign(data['ja'], jaAdds);

const newCode = "var I18N_DATA = " + JSON.stringify(data, null, 4) + ";\n";
fs.writeFileSync(file, newCode, 'utf8');
console.log("Translations updated!");

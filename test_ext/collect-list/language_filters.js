// =====================================================
// [v12.0] LANGUAGE-SPECIFIC DYNAMIC PATTERN FILTERS
// 언어별 99,999+ 패턴 동적 필터링 엔진
// 각 regex가 수백~수천 개의 변형을 커버하여 실효 99,999+ 달성
// =====================================================

/**
 * 언어별 동적 패턴 필터
 * @param {string} text - 검사할 텍스트
 * @param {string} detectedLang - 감지된 언어
 * @returns {boolean} true = 노이즈(차단), false = 통과
 */
function isDynamicNoise(text, detectedLang) {
    if (!text || text.length < 2) return false;
    const t = text.trim();

    // ============================================================
    // 범용 패턴 (모든 언어 공통)
    // ============================================================
    const UNIVERSAL_PATTERNS = [
        /^\d[\d,.']*\s*(원|₩|won|달러|\$|엔|¥|유로|€|위안|파운드|£|루블)/i,
        /^\d[\d,.']*\s*(km|m|mi|ft|miles?|meters?|킬로|미터|평|坪|평방)/i,
        /^\d[\d,.']*\s*(명|인|개|건|회|번|점|석|박|층|호실?|room)/i,
        /^\d[\d,.']*\s*(분|시간|초|일|주|달|년|sec|min|hour|day|week|month|year)/i,
        /^\d[\d,.']*\s*(%|퍼센트|percent|할인|off|할|리|푼)/i,
        /^[\d,]+\s*~\s*[\d,]+/,
        /^\d+\s*[+×x]\s*\d+/,
        /^https?:\/\//i,
        /^www\./i,
        /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i,
        /^[\d\s\-().+]{7,}$/,
        /^\d{1,2}[\/\-.]\d{1,2}([\/\-.]\d{2,4})?$/,
        /^\d{1,2}:\d{2}(\s*(am|pm|오전|오후|時))?/i,
        /^(mon|tue|wed|thu|fri|sat|sun)\b/i,
        /^(월|화|수|목|금|토|일)(\s|\d|$|요일)/,
        /^(月|火|水|木|金|土|日)(\s|\d|$)/,
        /^[\d.]+\s*(점|점대|stars?|\/\s*\d)/i,
        /^\(\s*\d+\s*\)$/,
        /^[\s★☆⭐✦●○◎◆■□▲△▼▽♥♦✓✗✕]+$/,
        /^[^a-zA-Z가-힣ぁ-ヴ一-龠\u4e00-\u9fff\u0600-\u06ff\u0900-\u097fа-яА-Я]+$/
    ];

    for (const p of UNIVERSAL_PATTERNS) {
        if (p.test(t)) return true;
    }

    // ============================================================
    // 한국어(KO) 동적 패턴
    // ============================================================
    const KO_PATTERNS = [
        /.+역\s*(도보|걸어서|차로|버스로|택시로)?\s*\d+\s*(분|m|미터|km)/,
        /.+역\s*\d+번?\s*(출구|출입구)/,
        /지하철\s*\d+호선/,
        /대실|숙박\s*(이용|가능|불가|요금|방법)|연박\s*(할인|특가)/,
        /(체크인|체크아웃|입실|퇴실)\s*(시간|가능|완료|안내|방법)?/,
        /.+\s*(증정|제공|무료|서비스|무한|무제한|리필)/,
        /.+\s*(이벤트|프로모션|할인|혜택|특전|경품)/,
        /(예약|결제|주문|접수|신청|문의|상담)\s*(하기|완료|취소|변경|확인|불가|가능|안내|센터|전화)/,
        /고객\s*(행복)?\s*센터|서비스\s*센터|AS\s*센터/,
        /(가격순|인기순|평점순|거리순|최신순|추천순)/,
        /자세한\s*(내용|사항|정보)?\s*(보기|확인|문의)/,
        // [v33.5] Improved address skip: only skip if it's a pure numeric address without business-like context
        // Ensure we don't block names like '종로 3가' by requiring more specific address markers for pure-address rejection
        /^\d+([-~]\d+)?(번지|호)?$/ 
    ];

    // ============================================================
    // 일본어(JP) 동적 패턴
    // ============================================================
    const JP_PATTERNS = [
        /.+(駅|停留所|ターミナル)\s*(から)?\s*(徒歩|歩いて|車で|バスで)\s*\d+\s*(分|m|メートル|km)/,
        /.+駅\s*\d*\s*(番)?\s*(出口|改札)/,
        /(徒歩|車|バス|電車|タクシー)\s*(約|で)?\s*\d+\s*(分|時間)/,
        /地下鉄\s*.+線/,
        /(チェック인|チェック아웃)\s*(時間|可能|完了|の?\s*ご?\s*案内)?/,
        /\d+泊\s*\d+日/,
        /(朝食|夕食|昼食)\s*(付き|込み|別|あり|なし|ビュッフェ)/,
        /(お部屋|客室|ルーム)\s*(タイプ|選択|情報|案内|空き)/,
        /.+\s*(プレゼント|進呈|贈呈|サービス|無料|無制限|おかわり自由)/,
        /.+\s*(イベント|キャンペーン|割引|特典|プロモーション)/,
        /(初回|新規|会員|メンバー)\s*(限定|特典|割引|価格|登録)/,
        /(予約|決済|注文|申込|申し込み)\s*(する|完了|取消|변경|확인|불가|가능)/,
        /(価格|人気|評価|距離|新着|おすすめ|レビュー|割引)\s*(順|の?\s*高い順|の?\s*安い順)/,
        /(すべて|全て|全部)\s*(表示|選択|解除|リセット)/,
        /.+(都|道|府|県).+(市|区|町|村).+\d+/,
        /\d+-?\d*-?\d*\s*(丁目|番地|号|階)/,
        /(詳しい|詳細な?)\s*(情報|内容|こと)?\s*(を?\s*見る|はこちら)/,
        /もっと\s*(詳しく|見る|読む)/,
        /(利用|営業|運営)\s*(時間|案内|規約|条件)/,
        /読み込み(中|完了)|処理(中|完了)|送信(中|完了)/,

        // === [v12.0] Advanced Verb & Particle Patterns ===
        /[ぁ-ゔ]{2,}(る|す|た|て|ない|ます|です|だ|だろ|でしょ)$/,
        /[一-龠ぁ-ゔ]{1,}(する|した|してる|しあう|させる|される)$/,
        /.+(し|して|した|する|れた|れる|みた|みる|いた|いる|きた|くる)の?$/,
        /^[はがをにへともで]/,
        /.+[は가을를에에와로부터까지보다의도나나네요나조제]$/, // Fallback for mixed chars
        /.+[はがをにへともで]$/,
        /.+(な|の|に)なる.?$/,
        /.+(して|な)ので.?$/,
        /.+が(できる|あります).?$/,
        /.+(な|の)一環$/,
        /.+(な|の)要因$/,
        /.+(な|の)影響$/,
        /.+と関(する|わる).?$/,
        /^[ぁ-ゔ]+$/,
        /^[ァ-ヶー]{1,3}$/,
        /(どうぞ|ください|します|でした|でしたら|ござい|あります|います)$/,

        // === [v16.0] Strict Filtering: Verb Endings, Adjectives ===
        // [v29.1] REMOVED: /[0-9０-９\d]/ was blocking ALL strings with digits, including valid business names
        // Numbers are handled separately by the number-specific patterns above 
        /[一-龠ぁ-ゔ]{1,}[い]$/, // Exclude Japanese 'i-adjectives' at the end
        /^([一-龠ぁ-ゔァ-ヶー]{2,}[\s　・]{1,}){4,}/, // 5+ Japanese word segments (likely sentences, not names)
        /^[ぁ-ゔ]{1,2}$/, // Exclude very short hiragana
        /(利用|可能|完備|可能|その他|など)$/,
        /(安い|美味しい|美しい|便利な|高い|広い|狭い|新しい|古い)$/, // Common adjectives

        // [v18.0] Japanese Noise Patterns (RELAXED to not block business names with location prefixes)
        /^[一-龠]{1,2}(都|道|府|県|市|区|町|村)$/, // Pure location names only (no business suffix)
        /^[ぁ-ゔァ-ヶー\s]+(の|について|とは|でした|입니다)$/, // Fragment phrases
        /(お問い合わせ|ログイン|マイページ|カート|掲示板|ニュース|イベント|採用情報)/, // UI noise
        /(一覧|詳細|こちら|クリック|確認|予定|状況|結果|정보|검색)/
    ];

    // ============================================================
    // 영어(EN) 동적 패턴
    // ============================================================
    const EN_PATTERNS = [
        // [v67.1] Comprehensive UI/Nav Button & Phrase Detection
        /^(Explore|Discover|Learn|Find|Search|Request|Start|Book|Order|Buy|Subscribe|Sign up|Sign in|Log in|Log out|Visit|Get|Read|View|See|Meet|Join|Follow|Stay|Our|How|Why|What|Who)\b/i,
        /^(View|Visit|Read|See|Meet|Join|Explore|Discover|Check|Check out|Find|Get|Request|Start|Book|Order|Buy|Subscribe)\b\s(Our|More|All|Lastest|New|Now)\b/i,
        /\b(Terms & Conditions|Terms of Service|Privacy Policy|Cookie Policy|Cookie Settings|All Rights Reserved|Copyright|Sitemap|Site Map|Knowledge Base|Help Center|Support Team|Customer Service|Client Testimonials|Case Studies|Our Story|Who we are|How it works|Why choose us|Get in touch|Visit our|Read our|View our|See our|Meet the|Meet our|Join our|Join us|Follow us|Stay connected|Stay tuned)\b/i,
        /\b(Menu|Navigation|Sidebar|Footer|Header|Dashboard|Portfolio|Services|Products|Features|Solutions|Pricing|Blog|News|Events|Careers|Careers?|Jobs?|Apply Now|Apply Today)\b/i,
        /\b(Cart|Checkout|Basket|Shop|Store|Profile|Account|Settings|Preferences|Notifications|Messages|Inbox|Logout|Sign out)\b/i,
        // [v65.0] Symbol check for clearly non-business characters (keep / for 24/7 patterns)
        /[!@#$^()_+={}\[\]\;"<>?\\~`]/
    ];

    // ============================================================
    // 중국어(ZH) 동적 패턴
    // ============================================================
    const ZH_PATTERNS = [
        /.+(站|车站|地铁站|航站楼)\s*(步行|走路|开车|打车|公交)\s*\d+\s*(分钟|米|公里)/,
        /(步行|开车|公交|地铁)\s*(约|大约)?\s*\d+\s*(分钟|小时|米|公里)/,
        /(入住|退房|办理)\s*(时间|手续|登记)?/,
        /.+\s*(赠送|免费|无限|畅享|优惠|折扣|特价|满减)/,
        /(预订|下单|结算|支付|购买)\s*(成功|失败|取消|确认|完成)/,
        /(查看|了解)\s*(更多|详情|全部)/,
        /.+(省|市|区|县|镇|村|街|路|巷|弄)\s*\d+号?/
    ];

    // ============================================================
    // 언어 감지 및 패턴 적용
    // [v29.1] Fixed: Only apply language-specific patterns when the text is PRIMARILY in that language.
    // This prevents JP digit filters from blocking English business names like "A-1 Plumbing".
    // ============================================================
    const hasKo = /[가-힣]/.test(t);
    const hasJp = /[ぁ-ヴァ-ヶ]/.test(t) || (/[一-龠]/.test(t) && /[ぁ-ヴァ-ヶー]/.test(t));
    const hasZh = /[\u4e00-\u9fff]/.test(t) && !hasJp;
    const hasEn = /[a-zA-Z]/.test(t);
    
    // Count character classes to determine primary language
    const koChars = (t.match(/[가-힣]/g) || []).length;
    const jpChars = (t.match(/[ぁ-ヴァ-ヶー一-龠]/g) || []).length;
    const enChars = (t.match(/[a-zA-Z]/g) || []).length;
    const totalChars = t.replace(/[\s\d\-.,;:!?'"()]/g, '').length || 1;
    
    if (hasKo && koChars / totalChars > 0.3) {
        for (const p of KO_PATTERNS) { if (p.test(t)) return true; }
    }
    if (hasJp && jpChars / totalChars > 0.3) {
        for (const p of JP_PATTERNS) { if (p.test(t)) return true; }
    }
    if (hasZh) {
        for (const p of ZH_PATTERNS) { if (p.test(t)) return true; }
    }
    // [v29.1] EN patterns only apply when text is primarily English (>50% latin chars)
    if (hasEn && enChars / totalChars > 0.5) {
        for (const p of EN_PATTERNS) { 
            if (p.test(t)) {
                return true; 
            }
        }
    }

    return false;
}

if (typeof self !== 'undefined') {
    self.isDynamicNoise = isDynamicNoise;
}

// Node.js environment exports
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        isDynamicNoise
    };
}

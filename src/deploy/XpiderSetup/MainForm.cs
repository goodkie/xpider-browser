using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Win32;

namespace XpiderSetup
{
    public class MainForm : Form
    {
        [DllImport("user32.dll")]
        static extern int SendMessage(IntPtr hWnd, int Msg, int wParam, int lParam);
        private const int WM_NCLBUTTONDOWN = 0xA1;
        private const int HTCAPTION = 2;

        private readonly Color BG      = Color.FromArgb(13, 13, 13);
        private readonly Color ACCENT  = Color.FromArgb(0, 229, 255);
        private readonly Color ACCENT2 = Color.FromArgb(123, 97, 255);
        private readonly Color TEXT    = Color.FromArgb(210, 210, 210);
        private readonly Color DIM     = Color.FromArgb(90, 90, 90);
        private readonly Color INBG    = Color.FromArgb(28, 28, 28);
        private readonly Color BORDER  = Color.FromArgb(55, 55, 55);

        private PrivateFontCollection pfc = new PrivateFontCollection();
        private Font regFont, boldFont, titleFont, subFont;

        private Panel pnlLang, pnlMain;
        private PictureBox picLogo;
        private Label lblTitle, lblSub, lblPathLbl, lblStatus;
        private TextBox txtPath;
        private RoundedButton btnBrowse, btnExtract, btnClose, btnLangNext;
        private ComboBox cmbLang;
        private Label lblLangTitle;
        private CheckBox chkShortcut, chkToS;
        private Label lblToSLink;
        private RoundedProgressBar pbExtract;

        private string currentLang = "en";

        private Dictionary<string, string> langCodes = new Dictionary<string, string>
        {
            {"English", "en"}, {"한국어", "ko"}, {"日本語", "ja"}, {"中文 (简体)", "zh"},
            {"Español", "es"}, {"Français", "fr"}, {"Deutsch", "de"}, {"Русский", "ru"},
            {"Português", "pt"}, {"العربية", "ar"}, {"हिन्दी", "hi"}, {"Italiano", "it"}
        };

        private Dictionary<string, Dictionary<string, string>> i18n = new Dictionary<string, Dictionary<string, string>>
        {
            { "en", new Dictionary<string, string> {
                {"setupTitle", "PORTABLE EDITION  -  SETUP"}, {"langSelect", "Select Language"}, {"next", "Next"},
                {"extractPath", "Extract to folder path:"}, {"browse", "Browse"}, {"createShortcut", "Create desktop shortcut"},
                {"agreeTos", "I agree to the "}, {"tosLink", "Terms of Service"}, {"verifyPath", "Verify the path, agree to ToS, and click Extract."},
                {"extractBtn", "Extract"}, {"pathEmpty", "Please specify a folder path."}, {"creatingShortcut", "Creating shortcut..."},
                {"done", "Done!"}, {"launch", "Launch XPIDER Browser"}, {"error", "Error: "}, {"retry", "Retry"},
                {"zipNotFound", "Embedded ZIP not found."}, {"extracting", "Extracting... {0}/{1}"},
                {"folderExistsTitle", "Folder Already Exists"}, {"folderExistsPrompt", "The target folder already exists. To avoid overwriting, please enter a new folder name:"}, {"invalidFolder", "Invalid folder name. Please try again."}
            }},
            { "ko", new Dictionary<string, string> {
                {"setupTitle", "포터블 에디션  -  설치"}, {"langSelect", "언어 선택"}, {"next", "다음"},
                {"extractPath", "압축을 풀 폴더 경로:"}, {"browse", "찾아보기"}, {"createShortcut", "바탕화면 바로가기 만들기"},
                {"agreeTos", "다음에 동의합니다: "}, {"tosLink", "이용 약관"}, {"verifyPath", "경로 확인 후 약관에 동의하고 압축 해제를 누르세요."},
                {"extractBtn", "압축 해제 (Extract)"}, {"pathEmpty", "폴더 경로를 지정해주세요."}, {"creatingShortcut", "바로가기 생성 중..."},
                {"done", "설치 완료!"}, {"launch", "브라우저 실행하기 (Launch)"}, {"error", "오류: "}, {"retry", "다시 시도"},
                {"zipNotFound", "내장된 앱 압축 파일을 찾을 수 없습니다."}, {"extracting", "압축 해제 중... {0}/{1}"},
                {"folderExistsTitle", "폴더가 이미 존재함"}, {"folderExistsPrompt", "설치할 폴더가 이미 존재합니다. 덮어쓰지 않으려면 새 이름을 입력해주세요:"}, {"invalidFolder", "올바르지 않은 폴더명입니다. 다시 입력해주세요."}
            }},
            { "ja", new Dictionary<string, string> {
                {"setupTitle", "ポータブルエディション - セットアップ"}, {"langSelect", "言語を選択"}, {"next", "次へ"},
                {"extractPath", "展開先のフォルダーパス:"}, {"browse", "参照"}, {"createShortcut", "デスクトップショートカットを作成する"},
                {"agreeTos", "同意する: "}, {"tosLink", "利用規約"}, {"verifyPath", "パスを確認し、利用規約に同意して「展開」をクリックしてください。"},
                {"extractBtn", "展開 (Extract)"}, {"pathEmpty", "フォルダーパスを指定してください。"}, {"creatingShortcut", "ショートカットを作成中..."},
                {"done", "完了!"}, {"launch", "XPIDERブラウザーを起動"}, {"error", "エラー: "}, {"retry", "再試行"},
                {"zipNotFound", "埋め込みZIPが見つかりません。"}, {"extracting", "展開中... {0}/{1}"}
            }},
            { "zh", new Dictionary<string, string> {
                {"setupTitle", "便携版 - 安装"}, {"langSelect", "选择语言"}, {"next", "下一步"},
                {"extractPath", "解压到文件夹路径:"}, {"browse", "浏览"}, {"createShortcut", "创建桌面快捷方式"},
                {"agreeTos", "我同意 "}, {"tosLink", "服务条款"}, {"verifyPath", "请检查路径并同意服务条款，然后点击“解压”。"},
                {"extractBtn", "解压 (Extract)"}, {"pathEmpty", "请指定文件夹路径。"}, {"creatingShortcut", "正在创建快捷方式..."},
                {"done", "完成!"}, {"launch", "启动 XPIDER 浏览器"}, {"error", "错误: "}, {"retry", "重试"},
                {"zipNotFound", "未找到内置的ZIP文件。"}, {"extracting", "解压中... {0}/{1}"}
            }},
            { "es", new Dictionary<string, string> {
                {"setupTitle", "EDICIÓN PORTÁTIL - CONFIGURACIÓN"}, {"langSelect", "Seleccionar idioma"}, {"next", "Siguiente"},
                {"extractPath", "Extraer a la ruta de la carpeta:"}, {"browse", "Examinar"}, {"createShortcut", "Crear acceso directo"},
                {"agreeTos", "Acepto los "}, {"tosLink", "Términos de servicio"}, {"verifyPath", "Verifique la ruta, acepte los términos y haga clic en Extraer."},
                {"extractBtn", "Extraer"}, {"pathEmpty", "Especifique una ruta de carpeta."}, {"creatingShortcut", "Creando acceso directo..."},
                {"done", "¡Hecho!"}, {"launch", "Iniciar XPIDER Browser"}, {"error", "Error: "}, {"retry", "Reintentar"},
                {"zipNotFound", "ZIP incrustado no encontrado."}, {"extracting", "Extrayendo... {0}/{1}"}
            }},
            { "fr", new Dictionary<string, string> {
                {"setupTitle", "ÉDITION PORTABLE - INSTALLATION"}, {"langSelect", "Choisir la langue"}, {"next", "Suivant"},
                {"extractPath", "Extraire vers le dossier :"}, {"browse", "Parcourir"}, {"createShortcut", "Créer un raccourci bureau"},
                {"agreeTos", "J'accepte les "}, {"tosLink", "Conditions de service"}, {"verifyPath", "Vérifiez le chemin, acceptez les conditions et cliquez sur Extraire."},
                {"extractBtn", "Extraire"}, {"pathEmpty", "Veuillez spécifier un dossier."}, {"creatingShortcut", "Création du raccourci..."},
                {"done", "Terminé !"}, {"launch", "Lancer XPIDER Browser"}, {"error", "Erreur : "}, {"retry", "Réessayer"},
                {"zipNotFound", "ZIP intégré introuvable."}, {"extracting", "Extraction... {0}/{1}"}
            }},
            { "de", new Dictionary<string, string> {
                {"setupTitle", "PORTABLE EDITION - SETUP"}, {"langSelect", "Sprache wählen"}, {"next", "Weiter"},
                {"extractPath", "In Ordner entpacken:"}, {"browse", "Durchsuchen"}, {"createShortcut", "Desktop-Verknüpfung erstellen"},
                {"agreeTos", "Ich stimme den "}, {"tosLink", "Nutzungsbedingungen"}, {"verifyPath", "Pfad prüfen, Bedingungen zustimmen und auf Entpacken klicken."},
                {"extractBtn", "Entpacken"}, {"pathEmpty", "Bitte Ordnerpfad angeben."}, {"creatingShortcut", "Verknüpfung wird erstellt..."},
                {"done", "Fertig!"}, {"launch", "XPIDER Browser starten"}, {"error", "Fehler: "}, {"retry", "Wiederholen"},
                {"zipNotFound", "Eingebettetes ZIP nicht gefunden."}, {"extracting", "Entpacken... {0}/{1}"}
            }},
            { "ru", new Dictionary<string, string> {
                {"setupTitle", "ПОРТАТИВНАЯ ВЕРСИЯ - УСТАНОВКА"}, {"langSelect", "Выберите язык"}, {"next", "Далее"},
                {"extractPath", "Извлечь в папку:"}, {"browse", "Обзор"}, {"createShortcut", "Создать ярлык"},
                {"agreeTos", "Я согласен с "}, {"tosLink", "Условиями обслуживания"}, {"verifyPath", "Проверьте путь, примите условия и нажмите Извлечь."},
                {"extractBtn", "Извлечь"}, {"pathEmpty", "Укажите путь к папке."}, {"creatingShortcut", "Создание ярлыка..."},
                {"done", "Готово!"}, {"launch", "Запустить XPIDER Browser"}, {"error", "Ошибка: "}, {"retry", "Повторить"},
                {"zipNotFound", "Встроенный ZIP не найден."}, {"extracting", "Извлечение... {0}/{1}"}
            }},
            { "pt", new Dictionary<string, string> {
                {"setupTitle", "EDIÇÃO PORTÁTIL - CONFIGURAÇÃO"}, {"langSelect", "Selecionar Idioma"}, {"next", "Próximo"},
                {"extractPath", "Extrair para a pasta:"}, {"browse", "Procurar"}, {"createShortcut", "Criar atalho no desktop"},
                {"agreeTos", "Concordo com os "}, {"tosLink", "Termos de Serviço"}, {"verifyPath", "Verifique o caminho, aceite os termos e clique em Extrair."},
                {"extractBtn", "Extrair"}, {"pathEmpty", "Especifique o caminho da pasta."}, {"creatingShortcut", "Criando atalho..."},
                {"done", "Concluído!"}, {"launch", "Iniciar XPIDER Browser"}, {"error", "Erro: "}, {"retry", "Tentar novamente"},
                {"zipNotFound", "ZIP incorporado não encontrado."}, {"extracting", "Extraindo... {0}/{1}"}
            }},
            { "ar", new Dictionary<string, string> {
                {"setupTitle", "النسخة المحمولة - الإعداد"}, {"langSelect", "اختر اللغة"}, {"next", "التالي"},
                {"extractPath", "استخراج إلى المجلد:"}, {"browse", "تصفح"}, {"createShortcut", "إنشاء اختصار على سطح المكتب"},
                {"agreeTos", "أوافق على "}, {"tosLink", "شروط الخدمة"}, {"verifyPath", "تحقق من المسار، وافق على الشروط، واضغط على استخراج."},
                {"extractBtn", "استخراج"}, {"pathEmpty", "يرجى تحديد مسار المجلد."}, {"creatingShortcut", "جاري إنشاء اختصار..."},
                {"done", "تم!"}, {"launch", "تشغيل XPIDER Browser"}, {"error", "خطأ: "}, {"retry", "إعادة المحاولة"},
                {"zipNotFound", "لم يتم العثور على ملف ZIP المدمج."}, {"extracting", "جاري الاستخراج... {0}/{1}"}
            }},
            { "hi", new Dictionary<string, string> {
                {"setupTitle", "पोर्टेबल संस्करण - सेटअप"}, {"langSelect", "भाषा चुनें"}, {"next", "अगला"},
                {"extractPath", "फ़ोल्डर पथ में निकालें:"}, {"browse", "ब्राउज़"}, {"createShortcut", "डेस्कटॉप शॉर्टकट बनाएं"},
                {"agreeTos", "मैं सहमत हूँ "}, {"tosLink", "सेवा की शर्तों"}, {"verifyPath", "पथ सत्यापित करें, शर्तों से सहमत हों, और निकालें पर क्लिक करें।"},
                {"extractBtn", "निकालें"}, {"pathEmpty", "कृपया फ़ोल्डर पथ निर्दिष्ट करें।"}, {"creatingShortcut", "शॉर्टकट बना रहा है..."},
                {"done", "हो गया!"}, {"launch", "XPIDER Browser लॉन्च करें"}, {"error", "त्रुटि: "}, {"retry", "पुनः प्रयास करें"},
                {"zipNotFound", "एम्बेडेड ZIP नहीं मिला।"}, {"extracting", "निकाल रहा है... {0}/{1}"}
            }},
            { "it", new Dictionary<string, string> {
                {"setupTitle", "EDIZIONE PORTATILE - SETUP"}, {"langSelect", "Seleziona la lingua"}, {"next", "Avanti"},
                {"extractPath", "Estrai nella cartella:"}, {"browse", "Sfoglia"}, {"createShortcut", "Crea scorciatoia sul desktop"},
                {"agreeTos", "Accetto i "}, {"tosLink", "Termini di Servizio"}, {"verifyPath", "Verifica il percorso, accetta i termini e clicca Estrai."},
                {"extractBtn", "Estrai"}, {"pathEmpty", "Specifica il percorso della cartella."}, {"creatingShortcut", "Creazione scorciatoia..."},
                {"done", "Fatto!"}, {"launch", "Avvia XPIDER Browser"}, {"error", "Errore: "}, {"retry", "Riprova"},
                {"zipNotFound", "ZIP incorporato non trovato."}, {"extracting", "Estrazione... {0}/{1}"}
            }}
        };

        public MainForm()
        {
            LoadFonts();

            this.Text            = "XPIDER Browser Setup";
            this.Size            = new Size(560, 420);
            this.FormBorderStyle = FormBorderStyle.None;
            this.StartPosition   = FormStartPosition.CenterScreen;
            this.BackColor       = BG;
            this.DoubleBuffered  = true;
            this.Region = new Region(GetRoundedPath(new Rectangle(0, 0, Width, Height), 20));

            // Global Close Button
            btnClose = new RoundedButton { Text = "X", Location = new Point(Width - 42, 10), Size = new Size(32, 32) };
            btnClose.Font      = new Font(boldFont.FontFamily, 11f);
            btnClose.ForeColor = DIM;
            btnClose.BackColor = Color.Transparent;
            btnClose.HoverBackColor = Color.FromArgb(40, 40, 40);
            btnClose.HoverForeColor = Color.White;
            btnClose.Radius = 16;
            btnClose.Click      += (s, e) => Application.Exit();
            this.Controls.Add(btnClose);

            // Header (Shared)
            picLogo  = new PictureBox { Size = new Size(62, 62), Location = new Point(28, 24), SizeMode = PictureBoxSizeMode.Zoom, BackColor = Color.Transparent };
            lblTitle = new Label { Text = "XPIDER", Location = new Point(100, 28), AutoSize = true, Font = titleFont, ForeColor = ACCENT };
            lblSub   = new Label { Location = new Point(102, 67), AutoSize = true, Font = subFont, ForeColor = ACCENT2 };
            this.Controls.AddRange(new Control[] { picLogo, lblTitle, lblSub });

            LoadLogo();

            InitLangPanel();
            InitMainPanel();

            foreach (Control c in new Control[] { this, lblTitle, lblSub, picLogo, pnlLang, pnlMain })
                c.MouseDown += Form_MouseDown;

            ApplyLanguage("en"); // Default
        }

        private void InitLangPanel()
        {
            pnlLang = new Panel { Location = new Point(28, 110), Size = new Size(510, 280), BackColor = Color.Transparent };
            
            lblLangTitle = new Label { Location = new Point(0, 30), AutoSize = true, Font = new Font(regFont.FontFamily, 12f), ForeColor = TEXT };
            
            cmbLang = new ComboBox { Location = new Point(0, 65), Size = new Size(400, 35), DropDownStyle = ComboBoxStyle.DropDownList, Font = new Font(regFont.FontFamily, 12f), BackColor = INBG, ForeColor = TEXT, FlatStyle = FlatStyle.Flat };
            foreach (var key in langCodes.Keys) cmbLang.Items.Add(key);
            cmbLang.SelectedIndex = 0;

            btnLangNext = new RoundedButton { Location = new Point(0, 200), Size = new Size(510, 52), Radius = 12 };
            btnLangNext.Font = new Font(boldFont.FontFamily, 13f);
            btnLangNext.BackColor = ACCENT;
            btnLangNext.ForeColor = Color.Black;
            btnLangNext.HoverBackColor = ACCENT2;
            btnLangNext.HoverForeColor = Color.White;
            btnLangNext.Click += (s, e) => {
                string selectedName = cmbLang.SelectedItem.ToString();
                currentLang = langCodes[selectedName];
                ApplyLanguage(currentLang);
                pnlLang.Visible = false;
                pnlMain.Visible = true;
            };

            pnlLang.Controls.AddRange(new Control[] { lblLangTitle, cmbLang, btnLangNext });
            this.Controls.Add(pnlLang);
        }

        private void InitMainPanel()
        {
            pnlMain = new Panel { Location = new Point(28, 110), Size = new Size(510, 280), BackColor = Color.Transparent, Visible = false };

            lblPathLbl = new Label { Location = new Point(0, 0), AutoSize = true, Font = regFont, ForeColor = DIM };
            txtPath    = new TextBox { Location = new Point(8, 26), Size = new Size(400, 32), BackColor = INBG, ForeColor = TEXT, BorderStyle = BorderStyle.None, Font = new Font(regFont.FontFamily, 10f) };
            txtPath.Text = System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "XPIDER Browser");

            btnBrowse  = new RoundedButton { Location = new Point(427, 19), Size = new Size(80, 36), Radius = 8 };
            btnBrowse.Font = new Font(regFont.FontFamily, 9f);
            btnBrowse.BackColor = INBG;
            btnBrowse.ForeColor = TEXT;
            btnBrowse.HoverBackColor = Color.FromArgb(45, 45, 45);
            btnBrowse.HoverForeColor = Color.White;
            btnBrowse.Click += BtnBrowse_Click;

            chkShortcut = new CheckBox { Location = new Point(0, 70), AutoSize = true, Checked = true, ForeColor = TEXT, Font = new Font(regFont.FontFamily, 10f), BackColor = Color.Transparent, Cursor = Cursors.Hand };
            
            chkToS = new CheckBox { Location = new Point(0, 95), AutoSize = true, Checked = false, ForeColor = TEXT, Font = new Font(regFont.FontFamily, 8.5f), BackColor = Color.Transparent, Cursor = Cursors.Hand };
            chkToS.CheckedChanged += (s, e) => btnExtract.Enabled = chkToS.Checked;

            lblToSLink = new Label { Location = new Point(130, 97), AutoSize = true, Font = new Font(regFont.FontFamily, 8.5f, FontStyle.Underline), ForeColor = ACCENT, Cursor = Cursors.Hand };
            lblToSLink.Click += (s, e) => LaunchChromeAppMode($"https://goodkie.github.io/xpider-browser/landing/tos.html?lang={currentLang}");

            lblStatus = new Label { Location = new Point(0, 140), Size = new Size(510, 18), Font = regFont, ForeColor = DIM };
            pbExtract = new RoundedProgressBar { Location = new Point(0, 164), Size = new Size(510, 8), Maximum = 100, Value = 0, BarColor = ACCENT, BackColor = Color.FromArgb(30, 30, 30), Radius = 4 };

            btnExtract = new RoundedButton { Location = new Point(0, 189), Size = new Size(510, 52), Radius = 12, Enabled = false };
            btnExtract.Font = new Font(boldFont.FontFamily, 13f);
            btnExtract.BackColor = ACCENT;
            btnExtract.ForeColor = Color.Black;
            btnExtract.HoverBackColor = ACCENT2;
            btnExtract.HoverForeColor = Color.White;
            btnExtract.Click += BtnExtract_Click;

            pnlMain.Controls.AddRange(new Control[] { lblPathLbl, txtPath, btnBrowse, chkShortcut, chkToS, lblToSLink, lblStatus, pbExtract, btnExtract });
            this.Controls.Add(pnlMain);
        }

        private void ApplyLanguage(string lang)
        {
            var dict = i18n[lang];
            lblSub.Text = dict["setupTitle"];
            lblLangTitle.Text = dict["langSelect"];
            btnLangNext.Text = dict["next"];
            
            lblPathLbl.Text = dict["extractPath"];
            btnBrowse.Text = dict["browse"];
            chkShortcut.Text = dict["createShortcut"];
            chkToS.Text = dict["agreeTos"];
            
            // 먼저 텍스트를 설정해야 AutoSize 너비가 정확히 측정됨
            lblToSLink.Text = dict["tosLink"];

            // Adjust Link location: CheckBox 아이콘(~20px) + 도우삼 텍스트 너비
            int checkGlyphWidth = 20;
            Size measured = TextRenderer.MeasureText(chkToS.Text, chkToS.Font);
            int linkX = chkToS.Left + checkGlyphWidth + measured.Width;
            if (linkX + lblToSLink.PreferredWidth + 10 > pnlMain.Width) {
                lblToSLink.Location = new Point(chkToS.Left + 25, chkToS.Top + 22);
            } else {
                lblToSLink.Location = new Point(linkX, chkToS.Top + 1);
            }

            lblStatus.Text = dict["verifyPath"];
            btnExtract.Text = dict["extractBtn"];
        }

        private string GetStr(string key)
        {
            if (i18n.ContainsKey(currentLang) && i18n[currentLang].ContainsKey(key))
                return i18n[currentLang][key];
            if (i18n["en"].ContainsKey(key))
                return i18n["en"][key];
            return "";
        }

        private void LaunchChromeAppMode(string url)
        {
            try
            {
                string chromePath = (string)Registry.GetValue(@"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe", "", null);
                if (string.IsNullOrEmpty(chromePath))
                    chromePath = (string)Registry.GetValue(@"HKEY_CURRENT_USER\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe", "", null);

                if (!string.IsNullOrEmpty(chromePath) && File.Exists(chromePath))
                    Process.Start(new ProcessStartInfo { FileName = chromePath, Arguments = $"--app=\"{url}\"" });
                else
                    Process.Start(url);
            }
            catch { try { Process.Start(url); } catch { } }
        }

        private void LoadFonts()
        {
            regFont = new Font("Segoe UI", 9f);
            boldFont = new Font("Segoe UI", 9f, FontStyle.Bold);
            titleFont = new Font("Segoe UI", 26f, FontStyle.Bold);
            subFont = new Font("Segoe UI", 8f);

            try
            {
                var asm = Assembly.GetExecutingAssembly();
                string[] names = asm.GetManifestResourceNames();
                string regRes = null, boldRes = null;
                foreach (var n in names)
                {
                    if (n.EndsWith("Poppins-Regular.ttf", StringComparison.OrdinalIgnoreCase)) regRes = n;
                    if (n.EndsWith("Poppins-Bold.ttf", StringComparison.OrdinalIgnoreCase)) boldRes = n;
                }

                if (regRes != null) LoadFontFromResource(asm, regRes);
                if (boldRes != null) LoadFontFromResource(asm, boldRes);

                if (pfc.Families.Length > 0)
                {
                    FontFamily fam = pfc.Families[0];
                    regFont = new Font(fam, 9f);
                    boldFont = new Font(fam, 9f, FontStyle.Bold);
                    titleFont = new Font(fam, 26f, FontStyle.Bold);
                    subFont = new Font(fam, 8f);
                }
            }
            catch { }
        }

        private void LoadFontFromResource(Assembly asm, string resName)
        {
            using (Stream s = asm.GetManifestResourceStream(resName))
            {
                byte[] data = new byte[s.Length];
                s.Read(data, 0, (int)s.Length);
                IntPtr ptr = Marshal.AllocCoTaskMem(data.Length);
                Marshal.Copy(data, 0, ptr, data.Length);
                pfc.AddMemoryFont(ptr, data.Length);
                Marshal.FreeCoTaskMem(ptr);
            }
        }

        public static GraphicsPath GetRoundedPath(Rectangle rect, int radius)
        {
            GraphicsPath path = new GraphicsPath();
            if (radius <= 0) { path.AddRectangle(rect); return path; }
            int d = radius * 2;
            path.AddArc(rect.X, rect.Y, d, d, 180, 90);
            path.AddArc(rect.Right - d, rect.Y, d, d, 270, 90);
            path.AddArc(rect.Right - d, rect.Bottom - d, d, d, 0, 90);
            path.AddArc(rect.X, rect.Bottom - d, d, d, 90, 90);
            path.CloseFigure();
            return path;
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            base.OnPaint(e);
            var g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;

            using (var path = GetRoundedPath(new Rectangle(0, 0, Width, Height), 20))
            {
                g.SetClip(path);
                using (var br = new LinearGradientBrush(new Rectangle(0, 0, Width, 4), Color.FromArgb(60, 0, 229, 255), Color.FromArgb(60, 123, 97, 255), 0f))
                    g.FillRectangle(br, 0, 0, Width, 4);
                g.ResetClip();
            }

            using (var p = new Pen(Color.FromArgb(40, 40, 40), 2))
                g.DrawPath(p, GetRoundedPath(new Rectangle(1, 1, Width - 3, Height - 3), 19));

            if (pnlMain.Visible)
            {
                using (var p = new Pen(BORDER, 1))
                using (var path = GetRoundedPath(new Rectangle(pnlMain.Left + txtPath.Left - 8, pnlMain.Top + txtPath.Top - 8, txtPath.Width + 16, txtPath.Height + 16), 8))
                {
                    g.FillPath(new SolidBrush(INBG), path);
                    g.DrawPath(p, path);
                }
            }
        }

        private void Form_MouseDown(object sender, MouseEventArgs e)
        {
            if (e.Button == MouseButtons.Left)
                SendMessage(Handle, WM_NCLBUTTONDOWN, HTCAPTION, 0);
        }

        private void LoadLogo()
        {
            try
            {
                var asm = Assembly.GetExecutingAssembly();
                foreach (var name in asm.GetManifestResourceNames())
                    if (name.EndsWith("logo.png", StringComparison.OrdinalIgnoreCase))
                    {
                        using (var s = asm.GetManifestResourceStream(name))
                            picLogo.Image = Image.FromStream(s);
                        break;
                    }
            }
            catch { }
        }

        private void BtnBrowse_Click(object sender, EventArgs e)
        {
            using (var dlg = new FolderBrowserDialog { ShowNewFolderButton = true })
                if (dlg.ShowDialog() == DialogResult.OK) txtPath.Text = dlg.SelectedPath;
        }

        private async void BtnExtract_Click(object sender, EventArgs e)
        {
            string dir = txtPath.Text.Trim();
            if (string.IsNullOrEmpty(dir)) { MessageBox.Show(GetStr("pathEmpty"), "XPIDER Setup", MessageBoxButtons.OK, MessageBoxIcon.Warning); return; }

            if (Directory.Exists(dir) && Directory.GetFileSystemEntries(dir).Length > 0)
            {
                int counter = 2;
                string baseDir = dir;
                string suggestedName = Path.GetFileName(baseDir) + "-" + counter;
                string parentDir = Path.GetDirectoryName(baseDir);
                if (string.IsNullOrEmpty(parentDir)) parentDir = AppDomain.CurrentDomain.BaseDirectory;
                string suggestedPath = Path.Combine(parentDir, suggestedName);
                while (Directory.Exists(suggestedPath) && Directory.GetFileSystemEntries(suggestedPath).Length > 0)
                {
                    counter++;
                    suggestedName = Path.GetFileName(baseDir) + "-" + counter;
                    suggestedPath = Path.Combine(parentDir, suggestedName);
                }

                using (var dlg = new PromptDialog(GetStr("folderExistsTitle"), GetStr("folderExistsPrompt"), suggestedName, regFont, boldFont))
                {
                    if (dlg.ShowDialog(this) == DialogResult.OK)
                    {
                        string enteredName = dlg.InputText;
                        if (string.IsNullOrEmpty(enteredName) || enteredName.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0)
                        {
                            MessageBox.Show(GetStr("invalidFolder"), "XPIDER Setup", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                            return;
                        }
                        dir = Path.Combine(parentDir, enteredName);
                        this.Invoke((Action)(() => txtPath.Text = dir));
                    }
                    else
                    {
                        return;
                    }
                }
            }

            bool shortcut = chkShortcut.Checked;
            btnExtract.Enabled = false; btnExtract.BackColor = Color.FromArgb(40,40,40); btnExtract.ForeColor = Color.FromArgb(80,80,80);
            txtPath.Enabled = false; btnBrowse.Enabled = false; chkShortcut.Enabled = false; chkToS.Enabled = false;

            try
            {
                await Task.Run(() => ExtractZip(dir, (pct, msg) =>
                    this.Invoke((Action)(() => { pbExtract.Value = pct; lblStatus.Text = msg; }))));

                if (shortcut) { Invoke((Action)(() => lblStatus.Text = GetStr("creatingShortcut"))); CreateShortcut(dir); }

                this.Invoke((Action)(() =>
                {
                    pbExtract.Value  = 100;
                    lblStatus.Text   = GetStr("done");
                    lblStatus.ForeColor = ACCENT;
                    btnExtract.Text      = GetStr("launch");
                    btnExtract.BackColor = ACCENT2;
                    btnExtract.ForeColor = Color.White;
                    btnExtract.HoverBackColor = ACCENT;
                    btnExtract.HoverForeColor = Color.Black;
                    btnExtract.Enabled   = true;
                    btnExtract.Click    -= BtnExtract_Click;
                    btnExtract.Click    += (s2, e2) =>
                    {
                        var exes = Directory.GetFiles(dir, "XPIDERBrowser.exe", SearchOption.AllDirectories);
                        if (exes.Length > 0) System.Diagnostics.Process.Start(exes[0]);
                        Application.Exit();
                    };
                }));
            }
            catch (Exception ex)
            {
                this.Invoke((Action)(() =>
                {
                    lblStatus.Text      = GetStr("error") + ex.Message;
                    lblStatus.ForeColor = Color.FromArgb(255, 80, 80);
                    btnExtract.Text     = GetStr("retry");
                    btnExtract.BackColor = Color.FromArgb(100, 0, 0);
                    btnExtract.ForeColor = Color.White;
                    btnExtract.HoverBackColor = Color.FromArgb(150, 0, 0);
                    btnExtract.Enabled   = true;
                    txtPath.Enabled = true; btnBrowse.Enabled = true; chkShortcut.Enabled = true; chkToS.Enabled = true;
                }));
            }
        }

        private void ExtractZip(string dest, Action<int, string> report)
        {
            var asm = Assembly.GetExecutingAssembly();
            string resName = null;
            foreach (var n in asm.GetManifestResourceNames())
                if (n.EndsWith("app.zip", StringComparison.OrdinalIgnoreCase)) { resName = n; break; }
            if (resName == null) throw new Exception(GetStr("zipNotFound"));

            using (var stream = asm.GetManifestResourceStream(resName))
            using (var zip = new ZipArchive(stream, ZipArchiveMode.Read))
            {
                int total = zip.Entries.Count, cur = 0;
                Directory.CreateDirectory(dest);
                foreach (var entry in zip.Entries)
                {
                    cur++;
                    report((int)((cur / (float)total) * 100), string.Format(GetStr("extracting"), cur, total));
                    string path = Path.Combine(dest, entry.FullName.Replace('/', Path.DirectorySeparatorChar));
                    if (entry.FullName.EndsWith("/") || entry.FullName.EndsWith("\\"))
                        Directory.CreateDirectory(path);
                    else { Directory.CreateDirectory(Path.GetDirectoryName(path)); entry.ExtractToFile(path, true); }
                }
            }
        }

        private void CreateShortcut(string dir)
        {
            try
            {
                var exes = Directory.GetFiles(dir, "XPIDERBrowser.exe", SearchOption.AllDirectories);
                if (exes.Length == 0) return;
                string exePath = exes[0];
                string folderName = new DirectoryInfo(dir).Name;
                string lnkPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), folderName + ".lnk");
                Type   t   = Type.GetTypeFromProgID("WScript.Shell");
                object wsh = Activator.CreateInstance(t);
                object lnk = t.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, wsh, new object[]{ lnkPath });
                Type   lt  = lnk.GetType();
                lt.InvokeMember("TargetPath",       BindingFlags.SetProperty, null, lnk, new object[]{ exePath });
                lt.InvokeMember("WorkingDirectory",  BindingFlags.SetProperty, null, lnk, new object[]{ Path.GetDirectoryName(exePath) });
                lt.InvokeMember("Description",       BindingFlags.SetProperty, null, lnk, new object[]{ folderName });
                lt.InvokeMember("Save",               BindingFlags.InvokeMethod, null, lnk, null);
            }
            catch { }
        }
    }

    public class RoundedButton : Control
    {
        public int Radius { get; set; } = 10;
        public Color HoverBackColor { get; set; } = Color.Gray;
        public Color HoverForeColor { get; set; } = Color.White;
        
        private Color originalBackColor;
        private Color originalForeColor;
        private bool isHovered = false;

        public RoundedButton()
        {
            this.SetStyle(ControlStyles.SupportsTransparentBackColor | ControlStyles.UserPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.AllPaintingInWmPaint, true);
            this.DoubleBuffered = true;
            this.Cursor = Cursors.Hand;
            this.BackColor = Color.Transparent;
        }

        protected override void OnEnabledChanged(EventArgs e)
        {
            base.OnEnabledChanged(e);
            this.Invalidate();
        }

        protected override void OnMouseEnter(EventArgs e)
        {
            base.OnMouseEnter(e);
            if (this.Enabled) {
                originalBackColor = this.BackColor;
                originalForeColor = this.ForeColor;
                this.BackColor = HoverBackColor;
                this.ForeColor = HoverForeColor;
                isHovered = true;
                this.Invalidate();
            }
        }

        protected override void OnMouseLeave(EventArgs e)
        {
            base.OnMouseLeave(e);
            if (this.Enabled && isHovered) {
                this.BackColor = originalBackColor;
                this.ForeColor = originalForeColor;
                isHovered = false;
                this.Invalidate();
            }
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            using (var path = MainForm.GetRoundedPath(new Rectangle(0, 0, Width - 1, Height - 1), Radius))
            {
                Color bg = this.Enabled ? this.BackColor : Color.FromArgb(40,40,40);
                Color fg = this.Enabled ? this.ForeColor : Color.FromArgb(100,100,100);
                using (var brush = new SolidBrush(bg))
                    e.Graphics.FillPath(brush, path);

                TextRenderer.DrawText(e.Graphics, this.Text, this.Font, new Rectangle(0, 0, Width, Height), fg, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
            }
        }
    }

    public class RoundedProgressBar : Control
    {
        public int Radius { get; set; } = 5;
        public int Maximum { get; set; } = 100;
        
        private int _value = 0;
        public int Value 
        { 
            get => _value; 
            set { _value = Math.Max(0, Math.Min(value, Maximum)); this.Invalidate(); } 
        }

        public Color BarColor { get; set; } = Color.Cyan;

        public RoundedProgressBar()
        {
            this.SetStyle(ControlStyles.SupportsTransparentBackColor | ControlStyles.UserPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.AllPaintingInWmPaint, true);
            this.DoubleBuffered = true;
            this.BackColor = Color.Transparent;
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            var rect = new Rectangle(0, 0, Width - 1, Height - 1);
            
            using (var path = MainForm.GetRoundedPath(rect, Radius))
            using (var brush = new SolidBrush(this.BackColor))
                e.Graphics.FillPath(brush, path);

            if (Value > 0)
            {
                int fillWidth = (int)((float)Value / Maximum * (Width - 1));
                if (fillWidth > 0)
                {
                    var fillRect = new Rectangle(0, 0, fillWidth, Height - 1);
                    int currentRadius = Math.Min(Radius, fillWidth / 2);
                    using (var path = MainForm.GetRoundedPath(fillRect, currentRadius))
                    using (var brush = new SolidBrush(BarColor))
                        e.Graphics.FillPath(brush, path);
                }
            }
        }
    }

    public class PromptDialog : Form
    {
        [DllImport("user32.dll")]
        static extern int SendMessage(IntPtr hWnd, int Msg, int wParam, int lParam);
        [DllImport("user32.dll")]
        static extern bool ReleaseCapture();
        private const int WM_NCLBUTTONDOWN = 0xA1;
        private const int HTCAPTION = 2;

        private readonly Color BG      = Color.FromArgb(13, 13, 13);
        private readonly Color ACCENT  = Color.FromArgb(0, 229, 255);
        private readonly Color ACCENT2 = Color.FromArgb(123, 97, 255);
        private readonly Color TEXT    = Color.FromArgb(210, 210, 210);
        private readonly Color DIM     = Color.FromArgb(90, 90, 90);
        private readonly Color INBG    = Color.FromArgb(28, 28, 28);
        private readonly Color BORDER  = Color.FromArgb(55, 55, 55);

        private Label lblTitle;
        private Label lblPrompt;
        private TextBox txtInput;
        private RoundedButton btnOk;
        private RoundedButton btnCancel;
        
        public string InputText => txtInput.Text.Trim();

        public PromptDialog(string title, string prompt, string defaultValue, Font regFont, Font boldFont)
        {
            this.Text            = title;
            this.Size            = new Size(460, 260);
            this.FormBorderStyle = FormBorderStyle.None;
            this.StartPosition   = FormStartPosition.CenterParent;
            this.BackColor       = BG;
            this.DoubleBuffered  = true;
            this.Region          = new Region(MainForm.GetRoundedPath(new Rectangle(0, 0, Width, Height), 16));

            lblTitle = new Label { Text = title.ToUpper(), Location = new Point(24, 24), Size = new Size(412, 28), Font = boldFont, ForeColor = ACCENT };
            lblPrompt = new Label { Text = prompt, Location = new Point(24, 60), Size = new Size(412, 50), Font = regFont, ForeColor = TEXT };
            
            txtInput = new TextBox { Location = new Point(32, 128), Size = new Size(396, 24), BackColor = INBG, ForeColor = TEXT, BorderStyle = BorderStyle.None, Font = new Font(regFont.FontFamily, 11f) };
            txtInput.Text = defaultValue;
            txtInput.KeyDown += (s, e) => {
                if (e.KeyCode == Keys.Enter) {
                    this.DialogResult = DialogResult.OK;
                    this.Close();
                } else if (e.KeyCode == Keys.Escape) {
                    this.DialogResult = DialogResult.Cancel;
                    this.Close();
                }
            };

            btnOk = new RoundedButton { Text = "OK", Location = new Point(24, 185), Size = new Size(200, 48), Radius = 10 };
            btnOk.Font = boldFont;
            btnOk.BackColor = ACCENT;
            btnOk.ForeColor = Color.Black;
            btnOk.HoverBackColor = ACCENT2;
            btnOk.HoverForeColor = Color.White;
            btnOk.Click += (s, e) => {
                this.DialogResult = DialogResult.OK;
                this.Close();
            };

            btnCancel = new RoundedButton { Text = "CANCEL", Location = new Point(236, 185), Size = new Size(200, 48), Radius = 10 };
            btnCancel.Font = boldFont;
            btnCancel.BackColor = INBG;
            btnCancel.ForeColor = TEXT;
            btnCancel.HoverBackColor = Color.FromArgb(45, 45, 45);
            btnCancel.HoverForeColor = Color.White;
            btnCancel.Click += (s, e) => {
                this.DialogResult = DialogResult.Cancel;
                this.Close();
            };

            this.Controls.AddRange(new Control[] { lblTitle, lblPrompt, txtInput, btnOk, btnCancel });
            
            this.MouseDown += Form_MouseDown;
            lblTitle.MouseDown += Form_MouseDown;
            lblPrompt.MouseDown += Form_MouseDown;
        }

        private void Form_MouseDown(object sender, MouseEventArgs e)
        {
            if (e.Button == MouseButtons.Left)
            {
                ReleaseCapture();
                SendMessage(Handle, WM_NCLBUTTONDOWN, HTCAPTION, 0);
            }
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            base.OnPaint(e);
            var g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;

            using (var path = MainForm.GetRoundedPath(new Rectangle(0, 0, Width, Height), 16))
            {
                g.SetClip(path);
                using (var br = new LinearGradientBrush(new Rectangle(0, 0, Width, 4), Color.FromArgb(200, 0, 229, 255), Color.FromArgb(200, 123, 97, 255), 0f))
                    g.FillRectangle(br, 0, 0, Width, 4);
                g.ResetClip();
            }

            using (var p = new Pen(Color.FromArgb(40, 40, 40), 2))
                g.DrawPath(p, MainForm.GetRoundedPath(new Rectangle(1, 1, Width - 3, Height - 3), 15));

            using (var p = new Pen(BORDER, 1))
            using (var path = MainForm.GetRoundedPath(new Rectangle(txtInput.Left - 8, txtInput.Top - 8, txtInput.Width + 16, txtInput.Height + 16), 8))
            {
                g.FillPath(new SolidBrush(INBG), path);
                g.DrawPath(p, path);
            }
        }
        
        protected override void OnShown(EventArgs e)
        {
            base.OnShown(e);
            txtInput.Focus();
            txtInput.SelectAll();
        }
    }
}

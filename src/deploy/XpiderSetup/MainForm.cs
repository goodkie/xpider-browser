using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using System.Windows.Forms;

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

        private PictureBox picLogo;
        private Label lblTitle, lblSub, lblPathLbl, lblStatus;
        private TextBox txtPath;
        private RoundedButton btnBrowse, btnExtract, btnClose;
        private CheckBox chkShortcut;
        private RoundedProgressBar pbExtract;

        public MainForm()
        {
            LoadFonts();

            this.Text            = "XPIDER Browser Setup";
            this.Size            = new Size(560, 400);
            this.FormBorderStyle = FormBorderStyle.None;
            this.StartPosition   = FormStartPosition.CenterScreen;
            this.BackColor       = BG;
            this.DoubleBuffered  = true;

            // Apply Rounded Corners to the Form
            this.Region = new Region(GetRoundedPath(new Rectangle(0, 0, Width, Height), 20));

            btnClose = new RoundedButton { Text = "X", Location = new Point(Width - 42, 10), Size = new Size(32, 32) };
            btnClose.Font      = new Font(boldFont.FontFamily, 11f);
            btnClose.ForeColor = DIM;
            btnClose.BackColor = Color.Transparent;
            btnClose.HoverBackColor = Color.FromArgb(40, 40, 40);
            btnClose.HoverForeColor = Color.White;
            btnClose.Radius = 16;
            btnClose.Click      += (s, e) => Application.Exit();

            picLogo  = new PictureBox { Size = new Size(62, 62), Location = new Point(28, 24), SizeMode = PictureBoxSizeMode.Zoom, BackColor = Color.Transparent };
            lblTitle = new Label { Text = "XPIDER", Location = new Point(100, 28), AutoSize = true, Font = titleFont, ForeColor = ACCENT };
            lblSub   = new Label { Text = "PORTABLE EDITION  -  SETUP", Location = new Point(102, 67), AutoSize = true, Font = subFont, ForeColor = ACCENT2 };

            lblPathLbl = new Label { Text = "압축을 풀 폴더 경로:", Location = new Point(28, 112), AutoSize = true, Font = regFont, ForeColor = DIM };
            txtPath    = new TextBox { Location = new Point(36, 138), Size = new Size(400, 32), BackColor = INBG, ForeColor = TEXT, BorderStyle = BorderStyle.None, Font = new Font(regFont.FontFamily, 10f) };

            btnBrowse  = new RoundedButton { Text = "찾아보기", Location = new Point(455, 130), Size = new Size(74, 32) };
            btnBrowse.Font      = new Font(regFont.FontFamily, 9f);
            btnBrowse.BackColor = INBG;
            btnBrowse.ForeColor = TEXT;
            btnBrowse.HoverBackColor = Color.FromArgb(45, 45, 45);
            btnBrowse.HoverForeColor = Color.White;
            btnBrowse.Radius = 16;
            btnBrowse.Click      += BtnBrowse_Click;

            chkShortcut = new CheckBox { Text = "바탕화면 바로가기 만들기", Location = new Point(28, 182), AutoSize = true, Checked = true, ForeColor = TEXT, Font = new Font(regFont.FontFamily, 10f), BackColor = Color.Transparent, Cursor = Cursors.Hand };

            lblStatus = new Label { Text = "경로를 확인한 후 '압축 해제'를 클릭하세요.", Location = new Point(28, 226), Size = new Size(510, 18), Font = regFont, ForeColor = DIM };
            
            pbExtract = new RoundedProgressBar { Location = new Point(28, 250), Size = new Size(510, 8), Maximum = 100, Value = 0, BarColor = ACCENT, BackColor = Color.FromArgb(30, 30, 30), Radius = 4 };

            btnExtract = new RoundedButton { Text = "압축 해제 (Extract)", Location = new Point(180, 280), Size = new Size(200, 44) };
            btnExtract.Font      = new Font(boldFont.FontFamily, 11f);
            btnExtract.BackColor = ACCENT;
            btnExtract.ForeColor = Color.Black;
            btnExtract.HoverBackColor = ACCENT2;
            btnExtract.HoverForeColor = Color.White;
            btnExtract.Radius = 22;
            btnExtract.Click      += BtnExtract_Click;

            foreach (Control c in new Control[] { lblTitle, lblSub, picLogo })
                c.MouseDown += Form_MouseDown;
            this.MouseDown += Form_MouseDown;

            this.Controls.AddRange(new Control[] { picLogo, lblTitle, lblSub, lblPathLbl, txtPath, btnBrowse, chkShortcut, lblStatus, pbExtract, btnExtract, btnClose });

            LoadLogo();
            txtPath.Text = System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "XPIDER Browser");
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

            // Gradient Top Line
            using (var path = GetRoundedPath(new Rectangle(0, 0, Width, Height), 20))
            {
                g.SetClip(path);
                using (var br = new LinearGradientBrush(new Rectangle(0, 0, Width, 4), Color.FromArgb(60, 0, 229, 255), Color.FromArgb(60, 123, 97, 255), 0f))
                    g.FillRectangle(br, 0, 0, Width, 4);
                g.ResetClip();
            }

            // Border
            using (var p = new Pen(Color.FromArgb(40, 40, 40), 2))
            {
                var rect = new Rectangle(1, 1, Width - 3, Height - 3);
                g.DrawPath(p, GetRoundedPath(rect, 19));
            }

            // Textbox Border
            using (var p = new Pen(BORDER, 1))
            using (var path = GetRoundedPath(new Rectangle(txtPath.Left - 8, txtPath.Top - 8, txtPath.Width + 16, txtPath.Height + 16), 8))
            {
                g.FillPath(new SolidBrush(INBG), path);
                g.DrawPath(p, path);
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
            if (string.IsNullOrEmpty(dir)) { MessageBox.Show("폴더 경로를 지정해주세요.", "XPIDER Setup", MessageBoxButtons.OK, MessageBoxIcon.Warning); return; }

            bool shortcut = chkShortcut.Checked;
            btnExtract.Enabled = false; btnExtract.BackColor = Color.FromArgb(40,40,40); btnExtract.ForeColor = Color.FromArgb(80,80,80);
            txtPath.Enabled = false; btnBrowse.Enabled = false; chkShortcut.Enabled = false;

            try
            {
                await Task.Run(() => ExtractZip(dir, (pct, msg) =>
                    this.Invoke((Action)(() => { pbExtract.Value = pct; lblStatus.Text = msg; }))));

                if (shortcut) { Invoke((Action)(() => lblStatus.Text = "바로가기 생성 중...")); CreateShortcut(dir); }

                this.Invoke((Action)(() =>
                {
                    pbExtract.Value  = 100;
                    lblStatus.Text   = "설치 완료!";
                    lblStatus.ForeColor = ACCENT;
                    btnExtract.Text      = "브라우저 실행하기 (Launch)";
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
                    lblStatus.Text      = "오류: " + ex.Message;
                    lblStatus.ForeColor = Color.FromArgb(255, 80, 80);
                    btnExtract.Text     = "다시 시도 (Retry)";
                    btnExtract.BackColor = Color.FromArgb(100, 0, 0);
                    btnExtract.ForeColor = Color.White;
                    btnExtract.HoverBackColor = Color.FromArgb(150, 0, 0);
                    btnExtract.Enabled   = true;
                    txtPath.Enabled = true; btnBrowse.Enabled = true; chkShortcut.Enabled = true;
                }));
            }
        }

        private void ExtractZip(string dest, Action<int, string> report)
        {
            var asm = Assembly.GetExecutingAssembly();
            string resName = null;
            foreach (var n in asm.GetManifestResourceNames())
                if (n.EndsWith("app.zip", StringComparison.OrdinalIgnoreCase)) { resName = n; break; }
            if (resName == null) throw new Exception("내장된 앱 압축 파일을 찾을 수 없습니다.");

            using (var stream = asm.GetManifestResourceStream(resName))
            using (var zip = new ZipArchive(stream, ZipArchiveMode.Read))
            {
                int total = zip.Entries.Count, cur = 0;
                Directory.CreateDirectory(dest);
                foreach (var entry in zip.Entries)
                {
                    cur++;
                    report((int)((cur / (float)total) * 100), string.Format("압축 해제 중... {0}/{1}", cur, total));
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
                string lnkPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "XPIDER Browser.lnk");
                Type   t   = Type.GetTypeFromProgID("WScript.Shell");
                object wsh = Activator.CreateInstance(t);
                object lnk = t.InvokeMember("CreateShortcut", System.Reflection.BindingFlags.InvokeMethod, null, wsh, new object[]{ lnkPath });
                Type   lt  = lnk.GetType();
                lt.InvokeMember("TargetPath",       System.Reflection.BindingFlags.SetProperty, null, lnk, new object[]{ exePath });
                lt.InvokeMember("WorkingDirectory",  System.Reflection.BindingFlags.SetProperty, null, lnk, new object[]{ Path.GetDirectoryName(exePath) });
                lt.InvokeMember("Description",       System.Reflection.BindingFlags.SetProperty, null, lnk, new object[]{ "XPIDER Browser" });
                lt.InvokeMember("Save",               System.Reflection.BindingFlags.InvokeMethod, null, lnk, null);
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
                using (var brush = new SolidBrush(this.BackColor))
                    e.Graphics.FillPath(brush, path);

                TextRenderer.DrawText(e.Graphics, this.Text, this.Font, new Rectangle(0, 0, Width, Height), this.ForeColor, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
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
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            var rect = new Rectangle(0, 0, Width - 1, Height - 1);
            
            // Draw background
            using (var path = MainForm.GetRoundedPath(rect, Radius))
            using (var brush = new SolidBrush(this.BackColor))
                e.Graphics.FillPath(brush, path);

            // Draw progress bar
            if (Value > 0)
            {
                int fillWidth = (int)((float)Value / Maximum * (Width - 1));
                if (fillWidth > 0)
                {
                    var fillRect = new Rectangle(0, 0, fillWidth, Height - 1);
                    // To prevent artifacts when width is smaller than radius*2
                    int currentRadius = Math.Min(Radius, fillWidth / 2);
                    using (var path = MainForm.GetRoundedPath(fillRect, currentRadius))
                    using (var brush = new SolidBrush(BarColor))
                        e.Graphics.FillPath(brush, path);
                }
            }
        }
    }
}

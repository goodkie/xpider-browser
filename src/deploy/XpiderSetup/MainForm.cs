using System;
using System.Drawing;
using System.Drawing.Drawing2D;
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

        private PictureBox picLogo;
        private Label lblTitle, lblSub, lblPathLbl, lblStatus;
        private TextBox txtPath;
        private Button btnBrowse, btnExtract, btnClose;
        private CheckBox chkShortcut;
        private ProgressBar pbExtract;

        public MainForm()
        {
            this.Text            = "XPIDER Browser Setup";
            this.Size            = new Size(560, 400);
            this.FormBorderStyle = FormBorderStyle.None;
            this.StartPosition   = FormStartPosition.CenterScreen;
            this.BackColor       = BG;
            this.DoubleBuffered  = true;

            btnClose = MakeBtn("X", new Point(Width - 42, 10), new Size(32, 32));
            btnClose.Font      = new Font("Segoe UI", 11f, FontStyle.Bold);
            btnClose.ForeColor = DIM;
            btnClose.BackColor = Color.Transparent;
            btnClose.FlatAppearance.BorderSize = 0;
            btnClose.Click      += (s, e) => Application.Exit();
            btnClose.MouseEnter += (s, e) => btnClose.ForeColor = Color.White;
            btnClose.MouseLeave += (s, e) => btnClose.ForeColor = DIM;

            picLogo  = new PictureBox { Size = new Size(62, 62), Location = new Point(28, 24), SizeMode = PictureBoxSizeMode.Zoom, BackColor = Color.Transparent };
            lblTitle = new Label { Text = "XPIDER", Location = new Point(100, 28), AutoSize = true, Font = new Font("Segoe UI", 26f, FontStyle.Bold), ForeColor = ACCENT };
            lblSub   = new Label { Text = "PORTABLE EDITION  -  SETUP", Location = new Point(102, 67), AutoSize = true, Font = new Font("Segoe UI", 8f), ForeColor = ACCENT2 };

            lblPathLbl = new Label { Text = "Extract to folder path:", Location = new Point(28, 112), AutoSize = true, Font = new Font("Segoe UI", 9f), ForeColor = DIM };
            txtPath    = new TextBox { Location = new Point(28, 133), Size = new Size(418, 32), BackColor = INBG, ForeColor = TEXT, BorderStyle = BorderStyle.None, Font = new Font("Segoe UI", 10f) };

            btnBrowse  = MakeBtn("Browse", new Point(455, 131), new Size(80, 36));
            btnBrowse.Font      = new Font("Segoe UI", 9f);
            btnBrowse.BackColor = INBG;
            btnBrowse.ForeColor = TEXT;
            btnBrowse.FlatAppearance.BorderColor = BORDER;
            btnBrowse.FlatAppearance.BorderSize  = 1;
            btnBrowse.Click      += BtnBrowse_Click;
            btnBrowse.MouseEnter += (s, e) => btnBrowse.BackColor = Color.FromArgb(45, 45, 45);
            btnBrowse.MouseLeave += (s, e) => btnBrowse.BackColor = INBG;

            chkShortcut = new CheckBox { Text = "Create desktop shortcut", Location = new Point(28, 182), AutoSize = true, Checked = true, ForeColor = TEXT, Font = new Font("Segoe UI", 10f), BackColor = Color.Transparent, Cursor = Cursors.Hand };

            lblStatus = new Label { Text = "Verify the path and click Extract.", Location = new Point(28, 226), Size = new Size(510, 18), Font = new Font("Segoe UI", 9f), ForeColor = DIM };
            pbExtract = new ProgressBar { Location = new Point(28, 250), Size = new Size(510, 6), Minimum = 0, Maximum = 100, ForeColor = ACCENT, BackColor = Color.FromArgb(30, 30, 30) };

            btnExtract = MakeBtn("Extract", new Point(28, 272), new Size(510, 52));
            btnExtract.Font      = new Font("Segoe UI", 13f, FontStyle.Bold);
            btnExtract.BackColor = ACCENT;
            btnExtract.ForeColor = Color.Black;
            btnExtract.FlatAppearance.BorderSize = 0;
            btnExtract.Click      += BtnExtract_Click;
            btnExtract.MouseEnter += (s, e) => { if (btnExtract.Enabled) { btnExtract.BackColor = ACCENT2; btnExtract.ForeColor = Color.White; } };
            btnExtract.MouseLeave += (s, e) => { if (btnExtract.Enabled) { btnExtract.BackColor = ACCENT; btnExtract.ForeColor = Color.Black; } };

            foreach (Control c in new Control[] { lblTitle, lblSub, picLogo })
                c.MouseDown += Form_MouseDown;
            this.MouseDown += Form_MouseDown;

            this.Controls.AddRange(new Control[] { picLogo, lblTitle, lblSub, lblPathLbl, txtPath, btnBrowse, chkShortcut, lblStatus, pbExtract, btnExtract, btnClose });

            LoadLogo();
            txtPath.Text = System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "XPIDER Browser");
        }

        private Button MakeBtn(string text, Point loc, Size sz)
        {
            return new Button { Text = text, Location = loc, Size = sz, FlatStyle = FlatStyle.Flat, Cursor = Cursors.Hand };
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            base.OnPaint(e);
            var g = e.Graphics;
            using (var br = new LinearGradientBrush(new Rectangle(0, 0, Width, 3), Color.FromArgb(60, 0, 229, 255), Color.FromArgb(60, 123, 97, 255), 0f))
                g.FillRectangle(br, 0, 0, Width, 3);
            using (var p = new Pen(Color.FromArgb(50, 50, 50), 1))
                g.DrawRectangle(p, 0, 0, Width - 1, Height - 1);
            using (var p = new Pen(Color.FromArgb(38, 38, 38), 1))
                g.DrawLine(p, 28, 104, Width - 28, 104);
            using (var p = new Pen(BORDER, 1))
                g.DrawRectangle(p, txtPath.Left - 1, txtPath.Top - 5, txtPath.Width + 2, 42);
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
            if (string.IsNullOrEmpty(dir)) { MessageBox.Show("Please specify a folder path.", "XPIDER Setup", MessageBoxButtons.OK, MessageBoxIcon.Warning); return; }

            bool shortcut = chkShortcut.Checked;
            btnExtract.Enabled = false; btnExtract.BackColor = Color.FromArgb(40,40,40); btnExtract.ForeColor = Color.FromArgb(80,80,80);
            txtPath.Enabled = false; btnBrowse.Enabled = false; chkShortcut.Enabled = false;

            try
            {
                await Task.Run(() => ExtractZip(dir, (pct, msg) =>
                    this.Invoke((Action)(() => { pbExtract.Value = pct; lblStatus.Text = msg; }))));

                if (shortcut) { Invoke((Action)(() => lblStatus.Text = "Creating shortcut...")); CreateShortcut(dir); }

                this.Invoke((Action)(() =>
                {
                    pbExtract.Value  = 100;
                    lblStatus.Text   = "Done!";
                    lblStatus.ForeColor = ACCENT;
                    btnExtract.Text      = "Launch XPIDER Browser";
                    btnExtract.BackColor = ACCENT2;
                    btnExtract.ForeColor = Color.White;
                    btnExtract.Enabled   = true;
                    btnExtract.Click    -= BtnExtract_Click;
                    btnExtract.Click    += (s2, e2) =>
                    {
                        var exes = Directory.GetFiles(dir, "XPIDErBrowser.exe", SearchOption.AllDirectories);
                        if (exes.Length > 0) System.Diagnostics.Process.Start(exes[0]);
                        Application.Exit();
                    };
                }));
            }
            catch (Exception ex)
            {
                this.Invoke((Action)(() =>
                {
                    lblStatus.Text      = "Error: " + ex.Message;
                    lblStatus.ForeColor = Color.FromArgb(255, 80, 80);
                    btnExtract.Text     = "Retry";
                    btnExtract.BackColor = Color.FromArgb(100, 0, 0);
                    btnExtract.ForeColor = Color.White;
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
            if (resName == null) throw new Exception("Embedded ZIP not found.");

            using (var stream = asm.GetManifestResourceStream(resName))
            using (var zip = new ZipArchive(stream, ZipArchiveMode.Read))
            {
                int total = zip.Entries.Count, cur = 0;
                Directory.CreateDirectory(dest);
                foreach (var entry in zip.Entries)
                {
                    cur++;
                    report((int)((cur / (float)total) * 100), string.Format("Extracting... {0}/{1}", cur, total));
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
}

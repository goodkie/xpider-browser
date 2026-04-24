using System;
using System.Windows.Forms;

namespace XpiderSetup
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            try {
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.Run(new MainForm());
            } catch (Exception ex) {
                MessageBox.Show("Fatal Error: " + ex.ToString(), "Setup Error");
            }
        }
    }
}

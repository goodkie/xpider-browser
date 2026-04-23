$ErrorActionPreference = "Stop"

# 찾을 ZIP 파일 (github actions에서 ref_name을 이용해 동적으로 이름이 변경되었을 수 있음)
$zipFile = Get-ChildItem "out\make\zip\win32\x64\*.zip" | Select-Object -First 1

if (-not $zipFile) {
    # .zip 파일이 다른 경로에 있는지 확인 (GitHub Actions 에서는 out/make/zip/win32/x64 에 먼저 만들어짐)
    $zipFile = Get-ChildItem "out\make\*.zip" -Recurse | Select-Object -First 1
}

if (-not $zipFile) {
    Write-Error "ZIP file not found."
    exit 1
}

$zipPath = $zipFile.FullName
Write-Host "Found ZIP file: $zipPath"

$exeName = $zipFile.Name.Replace(".zip", "-Setup.exe")
$exePath = Join-Path $zipFile.DirectoryName $exeName

# C# Setup 코드를 생성합니다.
$csCode = @"
using System;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Markup;
using System.Windows.Media;

namespace XpiderSetup {
    public class Program {
        [STAThread]
        public static void Main() {
            Application app = new Application();
            
            // XAML UI 정의 (사이버펑크 다크 스타일)
            string xaml = @"
<Window xmlns='http://schemas.microsoft.com/winfx/2006/xaml/presentation'
        xmlns:x='http://schemas.microsoft.com/winfx/2006/xaml'
        Title='XPIDER Portable Setup' Height='400' Width='550'
        WindowStyle='None' AllowsTransparency='True' Background='Transparent'
        WindowStartupLocation='CenterScreen'>
    <Window.Resources>
        <Style TargetType='Button'>
            <Setter Property='Background' Value='#00e5ff'/>
            <Setter Property='Foreground' Value='Black'/>
            <Setter Property='FontWeight' Value='Bold'/>
            <Setter Property='BorderThickness' Value='0'/>
            <Setter Property='Padding' Value='10'/>
            <Setter Property='Cursor' Value='Hand'/>
            <Setter Property='Template'>
                <Setter.Value>
                    <ControlTemplate TargetType='Button'>
                        <Border Background='{TemplateBinding Background}' CornerRadius='8'>
                            <ContentPresenter HorizontalAlignment='Center' VerticalAlignment='Center'/>
                        </Border>
                    </ControlTemplate>
                </Setter.Value>
            </Setter>
            <Style.Triggers>
                <Trigger Property='IsMouseOver' Value='True'>
                    <Setter Property='Background' Value='#7b61ff'/>
                    <Setter Property='Foreground' Value='White'/>
                </Trigger>
                <Trigger Property='IsEnabled' Value='False'>
                    <Setter Property='Background' Value='#333'/>
                    <Setter Property='Foreground' Value='#666'/>
                </Trigger>
            </Style.Triggers>
        </Style>
    </Window.Resources>
    
    <Border CornerRadius='20' Background='#121212' BorderBrush='#333' BorderThickness='1' MouseLeftButtonDown='DragWindow'>
        <Grid Margin='30'>
            <Grid.RowDefinitions>
                <RowDefinition Height='Auto'/>
                <RowDefinition Height='Auto'/>
                <RowDefinition Height='*'/>
                <RowDefinition Height='Auto'/>
                <RowDefinition Height='Auto'/>
            </Grid.RowDefinitions>
            
            <!-- Close Button -->
            <Button x:Name='btnClose' Content='X' Grid.Row='0' HorizontalAlignment='Right' 
                    Background='Transparent' Foreground='#666' Width='30' Height='30'/>
                    
            <!-- Header -->
            <StackPanel Grid.Row='1' Margin='0,10,0,20'>
                <TextBlock Text='XPIDER' FontSize='32' FontWeight='Black' Foreground='#00e5ff' HorizontalAlignment='Center'/>
                <TextBlock Text='PORTABLE EDITION' FontSize='12' Foreground='#7b61ff' HorizontalAlignment='Center' LetterSpacing='3'/>
            </StackPanel>
            
            <!-- Main Content -->
            <StackPanel Grid.Row='2' VerticalAlignment='Center'>
                <TextBlock Text='압축을 풀 폴더 경로' Foreground='#aaa' FontSize='12' Margin='0,0,0,5'/>
                <TextBox x:Name='txtPath' Height='35' Background='#1e1e1e' Foreground='White' 
                         BorderBrush='#444' BorderThickness='1' Padding='8,8,8,8' FontSize='13'/>
                
                <CheckBox x:Name='chkShortcut' Content='바탕화면에 실행 바로가기 만들기' 
                          Foreground='#ccc' FontSize='13' Margin='0,15,0,0' IsChecked='True'/>
            </StackPanel>
            
            <!-- Progress / Status -->
            <StackPanel Grid.Row='3' Margin='0,20,0,20'>
                <TextBlock x:Name='txtStatus' Text='대기 중...' Foreground='#888' FontSize='11' Margin='0,0,0,5' HorizontalAlignment='Center'/>
                <ProgressBar x:Name='pbExtract' Height='6' Background='#222' Foreground='#00e5ff' BorderThickness='0'/>
            </StackPanel>
            
            <!-- Extract Button -->
            <Button x:Name='btnExtract' Content='압축 해제 (Extract)' Grid.Row='4' Height='45' FontSize='15'/>
        </Grid>
    </Border>
</Window>
";
            Window win = (Window)XamlReader.Parse(xaml);
            
            Button btnClose = (Button)win.FindName("btnClose");
            Button btnExtract = (Button)win.FindName("btnExtract");
            TextBox txtPath = (TextBox)win.FindName("txtPath");
            CheckBox chkShortcut = (CheckBox)win.FindName("chkShortcut");
            TextBlock txtStatus = (TextBlock)win.FindName("txtStatus");
            ProgressBar pbExtract = (ProgressBar)win.FindName("pbExtract");
            
            // 기본 경로 설정 (현재 프로그램이 실행되는 위치의 XPIDER 폴더)
            txtPath.Text = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, ""XPIDER"");
            
            btnClose.Click += (s, e) => win.Close();
            
            // 드래그 이동
            var border = (Border)win.Content;
            border.MouseLeftButtonDown += (s, e) => {
                if (e.ButtonState == System.Windows.Input.MouseButtonState.Pressed)
                    win.DragMove();
            };
            
            btnExtract.Click += async (s, e) => {
                string targetDir = txtPath.Text;
                bool createShortcut = chkShortcut.IsChecked ?? false;
                
                btnExtract.IsEnabled = false;
                txtPath.IsEnabled = false;
                chkShortcut.IsEnabled = false;
                
                try {
                    await Task.Run(() => {
                        ExtractEmbeddedZip(targetDir, (progress, msg) => {
                            win.Dispatcher.Invoke(() => {
                                pbExtract.Value = progress;
                                txtStatus.Text = msg;
                            });
                        });
                    });
                    
                    if (createShortcut) {
                        win.Dispatcher.Invoke(() => txtStatus.Text = ""바로가기 생성 중..."");
                        CreateDesktopShortcut(targetDir);
                    }
                    
                    win.Dispatcher.Invoke(() => {
                        txtStatus.Text = ""완료되었습니다!"";
                        btnExtract.Content = ""실행하기 (Launch)"";
                        btnExtract.IsEnabled = true;
                        btnExtract.Click -= null; // 이벤트 제거
                        
                        btnExtract.Click += (sender, ev) => {
                            string exePath = Path.Combine(targetDir, ""XPIDERBrowser.exe"");
                            if (File.Exists(exePath)) {
                                System.Diagnostics.Process.Start(exePath);
                            }
                            win.Close();
                        };
                    });
                }
                catch (Exception ex) {
                    win.Dispatcher.Invoke(() => {
                        txtStatus.Text = ""오류: "" + ex.Message;
                        txtStatus.Foreground = Brushes.Red;
                        btnExtract.IsEnabled = true;
                        btnExtract.Content = ""다시 시도"";
                    });
                }
            };
            
            app.Run(win);
        }
        
        private static void ExtractEmbeddedZip(string extractPath, Action<int, string> reportProgress) {
            Assembly executingAssembly = Assembly.GetExecutingAssembly();
            
            // 리소스 이름 확인 (명령줄에서 /resource:...,app.zip 으로 지정)
            string resourceName = ""app.zip"";
            
            using (Stream resourceStream = executingAssembly.GetManifestResourceStream(resourceName)) {
                if (resourceStream == null) throw new Exception(""내장된 압축 파일을 찾을 수 없습니다."");
                
                if (!Directory.Exists(extractPath)) {
                    Directory.CreateDirectory(extractPath);
                }
                
                using (ZipArchive archive = new ZipArchive(resourceStream, ZipArchiveMode.Read)) {
                    int total = archive.Entries.Count;
                    int current = 0;
                    
                    foreach (ZipArchiveEntry entry in archive.Entries) {
                        current++;
                        reportProgress((int)((current / (float)total) * 100), string.Format(""압축 해제 중... {0}/{1}"", current, total));
                        
                        string destinationPath = Path.Combine(extractPath, entry.FullName);
                        // Windows 경로 구분자 문제 방지
                        destinationPath = destinationPath.Replace('/', '\\');
                        
                        if (entry.FullName.EndsWith(""/"") || entry.FullName.EndsWith(""\\"")) {
                            Directory.CreateDirectory(destinationPath);
                        } else {
                            Directory.CreateDirectory(Path.GetDirectoryName(destinationPath));
                            // 동일 파일 존재 시 덮어쓰기
                            entry.ExtractToFile(destinationPath, true);
                        }
                    }
                }
            }
        }
        
        private static void CreateDesktopShortcut(string targetDir) {
            try {
                string desktopPath = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
                string shortcutLocation = Path.Combine(desktopPath, ""XPIDER Browser.lnk"");
                string exePath = Path.Combine(targetDir, ""XPIDERBrowser.exe"");
                
                if (!File.Exists(exePath)) return;
                
                // WSH(Windows Script Host)를 사용해 바로가기 생성 (Com 객체 동적 생성)
                Type wshShellType = Type.GetTypeFromProgID(""WScript.Shell"");
                object wshShell = Activator.CreateInstance(wshShellType);
                object shortcut = wshShellType.InvokeMember(""CreateShortcut"", BindingFlags.InvokeMethod, null, wshShell, new object[] { shortcutLocation });
                
                Type shortcutType = shortcut.GetType();
                shortcutType.InvokeMember(""TargetPath"", BindingFlags.SetProperty, null, shortcut, new object[] { exePath });
                shortcutType.InvokeMember(""WorkingDirectory"", BindingFlags.SetProperty, null, shortcut, new object[] { targetDir });
                shortcutType.InvokeMember(""Description"", BindingFlags.SetProperty, null, shortcut, new object[] { ""XPIDER Browser"" });
                shortcutType.InvokeMember(""Save"", BindingFlags.InvokeMethod, null, shortcut, null);
            }
            catch {
                // 바로가기 생성 실패 시 무시
            }
        }
    }
}
"@

$csFile = "SetupWPF.cs"
Set-Content -Path $csFile -Value $csCode -Encoding UTF8

Write-Host "Compiling setup executable using Add-Type and CompilerParameters..."

try {
    Add-Type -AssemblyName "PresentationFramework", "PresentationCore", "WindowsBase", "System.Xaml", "System.IO.Compression", "System.IO.Compression.FileSystem"

    $cp = New-Object System.CodeDom.Compiler.CompilerParameters
    $cp.GenerateExecutable = $true
    $cp.OutputAssembly = $exePath
    $cp.MainClass = "XpiderSetup.Program"
    $cp.CompilerOptions = "/target:winexe /resource:`"$zipPath`",app.zip"
    
    # 어셈블리들의 전체 경로를 가져와서 참조에 추가
    $assemblies = @(
        "System",
        "System.Xaml",
        "PresentationFramework",
        "PresentationCore",
        "WindowsBase",
        "System.IO.Compression",
        "System.IO.Compression.FileSystem"
    )

    foreach ($asmName in $assemblies) {
        try {
            $path = [System.Reflection.Assembly]::LoadWithPartialName($asmName).Location
            if ($path) {
                $cp.ReferencedAssemblies.Add($path) | Out-Null
            } else {
                $cp.ReferencedAssemblies.Add("$asmName.dll") | Out-Null
            }
        } catch {
            $cp.ReferencedAssemblies.Add("$asmName.dll") | Out-Null
        }
    }

    $result = Add-Type -TypeDefinition $csCode -CompilerParameters $cp -PassThru
    
    if (Test-Path $exePath) {
        Write-Host "Successfully created setup executable: $exePath"
    } else {
        Write-Error "Failed to compile setup executable."
        exit 1
    }
} catch {
    Write-Error "Compilation failed: $_"
    exit 1
}

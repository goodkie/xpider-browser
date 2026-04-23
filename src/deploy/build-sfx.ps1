$ErrorActionPreference = "Stop"

$zipFile = Get-ChildItem "out\make\zip\win32\x64\*.zip" | Select-Object -First 1
if (-not $zipFile) {
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

$cscPath = "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (-not (Test-Path $cscPath)) {
    $cscPath = "$env:WINDIR\Microsoft.NET\Framework\v4.0.30319\csc.exe"
}
if (-not (Test-Path $cscPath)) {
    Write-Error "csc.exe not found! Please install .NET Framework 4.8."
    exit 1
}

# Copy logo and zip to Resources folder
New-Item -ItemType Directory -Force -Path "src\deploy\XpiderSetup\Resources" | Out-Null
Copy-Item "logo.png" -Destination "src\deploy\XpiderSetup\Resources\logo.png" -Force
Copy-Item $zipPath -Destination "src\deploy\XpiderSetup\Resources\app.zip" -Force

Write-Host "Compiling Setup..."
$cmd = "&`"$cscPath`" /nologo /target:winexe /codepage:65001 /out:`"$exePath`" /win32icon:`"assets\icons\win\icon.ico`" /reference:System.dll /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.IO.Compression.dll /reference:System.IO.Compression.FileSystem.dll /res:`"src\deploy\XpiderSetup\Resources\app.zip`",app.zip /res:`"src\deploy\XpiderSetup\Resources\logo.png`",logo.png `'src\deploy\XpiderSetup\Program.cs`' `'src\deploy\XpiderSetup\MainForm.cs`'"

Invoke-Expression $cmd

if (Test-Path $exePath) {
    Write-Host "Successfully created setup executable: $exePath"
} else {
    Write-Error "Failed to compile setup executable."
    exit 1
}

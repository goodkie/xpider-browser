@echo off
echo Building Lite Chromium Portable Go Launcher...
cd /d "%~dp0..\src\launcher"
go build -ldflags "-s -w" -o "..\..\LiteChromiumPortable.exe" main.go
if %errorlevel% equ 0 (
    echo Build SUCCESS: LiteChromiumPortable.exe
) else (
    echo Build FAILED with error %errorlevel%
    exit /b %errorlevel%
)

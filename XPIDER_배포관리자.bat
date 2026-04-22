@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ==========================================
echo Starting XPIDER Deploy Center...
echo ==========================================

where node >nul 2>&1
if errorlevel 1 goto nonode

node src/deploy/server.js
if errorlevel 1 goto servererror

exit /b 0

:nonode
echo [ERROR] Node.js is not installed. Please install Node.js first.
pause
exit /b 1

:servererror
echo [ERROR] Failed to start the deployment server.
pause
exit /b 1

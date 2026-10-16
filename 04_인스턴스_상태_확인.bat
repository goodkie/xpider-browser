@echo off
setlocal
chcp 65001 >nul
title Lite Chromium Portable - 인스턴스 실행 상태 점검
echo ==============================================================================
echo [PROJECT]: Lite Chromium Portable
echo [TASK]: 활성 브라우저 인스턴스 레지스트리 점검 (--status)
echo ==============================================================================
echo.
cd /d "%~dp0"
LiteChromiumPortable.exe --status
echo.
echo ==============================================================================
pause

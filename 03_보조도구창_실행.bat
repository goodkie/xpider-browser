@echo off
setlocal
chcp 65001 >nul
title Lite Chromium Portable - 보조 도구창 (Companion Tool Window) 실행
echo ==============================================================================
echo [PROJECT]: Lite Chromium Portable
echo [INFO]: 독립된 보조 도구 팝업창(--app-url)을 실행합니다.
echo [안내]: 네이티브 사이드바 단일 프레임 도킹은 C++ 빌드 단계 전까지 미충족이며,
echo         본 도구창 모드를 통해 다중 패널을 충돌 없이 동시 실행할 수 있습니다.
echo ==============================================================================
echo.
cd /d "%~dp0"
LiteChromiumPortable.exe --instance 1 --app-url "https://www.google.com"
echo.
echo ==============================================================================
echo [완료] 보조 도구창이 기동되었습니다.
echo (특정 확장 패널을 띄우려면 chrome-extension://<id>/popup.html 을 인자로 전달하세요)
echo ==============================================================================
echo.
pause

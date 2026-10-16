@echo off
setlocal
chcp 65001 >nul
title Lite Chromium Portable - 진단 로그 내보내기
echo ==============================================================================
echo [PROJECT]: Lite Chromium Portable
echo [TASK]: 안전 진단 ZIP 패키지 생성 (--export-diagnostics)
echo ==============================================================================
echo.
cd /d "%~dp0"
LiteChromiumPortable.exe --export-diagnostics
echo.
echo ==============================================================================
echo [완료] 진단 패키지 생성이 완료되었습니다.
echo 생성된 diagnostics_*.zip 파일을 디버깅 및 분석 시 활용하실 수 있습니다.
echo (사용자 암호, 쿠키, 프로필 데이터는 100%% 완벽 제외되어 안전합니다.)
echo ==============================================================================
echo.
pause

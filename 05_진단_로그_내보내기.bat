@echo off
setlocal
chcp 65001 >nul
title Lite Chromium Portable - 진단 로그 안전 내보내기
echo ==============================================================================
echo [PROJECT]: Lite Chromium Portable
echo [TASK]: 감사 진단 ZIP 패키지 생성 (--export-diagnostics)
echo ==============================================================================
echo.
cd /d "%~dp0"
LiteChromiumPortable.exe --export-diagnostics
echo.
echo ==============================================================================
echo [완료] 진단 패키지 생성이 완료되었습니다.
echo (사용자 암호, 세션 토큰, 쿠키, 프로필 DB는 100%% 원천 제외 및 마스킹 처리됨)
echo ==============================================================================
echo.
pause

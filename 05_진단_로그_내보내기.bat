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
set "EXIT_CODE=%ERRORLEVEL%"
echo.
echo ==============================================================================
if %EXIT_CODE% EQU 0 (
    echo [완료] 진단 패키지 생성이 완료되었습니다.
    echo (사용자 암호, 세션 토큰, 쿠키, 프로필 DB는 100%% 원천 제외 및 마스킹 처리됨)
) else (
    echo [오류] 진단 패키지 생성에 실패했습니다. (종료 코드: %EXIT_CODE%)
)
echo ==============================================================================
echo.
pause

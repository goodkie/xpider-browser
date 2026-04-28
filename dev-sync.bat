@echo off
:: ============================================================
:: XPIDER Dev-Sync — 로컬 수정 내용을 GitHub에 자동 Push
:: 사용법: dev-sync.bat [커밋 메시지]
:: 예시:   dev-sync.bat "구글맵 스크롤 엔진 강화"
:: ============================================================
cd /d "%~dp0"

set MSG=%~1
if "%MSG%"=="" (
    for /f "tokens=1-4 delims=/ " %%a in ('date /t') do set D=%%a-%%b-%%c
    for /f "tokens=1-2 delims=: " %%a in ('time /t') do set T=%%a%%b
    set MSG=dev-sync %D% %T%
)

echo.
echo [XPIDER Dev-Sync] 변경 사항 확인 중...
git status --short

echo.
echo [XPIDER Dev-Sync] 변경 사항 스테이징...
git add -A

echo.
echo [XPIDER Dev-Sync] 커밋: %MSG%
git commit -m "%MSG%"

echo.
echo [XPIDER Dev-Sync] GitHub에 Push 중...
git push origin main

echo.
echo [XPIDER Dev-Sync] ✅ 완료! 로컬 및 GitHub 동기화 완료.
pause

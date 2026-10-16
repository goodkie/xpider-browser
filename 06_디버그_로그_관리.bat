@echo off
setlocal
chcp 65001 >nul
title Lite Chromium Portable - 디버그 로그 및 ChatGPT 리포트 관리자

cd /d "%~dp0"

:MENU
cls
echo ==============================================================================
echo [PROJECT]: Lite Chromium Portable (v0.2.3-beta)
echo [TOOL]   : 디버그 로그 및 ChatGPT 리포트 관리자
echo ==============================================================================
echo.
echo  [1] 최근 디버그 로그 및 인스턴스 동작 확인 (--view-logs)
echo  [2] ChatGPT 보고용 상세 디버그 리포트 생성 (--export-chatgpt-report)
echo  [3] 전체 진단 패키지 ZIP 생성 (--export-diagnostics)
echo  [4] 비활성 인스턴스 및 이전 로그 안전 삭제/정리 (--clean-logs)
echo  [5] 로그 저장 폴더 열기 (Explorer)
echo  [0] 종료
echo.
echo ==============================================================================
set /p "CHOICE=원하시는 작업 번호를 입력하세요 (0-5): "

if "%CHOICE%"=="1" goto VIEW_LOGS
if "%CHOICE%"=="2" goto EXPORT_CHATGPT
if "%CHOICE%"=="3" goto EXPORT_DIAG
if "%CHOICE%"=="4" goto CLEAN_LOGS
if "%CHOICE%"=="5" goto OPEN_FOLDER
if "%CHOICE%"=="0" goto EXIT

echo.
echo 잘못된 입력입니다. 다시 선택해 주세요.
timeout /t 2 >nul
goto MENU

:VIEW_LOGS
cls
echo ==============================================================================
echo [1] 최근 디버그 로그 및 인스턴스 상태 실시간 열람
echo ==============================================================================
echo.
LiteChromiumPortable.exe --view-logs --instance 1
echo.
pause
goto MENU

:EXPORT_CHATGPT
cls
echo ==============================================================================
echo [2] ChatGPT 보고용 상세 디버그 리포트 생성 및 저장
echo ==============================================================================
echo.
LiteChromiumPortable.exe --export-chatgpt-report --instance 1
echo.
echo [안내] 생성된 CHATGPT_DEBUG_REPORT_*.md 파일을 ChatGPT에 직접 첨부하거나
echo 복사하여 프롬프트로 보고할 수 있습니다.
echo.
pause
goto MENU

:EXPORT_DIAG
cls
echo ==============================================================================
echo [3] 전체 감사 진단 ZIP 패키지 생성 (--export-diagnostics)
echo ==============================================================================
echo.
LiteChromiumPortable.exe --export-diagnostics
echo.
pause
goto MENU

:CLEAN_LOGS
cls
echo ==============================================================================
echo [4] 비활성 인스턴스 및 이전 로그 안전 삭제/정리 (--clean-logs)
echo ==============================================================================
echo.
echo 현재 실행 중인 프로세스의 로그는 100%% 안전하게 보호됩니다.
echo.
LiteChromiumPortable.exe --clean-logs
echo.
pause
goto MENU

:OPEN_FOLDER
echo.
if exist "data\logs" (
    start explorer.exe "data\logs"
) else (
    echo 로그 폴더가 아직 생성되지 않았습니다.
)
timeout /t 1 >nul
goto MENU

:EXIT
echo.
echo 프로그램을 종료합니다.
endlocal
exit /b 0

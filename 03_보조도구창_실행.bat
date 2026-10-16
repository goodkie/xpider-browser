@echo off
setlocal
chcp 65001 >nul
title Lite Chromium Portable - ?뺤옣 ?꾨줈洹몃옩 蹂댁“ ?꾧뎄李?愿由ъ옄 (v0.2.5-beta)

pushd "%~dp0"

if exist "LiteChromiumPortable.exe" goto EXE_OK
echo [?ㅻ쪟] LiteChromiumPortable.exe ?ㅽ뻾 ?뚯씪???꾩옱 ?붾젆?곕━???놁뒿?덈떎.
echo ?꾩옱 寃쎈줈: %CD%
echo.
pause
popd
exit /b 1

:EXE_OK
set "INST=1"

if "%~1"=="" goto MENU_TOP
LiteChromiumPortable.exe --instance %INST% --launch-panel "%~1"
pause
goto EXIT_BAT

:MENU_TOP
cls
echo ==============================================================================
echo [Lite Chromium Portable v0.2.5-beta] ?뺤옣 ?꾨줈洹몃옩 蹂댁“ ?꾧뎄李?愿由ъ옄
echo ==============================================================================
echo [?꾩옱 ???釉뚮씪?곗? ?몄뒪?댁뒪]: #%INST%
echo [湲곗닠 ?덈궡]: ?⑥씪 硫붿씤 ?꾨젅?????ㅼ씠?곕툕 ?ъ씠?쒕컮 ?ㅼ쨷 ?꾪궧? Chromium C++ 肄붿뼱
echo              ?⑥튂 ?꾧퉴吏 UNMET ?곹깭?대ŉ, 蹂??꾧뎄李?愿由ъ옄瑜??듯빐 ?숈씪 ?뺤옣??echo              蹂듭젣 ?⑤꼸 諛?蹂듭닔 ?뺤옣??寃⑸━??蹂꾨룄 ?꾧뎄李쎌쑝濡??숈떆 ?ㅽ뻾?⑸땲??
echo ==============================================================================
echo.

LiteChromiumPortable.exe --instance %INST% --list-extensions

echo [蹂댁“ ?꾧뎄李??ㅽ뻾 諛?愿由?紐낅졊??
echo ------------------------------------------------------------------------------
echo  [1-10]     : ?대떦 踰덊샇???뺤옣 ?꾨줈洹몃옩 ?꾧뎄李??ㅽ뻾 (湲곕낯 ?⑤꼸)
echo  [C 踰덊샇]   : ?숈씪 ?뺤옣 ?꾨줈洹몃옩 "???⑤꼸 異붽?(蹂듭젣)" (?? C 4)
echo  [L]        : ?꾩옱 ?몄뒪?댁뒪 #%INST%???대젮 ?덈뒗 蹂댁“ ?꾧뎄李?紐⑸줉 ?뺤씤
echo  [K ?源긆D] : ?뱀젙 蹂댁“ ?꾧뎄李??リ린 (?? K 38A9F1502D8D3ECBC703DE4892274DFB)
echo  [I]        : ????몄뒪?댁뒪 踰덊샇 蹂寃?(?꾩옱: #%INST%)
echo  [0]        : 醫낅즺
echo ------------------------------------------------------------------------------
echo.

set "CMD="
set /p "CMD=紐낅졊?대? ?낅젰?섏꽭?? "
if "%CMD%"=="" goto MENU_TOP

if "%CMD%"=="0" goto EXIT_BAT
if /i "%CMD%"=="Q" goto EXIT_BAT

if /i "%CMD%"=="I" goto CHANGE_INST
if /i "%CMD%"=="L" goto LIST_PANELS

if /i "%CMD:~0,2%"=="C " goto CLONE_PANEL
if /i "%CMD:~0,2%"=="c " goto CLONE_PANEL

if /i "%CMD:~0,2%"=="K " goto CLOSE_PANEL
if /i "%CMD:~0,2%"=="k " goto CLOSE_PANEL

echo.
echo [蹂댁“ ?꾧뎄李??ㅽ뻾 ?붿껌 以?..] (?몄뒪?댁뒪 #%INST%, ?뺤옣: %CMD%)
LiteChromiumPortable.exe --instance %INST% --launch-panel "%CMD%"
echo.
pause
goto MENU_TOP

:CLONE_PANEL
set "EXT_NUM=%CMD:~2%"
echo.
echo [?숈씪 ?뺤옣 ?꾨줈洹몃옩 ???⑤꼸 蹂듭젣 ?붿껌 以?..] (?몄뒪?댁뒪 #%INST%, ?뺤옣: %EXT_NUM%)
LiteChromiumPortable.exe --instance %INST% --launch-panel "%EXT_NUM%" --panel-id "clone_%RANDOM%"
echo.
pause
goto MENU_TOP

:LIST_PANELS
echo.
LiteChromiumPortable.exe --instance %INST% --list-panels
echo.
pause
goto MENU_TOP

:CLOSE_PANEL
set "TGT_ID=%CMD:~2%"
echo.
echo [蹂댁“ ?꾧뎄李??リ린 ?붿껌 以?..] (?몄뒪?댁뒪 #%INST%, Target: %TGT_ID%)
LiteChromiumPortable.exe --instance %INST% --close-panel "%TGT_ID%"
echo.
pause
goto MENU_TOP

:CHANGE_INST
echo.
set "NEW_INST="
set /p "NEW_INST=蹂寃쏀븷 ?몄뒪?댁뒪 踰덊샇瑜??낅젰?섏꽭??(1-100, ?꾩옱: %INST%): "
if not "%NEW_INST%"=="" set "INST=%NEW_INST%"
goto MENU_TOP

:EXIT_BAT
popd
exit /b 0

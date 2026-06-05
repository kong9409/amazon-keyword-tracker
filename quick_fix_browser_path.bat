@echo off
chcp 65001 >nul
cd /d %~dp0
set ENVFILE=.env
if not exist %ENVFILE% copy .env.example %ENVFILE% >nul
set CHROME1=%ProgramFiles%\Google\Chrome\Application\chrome.exe
set CHROME2=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe
set EDGE1=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe
set EDGE2=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe
set FOUND=
if exist "%CHROME1%" set FOUND=%CHROME1%
if not defined FOUND if exist "%CHROME2%" set FOUND=%CHROME2%
if not defined FOUND if exist "%EDGE1%" set FOUND=%EDGE1%
if not defined FOUND if exist "%EDGE2%" set FOUND=%EDGE2%
if not defined FOUND (
  echo 没找到 Chrome 或 Edge，请先安装其中一个浏览器。
  pause
  exit /b 1
)
echo.>>%ENVFILE%
echo BROWSER_EXECUTABLE_PATH=%FOUND%>>%ENVFILE%
echo 已写入浏览器路径：%FOUND%
pause

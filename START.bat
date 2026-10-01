@echo off
rem Weverse DM archiver - double-click this file.
rem Node.js 20 or newer is needed. The portable download carries its own copy in runtime\node, so
rem nothing has to be installed; the source copy falls back to the node on PATH.
setlocal
cd /d "%~dp0"

set "NODEEXE="
if exist "%~dp0runtime\node\node.exe" set "NODEEXE=%~dp0runtime\node\node.exe"
if not defined NODEEXE for %%I in (node.exe) do if not "%%~$PATH:I"=="" set "NODEEXE=%%~$PATH:I"
if not defined NODEEXE (
  echo.
  echo Node.js 20 or newer was not found.
  echo Use the portable download, which carries its own Node.js, or install the LTS version
  echo from the page that just opened, then run this file again.
  echo.
  start "" "https://nodejs.org/en/download"
  pause
  exit /b 1
)

echo Starting the archiver window...
start "weverse-dm-archiver" /min cmd /c ""%NODEEXE%" "src\gui.mjs" %*"
timeout /t 2 >nul
exit /b 0

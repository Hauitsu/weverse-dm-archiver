@echo off
rem Weverse DM archiver - double-click this file.
rem Needs Node.js 20 or newer: https://nodejs.org/en/download
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js 20 or newer is required and was not found.
  echo Opening the download page. Install the LTS version, then run this file again.
  echo.
  start "" "https://nodejs.org/en/download"
  pause
  exit /b 1
)

echo Starting the archiver window...
start "weverse-dm-archiver" /min cmd /c node "src\gui.mjs" %*
timeout /t 2 >nul
exit /b 0

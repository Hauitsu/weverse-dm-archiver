@echo off
rem Command line entry point: wdm rooms | harvest | render | media | share | all | doctor
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20 or newer is required: https://nodejs.org/en/download
  exit /b 1
)

node "src\cli.mjs" %*

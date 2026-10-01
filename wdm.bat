@echo off
rem Command line entry point: wdm rooms | harvest | render | media | share | all | doctor
setlocal
cd /d "%~dp0"

set "NODEEXE="
if exist "%~dp0runtime\node\node.exe" set "NODEEXE=%~dp0runtime\node\node.exe"
if not defined NODEEXE for %%I in (node.exe) do if not "%%~$PATH:I"=="" set "NODEEXE=%%~$PATH:I"
if not defined NODEEXE (
  echo Node.js 20 or newer is required: https://nodejs.org/en/download
  echo The portable download carries its own copy; this only happens with the source copy.
  exit /b 1
)

"%NODEEXE%" "src\cli.mjs" %*

@echo off
setlocal EnableExtensions
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0AVVIA_REV04.ps1"
set "ERR=%ERRORLEVEL%"
if not "%ERR%"=="0" exit /b %ERR%
exit /b 0

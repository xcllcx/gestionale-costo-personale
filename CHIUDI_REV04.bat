@echo off
setlocal EnableExtensions
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0CHIUDI_REV04.ps1"
exit /b %ERRORLEVEL%

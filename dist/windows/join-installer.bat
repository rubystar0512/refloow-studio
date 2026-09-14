@echo off
REM Rebuild Windows installer from split parts
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0join-installer.ps1"
pause

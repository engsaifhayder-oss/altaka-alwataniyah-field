@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ALTAKA-ALWATANIYAH Field Gateway
node server.js
pause

@echo off
chcp 65001 >nul
cd /d "%~dp0"
title ALTAKA-ALWATANIYAH Field Gateway
where node >nul 2>&1 || (echo Node.js is not installed. Download it from https://nodejs.org then run this file again. & pause & exit /b 1)
:loop
rem another copy of the gateway already serves port 8780: do not start a second one
netstat -ano | findstr /R /C:":8780 .*LISTENING" >nul && exit /b 0
echo ALTAKA-ALWATANIYAH Field Gateway
node server.js
echo.
echo The gateway stopped. Restarting in 5 seconds... (close this window to stop it)
timeout /t 5 /nobreak >nul
goto loop

@echo off
chcp 65001 >nul
cd /d "%~dp0"
title ALTAKA-ALWATANIYAH Accounting
where node >nul 2>&1 || (echo Node.js is not installed. Run install-accounting-windows.bat as administrator. & pause & exit /b 1)
:loop
echo ALTAKA-ALWATANIYAH Accounting - http://localhost:8790
node --no-warnings server.js
echo.
echo The accounting server stopped. Restarting in 5 seconds... (close this window to stop it)
timeout /t 5 /nobreak >nul
goto loop

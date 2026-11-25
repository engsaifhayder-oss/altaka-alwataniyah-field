@echo off
rem ALTAKA-ALWATANIYAH - update the host computer now (run as administrator)
net session >nul 2>&1
if errorlevel 1 (echo.& echo  Right-click this file and choose "Run as administrator".& echo.& pause & exit /b 1)
if not exist "C:\ALTAKA-ALWATANIYAH\updater" mkdir "C:\ALTAKA-ALWATANIYAH\updater"
if exist "%~dp0auto-update.ps1" copy /Y "%~dp0auto-update.ps1" "C:\ALTAKA-ALWATANIYAH\updater\auto-update.ps1" >nul
schtasks /Create /F /TN "ALTAKA-ALWATANIYAH Updater" /SC HOURLY /RU SYSTEM /RL HIGHEST /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\ALTAKA-ALWATANIYAH\updater\auto-update.ps1" >nul
if errorlevel 1 (echo  Could not create the automatic update task.) else echo  Automatic updates: every hour - OK
echo  Downloading and installing the latest version...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\ALTAKA-ALWATANIYAH\updater\auto-update.ps1"
echo.
type "C:\ALTAKA-ALWATANIYAH\updater\status.json"
echo.
echo  Done.
pause

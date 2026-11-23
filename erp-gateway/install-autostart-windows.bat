@echo off
chcp 65001 >nul
cd /d "%~dp0"
rem Starts the gateway (minimised) every time this Windows account signs in.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Startup')+'\ALTAKA Field Gateway.lnk');$s.TargetPath='%~dp0start-windows.bat';$s.WorkingDirectory='%~dp0';$s.WindowStyle=7;$s.Description='ALTAKA-ALWATANIYAH Field Gateway';$s.Save()"
if errorlevel 1 (echo Could not create the startup shortcut. & pause & exit /b 1)
echo.
echo  OK - the gateway will start automatically when you sign in to Windows.
echo  To undo: delete "ALTAKA Field Gateway" from the Startup folder (Win+R, type shell:startup).
echo.
pause

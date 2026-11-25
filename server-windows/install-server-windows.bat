@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
title ALTAKA-ALWATANIYAH - Server setup (host computer)
rem =====================================================================
rem  ALTAKA-ALWATANIYAH unified server - Windows only (the host computer)
rem   1) installs the field/app gateway to C:\ALTAKA-ALWATANIYAH\gateway
rem      (keeps or migrates its data from the old Desktop folders)
rem   2) starts it now and on every Windows start (scheduled task, hidden)
rem   3) installs / keeps the Cloudflare Tunnel service
rem  The ERP server (ALTAKA-ALWATANIYAH-ERP-Server.exe) is installed separately
rem  and is NOT touched by this script.
rem =====================================================================
net session >nul 2>&1
if errorlevel 1 (
  echo.
  echo  Please run this file as administrator:  right-click  ^>  "Run as administrator"
  echo.
  pause & exit /b 1
)
set "SRC=%~dp0gateway"
set "DST=C:\ALTAKA-ALWATANIYAH\gateway"
if not exist "%SRC%\server.js" (echo  gateway folder not found next to this file. Extract the whole zip first. & pause & exit /b 1)

echo.
echo [1/4] Node.js
call :findnode
if not defined NODEX (
  echo  Installing Node.js LTS ...
  winget install --id OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements >nul 2>&1
  call :findnode
)
if not defined NODEX (
  for %%F in ("%USERPROFILE%\Desktop\node-v*-x64.msi" "%USERPROFILE%\Downloads\node-v*-x64.msi") do if not defined NODEX if exist "%%~F" (
    echo  Installing %%~nxF ...
    msiexec /i "%%~F" /qn /norestart
    call :findnode
  )
)
if not defined NODEX (echo  Node.js could not be installed. Install it from https://nodejs.org and run this file again. & pause & exit /b 1)
echo  Using: !NODEX!

echo.
echo [2/4] Gateway files  -^>  %DST%
rem stop a running gateway (old Startup shortcut / old task) so files and port 8780 are free
schtasks /End /TN "ALTAKA-ALWATANIYAH Gateway" >nul 2>&1
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\ALTAKA Field Gateway.lnk" >nul 2>&1
powershell -NoProfile -Command "Get-NetTCPConnection -State Listen -LocalPort 8780 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }" >nul 2>&1
robocopy "%SRC%" "%DST%" /E /XD data /NFL /NDL /NJH /NJS /NP >nul
if not exist "%DST%\data\db.json" (
  rem migrate data from the newest old gateway folder on the Desktop / Downloads
  set "OLD="
  for /f "delims=" %%D in ('powershell -NoProfile -Command "Get-ChildItem -Path $env:USERPROFILE\Desktop,$env:USERPROFILE\Downloads,$env:USERPROFILE\Documents -Filter db.json -Recurse -Depth 4 -ErrorAction SilentlyContinue | Where-Object { $_.FullName -match 'erp-gateway\\data\\db.json$' } | Sort-Object LastWriteTime -Descending | Select-Object -First 1 | ForEach-Object { $_.Directory.FullName }"') do set "OLD=%%D"
  if defined OLD (
    echo  Migrating data from: !OLD!
    robocopy "!OLD!" "%DST%\data" /E /NFL /NDL /NJH /NJS /NP >nul
  ) else echo  No previous data found - starting fresh.
) else echo  Existing data kept.

> "%DST%\run-hidden.vbs" echo CreateObject("WScript.Shell").Run """%DST%\start-windows.bat""", 0, False

echo.
echo [3/4] Autostart (scheduled task "ALTAKA-ALWATANIYAH Gateway")
schtasks /Create /F /TN "ALTAKA-ALWATANIYAH Gateway" /SC ONLOGON /RL HIGHEST /TR "wscript.exe \"%DST%\run-hidden.vbs\"" >nul
if errorlevel 1 (echo  Could not create the scheduled task.) else echo  OK
schtasks /Run /TN "ALTAKA-ALWATANIYAH Gateway" >nul 2>&1
echo.
echo  Automatic updates: scheduled task "ALTAKA-ALWATANIYAH Updater" checks GitHub every hour
if not exist "C:\ALTAKA-ALWATANIYAH\updater" mkdir "C:\ALTAKA-ALWATANIYAH\updater"
copy /Y "%~dp0auto-update.ps1" "C:\ALTAKA-ALWATANIYAH\updater\auto-update.ps1" >nul
schtasks /Create /F /TN "ALTAKA-ALWATANIYAH Updater" /SC HOURLY /RU SYSTEM /RL HIGHEST /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\ALTAKA-ALWATANIYAH\updater\auto-update.ps1" >nul
if errorlevel 1 (echo  Could not create the update task.) else echo  OK - new versions install by themselves
netsh advfirewall firewall delete rule name="ALTAKA-ALWATANIYAH Gateway" >nul 2>&1
netsh advfirewall firewall add rule name="ALTAKA-ALWATANIYAH Gateway" dir=in action=allow protocol=TCP localport=8780 profile=private >nul
timeout /t 4 /nobreak >nul
powershell -NoProfile -Command "try{$r=Invoke-RestMethod -UseBasicParsing http://127.0.0.1:8780/api/mobile/ping -TimeoutSec 8; Write-Host ' Gateway is running - version' $r.version}catch{Write-Host ' Gateway did not answer yet - open' '%DST%\start-windows.bat' 'to see the error'}"

echo.
echo [4/4] Cloudflare Tunnel
sc query cloudflared | find "RUNNING" >nul
if not errorlevel 1 (
  echo  The Cloudflare Tunnel service is already running - kept as is.
  set /p "CH= Replace its token? (y/N) "
  if /i not "!CH!"=="y" goto :done
)
call "%DST%\setup-tunnel-windows.bat" nopause

:done
echo.
echo  =====================================================================
echo   In the Cloudflare dashboard (Zero Trust ^> Networks ^> Tunnels ^> your tunnel
echo   ^> Public Hostname) the tunnel must have these two hostnames:
echo.
echo     app.altaka-field.com  -^>  HTTP   localhost:8780
echo     erp.altaka-field.com  -^>  HTTPS  localhost:5443
echo                               (Additional settings ^> TLS ^> No TLS Verify = ON)
echo.
echo   Test from a phone on mobile data:
echo     https://app.altaka-field.com/api/mobile/ping
echo     https://erp.altaka-field.com
echo  =====================================================================
echo.
pause
exit /b 0

:findnode
set "NODEX="
for %%P in ("%ProgramFiles%\nodejs\node.exe" "%ProgramFiles(x86)%\nodejs\node.exe") do if not defined NODEX if exist "%%~P" set "NODEX=%%~P"
if not defined NODEX for /f "delims=" %%P in ('where node 2^>nul') do if not defined NODEX set "NODEX=%%P"
exit /b 0

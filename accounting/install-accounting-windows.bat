@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
title ALTAKA-ALWATANIYAH - Accounting server setup (host computer)
rem =====================================================================
rem  ALTAKA-ALWATANIYAH accounting program - server for the host computer (Windows)
rem   1) installs to C:\ALTAKA-ALWATANIYAH\accounting  (data is kept on updates)
rem   2) starts it now and on every Windows sign-in (scheduled task, hidden)
rem   3) opens http://localhost:8790 for the first setup (admin account)
rem  Remote access: Cloudflare public hostname acc.altaka-field.com -> http://localhost:8790
rem =====================================================================
net session >nul 2>&1
if errorlevel 1 (
  echo.
  echo  Please run this file as administrator:  right-click  ^>  "Run as administrator"
  echo.
  pause & exit /b 1
)
set "SRC=%~dp0accounting"
set "DST=C:\ALTAKA-ALWATANIYAH\accounting"
if not exist "%SRC%\server.js" (echo  accounting folder not found next to this file. Extract the whole zip first. & pause & exit /b 1)

echo.
echo [1/4] Node.js (22.13 or newer)
call :findnode
if not defined NODEX (
  echo  Installing Node.js LTS ...
  winget install --id OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements >nul 2>&1
  call :findnode
)
if not defined NODEX (echo  Node.js could not be installed. Install it from https://nodejs.org and run this file again. & pause & exit /b 1)
"!NODEX!" -e "require('node:sqlite')" >nul 2>&1
if errorlevel 1 (
  echo  Node.js is too old for the built-in database. Updating Node.js LTS ...
  winget upgrade --id OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements >nul 2>&1
  "!NODEX!" -e "require('node:sqlite')" >nul 2>&1
  if errorlevel 1 (echo  Please install the latest Node.js LTS from https://nodejs.org and run this file again. & pause & exit /b 1)
)
"!NODEX!" --version

echo.
echo [2/4] Program files  -^>  %DST%
schtasks /End /TN "ALTAKA-ALWATANIYAH Accounting" >nul 2>&1
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -match 'no-warnings server\.js' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" >nul 2>&1
robocopy "%SRC%" "%DST%" /E /XD data /NFL /NDL /NJH /NJS /NP >nul
if exist "%DST%\data\accounting.db" (echo  Existing data kept.) else echo  New installation.
> "%DST%\run-hidden.vbs" echo CreateObject("WScript.Shell").Run """%DST%\start-windows.bat""", 0, False

echo.
echo [3/4] Autostart (scheduled task "ALTAKA-ALWATANIYAH Accounting")
schtasks /Create /F /TN "ALTAKA-ALWATANIYAH Accounting" /SC ONLOGON /RL HIGHEST /TR "wscript.exe \"%DST%\run-hidden.vbs\"" >nul
if errorlevel 1 (echo  Could not create the scheduled task.) else echo  OK
schtasks /Run /TN "ALTAKA-ALWATANIYAH Accounting" >nul 2>&1
netsh advfirewall firewall delete rule name="ALTAKA-ALWATANIYAH Accounting" >nul 2>&1
netsh advfirewall firewall add rule name="ALTAKA-ALWATANIYAH Accounting" dir=in action=allow protocol=TCP localport=8790 profile=private >nul
timeout /t 4 /nobreak >nul
powershell -NoProfile -Command "try{$r=Invoke-RestMethod -UseBasicParsing http://127.0.0.1:8790/api/status -TimeoutSec 8; Write-Host ' Accounting server is running'}catch{Write-Host ' The server did not answer yet - open' '%DST%\start-windows.bat' 'to see the error'}"

echo.
echo [4/4] Opening the program ...
start "" http://localhost:8790
echo.
echo  =====================================================================
echo   First time: create the admin account in the page that opened.
echo   Other computers and phones: https://acc.altaka-field.com
echo   (Cloudflare tunnel public hostname: acc.altaka-field.com  -^>  HTTP  localhost:8790)
echo   Data and daily backups:  %DST%\data
echo  =====================================================================
echo.
pause
exit /b 0

:findnode
set "NODEX="
for %%P in ("%ProgramFiles%\nodejs\node.exe" "%ProgramFiles(x86)%\nodejs\node.exe") do if not defined NODEX if exist "%%~P" set "NODEX=%%~P"
if not defined NODEX for /f "delims=" %%P in ('where node 2^>nul') do if not defined NODEX set "NODEX=%%P"
exit /b 0

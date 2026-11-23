@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
title Cloudflare Tunnel - ALTAKA-ALWATANIYAH Field
rem Installs Cloudflare Tunnel (cloudflared) as a Windows service, so the field gateway is reachable from
rem anywhere at https://field.<your-domain>. See: اعداد-الوصول-من-الانترنت.txt
net session >nul 2>&1
if errorlevel 1 (
  echo.
  echo  Please run this file as administrator:
  echo  right-click  ^>  "Run as administrator"
  echo.
  pause & exit /b 1
)
set "CFD=%ProgramFiles%\cloudflared"
if not exist "%CFD%" mkdir "%CFD%"
if not exist "%CFD%\cloudflared.exe" (
  echo Downloading cloudflared ...
  curl -fL --retry 3 -o "%CFD%\cloudflared.exe" https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe
  if errorlevel 1 (
    echo.
    echo  Download failed. Download cloudflared-windows-amd64.exe manually from
    echo  https://github.com/cloudflare/cloudflared/releases  and save it as:
    echo  %CFD%\cloudflared.exe   then run this file again.
    pause & exit /b 1
  )
)
"%CFD%\cloudflared.exe" --version
echo.
echo  Paste the tunnel token from the Cloudflare dashboard
echo  (you may paste the whole command "cloudflared.exe service install eyJ...")
echo  then press Enter:
echo.
set /p "LINE=> "
if "!LINE!"=="" (echo No token entered. & pause & exit /b 1)
set "TOKEN="
for %%A in (!LINE!) do set "TOKEN=%%A"
"%CFD%\cloudflared.exe" service uninstall >nul 2>&1
timeout /t 2 /nobreak >nul
"%CFD%\cloudflared.exe" service install !TOKEN!
timeout /t 5 /nobreak >nul
sc query cloudflared | find "RUNNING" >nul
if errorlevel 1 (
  echo.
  echo  The tunnel service did not start. Check the token and run this file again.
) else (
  echo.
  echo  OK - the tunnel runs as a Windows service and starts with the computer.
  echo  In the Cloudflare dashboard the tunnel should now show "HEALTHY".
)
echo.
pause

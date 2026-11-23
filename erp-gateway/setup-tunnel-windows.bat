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
rem --- find or install cloudflared (official installer; a plain downloaded .exe may be blocked: "Access is denied") ---
call :findcfd
if defined CFX goto :have
echo Installing cloudflared (official installer) ...
winget install --id Cloudflare.cloudflared -e --silent --accept-package-agreements --accept-source-agreements >nul 2>&1
call :findcfd
if defined CFX goto :have
echo  winget not available - downloading the MSI installer ...
curl -fL --retry 3 -o "%TEMP%\cloudflared.msi" https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.msi
if not errorlevel 1 msiexec /i "%TEMP%\cloudflared.msi" /qn /norestart
call :findcfd
if defined CFX goto :have
echo.
echo  cloudflared could not be installed or is blocked by the antivirus.
echo  Download cloudflared-windows-amd64.msi from the Cloudflare dashboard link,
echo  run it, then run this file again.
pause & exit /b 1
:have
echo Using: !CFX!
"!CFX!" --version
echo.
echo  Paste the tunnel token from the Cloudflare dashboard
echo  (you may paste the whole command "cloudflared.exe service install eyJ...")
echo  then press Enter:
echo.
set /p "LINE=> "
if "!LINE!"=="" (echo No token entered. & pause & exit /b 1)
set "TOKEN="
for %%A in (!LINE!) do set "TOKEN=%%A"
"!CFX!" service uninstall >nul 2>&1
timeout /t 2 /nobreak >nul
"!CFX!" service install !TOKEN!
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
exit /b 0

:findcfd
set "CFX="
for %%P in ("%ProgramFiles(x86)%\cloudflared\cloudflared.exe" "%ProgramFiles%\cloudflared\cloudflared.exe") do (
  if not defined CFX if exist "%%~P" (
    "%%~P" --version >nul 2>&1 && set "CFX=%%~P"
  )
)
if not defined CFX for /f "delims=" %%P in ('where cloudflared 2^>nul') do if not defined CFX set "CFX=%%P"
exit /b 0

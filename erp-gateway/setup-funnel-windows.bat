@echo off
setlocal
title ALTAKA Field Gateway - Tailscale Funnel setup
echo ============================================================
echo   Public internet access for the field app (Tailscale Funnel)
echo   Guide: see the Arabic .txt guide in this folder
echo ============================================================
echo.

net session >nul 2>&1
if errorlevel 1 (
  echo [!] Right-click this file and choose "Run as administrator".
  pause & exit /b 1
)

set "TS=%ProgramFiles%\Tailscale\tailscale.exe"
if not exist "%TS%" (
  echo [1/4] Installing Tailscale ...
  winget install --id Tailscale.Tailscale -e --silent --accept-package-agreements --accept-source-agreements >nul 2>&1
)
if not exist "%TS%" (
  echo       winget not available - downloading installer ...
  curl -L -o "%TEMP%\tailscale.msi" https://pkgs.tailscale.com/stable/tailscale-setup-latest-amd64.msi
  msiexec /i "%TEMP%\tailscale.msi" /qn /norestart
)
if not exist "%TS%" (
  echo [!] Tailscale was not installed. Install it from https://tailscale.com/download/windows then run this file again.
  pause & exit /b 1
)
echo [1/4] Tailscale is installed.
echo.

echo [2/4] Sign in. A browser page will open (or copy the link shown below).
echo       Sign in with the company account and press "Connect".
"%TS%" up --unattended --hostname=altaka-server
if errorlevel 1 ( echo [!] Sign-in failed. & pause & exit /b 1 )
echo.

echo [3/4] Publishing the gateway (port 8780) to the internet ...
echo       If a link appears asking to enable Funnel / HTTPS, open it, press Enable, then come back.
"%TS%" funnel --bg 8780
if errorlevel 1 ( echo [!] Funnel could not start. & pause & exit /b 1 )
echo.

echo [4/4] Your public link (write it in the gateway admin panel and in the phones):
echo ------------------------------------------------------------
"%TS%" funnel status
echo ------------------------------------------------------------
echo.
echo IMPORTANT: in https://login.tailscale.com/admin/machines open "altaka-server"
echo            ... menu - "Disable key expiry", so the link never stops.
echo.
echo Done. Tailscale runs as a Windows service and starts with the computer.
pause

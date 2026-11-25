@echo off
rem Restart the ALTAKA-ALWATANIYAH gateway only (the accounting program keeps running)
powershell -NoProfile -Command "Get-NetTCPConnection -State Listen -LocalPort 8780 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }" >nul 2>&1
schtasks /End /TN "ALTAKA-ALWATANIYAH Gateway" >nul 2>&1
schtasks /Run /TN "ALTAKA-ALWATANIYAH Gateway"
timeout /t 4 >nul
powershell -NoProfile -Command "try{(Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8780/api/mobile/ping -TimeoutSec 5).Content}catch{'NOT RUNNING'}"
echo.
echo  Gateway restarted.
pause

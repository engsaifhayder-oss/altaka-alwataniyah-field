#!/bin/bash
# Public internet access for the field app (Tailscale Funnel) - macOS
cd "$(dirname "$0")"
TS="/Applications/Tailscale.app/Contents/MacOS/Tailscale"
command -v tailscale >/dev/null 2>&1 && TS="$(command -v tailscale)"
if [ ! -x "$TS" ]; then
  echo "Install Tailscale first (opening download page), then run this file again."
  open "https://tailscale.com/download/mac"
  read -p "Press Enter to close..."; exit 1
fi
echo "[1/3] Sign in (browser opens) with the company account ..."
"$TS" up --hostname=altaka-server || { read -p "Sign-in failed. Enter to close"; exit 1; }
echo "[2/3] Publishing port 8780 ... (if a link asks to enable Funnel/HTTPS, open it and press Enable)"
"$TS" funnel --bg 8780 || { read -p "Funnel failed. Enter to close"; exit 1; }
echo "[3/3] Your public link:"
echo "------------------------------------------------------------"
"$TS" funnel status
echo "------------------------------------------------------------"
echo "IMPORTANT: login.tailscale.com/admin/machines -> altaka-server -> Disable key expiry"
echo "Also: System Settings -> General -> Login Items: keep Tailscale enabled; Energy: prevent sleep."
read -p "Done. Press Enter to close..."

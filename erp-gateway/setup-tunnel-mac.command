#!/bin/bash
# Installs Cloudflare Tunnel (cloudflared) as a macOS service — see «اعداد-الوصول-من-الانترنت.txt»
cd "$(dirname "$0")"
set -e
if ! command -v cloudflared >/dev/null 2>&1; then
  ARCH=$(uname -m); [ "$ARCH" = "arm64" ] && F=cloudflared-darwin-arm64.tgz || F=cloudflared-darwin-amd64.tgz
  echo "Downloading cloudflared ($ARCH) ..."
  curl -fL --retry 3 -o /tmp/cloudflared.tgz "https://github.com/cloudflare/cloudflared/releases/latest/download/$F"
  tar -xzf /tmp/cloudflared.tgz -C /tmp
  echo "Your Mac password is needed to install it:"
  sudo mkdir -p /usr/local/bin && sudo mv /tmp/cloudflared /usr/local/bin/cloudflared && sudo chmod +x /usr/local/bin/cloudflared
fi
cloudflared --version
echo
echo "Paste the tunnel token from the Cloudflare dashboard (or the whole 'cloudflared service install eyJ...' command), then Enter:"
read -r LINE
TOKEN=$(echo "$LINE" | awk '{print $NF}')
[ -z "$TOKEN" ] && { echo "No token entered."; exit 1; }
sudo cloudflared service uninstall >/dev/null 2>&1 || true
sudo cloudflared service install "$TOKEN"
echo
echo "OK - the tunnel runs as a service and starts with the Mac. The Cloudflare dashboard should show HEALTHY."
read -r -p "Press Enter to close"

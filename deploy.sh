#!/bin/bash
# deploy.sh — Build frontend and push to nginx webroot
# Run this after every frontend change: ./deploy.sh
set -e

echo "[deploy] Building frontend..."
cd /opt/align/client
npm run build

echo "[deploy] Copying to /var/www/align/..."
sudo cp -r /opt/align/client/dist/. /var/www/align/

echo "[deploy] Cleaning stale assets..."
cd /var/www/align/assets
LIVE_JS=$(grep -oP '(?<=src=")[^"]+(?=")' /var/www/align/index.html | xargs -I{} basename {})
LIVE_CSS=$(grep -oP '(?<=href=")[^"]+(?=")' /var/www/align/index.html | grep assets | xargs -I{} basename {})
for f in *.js *.css; do
  if [[ "$f" != "$LIVE_JS" && "$f" != "$LIVE_CSS" ]]; then
    sudo rm "$f"
  fi
done

echo "[deploy] Restarting backend..."
pm2 restart align

echo "[deploy] Done — $(ls /var/www/align/assets/)"

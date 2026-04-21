#!/bin/bash
# Deploy Align frontend to /var/www/align
# Usage: ./deploy.sh

set -e

echo "[deploy] Building frontend..."
cd /opt/align/client
npx vite build --mode development

echo "[deploy] Copying to /var/www/align..."
sudo cp -r /opt/align/client/dist/* /var/www/align/

# Remove old hashed asset files (keep only what index.html references)
CURRENT_JS=$(grep -oP 'src="/assets/[^"]+\.js"' /var/www/align/index.html | grep -oP 'index-[^"]+\.js')
CURRENT_CSS=$(grep -oP 'href="/assets/[^"]+\.css"' /var/www/align/index.html | grep -oP 'index-[^"]+\.css')
sudo find /var/www/align/assets/ -name "*.js" ! -name "$CURRENT_JS" -delete 2>/dev/null || true
sudo find /var/www/align/assets/ -name "*.css" ! -name "$CURRENT_CSS" -delete 2>/dev/null || true

echo "[deploy] Restarting API..."
pm2 restart align

echo "[deploy] Done. Files in /var/www/align/assets/:"
ls /var/www/align/assets/

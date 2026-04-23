#!/bin/bash
# Deploy Align frontend — build + copy to nginx web root
set -e
echo "Building..."
cd /opt/align/client && npm run build
echo "Deploying to /var/www/align..."
sudo cp -r /opt/align/client/dist/. /var/www/align/
sudo nginx -s reload
echo "Done ✓ — $(ls /var/www/align/assets/*.js | head -1 | xargs basename)"

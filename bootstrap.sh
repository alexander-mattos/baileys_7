#!/usr/bin/env bash
set -euo pipefail

# CONFIG - adjust for your environment
GIT_REPO="https://github.com/alexander-mattos/baileys_7.git"
APP_USER="baileys"
APP_DIR="/home/ubuntu/baileys"
DOMAIN="baileys.conversaexpress.com.br"

log(){ echo "[bootstrap] $*"; }

log "System update"
apt update
apt -y upgrade
apt install -y curl gnupg lsb-release ca-certificates apt-transport-https software-properties-common git build-essential

log "Install nginx and certbot"
apt install -y nginx certbot python3-certbot-nginx

log "Create app user and directories"
if ! id -u "$APP_USER" >/dev/null 2>&1; then
  adduser --system --group --home "$APP_DIR" "$APP_USER"
fi
mkdir -p "$APP_DIR" "$APP_DIR/logs"
chown -R "$APP_USER":"$APP_USER" "$APP_DIR"
chmod 750 "$APP_DIR"

log "Fetch application"
if [ -d "$APP_DIR/.git" ]; then
  cd "$APP_DIR" && sudo -u "$APP_USER" git pull
else
  sudo -u "$APP_USER" git clone "$GIT_REPO" "$APP_DIR"
fi

log "Install deps and build"
npm install -g pm2
sudo -u "$APP_USER" bash -lc "cd $APP_DIR && npm ci || true"
if [ -f "$APP_DIR/package.json" ] && grep -q "\"build\"" "$APP_DIR/package.json"; then
  sudo -u "$APP_USER" bash -lc "cd $APP_DIR && npm run build || true"
fi

log ".env"
ENV_FILE="$APP_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "ADMIN_TOKEN=2a987fdc0162ce707082e7be2d" > "$ENV_FILE"
  echo "PORT=3333" >> "$ENV_FILE"
  echo "NODE_ENV=production" >> "$ENV_FILE"
  chown "$APP_USER":"$APP_USER" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
fi

log "PM2 start"
sudo -u "$APP_USER" bash -lc "cd $APP_DIR && pm2 start ecosystem.config.js --env production || true"
sudo -u "$APP_USER" pm2 save

log "PM2 startup"
pm2 startup systemd -u "$APP_USER" --hp "$APP_DIR" || true

log "Nginx site and certbot webroot"
mkdir -p /var/www/certbot
chown www-data:www-data /var/www/certbot
NGINX_CONF="/etc/nginx/sites-available/baileys.conf"
if [ ! -f "$NGINX_CONF" ]; then
  cat > "$NGINX_CONF" <<NGINXCONF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    root /var/www/certbot;
    location /.well-known/acme-challenge/ { try_files \$uri =404; }
    location / { return 301 https://\$host\$request_uri; }
}
NGINXCONF
  ln -s "$NGINX_CONF" /etc/nginx/sites-enabled/baileys.conf || true
  nginx -t && systemctl reload nginx
fi

log "Done. Next steps:"
echo " - Edit $ENV_FILE and set ADMIN_TOKEN"
echo " - Issue TLS: certbot --nginx -d $DOMAIN"
echo " - Check: curl -H 'Authorization: Bearer <TOKEN>' https://$DOMAIN/status"

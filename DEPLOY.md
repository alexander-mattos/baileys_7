# Deploy Guide

Passos resumidos para preparar VPS e colocar o Baileys API em produção.

1. Preparar VPS (Ubuntu 22.04+ recomendado)

- Atualizar e instalar dependências:
```bash
sudo apt update && sudo apt -y upgrade
sudo apt install -y curl gnupg lsb-release ca-certificates apt-transport-https software-properties-common git build-essential nginx certbot python3-certbot-nginx
```

- Criar usuário de serviço `baileys` e diretório:
```bash
sudo adduser --system --group --home /home/baileys baileys
sudo mkdir -p /home/baileys
sudo chown -R baileys:baileys /home/baileys
```

2. Clonar e instalar

```bash
sudo -u baileys git clone <repo> /home/baileys
cd /home/baileys
sudo -u baileys npm ci
sudo -u baileys npm run build
```

3. PM2

```bash
sudo npm install -g pm2
sudo -u baileys pm2 start ecosystem.config.js --env production
sudo pm2 save
sudo pm2 startup systemd -u baileys --hp /home/baileys
```

4. Nginx + Certbot

- Criar `/etc/nginx/sites-available/baileys.conf` como no repositório, testar `sudo nginx -t` e reload.
- Para certificados com Cloudflare proxied, use DNS-01 plugin com token; para webroot, temporariamente desative o proxy na Cloudflare.

5. Backups

Scripts de backup estão em `scripts/baileys-backup.sh` e podem ser agendados via cron.

6. Logs e monitoração

- Logs do app: `/home/baileys/wa-logs.txt` e logs do nginx.
- Use `pm2 monit` e `pm2 logs` para visualização.

7. Restaurar sessão

- Restaure `baileys_auth_info/` no diretório da aplicação antes de iniciar para manter sessão.

# Deploy limpo em Ubuntu 24.04 (PM2 + Nginx + Let's Encrypt)

Este guia prepara um setup limpo em `/home/baileys` com PM2 e Nginx, preservando a sessão do WhatsApp via diretório `baileys_auth_info/`.

Requisitos:
- Ubuntu 24.04.3 LTS (ou similar)
- Domínio: `baileys.conversaexpress.com.br` apontando para a VPS
- Acesso sudo

## 1) Preparar usuário, diretórios e Node (com script opcional)

Você pode usar o script `scripts/bootstrap-vps.sh` (abaixo) para automatizar. Ele instala Node LTS, Nginx, Certbot, cria o usuário `baileys`, estrutura `/home/baileys`, instala dependências, PM2 e cria a config do Nginx básica.

Passos principais (se fizer manualmente):
- Criar usuário e diretório do app
- Instalar Node LTS, Git, Nginx, Certbot
- Copiar o código para `/home/baileys`
- `npm ci && npm run build`
- Configurar PM2 com `ecosystem.config.js`

## 2) Preservar/Migrar sessão (baileys_auth_info)

Se você já possui sessão ativa na instância antiga, copie os diretórios:
- `/home/baileys/baileys_auth_info`
- `/home/baileys/tmp`

Sem esses diretórios, será necessário parear novamente (QR/pairing code). Sempre faça backup antes de qualquer migração.

## 3) Variáveis de ambiente

Crie `/home/baileys/.env` com permissão 600 (dono `baileys`):
```
ADMIN_TOKEN=uma_chave_muito_forte_aqui
PORT=3333
NODE_ENV=production
```

## 4) PM2

- Instale PM2: `sudo npm i -g pm2`
- Inicie a aplicação:
```
sudo -u baileys pm2 start /home/baileys/ecosystem.config.js --env production
sudo -u baileys pm2 save
```
- Habilite o startup via systemd (execute o comando impresso):
```
sudp pm2 startup systemd -u baileys --hp /home/baileys
```

## 5) Nginx + TLS

- Crie a configuração em `/etc/nginx/sites-available/baileys.conf` (veja `nginx/baileys.conf` neste repo) e habilite:
```
sudo ln -s /etc/nginx/sites-available/baileys.conf /etc/nginx/sites-enabled/baileys.conf
sudo nginx -t && sudo systemctl reload nginx
```
- Obtenha o certificado:
```
sudo certbot --nginx -d baileys.conversaexpress.com.br
sudo certbot renew --dry-run
```

## 6) Backups e logrotate

- Instale o script de backup em `/usr/local/bin/baileys-backup.sh` (veja `scripts/baileys-backup.sh`) e configure cron diário.
- Logrotate para `wa-logs.txt`: copie conteúdo de `nginx/logrotate-baileys.txt` para `/etc/logrotate.d/baileys`.

## 7) Testes

- Local:
```
curl -v -H "Authorization: Bearer <ADMIN_TOKEN>" http://127.0.0.1:3333/status
```
- HTTPS:
```
curl -v -H "Authorization: Bearer <ADMIN_TOKEN>" https://baileys.conversaexpress.com.br/status
```

## 8) Troubleshooting

- Sessão não restaura: verifique se `baileys_auth_info/` foi copiado intacto e com permissões para o usuário `baileys`.
- 401/403: confira `ADMIN_TOKEN` no `.env` e o header `Authorization: Bearer ...`.
- Certificados: `sudo certbot renew --dry-run` e logs do nginx `/var/log/nginx/*`.
- Logs do app: `sudo -u baileys pm2 logs baileys-api` e `/opt/baileys/wa-logs.txt`.

# Baileys Test API

Minimal WhatsApp connector using Baileys with a small admin UI to view QR and request pairing codes.

## Features
- Web admin UI (GET `/`) showing QR + pairing code and simple controls to start connection
- REST endpoints to check status, request pairing codes and send messages
- Persisted UI state at `./tmp/baileys-ui-state.json`
- Protected admin endpoints using `ADMIN_TOKEN` env var (optional for dev)

## Endpoints
- GET `/` — HTML admin UI
- GET `/status` — JSON: `{ qr, pairingCode, connection }`
  - Requires `Authorization: Bearer <ADMIN_TOKEN>` header if configured
- POST `/connect` — triggers socket start (non-blocking). Returns `{ message: 'starting' }` or `{ message: 'socket already started' }`
- POST `/pair-code` — body `{ phone: '+55...' }` calls `requestPairingCode` on the socket and returns `{ pairingCode }`
  - Requires auth when `ADMIN_TOKEN` is set
- POST `/send` — body `{ jid, message }` sends a text message; returns the send result
  - Requires auth when `ADMIN_TOKEN` is set

## Env
- `ADMIN_TOKEN` — optional token to protect admin endpoints
- `PORT` — port to run HTTP server (default 3333)

## Local development
Requirements: Node 18+, npm

Install deps:
```powershell
npm install
```

Run in dev mode (tsx transformer):
```powershell
npm run dev
```

Run TypeScript check:
```powershell
npx tsc --noEmit
```

## Production
This repository includes a `tsconfig.server.json` to build a production `lib/` output.

Build (produces `lib/`):
```powershell
npm run build
```

Start (production):
```powershell
npm run start
```

### Docker (example)
Build image:
```powershell
docker build -t baileys-teste:latest .
```
Run container (example):
```powershell
docker run -d --name baileys-teste -p 3333:3333 -e ADMIN_TOKEN=yourtoken -v ${PWD}/baileys_auth_info:/app/baileys_auth_info -v ${PWD}/tmp:/app/tmp baileys-teste:latest
```

### Running on a VPS (systemd)
Create a systemd unit (example `baileys-teste.service`) to run `npm run start` under a dedicated user. See `examples/`.

## GitHub push
1. Create a repository on GitHub
2. Add remote and push:
```powershell
git remote add origin git@github.com:<your-user>/<repo>.git
git push -u origin main
```

## Troubleshooting
- If you get an esbuild transform error complaining about `??` and `||`, rewrite mixed expressions or run with `tsc --noEmit` to find TS issues.

## Sobre o botão "Criar PR"
No ambiente do Codex você verá um botão **Criar PR** depois de efetuar um `git commit`. Esse botão apenas envia o resumo que você montou para o revisor humano, simulando a abertura de um pull request. Ele não interage com o GitHub real; é uma etapa obrigatória do fluxo para compartilhar o que foi feito.

## License
MIT

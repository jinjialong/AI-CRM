# Deploy

## Live Host
- Host: `123.207.221.28`
- User: `ubuntu`
- SSH port: `22`
- SSH password: `123456.Jjl`
- App root: `/home/ubuntu/apps/ai-crm`
- OS: `Ubuntu 22.04.5 LTS`
- BT panel dir: `/www/server/panel`
- BT panel public URL: `https://123.207.221.28:14082/9655c3f0`
- BT panel private URL: `https://10.0.0.11:14082/9655c3f0`
- BT panel port: `14082`
- BT panel username: `t8dq34fa`
- BT panel password: not recoverable in plaintext from current checks; use `bt 5` on the server to reset if needed
- Port `888` is listening on the server, but the confirmed BT panel entry is `14082`

## Runtime Layout
- `ai-crm-frontend`
  - PM2 app
  - command: `npm start -- --hostname 0.0.0.0 --port 6100`
- `ai-crm-backend`
  - PM2 app
  - command: `bash -lc 'source .venv/bin/activate && exec uvicorn app.main:app --host 0.0.0.0 --port 6101'`

## Environment
- Frontend build env: `NEXT_PUBLIC_API_BASE_URL=http://123.207.221.28:6101/api/v1`
- Backend env is injected by `ecosystem.config.cjs`
- Keep server `.env`, SQLite data, and other PM2 apps intact
- This file contains sensitive access details and should stay private

## Deploy Flow
1. Sync runtime code into `/home/ubuntu/apps/ai-crm`
2. Stop only `ai-crm-frontend` and `ai-crm-backend`
3. Remove stale `src/frontend/.next` and backend `__pycache__`
4. Run `cd /home/ubuntu/apps/ai-crm/src/frontend && NEXT_PUBLIC_API_BASE_URL=... npm run build`
5. Run `pm2 startOrRestart /home/ubuntu/apps/ai-crm/ecosystem.config.cjs --update-env`
6. Run `pm2 save`

## Verification
- `ss -ltnp | grep -E ':6100|:6101'`
- `curl -I http://127.0.0.1:6100`
- `curl -s -o /dev/null -w 'openapi:%{http_code}\n' http://127.0.0.1:6101/openapi.json`

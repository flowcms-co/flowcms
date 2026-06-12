#!/usr/bin/env bash
###############################################################################
# Flow CMS all-in-one entrypoint (one-click PaaS: Railway / Render / Fly).
#
# One container, one public port. First-boot bootstrap (wait for DB -> migrate
# -> seed), then run three processes side by side:
#   • the NestJS API           on 127.0.0.1:$API_PORT
#   • the Next.js studio        on 127.0.0.1:$STUDIO_PORT
#   • Caddy (reverse proxy)     on 0.0.0.0:$PORT  (the platform routes here)
# If ANY of the three exits, the container exits so the platform restarts it.
###############################################################################
set -e

log() { echo "[flowcms] $*"; }

# --- required config (defense in depth; the API also guards in production) ----
[ -n "${DATABASE_URL}" ] || { log "FATAL: DATABASE_URL is required"; exit 1; }
case "${SECRETS_ENCRYPTION_KEY}" in
  ""|*replace_me*) log "FATAL: SECRETS_ENCRYPTION_KEY is missing or a placeholder"; exit 1 ;;
esac
case "${JWT_SECRET}" in
  ""|*replace_me*) log "FATAL: JWT_SECRET is missing or a placeholder"; exit 1 ;;
esac

# --- public URL: honour STUDIO_URL, else derive from the platform's domain ----
# (used for CORS, websockets and email links; same-origin works without it).
if [ -z "${STUDIO_URL}" ]; then
  if [ -n "${RAILWAY_PUBLIC_DOMAIN}" ]; then
    export STUDIO_URL="https://${RAILWAY_PUBLIC_DOMAIN}"
  elif [ -n "${RENDER_EXTERNAL_URL}" ]; then
    export STUDIO_URL="${RENDER_EXTERNAL_URL}"
  fi
  [ -n "${STUDIO_URL}" ] && log "Derived STUDIO_URL=${STUDIO_URL}"
fi

SCHEMA="packages/db/prisma/schema.prisma"

# --- wait for Postgres (uses the same Prisma engine the app uses) -------------
log "Waiting for the database..."
i=0
until node -e 'const{PrismaClient}=require("@prisma/client");const p=new PrismaClient();p.$queryRaw`SELECT 1`.then(()=>process.exit(0)).catch(()=>process.exit(1))' >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -ge 60 ]; then
    log "FATAL: database not reachable after ~120s"
    exit 1
  fi
  sleep 2
done
log "Database is ready."

# --- apply migrations + bootstrap (production-safe, idempotent, no deletes) ---
log "Applying migrations..."
node node_modules/.bin/prisma migrate deploy --schema="$SCHEMA"
# Runs prisma/bootstrap.ts (workspace + roles + admin via upsert), NOT the
# destructive demo seed.ts. Set SEED_ON_BOOT=false to skip once provisioned.
if [ "${SEED_ON_BOOT:-true}" = "true" ]; then
  log "Bootstrapping workspace, roles and admin (idempotent)..."
  node node_modules/.bin/tsx packages/db/prisma/bootstrap.ts
fi

# --- run API + studio + proxy side by side -----------------------------------
API_PORT="${API_PORT:-4000}"
STUDIO_PORT="${STUDIO_PORT:-3000}"
export PORT="${PORT:-8080}"

set +e   # past bootstrap — manage the three children manually

log "Starting API on :${API_PORT}..."
( cd /app && API_PORT="${API_PORT}" exec node apps/api/dist/main.js ) &
API_PID=$!

log "Starting studio on :${STUDIO_PORT}..."
( cd /app/studio && PORT="${STUDIO_PORT}" HOSTNAME=127.0.0.1 exec node apps/studio/server.js ) &
STUDIO_PID=$!

log "Starting proxy on :${PORT} (/api,/media,/socket.io -> API; everything else -> studio)..."
caddy run --config /etc/caddy/Caddyfile --adapter caddyfile &
CADDY_PID=$!

# Forward shutdown signals; if any child exits, take the container down.
trap 'log "received shutdown signal"; kill "$API_PID" "$STUDIO_PID" "$CADDY_PID" 2>/dev/null' TERM INT
wait -n "$API_PID" "$STUDIO_PID" "$CADDY_PID"
log "a service exited — stopping the container so the platform restarts it"
kill "$API_PID" "$STUDIO_PID" "$CADDY_PID" 2>/dev/null
exit 1

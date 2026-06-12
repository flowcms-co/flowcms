#!/bin/sh
###############################################################################
# Flow CMS API container entrypoint.
# First-boot bootstrap (wait for DB -> migrate -> bootstrap) then start the server.
# Runs on every boot; migrate + bootstrap are idempotent and non-destructive, so
# restarts are safe. NOTE: this runs prisma/bootstrap.ts (workspace + roles +
# admin via upsert, no deletes), NOT the destructive demo seed.ts.
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

# --- apply migrations (production-safe, idempotent) --------------------------
# NOTE: call prisma/tsx directly — the `npm run db:*` scripts wrap them in
# `dotenv -e ../../.env`, but in the container env comes from the process, not a
# .env file.
log "Applying migrations..."
node node_modules/.bin/prisma migrate deploy --schema="$SCHEMA"

# --- bootstrap default workspace + roles + Super Admin (idempotent, no deletes) -
# Safe to run on every boot. Set SEED_ON_BOOT=false to skip once provisioned.
if [ "${SEED_ON_BOOT:-true}" = "true" ]; then
  log "Bootstrapping workspace, roles and admin (idempotent)..."
  node node_modules/.bin/tsx packages/db/prisma/bootstrap.ts
fi

# --- start (exec so SIGTERM reaches Node for graceful shutdown) ---------------
log "Starting Flow CMS API..."
exec node apps/api/dist/main.js

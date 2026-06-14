# syntax=docker/dockerfile:1
###############################################################################
# Flow CMS — production image (multi-stage, multi-target)
#
#   API:    docker build -f deploy/Dockerfile --target api-runner    -t flowcms-api .
#   Studio: docker build -f deploy/Dockerfile --target studio-runner \
#             --build-arg NEXT_PUBLIC_API_URL=/api -t flowcms-studio .
#
# IMPORTANT: build context MUST be the repo root (it needs the root lockfile and
# the whole workspace graph). Debian slim (not Alpine) so `sharp` + the Prisma
# query engine use prebuilt binaries cleanly.
###############################################################################

# ---- base: shared runtime layer --------------------------------------------
# Node 22 LTS: required by undici@8 (>=22.19) used in the API's SSRF guard.
FROM node:22-bookworm-slim AS base
# openssl + ca-certificates: Prisma query engine (TLS) on Debian.
# dumb-init: proper PID 1 (signal forwarding + zombie reaping).
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates dumb-init \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production

# ---- deps: install ALL workspace deps (incl. devDeps, for building) ---------
FROM base AS deps
ENV NODE_ENV=development
# Copy manifests first so this layer is cached until a package.json changes.
COPY package.json package-lock.json ./
COPY apps/api/package.json        apps/api/package.json
COPY apps/studio/package.json     apps/studio/package.json
COPY packages/db/package.json     packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/cli/package.json    packages/cli/package.json
COPY packages/client/package.json packages/client/package.json
RUN npm ci

# ---- builder: compile shared -> db (prisma generate) -> api -> studio -------
FROM deps AS builder
# Build in production mode. devDeps are already present from the `deps` layer, so
# this only affects build behaviour (e.g. `next build` must NOT run as
# development, or its static prerender pass fails).
ENV NODE_ENV=production
# Baked into the studio browser bundle. Relative `/api` keeps the image
# domain-agnostic (same-origin behind the reverse proxy).
ARG NEXT_PUBLIC_API_URL=/api
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
COPY . .
# Order matters: db's build runs `prisma generate`, which api + studio need.
RUN npm run build -w @flowcms/shared \
 && npm run build -w @flowcms/db \
 && npm run build -w @flowcms/api \
 && npm run build -w @flowcms/studio
# Strip source maps from the API build so the production image doesn't ship
# original TypeScript (defense-in-depth; the API serves only JSON). The studio
# browser bundle already omits maps (productionBrowserSourceMaps off).
RUN find apps/api/dist packages/*/dist -name '*.map' -delete 2>/dev/null || true

###############################################################################
# api-runner — NestJS API. Self-bootstraps (migrate + seed) then starts.
###############################################################################
FROM base AS api-runner
WORKDIR /app
# Stamped from the git tag by the release workflow; surfaced via GET /system/version.
ARG FLOWCMS_VERSION=
ENV NODE_ENV=production \
    API_PORT=4000 \
    MEDIA_DIR=/app/storage/media \
    FLOWCMS_VERSION=${FLOWCMS_VERSION} \
    FLOWCMS_DEPLOYMENT=compose
# Built app + the full workspace node_modules. We ship the whole node_modules so
# the entrypoint has the Prisma CLI, `tsx` (to run the TS seed), the generated
# query engine, and the @flowcms/* workspace symlinks (which resolve into
# ./packages, copied below).
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/packages ./packages
COPY deploy/docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh \
 && mkdir -p /app/storage/media \
 && chown -R node:node /app/storage
USER node
EXPOSE 4000
ENTRYPOINT ["dumb-init", "--", "/app/docker-entrypoint.sh"]

###############################################################################
# studio-runner — Next.js standalone server (lean, self-contained).
###############################################################################
FROM base AS studio-runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# Standalone server + its traced node_modules. Because outputFileTracingRoot is
# the repo root, the entry lands at apps/studio/server.js and the monorepo layout
# is preserved.
COPY --from=builder /app/apps/studio/.next/standalone ./
# Static assets the standalone server serves itself (NOT auto-included by Next).
COPY --from=builder /app/apps/studio/.next/static ./apps/studio/.next/static
COPY --from=builder /app/apps/studio/public ./apps/studio/public
USER node
EXPOSE 3000
CMD ["node", "apps/studio/server.js"]

###############################################################################
# all-in-one — single-service image for one-click PaaS (Railway / Render / Fly):
# Caddy (on $PORT) + the API (:4000) + the studio (:3000) in one container.
# This is the LAST stage, so `docker build` / Railway build it by default.
#   docker build -f deploy/Dockerfile -t flowcms .
###############################################################################
FROM base AS all-in-one
WORKDIR /app
ARG FLOWCMS_VERSION=
ENV NODE_ENV=production \
    PORT=8080 \
    API_PORT=4000 \
    STUDIO_PORT=3000 \
    MEDIA_DIR=/app/storage/media \
    FLOWCMS_VERSION=${FLOWCMS_VERSION} \
    FLOWCMS_DEPLOYMENT=aio
# Caddy binary (single static Go binary) for the in-container reverse proxy.
COPY --from=caddy:2 /usr/bin/caddy /usr/bin/caddy
# API runtime (full node_modules: Prisma CLI + tsx for the boot migrate/seed).
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/packages ./packages
# Studio standalone, isolated under ./studio so its traced node_modules + layout
# don't collide with the API's /app tree.
COPY --from=builder /app/apps/studio/.next/standalone ./studio/
COPY --from=builder /app/apps/studio/.next/static ./studio/apps/studio/.next/static
COPY --from=builder /app/apps/studio/public ./studio/apps/studio/public
# Proxy config + entrypoint.
COPY deploy/Caddyfile.aio /etc/caddy/Caddyfile
COPY deploy/aio-entrypoint.sh /app/aio-entrypoint.sh
# Caddy keeps its (minimal — auto_https is off) state under the XDG dirs; point
# them at app-owned paths so the container can run as a non-root user.
ENV XDG_DATA_HOME=/app/.local/share \
    XDG_CONFIG_HOME=/app/.config
RUN chmod +x /app/aio-entrypoint.sh \
 && mkdir -p /app/storage/media /app/.local/share /app/.config \
 && chown -R node:node /app/storage /app/.local /app/.config
# Drop root (SECURITY_AUDIT_REPORT F-03). The API, studio and Caddy all bind
# non-privileged ports ($PORT/$API_PORT/$STUDIO_PORT) and Caddy's auto_https is
# off, so no privileged-port capability is required.
USER node
EXPOSE 8080
ENTRYPOINT ["dumb-init", "--", "/app/aio-entrypoint.sh"]

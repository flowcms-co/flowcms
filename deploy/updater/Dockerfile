# Flow CMS updater sidecar — Docker CLI + compose plugin (to pull/recreate the
# stack) + Node (the server) + tar/gzip (media archives) + the postgres client
# (pg_dump/psql). The DB backup/restore connect to Postgres directly over the
# network rather than via `docker exec`, so they work even when the updater has no
# direct Docker socket (the scoped socket-proxy can't forward exec/attach streams).
FROM docker:27-cli

RUN apk add --no-cache nodejs tar gzip postgresql16-client

WORKDIR /app
COPY server.mjs ./

# Stamped at build time so the sidecar can report its own version.
ARG FLOWCMS_VERSION=
ENV NODE_ENV=production \
    UPDATER_PORT=9000 \
    FLOWCMS_VERSION=${FLOWCMS_VERSION}

# Only reachable on the internal docker network; never publish this port.
EXPOSE 9000
ENTRYPOINT ["node", "server.mjs"]

# Flow CMS updater sidecar — Docker CLI + compose plugin (to pull/recreate the
# stack) + Node (the server) + postgres-client tools come from the postgres
# container via `docker exec`, so only tar/gzip are needed here.
FROM docker:27-cli

RUN apk add --no-cache nodejs tar gzip

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

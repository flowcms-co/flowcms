#!/usr/bin/env bash
###############################################################################
# Flow CMS — one-line self-host installer.
#
#   curl -fsSL https://get.flowcms.co/install.sh | bash
#   # or non-interactive:
#   curl -fsSL https://get.flowcms.co/install.sh | DOMAIN=cms.you.com ACME_EMAIL=you@you.com bash
#
# What it does: installs Docker (if missing), drops the deploy files into
# /opt/flowcms, generates strong secrets, writes .env, and starts the stack
# (Caddy + studio + api + Postgres) with automatic HTTPS on your domain.
# You create your admin account in the browser on first open (the /welcome wizard).
#
# Idempotent: re-running updates images + restarts. It NEVER overwrites an
# existing .env or regenerates secrets (that would break encrypted data).
#
# Useful overrides (env vars):
#   FLOWCMS_DIR        install dir (default /opt/flowcms)
#   DOMAIN            your domain (skips the prompt)
#   ACME_EMAIL        Let's Encrypt (HTTPS cert) contact email (skips the prompt)
#                     ADMIN_EMAIL is accepted as an alias for backward compatibility
#   BUILD_FROM_SOURCE=1   build images on this box instead of pulling
#   API_IMAGE / STUDIO_IMAGE   prebuilt image refs to pull
###############################################################################
set -euo pipefail

FLOWCMS_DIR="${FLOWCMS_DIR:-/opt/flowcms}"
# Where to fetch the deploy assets (compose + Caddyfile + env template) from.
FLOWCMS_RAW="${FLOWCMS_RAW:-https://raw.githubusercontent.com/flowcms-co/flowcms/main/deploy}"
# Prebuilt images (pull path). Override to your registry once published.
API_IMAGE="${API_IMAGE:-ghcr.io/flowcms-co/flowcms-api:latest}"
STUDIO_IMAGE="${STUDIO_IMAGE:-ghcr.io/flowcms-co/flowcms-studio:latest}"
# The updater sidecar (in-app backups + one-click upgrade). Privileged: it mounts
# the Docker socket and is reachable only on the internal network (token-gated).
UPDATER_IMAGE="${UPDATER_IMAGE:-ghcr.io/flowcms-co/flowcms-updater:latest}"
# Build-from-source path (works today, before images are published).
BUILD_FROM_SOURCE="${BUILD_FROM_SOURCE:-0}"
FLOWCMS_REPO="${FLOWCMS_REPO:-https://github.com/flowcms-co/flowcms.git}"

bold() { printf '\n\033[1m%s\033[0m\n' "$*"; }
info() { printf '  %s\n' "$*"; }
ok()   { printf '\033[32m  ✓ %s\033[0m\n' "$*"; }
warn() { printf '\033[33m  ! %s\033[0m\n' "$*"; }
die()  { printf '\033[31m  ✗ %s\033[0m\n' "$*" >&2; exit 1; }

SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  command -v sudo >/dev/null 2>&1 || die "Run as root, or install sudo."
  SUDO="sudo"
fi

bold "Flow CMS installer"

# --- 1. Docker --------------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  info "Docker not found — installing (get.docker.com)…"
  curl -fsSL https://get.docker.com | $SUDO sh >/dev/null
  $SUDO systemctl enable --now docker >/dev/null 2>&1 || true
  ok "Docker installed"
fi
docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is required (update Docker)."
$SUDO docker info >/dev/null 2>&1 || die "The Docker daemon isn't running."
ok "Docker is ready"

# --- 2. Deploy assets -------------------------------------------------------
$SUDO mkdir -p "$FLOWCMS_DIR"
if [ "$BUILD_FROM_SOURCE" = "1" ]; then
  command -v git >/dev/null 2>&1 || die "git is required for BUILD_FROM_SOURCE."
  if [ -d "$FLOWCMS_DIR/.git" ]; then
    $SUDO git -C "$FLOWCMS_DIR" pull --ff-only >/dev/null 2>&1 || true
  else
    info "Cloning Flow CMS source…"
    $SUDO git clone --depth 1 "$FLOWCMS_REPO" "$FLOWCMS_DIR" >/dev/null
  fi
  APP_DIR="$FLOWCMS_DIR/deploy"
  ok "Source ready at $FLOWCMS_DIR"
else
  info "Fetching deploy files…"
  $SUDO curl -fsSL "$FLOWCMS_RAW/docker-compose.prod.yml" -o "$FLOWCMS_DIR/docker-compose.prod.yml"
  $SUDO curl -fsSL "$FLOWCMS_RAW/Caddyfile" -o "$FLOWCMS_DIR/Caddyfile"
  $SUDO curl -fsSL "$FLOWCMS_RAW/.env.production.example" -o "$FLOWCMS_DIR/.env.production.example"
  APP_DIR="$FLOWCMS_DIR"
  ok "Deploy files in $FLOWCMS_DIR"
fi
cd "$APP_DIR"

compose() { $SUDO docker compose -f docker-compose.prod.yml "$@"; }

# --- 3. .env (generate once; never overwrite) -------------------------------
if [ -f .env ]; then
  ok "Existing .env found — keeping your secrets"
  # .env is root-owned, mode 600 — read it with $SUDO so a non-root re-run
  # doesn't die on "Permission denied". `|| true` guards set -e under pipefail.
  DOMAIN="$($SUDO grep -E '^DOMAIN=' .env | head -1 | cut -d= -f2- || true)"
else
  command -v openssl >/dev/null 2>&1 || die "openssl is required to generate secrets."
  bold "Configure your install"
  if [ -z "${DOMAIN:-}" ]; then
    printf '  Domain (point its DNS A record at this server), e.g. cms.yoursite.com: '
    read -r DOMAIN </dev/tty
  fi
  [ -n "${DOMAIN:-}" ] || die "A domain is required."
  # Email is only the Let's Encrypt (HTTPS certificate) contact — NOT your login.
  # You create your admin account in the browser on first open (the /welcome wizard).
  # ADMIN_EMAIL is still accepted as an alias so existing non-interactive runs work.
  ACME_EMAIL="${ACME_EMAIL:-${ADMIN_EMAIL:-}}"
  if [ -z "${ACME_EMAIL:-}" ]; then
    printf '  Email for HTTPS certificate (Let'\''s Encrypt contact): '
    read -r ACME_EMAIL </dev/tty
  fi
  [ -n "${ACME_EMAIL:-}" ] || die "An email is required for the HTTPS certificate."

  gen()   { openssl rand -base64 32; }
  alnum() { openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c "${1:-28}"; }
  DB_PASS="$(alnum 28)"

  info "Generating secrets + writing .env…"
  $SUDO tee .env >/dev/null <<EOF
# Generated by install.sh — keep private. Back this file up.
DOMAIN=$DOMAIN
ACME_EMAIL=$ACME_EMAIL
POSTGRES_USER=flowcms
POSTGRES_PASSWORD=$DB_PASS
POSTGRES_DB=flowcms
DATABASE_URL=postgresql://flowcms:$DB_PASS@postgres:5432/flowcms?schema=public
SECRETS_ENCRYPTION_KEY=$(gen)
JWT_SECRET=$(gen)
NODE_ENV=production
STUDIO_URL=https://$DOMAIN
TRUST_PROXY=1
NEXT_PUBLIC_API_URL=/api
# No SEED_ADMIN_* here: the instance boots UNCLAIMED and you create your admin
# account in the browser on first open (the /welcome first-run wizard). To instead
# provision the admin non-interactively, add SEED_ADMIN_EMAIL + SEED_ADMIN_PASSWORD.
SEED_ON_BOOT=true
API_IMAGE=$API_IMAGE
STUDIO_IMAGE=$STUDIO_IMAGE
# In-app backups + one-click upgrade (the updater sidecar). The API talks to it
# with this shared token; FLOWCMS_HOST_DIR is THIS dir, mounted so it can read
# .env + the compose file and write backups/.
UPDATER_TOKEN=$(gen)
FLOWCMS_HOST_DIR=$FLOWCMS_DIR
UPDATER_IMAGE=$UPDATER_IMAGE
EOF
  $SUDO chmod 600 .env
  ok ".env created"
fi

# --- 3a. Backfill the updater keys on existing installs ----------------------
# Installs created before the updater existed have no UPDATER_TOKEN, but the
# compose file now requires one. Add the missing keys without touching secrets.
if ! $SUDO grep -qE '^UPDATER_TOKEN=' .env; then
  command -v openssl >/dev/null 2>&1 || die "openssl is required to add the updater token."
  info "Enabling in-app backups + upgrades (adding updater keys to .env)…"
  $SUDO tee -a .env >/dev/null <<EOF

# In-app backups + one-click upgrade (added on upgrade of this installer).
UPDATER_TOKEN=$(openssl rand -base64 32)
FLOWCMS_HOST_DIR=$FLOWCMS_DIR
UPDATER_IMAGE=$UPDATER_IMAGE
EOF
  ok "Updater enabled"
elif ! $SUDO grep -qE '^FLOWCMS_HOST_DIR=' .env; then
  $SUDO tee -a .env >/dev/null <<EOF
FLOWCMS_HOST_DIR=$FLOWCMS_DIR
EOF
fi

# --- 3.5 DNS sanity check (warn only) ---------------------------------------
# Caddy can only get an HTTPS cert if $DOMAIN's A record points at THIS server
# and ports 80/443 are open. The #1 first-deploy snag on AWS/GCP/Azure. We warn
# but never block: Caddy keeps retrying, so it self-heals once DNS/ports are set.
if [ "$DOMAIN" != "localhost" ]; then
  info "Checking DNS for $DOMAIN…"
  server_ip="$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null \
    || curl -fsS --max-time 5 https://checkip.amazonaws.com 2>/dev/null || true)"
  server_ip="$(printf '%s' "$server_ip" | tr -d '[:space:]')"
  domain_ip="$(dig +short A "$DOMAIN" 2>/dev/null | tail -1)"
  [ -n "$domain_ip" ] || domain_ip="$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk '{print $1; exit}')"
  if [ -n "$server_ip" ] && [ "$server_ip" = "$domain_ip" ]; then
    ok "DNS OK — $DOMAIN -> $server_ip"
  elif [ -z "$domain_ip" ]; then
    warn "$DOMAIN does not resolve yet. Add a DNS A record pointing it at this server${server_ip:+ ($server_ip)}."
    warn "HTTPS will fail until DNS resolves and ports 80 + 443 are open. Continuing…"
  else
    warn "$DOMAIN resolves to $domain_ip but this server looks like ${server_ip:-an unknown IP}."
    warn "If you proxy DNS (e.g. Cloudflare) this can be expected; otherwise fix the A record. Continuing…"
  fi
fi

# --- 4. Start ----------------------------------------------------------------
if [ "$BUILD_FROM_SOURCE" = "1" ]; then
  bold "Building images (a few minutes on first run)…"
  compose up -d --build
else
  bold "Pulling images…"
  compose pull
  compose up -d
fi

# --- 5. Wait for health ------------------------------------------------------
info "Waiting for Flow CMS to come up (first boot runs migrations + seed)…"
i=0
until curl -fsSk "https://$DOMAIN/api/health" >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -ge 60 ]; then
    warn "Flow CMS did not pass its public health check in time."
    warn "On AWS/GCP/Azure the cause is almost always the cloud firewall or DNS, not the app:"
    warn "  • Open inbound ports 80 AND 443 in your security group / firewall"
    warn "    (Caddy needs port 80 to obtain the Let's Encrypt certificate)."
    warn "  • Point $DOMAIN's DNS A record at this server."
    warn "Once both are set, Caddy issues the cert automatically (~1 min). Then open https://$DOMAIN."
    warn "Logs:  cd $APP_DIR && docker compose -f docker-compose.prod.yml logs -f"
    break
  fi
  sleep 5
done

# --- 6. Done -----------------------------------------------------------------
bold "Flow CMS is up 🎉"
ok "Open: https://$DOMAIN"
printf '\n  \033[1mFinish setup in your browser:\033[0m\n'
info "Open https://$DOMAIN and create your admin account (email + password)."
info "You'll then be guided through the rest of setup."
printf '\n'
info "Files + secrets: $APP_DIR/.env  (back this up; keep it private)"
info "Manage:  cd $APP_DIR && docker compose -f docker-compose.prod.yml [logs -f | restart | down]"
info "Update:  in the studio under Settings → System (one-click, with backup + rollback),"
info "         or re-run this installer (pulls newer images + restarts)"
info "Backups: Settings → System (full snapshot: database + media + secrets)"

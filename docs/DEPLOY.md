# Deploying Flow CMS

Flow CMS is fully self hosted. There is no Flow CMS cloud, you own every
deployment. This guide covers the two supported paths:

1. **Your own server** (a Linux VPS), via the one line installer.
2. **A managed platform** (Railway or Render), via a published image.

Only **Postgres** is required. Redis is optional, and media can live on local
disk or any S3 compatible bucket.

---

## Path 1: your own server (one line installer)

Best when you have a fresh Linux box (Ubuntu, Debian, etc.) and a domain you can
point at it.

### Prerequisites

- A VPS with a public IP (1 vCPU / 1 GB RAM is enough to start).
- A domain or subdomain (for example `cms.yoursite.com`) with a DNS **A record**
  pointing at the server's IP.
- Port 80 and 443 open.

### Install

```bash
curl -fsSL https://get.flowcms.co/install.sh | bash
```

Or non interactively:

```bash
curl -fsSL https://get.flowcms.co/install.sh | DOMAIN=cms.yoursite.com ACME_EMAIL=you@yoursite.com bash
```

The installer:

- installs Docker if it is missing,
- drops the deploy files into `/opt/flowcms`,
- generates strong secrets and writes a private `.env`,
- starts the stack (Caddy + studio + API + Postgres) with automatic HTTPS via
  Let's Encrypt.

It is idempotent: re run it any time to pull newer images and restart. It never
overwrites an existing `.env` or regenerates secrets.

### First run

Open `https://your-domain` in a browser. The first visit launches the `/welcome`
wizard where you create your admin account. There are no default credentials.

### Manage

```bash
cd /opt/flowcms
docker compose -f docker-compose.prod.yml logs -f     # follow logs
docker compose -f docker-compose.prod.yml restart      # restart
docker compose -f docker-compose.prod.yml down         # stop
```

Back up `/opt/flowcms/.env`. It holds your secrets, and losing
`SECRETS_ENCRYPTION_KEY` makes stored credentials unrecoverable.

---

## Path 2: managed platform (Railway or Render)

Best when you do not want to run a server. Both pull the prebuilt all in one
image `ghcr.io/flowcms-co/flowcms:latest` and provision a managed Postgres.

### Railway

1. Create a new project (or use the **Deploy on Railway** button in the README).
2. Set the service **source to the prebuilt image** `ghcr.io/flowcms-co/flowcms:latest`
   (Service > Settings > Source > Docker Image) and the health check path to
   `/api/health`. Pulling the image is faster than building from the repo and reports
   the correct version, which is baked into the image at release.
3. Add a **PostgreSQL** plugin. Railway sets `DATABASE_URL` for you.
4. Set the required environment variables (below); include `TRUST_PROXY=1`.
5. Deploy. On first load you are taken to the `/welcome` wizard to create your
   admin account.

**Updating to a new release:** click **Redeploy** to pull the newer `:latest` (or point
the image at the new `:vX.Y.Z`). Database migrations apply automatically on boot. The
platform manages updates here, so the in-app **Settings > System** panel shows "managed
by your platform" instead of an upgrade button (the one-click in-app upgrade is for the
docker-compose self-host).

> Prefer to build from the repo instead? `railway.json` builds `deploy/Dockerfile`. That
> works, but set a `FLOWCMS_VERSION=<version>` service variable so the version reads
> correctly (Railway forwards service variables to the build as build args). The prebuilt
> image bakes this in for you, which is why pulling it is the simpler default.

### Render

The repo ships a `render.yaml` blueprint. In Render choose **New > Blueprint**,
connect the repo, and it provisions the app plus a managed Postgres and generates
the secrets. `STUDIO_URL` is derived automatically.

---

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string. |
| `SECRETS_ENCRYPTION_KEY` | yes | `openssl rand -base64 32`. Never change after first boot. |
| `JWT_SECRET` | yes | `openssl rand -base64 32`. |
| `NODE_ENV` | yes | `production`. |
| `STUDIO_URL` | yes | Public URL of the studio, for example `https://cms.yoursite.com`. |
| `NEXT_PUBLIC_API_URL` | no | Defaults to `/api` in the all in one image. |
| `TRUST_PROXY` | no | Set to `1` behind a reverse proxy / managed platform. |
| `SEED_ON_BOOT` | no | `true` runs first boot setup (workspace + roles). |
| `FLOWCMS_VERSION` | no | Baked into prebuilt images. Only set it when building from source (e.g. a Railway repo build) so Settings > System reports the right version. |

Generate the two secrets with:

```bash
openssl rand -base64 32   # run twice, one value each
```

---

## Media storage (important for managed platforms)

On Railway and Render the container filesystem is **ephemeral**: uploaded media on
the local disk is lost on every redeploy or restart. For any real use, point media
at an S3 compatible bucket (Cloudflare R2, Supabase Storage, AWS S3) so the app
stays stateless:

| Variable | Notes |
|---|---|
| `STORAGE_DRIVER` | `s3` |
| `S3_BUCKET` | bucket name |
| `S3_ENDPOINT` | provider endpoint (R2 / Supabase / S3) |
| `S3_ACCESS_KEY_ID` | access key |
| `S3_SECRET_ACCESS_KEY` | secret key |
| `S3_REGION` | region (use `auto` for R2) |
| `S3_PUBLIC_URL` | public base URL for served files |

Self hosted installs via the installer use local disk by default, which persists
across restarts, so S3 is optional there.

---

## Images

The release workflow publishes three images to GHCR on every version tag:

- `ghcr.io/flowcms-co/flowcms` : all in one (studio + API + proxy, one port). Used
  by Railway and Render.
- `ghcr.io/flowcms-co/flowcms-api` : the NestJS API. Used by the compose self host.
- `ghcr.io/flowcms-co/flowcms-studio` : the Next.js studio. Used by the compose
  self host.

To pin a deploy to a specific release instead of `latest`, use the tagged image,
for example `ghcr.io/flowcms-co/flowcms:v0.1.0`.

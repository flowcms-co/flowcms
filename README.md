# Flow CMS

An AI-powered, self-hostable headless CMS — content modeling, a public content API,
an AI tool suite (bring-your-own provider keys), SEO/analytics ingestion, messaging,
notifications, webhooks, and an agent API.

## Monorepo layout

```
flowcms/
├── apps/
│   ├── studio/        # Admin UI (Next.js 16) — the screens you click
│   └── api/           # Headless backend (NestJS) — the "kitchen"
├── packages/
│   ├── db/            # Prisma schema + client (the data model)
│   └── shared/        # Crypto (secrets vault, passwords), permissions/roles
├── docker-compose.yml # Postgres + Redis + Meilisearch ("the box")
└── .env.example       # Copy to .env and fill in
```

The studio and API are separate so the UI can change freely without touching the
backend, and so other websites and AI agents can connect to the same API.

## Deploy

Three ways to run Flow CMS in production — you own all of them (there's no Flow
CMS cloud).

- **Managed platform (no server to run)** — one all-in-one container on Railway or
  Render, with managed Postgres + HTTPS. Easiest for non-developers.

  [![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new) &nbsp; (Railway → New Project → Deploy from repo; see the 5 steps in the deploy guide)

- **Your own server** — `curl -fsSL https://get.flowcms.co/install.sh | bash` on a
  fresh VPS: Docker + Caddy auto-HTTPS, ~2 minutes.
- **Front-end + managed back-end** — your site on Netlify/Vercel reading Flow CMS
  hosted on Railway/Render, with Neon/Supabase Postgres and R2/Supabase asset
  storage. See the deploy guide's "managed topology".

## Requirements

- Node.js 22+
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (runs the databases)

## First run

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
#    then set SECRETS_ENCRYPTION_KEY and JWT_SECRET:
#    openssl rand -base64 32   (run twice, paste each value)

# 3. Start the databases ("the box")
npm run infra:up

# 4. Create the database tables + generate the client
npm run db:generate
npm run db:migrate

# 5. Seed the default workspace, roles, and Super Admin
npm run db:seed

# 6. Run the studio + API together
npm run dev
```

- Studio: http://localhost:3000
- API health check: http://localhost:4000/api/health

## Handy commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Run studio + API together (watch mode) |
| `npm run dev:studio` | Run just the admin UI |
| `npm run dev:api` | Run just the backend |
| `npm run infra:up` / `infra:down` | Start / stop the databases |
| `npm run db:migrate` | Apply database schema changes |
| `npm run db:studio` | Open Prisma Studio (browse the database) |
| `npm run db:seed` | Seed default workspace + roles + Super Admin |

## Bring your own infrastructure

Only **Postgres** is required — point `DATABASE_URL` at the bundled Docker
Postgres, or any external one (Neon, Supabase, RDS). **Redis** is optional (the
platform degrades gracefully without it; enable it for multi-instance deploys).
**Meilisearch** is scaffolded in Docker but not yet wired into the API — search
runs on Postgres today.

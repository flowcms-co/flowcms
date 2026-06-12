# @flowcms/cli

Zero-dependency setup & operations CLI for **self-hosting Flow CMS**. Run it from
the repo root on the server where Flow CMS is installed.

```bash
# First-time install
flowcms init            # scaffold .env (generates secrets + sensible defaults)
npm install
npm run infra:up        # Postgres / Redis / Meilisearch (needs Docker)
flowcms migrate         # apply the database schema
flowcms seed            # create the workspace + admin user
flowcms dev             # studio :3000 · api :4000
```

## Commands

| Command | What it does |
| --- | --- |
| `flowcms init` | Writes `.env`: generates `SECRETS_ENCRYPTION_KEY` + `JWT_SECRET`, fills sensible defaults from `.env.example`. Flags: `--force`, `--dry-run`, `--database-url=…`, `--admin-email=…`, `--admin-password=…`. Refuses to overwrite an existing `.env` without `--force`. |
| `flowcms secrets` | Print a freshly generated `SECRETS_ENCRYPTION_KEY` + `JWT_SECRET`. |
| `flowcms doctor` | Check Node ≥ 18, `.env` presence, required vars, and dependencies. |
| `flowcms migrate` | Apply DB migrations (`npm run db:migrate`). |
| `flowcms seed` | Seed the database (`npm run db:seed`). |
| `flowcms dev` | Start studio + API (`npm run dev`). |

The secrets it generates are random 32-byte base64 strings. Keep `.env` private
(it's gitignored); back it up — losing `SECRETS_ENCRYPTION_KEY` makes stored
integration secrets undecryptable.

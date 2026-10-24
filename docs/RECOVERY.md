# Locked out: recover admin access

If nobody can sign in (for example the only admin forgot their password and no
email provider is set up, so the reset email never leaves), recover from the
server. Every route here needs access to the server or its settings. There is
no public recovery endpoint, and the forgot-password page never reveals which
emails have accounts.

When a reset email can't be sent, the API log says so:

```
Password reset email NOT sent to you@example.com (email-not-configured). Recover from a shell on the server: ...
```

## Option 1: print a reset link (recommended)

Open a shell in the container that runs the API, then:

```sh
node apps/api/dist/recover.js reset-password --email you@example.com
```

It prints a link that works once and expires in 1 hour. Open it, choose a new
password, and sign in. Then set up email under **Settings > Integrations >
Email** so this doesn't happen again.

To set the password straight from the shell instead (asked twice, hidden):

```sh
node apps/api/dist/recover.js reset-password --email you@example.com --set-password
```

You can also pipe it in: `printf '%s' "$NEW_PASSWORD" | node apps/api/dist/recover.js reset-password --email you@example.com --set-password`.

Both forms sign the account out everywhere and add an `auth.password_reset_cli`
event to the activity log. From a repo checkout, `flowcms admin reset-password`
runs the same command.

Use the path above rather than a bare `npx flowcms`: if the local CLI isn't
linked, npx would download an unrelated package from npm.

### Getting a shell

| Host | Command |
| --- | --- |
| Railway | `railway ssh` (pick the CMS service), then run the command in `/app` |
| Docker Compose | `docker compose -f deploy/docker-compose.prod.yml exec api node apps/api/dist/recover.js reset-password --email you@example.com` |
| Docker (all-in-one) | `docker exec -it <container> node apps/api/dist/recover.js reset-password --email you@example.com` |
| Render | **Shell** tab on the service (paid instances). On free instances use option 2. |

The printed link uses `STUDIO_URL`, or the Railway/Render domain when that's
unset. If it points somewhere else, keep the `/reset-password?token=...` part and
swap in your Studio address.

## Option 2: env vars (hosts without a shell)

Set both on the CMS service and redeploy:

```
FLOWCMS_RECOVERY_EMAIL=you@example.com
FLOWCMS_RECOVERY_PASSWORD=<a new password, 12+ characters>
```

On boot the API sets that password, signs the account out everywhere and logs
it. It applies each email and password pair once, so a later restart won't undo
a password you change afterwards. Until you remove the vars, every boot logs a
warning. Sign in, change the password in Studio, then **delete both vars**:
anyone who can read your host's settings can read them.

## Lost two-factor too?

Sign in with one of your backup codes. Without those, recovery needs database
access; ask on the issue tracker.

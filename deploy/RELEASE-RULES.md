# Release rules: no install ever needs a terminal

Every Flow CMS install must be able to move to any newer release entirely from
inside the studio. These rules keep that true; breaking one of them is a
release blocker.

1. **No new required environment variables.** A release must boot with the env
   of the release before it. New settings get safe defaults, are generated and
   persisted on first boot, or are entered in the studio (stored encrypted).
   On managed platforms nobody can "just add a var" — the app can't demand it.

2. **Deploy config changes ship through config sync.** Anything under
   `deploy/` that existing compose installs consume (Caddyfile,
   docker-compose.prod.yml) is release-managed: the updater syncs it on
   upgrade and on boot (see `deploy/updater/server.mjs`, `SYNC_FILES`).
   Adding a managed file means also appending its historical stock hashes to
   `KNOWN_STOCK` so pre-existing installs are recognised as unmodified.

3. **Migrations are forward-only and run on boot.** Never require a manual
   database step, and never ship a migration the previous image can't survive
   a rollback from without the automatic pre-upgrade backup.

4. **Boot must not crash-loop over degradable subsystems.** Storage, mail,
   integrations and other non-core subsystems fail soft: the CMS boots, the
   problem is visible in the studio, and only that feature is degraded. Only a
   missing database or missing core secrets may stop boot.

5. **The updater updates itself.** Any change to the upgrade pipeline must
   work when driven by the PREVIOUS updater version, because that's what runs
   the upgrade that delivers it. New pipeline behaviour that must apply to the
   current release belongs in the updater's boot path, not only its upgrade
   path.

6. **Routing changes need both proxies.** `deploy/Caddyfile` (compose),
   `deploy/Caddyfile.aio` (all-in-one image) and `deploy/Caddyfile.local` stay
   equivalent.

History that motivated this: v1.6.1 changed the Caddyfile and stranded compose
installs until v1.6.3 added config sync; a missing media volume once
crash-looped the API until v1.7.0 made storage fail soft; managed platforms
required dashboard redeploys until v1.7.0 added in-app platform updates.

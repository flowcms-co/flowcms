import { PrismaClient } from "@prisma/client";
import { SYSTEM_ROLES, hashPassword } from "@flowcms/shared";

/**
 * Production bootstrap: the SAFE, idempotent first-run setup that the deploy
 * entrypoints run on every boot. It ONLY ensures the things a fresh install
 * needs to log in and reach the /setup wizard:
 *
 *   - the default workspace (slug "default", left un-onboarded so /setup runs),
 *   - the 4 system roles,
 *   - the Super Admin user + membership (from SEED_ADMIN_EMAIL/PASSWORD).
 *
 * It performs NO deletes and NEVER overwrites existing rows (workspace name,
 * onboarding state, the admin's password/name are left untouched on re-run), so
 * running it on every container restart is safe and non-destructive.
 *
 * This is deliberately separate from `seed.ts`, which is the DEMO seed for local
 * development (`npm run db:seed`) and is destructive (it wipes content + media to
 * reset the Northbound demo). The demo seed must never run against production.
 */

const WORKSPACE = { name: "Flow CMS", slug: "default" };

/** Default live-preview URL template from the environment, so live preview works
 *  out of the box on a fresh install (instead of the demo fallback):
 *   - PREVIEW_URL  — a full template, used as-is (e.g. https://site.com/{slug}).
 *   - FRONTEND_URL — the site origin; `/{slug}` is appended when no token is present.
 *  Returns undefined when neither is set. */
function envPreviewUrl(): string | undefined {
    const tpl = process.env.PREVIEW_URL?.trim();
    if (tpl) return tpl;
    const base = process.env.FRONTEND_URL?.trim();
    if (!base) return undefined;
    const clean = base.replace(/\/+$/, "");
    return /\{(slug|id|type|locale)\}/.test(clean) ? clean : `${clean}/{slug}`;
}

/** Run the idempotent bootstrap against a Prisma client. Exported so it can be
 *  invoked programmatically and integration-tested (run twice → no data loss). */
export async function bootstrap(prisma: PrismaClient) {
    const previewUrl = envPreviewUrl();
    // Workspace: create un-onboarded so the first login lands on /setup. On
    // re-run, leave everything (name, onboardedAt) as the user has it.
    const workspace = await prisma.workspace.upsert({
        where: { slug: WORKSPACE.slug },
        update: {},
        create: { name: WORKSPACE.name, slug: WORKSPACE.slug, ...(previewUrl ? { previewUrl } : {}) },
    });

    // Backfill the preview URL on an existing workspace only when it's still empty,
    // so a value the user set in Settings is never overwritten.
    if (previewUrl && !workspace.previewUrl) {
        await prisma.workspace.update({ where: { id: workspace.id }, data: { previewUrl } });
        workspace.previewUrl = previewUrl;
    }

    // System roles: keep their definitions in sync (permissions can change across
    // releases) but never delete or rename custom roles.
    for (const role of SYSTEM_ROLES) {
        await prisma.role.upsert({
            where: { workspaceId_key: { workspaceId: workspace.id, key: role.key } },
            update: { name: role.name, description: role.description, permissions: role.permissions, dashboard: role.dashboard, isSystem: true },
            create: { workspaceId: workspace.id, key: role.key, name: role.name, description: role.description, permissions: role.permissions, dashboard: role.dashboard, isSystem: true },
        });
    }
    const superAdminRole = await prisma.role.findFirst({
        where: { workspaceId: workspace.id, key: "super_admin" },
    });
    if (!superAdminRole) throw new Error("bootstrap: super_admin role missing after upsert");

    // Super Admin. There is deliberately NO default credential: an instance with
    // no SEED_ADMIN_* env boots "unclaimed", and the first visitor creates the
    // admin through the /setup/welcome wizard (POST /api/setup/claim). This avoids
    // shipping a known admin@flowcms.local/changeme pair on every install.
    //
    // SEED_ADMIN_EMAIL + SEED_ADMIN_PASSWORD remain the non-interactive path (CI,
    // scripted installs): when both are set we provision the admin here, and never
    // reset an existing user's password (so a restart can't roll a changed password
    // back to the seed value).
    const email = process.env.SEED_ADMIN_EMAIL?.toLowerCase().trim();
    const password = process.env.SEED_ADMIN_PASSWORD;
    if (!email || !password) {
        console.log(`[bootstrap] workspace "${workspace.slug}" ready; no SEED_ADMIN_* set, instance is UNCLAIMED (first visitor sets up the admin at /setup/welcome).`);
        return { workspaceId: workspace.id, adminId: null };
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    const admin = existing ?? (await prisma.user.create({
        data: { email, name: "Administrator", passwordHash: hashPassword(password), emailVerifiedAt: new Date() },
    }));

    await prisma.membership.upsert({
        where: { userId_workspaceId: { userId: admin.id, workspaceId: workspace.id } },
        update: {},
        create: { userId: admin.id, workspaceId: workspace.id, roleId: superAdminRole.id },
    });

    console.log(`[bootstrap] workspace "${workspace.slug}" ready; super admin ${existing ? "exists" : "created"} (${email}).`);
    return { workspaceId: workspace.id, adminId: admin.id };
}

// CLI entrypoint: the deploy entrypoints run this file directly via tsx.
if (process.argv[1] && process.argv[1].endsWith("bootstrap.ts")) {
    const prisma = new PrismaClient();
    bootstrap(prisma)
        .catch((e) => {
            console.error("[bootstrap] failed:", e);
            process.exit(1);
        })
        .finally(() => prisma.$disconnect());
}

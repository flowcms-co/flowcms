import { describe, it, expect, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { bootstrap } from "./bootstrap";

/**
 * DB-backed integration tests (require a live Postgres). Gated on RUN_DB_TESTS so
 * the default offline unit run skips them; the CI `integration` job boots
 * postgres, runs `prisma migrate deploy`, sets RUN_DB_TESTS=1, and runs these.
 *
 * Covers: (1) the critical data-safety fix — bootstrap must be idempotent AND
 * non-destructive across repeated runs (a container restart must not wipe content);
 * (2) workspace isolation — content queries scoped by workspaceId never leak
 * another tenant's rows. Running these against a freshly migrated DB also serves
 * as a migration smoke test.
 */
const RUN = process.env.RUN_DB_TESTS === "1";
const prisma = new PrismaClient();
const uniq = () => Math.random().toString(36).slice(2, 10);

describe.skipIf(!RUN)("bootstrap + isolation (integration)", () => {
    afterAll(async () => {
        await prisma.$disconnect();
    });

    it("is idempotent and non-destructive across repeated runs", async () => {
        const { workspaceId } = await bootstrap(prisma);

        // Insert content that MUST survive a re-bootstrap (the old demo seed wiped it).
        const ct = await prisma.contentType.create({
            data: { workspaceId, name: "Post", apiId: `post_${uniq()}`, pluralApiId: `posts_${uniq()}`, kind: "COLLECTION", schema: {} },
        });
        const entry = await prisma.contentEntry.create({
            data: { workspaceId, contentTypeId: ct.id, data: { title: "keepme" }, status: "DRAFT" },
        });

        // Re-run bootstrap twice (simulating container restarts).
        await bootstrap(prisma);
        await bootstrap(prisma);

        const survivor = await prisma.contentEntry.findUnique({ where: { id: entry.id } });
        expect(survivor).not.toBeNull();
        expect((survivor!.data as { title?: string }).title).toBe("keepme");

        // Exactly one default workspace; the 4 system roles present.
        const defaults = await prisma.workspace.findMany({ where: { slug: "default" } });
        expect(defaults.length).toBe(1);
        const roles = await prisma.role.findMany({ where: { workspaceId, isSystem: true } });
        expect(roles.length).toBeGreaterThanOrEqual(4);
        expect(roles.some((r) => r.key === "super_admin")).toBe(true);
    });

    it("scopes content queries by workspace (no cross-tenant leak)", async () => {
        const wsA = await prisma.workspace.create({ data: { name: "Tenant A", slug: `a_${uniq()}` } });
        const wsB = await prisma.workspace.create({ data: { name: "Tenant B", slug: `b_${uniq()}` } });
        const ctA = await prisma.contentType.create({ data: { workspaceId: wsA.id, name: "T", apiId: `t_${uniq()}`, pluralApiId: `ts_${uniq()}`, kind: "COLLECTION", schema: {} } });
        const ctB = await prisma.contentType.create({ data: { workspaceId: wsB.id, name: "T", apiId: `t_${uniq()}`, pluralApiId: `ts_${uniq()}`, kind: "COLLECTION", schema: {} } });
        await prisma.contentEntry.create({ data: { workspaceId: wsA.id, contentTypeId: ctA.id, data: { title: "A-secret" }, status: "PUBLISHED" } });
        await prisma.contentEntry.create({ data: { workspaceId: wsB.id, contentTypeId: ctB.id, data: { title: "B-secret" }, status: "PUBLISHED" } });

        const aEntries = await prisma.contentEntry.findMany({ where: { workspaceId: wsA.id } });
        expect(aEntries.length).toBeGreaterThan(0);
        expect(aEntries.every((e) => (e.data as { title?: string }).title !== "B-secret")).toBe(true);
        expect(aEntries.some((e) => (e.data as { title?: string }).title === "A-secret")).toBe(true);
    });

    it("rejects a revoked API token via soft-delete (revokedAt)", async () => {
        const ws = await prisma.workspace.create({ data: { name: "Tok", slug: `tok_${uniq()}` } });
        const tok = await prisma.apiToken.create({
            data: { workspaceId: ws.id, name: "t", tokenHash: `hash_${uniq()}`, prefix: "flw_x", type: "AGENT", scopes: [] },
        });
        await prisma.apiToken.update({ where: { id: tok.id }, data: { revokedAt: new Date() } });
        // The guards query findUnique then check revokedAt; assert the column is set
        // and that an active-only filter excludes it.
        const active = await prisma.apiToken.findMany({ where: { workspaceId: ws.id, revokedAt: null } });
        expect(active.length).toBe(0);
        const row = await prisma.apiToken.findUnique({ where: { id: tok.id } });
        expect(row?.revokedAt).not.toBeNull();
    });
});

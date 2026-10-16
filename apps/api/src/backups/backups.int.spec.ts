import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@flowcms/db";
import { BackupsService } from "./backups.service";

/**
 * Master rollback, against a live Postgres (gated on RUN_DB_TESTS): an editor
 * wipes the workspace's content and media, a Super Admin rolls back to the
 * snapshot, and everything is back, with an undo snapshot taken first.
 */
const RUN = process.env.RUN_DB_TESTS === "1";
const uniq = () => Math.random().toString(36).slice(2, 10);

describe.skipIf(!RUN)("workspace backups and master rollback (integration)", () => {
    const prisma = new PrismaClient();
    const hooks: string[] = [];
    const backups = new BackupsService(prisma as never, undefined, { dispatch: async (_w: string, e: string) => void hooks.push(e) } as never, undefined, undefined);
    let workspaceId = "";
    const name = `Nearby ${uniq()}`;

    beforeAll(async () => {
        workspaceId = (await prisma.workspace.create({ data: { name, slug: `ws-${uniq()}` } })).id;
        const type = await prisma.contentType.create({ data: { workspaceId, name: "Service", apiId: "service", pluralApiId: "services", kind: "COLLECTION", schema: { fields: [] } } });
        const body = "<p>We dry out flooded basements, remove mould and rebuild. ".repeat(40) + "</p>";
        for (let i = 0; i < 30; i++) {
            const e = await prisma.contentEntry.create({ data: { workspaceId, contentTypeId: type.id, status: "PUBLISHED", slug: `svc-${i}`, data: { title: `Service ${i}`, body } } });
            await prisma.contentVersion.create({ data: { entryId: e.id, data: { title: `Service ${i}` }, status: "PUBLISHED", versionNumber: 1 } });
        }
        await prisma.media.create({ data: { workspaceId, filename: "hero.webp", mimeType: "image/webp", size: 10, url: "/media/hero-key.webp", alt: "Hero" } });
        await prisma.mediaFolder.create({ data: { workspaceId, name: "heroes" } });
    });

    afterAll(async () => {
        await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => undefined);
        await prisma.$disconnect();
    });

    it("snapshots compactly and skips an unchanged daily one", async () => {
        const b = await backups.create(workspaceId, "manual", "before cleanup");
        expect(b.counts).toMatchObject({ types: 1, entries: 30, media: 1, folders: 1 });
        const raw = JSON.stringify(await prisma.contentEntry.findMany({ where: { workspaceId }, omit: { title: true } })).length;
        expect(b.sizeBytes).toBeLessThan(raw / 10); // repetitive content compresses hard
        const again = await backups.create(workspaceId, "daily");
        expect(again.id).toBe(b.id); // nothing changed: no new snapshot
    });

    it("rolls back a wiped workspace, and keeps an undo point", async () => {
        const [snap] = await backups.list(workspaceId);
        // The damage: everything deleted, plus a junk type and file added.
        await prisma.contentType.deleteMany({ where: { workspaceId } });
        await prisma.media.deleteMany({ where: { workspaceId } });
        await prisma.contentType.create({ data: { workspaceId, name: "Junk", apiId: "junk", pluralApiId: "junks", kind: "COLLECTION", schema: { fields: [] } } });
        await prisma.media.create({ data: { workspaceId, filename: "junk.png", mimeType: "image/png", size: 1, url: "/media/junk.png" } });

        await expect(backups.rollback(workspaceId, snap.id, "wrong name")).rejects.toThrow(/workspace name/);
        const res = await backups.rollback(workspaceId, snap.id, name);
        expect(res.counts).toMatchObject({ types: 1, entries: 30, media: 1 });

        expect(await prisma.contentEntry.count({ where: { workspaceId, status: "PUBLISHED" } })).toBe(30);
        expect(await prisma.contentType.findMany({ where: { workspaceId }, select: { apiId: true } })).toEqual([{ apiId: "service" }]);
        expect((await prisma.media.findMany({ where: { workspaceId } })).map((m) => m.filename)).toEqual(["hero.webp"]);
        expect(await prisma.mediaFolder.count({ where: { workspaceId } })).toBe(1);
        // The file added after the snapshot went to Deleted items, not away.
        expect(await prisma.deletedItem.count({ where: { workspaceId, kind: "media", title: "junk.png" } })).toBe(1);
        expect(hooks).toContain("workspace.restored");

        // The state before the rollback was kept, so the rollback can be undone.
        const undo = (await backups.list(workspaceId)).find((b) => b.id === res.undoBackupId);
        expect(undo?.kind).toBe("pre-rollback");
        expect(undo?.counts).toMatchObject({ types: 1, entries: 0, media: 1 });
    });

    it("keeps snapshots 2 days, always leaving the newest", async () => {
        await prisma.workspaceBackup.updateMany({ where: { workspaceId }, data: { createdAt: new Date(Date.now() - 3 * 86_400_000) } });
        await backups.create(workspaceId, "manual");
        expect(await prisma.workspaceBackup.count({ where: { workspaceId } })).toBe(1);
    });
});

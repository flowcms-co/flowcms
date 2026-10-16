import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { PrismaClient } from "@flowcms/db";
import { ContentEntriesService } from "./content-entries.service";
import { AuditService } from "../audit/audit.service";
import { AssetsService } from "../assets/assets.service";
import { LocalStorageDriver } from "../assets/storage/local.driver";
import { requestContext } from "../common/request-context";

/**
 * The activity log, versions, rollback, the deleted-items bin and the media API,
 * against a live Postgres (gated on RUN_DB_TESTS). Follows the acceptance checks:
 * user A edits one FAQ answer, user B approves and publishes, A restores the old
 * version; a token uploads, replaces and deletes media.
 */
const RUN = process.env.RUN_DB_TESTS === "1";
const uniq = () => Math.random().toString(36).slice(2, 10);

describe.skipIf(!RUN)("activity log, versions and rollback (integration)", () => {
    const prisma = new PrismaClient();
    const hooks: { event: string; payload: unknown }[] = [];
    const webhooks = { dispatch: async (_w: string, event: string, payload: unknown) => void hooks.push({ event, payload }) };
    const audit = new AuditService(prisma as never, { tryAcquire: async () => true } as never, webhooks as never, { send: async () => ({}) } as never);
    const noop = async () => {};
    const entries = new ContentEntriesService(
        prisma as never,
        { delByPrefix: noop } as never,
        { create: noop, createMany: noop, reviewers: async () => [] } as never,
        webhooks as never,
        { dispatch: noop } as never,
        { runBeforeSave: async (_w: string, ctx: { data: Record<string, unknown> }) => ctx.data } as never,
        { syncEntry: noop } as never,
        undefined,
        undefined,
        audit,
    );
    const mediaDir = mkdtempSync(join(tmpdir(), "flowcms-media-"));
    const assets = new AssetsService(prisma as never, {} as never, new LocalStorageDriver(mediaDir), audit, webhooks as never, undefined);

    let workspaceId = "";
    let typeId = "";
    const userA = { id: "", name: "Alice Editor" };
    const userB = { id: "", name: "Bob Reviewer" };
    const token = { id: "", name: "City pages script" };
    const ALL = ["*"];

    /** Run `fn` as if inside an HTTP request from this user (or token) and IP. */
    const as = <T>(who: { user?: typeof userA; token?: typeof token; ip: string }, fn: () => Promise<T>): Promise<T> => {
        const req = {
            ip: who.ip,
            headers: { "user-agent": "vitest" },
            ...(who.user ? { user: { ...who.user, email: `${who.user.id}@x.test`, role: { name: "Super Admin", permissions: ALL } } } : {}),
            ...(who.token ? { apiToken: who.token } : {}),
        };
        return requestContext.run(req as never, fn);
    };
    const rows = (entryId: string) => prisma.auditLog.findMany({ where: { workspaceId, resourceId: entryId }, orderBy: { createdAt: "asc" } });

    beforeAll(async () => {
        const id = uniq();
        workspaceId = (await prisma.workspace.create({ data: { name: `ws ${id}`, slug: `ws-${id}` } })).id;
        const role = await prisma.role.create({ data: { workspaceId, key: "super_admin", name: "Super Admin", permissions: ALL } });
        for (const u of [userA, userB]) {
            u.id = (await prisma.user.create({ data: { email: `${uniq()}@x.test`, name: u.name, passwordHash: "x" } })).id;
            await prisma.membership.create({ data: { userId: u.id, workspaceId, roleId: role.id } });
        }
        token.id = (await prisma.apiToken.create({ data: { workspaceId, name: token.name, tokenHash: uniq(), prefix: "fc_", type: "AGENT", scopes: ["media.read", "media.write"] } })).id;
        typeId = (
            await prisma.contentType.create({
                data: { workspaceId, name: "Service", apiId: "service", pluralApiId: "services", kind: "COLLECTION", schema: { fields: [] } },
            })
        ).id;
    });

    afterAll(async () => {
        await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => undefined);
        await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } }).catch(() => undefined);
        await prisma.$disconnect();
        rmSync(mediaDir, { recursive: true, force: true });
    });

    it("edit as A, approve and publish as B, restore as A: three named rows with IPs, the field diff and a new version", async () => {
        const faq = [
            { question: "How fast?", answer: "Within 60 minutes." },
            { question: "Insured?", answer: "Yes." },
        ];
        const created = await as({ user: userA, ip: "203.0.113.10" }, () =>
            entries.create(workspaceId, userA.id, { contentTypeId: typeId, title: "Restoration", slug: "restoration", data: { faq } } as never),
        );
        const id = created.id;
        await as({ user: userA, ip: "203.0.113.10" }, () => entries.publish(workspaceId, id, userA.id, ALL));
        const live = await prisma.contentVersion.findFirstOrThrow({ where: { entryId: id }, orderBy: { versionNumber: "desc" } });
        expect(live.label).toBe("published");

        // A edits one FAQ answer: a draft over the live page.
        const edited = [{ ...faq[0], answer: "Within 45 minutes." }, faq[1]];
        await as({ user: userA, ip: "203.0.113.10" }, () => entries.update(workspaceId, id, { data: { faq: edited } } as never, userA.id, undefined, ALL));
        // B approves the draft and publishes it.
        await as({ user: userB, ip: "198.51.100.7" }, () => entries.approveDraft(workspaceId, id, userB.id));
        await as({ user: userB, ip: "198.51.100.7" }, () => entries.publish(workspaceId, id, userB.id, ALL));
        hooks.length = 0;

        // A restores the version from before the edit, live now.
        const restored = await as({ user: userA, ip: "203.0.113.10" }, () =>
            entries.restore(workspaceId, id, String(live.versionNumber), userA.id, { mode: "publish", reason: "wrong answer", actorPermissions: ALL }),
        );
        expect(restored.restoredFrom).toBe(live.versionNumber);
        const newest = await prisma.contentVersion.findFirstOrThrow({ where: { entryId: id }, orderBy: { versionNumber: "desc" } });
        expect(newest.versionNumber).toBe(restored.versionNumber);
        expect(newest).toMatchObject({ note: `restored from v${live.versionNumber}`, label: "published", actorName: "Alice Editor" });
        const entry = await prisma.contentEntry.findUniqueOrThrow({ where: { id } });
        expect((entry.data as { faq: typeof faq }).faq[0].answer).toBe("Within 60 minutes.");
        expect(entry.draftData).toBeNull();
        expect(hooks.map((h) => h.event)).toEqual(expect.arrayContaining(["content.published", "content.restored"]));

        const log = await rows(id);
        const edit = log.find((r) => r.action === "content.edit")!;
        expect(edit).toMatchObject({ actorName: "Alice Editor", userId: userA.id, ip: "203.0.113.10", userAgent: "vitest", title: "Restoration", slug: "restoration", entryType: "service" });
        expect((edit.metadata as { changes: unknown[] }).changes).toEqual([{ path: "faq[0].answer", before: "Within 60 minutes.", after: "Within 45 minutes." }]);
        const approve = log.find((r) => r.action === "content.approve")!;
        expect(approve).toMatchObject({ actorName: "Bob Reviewer", ip: "198.51.100.7" });
        const restore = log.find((r) => r.action === "content.restore")!;
        expect(restore).toMatchObject({ actorName: "Alice Editor", ip: "203.0.113.10", versionAfter: newest.versionNumber });
        expect(restore.metadata).toMatchObject({ fromVersion: live.versionNumber, mode: "publish", reason: "wrong answer" });
        expect((restore.metadata as { changes: { path: string }[] }).changes.map((c) => c.path)).toEqual(["faq[0].answer"]);

        // The Review tab's sign-off log has every step, the 10/13-style publish included.
        const { history } = await entries.listReviews(workspaceId, id);
        expect(history.map((h) => [h.action, h.actor])).toEqual([
            ["content.restore", "Alice Editor"],
            ["content.publish", "Bob Reviewer"],
            ["content.approve", "Bob Reviewer"],
            ["content.publish", "Alice Editor"],
        ]);

        // Version detail: what this version differs by from what's live.
        const v = await entries.version(workspaceId, id, `v${live.versionNumber}`);
        expect(v.diffFromLive).toEqual([]);
        expect(v.author).toBe("Alice Editor");
    });

    it("restores one field as a draft, leaving the live page and other fields alone", async () => {
        const created = await as({ user: userA, ip: "203.0.113.10" }, () =>
            entries.create(workspaceId, userA.id, { contentTypeId: typeId, title: "Leak repair", slug: `leak-${uniq()}`, data: { intro: "Old intro", faq: [{ q: "A", a: "1" }] } } as never),
        );
        await as({ user: userA, ip: "203.0.113.10" }, () => entries.publish(workspaceId, created.id, userA.id, ALL));
        const v1 = await prisma.contentVersion.findFirstOrThrow({ where: { entryId: created.id }, orderBy: { versionNumber: "desc" } });
        await as({ user: userA, ip: "203.0.113.10" }, () => entries.update(workspaceId, created.id, { data: { intro: "New intro", faq: [{ q: "A", a: "2" }] } } as never, userA.id, undefined, ALL));
        await as({ user: userA, ip: "203.0.113.10" }, () => entries.publish(workspaceId, created.id, userA.id, ALL));

        await as({ user: userA, ip: "203.0.113.10" }, () => entries.restore(workspaceId, created.id, v1.id, userA.id, { fields: ["faq"] }));
        const e = await prisma.contentEntry.findUniqueOrThrow({ where: { id: created.id } });
        expect(e.data).toMatchObject({ intro: "New intro", faq: [{ q: "A", a: "2" }] }); // live untouched
        expect(e.draftData).toMatchObject({ intro: "New intro", faq: [{ q: "A", a: "1" }] }); // up for review
        const last = await prisma.contentVersion.findFirstOrThrow({ where: { entryId: created.id }, orderBy: { versionNumber: "desc" } });
        expect(last).toMatchObject({ label: "draft", note: `restored from v${v1.versionNumber} (faq)` });
    });

    it("merges one person's autosaves into one draft version", async () => {
        const created = await as({ user: userA, ip: "203.0.113.10" }, () => entries.create(workspaceId, userA.id, { contentTypeId: typeId, title: "Mould", slug: `mould-${uniq()}`, data: {} } as never));
        const before = await prisma.contentVersion.count({ where: { entryId: created.id } });
        for (const word of ["a", "ab", "abc"]) {
            await as({ user: userA, ip: "203.0.113.10" }, () => entries.update(workspaceId, created.id, { data: { intro: word } } as never, userA.id, undefined, ALL));
        }
        expect(await prisma.contentVersion.count({ where: { entryId: created.id } })).toBe(before + 1);
        // ...but every save is its own row in the log.
        expect((await rows(created.id)).filter((r) => r.action === "content.edit")).toHaveLength(3);
    });

    it("names an API token as the actor, and the log refuses edits", async () => {
        const created = await as({ token, ip: "192.0.2.5" }, () => entries.create(workspaceId, null, { contentTypeId: typeId, title: "City page", slug: `city-${uniq()}`, data: {} } as never));
        const [row] = await rows(created.id);
        expect(row).toMatchObject({ action: "content.create", userId: null, tokenId: token.id, actorName: "City pages script (API token)", ip: "192.0.2.5" });
        const v = await prisma.contentVersion.findFirstOrThrow({ where: { entryId: created.id } });
        expect(v.actorName).toBe("City pages script (API token)");
        await expect(prisma.auditLog.update({ where: { id: row.id }, data: { actorName: "someone else" } })).rejects.toThrow(/append-only/);
    });

    it("names the API token for versions and log rows saved before authors were recorded", async () => {
        const e = await prisma.contentEntry.create({ data: { workspaceId, contentTypeId: typeId, slug: `old-${uniq()}`, data: { title: "Old agent page" } } });
        await prisma.contentVersion.create({ data: { entryId: e.id, data: {}, status: "DRAFT", versionNumber: 1, label: "draft" } });
        await prisma.auditLog.create({ data: { workspaceId, action: "content.edit", resource: "ContentEntry", resourceId: e.id } });
        const [v] = await entries.versions(workspaceId, e.id);
        expect(v.author).toBe("City pages script (API token)"); // the only write token then
        const { items } = await audit.list(workspaceId, { entry: e.id });
        expect(items[0].actor?.name).toBe("City pages script (API token)");
    });

        it("bulk-sets a nested field on each working copy without touching live data, status or other keys", async () => {
        const hero = (sub: string) => ({ headline: "Restoration {City:Near You}", subheadline: sub, ctaLabel: "<p>Call</p>", featuredReview: { starRating: "5" }, serviceCategories: [], showTrustpilotBadge: true });
        const OLD = "Serving {City:Your City} and Nearby Areas";
        const NEW = "Serving {CityCount} cities.";
        const typeB = (await prisma.contentType.create({ data: { workspaceId, name: "Svc", apiId: `svc${uniq()}`, pluralApiId: `svcs${uniq()}`, kind: "COLLECTION", schema: { fields: [] } } })).id;
        const mk = (slug: string, status: "DRAFT" | "PUBLISHED", draft?: Record<string, string | object>) =>
            prisma.contentEntry.create({
                data: { workspaceId, contentTypeId: typeB, slug, status, ...(status === "PUBLISHED" ? { publishedAt: new Date() } : {}), data: { title: slug, heroSection: hero(OLD) }, ...(draft ? { draftData: draft } : {}) },
            });
        const draft = await mk("draft-one", "DRAFT");
        const pending = await mk("live-pending", "PUBLISHED", { title: "live-pending", intro: "pending edit", heroSection: hero(OLD) });
        const live = await mk("live-clean", "PUBLISHED");
        const done = await prisma.contentEntry.create({ data: { workspaceId, contentTypeId: typeB, slug: "already", status: "DRAFT", data: { title: "already", heroSection: hero(NEW) } } });

        const dry = await as({ token, ip: "192.0.2.5" }, () => entries.bulkSet(workspaceId, typeB, { set: { "heroSection.subheadline": NEW }, dryRun: true }, []));
        expect(dry).toMatchObject({ matched: 4, dryRun: true, wouldUpdate: 3, skipped: 1, failed: [] });
        expect(dry.entries.find((e) => e.slug === "live-pending")).toMatchObject({ status: "PUBLISHED", changes: [{ path: "heroSection.subheadline", old: OLD, new: NEW }] });
        expect((await prisma.contentEntry.findUniqueOrThrow({ where: { id: draft.id } })).updatedAt).toEqual(draft.updatedAt); // nothing written

        const res = await as({ token, ip: "192.0.2.5" }, () => entries.bulkSet(workspaceId, typeB, { set: { "heroSection.subheadline": NEW } }, []));
        expect(res).toMatchObject({ matched: 4, updated: 3, skipped: 1, failed: [] });

        const after = async (id: string) => prisma.contentEntry.findUniqueOrThrow({ where: { id } });
        const d = await after(draft.id);
        expect(d.status).toBe("DRAFT");
        expect(d.data).toEqual({ title: "draft-one", metaTitle: "draft-one", heroSection: hero(NEW) });
        const p = await after(pending.id);
        expect(p.status).toBe("PUBLISHED");
        expect(p.data).toEqual(pending.data); // live untouched
        expect(p.draftData).toMatchObject({ intro: "pending edit", heroSection: hero(NEW) }); // other pending edit kept
        const l = await after(live.id);
        expect(l.status).toBe("PUBLISHED");
        expect(l.data).toEqual(live.data);
        expect((l.draftData as { heroSection: unknown }).heroSection).toEqual(hero(NEW)); // a new draft with the change
        expect((await after(done.id)).updatedAt).toEqual(done.updatedAt);

        const rows = await prisma.auditLog.findMany({ where: { workspaceId, resourceId: { in: [draft.id, pending.id, live.id] }, action: "content.edit" } });
        expect(rows).toHaveLength(3);
        expect(rows.every((r) => r.actorName === "City pages script (API token)")).toBe(true);
        expect((rows[0].metadata as { changes: { path: string }[] }).changes.map((c) => c.path)).toContain("heroSection.subheadline");

        const bySlug = await entries.bulkSet(workspaceId, typeB, { where: { slug: ["draft-one"] }, set: { "heroSection.subheadline": NEW }, dryRun: true }, []);
        expect(bySlug).toMatchObject({ matched: 1, skipped: 1 });
    });

        it("delete goes to the bin and comes back whole under the same id", async () => {
        const created = await as({ user: userA, ip: "203.0.113.10" }, () => entries.create(workspaceId, userA.id, { contentTypeId: typeId, title: "Fire damage", slug: `fire-${uniq()}`, data: { intro: "x" } } as never));
        await as({ user: userA, ip: "203.0.113.10" }, () => entries.publish(workspaceId, created.id, userA.id, ALL));
        const versions = await prisma.contentVersion.count({ where: { entryId: created.id } });
        await as({ user: userA, ip: "203.0.113.10" }, () => entries.remove(workspaceId, created.id, userA.id));
        expect(await prisma.contentEntry.findUnique({ where: { id: created.id } })).toBeNull();
        const bin = await prisma.deletedItem.findFirstOrThrow({ where: { workspaceId, itemId: created.id } });
        expect(bin).toMatchObject({ kind: "entry", title: "Fire damage", deletedBy: "Alice Editor" });
        expect(+bin.purgeAt - +bin.deletedAt).toBeGreaterThan(29 * 86_400_000);

        await as({ user: userA, ip: "203.0.113.10" }, () => entries.restoreDeleted(workspaceId, bin.id, userA.id));
        const back = await prisma.contentEntry.findUniqueOrThrow({ where: { id: created.id } });
        expect(back.status).toBe("DRAFT"); // was live: comes back for review
        expect(await prisma.contentVersion.count({ where: { entryId: created.id } })).toBe(versions + 1);
        expect((await rows(created.id)).map((r) => r.action)).toEqual(expect.arrayContaining(["content.delete", "content.restore_deleted"]));
    });

    it("media: dedupe on upload, usage paths, replace keeps the id and repoints pages, in-use delete needs force", async () => {
        const png = await sharp({ create: { width: 40, height: 30, channels: 3, background: "#c00" } }).png().toBuffer();
        const file = { originalname: "hero.png", mimetype: "image/png", size: png.length, buffer: png };
        const asToken = <T>(fn: () => Promise<T>) => as({ token, ip: "192.0.2.5" }, fn);

        const up = await asToken(() => assets.upload(workspaceId, null, file, "heroes", { alt: "Water damage crew", tags: ["Hero"], dedupe: true }));
        expect(up).toMatchObject({ alt: "Water damage crew", tags: ["hero"], folder: "heroes", uploadedBy: "City pages script (API token)" });
        expect(up.ref).toMatch(/^\/media\/.+\.webp$/);
        const again = await asToken(() => assets.upload(workspaceId, null, file, undefined, { dedupe: true }));
        expect(again).toMatchObject({ id: up.id, existing: true });

        const page = await prisma.contentEntry.create({ data: { workspaceId, contentTypeId: typeId, status: "PUBLISHED", slug: `p-${uniq()}`, data: { title: "Page", hero: { image: up.ref } } } });
        const usage = await assets.usageDetail(workspaceId, up.id);
        expect(usage.entries).toEqual([expect.objectContaining({ id: page.id, type: "service", fields: ["hero.image"] })]);
        expect((await assets.search(workspaceId, { unused: true })).items.map((a) => a.id)).not.toContain(up.id);

        const png2 = await sharp({ create: { width: 80, height: 60, channels: 3, background: "#00c" } }).png().toBuffer();
        hooks.length = 0;
        const swapped = await asToken(() => assets.replace(workspaceId, up.id, { originalname: "new.png", mimetype: "image/png", size: png2.length, buffer: png2 }));
        expect(swapped.id).toBe(up.id);
        expect(swapped.ref).not.toBe(up.ref);
        const repointed = await prisma.contentEntry.findUniqueOrThrow({ where: { id: page.id } });
        expect((repointed.data as { hero: { image: string } }).hero.image).toBe(swapped.ref);
        expect(hooks.find((h) => h.event === "media.replaced")?.payload).toMatchObject({ id: up.id, entries: [expect.objectContaining({ id: page.id })] });

        await expect(asToken(() => assets.remove(workspaceId, up.id))).rejects.toThrow(/used by 1 entry/);
        await asToken(() => assets.remove(workspaceId, up.id, { force: true }));
        expect(await prisma.media.findUnique({ where: { id: up.id } })).toBeNull();

        const log = await prisma.auditLog.findMany({ where: { workspaceId, resourceId: up.id }, orderBy: { createdAt: "asc" } });
        expect(log.map((r) => r.action)).toEqual(["media.upload", "media.replace", "media.delete"]);
        expect(log.every((r) => r.actorName === "City pages script (API token)" && r.tokenId === token.id)).toBe(true);
        expect((log[1].metadata as { affectedEntries: { id: string }[] }).affectedEntries.map((e) => e.id)).toEqual([page.id]);

        const bin = await prisma.deletedItem.findFirstOrThrow({ where: { workspaceId, itemId: up.id } });
        const back = await assets.restoreDeleted(workspaceId, bin.id);
        expect(back.id).toBe(up.id);
    });

    it("filters the log by user, action, entry, title and date", async () => {
        const all = await audit.list(workspaceId, { limit: 200 });
        expect(all.total).toBeGreaterThan(10);
        const byB = await audit.list(workspaceId, { user: userB.id });
        expect(byB.items.length).toBeGreaterThan(0);
        expect(byB.items.every((r) => r.actor?.name === "Bob Reviewer")).toBe(true);
        expect((await audit.list(workspaceId, { user: token.id })).items.every((r) => r.tokenId === token.id)).toBe(true);
        expect((await audit.list(workspaceId, { action: "media." })).items.every((r) => r.action.startsWith("media."))).toBe(true);
        expect((await audit.list(workspaceId, { q: "restoration" })).items.every((r) => /restoration/i.test(`${r.title} ${r.slug}`))).toBe(true);
        expect((await audit.list(workspaceId, { to: "2000-01-01" })).total).toBe(0);
        const page = await audit.list(workspaceId, { limit: 2, offset: 2 });
        expect(page.items).toHaveLength(2);
        expect(page.items[0].id).toBe(all.items[2].id);
    });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@flowcms/db";
import { ContentEntriesService } from "./content-entries.service";

/**
 * Saving unchanged content is not an edit, and drafts that only differ by editor
 * formatting can be found and discarded. Against a live Postgres (gated on
 * RUN_DB_TESTS; see packages/db for the other integration specs).
 */
const RUN = process.env.RUN_DB_TESTS === "1";
const uniq = () => Math.random().toString(36).slice(2, 10);

const BODY = '<h2>Costs & timing</h2>\n<p>Read the <a href="/resources/cost">cost guide</a> first.</p>\n<ul><li>Pumps</li></ul>';
// The same content as an older editor re-wrote it on open.
const NORMALISED = '<h2>Costs &amp; timing</h2><p>Read the <a target="_blank" rel="noopener noreferrer nofollow" href="/resources/cost">cost guide</a> first.</p><ul><li><p>Pumps</p></li></ul><p> </p>';

describe.skipIf(!RUN)("unchanged saves and formatting-only drafts (integration)", () => {
    const prisma = new PrismaClient();
    const noop = async () => {};
    const service = new ContentEntriesService(
        prisma as never,
        { delByPrefix: noop } as never,
        {} as never,
        { dispatch: noop } as never,
        { dispatch: noop } as never,
        { runBeforeSave: async (_w: string, ctx: { data: Record<string, unknown> }) => ctx.data } as never,
        { syncEntry: noop } as never,
    );
    let workspaceId = "";
    let typeId = "";
    const publish = async (title: string, body = BODY) =>
        (await prisma.contentEntry.create({ data: { workspaceId, contentTypeId: typeId, status: "PUBLISHED", slug: `p-${uniq()}`, publishedAt: new Date(), data: { title, metaTitle: title, body } } })).id;
    const row = (id: string) => prisma.contentEntry.findUniqueOrThrow({ where: { id } });

    beforeAll(async () => {
        const id = uniq();
        workspaceId = (await prisma.workspace.create({ data: { name: `ws ${id}`, slug: `ws-${id}` } })).id;
        typeId = (await prisma.contentType.create({ data: { workspaceId, name: "Page", apiId: "page", pluralApiId: "pages", kind: "COLLECTION", schema: { fields: [] } } })).id;
    });
    afterAll(async () => {
        await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => undefined);
        await prisma.$disconnect();
    });

    it("saving a published entry unchanged creates no draft and leaves updatedAt alone", async () => {
        const id = await publish("Service page");
        const before = await row(id);
        const versions = await prisma.contentVersion.count({ where: { entryId: id } });
        const saved = await service.update(workspaceId, id, { title: "Service page", data: { title: "Service page", metaTitle: "Service page", body: BODY } } as never, undefined);
        const after = await row(id);
        expect(after.draftData).toBeNull();
        expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
        expect(await prisma.contentVersion.count({ where: { entryId: id } })).toBe(versions);
        expect(saved.hasDraft).toBe(false);
    });

    it("a one-word edit stages a draft holding exactly that change", async () => {
        const id = await publish("Service page");
        await service.update(workspaceId, id, { data: { body: BODY.replace("first", "today") } } as never, undefined);
        const after = await row(id);
        expect((after.draftData as { body: string }).body).toBe(BODY.replace("first", "today"));
        expect((after.data as { body: string }).body).toBe(BODY); // live is untouched until publish
        const { changes, formattingOnly } = await service.liveAndDraft(workspaceId, id);
        expect(changes.map((c) => c.path)).toEqual(["body"]);
        expect(formattingOnly).toBe(false);
    });

    it("saving a draft entry unchanged leaves updatedAt alone", async () => {
        const id = (await prisma.contentEntry.create({ data: { workspaceId, contentTypeId: typeId, status: "DRAFT", data: { title: "Draft", body: BODY } } })).id;
        const before = await row(id);
        // The editor always sends the title and slug along with the content.
        await service.update(workspaceId, id, { title: "Draft", slug: before.slug, data: { title: "Draft", body: BODY } } as never, undefined);
        expect((await row(id)).updatedAt.getTime()).toBe(before.updatedAt.getTime());
    });

    it("finds drafts that only differ by editor formatting and discards those alone", async () => {
        const noise = await publish("Noise only");
        const real = await publish("Really edited");
        await prisma.contentEntry.update({ where: { id: noise }, data: { draftData: { title: "Noise only", metaTitle: "Noise only", body: NORMALISED } } });
        await prisma.contentEntry.update({ where: { id: real }, data: { draftData: { title: "Really edited", metaTitle: "Really edited", body: NORMALISED.replace("first", "today") } } });

        const found = await service.formattingOnlyDrafts(workspaceId);
        expect(found.map((d) => d.id)).toEqual([noise]);
        expect(found[0]).toMatchObject({ title: "Noise only", type: "Page" });

        expect(await service.discardFormattingOnlyDrafts(workspaceId)).toEqual({ discarded: 1 });
        expect((await row(noise)).draftData).toBeNull();
        expect((await row(real)).draftData).not.toBeNull();
        expect(((await row(noise)).data as { body: string }).body).toBe(BODY);
    });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@flowcms/db";
import { ContentEntriesService } from "./content-entries.service";

/**
 * Exact-match lookup and create-or-reuse for the reference picker, against a live
 * Postgres (gated on RUN_DB_TESTS; see packages/db for the other integration specs).
 */
const RUN = process.env.RUN_DB_TESTS === "1";
const uniq = () => Math.random().toString(36).slice(2, 10);

describe.skipIf(!RUN)("entry exact match + reuse on create (integration)", () => {
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

    beforeAll(async () => {
        const id = uniq();
        workspaceId = (await prisma.workspace.create({ data: { name: `ws ${id}`, slug: `ws-${id}` } })).id;
        typeId = (
            await prisma.contentType.create({
                data: { workspaceId, name: "Tag", apiId: "tag", pluralApiId: "tags", kind: "COLLECTION", schema: { fields: [] } },
            })
        ).id;
        // 120 tags that all contain "rust", so a search's first page can't hold them all.
        await prisma.contentEntry.createMany({
            data: Array.from({ length: 120 }, (_, i) => ({
                workspaceId,
                contentTypeId: typeId,
                data: { title: `A rust tag ${String(i).padStart(3, "0")}` },
                slug: `a-rust-tag-${i}`,
            })),
        });
        await prisma.contentEntry.create({ data: { workspaceId, contentTypeId: typeId, data: { title: "Rust " }, slug: "rust" } });
    });

    afterAll(async () => {
        await prisma.workspace.delete({ where: { id: workspaceId } });
        await prisma.$disconnect();
    });

    it("finds an exact match beyond the first 50 search results", async () => {
        const page = await prisma.contentEntry.findMany({ where: { contentTypeId: typeId, title: { contains: "rust", mode: "insensitive" } }, orderBy: { title: "asc" }, take: 50 });
        expect(page.some((e) => e.slug === "rust")).toBe(false);

        const { entry } = await service.match(workspaceId, typeId, "  RUST ");
        expect(entry?.slug).toBe("rust");
        // A different title whose slug would be "rust" is the same tag too.
        expect((await service.match(workspaceId, typeId, "Rust!")).entry?.slug).toBe("rust");
        expect((await service.match(workspaceId, typeId, "Go")).entry).toBeNull();
    });

    it("returns the existing entry instead of creating a duplicate", async () => {
        const before = await prisma.contentEntry.count({ where: { contentTypeId: typeId } });
        const r = await service.create(workspaceId, null, { contentTypeId: typeId, title: "rust", slug: "rust-01", reuseExisting: true });
        expect(r).toMatchObject({ slug: "rust", existing: true });
        expect(await prisma.contentEntry.count({ where: { contentTypeId: typeId } })).toBe(before);
    });

    it("creates one entry when two editors create the same name at once", async () => {
        const dto = { contentTypeId: typeId, title: "Zig", slug: "zig", reuseExisting: true };
        const [a, b] = await Promise.all([service.create(workspaceId, null, dto), service.create(workspaceId, null, dto)]);
        expect(a.id).toBe(b.id);
        expect(await prisma.contentEntry.count({ where: { contentTypeId: typeId, slug: "zig" } })).toBe(1);
    });
});

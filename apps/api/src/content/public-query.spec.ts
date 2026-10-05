import { describe, expect, it } from "vitest";
import { PublicQueryService } from "./public-query.service";

/* eslint-disable @typescript-eslint/no-explicit-any */
const ct = { id: "t", workspaceId: "w", kind: "COLLECTION", schema: { fields: [{ name: "Hero image", type: "Media" }, { name: "Hero image alt", type: "Text" }, { name: "Intro", type: "Rich text" }] } } as any;

function service(media: { url: string; alt: string | null }[], data: Record<string, unknown>) {
    const prisma = {
        media: { findMany: async () => media },
        contentType: { findMany: async () => [] },
        contentEntry: { findFirst: async () => ({ id: "e1", slug: "home", locale: "en", data, publishedAt: null, createdAt: new Date(0), updatedAt: new Date(0) }) },
    };
    const cache = { wrap: async (_k: string, _t: number, fn: () => any) => fn() };
    return new PublicQueryService(prisma as any, cache as any);
}

describe("delivery fills empty alt text from the asset library", () => {
    const media = [{ url: "/media/hero.webp", alt: "Technician drying a carpet" }];

    it("fills the paired alt field and rich-text images, using the asset's current alt", async () => {
        const { data } = await service(media, { "Hero image": "/media/hero.webp", "Hero image alt": "", Intro: '<p><img src="/media/hero.webp"></p>' }).oneForType(ct, "home", {});
        expect(data["Hero image alt"]).toBe("Technician drying a carpet");
        expect(data.Intro).toContain('alt="Technician drying a carpet"');
    });

    it("keeps alt text the editor wrote", async () => {
        const { data } = await service(media, { "Hero image": "/media/hero.webp", "Hero image alt": "Editor's own words" }).oneForType(ct, "home", {});
        expect(data["Hero image alt"]).toBe("Editor's own words");
    });
});

describe("delivery of references: projection and populate", () => {
    const guide = (id: string) => ({ id, slug: `guide-${id}`, locale: "en", status: "PUBLISHED", data: { title: `Guide ${id}`, thumbnailImage: `/media/${id}.webp`, body: "<p>" + "long ".repeat(2000) + "</p>" }, publishedAt: null, createdAt: new Date(0), updatedAt: new Date(0), contentType: { apiId: "resource", schema: { fields: [] } } });
    const guides = [guide("g1"), guide("g2")];
    const type = { id: "t", workspaceId: "w", kind: "COLLECTION", schema: { fields: [{ name: "guides", type: "Reference", multiple: true, referencedTypeId: "t_res" }, { name: "service", type: "Reference", referencedTypeId: "t_svc" }] } } as any;
    const entry = { id: "e1", slug: "page", locale: "en", data: { title: "Page", summary: "S", guides: ["g1", "g2"], service: "g1" }, publishedAt: null, createdAt: new Date(0), updatedAt: new Date(0) };

    function svc() {
        const selects: any[] = [];
        const prisma = {
            media: { findMany: async () => [] },
            contentType: { findMany: async () => [] },
            contentEntry: {
                findFirst: async () => entry,
                findMany: async ({ where, select }: any) => {
                    selects.push(select ?? "full");
                    return guides.filter((g) => where.id.in.includes(g.id));
                },
            },
            entryRelation: { findMany: async () => [] },
        };
        const cache = { wrap: async (_k: string, _t: number, fn: () => any) => fn() };
        return { q: new PublicQueryService(prisma as any, cache as any), selects };
    }
    const size = (v: unknown) => JSON.stringify(v).length;

    it("by default delivers referenced entries in full, as before", async () => {
        const { data } = await svc().q.oneForType(type, "page", {});
        expect((data.guides as any[])[0]).toMatchObject({ id: "g1", title: "Guide g1", body: expect.any(String) });
        expect(size(data)).toBeGreaterThan(20_000);
    });

    it("fields=…,guides.title,guides.slug delivers only those of each guide", async () => {
        const { data } = await svc().q.oneForType(type, "page", { fields: ["title", "guides.title", "guides.slug", "guides.thumbnailImage"] });
        expect(data.guides).toEqual([
            { id: "g1", slug: "guide-g1", __type: "resource", title: "Guide g1", thumbnailImage: "/media/g1.webp" },
            { id: "g2", slug: "guide-g2", __type: "resource", title: "Guide g2", thumbnailImage: "/media/g2.webp" },
        ]);
        expect(data.title).toBe("Page");
        expect(data.summary).toBeUndefined();
        expect(size(data)).toBeLessThan(600);
    });

    it("populate=none delivers ids and slugs without reading the referenced content", async () => {
        const { q, selects } = svc();
        const { data } = await q.oneForType(type, "page", { populate: "none" });
        expect(data.guides).toEqual([{ id: "g1", slug: "guide-g1", __type: "resource" }, { id: "g2", slug: "guide-g2", __type: "resource" }]);
        expect(data.service).toEqual({ id: "g1", slug: "guide-g1", __type: "resource" });
        expect(selects.every((s) => s !== "full" && !s.data)).toBe(true);
    });

    it("populate=service expands only that field", async () => {
        const { data } = await svc().q.oneForType(type, "page", { populate: "service" });
        expect(data.service).toMatchObject({ id: "g1", title: "Guide g1" });
        expect(data.guides).toEqual([{ id: "g1", slug: "guide-g1", __type: "resource" }, { id: "g2", slug: "guide-g2", __type: "resource" }]);
    });
});

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

import { describe, expect, it } from "vitest";
import { entryToCanonicalContent, isImageUrl } from "./canonical-content";

describe("image alt resolution", () => {
    const altFor = (url: string) => (url.endsWith("lib.webp") ? "From the asset library" : undefined);

    it("reads the paired alt field inside a section", () => {
        const c = entryToCanonicalContent({ data: { sections: [{ __component: "hero", Image: "/media/hero.webp", "Alt text": "A flooded basement" }] } });
        expect(c.images).toEqual([{ src: "/media/hero.webp", alt: "A flooded basement" }]);
    });

    it("falls back to the asset's alt, then null", () => {
        const c = entryToCanonicalContent({ data: { sections: [{ __component: "hero", Image: "/media/lib.webp", "Alt text": "" }, { __component: "card", Photo: "/media/none.webp" }] } }, { altFor });
        expect(c.images).toEqual([{ src: "/media/lib.webp", alt: "From the asset library" }, { src: "/media/none.webp", alt: null }]);
    });

    it("collects top-level image fields with their paired alt", () => {
        const c = entryToCanonicalContent({ data: { title: "T", "Hero image": "https://cdn.x/media/h.jpg", "Hero image alt": "Hero", ogImage: "/media/og.png" } });
        expect(c.images).toEqual([{ src: "https://cdn.x/media/h.jpg", alt: "Hero" }]);
    });

    it("gives rich-text images with no alt the asset's alt", () => {
        const c = entryToCanonicalContent({ data: { body: '<p><img src="/media/lib.webp"><img src="/media/x.png" alt="Mine"></p>' } }, { altFor });
        expect(c.images.map((i) => i.alt)).toEqual(["From the asset library", "Mine"]);
    });

    it("does not treat text starting with Image or Media as an image", () => {
        expect(isImageUrl("Media coverage of the storm")).toBe(false);
        expect(isImageUrl("Images")).toBe(false);
        expect(isImageUrl("/media/a.webp")).toBe(true);
        expect(isImageUrl("https://cdn.x/photo.JPG?w=200")).toBe(true);
        const c = entryToCanonicalContent({ data: { sections: [{ __component: "text", Heading: "Media coverage of the storm" }] } });
        expect(c.images).toEqual([]);
        expect(c.plainText).toContain("Media coverage");
    });
});

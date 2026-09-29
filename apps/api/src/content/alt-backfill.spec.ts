import { describe, expect, it } from "vitest";
import { altBackfillPatch, fillImgAlts } from "./alt-backfill";

const alts: Record<string, string> = { "a.webp": "A red square", "b.webp": 'Say "hi" & wave' };
const altFor = (url: string) => alts[url.split(/[?#]/)[0].split("/").pop() ?? ""];

describe("fillImgAlts", () => {
    it("adds or fills empty alts on library images and escapes the text", () => {
        expect(fillImgAlts('<p><img src="/media/a.webp"></p>', altFor)).toBe('<p><img alt="A red square" src="/media/a.webp"></p>');
        expect(fillImgAlts('<img src="https://cdn.x/b.webp" alt="">', altFor)).toBe('<img src="https://cdn.x/b.webp" alt="Say &quot;hi&quot; &amp; wave">');
    });

    it("keeps an author's alt and ignores unknown images", () => {
        const kept = '<img src="/media/a.webp" alt="Mine">';
        expect(fillImgAlts(kept, altFor)).toBe(kept);
        const other = '<img src="/media/zzz.webp">';
        expect(fillImgAlts(other, altFor)).toBe(other);
    });
});

describe("altBackfillPatch", () => {
    const T = (name: string) => ({ name, type: "Text" });
    const M = (name: string) => ({ name, type: "Media" });

    it("fills paired alt fields, nested components and sections, and the body", () => {
        const fields = [
            M("Hero image"),
            T("Hero image alt"),
            { name: "Gallery", type: "Component", repeatable: true, fields: [M("Image"), T("Alt text")] },
            { name: "Sections", type: "DynamicZone" },
        ];
        const components = { image: [M("Image"), T("Alt text"), T("Caption")] };
        const data = {
            title: "Page",
            "Hero image": "/media/a.webp",
            Gallery: [{ Image: "/media/b.webp" }, { Image: "/media/a.webp", "Alt text": "Custom" }],
            Sections: [{ __component: "image", Image: "/media/a.webp", "Alt text": "" }],
            body: '<img src="/media/b.webp">',
        };
        const patch = altBackfillPatch(fields, data, components, altFor);
        expect(Object.keys(patch).sort()).toEqual(["Gallery", "Hero image alt", "Sections", "body"]);
        expect(patch["Hero image alt"]).toBe("A red square");
        expect(patch.Gallery).toEqual([{ Image: "/media/b.webp", "Alt text": 'Say "hi" & wave' }, { Image: "/media/a.webp", "Alt text": "Custom" }]);
        expect((patch.Sections as { "Alt text": string }[])[0]["Alt text"]).toBe("A red square");
        expect(patch.body).toContain('alt="Say &quot;hi&quot; &amp; wave"');
    });

    it("is empty when every alt is already set", () => {
        const fields = [M("Image"), T("Alt text")];
        expect(altBackfillPatch(fields, { Image: "/media/a.webp", "Alt text": "Mine" }, {}, altFor)).toEqual({});
    });
});

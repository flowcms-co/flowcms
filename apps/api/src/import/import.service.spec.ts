import { describe, it, expect } from "vitest";
import { ImportService } from "./import.service";
import type { PrismaService } from "../prisma/prisma.service";

// preview() for JSON is pure (no DB / network), so a null prisma is fine here.
const svc = new ImportService(null as unknown as PrismaService);

describe("import schema inference (JSON)", () => {
    it("types fields by key + value shape and models nested structure", async () => {
        const text = JSON.stringify({
            slug: "home",
            title: "Hello",
            heroImage: "/assets/images/hero.webp",
            siteUrl: "https://example.com",
            publishedOn: "2026-01-02",
            featured: true,
            intro: "x".repeat(200),
            hero: { title: "Hi", cover: "/uploads/a.jpg" },
            items: [{ name: "a" }, { name: "b" }],
        });
        const res = await svc.preview("ws", { kind: "json", text, typeApiId: "page", typeName: "Page" });
        const fields = res.groups[0].fields ?? [];
        const byName = (n: string) => fields.find((f) => f.name === n);

        expect(byName("slug")?.type).toBe("Slug");
        expect(byName("heroImage")?.type).toBe("Media");
        expect(byName("siteUrl")?.type).toBe("URL");
        expect(byName("publishedOn")?.type).toBe("Date");
        expect(byName("featured")?.type).toBe("Boolean");
        expect(byName("intro")?.type).toBe("Rich text");
        expect(byName("title")?.type).toBe("Text");

        const hero = byName("hero");
        expect(hero?.type).toBe("Component");
        expect(hero?.fields).toBe(2); // title + cover

        const items = byName("items");
        expect(items?.type).toBe("Component");
        expect(items?.repeatable).toBe(true);
        expect(items?.fields).toBe(1); // name
    });

    it("imports prose as Rich text but keeps labels / meta as plain Text", async () => {
        const text = JSON.stringify({
            slug: "restoration",
            title: "Restoration Services",
            description: "A medium-length SEO meta description that comfortably exceeds eighty characters in total.",
            introContent: "Short intro.",
            ctaContent: "Call now.",
            desktopcontentImage: "/assets/images/content/x.webp",
            desktopcontentImagealttext: "Water Damage Restoration",
            callToActionText: "Call Now For Quick Estimates",
        });
        const res = await svc.preview("ws", { kind: "json", text, typeApiId: "svc", typeName: "Service" });
        const fields = res.groups[0].fields ?? [];
        const t = (n: string) => fields.find((f) => f.name === n)?.type;

        expect(t("title")).toBe("Text"); // SEO title stays plain
        expect(t("description")).toBe("Text"); // SEO meta stays plain even when long
        expect(t("introContent")).toBe("Rich text"); // prose by name
        expect(t("ctaContent")).toBe("Rich text"); // prose by name
        expect(t("desktopcontentImage")).toBe("Media");
        expect(t("desktopcontentImagealttext")).toBe("Text"); // alt text stays plain
        expect(t("callToActionText")).toBe("Text"); // button label stays plain
    });

    it("resolves imported media: library match first, then live-site fallback", () => {
        const index = new Map<string, string>([
            ["angela.webp", "/media/abc.webp"],
            ["angela", "/media/abc.webp"],
        ]);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const resolve = (v: unknown) => (svc as any).resolveAssetRefs(v, index, "https://restorationprosnearyou.co");

        // 1) exact + extension-changed name → internal library URL
        expect(resolve("/assets/images/avatar/angela.webp")).toBe("/media/abc.webp");
        expect(resolve("/assets/images/avatar/angela.png")).toBe("/media/abc.webp");
        // 2) not in library, root-relative → absolute live-site URL
        expect(resolve("/assets/images/faq/faq-img1.jpg")).toBe("https://restorationprosnearyou.co/assets/images/faq/faq-img1.jpg");
        // 3) untouched: external URLs, already-internal refs, bare non-paths
        expect(resolve("https://cdn.example.com/x.webp")).toBe("https://cdn.example.com/x.webp");
        expect(resolve("/media/already.webp")).toBe("/media/already.webp");
        expect(resolve("susan")).toBe("susan");
        // 4) recurses into nested objects/arrays
        const nested = resolve({ hero: { backgroundImage: "/assets/x/h.webp" }, items: [{ avatar: "/assets/a/angela.webp" }] });
        expect(nested).toEqual({ hero: { backgroundImage: "https://restorationprosnearyou.co/assets/x/h.webp" }, items: [{ avatar: "/media/abc.webp" }] });
    });

    it("leaves root-relative paths alone when no live site is configured", () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const resolve = (v: unknown) => (svc as any).resolveAssetRefs(v, new Map(), undefined);
        expect(resolve("/assets/images/faq/faq-img1.jpg")).toBe("/assets/images/faq/faq-img1.jpg");
    });

    it("infers a real model for a single nested object (one entry)", async () => {
        const text = JSON.stringify({ heroBanner: { title: "Hi", backgroundImage: "/assets/x.png" } });
        const res = await svc.preview("ws", { kind: "json", text, typeApiId: "svc", typeName: "Service" });
        const fields = res.groups[0].fields ?? [];
        expect(res.groups[0].count).toBe(1);
        expect(fields.find((f) => f.name === "heroBanner")?.type).toBe("Component");
    });
});

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

    it("infers a real model for a single nested object (one entry)", async () => {
        const text = JSON.stringify({ heroBanner: { title: "Hi", backgroundImage: "/assets/x.png" } });
        const res = await svc.preview("ws", { kind: "json", text, typeApiId: "svc", typeName: "Service" });
        const fields = res.groups[0].fields ?? [];
        expect(res.groups[0].count).toBe(1);
        expect(fields.find((f) => f.name === "heroBanner")?.type).toBe("Component");
    });
});

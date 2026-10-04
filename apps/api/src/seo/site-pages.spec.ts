import { describe, expect, it } from "vitest";
import { isPageType } from "../content/route-path";
import { SitePagesService, absoluteUrl, normalizeSiteUrl, rankPages } from "./site-pages.service";

const REF = { name: "service", type: "Reference", referencedTypeId: "t_service" };
const types = [
    { id: "t_service", name: "Service", apiId: "service", pluralApiId: "services", kind: "COLLECTION", schema: { pageType: "service", routePattern: "/{slug}" } },
    { id: "t_city_page", name: "City page", apiId: "city-page", pluralApiId: "city-pages", kind: "COLLECTION", schema: { pageType: "service", routePattern: "/{service.slug}/{city.slug}", fields: [REF, { name: "city", type: "Reference", referencedTypeId: "t_city" }] } },
    { id: "t_tag", name: "Tag", apiId: "tag", pluralApiId: "tags", kind: "COLLECTION", schema: { pageType: "reference", routePattern: "/resources/tags/{slug}" } },
    { id: "t_city", name: "City", apiId: "city", pluralApiId: "cities", kind: "COLLECTION", schema: { pageType: "reference" } },
    { id: "t_hidden", name: "Snippet", apiId: "snippet", pluralApiId: "snippets", kind: "COLLECTION", schema: { pageType: "blog", isPage: false } },
];
const entries = [
    { id: "e1", slug: "fire-damage-restoration", locale: "en", title: "Fire Damage Restoration", contentTypeId: "t_service", data: {} },
    { id: "e2", slug: "fire-damage-restoration-albuquerque-nm", locale: "en", title: "Fire Damage Albuquerque", contentTypeId: "t_city_page", data: { service: "e1", city: "e4" } },
    { id: "e3", slug: "repair-guide", locale: "en", title: "Repair guide", contentTypeId: "t_tag", data: {} },
    { id: "e4", slug: "albuquerque-nm", locale: "en", title: "Albuquerque, NM", contentTypeId: "t_city", data: {} },
    { id: "e5", slug: "snip", locale: "en", title: "Snip", contentTypeId: "t_hidden", data: {} },
];

const prisma = (ws: { siteUrl?: string | null; previewUrl?: string | null } = {}, gsc?: string) => ({
    workspace: { findUnique: async () => ws },
    integration: { findFirst: async () => (gsc ? { config: { siteUrl: gsc } } : null) },
    contentType: { findMany: async () => types },
    contentEntry: {
        findMany: async ({ where }: { where: { contentTypeId?: { in: string[] }; id?: { in: string[] } } }) =>
            entries.filter((e) => (!where.contentTypeId || where.contentTypeId.in.includes(e.contentTypeId)) && (!where.id || where.id.in.includes(e.id))),
    },
});

describe("isPageType", () => {
    it("defaults on, except reference types with no URL pattern, and honours the flag", () => {
        expect(types.filter(isPageType).map((t) => t.apiId)).toEqual(["service", "city-page", "tag"]);
        expect(isPageType({ kind: "COMPONENT", schema: {} })).toBe(false);
        expect(isPageType({ schema: { pageType: "reference", isPage: true } })).toBe(true);
    });
});

describe("SitePagesService", () => {
    it("maps only page-type entries, at their real paths", async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pages = await new SitePagesService(prisma() as any).pages("w");
        expect(pages.map((p) => [p.id, p.path])).toEqual([
            ["e1", "/fire-damage-restoration"],
            ["e2", "/fire-damage-restoration/albuquerque-nm"],
            ["e3", "/resources/tags/repair-guide"],
        ]);
    });

    it("takes the site URL from the workspace, then Search Console, then the preview URL", async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const site = (ws: object, gsc?: string) => new SitePagesService(prisma(ws, gsc) as any).siteUrl("w");
        expect(await site({ siteUrl: "https://nearbypros.com/" }, "sc-domain:other.com")).toBe("https://nearbypros.com");
        expect(await site({}, "sc-domain:nearbypros.com")).toBe("https://nearbypros.com");
        expect(await site({ previewUrl: "https://nearbypros.com/preview?slug={slug}" })).toBe("https://nearbypros.com");
        expect(await site({})).toBeNull();
    });

    it("normalises site URLs and builds absolute canonicals", () => {
        expect(normalizeSiteUrl("nearbypros.com")).toBe("https://nearbypros.com");
        expect(normalizeSiteUrl("not a url")).toBeNull();
        expect(absoluteUrl("https://nearbypros.com", "/fire-damage-restoration/albuquerque-nm")).toBe("https://nearbypros.com/fire-damage-restoration/albuquerque-nm");
        expect(absoluteUrl("https://nearbypros.com/", "/")).toBe("https://nearbypros.com/");
    });
});

describe("View live links", () => {
    it("joins the site URL and the entry's real path", async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const svc = new SitePagesService(prisma({ siteUrl: "https://nearbypros.com" }) as any);
        const [site, pages] = await Promise.all([svc.siteUrl("w"), svc.pages("w", ["e2"])]);
        expect(absoluteUrl(site!, pages[0].path)).toBe("https://nearbypros.com/fire-damage-restoration/albuquerque-nm");
        // A city entry is not a page, so it gets no link.
        expect(await svc.pages("w", ["e4"])).toEqual([]);
    });
});

describe("rankPages (which pages a capped check covers)", () => {
    const p = (id: string, publishedAt: string) => ({ id, path: `/${id}`, publishedAt: new Date(publishedAt) });
    const pages = [p("old", "2025-01-01"), p("new", "2026-09-01"), p("mid", "2026-01-01")];

    it("puts the pages with the most Search Console impressions first", () => {
        const ranked = rankPages(pages, new Map([["/old", 900], ["/mid", 20]]));
        expect(ranked.map((x) => x.id)).toEqual(["old", "mid", "new"]);
    });

    it("falls back to most recently published, and is stable", () => {
        expect(rankPages(pages, new Map()).map((x) => x.id)).toEqual(["new", "mid", "old"]);
        expect(rankPages([...pages].reverse(), new Map()).map((x) => x.id)).toEqual(["new", "mid", "old"]);
    });
});

describe("nonPageTypes", () => {
    it("lists types with published entries but no page flag, biggest first", async () => {
        const db = { ...prisma(), contentEntry: { groupBy: async () => [{ contentTypeId: "t_city", _count: { _all: 212 } }] } };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(await new SitePagesService(db as any).nonPageTypes("w")).toEqual([{ id: "t_city", name: "City", published: 212, hasPattern: false }]);
    });
});

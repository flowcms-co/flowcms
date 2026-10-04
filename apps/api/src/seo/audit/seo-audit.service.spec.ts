import { describe, expect, it, vi } from "vitest";
import { SeoAuditService } from "./seo-audit.service";
import { writableMeta } from "./seo-job.handlers";

/* eslint-disable @typescript-eslint/no-explicit-any */
const page = (id: string, path: string, data: Record<string, unknown> = {}) => ({ id, slug: id, locale: "en", title: `Title of ${id}`, path, typeId: "t", data });
const LIVE = { status: 200, title: "A perfectly reasonable page title for search", description: "d".repeat(120), canonical: "https://x.com/p", noindex: false, ldTypes: ["Article"] };

function make(opts: { pages: any[]; site?: string | null; media?: any[]; vitals?: any; ledger?: any[]; linksChecked?: number; impressions?: [string, number][]; nonPageTypes?: any[] }) {
    const ledger: any[] = opts.ledger ?? [];
    const key = (w: any) => w.workspaceId_target_task.target;
    const prisma = {
        pageAudit: {
            findUnique: async ({ where }: any) => ledger.find((r) => r.target === key(where)) ?? null,
            upsert: async ({ where, create, update }: any) => {
                const hit = ledger.find((r) => r.target === key(where));
                if (hit) Object.assign(hit, update);
                else ledger.push({ ...create });
            },
            deleteMany: async ({ where }: any) => {
                const keep = where.target?.notIn as string[] | undefined;
                for (let i = ledger.length - 1; i >= 0; i--) if (keep ? !keep.includes(ledger[i].target) : ledger[i].target === where.target) ledger.splice(i, 1);
            },
            findMany: async () => ledger,
            findFirst: async () => null,
        },
        contentEntry: { findMany: async () => [], findFirst: async () => ({ id: "p1", status: "PUBLISHED", data: opts.pages[0]?.data, draftData: null }), count: async () => 1 },
        media: { findMany: async () => opts.media ?? [] },
        workspace: { findUnique: async () => ({ jsonLdOrg: null, ignoredFindings: [] }) },
        integration: { findFirst: async () => null },
        metricSnapshot: { count: async () => 0 },
    };
    const seo = {
        livePage: vi.fn(async () => LIVE),
        score: async () => ({ score: null }),
        crawl: async () => ({ hasData: false }),
        vitals: async () => opts.vitals ?? { hasData: false, reason: "psi-timeout" },
        cannibalization: async () => ({ hasData: false }),
        internalLinks: async () => ({ opportunities: [], pages: opts.linksChecked ?? opts.pages.length, total: opts.pages.length }),
        impressionsByPath: async () => new Map<string, number>(opts.impressions ?? []),
        summary: async () => ({ hasData: false }),
    };
    const sitePages = { pages: async (_w: string, ids?: string[]) => opts.pages.filter((p) => !ids || ids.includes(p.id)), siteUrl: async () => opts.site ?? null, crawlRps: async () => 1, nonPageTypes: async () => opts.nonPageTypes ?? [] };
    const cache = { del: async () => undefined, wrap: async (_k: string, _t: number, fn: () => any) => fn() };
    const assets = { generateAlt: vi.fn(async () => ({ alt: "A burst pipe under a sink", provider: "p", model: "m" })) };
    const audit = new SeoAuditService(prisma as any, seo as any, assets as any, sitePages as any, cache as any, null as any);
    return { audit, ledger, seo, assets };
}

describe("SeoAuditService", () => {
    it("audits every page (no 500 cap), stores the real path, and drops rows of non-pages", async () => {
        const pages = Array.from({ length: 620 }, (_, i) => page(`p${i}`, `/svc/p${i}`));
        const { audit, ledger } = make({ pages, ledger: [{ target: "a-city-entry", entryId: "a-city-entry", task: "page", l1Findings: [] }] });
        const r = await audit.auditWorkspace("w");
        expect(r.scanned).toBe(620);
        expect(ledger).toHaveLength(620);
        expect(ledger.find((x) => x.target === "a-city-entry")).toBeUndefined();
        expect(ledger.find((x) => x.target === "p7").url).toBe("/svc/p7");
    });

    it("reads the live page at the mapped URL when the workspace has a site URL", async () => {
        const { audit, ledger, seo } = make({ pages: [page("p1", "/fire-damage-restoration/albuquerque-nm")], site: "https://nearbypros.com" });
        await audit.auditWorkspace("w");
        expect(seo.livePage).toHaveBeenCalledWith("https://nearbypros.com/fire-damage-restoration/albuquerque-nm", 1);
        const codes = ledger[0].l1Findings.map((f: any) => f.code);
        expect(codes).not.toContain("TECH_CANONICAL_MISSING");
        expect(codes).not.toContain("META_DESC_MISSING");
    });

    it("says PageSpeed is unavailable instead of inventing an LCP issue", async () => {
        const { audit } = make({ pages: [page("p1", "/a")] });
        await audit.auditWorkspace("w");
        const issues = await audit.issues("w");
        expect(issues.groups.find((g) => g.key === "CWV_LCP_POOR")).toBeUndefined();
        const psi = issues.groups.find((g) => g.key === "PSI_UNAVAILABLE")!;
        expect(psi.explanation).toMatch(/did not answer in time/);
        expect(issues.counts.pages).toBe(1);
    });

    it("generates alt for section images, the set the audit flags", async () => {
        const data = { sections: [{ __component: "hero", Image: "/media/pipe.webp", "Alt text": "" }] };
        const { audit, assets } = make({ pages: [page("p1", "/a", data)], media: [{ id: "m1", url: "/media/pipe.webp", alt: null }] });
        const r = await audit.generatePageAlt("w", "u", "p1");
        expect(assets.generateAlt).toHaveBeenCalledWith("w", "u", "m1");
        expect(r.suggestions).toEqual([{ src: "/media/pipe.webp", alt: "A burst pipe under a sink" }]);
    });
});

describe("capped checks and non-page types", () => {
    const body = (i: number) => ({ body: `<p>${Array.from({ length: 40 }, (_, w) => `word${i}x${w}`).join(" ")}</p>` });

    it("reports checked N of M and never calls a capped result clean", async () => {
        const pages = Array.from({ length: 450 }, (_, i) => page(`p${String(i).padStart(3, "0")}`, `/p${i}`, body(i)));
        const { audit } = make({ pages, linksChecked: 400 });
        await audit.auditWorkspace("w");
        const issues = await audit.issues("w");
        // No duplicates among the 400 compared, but 50 pages were not compared: the
        // result says so instead of implying the whole site is free of duplicates.
        expect(issues.groups.find((g) => g.key === "DUPLICATE_CONTENT")).toBeUndefined();
        expect(issues.coverage!.duplicates).toEqual({ checked: 400, total: 450, capped: true, by: "recency" });
        expect(issues.coverage!.links).toMatchObject({ checked: 400, total: 450, capped: true });
    });

    it("lists types with published entries that are not marked as pages", async () => {
        const nonPageTypes = [{ id: "t_city", name: "City", published: 212, hasPattern: false }];
        const { audit } = make({ pages: [page("p1", "/a")], nonPageTypes });
        await audit.auditWorkspace("w");
        expect((await audit.issues("w")).nonPageTypes).toEqual(nonPageTypes);
    });
});

describe("writableMeta", () => {
    it("leaves inherited fields alone and writes the ones the entry owns or truly lacks", () => {
        // Child entry with no own description; the live page shows the parent's template.
        expect(writableMeta({ metaTitle: "", metaDescription: "" }, { title: "Templated", description: "From the service" })).toEqual({ title: false, description: false });
        expect(writableMeta({ metaTitle: "Mine", metaDescription: "" }, { title: "Mine", description: "" })).toEqual({ title: true, description: true });
        expect(writableMeta({}, null)).toEqual({ title: true, description: true });
    });
});

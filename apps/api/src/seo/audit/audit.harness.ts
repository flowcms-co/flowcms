/**
 * Test harness: the real SeoAuditService over an in-memory ledger, with the site,
 * Search Console and assets faked. Not a spec file; imported by the audit specs.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { vi } from "vitest";
import { SeoAuditService } from "./seo-audit.service";
import { isCurrentRules } from "./indexing";
import type { Rate } from "../polite";

export const LIVE = { status: 200, title: "A perfectly reasonable page title for search", description: "d".repeat(120), canonical: "https://x.com/p", noindex: false, ldTypes: ["Article"] };
const T0 = new Date("2026-01-01T00:00:00Z");

export const page = (id: string, path: string, data: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({
    id, slug: id, locale: "en", title: `Title of ${id}`, path, typeId: "t", pageType: null, typeJsonLd: null, noindexIntended: false, publishedAt: null, changedAt: T0, data, ...extra,
});

export type Opts = {
    pages: any[];
    site?: string | null;
    media?: any[];
    vitals?: any;
    ledger?: any[];
    linksChecked?: number;
    impressions?: [string, number][];
    nonPageTypes?: any[];
    live?: (url: string, rate: Rate, validators?: any) => any;
    crawl?: any;
    rate?: Rate;
    lastmod?: Map<string, Date>;
};

export function make(opts: Opts) {
    const ledger: any[] = opts.ledger ?? [];
    const key = (w: any) => w.workspaceId_target_task.target;
    const matches = (r: any, where: any = {}) =>
        (!where.target?.in || where.target.in.includes(r.target)) &&
        (!where.target?.notIn || !where.target.notIn.includes(r.target)) &&
        (typeof where.target !== "string" || r.target === where.target) &&
        // `OR` on contentHash is the "current rule set" filter; `NOT` is its inverse.
        (!where.OR?.[0]?.contentHash || isCurrentRules(r.contentHash ?? "")) &&
        (!where.NOT || !isCurrentRules(r.contentHash ?? "")) &&
        (!where.url?.in || where.url.in.includes(r.url)) &&
        // Rolling re-check: never fetched, or fetched before the cutoff.
        (!where.OR?.[1]?.fetchedAt?.lt || !r.fetchedAt || r.fetchedAt < where.OR[1].fetchedAt.lt);
    const prisma = {
        pageAudit: {
            findUnique: async ({ where }: any) => ledger.find((r) => r.target === key(where)) ?? null,
            upsert: async ({ where, create, update }: any) => {
                const hit = ledger.find((r) => r.target === key(where));
                if (hit) Object.assign(hit, update);
                else ledger.push({ id: `row_${create.target}`, fetchedAt: null, lastCheckedAt: new Date(), ...create });
            },
            update: async ({ where, data }: any) => void Object.assign(ledger.find((r) => r.id === where.id) ?? {}, data),
            updateMany: async ({ where, data }: any) => {
                const hit = ledger.filter((r) => matches(r, where));
                hit.forEach((r) => Object.assign(r, data));
                return { count: hit.length };
            },
            deleteMany: async ({ where }: any) => {
                for (let i = ledger.length - 1; i >= 0; i--) if (matches(ledger[i], where)) ledger.splice(i, 1);
            },
            findMany: async ({ where, orderBy, take }: any = {}) => {
                const rows = ledger.filter((r) => matches(r, where)).map((r) => ({ lastCheckedAt: new Date(0), fetchedAt: null, ...r }));
                if (orderBy?.fetchedAt) rows.sort((a, b) => (a.fetchedAt?.getTime() ?? 0) - (b.fetchedAt?.getTime() ?? 0)); // nulls first
                return take ? rows.slice(0, take) : rows;
            },
            findFirst: async () => null,
        },
        contentEntry: { findMany: async () => [], findFirst: async () => ({ id: "p1", status: "PUBLISHED", data: opts.pages[0]?.data, draftData: null }), count: async () => 1 },
        media: { findMany: async () => opts.media ?? [] },
        workspace: { findUnique: async () => ({ jsonLdOrg: null, ignoredFindings: [] }) },
        integration: { findFirst: async () => null },
        metricSnapshot: { count: async () => 0 },
    };
    const seo = {
        livePage: vi.fn(async (url: string, rate: Rate, validators?: any) => opts.live?.(url, rate, validators) ?? LIVE),
        sitemapLastmod: async () => opts.lastmod ?? new Map<string, Date>(),
        currentRate: (_site: string, rate: Rate) => rate.start,
        score: async () => ({ score: null }),
        crawl: async () => opts.crawl ?? { hasData: false },
        vitals: async () => opts.vitals ?? { hasData: false, reason: "psi-timeout" },
        cannibalization: async () => ({ hasData: false }),
        internalLinks: async () => ({ opportunities: [], pages: opts.linksChecked ?? opts.pages.length, total: opts.pages.length }),
        impressionsByPath: async () => new Map<string, number>(opts.impressions ?? []),
        summary: async () => ({ hasData: false }),
    };
    const sitePages = {
        pages: async (_w: string, ids?: string[]) => opts.pages.filter((p) => !ids || ids.includes(p.id)),
        siteUrl: async () => opts.site ?? null,
        crawlRate: async () => opts.rate ?? { start: 1, max: 1 },
        crawlRps: async () => (opts.rate ?? { start: 1 }).start,
        recheckDays: async () => 14,
        pageTypes: async () => [{ id: "t", name: "Pages" }, { id: "city", name: "City pages" }],
        nonPageTypes: async () => opts.nonPageTypes ?? [],
    };
    const store = new Map<string, any>();
    const cache = { del: async (k: string) => void store.delete(k), get: async (k: string) => store.get(k) ?? null, set: async (k: string, v: any) => void store.set(k, v), wrap: async (_k: string, _t: number, fn: () => any) => fn() };
    const assets = { generateAlt: vi.fn(async () => ({ alt: "A burst pipe under a sink", provider: "p", model: "m" })) };
    const audit = new SeoAuditService(prisma as any, seo as any, assets as any, sitePages as any, cache as any, null as any);
    return { audit, ledger, seo, assets, store };
}

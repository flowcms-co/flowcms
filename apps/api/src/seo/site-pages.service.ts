import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { entryPath, isPageType } from "../content/route-path";
import { fieldsOf } from "../content/entry-validation";
import { placeholdersIn, resolvePlaceholders } from "../content/slug-pattern";
import { createHash } from "node:crypto";
import { decryptSecret } from "@flowcms/shared";
import { DEFAULT_RATE, clampRps, type Rate } from "./polite";

export type SitePage = {
    id: string;
    slug: string | null;
    locale: string;
    title: string;
    /** Site-relative path on the public site, from the type's page type and URL pattern. */
    path: string;
    typeId: string;
    /** The content type's page type ("blog", "service"…) and JSON-LD type, if set. */
    pageType: string | null;
    typeJsonLd: string | null;
    /** The type keeps its pages out of search on purpose, so noindex is not a warning. */
    noindexIntended: boolean;
    publishedAt: Date | null;
    /** When anything this page is built from last changed: the entry, an entry it
     *  references, its content type (schema, URL pattern), or a component it uses. */
    changedAt: Date;
    data: Record<string, unknown>;
};

const ID = /^c[a-z0-9]{20,}$/;
/** Entry ids referenced from an entry's top-level fields (single or multiple). */
const refIdsOf = (data: Record<string, unknown>): string[] =>
    Object.values(data).flatMap((v) => (Array.isArray(v) ? v : [v]).filter((x): x is string => typeof x === "string" && ID.test(x)));
/** apiIds of the reusable components a page uses: its type's component fields and
 *  the sections placed in its dynamic zones. */
const componentsOf = (schema: unknown, data: Record<string, unknown>): string[] => [
    ...(((schema as { fields?: { componentApiId?: string }[] } | null)?.fields ?? []).map((f) => f.componentApiId).filter((x): x is string => !!x)),
    ...Object.values(data).flatMap((v) => (Array.isArray(v) ? v : []).map((x) => (x as { __component?: unknown } | null)?.__component).filter((x): x is string => typeof x === "string")),
];

/** Which pages a capped check looks at, deterministically: most Search Console
 *  impressions first when that data exists, otherwise most recently published
 *  (ties broken by id). */
export function rankPages<T extends { id: string; path: string; publishedAt: Date | null }>(pages: T[], impressionsByPath: Map<string, number>): T[] {
    const imp = (p: T) => impressionsByPath.get(p.path) ?? impressionsByPath.get(`${p.path}/`) ?? 0;
    const byRecency = (a: T, b: T) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0) || (a.id < b.id ? -1 : 1);
    return [...pages].sort((a, b) => (impressionsByPath.size ? imp(b) - imp(a) : 0) || byRecency(a, b));
}

/** A site origin with no trailing slash ("https://example.com"), or null. Accepts a
 *  bare host, a full URL (a preview URL template, a Search Console URL-prefix
 *  property) and a Search Console domain property ("sc-domain:example.com"). */
export function normalizeSiteUrl(raw: string | null | undefined): string | null {
    let v = (raw ?? "").trim();
    if (!v) return null;
    if (v.startsWith("sc-domain:")) v = v.slice("sc-domain:".length);
    try {
        const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
        return u.hostname.includes(".") || u.hostname === "localhost" ? u.origin : null;
    } catch {
        return null;
    }
}

/** Join a site origin and a site-relative path. */
export const absoluteUrl = (site: string, path: string) => `${site.replace(/\/+$/, "")}${path === "/" ? "/" : path}`;

/**
 * The workspace's public site: its URL and which entries are pages on it, at which
 * path. One place so the audit, the crawler, internal links and "View live" agree.
 */
@Injectable()
export class SitePagesService {
    constructor(private readonly prisma: PrismaService) {}

    /** The site origin: the workspace setting, else the Search Console property,
     *  else the origin of the live-preview URL. Null when none is known. */
    async siteUrl(workspaceId: string): Promise<string | null> {
        const ws = await this.prisma.workspace.findUnique({ where: { id: workspaceId }, select: { siteUrl: true, previewUrl: true } });
        const own = normalizeSiteUrl(ws?.siteUrl);
        if (own) return own;
        const gsc = await this.prisma.integration.findFirst({ where: { workspaceId, provider: "gsc" }, select: { config: true } });
        return normalizeSiteUrl((gsc?.config as { siteUrl?: string } | null)?.siteUrl) ?? normalizeSiteUrl(ws?.previewUrl);
    }

    /** Most requests per second the audit and crawler may send to the site. */
    async crawlRps(workspaceId: string): Promise<number> {
        return (await this.crawlRate(workspaceId)).start;
    }

    /** The rate the audit and crawler start at, and the most they may adapt up to. */
    async crawlRate(workspaceId: string): Promise<Rate> {
        const ws = await this.prisma.workspace.findUnique({ where: { id: workspaceId }, select: { seoCrawlRps: true, seoCrawlMaxRps: true, seoLearnedRate: true, seoFetchPrefixEnc: true } });
        const start = clampRps(ws?.seoCrawlRps);
        const max = Math.max(start, clampRps(ws?.seoCrawlMaxRps, DEFAULT_RATE.max));
        const prefix = ws?.seoFetchPrefixEnc ? decryptSecret(ws.seoFetchPrefixEnc) : undefined;
        return {
            start,
            max,
            prefix,
            // A ceiling was learned for one maximum and one fetch path; either changing voids it.
            epoch: `${max}|${ws?.seoFetchPrefixEnc ? createHash("sha256").update(ws.seoFetchPrefixEnc).digest("hex").slice(0, 8) : "direct"}`,
            learned: (ws?.seoLearnedRate ?? undefined) as Record<string, number> | undefined,
            onLearn: (host, rps) => void this.rememberCeiling(workspaceId, host, rps).catch(() => undefined),
        };
    }

    /** Store the ceiling a host taught us, so later runs start below it. */
    private async rememberCeiling(workspaceId: string, host: string, rps: number) {
        const ws = await this.prisma.workspace.findUnique({ where: { id: workspaceId }, select: { seoLearnedRate: true } });
        const learned = { ...((ws?.seoLearnedRate ?? {}) as Record<string, number>), [host]: Math.round(rps * 100) / 100 };
        await this.prisma.workspace.update({ where: { id: workspaceId }, data: { seoLearnedRate: learned } });
    }

    /** Every page is re-verified against the live site within this many days. */
    async recheckDays(workspaceId: string): Promise<number> {
        const ws = await this.prisma.workspace.findUnique({ where: { id: workspaceId }, select: { seoRecheckDays: true } });
        return Math.min(365, Math.max(1, ws?.seoRecheckDays ?? 14));
    }

    /** Content types that have published entries but are not marked as pages, so
     *  the audit skips them. Listed on the audit page so a missed flag is noticed. */
    async nonPageTypes(workspaceId: string): Promise<{ id: string; name: string; published: number; hasPattern: boolean }[]> {
        const types = await this.prisma.contentType.findMany({
            where: { workspaceId, kind: { not: "COMPONENT" } },
            select: { id: true, name: true, apiId: true, pluralApiId: true, kind: true, schema: true },
        });
        const off = types.filter((t) => !isPageType(t));
        if (!off.length) return [];
        const counts = await this.prisma.contentEntry.groupBy({ by: ["contentTypeId"], where: { workspaceId, status: "PUBLISHED", contentTypeId: { in: off.map((t) => t.id) } }, _count: { _all: true } });
        const n = new Map(counts.map((c) => [c.contentTypeId, c._count._all]));
        return off
            .filter((t) => (n.get(t.id) ?? 0) > 0)
            .map((t) => ({ id: t.id, name: t.name, published: n.get(t.id) ?? 0, hasPattern: !!String((t.schema as { routePattern?: unknown } | null)?.routePattern ?? "").trim() }))
            .sort((a, b) => b.published - a.published);
    }

    /** Ids of the content types whose entries are pages. */
    async pageTypes(workspaceId: string) {
        const types = await this.prisma.contentType.findMany({
            where: { workspaceId, kind: { not: "COMPONENT" } },
            select: { id: true, name: true, apiId: true, pluralApiId: true, kind: true, schema: true, updatedAt: true },
        });
        return types.filter(isPageType);
    }

    /** Every published page with its real path, in a stable order. `ids` narrows it.
     *  ponytail: loads each page's data in one query; page through it if a workspace
     *  outgrows memory (tens of thousands of pages). */
    async pages(workspaceId: string, ids?: string[]): Promise<SitePage[]> {
        const types = await this.pageTypes(workspaceId);
        if (!types.length) return [];
        const typeById = new Map(types.map((t) => [t.id, t]));
        const entries = await this.prisma.contentEntry.findMany({
            where: { workspaceId, status: "PUBLISHED", contentTypeId: { in: [...typeById.keys()] }, ...(ids ? { id: { in: ids } } : {}) },
            select: { id: true, slug: true, locale: true, title: true, contentTypeId: true, publishedAt: true, updatedAt: true, data: true },
            orderBy: { id: "asc" },
        });

        // Every entry these pages reference, fetched once: their slug/title fill
        // {ref.slug} in URL patterns, and their updatedAt tells when a parent changed.
        const keysByType = new Map(types.map((t) => [t.id, placeholdersIn(String((t.schema as { routePattern?: unknown } | null)?.routePattern ?? ""))]));
        const refIds = new Set<string>();
        for (const e of entries) {
            const data = (e.data ?? {}) as Record<string, unknown>;
            for (const id of refIdsOf(data)) refIds.add(id);
            // The fields a URL pattern names are references whatever their ids look like.
            for (const k of keysByType.get(e.contentTypeId) ?? []) {
                const [name, prop] = k.split(".");
                const v = prop ? data[name] : undefined;
                const id = Array.isArray(v) ? v[0] : v;
                if (typeof id === "string" && id) refIds.add(id);
            }
        }
        const refs: { id: string; slug: string | null; title: string | null; updatedAt: Date }[] = [];
        const refList = [...refIds];
        for (let i = 0; i < refList.length; i += 5000) {
            refs.push(...(await this.prisma.contentEntry.findMany({ where: { workspaceId, id: { in: refList.slice(i, i + 5000) } }, select: { id: true, slug: true, title: true, updatedAt: true } })));
        }
        const refById = new Map(refs.map((r) => [r.id, { slug: r.slug, title: r.title ?? "Untitled", updatedAt: r.updatedAt }]));
        const components = await this.prisma.contentType.findMany({ where: { workspaceId, kind: "COMPONENT" }, select: { apiId: true, updatedAt: true } });
        const componentAt = new Map(components.map((c) => [c.apiId, c.updatedAt]));

        const out: SitePage[] = [];
        for (const e of entries) {
            const t = typeById.get(e.contentTypeId)!;
            const data = (e.data ?? {}) as Record<string, unknown>;
            const ts = (t.schema ?? {}) as { pageType?: unknown; jsonLd?: unknown; noindexIntended?: unknown };
            const keys = keysByType.get(e.contentTypeId) ?? [];
            const values = keys.length ? await resolvePlaceholders(fieldsOf(t.schema), data, keys, async (id) => refById.get(id) ?? null) : undefined;
            out.push({
                id: e.id,
                slug: e.slug,
                locale: e.locale,
                title: e.title ?? (e.slug || "Untitled"),
                path: entryPath(t, e.slug, { locale: e.locale, values }),
                typeId: t.id,
                pageType: typeof ts.pageType === "string" ? ts.pageType : null,
                typeJsonLd: typeof ts.jsonLd === "string" ? ts.jsonLd : null,
                noindexIntended: ts.noindexIntended === true,
                publishedAt: e.publishedAt,
                changedAt: new Date(
                    Math.max(
                        e.updatedAt?.getTime() ?? 0,
                        t.updatedAt?.getTime() ?? 0,
                        ...refIdsOf(data).map((id) => refById.get(id)?.updatedAt?.getTime() ?? 0),
                        ...componentsOf(t.schema, data).map((c) => componentAt.get(c)?.getTime() ?? 0),
                    ),
                ),
                data,
            });
        }
        return out;
    }
}

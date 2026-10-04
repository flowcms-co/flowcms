import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { entryPath, isPageType } from "../content/route-path";
import { fieldsOf } from "../content/entry-validation";
import { placeholdersIn, resolvePlaceholders } from "../content/slug-pattern";
import { clampRps } from "./polite";

export type SitePage = {
    id: string;
    slug: string | null;
    locale: string;
    title: string;
    /** Site-relative path on the public site, from the type's page type and URL pattern. */
    path: string;
    typeId: string;
    publishedAt: Date | null;
    data: Record<string, unknown>;
};

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
        const ws = await this.prisma.workspace.findUnique({ where: { id: workspaceId }, select: { seoCrawlRps: true } });
        return clampRps(ws?.seoCrawlRps);
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
            select: { id: true, name: true, apiId: true, pluralApiId: true, kind: true, schema: true },
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
            select: { id: true, slug: true, locale: true, title: true, contentTypeId: true, publishedAt: true, data: true },
            orderBy: { id: "asc" },
        });

        // {ref.slug} / {ref.title} in URL patterns: fetch every referenced entry once.
        const keysByType = new Map(types.map((t) => [t.id, placeholdersIn(String((t.schema as { routePattern?: unknown } | null)?.routePattern ?? ""))]));
        const refIds = new Set<string>();
        for (const e of entries) {
            const keys = keysByType.get(e.contentTypeId) ?? [];
            for (const k of keys) {
                const [name, prop] = k.split(".");
                if (!prop) continue;
                const v = (e.data as Record<string, unknown> | null)?.[name];
                const id = Array.isArray(v) ? v[0] : v;
                if (typeof id === "string" && id) refIds.add(id);
            }
        }
        const refs = refIds.size
            ? await this.prisma.contentEntry.findMany({ where: { workspaceId, id: { in: [...refIds] } }, select: { id: true, slug: true, title: true } })
            : [];
        const refById = new Map(refs.map((r) => [r.id, { slug: r.slug, title: r.title ?? "Untitled" }]));

        const out: SitePage[] = [];
        for (const e of entries) {
            const t = typeById.get(e.contentTypeId)!;
            const data = (e.data ?? {}) as Record<string, unknown>;
            const keys = keysByType.get(e.contentTypeId) ?? [];
            const values = keys.length ? await resolvePlaceholders(fieldsOf(t.schema), data, keys, async (id) => refById.get(id) ?? null) : undefined;
            out.push({
                id: e.id,
                slug: e.slug,
                locale: e.locale,
                title: e.title ?? (e.slug || "Untitled"),
                path: entryPath(t, e.slug, { locale: e.locale, values }),
                typeId: t.id,
                publishedAt: e.publishedAt,
                data,
            });
        }
        return out;
    }
}

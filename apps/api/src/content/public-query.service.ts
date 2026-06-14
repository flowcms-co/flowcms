import { Injectable, NotFoundException } from "@nestjs/common";
import { ContentEntry, ContentType, Prisma } from "@flowcms/db";
import { PrismaService } from "../prisma/prisma.service";
import { entryToCanonicalContent, buildJsonLd } from "./canonical-content";

export type QueryOpts = {
    limit?: number;
    offset?: number;
    sort?: string; // "field:asc" | "field:desc"
    locale?: string;
    fields?: string[]; // project these data keys (+ always id/slug/meta)
    filters?: Record<string, string>; // equality on data keys (or top-level slug)
    preview?: boolean; // include non-published (preview tokens only)
};

/** Columns that can be sorted on (JSON data fields can't be ordered in SQL portably). */
const SORTABLE = new Set(["publishedAt", "createdAt", "updatedAt", "slug", "id"]);

const coerce = (v: string): string | number | boolean => {
    if (v === "true") return true;
    if (v === "false") return false;
    if (v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
    return v;
};

/**
 * Shared read-side query engine for the public delivery API — used by both the
 * REST controller and the GraphQL resolver so filtering/sorting/projection logic
 * lives in one place. Returns delivery-shaped objects (data fields flattened).
 */
@Injectable()
export class PublicQueryService {
    constructor(private readonly prisma: PrismaService) {}

    async resolveType(workspaceId: string, type: string): Promise<ContentType> {
        // Reusable components (kind=COMPONENT) are not deliverable collections.
        const ct = await this.prisma.contentType.findFirst({
            where: { workspaceId, kind: { not: "COMPONENT" }, OR: [{ apiId: type }, { pluralApiId: type }] },
        });
        if (!ct) throw new NotFoundException(`Unknown content type "${type}".`);
        return ct;
    }

    /** All deliverable content types in a workspace (for building the typed GraphQL
     *  schema). Excludes reusable components. */
    async allTypes(workspaceId: string): Promise<ContentType[]> {
        return this.prisma.contentType.findMany({ where: { workspaceId, kind: { not: "COMPONENT" } }, orderBy: { apiId: "asc" } });
    }

    private shape(e: ContentEntry, fields?: string[]) {
        const data = (e.data ?? {}) as Record<string, unknown>;
        const projected =
            fields && fields.length ? Object.fromEntries(fields.filter((f) => f in data).map((f) => [f, data[f]])) : data;
        const base: Record<string, unknown> = {
            id: e.id,
            slug: e.slug,
            locale: e.locale,
            publishedAt: e.publishedAt,
            createdAt: e.createdAt,
            updatedAt: e.updatedAt,
            ...projected,
        };
        // AEO: attach schema.org JSON-LD derived from component/section structured
        // data (merged with any manually-set data.jsonLd). Skipped when projecting a
        // field subset, and short-circuited unless the entry actually has sections.
        if (!fields || !fields.length) {
            const hasSections = Object.values(data).some((v) => Array.isArray(v) && v.some((x) => x && typeof x === "object" && "__component" in (x as object)));
            const manual = Array.isArray(data.jsonLd) ? (data.jsonLd as Record<string, unknown>[]) : data.jsonLd && typeof data.jsonLd === "object" ? [data.jsonLd as Record<string, unknown>] : [];
            const derived = hasSections ? buildJsonLd(entryToCanonicalContent({ id: e.id, slug: e.slug, data }).structuredDataSpecs) : [];
            const jsonLd = [...manual, ...derived];
            if (jsonLd.length) base.jsonLd = jsonLd;
        }
        return base;
    }

    private where(ct: ContentType, opts: QueryOpts): Prisma.ContentEntryWhereInput {
        const AND: Prisma.ContentEntryWhereInput[] = [];
        if (opts.locale) AND.push({ locale: opts.locale });
        for (const [k, v] of Object.entries(opts.filters ?? {})) {
            if (k === "slug") AND.push({ slug: String(v) });
            else AND.push({ data: { path: [k], equals: coerce(String(v)) } });
        }
        return {
            workspaceId: ct.workspaceId,
            contentTypeId: ct.id,
            ...(opts.preview ? {} : { status: "PUBLISHED" }),
            ...(AND.length ? { AND } : {}),
        };
    }

    private orderBy(sort?: string): Prisma.ContentEntryOrderByWithRelationInput {
        if (sort) {
            const [field, dir] = sort.split(":");
            if (SORTABLE.has(field)) return { [field]: dir === "asc" ? "asc" : "desc" };
        }
        return { publishedAt: "desc" };
    }

    async listForType(ct: ContentType, opts: QueryOpts) {
        const take = Math.min(Math.max(opts.limit ?? 25, 1), 100);
        const skip = Math.max(opts.offset ?? 0, 0);
        const where = this.where(ct, opts);
        const [rows, total] = await Promise.all([
            this.prisma.contentEntry.findMany({ where, orderBy: this.orderBy(opts.sort), take, skip }),
            this.prisma.contentEntry.count({ where }),
        ]);
        return { data: rows.map((e) => this.shape(e, opts.fields)), meta: { total, limit: take, offset: skip } };
    }

    async oneForType(ct: ContentType, idOrSlug: string, opts: QueryOpts) {
        const entry = await this.prisma.contentEntry.findFirst({
            where: { ...this.where(ct, { ...opts, filters: {} }), OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
        });
        if (!entry) throw new NotFoundException("Not found.");
        return { data: this.shape(entry, opts.fields) };
    }

    async singleForType(ct: ContentType, opts: QueryOpts) {
        const entry = await this.prisma.contentEntry.findFirst({
            where: this.where(ct, { ...opts, filters: {} }),
            orderBy: this.orderBy(opts.sort),
        });
        return { data: entry ? this.shape(entry, opts.fields) : null };
    }

    /** REST entry point: resolves the type and dispatches collection vs single. */
    async list(workspaceId: string, type: string, opts: QueryOpts) {
        const ct = await this.resolveType(workspaceId, type);
        if (ct.kind === "SINGLE") return this.singleForType(ct, opts);
        return this.listForType(ct, opts);
    }

    async one(workspaceId: string, type: string, idOrSlug: string, opts: QueryOpts) {
        const ct = await this.resolveType(workspaceId, type);
        if (ct.kind === "SINGLE") return this.singleForType(ct, opts);
        return this.oneForType(ct, idOrSlug, opts);
    }
}
